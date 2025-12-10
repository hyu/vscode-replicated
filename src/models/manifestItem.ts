import * as vscode from 'vscode';

/**
 * Represents a single item in the manifests tree view
 */
export class ManifestItem extends vscode.TreeItem {
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
        
        // Set icon based on type
        if (isDirectory) {
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (iconType === 'folder') {
            this.iconPath = new vscode.ThemeIcon(iconType);
        } else if (iconType === '') {
            this.iconPath = undefined;
        } else {
            // Use provided icon type ('code' for Replicated kinds, 'package' for K8s resources)
            this.iconPath = new vscode.ThemeIcon(iconType);
        }
        
        if (filePath) {
            this.resourceUri = vscode.Uri.file(filePath);
        }
    }
}

