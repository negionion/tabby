import { Injectable } from '@angular/core'
import { execFile, spawn } from 'child_process'
import { Observable, Subject } from 'rxjs'
import { ConfigService, PlatformService } from 'tabby-core'
import { AIProviderID, AIProviderStatus, getAIProvider } from '../providers'

@Injectable({ providedIn: 'root' })
export class AIProviderAuthService {
    private statusChecks = new Map<AIProviderID, Promise<AIProviderStatus>>()
    private statusChanged = new Subject<AIProviderStatus>()
    private modelChecks = new Map<AIProviderID, Promise<string[]>>()

    get statusChanged$ (): Observable<AIProviderStatus> { return this.statusChanged }

    constructor (
        private config: ConfigService,
        private platform: PlatformService,
    ) { }

    getSelectedProvider (): AIProviderID {
        return getAIProvider(this.config.store.aiTerminal.provider).id
    }

    async setSelectedProvider (provider: AIProviderID): Promise<AIProviderStatus> {
        this.config.store.aiTerminal.provider = provider
        await this.config.save()
        return this.checkProviderStatus(provider)
    }

    getSelectedModel (): string {
        const provider = getAIProvider(this.config.store.aiTerminal.provider)
        const model = this.config.store.aiTerminal.model
        return model || provider.defaultModel
    }

    async setSelectedModel (model: string): Promise<void> {
        const provider = getAIProvider(this.config.store.aiTerminal.provider)
        this.config.store.aiTerminal.model = model.trim() || provider.defaultModel
        await this.config.save()
    }

    getAvailableModels (providerID: AIProviderID = this.getSelectedProvider(), force = false): Promise<string[]> {
        if (force) {
            this.modelChecks.delete(providerID)
        }

        const activeCheck = this.modelChecks.get(providerID)
        if (activeCheck) {
            return activeCheck
        }

        const check = this.fetchAvailableModels(providerID)
            .finally(() => {
                this.modelChecks.delete(providerID)
            })
        this.modelChecks.set(providerID, check)
        return check
    }

    checkSelectedProviderStatus (): Promise<AIProviderStatus> {
        return this.checkProviderStatus(this.getSelectedProvider())
    }

    checkProviderStatus (providerID: AIProviderID): Promise<AIProviderStatus> {
        const activeCheck = this.statusChecks.get(providerID)
        if (activeCheck) {
            return activeCheck
        }

        const check = this.checkProviderStatusNow(providerID)
            .then(status => {
                this.publishStatus(status)
                return status
            })
            .finally(() => {
                this.statusChecks.delete(providerID)
            })
        this.statusChecks.set(providerID, check)
        return check
    }

    publishStatus (status: AIProviderStatus): void {
        this.statusChanged.next(status)
    }

    async startLogin (providerID: AIProviderID = this.getSelectedProvider()): Promise<void> {
        const provider = getAIProvider(providerID)
        await this.openExternalTerminal(this.buildProviderSetupCommand(provider.command))
    }

    async confirmAndStartLogout (providerID: AIProviderID = this.getSelectedProvider()): Promise<boolean> {
        const provider = getAIProvider(providerID)
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: `Log out of ${provider.label}?`,
            detail: 'The provider CLI will handle sign-out in an external terminal.',
            buttons: ['Logout', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response !== 0) {
            return false
        }
        await this.openExternalTerminal(`${provider.command} logout`)
        return true
    }

