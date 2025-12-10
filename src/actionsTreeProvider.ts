import * as vscode from 'vscode';
import { CLIManager, CLIStatus } from './cliManager';

export class ActionsTreeDataProvider implements vscode.TreeDataProvider<ActionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ActionItem | undefined | void> = new vscode.EventEmitter<ActionItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ActionItem | undefined | void> = this._onDidChangeTreeData.event;

    private cliManager: CLIManager;
    private cliStatus: CLIStatus | undefined;

    constructor() {
        this.cliManager = CLIManager.getInstance();
        this.checkCLIStatus();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async checkCLIStatus(): Promise<void> {
        this.cliStatus = await this.cliManager.checkCLIStatus();
        this.refresh();
    }

    getTreeItem(element: ActionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ActionItem): Promise<ActionItem[]> {
        if (element) {
            return [];
        }

        const items: ActionItem[] = [];

        // Add Test in Environment button
        const testButton = new ActionItem(
            'Test in Environment',
            '',
            vscode.TreeItemCollapsibleState.None,
            'testButton'
        );
        testButton.command = {
            command: 'replicated.testInEnvironment',
            title: 'Test in Environment'
        };
        testButton.iconPath = new vscode.ThemeIcon('rocket');
        testButton.tooltip = 'Deploy and test your manifests in a selected environment';
        items.push(testButton);

        // Add CLI Status
        const cliStatusLabel = this.cliStatus?.installed
            ? `CLI: ${this.cliStatus.version}` 
            : 'CLI: Not Installed';
        
        const cliStatusItem = new ActionItem(
            cliStatusLabel,
            this.cliStatus?.installed ? 'Ready' : 'Click to install',
            vscode.TreeItemCollapsibleState.None,
            'cliStatus'
        );
        
        if (this.cliStatus?.installed) {
            cliStatusItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            cliStatusItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            cliStatusItem.command = {
                command: 'replicated.installCLI',
                title: 'Install CLI'
            };
        }
        
        items.push(cliStatusItem);

        return items;
    }
}

class ActionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: string
    ) {
        super(label, collapsibleState);
        this.description = description;
    }
}

