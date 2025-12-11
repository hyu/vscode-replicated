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
            ? { badge: '\u2003', tooltip: 'No changes' }
            : undefined;
    }
}

/**
 * Provides lint status decorations (warning/error badges) for manifest files
 */
class LintDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private lintStatuses = new Map<string, LintStatus>();

    updateLintStatuses(lintStatuses: Map<string, LintStatus>) {
        this.lintStatuses = lintStatuses;
        // Fire event for all files with lint status
        const uris = Array.from(lintStatuses.keys()).map(fsPath => vscode.Uri.file(fsPath));
        if (uris.length > 0) {
            this._onDidChangeFileDecorations.fire(uris);
        }
    }

    clear() {
        this.lintStatuses.clear();
        this._onDidChangeFileDecorations.fire(vscode.Uri.file('/'));
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const lintStatus = this.lintStatuses.get(uri.fsPath);
        if (!lintStatus || !lintStatus.hasIssues) {
            return undefined;
        }

        // Prioritize errors over warnings
        if (lintStatus.errors > 0) {
            return {
                badge: '$(error)',
                color: new vscode.ThemeColor('errorForeground'),
                tooltip: `${lintStatus.errors} error${lintStatus.errors !== 1 ? 's' : ''}${lintStatus.warnings > 0 ? `, ${lintStatus.warnings} warning${lintStatus.warnings !== 1 ? 's' : ''}` : ''}`
            };
        } else if (lintStatus.warnings > 0) {
            return {
                badge: '$(warning)',
                color: new vscode.ThemeColor('warningForeground'),
                tooltip: `${lintStatus.warnings} warning${lintStatus.warnings !== 1 ? 's' : ''}`
            };
        }

        return undefined;
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
    private lintDecorationProvider: LintDecorationProvider;
    private extensionUri: vscode.Uri;

    constructor(private diagnosticCollection: vscode.DiagnosticCollection, extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.gitPlaceholderProvider = new GitPlaceholderDecorationProvider();
        this.lintDecorationProvider = new LintDecorationProvider();
        vscode.window.registerFileDecorationProvider(this.gitPlaceholderProvider);
        vscode.window.registerFileDecorationProvider(this.lintDecorationProvider);

        vscode.languages.onDidChangeDiagnostics(() => {
            this.updateLintStatuses();
            this.refresh();
        });

        this.initializeGitApi();
    }

    private async initializeGitApi(): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                return;
            }

            if (!gitExtension.isActive) {
                await gitExtension.activate();
            }

            this.gitApi = gitExtension.exports?.getAPI(1);
            this.gitApi?.onDidChangeState(() => this.refresh());
        } catch (error) {
            // Git extension not available - this is expected in some environments
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private updateLintStatuses(): void {
        const previousFiles = new Set(this.lintStatuses.keys());
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
        
        // Update lint decoration provider - include files that previously had lint status
        // to ensure decorations are cleared when diagnostics are removed
        const allFiles = new Set([...previousFiles, ...this.lintStatuses.keys()]);
        const statusMap = new Map<string, LintStatus>();
        allFiles.forEach(fsPath => {
            statusMap.set(fsPath, this.lintStatuses.get(fsPath) || {
                errors: 0,
                warnings: 0,
                info: 0,
                hasIssues: false
            });
        });
        this.lintDecorationProvider.updateLintStatuses(statusMap);
        
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
            if (element.children?.length) {
                return element.children;
            }
            if (element.isDirectory && element.filePath) {
                return this.getDirectoryChildren(element.filePath, element.basePath!);
            }
            return [];
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
                if (items.length > 0) {
                    return items;
                }
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
        if (allFiles.length === 0) {
            return [];
        }

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
                config.customIconPath,
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
        customIconPath: string | undefined,
        tooltip: string,
        docsUrl: string | undefined,
        files: ManifestItem[],
        manifestPath: string
    ): ManifestItem {
        // Show file count in parentheses (right-aligned in tree view)
        const description = files.length > 0 ? `(${files.length})` : '';
        
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
        
        // Use custom icon path if provided, otherwise use theme icon
        if (customIconPath) {
            item.iconPath = vscode.Uri.joinPath(this.extensionUri, customIconPath);
        } else {
            item.iconPath = new vscode.ThemeIcon(icon);
        }
        
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
            '',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            '',
            undefined,
            false,
            undefined
        );
        separator.contextValue = 'separator';
        separator.tooltip = '';
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
        const docsUrl = getKindDocsUrl(manifestInfo.apiVersion, manifestInfo.kind, fileName);
        const iconPath = getIconForKind(manifestInfo.kind);
        
        // Placeholder maintains consistent spacing when file has no Git changes
        const gitStatus = this.getGitStatus(fullPath);
        this.gitPlaceholderProvider.setPlaceholder(fullPath, !gitStatus);
        
        const description = this.buildFileDescription(manifestInfo.kind);
        const item = new ManifestItem(
            fileName,
            description,
            vscode.TreeItemCollapsibleState.None,
            fullPath,
            iconPath,
            manifestInfo.kind,
            false,
            basePath
        );
        
        // Note: VS Code doesn't support colored ThemeIcons directly
        // File icon coloring is handled by FileDecorationProvider (LintDecorationProvider)
        // which shows colored badges next to files with lint issues
        
        item.command = {
            command: 'replicated.openManifest',
            title: 'Open Manifest',
            arguments: [fullPath]
        };
        
        item.resourceUri = vscode.Uri.file(fullPath);
        item.tooltip = this.buildFileTooltip(manifestInfo, fileName);
        
        // Update context value to reflect lint status for lint button icon
        let contextValue = docsUrl ? 'manifestFileWithDocs' : 'manifestFile';
        if (lintStatus?.hasIssues) {
            if (lintStatus.errors > 0) {
                contextValue = docsUrl ? 'manifestFileWithDocsLintError' : 'manifestFileLintError';
            } else if (lintStatus.warnings > 0) {
                contextValue = docsUrl ? 'manifestFileWithDocsLintWarning' : 'manifestFileLintWarning';
            }
        }
        item.contextValue = contextValue;
        
        if (docsUrl) {
            (item as any).docsUrl = docsUrl;
        }
        
        return item;
    }

    private buildFileDescription(kind: string | undefined): string {
        return kind?.trim() || '';
    }

    private buildFileTooltip(manifestInfo: ManifestInfo, fileName: string): string {
        const parts: string[] = [];
        
        if (manifestInfo.kind) {
            const kindDescription = getKindDescription(manifestInfo.apiVersion, manifestInfo.kind, fileName);
            if (kindDescription) {
                parts.push(kindDescription);
            }
        }
        
        if (manifestInfo.apiVersion) {
            parts.push(`API Version: ${manifestInfo.apiVersion}`);
        }
        
        return parts.join('\n\n');
    }
    
    private getGitStatus(filePath: string): 'M' | 'A' | 'D' | 'U' | undefined {
        if (!this.gitApi?.repositories?.length) {
            return undefined;
        }

        try {
            const repo = this.gitApi.repositories[0];
            const { workingTreeChanges = [], indexChanges = [], untrackedChanges = [] } = repo.state;
            
            if (untrackedChanges.some((change: any) => change.uri.fsPath === filePath)) {
                return 'U';
            }
            
            if (workingTreeChanges.some((change: any) => change.uri.fsPath === filePath) ||
                indexChanges.some((change: any) => change.uri.fsPath === filePath)) {
                return 'M';
            }
            
            return undefined;
        } catch (error) {
            console.error('Error checking git status:', error);
            return undefined;
        }
    }

    private getDirectoryChildren(dirPath: string, basePath: string): ManifestItem[] {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const directories = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
            const files = entries.filter(e => e.isFile() && this.isManifestFile(e.name)).sort((a, b) => a.name.localeCompare(b.name));
            
            return [
                ...directories.map(dir => {
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
                    return item;
                }),
                ...files.map(file => 
                    this.createFileItem(path.join(dirPath, file.name), basePath, file.name)
                )
            ];
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
            return [];
        }
    }

    private parseManifestKind(filePath: string): ManifestInfo {
        // Handle .tgz files specially - they're archives, not YAML
        if (filePath.toLowerCase().endsWith('.tgz')) {
            return {
                kind: 'HelmArchive',
                apiVersion: undefined
            };
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.parseAllDocuments(content);
            
            if (docs.length > 0 && docs[0].toJS()) {
                const firstDoc = docs[0].toJS() as any;
                
                // Support Bundle Secrets use troubleshoot.sh/kind label
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
        return ext === '.yaml' || ext === '.yml' || ext === '.tgz';
    }
}

