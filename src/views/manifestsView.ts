import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { LintStatus, ManifestInfo } from '../models/types';
import { ManifestItem } from '../models/manifestItem';
import { 
    CATEGORY_CONFIGS, 
    categorizeByInstallMethod, 
    getKindDescription, 
    getIconForKind,
    getKindDocsUrl,
    InstallMethod
} from '../utils/manifestUtils';

/**
 * Maintains consistent spacing in tree view when files lack Git decorations
 */
class GitPlaceholderDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private filesNeedingPlaceholder = new Set<string>();

    setPlaceholder(fsPath: string, needsPlaceholder: boolean) {
        needsPlaceholder 
            ? this.filesNeedingPlaceholder.add(fsPath)
            : this.filesNeedingPlaceholder.delete(fsPath);
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(fsPath));
    }

    clear() {
        this.filesNeedingPlaceholder.clear();
        this._onDidChangeFileDecorations.fire(vscode.Uri.file('/'));
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        return this.filesNeedingPlaceholder.has(uri.fsPath)
            ? { badge: ' ', tooltip: 'No changes' } // Em space (U+2003)
            : undefined;
    }
}

/**
 * Organizes Replicated manifest files by install method in VS Code tree view
 */
export class ManifestsViewProvider implements vscode.TreeDataProvider<ManifestItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ManifestItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private lintStatuses = new Map<string, LintStatus>();
    private lintHasRun = false;
    private gitApi: any | undefined;
    private gitPlaceholderProvider: GitPlaceholderDecorationProvider;

    constructor(private diagnosticCollection: vscode.DiagnosticCollection) {
        this.gitPlaceholderProvider = new GitPlaceholderDecorationProvider();
        vscode.window.registerFileDecorationProvider(this.gitPlaceholderProvider);

        vscode.languages.onDidChangeDiagnostics(() => {
            this.updateLintStatuses();
            this.refresh();
        });

        this.initializeGitApi();
    }

    private async initializeGitApi(): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) return;

            if (!gitExtension.isActive) {
                await gitExtension.activate();
            }

            this.gitApi = gitExtension.exports?.getAPI(1);
            this.gitApi?.onDidChangeState(() => this.refresh());
        } catch (error) {
            console.log('Git extension not available:', error);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private updateLintStatuses(): void {
        this.lintStatuses.clear();
        
        this.diagnosticCollection.forEach((uri, diagnostics) => {
            const countBySeverity = (severity: vscode.DiagnosticSeverity) =>
                diagnostics.filter(d => d.severity === severity).length;

            const errors = countBySeverity(vscode.DiagnosticSeverity.Error);
            const warnings = countBySeverity(vscode.DiagnosticSeverity.Warning);
            const info = countBySeverity(vscode.DiagnosticSeverity.Information);
            
            this.lintStatuses.set(uri.fsPath, {
                errors,
                warnings,
                info,
                hasIssues: errors > 0 || warnings > 0 || info > 0
            });
        });
        
        if (this.lintStatuses.size > 0) {
            this.lintHasRun = true;
        }
    }
    
    public markLintAsRun(): void {
        this.lintHasRun = true;
        this.refresh();
    }

    getTreeItem(element: ManifestItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ManifestItem): Promise<ManifestItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('No workspace folder found');
            return [];
        }

        if (element) {
            return element.children?.length ? element.children :
                   element.isDirectory && element.filePath ? this.getDirectoryChildren(element.filePath, element.basePath!) :
                   [];
        }

        // Root level: organize manifests by install method
        return this.getRootManifests();
    }

    private getRootManifests(): ManifestItem[] {
        for (const folder of vscode.workspace.workspaceFolders!) {
            const manifestFolder = vscode.workspace.getConfiguration('replicated').get<string>('manifestsFolder', 'manifests');
            const manifestPath = path.join(folder.uri.fsPath, manifestFolder);
            
            if (fs.existsSync(manifestPath)) {
                const items = this.getOrganizedManifests(manifestPath);
                if (items.length > 0) return items;
            }
        }

        return [new ManifestItem(
            'No manifest files found',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'info',
            undefined,
            false,
            undefined
        )];
    }

    private getOrganizedManifests(manifestPath: string): ManifestItem[] {
        const allFiles = this.collectAllManifestFiles(manifestPath, manifestPath);
        if (allFiles.length === 0) return [];

        const categorizedFiles = this.categorizeFiles(allFiles);
        return this.buildCategoryTree(categorizedFiles, manifestPath);
    }

    private categorizeFiles(files: ManifestItem[]): Map<InstallMethod, ManifestItem[]> {
        const categories = new Map<InstallMethod, ManifestItem[]>([
            ['unidentified', []],
            ['shared', []],
            ['embedded-cluster', []],
            ['kots', []],
            ['helm', []]
        ]);
        
        for (const fileItem of files) {
            const manifestInfo = this.parseManifestKind(fileItem.filePath || '');
            const category = categorizeByInstallMethod(
                manifestInfo.kind,
                manifestInfo.apiVersion,
                fileItem.label.toLowerCase()
            );
            categories.get(category)!.push(fileItem);
        }

        return categories;
    }

    private buildCategoryTree(categorizedFiles: Map<InstallMethod, ManifestItem[]>, manifestPath: string): ManifestItem[] {
        const tree: ManifestItem[] = [];

        // Unidentified files appear at top level
        tree.push(...categorizedFiles.get('unidentified')!);

        for (const config of CATEGORY_CONFIGS) {
            if (config.separator) {
                tree.push(this.createSeparator());
            }
            
            tree.push(this.createCategoryItem(
                config.title,
                config.icon,
                config.tooltip,
                config.docsUrl,
                categorizedFiles.get(config.id)!,
                manifestPath
            ));
        }

        return tree;
    }

    private createCategoryItem(
        title: string,
        icon: string,
        tooltip: string,
        docsUrl: string | undefined,
        files: ManifestItem[],
        manifestPath: string
    ): ManifestItem {
        const description = files.length > 0 
            ? `${files.length} file${files.length !== 1 ? 's' : ''}` 
            : 'No files';
        
        const item = new ManifestItem(
            title,
            description,
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            'folder',
            undefined,
            true,
            manifestPath
        );
        
        item.iconPath = new vscode.ThemeIcon(icon);
        item.tooltip = tooltip;
        item.children = files;
        
        if (docsUrl) {
            item.contextValue = 'categoryWithDocs';
            (item as any).docsUrl = docsUrl;
        }
        
        return item;
    }

    private createSeparator(): ManifestItem {
        const separator = new ManifestItem(
            '┄┄┄┄┄┄┄┄┄┄┄',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            '',
            undefined,
            false,
            undefined
        );
        separator.contextValue = 'separator';
        return separator;
    }

    private collectAllManifestFiles(dirPath: string, basePath: string): ManifestItem[] {
        const items: ManifestItem[] = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    items.push(...this.collectAllManifestFiles(fullPath, basePath));
                } else if (this.isManifestFile(entry.name)) {
                    items.push(this.createFileItem(fullPath, basePath, entry.name));
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
        
        return items.sort((a, b) => a.label.localeCompare(b.label));
    }

    private createFileItem(fullPath: string, basePath: string, fileName: string): ManifestItem {
        const lintStatus = this.lintStatuses.get(fullPath);
        const manifestInfo = this.parseManifestKind(fullPath);
        
        // Get documentation URL
        const docsUrl = getKindDocsUrl(manifestInfo.apiVersion, manifestInfo.kind, fileName);
        
        // Get icon for the manifest kind
        const iconPath = getIconForKind(manifestInfo.kind);
        
        // Check if file has Git status - if not, add em space placeholder for consistent layout
        const gitStatus = this.getGitStatus(fullPath);
        this.gitPlaceholderProvider.setPlaceholder(fullPath, !gitStatus);
        
        // Set description to show the kind
        let description = '';
        if (manifestInfo.kind) {
            description = manifestInfo.kind.trim();
        }
        
        // Add lint status to description for now (will be inline button on hover later)
        if (this.lintHasRun) {
            if (lintStatus && lintStatus.hasIssues) {
                const parts: string[] = [];
                if (lintStatus.errors > 0) {
                    parts.push(`${lintStatus.errors} error${lintStatus.errors !== 1 ? 's' : ''}`);
                }
                if (lintStatus.warnings > 0) {
                    parts.push(`${lintStatus.warnings} warning${lintStatus.warnings !== 1 ? 's' : ''}`);
                }
                if (lintStatus.info > 0) {
                    parts.push(`${lintStatus.info} info`);
                }
                if (parts.length > 0 && description) {
                    description += ' - ' + parts.join(' ');
                }
            }
        }
        
        const item = new ManifestItem(
            fileName,
            description.trim(),
            vscode.TreeItemCollapsibleState.None,
            fullPath,
            iconPath,
            manifestInfo.kind,
            false,
            basePath
        );
        
        item.command = {
            command: 'replicated.openManifest',
            title: 'Open Manifest',
            arguments: [fullPath]
        };
        
        item.resourceUri = vscode.Uri.file(fullPath);
        
        // Build tooltip
        const tooltipParts: string[] = [];
        if (manifestInfo.kind) {
            const kindDescription = getKindDescription(manifestInfo.apiVersion, manifestInfo.kind, fileName);
            if (kindDescription) {
                tooltipParts.push(kindDescription);
            }
        }
        if (manifestInfo.apiVersion) {
            tooltipParts.push(`API Version: ${manifestInfo.apiVersion}`);
        }
        item.tooltip = tooltipParts.join('\n\n');
        
        // Set context value for menus (determines which inline buttons show on hover)
        // Info button will show on hover for files with docs
        // Lint button will show on hover for all files
        if (docsUrl) {
            item.contextValue = 'manifestFileWithDocs';
            (item as any).docsUrl = docsUrl;
        } else {
            item.contextValue = 'manifestFile';
        }
        
        return item;
    }
    
    /**
     * Get Git status for a file
     */
    private getGitStatus(filePath: string): 'M' | 'A' | 'D' | 'U' | undefined {
        if (!this.gitApi || this.gitApi.repositories.length === 0) {
            return undefined;
        }

        try {
            const repo = this.gitApi.repositories[0];
            const workingTreeChanges = repo.state.workingTreeChanges || [];
            const indexChanges = repo.state.indexChanges || [];
            const untrackedFiles = repo.state.untrackedChanges || [];
            
            // Check if file is untracked
            if (untrackedFiles.some((change: any) => change.uri.fsPath === filePath)) {
                return 'U';
            }
            
            // Check if file is in index (staged)
            const isInIndex = indexChanges.some((change: any) => change.uri.fsPath === filePath);
            const isInWorkingTree = workingTreeChanges.some((change: any) => change.uri.fsPath === filePath);
            
            if (isInWorkingTree || isInIndex) {
                return 'M';
            }
            
            return undefined;
        } catch (error) {
            console.error('Error checking git status:', error);
            return undefined;
        }
    }

    private getDirectoryChildren(dirPath: string, basePath: string): ManifestItem[] {
        const items: ManifestItem[] = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            // Separate directories and files
            const directories: fs.Dirent[] = [];
            const files: fs.Dirent[] = [];
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    directories.push(entry);
                } else if (entry.isFile() && this.isManifestFile(entry.name)) {
                    files.push(entry);
                }
            }
            
            // Add directories first (sorted)
            directories.sort((a, b) => a.name.localeCompare(b.name));
            for (const dir of directories) {
                const fullPath = path.join(dirPath, dir.name);
                const item = new ManifestItem(
                    dir.name,
                    '',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    fullPath,
                    'folder',
                    undefined,
                    true,
                    basePath
                );
                item.iconPath = vscode.ThemeIcon.Folder;
                items.push(item);
            }
            
            // Add files (sorted)
            files.sort((a, b) => a.name.localeCompare(b.name));
            for (const file of files) {
                const fullPath = path.join(dirPath, file.name);
                const fileItem = this.createFileItem(fullPath, basePath, file.name);
                items.push(fileItem);
            }
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
        
        return items;
    }


    private parseManifestKind(filePath: string): ManifestInfo {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.parseAllDocuments(content);
            
            if (docs.length > 0 && docs[0].toJS()) {
                const firstDoc = docs[0].toJS() as any;
                
                // Support Bundle Secrets have troubleshoot.sh/kind label
                if (firstDoc.kind === 'Secret' && 
                    firstDoc.metadata?.labels?.['troubleshoot.sh/kind'] === 'support-bundle') {
                    return {
                        kind: 'SupportBundle',
                        apiVersion: 'troubleshoot.sh/v1beta2'
                    };
                }
                
                return {
                    kind: firstDoc.kind,
                    apiVersion: firstDoc.apiVersion
                };
            }
        } catch (error) {
            console.error(`Error parsing YAML ${filePath}:`, error);
        }
        
        return {};
    }

    private isManifestFile(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return ext === '.yaml' || ext === '.yml';
    }
}

