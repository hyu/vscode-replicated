import * as vscode from 'vscode';

/**
 * Webview panel for displaying cluster resources dashboard
 * Shows deployments, pods, services, configmaps, and secrets
 */
export class ClusterDashboardPanel {
    public static currentPanel: ClusterDashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlContent();
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ClusterDashboardPanel.currentPanel) {
            ClusterDashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'clusterResources',
            'Cluster: random-linux-42',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        ClusterDashboardPanel.currentPanel = new ClusterDashboardPanel(panel, extensionUri);
    }

    public dispose() {
        ClusterDashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlContent(): string {
        // Generate mock data based on the manifests
        const mockResources = this._generateMockResources();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cluster Resources</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }

        .cluster-header {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .cluster-name {
            font-size: 24px;
            font-weight: 600;
            margin-right: 15px;
        }

        .cluster-status {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }

        .cluster-status::before {
            content: "●";
            margin-right: 6px;
        }

        .section {
            margin-bottom: 30px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
        }

        .section-title-icon {
            margin-right: 8px;
        }

        .resource-grid {
            display: grid;
            gap: 12px;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }

        .resource-card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
            transition: all 0.2s ease;
        }

        .resource-card:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .resource-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }

        .resource-name {
            font-weight: 600;
            font-size: 14px;
        }

        .resource-type {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-badge {
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
        }

        .status-running {
            background-color: rgba(0, 200, 83, 0.2);
            color: #00c853;
        }

        .status-ready {
            background-color: rgba(0, 122, 204, 0.2);
            color: #007acc;
        }

        .status-active {
            background-color: rgba(0, 200, 83, 0.2);
            color: #00c853;
        }

        .resource-details {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .resource-detail {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .detail-label {
            font-weight: 500;
        }

        .detail-value {
            color: var(--vscode-foreground);
            font-family: var(--vscode-editor-font-family);
        }

        .replica-indicator {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .replica-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #00c853;
        }

        .summary-stats {
            display: flex;
            gap: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin-bottom: 20px;
        }

        .stat {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .namespace-tag {
            display: inline-block;
            padding: 2px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
        }

        .resource-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    </style>
</head>
<body>
    <div class="cluster-header">
        <div class="cluster-name">🎲 random-linux-42</div>
        <div class="cluster-status">Healthy</div>
    </div>

    <div class="summary-stats">
        <div class="stat">
            <div class="stat-value">${mockResources.deployments.length}</div>
            <div class="stat-label">Deployments</div>
        </div>
        <div class="stat">
            <div class="stat-value">${mockResources.pods.length}</div>
            <div class="stat-label">Pods</div>
        </div>
        <div class="stat">
            <div class="stat-value">${mockResources.services.length}</div>
            <div class="stat-label">Services</div>
        </div>
        <div class="stat">
            <div class="stat-value">${mockResources.configMaps.length}</div>
            <div class="stat-label">ConfigMaps</div>
        </div>
    </div>

    <!-- Deployments Section -->
    <div class="section">
        <div class="section-title">
            <span class="section-title-icon">📦</span>
            Deployments
        </div>
        <div class="resource-grid">
            ${mockResources.deployments.map(dep => `
                <div class="resource-card">
                    <div class="resource-header">
                        <div>
                            <div class="resource-name">${dep.name}</div>
                            <div class="resource-type">Deployment</div>
                        </div>
                        <div class="status-badge status-ready">Ready</div>
                    </div>
                    <div class="resource-details">
                        <div class="resource-detail">
                            <span class="detail-label">Namespace:</span>
                            <span class="namespace-tag">${dep.namespace}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Replicas:</span>
                            <span class="detail-value">
                                <span class="replica-indicator">
                                    ${Array(dep.replicas).fill(0).map(() => '<span class="replica-dot"></span>').join('')}
                                    <span>${dep.replicas}/${dep.replicas}</span>
                                </span>
                            </span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Image:</span>
                            <span class="detail-value">${dep.image}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Age:</span>
                            <span class="detail-value">${dep.age}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <!-- Pods Section -->
    <div class="section">
        <div class="section-title">
            <span class="section-title-icon">🔷</span>
            Pods
        </div>
        <div class="resource-grid">
            ${mockResources.pods.map(pod => `
                <div class="resource-card">
                    <div class="resource-header">
                        <div>
                            <div class="resource-name">${pod.name}</div>
                            <div class="resource-type">Pod</div>
                        </div>
                        <div class="status-badge status-running">Running</div>
                    </div>
                    <div class="resource-details">
                        <div class="resource-detail">
                            <span class="detail-label">Namespace:</span>
                            <span class="namespace-tag">${pod.namespace}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Node:</span>
                            <span class="detail-value">${pod.node}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">IP:</span>
                            <span class="detail-value">${pod.ip}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Restarts:</span>
                            <span class="detail-value">${pod.restarts}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Age:</span>
                            <span class="detail-value">${pod.age}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <!-- Services Section -->
    <div class="section">
        <div class="section-title">
            <span class="section-title-icon">🌐</span>
            Services
        </div>
        <div class="resource-grid">
            ${mockResources.services.map(svc => `
                <div class="resource-card">
                    <div class="resource-header">
                        <div>
                            <div class="resource-name">${svc.name}</div>
                            <div class="resource-type">Service</div>
                        </div>
                        <div class="status-badge status-active">Active</div>
                    </div>
                    <div class="resource-details">
                        <div class="resource-detail">
                            <span class="detail-label">Namespace:</span>
                            <span class="namespace-tag">${svc.namespace}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Type:</span>
                            <span class="detail-value">${svc.type}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Cluster IP:</span>
                            <span class="detail-value">${svc.clusterIP}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Port:</span>
                            <span class="detail-value">${svc.port}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Age:</span>
                            <span class="detail-value">${svc.age}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <!-- ConfigMaps Section -->
    <div class="section">
        <div class="section-title">
            <span class="section-title-icon">⚙️</span>
            ConfigMaps
        </div>
        <div class="resource-list">
            ${mockResources.configMaps.map(cm => `
                <div class="resource-card">
                    <div class="resource-header">
                        <div>
                            <div class="resource-name">${cm.name}</div>
                            <div class="resource-type">ConfigMap</div>
                        </div>
                    </div>
                    <div class="resource-details">
                        <div class="resource-detail">
                            <span class="detail-label">Namespace:</span>
                            <span class="namespace-tag">${cm.namespace}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Data Keys:</span>
                            <span class="detail-value">${cm.keys}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Age:</span>
                            <span class="detail-value">${cm.age}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

    <!-- Secrets Section -->
    <div class="section">
        <div class="section-title">
            <span class="section-title-icon">🔐</span>
            Secrets
        </div>
        <div class="resource-list">
            ${mockResources.secrets.map(secret => `
                <div class="resource-card">
                    <div class="resource-header">
                        <div>
                            <div class="resource-name">${secret.name}</div>
                            <div class="resource-type">Secret</div>
                        </div>
                    </div>
                    <div class="resource-details">
                        <div class="resource-detail">
                            <span class="detail-label">Namespace:</span>
                            <span class="namespace-tag">${secret.namespace}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Type:</span>
                            <span class="detail-value">${secret.type}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Data Keys:</span>
                            <span class="detail-value">${secret.keys}</span>
                        </div>
                        <div class="resource-detail">
                            <span class="detail-label">Age:</span>
                            <span class="detail-value">${secret.age}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>

</body>
</html>`;
    }

    private _generateMockResources() {
        return {
            deployments: [
                {
                    name: 'han',
                    namespace: 'default',
                    replicas: 1,
                    image: 'han-website:1.0.0',
                    age: '2d'
                },
                {
                    name: 'han-frontend',
                    namespace: 'default',
                    replicas: 3,
                    image: 'node:18-alpine',
                    age: '2d'
                }
            ],
            pods: [
                {
                    name: 'han-7c9f8d6b5-x4k2p',
                    namespace: 'default',
                    node: 'controller-node-1',
                    ip: '10.244.0.15',
                    restarts: 0,
                    age: '2d'
                },
                {
                    name: 'han-frontend-6b8c9d7f4-m5n6q',
                    namespace: 'default',
                    node: 'worker-node-1',
                    ip: '10.244.1.23',
                    restarts: 0,
                    age: '2d'
                },
                {
                    name: 'han-frontend-6b8c9d7f4-p9r7s',
                    namespace: 'default',
                    node: 'worker-node-2',
                    ip: '10.244.2.18',
                    restarts: 0,
                    age: '2d'
                },
                {
                    name: 'han-frontend-6b8c9d7f4-t3v8w',
                    namespace: 'default',
                    node: 'worker-node-1',
                    ip: '10.244.1.24',
                    restarts: 1,
                    age: '2d'
                }
            ],
            services: [
                {
                    name: 'han',
                    namespace: 'default',
                    type: 'ClusterIP',
                    clusterIP: '10.96.45.123',
                    port: '80/TCP',
                    age: '2d'
                },
                {
                    name: 'han-frontend',
                    namespace: 'default',
                    type: 'LoadBalancer',
                    clusterIP: '10.96.45.124',
                    port: '80/TCP',
                    age: '2d'
                }
            ],
            configMaps: [
                {
                    name: 'han-config',
                    namespace: 'default',
                    keys: 'app_title, app_description, environment',
                    age: '2d'
                },
                {
                    name: 'han-deployment-config',
                    namespace: 'default',
                    keys: 'replica_count, image_repository, image_tag',
                    age: '2d'
                },
                {
                    name: 'han-network-config',
                    namespace: 'default',
                    keys: 'service_type, ingress_enabled, ingress_hostname',
                    age: '2d'
                }
            ],
            secrets: [
                {
                    name: 'han-support-bundle',
                    namespace: 'default',
                    type: 'Opaque',
                    keys: 'support-bundle-spec',
                    age: '2d'
                },
                {
                    name: 'han-registry-credentials',
                    namespace: 'default',
                    type: 'kubernetes.io/dockerconfigjson',
                    keys: '.dockerconfigjson',
                    age: '2d'
                }
            ]
        };
    }
}

