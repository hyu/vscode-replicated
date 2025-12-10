import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { LintStatus, ManifestInfo } from '../models/types';
import { ManifestItem } from '../models/manifestItem';

/**
 * File decoration provider for manifest files
 * Shows an info badge for unmodified files
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
        
        if (!info || info.isModified) {
            return undefined;
        }

        // Show info badge for unmodified files with tooltip showing the kind
        return {
            badge: 'ℹ',
            tooltip: `Kind: ${info.kind}`
        };
    }
}

/**
 * Tree data provider for the Manifests view
 * Displays project manifest files organized by type (Replicated vs Kubernetes resources)
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
        // Collect all manifest files recursively
        const allFiles = this.collectAllManifestFiles(manifestPath, manifestPath);
        
        if (allFiles.length === 0) {
            return [];
        }

        // Categorize files by install method
        const sharedConfig: ManifestItem[] = [];
        const helmInstall: ManifestItem[] = [];
        const kotsInstall: ManifestItem[] = [];
        
        for (const fileItem of allFiles) {
            const category = this.categorizeByInstallMethod(fileItem);
            
            switch (category) {
                case 'shared':
                    sharedConfig.push(fileItem);
                    break;
                case 'helm':
                    helmInstall.push(fileItem);
                    break;
                case 'kots':
                    kotsInstall.push(fileItem);
                    break;
            }
        }

        const categories: ManifestItem[] = [];

        // Create Shared Install Config category
        if (sharedConfig.length > 0) {
            const sharedCategory = new ManifestItem(
                'Shared Install Config',
                `${sharedConfig.length} file${sharedConfig.length !== 1 ? 's' : ''}`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'folder',
                undefined,
                false,
                manifestPath
            );
            sharedCategory.iconPath = new vscode.ThemeIcon('settings-gear');
            sharedCategory.children = sharedConfig;
            categories.push(sharedCategory);
        }

        // Create Helm Install category
        if (helmInstall.length > 0) {
            const helmCategory = new ManifestItem(
                'Helm Install',
                `${helmInstall.length} file${helmInstall.length !== 1 ? 's' : ''}`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'folder',
                undefined,
                false,
                manifestPath
            );
            helmCategory.iconPath = new vscode.ThemeIcon('package');
            helmCategory.children = helmInstall;
            categories.push(helmCategory);
        }

        // Create KOTS Install category
        if (kotsInstall.length > 0) {
            const kotsCategory = new ManifestItem(
                'KOTS Install',
                `${kotsInstall.length} file${kotsInstall.length !== 1 ? 's' : ''}`,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'folder',
                undefined,
                false,
                manifestPath
            );
            kotsCategory.iconPath = new vscode.ThemeIcon('server-environment');
            kotsCategory.children = kotsInstall;
            categories.push(kotsCategory);
        }

        return categories;
    }

    private categorizeByInstallMethod(fileItem: ManifestItem): 'shared' | 'helm' | 'kots' {
        const fileName = fileItem.label.toLowerCase();
        const kind = fileItem.kind;
        
        // Shared config files (used across multiple install methods)
        if (kind === 'Config' || fileName === 'config.yaml' || fileName === 'config.yml') {
            return 'shared';
        }
        
        if (kind === 'Application' && fileName.includes('replicated-app')) {
            return 'shared';
        }
        
        if (fileName.includes('k8s-app')) {
            return 'shared';
        }
        
        if (kind === 'SupportBundle' || fileName.includes('support-bundle')) {
            return 'shared';
        }
        
        // Helm-specific files (pure Helm charts, not HelmChart CRs)
        if (fileName.includes('chart') && !fileName.includes('helmchart') && kind !== 'HelmChart') {
            return 'helm';
        }
        
        // Files that look like plain HelmChart specs without being HelmChart CRs
        // Check for files like han.yaml that are Chart resources
        if (kind === 'Chart' || (fileName.endsWith('.yaml') && !fileName.includes('replicated') && !fileName.includes('k8s') && !fileName.includes('embedded') && !fileName.includes('config') && !fileName.includes('support') && kind === undefined)) {
            // Ambiguous - could be Helm or other. Let's check apiVersion if available
            // For now, assume these are Helm unless proven otherwise
            return 'helm';
        }
        
        // KOTS-specific files
        if (kind === 'HelmChart') {
            return 'kots';
        }
        
        if (fileName.includes('embedded-cluster')) {
            return 'kots';
        }
        
        // Default to shared for other known Replicated kinds
        if (this.isKnownReplicatedKind(kind)) {
            return 'shared';
        }
        
        // All other Kubernetes resources go to KOTS
        return 'kots';
    }

    private isKnownReplicatedKind(kind: string | undefined): boolean {
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
        
        // Check if file is modified in git
        const isModified = this.isFileModified(fullPath);
        
        // Register file with decoration provider
        this.decorationProvider.setFileInfo(fullPath, manifestInfo.kind, isModified);
        
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
                    iconPath = 'info-icon';
                }
            }
            description = parts.join(', ').trim();
        } else {
            // No issues - show check icon
            iconPath = 'pass';
            // Show kind in description for clarity (right-aligned)
            if (manifestInfo.kind) {
                description = manifestInfo.kind.trim();
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
        
        // Set resourceUri so git decorations appear
        item.resourceUri = vscode.Uri.file(fullPath);
        
        // Build concise tooltip with description and API info
        const tooltipParts: string[] = [];
        
        if (manifestInfo.kind) {
            // Add description based on kind
            const kindDescription = this.getKindDescription(manifestInfo.kind, fileName);
            if (kindDescription) {
                tooltipParts.push(kindDescription);
            }
        }
        
        if (manifestInfo.apiVersion) {
            tooltipParts.push(`API Version: ${manifestInfo.apiVersion}`);
        }
        
        // Join with double newline for better readability
        item.tooltip = tooltipParts.join('\n\n');
        
        // Add inline action button for linting
        item.contextValue = 'manifestFile';
        
        return item;
    }

    private getKindDescription(kind: string, fileName: string): string | undefined {
        // Map of kind to description (using Map to avoid ESLint naming convention issues)
        const descriptions = new Map<string, string>([
            // Replicated Resources
            ['Config', 'Define the configuration screen for your customers to input their organization\'s unique install values (database URLs, API keys, feature flags, etc.)'],
            ['Application', 'Customize Admin Console for your customers with your custom branding, application status indicators, port forwarding options, and release notes'],
            ['HelmChart', 'Specify how KOTS should deploy your Helm chart to your customer\'s cluster (KOTS), or define your chart specification (Helm)'],
            ['EmbeddedClusterConfig', 'Configure the embedded Kubernetes cluster your customers will run in their infrastructure - cluster version, node settings, and requirements'],
            ['SigApplication', 'Add custom buttons and links to your customer\'s Kubernetes dashboard (typically excluded from KOTS installations with kots.io/exclude annotation)'],
            ['Preflight', 'Define the validation checks to run in your customer\'s environment before installation to verify their system meets requirements (memory, disk, permissions, etc.)'],
            ['SupportBundle', 'Specify what diagnostic data to collect from your customer\'s environment when they need support (application logs, pod status, resource states, custom collectors)'],
            ['ConfigValues', 'Provide default config values for your customers doing automated/headless installations without the Admin Console UI in their CI/CD pipelines'],
            ['Redactor', 'Define patterns to automatically remove your customer\'s sensitive information (their passwords, API tokens, encryption keys) from support bundles they send you'],
            ['LintConfig', 'Customize the release linter rules that validate your manifests before you deploy new releases to your customers'],
            
            // Standard Kubernetes Resources (expanded for K8s beginners)
            ['Deployment', 'Manage your application pods in your customer\'s cluster - define rolling updates, scaling behavior, and ensure their desired replicas stay running'],
            ['Service', 'Provide a stable network endpoint for your application in your customer\'s cluster (works like a load balancer routing traffic to your pods)'],
            ['ConfigMap', 'Store non-sensitive configuration data your application needs at runtime in your customer\'s cluster (settings, feature flags, config files your pods read)'],
            ['Secret', 'Store sensitive data your application needs in your customer\'s cluster (passwords, API keys, certificates) - base64 encoded with restricted access controls'],
            ['StatefulSet', 'Manage stateful applications in your customer\'s cluster (databases, queues) that need persistent identity, stable network IDs, and ordered deployment'],
            ['Ingress', 'Define how external HTTP/HTTPS traffic reaches your application in your customer\'s cluster - configure URL paths, domains, and TLS certificates'],
            ['PersistentVolumeClaim', 'Request persistent storage for your application in your customer\'s cluster - ensures your data survives pod restarts and rescheduling']
        ]);
        
        // Check if we have a specific description for this kind
        const description = descriptions.get(kind);
        if (description) {
            return description;
        }
        
        // For embedded-cluster, check filename pattern
        if (fileName.includes('embedded-cluster')) {
            return 'KOTS Install (Embedded Cluster only) - Specifies Embedded Cluster version and configuration for bundled Kubernetes installations';
        }
        
        // For k8s-app or Application kind with kots.io
        if (fileName.includes('k8s-app')) {
            return 'Shared Config - Kubernetes SIG Application custom resource that adds metadata, buttons, and links to the Admin Console dashboard';
        }
        
        return undefined;
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

