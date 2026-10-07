import { Injectable } from '@angular/core'
import { ChildProcess, execFile, execFileSync, spawn } from 'child_process'
import * as os from 'os'
import { Observable, Subject } from 'rxjs'
import { ConfigService, PlatformService } from 'tabby-core'
import { AIProviderID, AIProviderStatus, getAIProvider } from '../providers'

export interface ClaudeModelStatus {
    /** ok: the model answered; unavailable: rejected by Claude Code; error: probe failed for another reason */
    state: 'ok'|'unavailable'|'error'
    /** Full model ID the alias resolved to */
    resolved?: string
    reason?: string
}

export interface CliUpdateStatus {
    checkedAt: number
    /** updated: the version changed; current: already up to date; error: the update command failed */
    state: 'updated'|'current'|'error'
    version?: string
    previousVersion?: string
    message?: string
}

export interface ProviderCommandInvocation {
    command: string
    args: string[]
    env: typeof process.env
    cwd?: string
    windowsVerbatimArguments: boolean
}

const CLI_UPDATE_TIMEOUT_MS = 5 * 60 * 1000

/** The environment variable, or undefined when it is unset or empty */
function nonEmptyEnv (name: string): string|undefined {
    const value = process.env[name]
    return value ? value : undefined
}
/** `codex debug models` is spawned at most this often */
const CODEX_MODEL_CACHE_MS = 10 * 60 * 1000
const PROVIDER_COMMAND_TIMEOUT_MS = 60 * 1000
/** where.exe / `command -v` lookups; a login shell with a slow rc file must not stall the status check */
const LOOKUP_TIMEOUT_MS = 15 * 1000