    private async checkProviderStatusNow (providerID: AIProviderID): Promise<AIProviderStatus> {
        const provider = getAIProvider(providerID)
        try {
            const output = await this.execProviderCommand(provider.command, ['login', 'status'])
            if (/not logged in|not signed in|logged out/i.test(output)) {
                return {
                    provider: provider.id,
                    state: 'logged-out',
                    label: `${provider.label} needs sign in`,
                    detail: output.trim(),
                }
            }
            if (/logged in|signed in/i.test(output)) {
                return {
                    provider: provider.id,
                    state: 'logged-in',
                    label: `${provider.label} is signed in`,
                    detail: output.trim(),
                    account: this.extractAccountLabel(output),
                }
            }
            return {
                provider: provider.id,
                state: 'logged-out',
                label: `${provider.label} needs sign in`,
                detail: output.trim(),
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`
            if (/not recognized|not found|ENOENT|command not found/i.test(message)) {
                return {
                    provider: provider.id,
                    state: 'not-installed',
                    label: `${provider.label} CLI is not installed`,
                    detail: message,
                }
            }
            return {
                provider: provider.id,
                state: 'error',
                label: `Could not check ${provider.label}`,
                detail: message,
            }
        }
    }

    private execProviderCommand (command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const invocation = this.buildProviderCommandInvocation(command, args)
            execFile(invocation.command, invocation.args, { env: invocation.env }, (error, stdout, stderr) => {
                this.resolveCommandResult(error, stdout, stderr, resolve, reject)
            })
        })
    }

    buildProviderCommandInvocation (command: string, args: string[]): { command: string, args: string[], env: NodeJS.ProcessEnv } {
        if (process.platform === 'win32') {
            return {
                command: 'cmd.exe',
                args: ['/d', '/s', '/c', this.commandLine([command, ...args])],
                env: process.env,
            }
        }

        if (process.platform === 'darwin') {
            return {
                command: this.getUserLoginShell(),
                args: ['-lic', this.commandLine([command, ...args])],
                env: this.getAugmentedCommandEnv(),
            }
        }

        return {
            command,
            args,
            env: this.getAugmentedCommandEnv(),
        }
    }

    private async fetchAvailableModels (providerID: AIProviderID): Promise<string[]> {
        const provider = getAIProvider(providerID)
        if (provider.id !== 'codex') {
            return provider.models
        }

        try {
            const output = await this.execProviderCommand(provider.command, ['debug', 'models'])
            const catalog = this.extractCodexModelCatalog(output)
            return this.mergeModelOptions(provider.models, catalog)
        } catch {
            return provider.models
        }
    }

    private extractCodexModelCatalog (output: string): string[] {
        const jsonLine = output.split(/\r?\n/).find(line => line.trim().startsWith('{'))
        if (!jsonLine) {
            return []
        }

        const data = JSON.parse(jsonLine)
        if (!Array.isArray(data.models)) {
            return []
        }

        return data.models
            .filter((model: any) => model && typeof model.slug === 'string')
            .filter((model: any) => model.visibility !== 'hidden')
            .map((model: any) => model.slug)
    }

    private mergeModelOptions (fallbackModels: string[], discoveredModels: string[]): string[] {
        return [...new Set([...fallbackModels, ...discoveredModels])]
    }

    private resolveCommandResult (
        error: Error|null,
        stdout: string,
        stderr: string,
        resolve: (output: string) => void,
        reject: (error: Error) => void,
    ): void {
        const output = `${stdout}${stderr}`
        if (error) {
            reject(new Error(output || error.message))
        } else {
            resolve(output)
        }
    }

    private extractAccountLabel (output: string): string {
        const line = output.split(/\r?\n/).find(item => /logged in/i.test(item))?.trim()
        return line || 'Signed in'
    }

    private async openExternalTerminal (command: string): Promise<void> {
        if (process.platform === 'win32') {
            await this.spawnDetached('cmd.exe', ['/c', 'start', 'AI Terminal Login', 'cmd.exe', '/k', command])
            return
        }
        if (process.platform === 'darwin') {
            const script = `tell application "Terminal" to do script ${JSON.stringify(this.wrapInUserLoginShell(command))}`
            await this.spawnDetached('osascript', ['-e', script])
            return
        }

        for (const terminal of this.getLinuxTerminalCandidates(command)) {
            try {
                await this.spawnDetached(terminal.command, terminal.args)
                return
            } catch { }
        }
        throw new Error('Could not open an external terminal')
    }

    private buildProviderSetupCommand (command: string): string {
        if (command === 'codex') {
            if (process.platform === 'win32') {
                return 'where codex >nul 2>nul || npm install -g @openai/codex & codex login'
            }
            return 'command -v codex >/dev/null 2>&1 || npm install -g @openai/codex; codex login'
        }
        return `${command} login`
    }

    private getLinuxTerminalCandidates (command: string): { command: string, args: string[] }[] {
        const shell = process.env.SHELL || '/bin/sh'
        return [
            { command: 'x-terminal-emulator', args: ['-e', shell, '-lc', command] },
            { command: 'gnome-terminal', args: ['--', shell, '-lc', command] },
            { command: 'konsole', args: ['-e', shell, '-lc', command] },
            { command: 'xfce4-terminal', args: ['-e', `${shell} -lc ${JSON.stringify(command)}`] },
            { command: 'xterm', args: ['-e', shell, '-lc', command] },
        ]
    }

    private wrapInUserLoginShell (command: string): string {
        return `exec ${this.commandLine([this.getUserLoginShell(), '-lic', command])}`
    }

    private getUserLoginShell (): string {
        return process.env.SHELL || '/bin/zsh'
    }

    private getAugmentedCommandEnv (): NodeJS.ProcessEnv {
        const home = process.env.HOME
        const pathEntries = [
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
            '/usr/local/bin',
            '/usr/local/sbin',
            home ? `${home}/.npm-global/bin` : null,
            home ? `${home}/.local/bin` : null,
            home ? `${home}/.bun/bin` : null,
            ...(process.env.PATH ?? '').split(':'),
        ].filter((entry): entry is string => Boolean(entry))

        return {
            ...process.env,
            PATH: [...new Set(pathEntries)].join(':'),
        }
    }

    private commandLine (args: string[]): string {
        if (process.platform === 'win32') {
            return args.map(arg => {
                if (/^[A-Za-z0-9._/-]+$/.test(arg)) {
                    return arg
                }
                return `"${arg.replace(/"/g, '\\"')}"`
            }).join(' ')
        }

        return args.map(arg => {
            if (/^[A-Za-z0-9._/:=-]+$/.test(arg)) {
                return arg
            }
            return `'${arg.replace(/'/g, "'\\''")}'`
        }).join(' ')
    }

    private spawnDetached (command: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
                env: this.getAugmentedCommandEnv(),
            })
            child.once('error', reject)
            child.once('spawn', () => {
                child.unref()
                resolve()
            })
        })
    }
}
