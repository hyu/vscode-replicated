import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

export class ManifestTreeDataProvider implements vscode.TreeDataProvider<ManifestItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ManifestItem | undefined | void> = new vscode.EventEmitter<ManifestItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ManifestItem | undefined | void> = this._onDidChangeTreeData.event;

    private lintStatuses: Map<string, LintStatus> = new Map();
    private lastLintTime: Date | undefined;

    constructor(private diagnosticCollection: vscode.DiagnosticCollection) {
        // Watch for diagnostic changes to update tree
        vscode.languages.onDidChangeDiagnostics(() => {
            this.updateLintStatuses();
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateLastLintTime(): void {
        this.lastLintTime = new Date();
        this.refresh();
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
        // Collect all manifest files recursively
        const allFiles = this.collectAllManifestFiles(manifestPath, manifestPath);
        
        if (allFiles.length === 0) {
            return [];
        }

        // Categorize files
        const replicatedFiles: ManifestItem[] = [];
        const kubernetesFiles: ManifestItem[] = [];
        
        for (const fileItem of allFiles) {
            if (this.isReplicatedResource(fileItem.kind)) {
                replicatedFiles.push(fileItem);
            } else {
                kubernetesFiles.push(fileItem);
            }
        }

        const categories: ManifestItem[] = [];

        // Create Replicated Resources category
        if (replicatedFiles.length > 0) {
            const replicatedCategory = new ManifestItem(
                'Replicated Resources',
                `${replicatedFiles.length} file${replicatedFiles.length !== 1 ? 's' : ''}`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'folder',
                undefined,
                false,
                manifestPath
            );
            replicatedCategory.iconPath = new vscode.ThemeIcon('package');
            replicatedCategory.children = replicatedFiles;
            categories.push(replicatedCategory);
        }

        // Create Kubernetes Resources category
        if (kubernetesFiles.length > 0) {
            const kubernetesCategory = new ManifestItem(
                'Kubernetes Resources',
                `${kubernetesFiles.length} file${kubernetesFiles.length !== 1 ? 's' : ''}`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'folder',
                undefined,
                false,
                manifestPath
            );
            kubernetesCategory.iconPath = new vscode.ThemeIcon('server');
            kubernetesCategory.children = kubernetesFiles;
            categories.push(kubernetesCategory);
        }

        return categories;
    }

    private isReplicatedResource(kind: string | undefined): boolean {
        if (!kind) {
            return false;
        }
        
        const replicatedKinds = [
            'Application',
            'Config',
            'Preflight',
            'Analyzer',
            'SupportBundle',
            'HelmChart',
            'Backup',
            'Troubleshoot',
            'Redactor'
        ];
        
        return replicatedKinds.includes(kind);
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
        
        // Parse YAML to detect kind
        const manifestInfo = this.parseManifestKind(fullPath);
        
        let description = '';
        let iconPath = 'document';
        
        if (lintStatus && lintStatus.hasIssues) {
            const parts: string[] = [];
            if (lintStatus.errors > 0) {
                parts.push(`${lintStatus.errors} error${lintStatus.errors !== 1 ? 's' : ''}`);
                iconPath = 'error';
            }
            if (lintStatus.warnings > 0) {
                parts.push(`${lintStatus.warnings} warning${lintStatus.warnings !== 1 ? 's' : ''}`);
                if (iconPath === 'document') {
                    iconPath = 'warning';
                }
            }
            if (lintStatus.info > 0) {
                parts.push(`${lintStatus.info} info`);
                if (iconPath === 'document') {
                    iconPath = 'info';
                }
            }
            description = parts.join(', ');
        } else if (this.lastLintTime) {
            iconPath = 'pass';
            // Add non-breaking space to match the width of git decoration (M) for consistent alignment
            description = '\u00A0';
        }
        
        // Pad label to reserve space for git decorations and ensure consistent icon alignment
        const paddedLabel = fileName + '\u00A0\u00A0';
        
        const item = new ManifestItem(
            paddedLabel,
            description,
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
        
        const relativePath = path.relative(basePath, fullPath);
        let tooltipText = `${relativePath}\n`;
        if (manifestInfo.kind) {
            tooltipText += `Kind: ${manifestInfo.kind}\n`;
        }
        if (manifestInfo.apiVersion) {
            tooltipText += `API: ${manifestInfo.apiVersion}\n`;
        }
        if (this.lastLintTime) {
            const timeAgo = this.getTimeAgo(this.lastLintTime);
            tooltipText += `Last linted: ${timeAgo}`;
        }
        
        item.tooltip = tooltipText;
        
        // Add inline action button for linting
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


    private parseManifestKind(filePath: string): { kind?: string; apiVersion?: string } {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docs = yaml.parseAllDocuments(content);
            
            // Get the first document's kind
            if (docs.length > 0 && docs[0].toJS()) {
                const firstDoc = docs[0].toJS() as any;
                return {
                    kind: firstDoc.kind,
                    apiVersion: firstDoc.apiVersion
                };
            }
        } catch (error) {
            // If parsing fails, just return empty
            console.error(`Error parsing YAML ${filePath}:`, error);
        }
        
        return {};
    }

    private isManifestFile(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return ext === '.yaml' || ext === '.yml';
    }

    private getTimeAgo(date: Date): string {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        
        if (seconds < 10) {
            return 'just now';
        } else if (seconds < 60) {
            return `${seconds}s ago`;
        }
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes}m ago`;
        }
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours}h ago`;
        }
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }
}

class ManifestItem extends vscode.TreeItem {
    public children?: ManifestItem[];
    
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath: string | undefined,
        iconType: string,
        public readonly kind?: string,
        public readonly isDirectory: boolean = false,
        public readonly basePath?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        
        // Don't override icon for folders
        if (!isDirectory) {
            // Set icon based on lint status
            switch (iconType) {
                case 'error':
                    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                    break;
                case 'warning':
                    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                    break;
                case 'info':
                    this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
                    break;
                case 'pass':
                    this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
                    break;
                default:
                    this.iconPath = new vscode.ThemeIcon('file-code');
            }
        }
        
        if (filePath) {
            this.resourceUri = vscode.Uri.file(filePath);
        }
    }
}

interface LintStatus {
    errors: number;
    warnings: number;
    info: number;
    hasIssues: boolean;
}

