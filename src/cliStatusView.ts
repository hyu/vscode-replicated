import * as vscode from 'vscode';

export class CLIStatusViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'replicatedCLIStatus';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

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

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'installCLI':
                    vscode.commands.executeCommand('replicated.installCLI');
                    break;
                case 'checkCLI':
                    vscode.commands.executeCommand('replicated.checkCLI');
                    break;
            }
        });
    }

    public updateStatus(installed: boolean, version?: string) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateStatus',
                installed,
                version
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
                    padding: 12px;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .icon {
                    font-size: 48px;
                    text-align: center;
                    margin-bottom: 8px;
                }
                h3 {
                    margin: 0 0 8px 0;
                    font-weight: 600;
                }
                p {
                    margin: 0 0 12px 0;
                    line-height: 1.5;
                    color: var(--vscode-descriptionForeground);
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 13px;
                    font-family: var(--vscode-font-family);
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .button:active {
                    opacity: 0.8;
                }
                .secondary-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                .secondary-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .status-good {
                    color: var(--vscode-testing-iconPassed);
                }
                .status-warning {
                    color: var(--vscode-editorWarning-foreground);
                }
                .button-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                code {
                    font-family: var(--vscode-editor-font-family);
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 2px 4px;
                    border-radius: 2px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon status-warning">⚠️</div>
                <h3>Replicated CLI Not Installed</h3>
                <p>
                    The Replicated CLI is required for local linting and advanced features.
                    Install it to get started.
                </p>
                <div class="button-group">
                    <button class="button" onclick="installCLI()">
                        Install Replicated CLI
                    </button>
                    <button class="button secondary-button" onclick="checkCLI()">
                        I Already Installed It
                    </button>
                </div>
                <p style="font-size: 12px; margin-top: 8px;">
                    Or install via command line:<br>
                    <code>brew install replicatedhq/replicated/cli</code>
                </p>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function installCLI() {
                    vscode.postMessage({ type: 'installCLI' });
                }

                function checkCLI() {
                    vscode.postMessage({ type: 'checkCLI' });
                }

                // Listen for status updates from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateStatus') {
                        if (message.installed) {
                            // CLI is now installed, the view should hide itself
                            document.body.innerHTML = \`
                                <div class="container">
                                    <div class="icon status-good">✓</div>
                                    <h3>CLI Installed Successfully!</h3>
                                    <p>Version: \${message.version || 'Unknown'}</p>
                                </div>
                            \`;
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}