const DEFAULT_CLAUDE_MODEL_CANDIDATES = ['opus', 'sonnet', 'haiku', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1']

@Injectable({ providedIn: 'root' })
export class AIProviderAuthService {
    private statusChecks = new Map<AIProviderID, Promise<AIProviderStatus>>()
    private statusChanged = new Subject<AIProviderStatus>()
    private modelChecks = new Map<AIProviderID, Promise<string[]>>()
    private cliUpdates = new Map<AIProviderID, Promise<CliUpdateStatus>>()
    private cliUpdated = new Subject<AIProviderID>()
    private activeProviderRuns = 0
    private codexModelCache: { checkedAt: number, models: string[] }|null = null
    /** CLI versions read once per provider, shown in the panel header */
    private cliVersions = new Map<AIProviderID, string|null>()
    /** Absolute CLI paths found by the login-shell lookup on Linux, where spawn does not read the shell rc files */
    private resolvedExecutables = new Map<string, string>()

    get statusChanged$ (): Observable<AIProviderStatus> { return this.statusChanged }
    /** Emits when a CLI update of the provider starts or finishes */
    get cliUpdated$ (): Observable<AIProviderID> { return this.cliUpdated }

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
                if (status.state === 'logged-in' || status.state === 'logged-out') {
                    this.maybeAutoUpdateProviderCli(providerID)
                    void this.loadCliVersion(providerID)
                }
                return status
            })
            .finally(() => {
                this.statusChecks.delete(providerID)
            })
        this.statusChecks.set(providerID, check)
        return check
    }

    /** Counts running CLI processes; automatic updates only start while none are running */
    beginProviderRun (): void {
        this.activeProviderRuns++
    }

    endProviderRun (): void {
        this.activeProviderRuns = Math.max(0, this.activeProviderRuns - 1)
    }

    isCliUpdating (providerID: AIProviderID): boolean {
        return this.cliUpdates.has(providerID)
    }

    /** Resolves once a running update of the provider CLI has finished */
    async waitForCliUpdate (providerID: AIProviderID): Promise<void> {
        await this.cliUpdates.get(providerID)
    }

    /** The version from the last update check, or the one read when the provider was first checked */
    getKnownCliVersion (providerID: AIProviderID): string|undefined {
        return this.cliVersions.get(providerID) ?? this.getCliUpdateStatus(providerID)?.version
    }

    private async loadCliVersion (providerID: AIProviderID): Promise<void> {
        if (this.cliVersions.has(providerID)) {
            return
        }
        this.cliVersions.set(providerID, null)
        this.cliVersions.set(providerID, await this.getProviderCliVersion(providerID))
        this.cliUpdated.next(providerID)
    }

    getCliUpdateStatus (providerID: AIProviderID): CliUpdateStatus|undefined {
        return this.config.store.aiTerminal.cliUpdateStatus?.[providerID]
    }

    async getProviderCliVersion (providerID: AIProviderID): Promise<string|null> {
        try {
            const output = await this.execProviderCommand(getAIProvider(providerID).command, ['--version'], 30000)
            return /\d+\.\d+\.\d+(?:[-+][\w.]+)?/.exec(output)?.[0] ?? null
        } catch {
            return null
        }
    }

    /** Runs `claude update` / `codex update` and records the result */
    updateProviderCli (providerID: AIProviderID): Promise<CliUpdateStatus> {
        const activeUpdate = this.cliUpdates.get(providerID)
        if (activeUpdate) {
            return activeUpdate
        }
        const update = this.updateProviderCliNow(providerID)
            .then(status => {
                if (status.version) {
                    this.cliVersions.set(providerID, status.version)
                }
                this.config.store.aiTerminal.cliUpdateStatus = {
                    ...this.config.store.aiTerminal.cliUpdateStatus ?? {},
                    [providerID]: status,
                }
                void this.config.save()
                return status
            })
            .finally(() => {
                this.cliUpdates.delete(providerID)
                this.cliUpdated.next(providerID)
            })
        this.cliUpdates.set(providerID, update)
        this.cliUpdated.next(providerID)
        return update
    }

    /** Updates the CLI at most once per cliUpdateIntervalHours, and only while no CLI process is running */
    maybeAutoUpdateProviderCli (providerID: AIProviderID): void {
        const store = this.config.store.aiTerminal
        if (store.cliAutoUpdate === false || this.activeProviderRuns > 0 || this.cliUpdates.has(providerID)) {
            return
        }
        const intervalHours = Number(store.cliUpdateIntervalHours) || 24
        const lastCheck = this.getCliUpdateStatus(providerID)?.checkedAt ?? 0
        if (Date.now() - lastCheck < intervalHours * 3600 * 1000) {
            return
        }
        void this.updateProviderCli(providerID)
    }

    private async updateProviderCliNow (providerID: AIProviderID): Promise<CliUpdateStatus> {
        const provider = getAIProvider(providerID)
        const previousVersion = await this.getProviderCliVersion(providerID) ?? undefined
        try {
            const output = await this.execProviderCommand(provider.command, ['update'], CLI_UPDATE_TIMEOUT_MS)
            const version = await this.getProviderCliVersion(providerID) ?? undefined
            const lines = output.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean)
            return {
                checkedAt: Date.now(),
                state: version && previousVersion && version !== previousVersion ? 'updated' : 'current',
                version,
                previousVersion,
                message: lines[lines.length - 1]?.slice(0, 200),
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
                checkedAt: Date.now(),
                state: 'error',
                version: previousVersion,
                message: message.trim().split(/\r?\n/)[0].slice(0, 200),
            }
        }
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

    /** The command gets no stdin and is killed after the timeout, so a prompt or a stuck CLI cannot block a status check forever */
    private execProviderCommand (command: string, args: string[], timeout = PROVIDER_COMMAND_TIMEOUT_MS): Promise<string> {
        return new Promise((resolve, reject) => {
            const invocation = this.buildProviderCommandInvocation(command, args)
            let stopTimer = (): void => undefined
            const child = execFile(invocation.command, invocation.args, {
                env: invocation.env,
                windowsHide: true,
                windowsVerbatimArguments: invocation.windowsVerbatimArguments,
                maxBuffer: 4 * 1024 * 1024,
            }, (error, stdout, stderr) => {
                stopTimer()
                this.resolveCommandResult(error, stdout, stderr, resolve, reject)
            })
            // execFile's own timeout would only kill cmd.exe on Windows, and its callback waits for the CLI to exit
            stopTimer = this.startKillTimer(child, timeout, () => {
                reject(new Error(`${command} ${args.join(' ')} timed out after ${Math.round(timeout / 1000)}s`))
            })
            child.stdin?.on('error', () => undefined)
            child.stdin?.end()
        })
    }

    /** Kills the process tree after `ms`; the returned function cancels the timer */
    private startKillTimer (child: ChildProcess, ms: number, onTimeout: () => void): () => void {
        const timer = setTimeout(() => {
            this.killProcessTree(child)
            onTimeout()
        }, ms)
        return () => clearTimeout(timer)
    }

    /** On Windows the CLI runs under cmd.exe, and killing cmd.exe alone leaves the CLI running */
    killProcessTree (child: ChildProcess): void {
        if (child.exitCode !== null || child.signalCode !== null) {
            return
        }
        if (process.platform === 'win32' && child.pid) {
            execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }, error => {
                if (error) {
                    child.kill()
                }
            })
            return
        }
        child.kill()
    }

    private isProviderCommandAvailableAfterEnvironmentRefresh (command: string): Promise<boolean> {
        if (process.platform !== 'win32') {
            return Promise.resolve(false)
        }

        return new Promise(resolve => {
            execFile('where.exe', [command], { env: this.getWindowsRegistryCommandEnv(), timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
                resolve(!error && Boolean(this.findUsableProviderExecutable(command, stdout)))
            })
        })
    }

    private isProviderCommandAvailable (command: string): Promise<boolean> {
        return new Promise(resolve => {
            if (process.platform === 'win32') {
                execFile('where.exe', [command], { env: this.getAugmentedCommandEnv(), timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
                    resolve(!error && Boolean(this.findUsableProviderExecutable(command, stdout)))
                })
                return
            }

            execFile(this.getUserLoginShell(), ['-lic', `command -v ${this.commandLine([command])}`], {
                env: this.getAugmentedCommandEnv(),
                timeout: LOOKUP_TIMEOUT_MS,
            }, (error, stdout) => {
                resolve(!error && Boolean(this.rememberExecutable(command, this.findUsableProviderExecutable(command, stdout))))
            })
        })
    }

    private async resolveProviderExecutable (command: string): Promise<string|null> {
        return new Promise(resolve => {
            if (process.platform === 'win32') {
                execFile('where.exe', [command], { env: this.getAugmentedCommandEnv(), timeout: LOOKUP_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
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
                timeout: LOOKUP_TIMEOUT_MS,
            }, (error, stdout) => {
                if (error) {
                    resolve(null)
                    return
                }
                resolve(this.rememberExecutable(command, this.findUsableProviderExecutable(command, stdout)))
            })
        })
    }

    private rememberExecutable (command: string, executable: string|null): string|null {
        if (executable?.startsWith('/')) {
            this.resolvedExecutables.set(command, executable)
        }
        return executable
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

    /**
     * On Windows the command line for cmd.exe is built the way Node does for `shell: true`: wrapped in quotes
     * and passed verbatim, so libuv does not escape the argument quotes a second time. cmd.exe cannot start in
     * a UNC folder (\\server\share, \\wsl.localhost\...), so such a folder is entered with pushd.
     */
    buildProviderCommandInvocation (command: string, args: string[], cwd?: string): ProviderCommandInvocation {
        if (process.platform === 'win32') {
            const uncFolder = cwd?.startsWith('\\\\') ? cwd : undefined
            const commandLine = this.commandLine([command, ...args])
            const line = this.withWindowsUTF8CodePage(uncFolder ? `pushd ${this.commandLine([uncFolder])} && ${commandLine}` : commandLine)
            return {
                command: 'cmd.exe',
                args: ['/d', '/s', '/c', `"${line}"`],
                env: this.getAugmentedCommandEnv(),
                cwd: uncFolder ? undefined : cwd,
                windowsVerbatimArguments: true,
            }
        }

        if (process.platform === 'darwin') {
            return {
                command: this.getUserLoginShell(),
                args: ['-lic', this.commandLine([command, ...args])],
                env: this.getAugmentedCommandEnv(),
                cwd,
                windowsVerbatimArguments: false,
            }
        }

        // The login-shell lookup may find the CLI through rc-file PATH entries (nvm, fnm); its folder also
        // holds the node binary that an npm-installed CLI needs
        const executable = this.resolvedExecutables.get(command)
        const env = this.getAugmentedCommandEnv()
        if (executable) {
            env.PATH = `${executable.slice(0, executable.lastIndexOf('/'))}:${env.PATH ?? ''}`
        }
        return {
            command: executable ?? command,
            args,
            env,
            cwd,
            windowsVerbatimArguments: false,
        }
    }

    getClaudeModelStatus (model: string): ClaudeModelStatus|undefined {
        return this.config.store.aiTerminal.claudeModelCache?.results?.[model]
    }

    clearClaudeModelCache (): void {
        this.config.store.aiTerminal.claudeModelCache = null
    }

    /**
     * Claude Code has no command that lists models, so each candidate is probed with a tiny request.
     * Results are cached (24 h by default) because the model picker refreshes on every click.
     */
    private async fetchClaudeModels (): Promise<string[]> {
        const store = this.config.store.aiTerminal
        const candidates: string[] = Array.isArray(store.claudeModelCandidates) && store.claudeModelCandidates.length
            ? store.claudeModelCandidates
            : DEFAULT_CLAUDE_MODEL_CANDIDATES
        const probeList = candidates.filter(model => model !== 'auto')
        const cache = store.claudeModelCache
        const maxAge = (Number(store.claudeModelCacheHours) || 24) * 3600 * 1000
        const fresh = cache?.results && Date.now() - cache.checkedAt < maxAge && probeList.every(model => cache.results[model])
        if (!fresh) {
            await this.waitForCliUpdate('claude')
            const entries = await Promise.all(probeList.map(async model => [model, await this.probeClaudeModel(model)] as const))
            const results: Record<string, ClaudeModelStatus> = Object.fromEntries(entries)
            // List the full ID an alias resolved to, so new model versions show up without code changes
            for (const [, result] of entries) {
                if (result.state === 'ok' && result.resolved && !(result.resolved in results)) {
                    results[result.resolved] = { state: 'ok', resolved: result.resolved }
                }
            }
            store.claudeModelCache = { checkedAt: Date.now(), results }
            await this.config.save()
        }
        const resolvedModels = Object.values(store.claudeModelCache.results as Record<string, ClaudeModelStatus>)
            .filter(result => result.state === 'ok' && result.resolved)
            .map(result => result.resolved!)
        return [...new Set(['auto', ...candidates, ...resolvedModels])]
    }

    private probeClaudeModel (model: string): Promise<ClaudeModelStatus> {
        return new Promise(resolve => {
            const args = [
                '-p', '--model', model, '--max-turns', '1', '--output-format', 'json',
                '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands',
                '--system-prompt', 'Model availability probe. Reply with exactly OK.',
                '--tools', '',
            ]
            const invocation = this.buildProviderCommandInvocation('claude', args, os.tmpdir())
            let output = ''
            const child = spawn(invocation.command, invocation.args, {
                env: invocation.env,
                cwd: invocation.cwd,
                windowsHide: true,
                windowsVerbatimArguments: invocation.windowsVerbatimArguments,
            })
            this.beginProviderRun()
            child.once('close', () => this.endProviderRun())
            let settled = false
            let stopTimer = (): void => undefined
            const finish = (status: ClaudeModelStatus) => {
                if (!settled) {
                    settled = true
                    stopTimer()
                    resolve(status)
                }
            }
            stopTimer = this.startKillTimer(child, 90000, () => finish({ state: 'error', reason: 'The probe timed out after 90 s' }))
            child.stdout.setEncoding('utf8')
            child.stderr.setEncoding('utf8')
            child.stdout.on('data', data => { output += data })
            child.stderr.on('data', data => { output += data })
            child.stdin.on('error', () => undefined)
            child.on('error', error => { output += String(error) })
            child.on('close', code => {
                let result: any = null
                for (const line of output.split(/\r?\n/)) {
                    if (line.trim().startsWith('{')) {
                        try {
                            const parsed = JSON.parse(line.trim())
                            if (parsed.type === 'result') {
                                result = parsed
                            }
                        } catch { }
                    }
                }
                if (code === 0 && result && !result.is_error) {
                    finish({ state: 'ok', resolved: result.modelUsage ? Object.keys(result.modelUsage)[0] : undefined })
                    return
                }
                const text = `${typeof result?.result === 'string' ? result.result + '\n' : ''}${output}`
                const unavailable = /unrecognized_model|not_found_error|permission_error|model[^\n]{0,60}(not found|not available|not supported|does not exist|invalid)|(not available|no access|not allowed)[^\n]{0,60}model/i.test(text)
                finish({ state: unavailable ? 'unavailable' : 'error', reason: text.trim().split(/\r?\n/)[0].slice(0, 200) })
            })
            child.stdin.end('Reply with exactly: OK')
        })
    }

    private async fetchAvailableModels (providerID: AIProviderID): Promise<string[]> {
        const provider = getAIProvider(providerID)
        if (provider.id === 'claude') {
            return this.fetchClaudeModels()
        }
        // Keeps providers added later off the Codex model catalog
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (provider.id !== 'codex') {
            return provider.models
        }

        if (this.codexModelCache && Date.now() - this.codexModelCache.checkedAt < CODEX_MODEL_CACHE_MS) {
            return this.codexModelCache.models
        }
        try {
            const output = await this.execProviderCommand(provider.command, ['debug', 'models'])
            const catalog = this.extractCodexModelCatalog(output)
            const models = this.mergeModelOptions(provider.models, catalog)
            this.codexModelCache = { checkedAt: Date.now(), models }
            return models
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
            return line ?? 'Signed in'
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
        return { ...this.config.store.aiTerminal.providerModels ?? {} }
    }

    private withWindowsUTF8CodePage (command: string): string {
        return `chcp 65001 >nul && ${command}`
    }

    private encodePowerShellCommand (command: string): string {
        return Buffer.from(command, 'utf16le').toString('base64')
    }

    private getLinuxTerminalCandidates (command: string): { command: string, args: string[] }[] {
        const shell = nonEmptyEnv('SHELL') ?? '/bin/sh'
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
        return nonEmptyEnv('SHELL') ?? '/bin/zsh'
    }

    private getAugmentedCommandEnv (): typeof process.env {
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

    private getWindowsRegistryCommandEnv (): typeof process.env {
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
                timeout: 5000,
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
            // A single quote inside single quotes is written as '\''
            return `'${arg.replace(/'/g, '\'\\\'\'')}'`
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
