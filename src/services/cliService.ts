import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CLIStatus } from '../models/types';

const execAsync = promisify(exec);

/**
 * Service for managing Replicated CLI installation and status
 * Singleton pattern to share state across the extension
 */
export class CLIService {
    private static instance: CLIService;
    private cachedStatus?: CLIStatus;
    private lastCheck?: number;
    private readonly cacheDuration = 30000; // 30 seconds

    private constructor() {}

    public static getInstance(): CLIService {
        if (!CLIService.instance) {
            CLIService.instance = new CLIService();
        }
        return CLIService.instance;
    }

    public async checkCLIStatus(): Promise<CLIStatus> {
        // Return cached status if recent
        const now = Date.now();
        if (this.cachedStatus && this.lastCheck && (now - this.lastCheck) < this.cacheDuration) {
            return this.cachedStatus;
        }

        try {
            // Add timeout to prevent hanging - replicated version should be fast
            const { stdout } = await execAsync('replicated version', { timeout: 5000 });
            const output = stdout.trim();
            
            // Parse the output from "replicated version" command
            const versionMatch = output.match(/replicated version\s+([\d.]+)/i);
            const updateMatch = output.match(/Update available:\s*(v?[\d.]+)/i);
            
            const version = versionMatch ? versionMatch[1] : output;
            const updateAvailable = !!updateMatch;
            const latestVersion = updateMatch ? updateMatch[1] : undefined;
            
            this.cachedStatus = {
                installed: true,
                version: version,
                updateAvailable: updateAvailable,
                latestVersion: latestVersion
            };
        } catch (error: any) {
            this.cachedStatus = {
                installed: false,
                error: error.message
            };
        }

        this.lastCheck = now;
        return this.cachedStatus;
    }

    public clearCache(): void {
        this.cachedStatus = undefined;
        this.lastCheck = undefined;
    }

    private async getLatestVersionFromBrew(): Promise<string | undefined> {
        try {
            // Get latest version info from brew
            const { stdout } = await execAsync('brew info replicatedhq/replicated/cli --json', { timeout: 5000 });
            const info = JSON.parse(stdout);
            
            if (info && Array.isArray(info) && info.length > 0) {
                const formula = info[0];
                // Try different possible version fields
                if (formula.versions?.stable) {
                    return formula.versions.stable;
                }
                if (formula.versions && typeof formula.versions === 'object') {
                    // Get first version value if versions is an object
                    const versionValues = Object.values(formula.versions);
                    if (versionValues.length > 0 && typeof versionValues[0] === 'string') {
                        return versionValues[0] as string;
                    }
                }
                if (formula.version) {
                    return formula.version;
                }
            }
            return undefined;
        } catch (error) {
            // If brew check fails, return undefined
            return undefined;
        }
    }

    public async checkLoginStatus(): Promise<{ loggedIn: boolean; error?: string }> {
        try {
            // First check if CLI is installed by checking version (should be cached)
            const cliStatus = await this.checkCLIStatus();
            if (!cliStatus.installed) {
                return { loggedIn: false, error: 'CLI not installed' };
            }

            // Try to run 'replicated login' command with short timeout
            // If already logged in, it will error with "already credentials" message
            // If not logged in, it will try to open browser (which we'll catch with timeout)
            const { stdout, stderr } = await execAsync('replicated login', { timeout: 1500 });
            const output = (stdout + stderr).toLowerCase();
            
            // If we see "already credentials" or "already logged in", user is logged in
            if (output.includes('already credentials') || output.includes('already logged in')) {
                return { loggedIn: true };
            }
            
            // If we get here without error, assume not logged in
            return { loggedIn: false };
        } catch (error: any) {
            const errorMessage = error.message.toLowerCase();
            
            // Check if error message indicates already logged in
            if (errorMessage.includes('already credentials') || errorMessage.includes('already logged in')) {
                return { loggedIn: true };
            }
            
            // Check if CLI is not installed
            if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
                return { loggedIn: false, error: 'CLI not installed' };
            }
            
            // Timeout or other errors might mean we tried to open browser (not logged in)
            // or the command is hanging - either way, assume not logged in
            if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
                return { loggedIn: false };
            }
            
            // For any other error, assume not logged in
            return { loggedIn: false };
        }
    }

    public async login(): Promise<{ success: boolean; message?: string }> {
        try {
            // Check if already logged in first
            const status = await this.checkLoginStatus();
            if (status.loggedIn) {
                return { success: true, message: 'Already logged in' };
            }

            // Run login command in terminal so user can see the process
            const terminal = vscode.window.createTerminal('Replicated Login');
            terminal.show();
            terminal.sendText('replicated login');
            
            return { success: true, message: 'Login initiated. Please complete authentication in your browser.' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }

    public async logout(): Promise<{ success: boolean; message?: string }> {
        try {
            await execAsync('replicated logout');
            return { success: true, message: 'Logged out successfully' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }

    public async installCLI(): Promise<boolean> {
        try {
            // Open installation instructions URL
            const installUrl = 'https://docs.replicated.com/reference/replicated-cli-installing';
            await vscode.env.openExternal(vscode.Uri.parse(installUrl));
            
            // Show info message
            const result = await vscode.window.showInformationMessage(
                'Opening CLI installation instructions. Click "Check Again" after installation.',
                'Check Again',
                'Cancel'
            );

            if (result === 'Check Again') {
                this.clearCache();
                const status = await this.checkCLIStatus();
                if (status.installed) {
                    // Just display the installed version
                    vscode.window.showInformationMessage(`Replicated CLI: ${status.version}`);
                    return true;
                } else {
                    // Get latest version from brew if available
                    const latestVersion = await this.getLatestVersionFromBrew();
                    const message = latestVersion 
                        ? `Replicated CLI not found. Latest version: ${latestVersion}`
                        : 'Replicated CLI not found. Please complete the installation.';
                    const installAction = latestVersion 
                        ? `Install ${latestVersion}`
                        : 'Install';
                    
                    const action = await vscode.window.showWarningMessage(
                        message,
                        installAction,
                        'Cancel'
                    );
                    
                    if (action === installAction) {
                        // Open installation instructions again
                        await vscode.env.openExternal(vscode.Uri.parse(installUrl));
                    }
                    return false;
                }
            }
            
            return false;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to open installation instructions: ${error.message}`);
            return false;
        }
    }
}

