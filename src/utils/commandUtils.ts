import * as vscode from 'vscode';

/**
 * Utilities for registering and managing VS Code commands
 */

/**
 * Command registration helper
 */
export interface CommandRegistration {
    command: string;
    handler: (...args: any[]) => any;
}

/**
 * Registers multiple commands at once
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    commands: CommandRegistration[]
): void {
    for (const { command, handler } of commands) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, handler)
        );
    }
}

/**
 * Shows progress notification while executing an async task
 */
export async function withProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
    }, task);
}

/**
 * Gets the manifests folder path for the current workspace
 */
export function getManifestsPath(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        return undefined;
    }
    
    const manifestFolder = vscode.workspace.getConfiguration('replicated').get<string>('manifestsFolder', 'manifests');
    return `${workspaceFolder}/${manifestFolder}`;
}

