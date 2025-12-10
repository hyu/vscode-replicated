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
        
        // Don't override icon for folders
        if (!isDirectory) {
            // Set icon based on lint status
            switch (iconType) {
                case 'error':
                    this.iconPath = new vscode.ThemeIcon('error');
                    break;
                case 'warning':
                    this.iconPath = new vscode.ThemeIcon('warning');
                    break;
                case 'info-icon':
                    this.iconPath = new vscode.ThemeIcon('info');
                    break;
                case 'pass':
                    // Use pass/check icon for files that pass validation
                    this.iconPath = new vscode.ThemeIcon('pass');
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

