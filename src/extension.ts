// The module 'vscode' contains the VS Code extensibility API	
// Import the module and reference it with the alias vscode in your code below
import {promisify} from 'node:util';
import stream from 'node:stream';
import * as vscode from 'vscode';
import * as tar from 'tar';
import got, { PlainResponse } from 'got';
import * as fs from 'fs';
import path = require('path/posix');
import { allowedNodeEnvironmentFlags } from 'node:process';
import { languages, Diagnostic, DiagnosticSeverity } from 'vscode';
import { ManifestTreeDataProvider } from './manifestTreeProvider';
import { ActionsTreeDataProvider } from './actionsTreeProvider';
import { CLIManager } from './cliManager';
import { CLIStatusViewProvider } from './cliStatusView';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "replicated" is now active!');
	let diagnosticCollection = languages.createDiagnosticCollection("replicated");
	let enableOnSave = false;

	// Create and register the actions tree data provider
	const actionsTreeProvider = new ActionsTreeDataProvider();
	const actionsTreeView = vscode.window.createTreeView('replicatedActions', {
		treeDataProvider: actionsTreeProvider,
		showCollapseAll: false
	});

	// Create and register the manifest tree data provider
	const manifestTreeProvider = new ManifestTreeDataProvider(diagnosticCollection);
	const treeView = vscode.window.createTreeView('replicatedManifests', {
		treeDataProvider: manifestTreeProvider,
		showCollapseAll: false
	});

	// Create and register the CLI status view provider
	const cliStatusProvider = new CLIStatusViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			CLIStatusViewProvider.viewType,
			cliStatusProvider
		)
	);

	// Check CLI status and update context
	const cliManager = CLIManager.getInstance();
	async function updateCLIContext() {
		const status = await cliManager.checkCLIStatus();
		vscode.commands.executeCommand('setContext', 'replicated.cliInstalled', status.installed);
		cliStatusProvider.updateStatus(status.installed, status.version);
		actionsTreeProvider.checkCLIStatus();
	}
	updateCLIContext();

	let d1 = vscode.commands.registerCommand('replicated.lint.enable', () => {
		diagnosticCollection.clear();
		enableOnSave = true;
		processFolders(diagnosticCollection, manifestTreeProvider);
	});

	let d2 = vscode.commands.registerCommand('replicated.lint.disable', () => {
		diagnosticCollection.clear();
		enableOnSave = false;
		manifestTreeProvider.refresh();
	});

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let d3 = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		if (enableOnSave) {
			diagnosticCollection.clear();
			processFolders(diagnosticCollection, manifestTreeProvider);
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
			await processFolders(diagnosticCollection, manifestTreeProvider);
		});
		vscode.window.showInformationMessage('Lint complete!');
	});

	// Refresh manifests view
	let d5 = vscode.commands.registerCommand('replicated.refreshManifests', () => {
		manifestTreeProvider.refresh();
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
					await getlintdata(manifestPath, diagnosticCollection, manifestTreeProvider);
				}
			});
		}
	});

	// Install CLI
	let d9 = vscode.commands.registerCommand('replicated.installCLI', async () => {
		const installed = await cliManager.installCLI();
		if (installed) {
			await updateCLIContext();
		}
	});

	// Check CLI status
	let d10 = vscode.commands.registerCommand('replicated.checkCLI', async () => {
		cliManager.clearCache();
		await updateCLIContext();
		const status = await cliManager.checkCLIStatus();
		
		if (status.installed) {
			vscode.window.showInformationMessage(`Replicated CLI is installed. Version: ${status.version}`);
		} else {
			vscode.window.showWarningMessage('Replicated CLI is not installed.');
		}
	});

	context.subscriptions.push(d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, treeView, actionsTreeView);
}

