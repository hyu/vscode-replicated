import * as vscode from 'vscode';
import * as tar from 'tar';
import * as path from 'path';
import got, { PlainResponse } from 'got';
import { promisify } from 'node:util';
import stream from 'node:stream';
import { getDiagnosticSeverity, createDiagnostic, createDefaultDiagnostic } from '../utils/diagnosticUtils';

/**
 * Service for linting Replicated manifest files via the Replicated lint API
 */
export class LintService {
    private readonly LINT_API_URL = 'https://lint.replicated.com/v1/lint';

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

    private processlintResults(lintResults: any, diagnosticCollection: vscode.DiagnosticCollection): void {
        const fileToExpressionsMap = this.groupLintExpressionsByFile(lintResults.lintExpressions);

        for (const [filePath, expressions] of fileToExpressionsMap.entries()) {
            const diagnostics = expressions.flatMap(expr => this.createDiagnosticsFromExpression(expr));
            diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
        }
    }

    private groupLintExpressionsByFile(lintExpressions: any[]): Map<string, any[]> {
        const map = new Map<string, any[]>();
        
        for (const expression of lintExpressions) {
            const existing = map.get(expression.path) || [];
            existing.push(expression);
            map.set(expression.path, existing);
        }
        
        return map;
    }

    private createDiagnosticsFromExpression(expression: any): vscode.Diagnostic[] {
        const severity = getDiagnosticSeverity(expression.type);
        
        if (!expression.positions || !Array.isArray(expression.positions)) {
            return [createDefaultDiagnostic(expression.message, severity)];
        }
        
        return expression.positions.map((pos: any) => {
            const startLine = pos.start.line - 1;
            const startCol = pos.start.position || 0;
            const endLine = pos.end?.line ? pos.end.line - 1 : startLine;
            const endCol = pos.end?.position || Number.MAX_SAFE_INTEGER;
            
            return createDiagnostic(startLine, startCol, endLine, endCol, expression.message, severity);
        });
    }

    async lintWorkspace(diagnosticCollection: vscode.DiagnosticCollection): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }

        const manifestFolder = vscode.workspace.getConfiguration('replicated').get<string>("manifestsFolder", "manifests");
        
        const lintPromises = folders.map(folder => {
            const manifestPath = path.join(folder.uri.path, manifestFolder);
            return this.lintFolder(manifestPath, diagnosticCollection);
        });
        
        await Promise.all(lintPromises);
    }
}

