/**
 * Common types and interfaces used across the extension
 */

export interface CLIStatus {
    installed: boolean;
    version?: string;
    error?: string;
}

export interface LintStatus {
    errors: number;
    warnings: number;
    info: number;
    hasIssues: boolean;
}

export interface ManifestInfo {
    kind?: string;
    apiVersion?: string;
}