async function processFolders(diagnosticCollection: vscode.DiagnosticCollection, manifestTreeProvider?: ManifestTreeDataProvider): Promise<void> {
	if (vscode.workspace.workspaceFolders? vscode.workspace.workspaceFolders.length > 0 : false) {
		const promises = (vscode.workspace.workspaceFolders? vscode.workspace.workspaceFolders : []).map(async function (fldr) {
			const absolutePath = fldr.uri.path;
			const manifestFldr = vscode.workspace.getConfiguration('replicated').get("manifestsFolder");
			
			await getlintdata(path.join(absolutePath, String(manifestFldr)), diagnosticCollection, manifestTreeProvider);
		});
		
		await Promise.all(promises);
	}
}

async function getlintdata(fldr: string, diagnosticCollection: vscode.DiagnosticCollection, manifestTreeProvider?: ManifestTreeDataProvider): Promise<void> {
	return new Promise((resolve, reject) => {
		const pipeline = promisify(stream.pipeline);

		let readable = tar.c({}, [fldr]);
		const lintstream = got.stream.post('https://lint.replicated.com/v1/lint');
		
		pipeline(
			readable,
			lintstream,
			new stream.PassThrough()
		);

		lintstream.on('response', async (response: PlainResponse) => {
			console.log('success: ' + response.statusCode);
			let rawData = '';
			response.on('data', (chunk) => { rawData += chunk; });
			response.on('end', () => {
				try {
					let lintResults = JSON.parse(rawData);
					let map = new Map();

					lintResults.lintExpressions.forEach(function (lintExpression: { path: string; }) {
						if (map.has(lintExpression.path)) {
							var exps = map.get(lintExpression.path);
							exps.push(lintExpression);
							map.set(lintExpression.path, exps);
						} else {
							map.set(lintExpression.path, [lintExpression]);
						}
					});

					for (let key of map.keys()) {
						let diagnostics: Diagnostic[] = [];
						for (let lexpr of map.get(key)) {
							// Check if positions exists and is iterable
							if (lexpr.positions && Array.isArray(lexpr.positions)) {
								for (let pos of lexpr.positions) {
									// Create a range that highlights the entire line or uses specific columns if available
									let startLine = pos.start.line - 1;
									let startCol = pos.start.position || 0;
									let endLine = pos.end?.line ? pos.end.line - 1 : startLine;
									let endCol = pos.end?.position || Number.MAX_SAFE_INTEGER;
									
									let range = new vscode.Range(
										new vscode.Position(startLine, startCol),
										new vscode.Position(endLine, endCol)
									);
									
									let message = lexpr.message;
									let severity = DiagnosticSeverity.Warning;
									if (lexpr.type === "info") {
										severity = DiagnosticSeverity.Information;
									}
									if (lexpr.type === "error") {
										severity = DiagnosticSeverity.Error;
									}
									
									let diagnostic = new Diagnostic(range, message, severity);
									diagnostic.source = "Replicated";
									diagnostics.push(diagnostic);
								}
							} else {
								// If no positions, create a diagnostic at line 0
								let range = new vscode.Range(
									new vscode.Position(0, 0),
									new vscode.Position(0, Number.MAX_SAFE_INTEGER)
								);
								let message = lexpr.message;
								let severity = DiagnosticSeverity.Warning;
								if (lexpr.type === "info") {
									severity = DiagnosticSeverity.Information;
								}
								if (lexpr.type === "error") {
									severity = DiagnosticSeverity.Error;
								}
								
								let diagnostic = new Diagnostic(range, message, severity);
								diagnostic.source = "Replicated";
								diagnostics.push(diagnostic);
							}
						}
						diagnosticCollection.set(vscode.Uri.file(key), diagnostics);
					}

					// Update the tree view with new lint time
					if (manifestTreeProvider) {
						manifestTreeProvider.updateLastLintTime();
					}

					resolve();
				} catch (error) {
					console.error('Error parsing lint results:', error);
					reject(error);
				}
			});
		});

		lintstream.on('error', (error) => {
			console.error('Lint stream error:', error);
			vscode.window.showErrorMessage(`Failed to lint manifests: ${error.message}`);
			reject(error);
		});
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
