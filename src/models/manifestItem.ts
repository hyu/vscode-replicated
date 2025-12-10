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
            // Folders use folder icon
            this.iconPath = vscode.ThemeIcon.Folder;
        } else if (iconType === 'folder') {
            // Category items
            this.iconPath = new vscode.ThemeIcon(iconType);
        } else if (iconType === '') {
            // Empty string means no icon (used for separators)
            this.iconPath = undefined;
        } else {
            // Files use file-code icon (decorations will show info, git, lint badges)
            this.iconPath = new vscode.ThemeIcon('file-code');
        }
        
        if (filePath) {
            this.resourceUri = vscode.Uri.file(filePath);
        }
    }
}

