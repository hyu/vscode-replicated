/**
 * Shared utilities for webview HTML generation
 */

/**
 * Generates common CSS styles used across webviews
 */
export function getCommonWebviewStyles(): string {
    return `
        body {
            padding: 16px 12px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            line-height: 1.5;
            margin: 0;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        /* Status badges */
        .status-badge {
            padding: 3px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
        }
        
        .status-running,
        .status-active {
            background-color: rgba(0, 200, 83, 0.2);
            color: #00c853;
        }
        
        .status-ready {
            background-color: rgba(0, 122, 204, 0.2);
            color: #007acc;
        }
        
        /* Resource cards */
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
        
        .namespace-tag {
            display: inline-block;
            padding: 2px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
        }
    `;
}

/**
 * Generates button styles for webviews
 */
export function getButtonStyles(): string {
    return `
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
    `;
}

/**
 * Generates section header HTML
 */
export function getSectionHeader(icon: string, title: string): string {
    return `
        <div class="section-title">
            <span class="section-title-icon">${icon}</span>
            ${title}
        </div>
    `;
}

/**
 * Resource types for mock data generation
 */
export interface ResourceData {
    deployments: Deployment[];
    pods: Pod[];
    services: Service[];
    configMaps: ConfigMap[];
    secrets: Secret[];
}

export interface Deployment {
    name: string;
    namespace: string;
    replicas: number;
    image: string;
    age: string;
}

export interface Pod {
    name: string;
    namespace: string;
    node: string;
    ip: string;
    restarts: number;
    age: string;
}

export interface Service {
    name: string;
    namespace: string;
    type: string;
    clusterIP: string;
    port: string;
    age: string;
}

export interface ConfigMap {
    name: string;
    namespace: string;
    keys: string;
    age: string;
}

export interface Secret {
    name: string;
    namespace: string;
    type: string;
    keys: string;
    age: string;
}

/**
 * Generates replica indicator HTML
 */
export function getReplicaIndicator(replicas: number): string {
    return `
        <span class="replica-indicator">
            ${Array(replicas).fill(0).map(() => '<span class="replica-dot"></span>').join('')}
            <span>${replicas}/${replicas}</span>
        </span>
    `;
}

