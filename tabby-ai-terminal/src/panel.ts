import { BaseTerminalTabComponent } from 'tabby-terminal'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { SuggestedCommand } from './analysis'
import { AIProviderAuthService } from './services/aiProviderAuth.service'
import { AIProviderRunnerService, AIProviderRunHandle } from './services/aiProviderRunner.service'
import { AI_PROVIDERS, AIProviderID, AIProviderStatus } from './providers'

const VISIBLE_OUTPUT_LINES = 14
const ANALYSIS_PLACEHOLDER = 'Ask a question and click Analyze. Suggestions will be generated from recent terminal output.'

export class AITerminalPanel {
    readonly element: HTMLElement
    private providerAuth: AIProviderAuthService
    private providerRunner: AIProviderRunnerService
    private header: HTMLElement
    private signedInIdentity: HTMLElement
    private providerSelect: HTMLSelectElement
    private modelSelect: HTMLSelectElement
    private statusLine: HTMLElement
    private loginOnly: HTMLElement
    private content: HTMLElement
    private headerLogoutButton: HTMLButtonElement
    private loginOnlyLoginButton: HTMLButtonElement
    private analyzeButton: HTMLButtonElement
    private cancelButton: HTMLButtonElement
    private refreshModelsButton: HTMLButtonElement
    private question: HTMLTextAreaElement
    private output: HTMLElement
    private analysis: HTMLElement
    private suggestions: HTMLElement
    private draft: HTMLTextAreaElement
    private recentOutputLines: string[] = []
    private pendingOutput = ''
    private currentInputLine = ''
    private skipNextEmptyInputOutputLine = false
    private visible = false
    private pendingLoginRefreshes = 0
    private lastProviderStatus: AIProviderStatus|null = null
    private lastFocusRefreshAt = 0
    private statusSubscription: Subscription
    private runHandle: AIProviderRunHandle|null = null

    constructor (
        private tab: BaseTerminalTabComponent<any>,
        providerAuth: AIProviderAuthService,
        providerRunner: AIProviderRunnerService,
        private config: ConfigService,
    ) {
        this.providerAuth = providerAuth
        this.providerRunner = providerRunner
        this.statusSubscription = this.providerAuth.statusChanged$.subscribe(status => {
            this.applyProviderStatus(status)
        })
        this.element = document.createElement('aside')
        this.element.className = 'ai-terminal-panel'
        this.element.addEventListener('click', event => event.stopPropagation())
        this.element.addEventListener('mousedown', event => event.stopPropagation())

        this.header = document.createElement('div')
        this.header.className = 'ai-provider-header'

        this.signedInIdentity = document.createElement('div')
        this.signedInIdentity.className = 'ai-provider-identity'

        this.providerSelect = document.createElement('select')
        this.providerSelect.className = 'form-control form-control-sm ai-provider-select'
        for (const provider of AI_PROVIDERS) {
            const option = document.createElement('option')
            option.value = provider.id
            option.textContent = provider.label
            this.providerSelect.appendChild(option)
        }
        this.providerSelect.value = this.providerAuth.getSelectedProvider()
        this.providerSelect.addEventListener('change', () => {
            this.setProvider(this.providerSelect.value as AIProviderID)
        })

        this.modelSelect = document.createElement('select')
        this.modelSelect.className = 'form-control form-control-sm ai-model-select'
        this.modelSelect.addEventListener('change', () => {
            this.providerAuth.setSelectedModel(this.modelSelect.value)
        })
        this.refreshModelOptions()

        this.statusLine = document.createElement('div')
        this.statusLine.className = 'ai-provider-status'

        this.loginOnly = document.createElement('div')
        this.loginOnly.className = 'ai-login-only'
        this.content = document.createElement('div')

        this.headerLogoutButton = this.button('Logout', 'secondary', () => this.logout())
        this.loginOnlyLoginButton = this.button('Install / Login with Provider', 'primary', () => this.login())
        this.analyzeButton = this.button('Analyze', 'primary', () => this.analyze())
        this.cancelButton = this.button('Cancel', 'secondary', () => this.cancelAnalyze())
        this.refreshModelsButton = this.button('Refresh models', 'secondary', () => this.refreshModelOptions(true))
        this.cancelButton.hidden = true

        this.question = this.textarea('Example: help me analyze the recent hostapd disconnect', 3)
        this.output = document.createElement('pre')
        this.analysis = document.createElement('pre')
        this.suggestions = document.createElement('div')
        this.draft = this.textarea('Commands staged here will be sent to the terminal', 6)

        this.header.append(
            this.signedInIdentity,
            this.providerSelect,
            this.modelSelect,
            this.refreshModelsButton,
            this.headerLogoutButton,
        )

        this.loginOnly.append(
            this.section('AI Provider', this.statusLine, [
                this.loginOnlyLoginButton,
                this.button('Refresh', 'secondary', () => this.refreshProviderStatus()),
            ]),
        )

        this.content.append(
            this.section('AI Chat Panel', this.question, [this.analyzeButton, this.cancelButton]),
            this.section('Latest Session Output', this.output),
            this.section('Analysis', this.analysis),
            this.section('Suggested Commands', this.suggestions),
            this.section('Sender / Command Draft', this.draft, [
                this.button('Send Line', 'success', () => this.sendDraftLine()),
                this.button('Send All', 'success', () => this.sendDraftAll()),
                this.button('Clear', 'secondary', () => {
                    this.draft.value = ''
                }),
            ]),
        )

        this.element.append(this.header, this.loginOnly, this.content)
        this.applyProviderStatus({
            provider: this.providerAuth.getSelectedProvider(),
            state: 'checking',
            label: 'Checking provider status...',
        })
        this.render()
    }

