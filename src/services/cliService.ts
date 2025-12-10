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
    private readonly CACHE_DURATION = 30000; // 30 seconds

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
        if (this.cachedStatus && this.lastCheck && (now - this.lastCheck) < this.CACHE_DURATION) {
            return this.cachedStatus;
        }

        try {
            const { stdout } = await execAsync('replicated version');
            const version = stdout.trim();
            
            this.cachedStatus = {
                installed: true,
                version: version
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
                    vscode.window.showInformationMessage(`Replicated CLI installed successfully! Version: ${status.version}`);
                    return true;
                } else {
                    vscode.window.showWarningMessage('Replicated CLI not found. Please complete the installation.');
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

