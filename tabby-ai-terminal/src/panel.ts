import { BaseTerminalTabComponent } from 'tabby-terminal'
import { Subscription } from 'rxjs'
import { SuggestedCommand } from './analysis'
import { AIProviderAuthService } from './services/aiProviderAuth.service'
import { AIProviderRunnerService, AIProviderRunHandle } from './services/aiProviderRunner.service'
import { AI_PROVIDERS, AIProviderID, AIProviderStatus } from './providers'

const RECENT_OUTPUT_LIMIT = 12000
const VISIBLE_OUTPUT_LINES = 14

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
    private question: HTMLTextAreaElement
    private output: HTMLElement
    private analysis: HTMLElement
    private suggestions: HTMLElement
    private draft: HTMLTextAreaElement
    private recentOutput = ''
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
        this.recentOutput = `${this.recentOutput}${this.stripAnsi(data)}`.slice(-RECENT_OUTPUT_LIMIT)
        this.render()
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
        this.analysis.textContent = ''
        this.draft.value = ''
        this.renderSuggestions([])
        this.setRunning(true)

        try {
            this.runHandle = this.providerRunner.run(
                {
                    provider: this.providerAuth.getSelectedProvider(),
                    question: this.question.value,
                    terminalOutput: this.recentOutput,
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
        this.headerLogoutButton.disabled = running
    }

    private render (): void {
        this.element.classList.toggle('visible', this.visible)
        this.tab.element.nativeElement.classList.toggle('ai-terminal-panel-visible', this.visible)

        const lines = this.recentOutput.split(/\r?\n/).filter(Boolean)
        this.output.textContent = lines.slice(-VISIBLE_OUTPUT_LINES).join('\n') || 'No terminal output captured yet.'

        if (!this.analysis.textContent) {
            this.analysis.textContent = 'Ask a question and click Analyze. Suggestions will be generated from recent terminal output.'
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
        this.headerLogoutButton.hidden = !signedIn
        this.loginOnlyLoginButton.hidden = status.state === 'checking'
        if (signedIn) {
            this.pendingLoginRefreshes = 0
        }
    }

    private shouldRefreshAfterFocus (): boolean {
        return this.pendingLoginRefreshes > 0
    }

    private refreshModelOptions (): void {
        const provider = AI_PROVIDERS.find(item => item.id === this.providerSelect.value) ?? AI_PROVIDERS[0]
        this.modelSelect.replaceChildren()
        for (const model of provider.models) {
            const option = document.createElement('option')
            option.value = model
            option.textContent = model === 'auto' ? 'Auto model' : model
            this.modelSelect.appendChild(option)
        }
        this.modelSelect.value = this.providerAuth.getSelectedModel()
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

}
