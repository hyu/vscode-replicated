import * as vscode from 'vscode';
import * as tar from 'tar';
import * as path from 'path';
import got, { PlainResponse } from 'got';
import { promisify } from 'node:util';
import stream from 'node:stream';

/**
 * Service for linting Replicated manifest files
 * Sends manifests to Replicated's lint API and processes results
 */
export class LintService {
    private readonly LINT_API_URL = 'https://lint.replicated.com/v1/lint';

    /**
     * Lint all manifests in a folder
     */
    async lintFolder(folderPath: string, diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
        return new Promise((resolve, reject) => {
            const pipeline = promisify(stream.pipeline);

            let readable = tar.c({}, [folderPath]);
            const lintstream = got.stream.post(this.LINT_API_URL);
            
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
                        this.processlintResults(lintResults, diagnosticCollection);
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

    /**
     * Process lint results and update diagnostics
     */
    private processlintResults(lintResults: any, diagnosticCollection: vscode.DiagnosticCollection): void {
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
            let diagnostics: vscode.Diagnostic[] = [];
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
                        let severity = vscode.DiagnosticSeverity.Warning;
                        if (lexpr.type === "info") {
                            severity = vscode.DiagnosticSeverity.Information;
                        }
                        if (lexpr.type === "error") {
                            severity = vscode.DiagnosticSeverity.Error;
                        }
                        
                        let diagnostic = new vscode.Diagnostic(range, message, severity);
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
                    let severity = vscode.DiagnosticSeverity.Warning;
                    if (lexpr.type === "info") {
                        severity = vscode.DiagnosticSeverity.Information;
                    }
                    if (lexpr.type === "error") {
                        severity = vscode.DiagnosticSeverity.Error;
                    }
                    
                    let diagnostic = new vscode.Diagnostic(range, message, severity);
                    diagnostic.source = "Replicated";
                    diagnostics.push(diagnostic);
                }
            }
            diagnosticCollection.set(vscode.Uri.file(key), diagnostics);
        }
    }

    /**
     * Lint all manifests in workspace folders
     */
    async lintWorkspace(diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const promises = vscode.workspace.workspaceFolders.map(async function (folder) {
                const absolutePath = folder.uri.path;
                const manifestFolder = vscode.workspace.getConfiguration('replicated').get("manifestsFolder");
                const manifestPath = path.join(absolutePath, String(manifestFolder));
                
                return new LintService().lintFolder(manifestPath, diagnosticCollection);
            });
            
            await Promise.all(promises);
        }
    }
}