    destroy (): void {
        this.cancelAnalyze()
        this.statusSubscription.unsubscribe()
        window.removeEventListener('focus', this.refreshAfterFocus)
        this.tab.element.nativeElement.classList.remove('ai-terminal-panel-visible')
        this.element.remove()
    }

    appendOutput (data: string): void {
        const normalized = this.stripAnsi(data).replace(/\r\n?/g, '\n')
        if (!normalized) {
            return
        }

        this.pendingOutput += normalized
        let newlineIndex = this.pendingOutput.indexOf('\n')
        while (newlineIndex !== -1) {
            const line = this.pendingOutput.slice(0, newlineIndex)
            this.appendOutputLine(line)
            this.pendingOutput = this.pendingOutput.slice(newlineIndex + 1)
            newlineIndex = this.pendingOutput.indexOf('\n')
        }
        this.render()
    }

    handleInput (data: string|Buffer): void {
        if (!this.shouldIgnoreEmptyEnterPrompts()) {
            return
        }

        const text = Buffer.isBuffer(data) ? data.toString('utf-8') : data
        if (!text) {
            return
        }

        this.trackTerminalInput(text)
    }

    toggle (): void {
        this.visible = !this.visible
        this.render()

        if (this.visible) {
            if (this.shouldRefreshAfterFocus()) {
                this.refreshAfterFocus()
            } else if (this.lastProviderStatus?.state === 'checking') {
                this.refreshProviderStatus()
            }
            setTimeout(() => this.question.focus())
            window.addEventListener('focus', this.refreshAfterFocus)
        } else {
            window.removeEventListener('focus', this.refreshAfterFocus)
            this.tab.frontend?.focus()
        }
    }

    private async analyze (): Promise<void> {
        if (this.runHandle) {
            return
        }
        this.flushPendingOutput()
        this.skipNextEmptyInputOutputLine = false
        this.trimRecentOutput()
        const question = this.question.value
        const terminalOutput = this.getRecentOutputText()
        this.analysis.textContent = ''
        this.draft.value = ''
        this.renderSuggestions([])
        this.setRunning(true)

        try {
            this.runHandle = this.providerRunner.run(
                {
                    provider: this.providerAuth.getSelectedProvider(),
                    question,
                    terminalOutput,
                },
                {
                    output: chunk => this.appendAnalysis(chunk),
                    error: chunk => this.appendAnalysis(chunk),
                    done: code => {
                        if (code && code !== 0) {
                            this.appendAnalysis(`\nCodex exited with code ${code}.\n`)
                        }
                        this.runHandle = null
                        this.setRunning(false)
                    },
                },
            )
            this.question.value = ''
            this.recentOutputLines = []
            this.pendingOutput = ''
            this.currentInputLine = ''
            this.skipNextEmptyInputOutputLine = false
            this.render()
        } catch (error) {
            this.appendAnalysis(error instanceof Error ? error.message : `${error}`)
            this.runHandle = null
            this.setRunning(false)
        }
    }

    private cancelAnalyze (): void {
        this.runHandle?.cancel()
        this.runHandle = null
        this.setRunning(false)
    }

