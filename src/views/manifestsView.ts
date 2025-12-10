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
    InstallMethod
} from '../utils/manifestUtils';

/**
 * File decoration provider that shows EM SPACE badge for unmodified files
 * Maintains alignment with git's "M" decoration without showing visible characters
 */
class ManifestDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private fileInfo = new Map<string, { kind: string; isModified: boolean }>();

    setFileInfo(fsPath: string, kind: string | undefined, isModified: boolean) {
        if (kind) {
            this.fileInfo.set(fsPath, { kind, isModified });
        } else {
            this.fileInfo.delete(fsPath);
        }
        this._onDidChangeFileDecorations.fire(vscode.Uri.file(fsPath));
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const info = this.fileInfo.get(uri.fsPath);
        
        // Only show decoration for unmodified files to maintain alignment
        if (!info || info.isModified) {
            return undefined;
        }

        // EM SPACE matches width of 'M' in monospace fonts
        return {
            badge: '\u2003',
            tooltip: `Kind: ${info.kind}`
        };
    }
}

/**
 * Tree data provider for the Manifests view
 * Organizes manifest files by install method (Shared, Embedded Cluster, KOTS, Helm)
 */
export class ManifestsViewProvider implements vscode.TreeDataProvider<ManifestItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ManifestItem | undefined | void> = new vscode.EventEmitter<ManifestItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ManifestItem | undefined | void> = this._onDidChangeTreeData.event;

    private lintStatuses: Map<string, LintStatus> = new Map();
    private gitApi: any | undefined;
    private decorationProvider: ManifestDecorationProvider;

    constructor(private diagnosticCollection: vscode.DiagnosticCollection) {
        // Initialize decoration provider
        this.decorationProvider = new ManifestDecorationProvider();
        vscode.window.registerFileDecorationProvider(this.decorationProvider);

        // Watch for diagnostic changes to update tree
        vscode.languages.onDidChangeDiagnostics(() => {
            this.updateLintStatuses();
            this.refresh();
        });

        // Try to get git extension API asynchronously (optional - gracefully handle if not available)
        this.initializeGitApi();
    }

    private async initializeGitApi(): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                // Activate the extension if needed
                if (!gitExtension.isActive) {
                    await gitExtension.activate();
                }
                if (gitExtension.exports) {
                    this.gitApi = gitExtension.exports.getAPI(1);
                    // Watch for git changes to update decorations
                    if (this.gitApi) {
                        this.gitApi.onDidChangeState(() => {
                            this.refresh();
                        });
                    }
                }
            }
        } catch (error) {
            // Git extension not available - continue without it
            console.log('Git extension not available:', error);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private updateLintStatuses(): void {
        this.lintStatuses.clear();
        
        // Get all diagnostics
        this.diagnosticCollection.forEach((uri, diagnostics) => {
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
            const warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
            const info = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Information).length;
            
            this.lintStatuses.set(uri.fsPath, {
                errors,
                warnings,
                info,
                hasIssues: errors > 0 || warnings > 0 || info > 0
            });
        });
    }

    getTreeItem(element: ManifestItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ManifestItem): Promise<ManifestItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('No workspace folder found');
            return [];
        }

        // If we have an element with children, return them
        if (element) {
            if (element.children && element.children.length > 0) {
                return element.children;
            }
            if (element.isDirectory && element.filePath) {
                return this.getDirectoryChildren(element.filePath, element.basePath!);
            }
            return [];
        }

        // Root level - get manifest folder contents and organize by category
        for (const folder of vscode.workspace.workspaceFolders) {
            const manifestFolder = vscode.workspace.getConfiguration('replicated').get<string>('manifestsFolder', 'manifests');
            const manifestPath = path.join(folder.uri.fsPath, manifestFolder);
            
            if (fs.existsSync(manifestPath)) {
                const organizedItems = this.getOrganizedManifests(manifestPath);
                if (organizedItems.length > 0) {
                    return organizedItems;
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

        // Categorize files by install method
        const categorizedFiles = new Map<InstallMethod, ManifestItem[]>();
        categorizedFiles.set('unidentified', []);
        categorizedFiles.set('shared', []);
        categorizedFiles.set('embedded-cluster', []);
        categorizedFiles.set('kots', []);
        categorizedFiles.set('helm', []);
        
        for (const fileItem of allFiles) {
            const manifestInfo = this.parseManifestKind(fileItem.filePath || '');
            const category = categorizeByInstallMethod(
                manifestInfo.kind,
                manifestInfo.apiVersion,
                fileItem.label.toLowerCase()
            );
            
            categorizedFiles.get(category)!.push(fileItem);
        }

        const categories: ManifestItem[] = [];

        // Show unidentified files at the top level
        const unidentified = categorizedFiles.get('unidentified')!;
        if (unidentified.length > 0) {
            categories.push(...unidentified);
        }

        // Create categories dynamically
        for (const config of CATEGORY_CONFIGS) {
            const files = categorizedFiles.get(config.id)!;
            
            if (config.separator) {
                categories.push(this.createSeparator());
            }
            
            categories.push(this.createCategoryItem(
                config.title,
                config.icon,
                config.tooltip,
                files,
                manifestPath
            ));
        }

        return categories;
    }

    /**
     * Creates a category item for the tree view
     */
    private createCategoryItem(
        title: string,
        icon: string,
        tooltip: string,
        files: ManifestItem[],
        manifestPath: string
    ): ManifestItem {
        const fileCount = files.length;
        const description = fileCount > 0 
            ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` 
            : 'No files';
        
        const categoryItem = new ManifestItem(
            title,
            description,
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            'folder',
            undefined,
            true,
            manifestPath
        );
        categoryItem.iconPath = new vscode.ThemeIcon(icon);
        categoryItem.tooltip = tooltip;
        categoryItem.children = files;
        
        return categoryItem;
    }

    private createSeparator(): ManifestItem {
        const separator = new ManifestItem(
            '┄┄┄┄┄┄┄┄┄┄┄',
            '',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            '',  // iconType - empty string for no icon
            undefined,
            false,
            undefined
        );
        separator.contextValue = 'separator';
        separator.tooltip = undefined;  // No tooltip for separators
        return separator;
    }

    private collectAllManifestFiles(dirPath: string, basePath: string): ManifestItem[] {
        const items: ManifestItem[] = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Recursively collect from subdirectories
                    items.push(...this.collectAllManifestFiles(fullPath, basePath));
                } else if (entry.isFile() && this.isManifestFile(entry.name)) {
                    const fileItem = this.createFileItem(fullPath, basePath, entry.name);
                    items.push(fileItem);
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
        
        // Sort files alphabetically
        items.sort((a, b) => a.label.localeCompare(b.label));
        
        return items;
    }

    private createFileItem(fullPath: string, basePath: string, fileName: string): ManifestItem {
        const lintStatus = this.lintStatuses.get(fullPath);
        const manifestInfo = this.parseManifestKind(fullPath);
        const isModified = this.isFileModified(fullPath);
        
        this.decorationProvider.setFileInfo(fullPath, manifestInfo.kind, isModified);
        
        let description = '';
        let iconPath = getIconForKind(manifestInfo.kind);
        
        if (lintStatus && lintStatus.hasIssues) {
            const parts: string[] = [];
            if (lintStatus.errors > 0) {
                parts.push(`${lintStatus.errors} error${lintStatus.errors !== 1 ? 's' : ''}`);
                iconPath = 'error';
            }
            if (lintStatus.warnings > 0) {
                parts.push(`${lintStatus.warnings} warning${lintStatus.warnings !== 1 ? 's' : ''}`);
                if (iconPath !== 'error') {
                    iconPath = 'warning';
                }
            }
            if (lintStatus.info > 0) {
                parts.push(`${lintStatus.info} info`);
                if (iconPath !== 'error' && iconPath !== 'warning') {
                    iconPath = 'info-icon';
                }
            }
            description = parts.join(', ').trim();
        } else if (manifestInfo.kind) {
            description = manifestInfo.kind.trim();
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
        
        item.contextValue = 'manifestFile';
        
        return item;
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

    private isFileModified(filePath: string): boolean {
        if (!this.gitApi || this.gitApi.repositories.length === 0) {
            return false;
        }

        try {
            const repo = this.gitApi.repositories[0];
            const workingTreeChanges = repo.state.workingTreeChanges || [];
            const indexChanges = repo.state.indexChanges || [];
            
            // Check if file is in working tree changes or staged changes
            const isInWorkingTree = workingTreeChanges.some((change: any) => 
                change.uri.fsPath === filePath
            );
            const isInIndex = indexChanges.some((change: any) => 
                change.uri.fsPath === filePath
            );
            
            return isInWorkingTree || isInIndex;
        } catch (error) {
            console.error('Error checking git status:', error);
            return false;
        }
    }
}

