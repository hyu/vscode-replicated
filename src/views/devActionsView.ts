import * as vscode from 'vscode';
import { CLIService } from '../services/cliService';

/**
 * Webview provider for the Replicated Dev view
 * Displays development actions like testing in environments and CLI management
 */
export class DevActionsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'replicatedActions';

    private _view?: vscode.WebviewView;
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

        // Update CLI status immediately
        this.updateCLIStatus();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
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
                case 'openDashboard':
                    vscode.commands.executeCommand('replicated.showClusterResources');
                    break;
            }
        });
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
        const status = await this.cliService.checkCLIStatus();
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateCLI',
                installed: status.installed,
                version: status.version
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    padding: 16px 12px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    line-height: 1.5;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                /* Checkbox */
                .checkbox-container {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 0;
                    cursor: pointer;
                    user-select: none;
                }
                .checkbox-container:hover {
                    opacity: 0.8;
                }
                .checkbox {
                    width: 16px;
                    height: 16px;
                    border: 1px solid var(--vscode-checkbox-border);
                    background-color: var(--vscode-checkbox-background);
                    border-radius: 3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .checkbox.checked {
                    background-color: var(--vscode-checkbox-background);
                    border-color: var(--vscode-focusBorder);
                }
                .checkbox.checked::after {
                    content: '✓';
                    color: var(--vscode-checkbox-foreground);
                    font-size: 12px;
                    font-weight: bold;
                }
                
                /* Button with dropdown */
                .button-group {
                    position: relative;
                }
                .button-with-dropdown {
                    display: flex;
                    width: 100%;
                    border-radius: 2px;
                    overflow: hidden;
                    border: 1px solid transparent;
                }
                .button-with-dropdown:hover {
                    border-color: var(--vscode-button-hoverBackground);
                }
                .button-main {
                    flex: 1;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 13px;
                    font-family: var(--vscode-font-family);
                    text-align: left;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .button-main:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .button-dropdown {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-left: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 6px 8px;
                    cursor: pointer;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .button-dropdown:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .dropdown-menu {
                    display: none;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background-color: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 2px;
                    margin-top: 2px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    z-index: 1000;
                    overflow: hidden;
                }
                .dropdown-menu.show {
                    display: block;
                }
                .dropdown-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 13px;
                    background: transparent;
                    border: none;
                    color: var(--vscode-dropdown-foreground);
                    text-align: left;
                    width: 100%;
                }
                .dropdown-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                /* CLI Status */
                .cli-status {
                    margin-top: 8px;
                    padding-top: 12px;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .cli-info {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .cli-icon {
                    font-size: 14px;
                }
                .cli-action {
                    background: transparent;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    padding: 2px 4px;
                    font-size: 12px;
                    font-family: var(--vscode-font-family);
                }
                .cli-action:hover {
                    text-decoration: underline;
                    color: var(--vscode-textLink-activeForeground);
                }
                .icon-button {
                    background: transparent;
                    border: none;
                    color: var(--vscode-icon-foreground);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                }
                .icon-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                
                .spinner {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid var(--vscode-descriptionForeground);
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                /* Resources Section */
                .resources-section {
                    display: block;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                .resources-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .resources-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--vscode-foreground);
                }
                .resource-list {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .resource-item {
                    font-size: 11px;
                    font-family: var(--vscode-editor-font-family);
                    padding: 2px 0;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--vscode-descriptionForeground);
                }
                .resource-icon {
                    font-size: 10px;
                    width: 12px;
                    flex-shrink: 0;
                }
                .resource-status {
                    display: inline-block;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background-color: var(--vscode-testing-iconPassed);
                    flex-shrink: 0;
                }
                .resource-status.warning {
                    background-color: var(--vscode-editorWarning-foreground);
                }
                .resource-name {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .resource-detail {
                    font-size: 10px;
                    opacity: 0.8;
                }
                .dashboard-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 4px 10px;
                    cursor: pointer;
                    font-size: 11px;
                    font-family: var(--vscode-font-family);
                    border-radius: 2px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .dashboard-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Auto-lint checkbox -->
                <div class="checkbox-container" onclick="toggleAutoLint()">
                    <div class="checkbox" id="autoLintCheckbox"></div>
                    <span>Auto-lint on save</span>
                </div>
                
                <!-- Test in Environment button with dropdown -->
                <div class="button-group">
                    <div class="button-with-dropdown">
                        <button class="button-main" onclick="testInEnvironment()">
                            <span>🚀</span>
                            <span>Test in Environment</span>
                        </button>
                        <button class="button-dropdown" onclick="toggleDropdown()">▼</button>
                    </div>
                    <div class="dropdown-menu" id="envDropdown">
                        <button class="dropdown-item" onclick="testInEnvironment('development')">Development</button>
                        <button class="dropdown-item" onclick="testInEnvironment('staging')">Staging</button>
                        <button class="dropdown-item" onclick="testInEnvironment('production')">Production</button>
                    </div>
                </div>
                
                <!-- CLI Status -->
                <div class="cli-status">
                    <div class="cli-info">
                        <span class="cli-icon" id="cliIcon">⏳</span>
                        <span id="cliText">CLI: Checking...</span>
                    </div>
                    <button class="icon-button" id="cliAction" onclick="handleCLIAction()" title="Check for updates">
                        <span id="cliActionIcon">↻</span>
                    </button>
                </div>
                
                <!-- Resources Section -->
                <div class="resources-section" id="resourcesSection">
                    <div class="resources-header">
                        <span class="resources-title">🎲 random-linux-42</span>
                        <button class="dashboard-button" onclick="openDashboard()">
                            <span>📊</span>
                            <span>Dashboard</span>
                        </button>
                    </div>
                    <div class="resource-list">
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">📦</span>
                            <span class="resource-name">han</span>
                            <span class="resource-detail">1/1</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">📦</span>
                            <span class="resource-name">han-frontend</span>
                            <span class="resource-detail">3/3</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🔷</span>
                            <span class="resource-name">han-7c9f8d6b5-x4k2p</span>
                            <span class="resource-detail">Running</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🔷</span>
                            <span class="resource-name">han-frontend-6b8c9d7f4-m5n6q</span>
                            <span class="resource-detail">Running</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🔷</span>
                            <span class="resource-name">han-frontend-6b8c9d7f4-p9r7s</span>
                            <span class="resource-detail">Running</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status warning"></span>
                            <span class="resource-icon">🔷</span>
                            <span class="resource-name">han-frontend-6b8c9d7f4-t3v8w</span>
                            <span class="resource-detail">1 restart</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🌐</span>
                            <span class="resource-name">han</span>
                            <span class="resource-detail">ClusterIP</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🌐</span>
                            <span class="resource-name">han-frontend</span>
                            <span class="resource-detail">LoadBalancer</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">⚙️</span>
                            <span class="resource-name">han-config</span>
                            <span class="resource-detail">3 keys</span>
                        </div>
                        <div class="resource-item">
                            <span class="resource-status"></span>
                            <span class="resource-icon">🔐</span>
                            <span class="resource-name">han-support-bundle</span>
                            <span class="resource-detail">Opaque</span>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let autoLintEnabled = false;
                let cliInstalled = false;

                function toggleAutoLint() {
                    vscode.postMessage({ type: 'toggleAutoLint' });
                }

                function testInEnvironment(environment) {
                    if (environment) {
                        hideDropdown();
                    }
                    vscode.postMessage({ 
                        type: 'testInEnvironment',
                        environment: environment
                    });
                }

                function toggleDropdown() {
                    const dropdown = document.getElementById('envDropdown');
                    dropdown.classList.toggle('show');
                }

                function hideDropdown() {
                    const dropdown = document.getElementById('envDropdown');
                    dropdown.classList.remove('show');
                }

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    const dropdown = document.getElementById('envDropdown');
                    const buttonGroup = e.target.closest('.button-group');
                    if (!buttonGroup && dropdown.classList.contains('show')) {
                        hideDropdown();
                    }
                });

                function handleCLIAction() {
                    if (cliInstalled) {
                        vscode.postMessage({ type: 'checkCLI' });
                    } else {
                        vscode.postMessage({ type: 'installCLI' });
                    }
                }
                
                function openDashboard() {
                    vscode.postMessage({ type: 'openDashboard' });
                }

                // Listen for status updates from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.type === 'updateAutoLint') {
                        autoLintEnabled = message.enabled;
                        const checkbox = document.getElementById('autoLintCheckbox');
                        if (autoLintEnabled) {
                            checkbox.classList.add('checked');
                        } else {
                            checkbox.classList.remove('checked');
                        }
                    }
                    
                    if (message.type === 'updateCLI') {
                        cliInstalled = message.installed;
                        const cliIcon = document.getElementById('cliIcon');
                        const cliText = document.getElementById('cliText');
                        const cliActionIcon = document.getElementById('cliActionIcon');
                        const cliAction = document.getElementById('cliAction');
                        
                        if (message.installed) {
                            cliIcon.textContent = '✓';
                            cliIcon.style.color = 'var(--vscode-testing-iconPassed)';
                            cliText.textContent = \`CLI: \${message.version || 'installed'}\`;
                            cliActionIcon.textContent = '↻';
                            cliAction.title = 'Check for updates';
                        } else {
                            cliIcon.textContent = '⚠';
                            cliIcon.style.color = 'var(--vscode-editorWarning-foreground)';
                            cliText.textContent = 'CLI: Not installed';
                            cliActionIcon.textContent = '↓';
                            cliAction.title = 'Install CLI';
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

