import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CLIService } from '../services/cliService';

/**
 * Webview provider for the Replicated Dev view
 * Displays development actions like testing in environments and CLI management
 */
export class DevActionsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'replicatedActions';

    private _view?: vscode.WebviewView;
    private codeSyncEnabled: boolean = false;
    private autoLintEnabled: boolean = false;
    private cliService: CLIService;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        this.cliService = CLIService.getInstance();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Update CLI status and login status in parallel (non-blocking)
        // These are fire-and-forget - errors are handled internally
        this.updateCLIStatus().catch(err => {
            console.error('Failed to update CLI status:', err);
        });
        
        this.updateLoginStatus().catch(err => {
            console.error('Failed to update login status:', err);
        });

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'toggleCodeSync':
                    vscode.commands.executeCommand('replicated.toggleCodeSync');
                    break;
                case 'toggleAutoLint':
                    vscode.commands.executeCommand('replicated.toggleAutoLint');
                    break;
                case 'testInEnvironment':
                    if (data.environment) {
                        vscode.commands.executeCommand('replicated.testInEnvironmentDirect', data.environment);
                    } else {
                        vscode.commands.executeCommand('replicated.testInEnvironment');
                    }
                    break;
                case 'installCLI':
                    vscode.commands.executeCommand('replicated.installCLI');
                    break;
                case 'checkCLI':
                    vscode.commands.executeCommand('replicated.checkCLI');
                    break;
                case 'checkLogin':
                    this.updateLoginStatus();
                    break;
                case 'login':
                    this.handleLogin();
                    break;
                case 'logout':
                    this.handleLogout();
                    break;
                case 'openDashboard':
                    vscode.commands.executeCommand('replicated.showClusterResources');
                    break;
                case 'copyText':
                    if (data.text) {
                        vscode.env.clipboard.writeText(data.text).then(() => {
                            vscode.window.showInformationMessage(`Copied to clipboard: ${data.text}`);
                        });
                    }
                    break;
                case 'runCLICommand':
                    if (data.command) {
                        // Show checking state immediately
                        if (this._view) {
                            this._view.webview.postMessage({
                                type: 'updateCLI',
                                installed: undefined, // undefined means checking
                                version: null,
                                updateAvailable: false,
                                latestVersion: null
                            });
                        }
                        vscode.commands.executeCommand('replicated.runCLICommand', data.command);
                    }
                    break;
                case 'openExternal':
                    if (data.url) {
                        vscode.env.openExternal(vscode.Uri.parse(data.url));
                    }
                    break;
            }
        });
    }

    public setCodeSyncEnabled(enabled: boolean) {
        this.codeSyncEnabled = enabled;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateCodeSync',
                enabled
            });
        }
    }

    public setAutoLintEnabled(enabled: boolean) {
        this.autoLintEnabled = enabled;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateAutoLint',
                enabled
            });
        }
    }

    public async updateCLIStatus() {
        try {
            const status = await this.cliService.checkCLIStatus();
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateCLI',
                    installed: status.installed,
                    version: status.version,
                    updateAvailable: status.updateAvailable,
                    latestVersion: status.latestVersion
                });
            }
        } catch (error) {
            console.error('Error checking CLI status:', error);
            // Send error state to webview
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateCLI',
                    installed: false,
                    version: null,
                    updateAvailable: false,
                    latestVersion: null
                });
            }
        }
    }

    public async updateLoginStatus() {
        try {
            const status = await this.cliService.checkLoginStatus();
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateLogin',
                    loggedIn: status.loggedIn,
                    error: status.error
                });
            }
        } catch (error) {
            console.error('Error checking login status:', error);
            // Send error state to webview
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'updateLogin',
                    loggedIn: false,
                    error: 'Check failed'
                });
            }
        }
    }

    private async handleLogin() {
        const result = await this.cliService.login();
        if (result.message) {
            if (result.success) {
                vscode.window.showInformationMessage(result.message);
            } else {
                vscode.window.showErrorMessage(result.message);
            }
        }
        // Update login status after a short delay to allow login to complete
        // Use setTimeout with catch to handle any errors
        setTimeout(() => {
            this.updateLoginStatus().catch(err => {
                console.error('Failed to update login status after login:', err);
            });
        }, 3000);
    }

    private async handleLogout() {
        const result = await this.cliService.logout();
        if (result.message) {
            if (result.success) {
                vscode.window.showInformationMessage(result.message);
            } else {
                vscode.window.showErrorMessage(result.message);
            }
        }
        // Update login status immediately
        this.updateLoginStatus().catch(err => {
            console.error('Failed to update login status after logout:', err);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the path to the HTML template file
        // Try multiple possible locations to handle both development and packaged scenarios
        const possiblePaths = [
            // Packaged extension: resources folder at extension root
            path.join(this._extensionUri.fsPath, 'resources', 'devActionsView.html'),
            // Development: resources folder in src directory
            path.join(this._extensionUri.fsPath, 'src', 'resources', 'devActionsView.html'),
            // Alternative: relative to compiled output
            path.join(__dirname, '..', 'resources', 'devActionsView.html'),
        ];
        
        for (const htmlPath of possiblePaths) {
            try {
                if (fs.existsSync(htmlPath)) {
                    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
                    return htmlContent;
                }
            } catch (error) {
                // Continue to next path
                continue;
            }
        }
        
        // If all paths failed, log error and return fallback
        console.error('Failed to load HTML template from any of these paths:', possiblePaths);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error</title>
</head>
<body>
    <p>Error loading webview content. Please check the console for details.</p>
</body>
</html>`;
    }
}

