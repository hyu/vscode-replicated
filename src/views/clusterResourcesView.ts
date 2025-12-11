import * as vscode from 'vscode';
import { ClusterResourceItem } from '../models/clusterResourceItem';

/**
 * Provides a tree view of resources in the CMX ephemeral cluster
 * This is a demo implementation with mock data
 */
export class ClusterResourcesViewProvider implements vscode.TreeDataProvider<ClusterResourceItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ClusterResourceItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClusterResourceItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ClusterResourceItem): Promise<ClusterResourceItem[]> {
        if (!element) {
            // Root level - show mock categories
            return [
                this.createCategory('Workloads', '3', 'layers'),
                this.createCategory('Services', '2', 'globe'),
                this.createCategory('Config', '2', 'gear')
            ];
        }
        return element.children || [];
    }

    private createCategory(name: string, count: string, icon: string): ClusterResourceItem {
        const item = new ClusterResourceItem(name, `(${count})`, vscode.TreeItemCollapsibleState.Expanded, icon);
        item.children = this.getMockChildren(name);
        return item;
    }

    private getMockChildren(category: string): ClusterResourceItem[] {
        if (category === 'Workloads') {
            return [
                new ClusterResourceItem('nginx-deployment', 'Running', vscode.TreeItemCollapsibleState.None, 'package'),
                new ClusterResourceItem('redis-statefulset', 'Running', vscode.TreeItemCollapsibleState.None, 'database'),
                new ClusterResourceItem('app-pod', 'Running', vscode.TreeItemCollapsibleState.None, 'circle-filled')
            ];
        } else if (category === 'Services') {
            return [
                new ClusterResourceItem('nginx-service', 'LoadBalancer', vscode.TreeItemCollapsibleState.None, 'plug'),
                new ClusterResourceItem('redis-service', 'ClusterIP', vscode.TreeItemCollapsibleState.None, 'plug')
            ];
        } else {
            return [
                new ClusterResourceItem('app-config', '5 keys', vscode.TreeItemCollapsibleState.None, 'file-code'),
                new ClusterResourceItem('db-secret', '2 keys', vscode.TreeItemCollapsibleState.None, 'key')
            ];
        }
    }
}

