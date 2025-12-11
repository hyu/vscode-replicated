import * as vscode from 'vscode';

/**
 * Represents a resource item in the CMX cluster tree view
 */
export class ClusterResourceItem extends vscode.TreeItem {
    public children?: ClusterResourceItem[];
    
    constructor(
        label: string,
        description: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        iconName?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        if (iconName) {
            this.iconPath = new vscode.ThemeIcon(iconName);
        }
    }
}

