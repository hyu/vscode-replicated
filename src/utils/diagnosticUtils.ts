import * as vscode from 'vscode';

/**
 * Maps lint expression type to VSCode diagnostic severity
 */
export function getDiagnosticSeverity(lintType: string): vscode.DiagnosticSeverity {
    switch (lintType) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'info':
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

/**
 * Creates a diagnostic from lint expression data
 */
export function createDiagnostic(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    message: string,
    severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
    const range = new vscode.Range(
        new vscode.Position(startLine, startCol),
        new vscode.Position(endLine, endCol)
    );
    
    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = 'Replicated';
    return diagnostic;
}

/**
 * Creates a default diagnostic at line 0 when position info is missing
 */
export function createDefaultDiagnostic(message: string, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
    return createDiagnostic(0, 0, 0, Number.MAX_SAFE_INTEGER, message, severity);
}

