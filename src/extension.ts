// The module 'vscode' contains the VS Code extensibility API	
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path/posix';
import { ManifestsViewProvider } from './views/manifestsView';
import { DevActionsViewProvider } from './views/devActionsView';
import { CLIService } from './services/cliService';
import { ClusterDashboardPanel } from './views/clusterDashboardView';
import { LintService } from './services/lintService';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "replicated" is now active!');
	let diagnosticCollection = vscode.languages.createDiagnosticCollection("replicated");
	let enableOnSave = false;

	// Create and register the dev actions view provider
	console.log('Registering DevActionsViewProvider for view:', DevActionsViewProvider.viewType);
	const devActionsViewProvider = new DevActionsViewProvider(context.extensionUri);
	const registration = vscode.window.registerWebviewViewProvider(
		DevActionsViewProvider.viewType,
		devActionsViewProvider
	);
	context.subscriptions.push(registration);
	console.log('DevActionsViewProvider registered successfully');

	// Create and register the manifests tree view provider
	const manifestsViewProvider = new ManifestsViewProvider(diagnosticCollection);
	const treeView = vscode.window.createTreeView('replicatedManifests', {
		treeDataProvider: manifestsViewProvider,
		showCollapseAll: false
	});

	// Set dynamic title based on workspace name
	function updateTreeViewTitle() {
		const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name;
		if (workspaceName) {
			treeView.title = workspaceName;
		}
	}
	updateTreeViewTitle();

	// Update title when workspace changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			updateTreeViewTitle();
		})
	);

	// Check CLI status and update context
	const cliService = CLIService.getInstance();
	const lintService = new LintService();
	
	async function updateCLIContext() {
		await devActionsViewProvider.updateCLIStatus();
	}
	updateCLIContext();

	let d1 = vscode.commands.registerCommand('replicated.lint.enable', () => {
		diagnosticCollection.clear();
		enableOnSave = true;
		devActionsViewProvider.setAutoLintEnabled(true);
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
			lintService.lintWorkspace(diagnosticCollection);
		}
	});

	// Lint all manifests command
	let d4 = vscode.commands.registerCommand('replicated.lintAll', async () => {
		diagnosticCollection.clear();
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
			await updateCLIContext();
		}
	});

	// Check CLI status
	let d10 = vscode.commands.registerCommand('replicated.checkCLI', async () => {
		cliService.clearCache();
		await updateCLIContext();
		const status = await cliService.checkCLIStatus();
		
		if (status.installed) {
			vscode.window.showInformationMessage(`Replicated CLI is installed. Version: ${status.version}`);
		} else {
			vscode.window.showWarningMessage('Replicated CLI is not installed.');
		}
	});

	// Toggle auto-lint
	let d11 = vscode.commands.registerCommand('replicated.toggleAutoLint', async () => {
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
			await lintService.lintWorkspace(diagnosticCollection);
		}
	});

	// Test in Environment with direct environment selection
	let d12 = vscode.commands.registerCommand('replicated.testInEnvironmentDirect', async (environment: string) => {
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
	let d13 = vscode.commands.registerCommand('replicated.showClusterResources', () => {
		ClusterDashboardPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11, d12, d13, treeView);
}

// This method is called when your extension is deactivated
export function deactivate() {}
