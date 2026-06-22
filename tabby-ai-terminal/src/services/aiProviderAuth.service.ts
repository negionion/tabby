import { Injectable } from '@angular/core'
import { execFile, execFileSync, spawn } from 'child_process'
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
        const currentProvider = this.getSelectedProvider()
        const providerModels = this.getProviderModels()
        providerModels[currentProvider] = this.config.store.aiTerminal.model ?? getAIProvider(currentProvider).defaultModel
        this.config.store.aiTerminal.provider = provider
        this.config.store.aiTerminal.model = providerModels[provider] ?? getAIProvider(provider).defaultModel
        this.config.store.aiTerminal.providerModels = providerModels
        await this.config.save()
        return this.checkProviderStatus(provider)
    }

    getSelectedModel (): string {
        const provider = getAIProvider(this.config.store.aiTerminal.provider)
        const model = this.getProviderModels()[provider.id] ?? this.config.store.aiTerminal.model
        return model ?? provider.defaultModel
    }

    async setSelectedModel (model: string): Promise<void> {
        const provider = getAIProvider(this.config.store.aiTerminal.provider)
        const selectedModel = model.trim() || provider.defaultModel
        const providerModels = this.getProviderModels()
        providerModels[provider.id] = selectedModel
        this.config.store.aiTerminal.model = selectedModel
        this.config.store.aiTerminal.providerModels = providerModels
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
        const executable = await this.resolveProviderExecutable(provider.command)
        if (!executable && await this.isProviderCommandAvailableAfterEnvironmentRefresh(provider.command)) {
            await this.confirmCloseForEnvironmentRefresh(providerID)
            return
        }
        await this.openExternalTerminal(this.buildProviderLoginCommand(provider.command, executable))
    }

    async confirmCloseForEnvironmentRefresh (providerID: AIProviderID = this.getSelectedProvider()): Promise<boolean> {
        const provider = getAIProvider(providerID)
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: `Restart Tabby to finish ${provider.label} setup?`,
            detail: `${provider.label} is installed, but this running Tabby window has not picked up the updated PATH yet. Close Tabby and reopen it to continue signing in.`,
            buttons: ['Close Tabby', 'Later'],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response !== 0) {
            return false
        }
        this.platform.quit()
        return true
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
        const executable = await this.resolveProviderExecutable(provider.command)
        await this.openExternalTerminal(this.commandLine([
            this.getExternalTerminalExecutable(provider.command, executable),
            ...this.getLogoutArgs(providerID),
        ]))
        return true
    }

    async confirmResetSession (): Promise<boolean> {
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: 'Reset AI session?',
            detail: 'This clears the current chat history and starts a new AI provider session for this terminal. Previous context will no longer be sent.',
            buttons: ['Reset session', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
        })
        return result.response === 0
    }

    private async checkProviderStatusNow (providerID: AIProviderID): Promise<AIProviderStatus> {
        const provider = getAIProvider(providerID)
        if (!await this.isProviderCommandAvailable(provider.command)) {
            if (await this.isProviderCommandAvailableAfterEnvironmentRefresh(provider.command)) {
                return {
                    provider: provider.id,
                    state: 'restart-required',
                    label: `${provider.label} CLI is installed`,
                    detail: `Restart Tabby so it can pick up the updated PATH, then continue signing in.`,
                }
            }
            return {
                provider: provider.id,
                state: 'not-installed',
                label: `${provider.label} CLI is not installed`,
                detail: `Click Install ${provider.label} to run the official installer. After it finishes, return to Tabby and refresh.`,
            }
        }

        try {
            const output = await this.execProviderCommand(provider.command, this.getAuthStatusArgs(providerID))
            if (this.isLoggedOutOutput(output)) {
                return {
                    provider: provider.id,
                    state: 'logged-out',
                    label: `${provider.label} needs sign in`,
                    detail: output.trim(),
                }
            }
            if (this.isLoggedInOutput(output)) {
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
                    detail: `Click Install ${provider.label} to run the official installer. After it finishes, return to Tabby and refresh.`,
                }
            }
            if (this.isLoggedOutOutput(message)) {
                return {
                    provider: provider.id,
                    state: 'logged-out',
                    label: `${provider.label} needs sign in`,
                    detail: message.trim(),
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

    private isProviderCommandAvailableAfterEnvironmentRefresh (command: string): Promise<boolean> {
        if (process.platform !== 'win32') {
            return Promise.resolve(false)
        }

        return new Promise(resolve => {
            execFile('where.exe', [command], { env: this.getWindowsRegistryCommandEnv() }, (error, stdout) => {
                resolve(!error && Boolean(this.findUsableProviderExecutable(command, stdout)))
            })
        })
    }

    private isProviderCommandAvailable (command: string): Promise<boolean> {
        return new Promise(resolve => {
            if (process.platform === 'win32') {
                execFile('where.exe', [command], { env: this.getAugmentedCommandEnv() }, (error, stdout) => {
                    resolve(!error && Boolean(this.findUsableProviderExecutable(command, stdout)))
                })
                return
            }

            execFile(this.getUserLoginShell(), ['-lic', `command -v ${this.commandLine([command])}`], {
                env: this.getAugmentedCommandEnv(),
            }, (error, stdout) => {
                resolve(!error && Boolean(this.findUsableProviderExecutable(command, stdout)))
            })
        })
    }

    private async resolveProviderExecutable (command: string): Promise<string|null> {
        return new Promise(resolve => {
            if (process.platform === 'win32') {
                execFile('where.exe', [command], { env: this.getAugmentedCommandEnv() }, (error, stdout) => {
                    if (error) {
                        resolve(null)
                        return
                    }
                    resolve(this.findUsableProviderExecutable(command, stdout))
                })
                return
            }

            execFile(this.getUserLoginShell(), ['-lic', `command -v ${this.commandLine([command])}`], {
                env: this.getAugmentedCommandEnv(),
            }, (error, stdout) => {
                if (error) {
                    resolve(null)
                    return
                }
                resolve(this.findUsableProviderExecutable(command, stdout))
            })
        })
    }

    private findUsableProviderExecutable (command: string, output: string): string|null {
        return output
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => this.isUsableProviderExecutable(command, line)) ?? null
    }

    private isUsableProviderExecutable (command: string, executable: string): boolean {
        if (!executable) {
            return false
        }
        if (command !== 'codex') {
            return true
        }

        const normalized = executable.replace(/\\/g, '/').toLowerCase()
        return !normalized.includes('/.vscode/extensions/openai.chatgpt-')
    }

    buildProviderCommandInvocation (command: string, args: string[]): { command: string, args: string[], env: NodeJS.ProcessEnv } {
        if (process.platform === 'win32') {
            return {
                command: 'cmd.exe',
                args: ['/d', '/s', '/c', this.withWindowsUTF8CodePage(this.commandLine([command, ...args]))],
                env: this.getAugmentedCommandEnv(),
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
        try {
            const data = JSON.parse(output)
            return data.email ?? data.account ?? data.subscriptionType ?? data.authMethod ?? 'Signed in'
        } catch {
            const line = output.split(/\r?\n/).find(item => /logged in|signed in/i.test(item))?.trim()
            return line || 'Signed in'
        }
    }

    private async openExternalTerminal (command: string): Promise<void> {
        if (process.platform === 'win32') {
            const terminalCommand = this.withWindowsUTF8CodePage(command)
            const launchCommand = `start "" cmd.exe /d /s /k "${terminalCommand}"`
            await this.spawnDetached('cmd.exe', ['/d', '/s', '/c', launchCommand], true)
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

    private buildProviderLoginCommand (command: string, executable: string|null): string {
        if (command === 'codex') {
            const loginCommand = this.commandLine([this.getExternalTerminalExecutable('codex', executable), '--login'])
            if (executable) {
                return loginCommand
            }
            if (process.platform === 'win32') {
                const installCommand = `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${this.encodePowerShellCommand('irm https://chatgpt.com/codex/install.ps1 | iex')}`
                return installCommand
            }
            return `curl -fsSL https://chatgpt.com/codex/install.sh | sh`
        }
        if (command === 'claude') {
            if (executable) {
                return this.commandLine([this.getExternalTerminalExecutable('claude', executable), 'auth', 'login'])
            }
            if (process.platform === 'win32') {
                const installCommand = `irm https://claude.ai/install.ps1 | iex`
                return `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${this.encodePowerShellCommand(installCommand)}`
            }
            return `curl -fsSL https://claude.ai/install.sh | bash`
        }
        return `${command} login`
    }

    private getExternalTerminalExecutable (command: string, executable: string|null): string {
        return process.platform === 'win32' ? command : executable ?? command
    }

    private getAuthStatusArgs (providerID: AIProviderID): string[] {
        return providerID === 'claude' ? ['auth', 'status'] : ['login', 'status']
    }

    private getLogoutArgs (providerID: AIProviderID): string[] {
        return providerID === 'claude' ? ['auth', 'logout'] : ['logout']
    }

    private isLoggedInOutput (output: string): boolean {
        return /logged in|signed in|"loggedIn"\s*:\s*true/i.test(output)
    }

    private isLoggedOutOutput (output: string): boolean {
        return /not logged in|not signed in|logged out|"loggedIn"\s*:\s*false/i.test(output)
    }

    private getProviderModels (): Partial<Record<AIProviderID, string>> {
        return { ...(this.config.store.aiTerminal.providerModels ?? {}) }
    }

    private withWindowsUTF8CodePage (command: string): string {
        return `chcp 65001 >nul && ${command}`
    }

    private encodePowerShellCommand (command: string): string {
        return Buffer.from(command, 'utf16le').toString('base64')
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
        if (process.platform === 'win32') {
            const pathKey = this.getWindowsPathEnvKey()
            const pathEntries = [
                this.getClaudeNativeInstallDirectory(),
                process.env[pathKey] ?? process.env.PATH ?? '',
            ].filter(Boolean)
            return {
                ...process.env,
                [pathKey]: pathEntries.join(';'),
            }
        }

        const home = process.env.HOME
        const pathEntries = [
            this.getClaudeNativeInstallDirectory(),
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

    private getWindowsRegistryCommandEnv (): NodeJS.ProcessEnv {
        const pathKey = this.getWindowsPathEnvKey()
        const pathEntries = [
            this.getClaudeNativeInstallDirectory(),
            this.readWindowsRegistryPath('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'),
            this.readWindowsRegistryPath('HKCU\\Environment'),
            process.env[pathKey] ?? process.env.PATH ?? '',
        ]
            .flatMap(value => value.split(';'))
            .map(value => this.expandWindowsEnvironmentVariables(value.trim()))
            .filter(Boolean)

        return {
            ...process.env,
            [pathKey]: [...new Set(pathEntries)].join(';'),
        }
    }

    private readWindowsRegistryPath (key: string): string {
        try {
            const output = execFileSync('reg.exe', ['query', key, '/v', 'Path'], {
                encoding: 'utf8',
                windowsHide: true,
            })
            const line = output.split(/\r?\n/).find(item => /^\s*Path\s+REG_/i.test(item))
            return line?.replace(/^\s*Path\s+REG_\w+\s+/i, '').trim() ?? ''
        } catch {
            return ''
        }
    }

    private expandWindowsEnvironmentVariables (value: string): string {
        return value.replace(/%([^%]+)%/g, (_match, name) => process.env[name] ?? process.env[name.toUpperCase()] ?? process.env[name.toLowerCase()] ?? '')
    }

    private getWindowsPathEnvKey (): string {
        return Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'Path'
    }

    private getClaudeNativeInstallDirectory (): string {
        const home = process.platform === 'win32'
            ? process.env.USERPROFILE ?? process.env.HOME
            : process.env.HOME
        if (!home) {
            return ''
        }
        return process.platform === 'win32' ? `${home}\\.local\\bin` : `${home}/.local/bin`
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

    private spawnDetached (command: string, args: string[], windowsVerbatimArguments = false): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
                windowsVerbatimArguments,
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
