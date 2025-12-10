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
        
        // When file is modified, return undefined so only git's "M" decoration shows
        if (!info || info.isModified) {
            return undefined;
        }

        // Show EM SPACE (U+2003) badge for unmodified files to match the width of 'M' (git modified decoration)
        // This maintains alignment when files are not modified, without showing a visible character
        return {
            badge: '\u2003', // EM SPACE - same width as M in monospace fonts
            tooltip: `Kind: ${info.kind}`
        };
    }
}

/**
 * Category configuration for install methods
 */
interface CategoryConfig {
    id: 'shared' | 'embedded-cluster' | 'kots' | 'helm';
    title: string;
    icon: string;
    tooltip: string;
    separator?: boolean;
}

/**
 * Category configurations
 */
const CATEGORY_CONFIGS: CategoryConfig[] = [
    {
        id: 'shared',
        title: 'Replicated Platform',
        icon: 'settings-gear',
        tooltip: 'Core configuration files for Replicated deployments'
    },
    {
        id: 'embedded-cluster',
        title: 'Embedded Cluster',
        icon: 'package',
        tooltip: 'Embedded Cluster (EC) is an install method that installs an embedded cluster, then installs your application.\nFor customer environments with NO existing Kubernetes, like Linux VM.',
        separator: true  // Separator goes BEFORE this category
    },
    {
        id: 'kots',
        title: 'KOTS',
        icon: 'server-environment',
        tooltip: 'KOTS (Kubernetes Off-The-Shelf) is an install method that installs an embedded cluster, then installs your application.\nFor customer environments with NO existing Kubernetes, like Linux VM.',
        separator: true  // Separator goes BEFORE this category
    },
    {
        id: 'helm',
        title: 'Helm CLI',
        icon: 'symbol-method',
        tooltip: 'Helm CLI is a popular install method for customers with existing Kubernetes clusters.',
        separator: true  // Separator goes BEFORE this category
    }
];

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
        const unidentified: ManifestItem[] = [];
        const sharedConfig: ManifestItem[] = [];
        const embeddedCluster: ManifestItem[] = [];
        const kotsInstall: ManifestItem[] = [];
        const helmInstall: ManifestItem[] = [];
        
        for (const fileItem of allFiles) {
            const category = this.categorizeByInstallMethod(fileItem);
            
            switch (category) {
                case 'unidentified':
                    unidentified.push(fileItem);
                    break;
                case 'shared':
                    sharedConfig.push(fileItem);
                    break;
                case 'embedded-cluster':
                    embeddedCluster.push(fileItem);
                    break;
                case 'kots':
                    kotsInstall.push(fileItem);
                    break;
                case 'helm':
                    helmInstall.push(fileItem);
                    break;
            }
        }

        const categories: ManifestItem[] = [];

        // Show unidentified files at the top level (not in a category)
        if (unidentified.length > 0) {
            categories.push(...unidentified);
        }

        // Create categories dynamically from config
        for (const config of CATEGORY_CONFIGS) {
            const files = config.id === 'shared' ? sharedConfig :
                         config.id === 'embedded-cluster' ? embeddedCluster :
                         config.id === 'kots' ? kotsInstall :
                         helmInstall;
            
            // Add separator BEFORE this category if specified
            if (config.separator) {
                categories.push(this.createSeparator());
            }
            
            // Create category item
            const categoryItem = this.createCategoryItem(
                config.title,
                config.icon,
                config.tooltip,
                files,
                manifestPath
            );
            categories.push(categoryItem);
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

    private categorizeByInstallMethod(fileItem: ManifestItem): 'unidentified' | 'shared' | 'embedded-cluster' | 'kots' | 'helm' {
        const fileName = fileItem.label.toLowerCase();
        const kind = fileItem.kind;
        
        // Check if this file can be identified by our system
        // A file is unidentified if we don't have a description for it
        const manifestInfo = this.parseManifestKind(fileItem.filePath || '');
        const canIdentify = this.canIdentifyManifest(manifestInfo.apiVersion, manifestInfo.kind, fileName);
        
        if (!canIdentify) {
            return 'unidentified';
        }
        
        // Check Embedded Cluster FIRST (more specific) before generic Config check
        if (fileName.includes('embedded-cluster')) {
            return 'embedded-cluster';
        }
        
        if (manifestInfo.apiVersion === 'embeddedcluster.replicated.com/v1beta1') {
            return 'embedded-cluster';
        }
        
        // THEN check shared config files (more generic - used across multiple install methods)
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
        
        // Default to shared for other known Replicated kinds
        if (this.isKnownReplicatedKind(kind)) {
            return 'shared';
        }
        
        // All other Kubernetes resources go to KOTS
        return 'kots';
    }

    private canIdentifyManifest(apiVersion: string | undefined, kind: string | undefined, fileName: string): boolean {
        // Check if we have a description for this manifest
        const description = this.getKindDescription(apiVersion, kind || '', fileName);
        return description !== undefined;
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

    private getIconForKind(kind: string | undefined): string {
        if (!kind) {
            return 'code';
        }
        
        // Application / Runtime resources (what actually runs)
        const applicationKinds = [
            'Deployment',
            'Service',
            'ConfigMap',
            'Secret',
            'StatefulSet',
            'Ingress',
            'PersistentVolumeClaim',
            'Chart',
            'HelmChart'
        ];
        
        if (applicationKinds.includes(kind)) {
            return 'package';
        }
        
        // Default for all other kinds (Admin Console, Troubleshooting, etc.)
        return 'code';
    }

    /**
     * Creates a visual separator for the tree view
     */
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
        
        // Parse YAML to detect kind
        const manifestInfo = this.parseManifestKind(fullPath);
        
        // Check if file is modified in git
        const isModified = this.isFileModified(fullPath);
        
        // Register file with decoration provider
        this.decorationProvider.setFileInfo(fullPath, manifestInfo.kind, isModified);
        
        let description = '';
        let iconPath = this.getIconForKind(manifestInfo.kind);
        
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
        } else {
            // No issues - use icon based on kind
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
            // Add description based on apiVersion + kind
            const kindDescription = this.getKindDescription(manifestInfo.apiVersion, manifestInfo.kind, fileName);
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

    private getKindDescription(apiVersion: string | undefined, kind: string, fileName: string): string | undefined {
        // Use apiVersion + kind together for accurate identification
        const key = apiVersion && kind ? `${apiVersion}/${kind}` : undefined;
        
        // Map of apiVersion/kind to description
        const descriptions = new Map<string, string>([
            // Replicated KOTS Resources
            ['kots.io/v1beta1/Config', 'Define the config screen for your customers to set their org\'s unique install values.\ne.g., database URLs, API keys, feature flags…'],
            ['kots.io/v1beta1/Application', 'Customize Admin Console for your customers with your custom branding, app status indicators, port forwarding, release notes…'],
            ['kots.io/v1beta2/HelmChart', 'Specify how KOTS deploys Helm charts to your customer\'s cluster (KOTS), or define your chart specification (Helm)'],
            ['kots.io/v1beta1/ConfigValues', 'Set default config values for customers doing automated / headless installs without Admin Console UI. e.g., for CI/CD pipelines'],
            ['kots.io/v1beta1/LintConfig', 'Customize release linter rules to validate manifests before deploying new releases to your customers'],
            
            // Embedded Cluster
            ['embeddedcluster.replicated.com/v1beta1/Config', 'Configure the embedded Kubernetes cluster your customers will run in their infrastructure.\ne.g., cluster version, node settings, requirements…'],
            
            // Kubernetes Application
            ['app.k8s.io/v1beta1/Application', 'Adds buttons and links to the Replicated Admin Console dashboard'],
            
            // Troubleshoot Resources
            ['troubleshoot.sh/v1beta2/Preflight', 'Define validation checks to run in your customer\'s environment before actual installation, to verify their system meets requirements.\ne.g., memory, disk, permissions…'],
            ['troubleshoot.sh/v1beta2/SupportBundle', 'Specify the diagnostic data to collect from your customer\'s environment when they need support.\ne.g., application logs, pod status, resource states, custom collectors…'],
            ['troubleshoot.sh/v1beta2/Redactor', 'Define patterns to automatically remove your customer\'s sensitive info from support bundles they send you.\ne.g., passwords, API tokens, encryption keys'],
            ['troubleshoot.sh/v1beta2/Analyzer', 'Define custom analysis rules for support bundles to automatically diagnose common issues in your customer\'s environment'],
            
            // Standard Kubernetes Resources (expanded for K8s beginners)
            ['apps/v1/Deployment', 'Manage your application pods in your customer\'s cluster\ne.g., define rolling updates, scaling behavior, ensure desired replicas run…'],
            ['v1/Service', 'Provide a stable network endpoint for your app in your customer\'s cluster. Works like a load balancer routing traffic to your pods.'],
            ['v1/ConfigMap', 'Store non-sensitive configuration data your app needs at runtime in your customer\'s cluster.\ne.g., settings, feature flags, config files for pods…)'],
            ['v1/Secret', 'Store sensitive data your application needs in your customer\'s cluster. Secrets are base64 encoded with restricted access controls.\ne.g., passwords, API keys, certificates…'],
            ['apps/v1/StatefulSet', 'Manage stateful applications in your customer\'s cluster.\ne.g., databases and queues that need persistent identity, stable network IDs, ordered deployment…'],
            ['networking.k8s.io/v1/Ingress', 'Define how external HTTP/HTTPS traffic reaches your application in your customer\'s cluster\ne.g., URL paths, domains, TLS certificates…'],
            ['v1/PersistentVolumeClaim', 'Request persistent storage for your app in your customer\'s cluster. Ensure your data survives pod restarts and rescheduling.']
        ]);
        
        // Primary: Check apiVersion + kind together
        if (key) {
            const description = descriptions.get(key);
            if (description) {
                return description;
            }
        }
        
        // Secondary: Fallback to file name patterns for cases where apiVersion might be missing
        if (fileName.includes('embedded-cluster') && kind === 'Config') {
            return 'Configure the embedded Kubernetes cluster your customers will run in their infrastructure - cluster version, node settings, and requirements';
        }
        
        if (fileName.includes('k8s-app') && kind === 'Application') {
            return 'Add custom buttons and links to your customer\'s Kubernetes dashboard (typically excluded from KOTS installations with kots.io/exclude annotation)';
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
                
                // Special handling for Support Bundle Secrets
                // Check if this is a Secret with the troubleshoot.sh/kind: support-bundle label
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

