import * as vscode from 'vscode';
import * as path from 'path/posix';
import { ManifestsViewProvider } from './views/manifestsView';
import { DevActionsViewProvider } from './views/devActionsView';
import { CLIService } from './services/cliService';
import { ClusterDashboardPanel } from './views/clusterDashboardView';
import { LintService } from './services/lintService';
import { registerCommands, withProgress, getManifestsPath } from './utils/commandUtils';

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('replicated');
    const cliService = CLIService.getInstance();
    const lintService = new LintService();
    let enableOnSave = false;

    // Register dev actions view
    const devActionsViewProvider = new DevActionsViewProvider(context.extensionUri);
    const registration = vscode.window.registerWebviewViewProvider(
        DevActionsViewProvider.viewType,
        devActionsViewProvider
    );
    context.subscriptions.push(registration);

    // Register manifests tree view
    const manifestsViewProvider = new ManifestsViewProvider(diagnosticCollection, context.extensionUri);
    const treeView = vscode.window.createTreeView('replicatedManifests', {
        treeDataProvider: manifestsViewProvider,
        showCollapseAll: false
    });

    // Update tree view title based on workspace name
    const updateTreeViewTitle = () => {
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name;
        if (workspaceName) {
            treeView.title = workspaceName;
        }
    };
    updateTreeViewTitle();

    context.subscriptions.push(
        treeView,
        vscode.workspace.onDidChangeWorkspaceFolders(updateTreeViewTitle)
    );

    // Initialize CLI status
    devActionsViewProvider.updateCLIStatus();

	let d1 = vscode.commands.registerCommand('replicated.lint.enable', () => {
		diagnosticCollection.clear();
		enableOnSave = true;
		devActionsViewProvider.setAutoLintEnabled(true);
		manifestsViewProvider.markLintAsRun();
		lintService.lintWorkspace(diagnosticCollection);
	});

	let d2 = vscode.commands.registerCommand('replicated.lint.disable', () => {
		diagnosticCollection.clear();
		enableOnSave = false;
		devActionsViewProvider.setAutoLintEnabled(false);
		manifestsViewProvider.refresh();
	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let d3 = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		if (enableOnSave) {
			diagnosticCollection.clear();
			manifestsViewProvider.markLintAsRun();
			lintService.lintWorkspace(diagnosticCollection);
		}
	});

	// Lint all manifests command
	let d4 = vscode.commands.registerCommand('replicated.lintAll', async () => {
		diagnosticCollection.clear();
		manifestsViewProvider.markLintAsRun();
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Linting all manifests...",
			cancellable: false
		}, async (progress) => {
			await lintService.lintWorkspace(diagnosticCollection);
		});
		vscode.window.showInformationMessage('Lint complete!');
	});

	// Refresh manifests view
	let d5 = vscode.commands.registerCommand('replicated.refreshManifests', () => {
		manifestsViewProvider.refresh();
	});

	// Open manifest file
	let d6 = vscode.commands.registerCommand('replicated.openManifest', (filePath: string) => {
		if (filePath) {
			vscode.window.showTextDocument(vscode.Uri.file(filePath));
		}
	});

	// Test in Environment command
	let d7 = vscode.commands.registerCommand('replicated.testInEnvironment', async () => {
		// Show quick pick for environment selection
		const environments = [
			{ label: 'Development', description: 'Test in development environment' },
			{ label: 'Staging', description: 'Test in staging environment' },
			{ label: 'Production', description: 'Test in production environment' }
		];

		const selected = await vscode.window.showQuickPick(environments, {
			placeHolder: 'Select an environment to test in'
		});

		if (selected) {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Testing in ${selected.label}...`,
				cancellable: false
			}, async (progress) => {
				// Simulate testing process
				await new Promise(resolve => setTimeout(resolve, 2000));
			});
			
			vscode.window.showInformationMessage(`Deployed to ${selected.label} environment successfully!`);
		}
	});

	// Lint single file
	let d8 = vscode.commands.registerCommand('replicated.lintFile', async (item: any) => {
		if (item && item.filePath) {
			diagnosticCollection.clear();
			manifestsViewProvider.markLintAsRun();
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Linting ${path.basename(item.filePath)}...`,
				cancellable: false
			}, async (progress) => {
				// Get the manifests folder path
				const manifestFolder = vscode.workspace.getConfiguration('replicated').get<string>("manifestsFolder", "manifests");
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.path;
				if (workspaceFolder) {
					const manifestPath = path.join(workspaceFolder, manifestFolder);
					await lintService.lintFolder(manifestPath, diagnosticCollection);
				}
			});
		}
	});

	// Install CLI
	let d9 = vscode.commands.registerCommand('replicated.installCLI', async () => {
		const installed = await cliService.installCLI();
		if (installed) {
			await devActionsViewProvider.updateCLIStatus();
		}
	});

	// Check CLI status
	let d10 = vscode.commands.registerCommand('replicated.checkCLI', async () => {
		cliService.clearCache();
		await devActionsViewProvider.updateCLIStatus();
		const status = await cliService.checkCLIStatus();
		
		if (status.installed) {
			vscode.window.showInformationMessage(`Replicated CLI is installed. Version: ${status.version}`);
		} else {
			vscode.window.showWarningMessage('Replicated CLI is not installed.');
		}
	});

	// Toggle code sync (Dev Mode for CMX) - Frontend demo only, no backend functionality
	let d11 = vscode.commands.registerCommand('replicated.toggleCodeSync', async () => {
		// No-op for frontend demo - just allows the toggle to work without errors
	});

	// Toggle auto-lint
	let d12 = vscode.commands.registerCommand('replicated.toggleAutoLint', async () => {
		if (enableOnSave) {
			// Disable auto-lint
			diagnosticCollection.clear();
			enableOnSave = false;
			devActionsViewProvider.setAutoLintEnabled(false);
			manifestsViewProvider.refresh();
		} else {
			// Enable auto-lint
			diagnosticCollection.clear();
			enableOnSave = true;
			devActionsViewProvider.setAutoLintEnabled(true);
			manifestsViewProvider.markLintAsRun();
			await lintService.lintWorkspace(diagnosticCollection);
		}
	});

	// Test in Environment with direct environment selection
	let d13 = vscode.commands.registerCommand('replicated.testInEnvironmentDirect', async (environment: string) => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Testing in ${environment}...`,
			cancellable: false
		}, async (progress) => {
			// Simulate testing process
			await new Promise(resolve => setTimeout(resolve, 2000));
		});
		
		vscode.window.showInformationMessage(`Deployed to ${environment} environment successfully!`);
	});
	
	// Show Cluster Resources Dashboard
	let d14 = vscode.commands.registerCommand('replicated.showClusterResources', () => {
		ClusterDashboardPanel.createOrShow(context.extensionUri);
	});

	// Open documentation URL
	let d15 = vscode.commands.registerCommand('replicated.openDocs', (item: any) => {
		if (item && item.docsUrl) {
			vscode.env.openExternal(vscode.Uri.parse(item.docsUrl));
		}
	});

	// Run CLI command in terminal
	let d16 = vscode.commands.registerCommand('replicated.runCLICommand', async (command: string) => {
		if (!command) {
			vscode.window.showErrorMessage('No command provided');
			return;
		}

		// Create or get existing terminal named "Replicated CLI"
		let terminal = vscode.window.terminals.find(t => t.name === 'Replicated CLI');
		if (!terminal) {
			terminal = vscode.window.createTerminal('Replicated CLI');
		}

		// Send the command to the terminal
		terminal.sendText(command);
		
		// Show the terminal so the user can see the output
		terminal.show();

		// Wait a bit for the command to complete, then check CLI status again
		setTimeout(async () => {
			// Clear cache to force fresh check
			cliService.clearCache();
			
			// Re-check CLI status and update the view
			await devActionsViewProvider.updateCLIStatus();
			
			// Get the updated status to show a message
			const status = await cliService.checkCLIStatus();
			if (status.installed) {
				vscode.window.showInformationMessage(
					`Replicated CLI check complete. Version: ${status.version}${status.updateAvailable ? ` (Update available: ${status.latestVersion})` : ''}`,
					'Check Again'
				).then(selection => {
					if (selection === 'Check Again') {
						cliService.clearCache();
						devActionsViewProvider.updateCLIStatus();
					}
				});
			} else {
				vscode.window.showWarningMessage(
					'Replicated CLI not found. Please check the terminal output.',
					'Check Again'
				).then(selection => {
					if (selection === 'Check Again') {
						cliService.clearCache();
						devActionsViewProvider.updateCLIStatus();
					}
				});
			}
		}, 5000); // Wait 5 seconds for brew commands to complete
	});

	context.subscriptions.push(d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11, d12, d13, d14, d15, d16);
}

export function deactivate() {}