    private appendAnalysis (chunk: string): void {
        if (!chunk) {
            return
        }
        if (this.analysis.textContent === ANALYSIS_PLACEHOLDER) {
            this.analysis.textContent = ''
        }
        this.analysis.textContent = `${this.analysis.textContent}${chunk}`
        this.analysis.scrollTop = this.analysis.scrollHeight
        this.syncDraftFromAnalysisCodeBlock()
    }

    private syncDraftFromAnalysisCodeBlock (): void {
        const commandBlock = this.extractLastCodeBlock(this.analysis.textContent ?? '')
        if (commandBlock === null) {
            return
        }
        this.draft.value = commandBlock
    }

    private extractLastCodeBlock (text: string): string|null {
        const blocks = [...text.matchAll(/```[^\r\n`]*(?:\r?\n)?([\s\S]*?)```/g)]
        if (!blocks.length) {
            return null
        }
        const lastBlock = blocks[blocks.length - 1][1].trim()
        return lastBlock || null
    }

    private setRunning (running: boolean): void {
        this.analyzeButton.disabled = running
        this.cancelButton.hidden = !running
        this.question.disabled = running
        this.modelSelect.disabled = running
        this.refreshModelsButton.disabled = running
        this.headerLogoutButton.disabled = running
    }

    private render (): void {
        this.trimRecentOutput()
        this.element.classList.toggle('visible', this.visible)
        this.tab.element.nativeElement.classList.toggle('ai-terminal-panel-visible', this.visible)

        const lines = this.getDisplayOutputLines()
        this.output.textContent = lines.slice(-VISIBLE_OUTPUT_LINES).join('\n') || 'No terminal output captured yet.'

        if (!this.analysis.textContent && !this.runHandle) {
            this.analysis.textContent = ANALYSIS_PLACEHOLDER
        }
    }

    private refreshAfterFocus = (): void => {
        if (!this.visible) {
            return
        }
        const now = Date.now()
        if (now - this.lastFocusRefreshAt < 500) {
            return
        }
        if (this.shouldRefreshAfterFocus()) {
            this.lastFocusRefreshAt = now
            this.pendingLoginRefreshes = Math.max(0, this.pendingLoginRefreshes - 1)
            this.refreshProviderStatus()
        }
    }

    private async refreshProviderStatus (): Promise<AIProviderStatus> {
        this.applyProviderStatus({
            provider: this.providerAuth.getSelectedProvider(),
            state: 'checking',
            label: 'Checking provider status...',
        })
        const status = await this.providerAuth.checkSelectedProviderStatus()
        this.applyProviderStatus(status)
        return status
    }

    private async setProvider (provider: AIProviderID): Promise<void> {
        this.applyProviderStatus({
            provider,
            state: 'checking',
            label: 'Checking provider status...',
        })
        this.refreshModelOptions()
        this.applyProviderStatus(await this.providerAuth.setSelectedProvider(provider))
    }

    private async login (): Promise<void> {
        const status = await this.refreshProviderStatus()
        if (status.state === 'logged-in') {
            return
        }
        this.pendingLoginRefreshes = 3
        await this.providerAuth.startLogin(this.providerSelect.value as AIProviderID)
    }

    private async logout (): Promise<void> {
        const status = await this.refreshProviderStatus()
        if (status.state !== 'logged-in') {
            return
        }
        this.pendingLoginRefreshes = 0
        const logoutStarted = await this.providerAuth.confirmAndStartLogout(this.providerSelect.value as AIProviderID)
        if (!logoutStarted) {
            return
        }
        const statusAfterLogout: AIProviderStatus = {
            provider: this.providerSelect.value as AIProviderID,
            state: 'logged-out',
            label: 'Logout started in an external terminal',
            detail: 'Refresh after the provider CLI finishes.',
        }
        this.applyProviderStatus(statusAfterLogout)
        this.providerAuth.publishStatus(statusAfterLogout)
    }

    private applyProviderStatus (status: AIProviderStatus): void {
        this.lastProviderStatus = status
        this.providerSelect.value = status.provider
        this.refreshModelOptions()
        const provider = AI_PROVIDERS.find(item => item.id === status.provider)
        this.signedInIdentity.textContent = status.account ? `${provider?.label ?? status.provider} - ${status.account}` : `${provider?.label ?? status.provider}`
        this.statusLine.textContent = status.detail ? `${status.label}\n${status.detail}` : status.label
        const signedIn = status.state === 'logged-in'
        this.loginOnly.hidden = signedIn
        this.content.hidden = !signedIn
        this.signedInIdentity.hidden = !signedIn
        this.providerSelect.hidden = signedIn
        this.modelSelect.hidden = !signedIn
        this.refreshModelsButton.hidden = !signedIn
        this.headerLogoutButton.hidden = !signedIn
        this.loginOnlyLoginButton.hidden = status.state === 'checking'
        if (signedIn) {
            this.pendingLoginRefreshes = 0
        }
    }

    private shouldRefreshAfterFocus (): boolean {
        return this.pendingLoginRefreshes > 0
    }

    private async refreshModelOptions (force = false): Promise<void> {
        const provider = AI_PROVIDERS.find(item => item.id === this.providerSelect.value) ?? AI_PROVIDERS[0]
        const selectedModel = this.providerAuth.getSelectedModel()
        this.modelSelect.replaceChildren()
        this.modelSelect.appendChild(this.modelOption(selectedModel, selectedModel === 'auto' ? 'Auto model' : selectedModel))
        this.modelSelect.value = selectedModel

        const previousRefreshDisabled = this.refreshModelsButton?.disabled ?? false
        if (this.refreshModelsButton) {
            this.refreshModelsButton.disabled = true
        }

        const models = await this.providerAuth.getAvailableModels(provider.id, force)
        const modelOptions = models.includes(selectedModel) ? models : [selectedModel, ...models]
        this.modelSelect.replaceChildren()
        for (const model of modelOptions) {
            this.modelSelect.appendChild(this.modelOption(model, model === 'auto' ? 'Auto model' : model))
        }
        this.modelSelect.value = selectedModel

        if (this.refreshModelsButton) {
            this.refreshModelsButton.disabled = previousRefreshDisabled || Boolean(this.runHandle)
        }
    }

    private modelOption (value: string, label: string): HTMLOptionElement {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        return option
    }

    private renderSuggestions (suggestedCommands: SuggestedCommand[]): void {
        this.suggestions.replaceChildren()
        if (!suggestedCommands.length) {
            const empty = document.createElement('div')
            empty.className = 'ai-empty'
            empty.textContent = 'No suggestions yet. Click Analyze first.'
            this.suggestions.appendChild(empty)
            return
        }

        for (const item of suggestedCommands) {
            const card = document.createElement('div')
            card.className = 'ai-command-card'

            const command = document.createElement('code')
            command.className = 'ai-command'
            command.textContent = item.command

            const reason = document.createElement('div')
            reason.className = 'ai-command-reason'
            reason.textContent = item.reason

            card.append(command, reason, this.button('Insert to Sender', 'secondary', () => {
                this.draft.value = [this.draft.value.trimEnd(), item.command].filter(Boolean).join('\n')
            }))
            this.suggestions.appendChild(card)
        }
    }

    private sendDraftLine (): void {
        const lines = this.draft.value.split(/\r?\n/)
        const index = lines.findIndex(line => line.trim().length > 0)
        if (index === -1) {
            return
        }

        this.handleInput(`${lines[index].trimEnd()}\r`)
        this.tab.sendInput(`${lines[index].trimEnd()}\r`)
        lines.splice(index, 1)
        this.draft.value = lines.join('\n').replace(/^\n+/, '')
    }

    private sendDraftAll (): void {
        const lines = this.draft.value
            .split(/\r?\n/)
            .map(line => line.trimEnd())
            .filter(line => line.trim().length > 0)

        for (const line of lines) {
            this.handleInput(`${line}\r`)
            this.tab.sendInput(`${line}\r`)
        }
        this.draft.value = ''
    }

    private section (title: string, body: HTMLElement, buttons: HTMLButtonElement[] = []): HTMLElement {
        const section = document.createElement('div')
        section.className = 'ai-panel-section'

        const heading = document.createElement('div')
        heading.className = 'ai-panel-title'
        heading.textContent = title

        if (body.tagName === 'PRE') {
            body.classList.add(title.includes('Output') ? 'ai-output' : 'ai-analysis')
        }

        section.append(heading, body)

        if (buttons.length) {
            const actions = document.createElement('div')
            actions.className = 'ai-panel-actions'
            actions.append(...buttons)
            section.appendChild(actions)
        }

        return section
    }

    private textarea (placeholder: string, rows: number): HTMLTextAreaElement {
        const element = document.createElement('textarea')
        element.className = 'form-control'
        element.rows = rows
        element.placeholder = placeholder
        return element
    }

    private button (label: string, variant: 'primary'|'success'|'secondary', click: () => void): HTMLButtonElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `btn btn-sm btn-${variant === 'secondary' ? 'outline-secondary' : variant}`
        button.textContent = label
        button.addEventListener('click', click)
        return button
    }

    private stripAnsi (input: string): string {
        return input
            .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
            .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    }

    private trimRecentOutput (): void {
        const limit = this.getSessionOutputLimit()
        if (this.recentOutputLines.length > limit) {
            this.recentOutputLines = this.recentOutputLines.slice(-limit)
        }
    }

    private getSessionOutputLimit (): number {
        const value = Number(this.config.store.aiTerminal.maxSessionOutputLines)
        if (!Number.isFinite(value) || value < 1) {
            return 100
        }
        return Math.floor(value)
    }

    private getRecentOutputText (): string {
        return this.recentOutputLines.join('\n')
    }

    private getDisplayOutputLines (): string[] {
        const pendingLine = this.normalizeOutputLine(this.pendingOutput)
        if (!pendingLine || (this.skipNextEmptyInputOutputLine && this.shouldIgnoreEmptyEnterPrompts())) {
            return this.recentOutputLines
        }
        return [...this.recentOutputLines, pendingLine]
    }

    private handleTerminalSubmit (allowEmptyInputSuppression = true): boolean {
        const hasInput = this.currentInputLine.trim().length > 0
        if (this.shouldIgnoreEmptyEnterPrompts() && !hasInput && allowEmptyInputSuppression) {
            this.skipNextEmptyInputOutputLine = true
        } else {
            this.skipNextEmptyInputOutputLine = false
        }
        this.currentInputLine = ''
        return hasInput
    }

    private shouldIgnoreEmptyEnterPrompts (): boolean {
        return Boolean(this.config.store.aiTerminal.ignoreEmptyEnterPrompts)
    }

    private trackTerminalInput (input: string): void {
        const text = input
            .replace(/\x1b\[200~/g, '')
            .replace(/\x1b\[201~/g, '')
        let sawCommandSubmitInThisInput = false

        for (let index = 0; index < text.length; index++) {
            const char = text[index]

            if (char === '\x1b') {
                index = this.skipEscapeSequence(text, index)
                continue
            }

            if (char === '\r' || char === '\n') {
                if (char === '\r' && text[index + 1] === '\n') {
                    index++
                }
                const hadInput = this.handleTerminalSubmit(!sawCommandSubmitInThisInput)
                sawCommandSubmitInThisInput ||= hadInput
                continue
            }

            this.currentInputLine = this.applyInputCharacter(this.currentInputLine, char)
            if (this.currentInputLine.trim().length > 0) {
                this.skipNextEmptyInputOutputLine = false
            }
        }
    }

    private appendOutputLine (line: string): void {
        const normalizedLine = this.normalizeOutputLine(line)
        if (!normalizedLine.trim()) {
            return
        }

        if (this.skipNextEmptyInputOutputLine && this.shouldIgnoreEmptyEnterPrompts()) {
            this.skipNextEmptyInputOutputLine = false
            return
        }

        this.skipNextEmptyInputOutputLine = false
        this.recentOutputLines.push(normalizedLine)
        this.trimRecentOutput()
    }

    private flushPendingOutput (): void {
        if (!this.pendingOutput.trim()) {
            this.pendingOutput = ''
            return
        }

        this.appendOutputLine(this.pendingOutput)
        this.pendingOutput = ''
    }

    private normalizeOutputLine (line: string): string {
        return this.stripAnsi(line).replace(/\s+$/g, '')
    }

    private skipEscapeSequence (text: string, startIndex: number): number {
        if (text[startIndex + 1] !== '[') {
            return startIndex
        }

        let index = startIndex + 2
        while (index < text.length && !/[@-~]/.test(text[index])) {
            index++
        }
        return Math.min(index, text.length - 1)
    }

    private applyInputCharacter (current: string, char: string): string {
        if (char === '\b' || char === '\x7f') {
            return current.slice(0, -1)
        }

        if (char === '\u0015') {
            return ''
        }

        if (char === '\u0017') {
            return current.replace(/\S+\s*$/, '')
        }

        if (char === '\u0003') {
            return ''
        }

        if (char < ' ' && char !== '\t') {
            return current
        }

        return `${current}${char}`
    }

}
