import { BaseTerminalTabComponent } from 'tabby-terminal'
import { Subscription } from 'rxjs'
import { ConfigService, PlatformService } from 'tabby-core'
import { AIProviderAuthService } from './services/aiProviderAuth.service'
import { AIProviderRunnerService, AIProviderRunHandle } from './services/aiProviderRunner.service'
import { AI_PROVIDERS, AIProviderID, AIProviderStatus } from './providers'
import { stripTerminalControlSequences, TerminalOutputSanitizer } from './terminalOutputSanitizer'

const VISIBLE_OUTPUT_LINES = 14
const ANALYSIS_PLACEHOLDER = 'Analysis will stream here from the captured session output.'
const EMPTY_OUTPUT_TEXT = 'No terminal output captured yet.'
const MAX_SAVED_SENDER_COMMANDS = 10

interface SavedSenderCommand {
    name?: string
    command: string
}

export class AITerminalPanel {
    readonly element: HTMLElement
    readonly senderElement: HTMLElement
    private providerAuth: AIProviderAuthService
    private providerRunner: AIProviderRunnerService
    private header: HTMLElement
    private headerControls: HTMLElement
    private referenceFolderRow: HTMLElement
    private signedInIdentity: HTMLElement
    private providerSelect: HTMLSelectElement
    private modelSelect: HTMLSelectElement
    private statusLine: HTMLElement
    private loginOnly: HTMLElement
    private content: HTMLElement
    private headerLogoutButton: HTMLButtonElement
    private loginOnlyLoginButton: HTMLButtonElement
    private clearLatestButton: HTMLButtonElement
    private resetSessionButton: HTMLButtonElement
    private referenceFolderButton: HTMLButtonElement
    private clearReferenceFolderButton: HTMLButtonElement
    private referenceFolderPathElement: HTMLElement
    private analyzeButton: HTMLButtonElement
    private cancelButton: HTMLButtonElement
    private runningIndicator: HTMLElement
    private question: HTMLTextAreaElement
    private chatBody: HTMLElement
    private chatStack: HTMLElement
    private chatViewport: HTMLElement
    private chatHistory: HTMLElement
    private latestOutputDetails: HTMLDetailsElement
    private latestOutputSummary: HTMLElement
    private latestOutputMeta: HTMLElement
    private output: HTMLTextAreaElement
    private currentAnalysis: HTMLPreElement|null = null
    private savedCommandTabs: HTMLElement
    private draft: HTMLTextAreaElement
    private recentOutputLines: string[] = []
    private pendingOutput = ''
    private outputSanitizer = new TerminalOutputSanitizer()
    private currentInputLine = ''
    private skipNextEmptyInputOutputLine = false
    private visible = false
    private signedIn = false
    private lastPanelVisible = false
    private lastSenderVisible = false
    private chatAutoScroll = true
    private pendingLoginRefreshes = 0
    private aiSessionID: string|null = null
    private referenceFolder: string|null = null
    private lastProviderStatus: AIProviderStatus|null = null
    private lastFocusRefreshAt = 0
    private environmentRefreshPromptShown = false
    private selectedSavedCommandIndex = -1
    private senderTagEditor: HTMLElement|null = null
    private statusSubscription: Subscription
    private configSubscription: Subscription|null = null
    private runHandle: AIProviderRunHandle|null = null
    private runGeneration = 0
    private modelRefreshPromise: Promise<void>|null = null
    private layoutObserver: ResizeObserver|null = null
    private layoutFrame: number|null = null

    constructor (
        private tab: BaseTerminalTabComponent<any>,
        providerAuth: AIProviderAuthService,
        providerRunner: AIProviderRunnerService,
        private config: ConfigService,
        private platform: PlatformService,
    ) {
        this.providerAuth = providerAuth
        this.providerRunner = providerRunner
        this.statusSubscription = this.providerAuth.statusChanged$.subscribe(status => {
            this.applyProviderStatus(status)
        })
        this.element = document.createElement('aside')
        this.element.className = 'ai-terminal-panel'
        this.guardTerminalEvents(this.element)
        this.senderElement = document.createElement('div')
        this.senderElement.className = 'ai-terminal-sender'
        this.guardTerminalEvents(this.senderElement)

        this.header = document.createElement('div')
        this.header.className = 'ai-provider-header'

        this.headerControls = document.createElement('div')
        this.headerControls.className = 'ai-provider-controls'

        this.referenceFolderRow = document.createElement('div')
        this.referenceFolderRow.className = 'ai-reference-folder-row'

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
        this.modelSelect.addEventListener('pointerdown', () => {
            void this.refreshModelOptions(true)
        })
        this.modelSelect.addEventListener('focus', () => {
            void this.refreshModelOptions(true)
        })
        this.refreshModelOptions()

        this.statusLine = document.createElement('div')
        this.statusLine.className = 'ai-provider-status'

        this.loginOnly = document.createElement('div')
        this.loginOnly.className = 'ai-login-only'
        this.content = document.createElement('div')
        this.content.className = 'ai-terminal-content'

        this.headerLogoutButton = this.button('Logout', 'danger', () => this.logout())
        this.loginOnlyLoginButton = this.button('Install / Login with Provider', 'primary', () => this.login())
        this.clearLatestButton = this.button('Clear Latest', 'secondary', () => this.clearLatestSessionOutput())
        this.resetSessionButton = this.button('Reset Session', 'secondary', () => this.resetSession())
        this.resetSessionButton.classList.add('ai-reset-session-button')
        this.referenceFolderButton = this.button('Select Folder', 'secondary', () => this.selectReferenceFolder())
        this.clearReferenceFolderButton = this.button('Clear Folder', 'secondary', () => this.clearReferenceFolder())
        this.referenceFolderPathElement = document.createElement('span')
        this.referenceFolderPathElement.className = 'ai-reference-folder-path'
        this.analyzeButton = this.button('Analyze', 'primary', () => this.analyze())
        this.analyzeButton.classList.add('ai-analyze-button')
        this.cancelButton = this.button('Cancel', 'secondary', () => this.cancelAnalyze())
        this.cancelButton.hidden = true
        this.runningIndicator = this.createRunningIndicator()

        this.question = this.textarea('Example: help me analyze the recent hostapd disconnect', 3)
        this.question.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
                return
            }
            event.preventDefault()
            this.analyze()
        })
        this.chatBody = document.createElement('div')
        this.chatBody.className = 'ai-chat-body'
        this.chatStack = document.createElement('div')
        this.chatStack.className = 'ai-chat-stack'
        this.chatViewport = document.createElement('div')
        this.chatViewport.className = 'ai-chat-viewport'
        this.chatViewport.addEventListener('scroll', () => {
            this.chatAutoScroll = this.isChatScrolledToBottom()
        })
        this.chatHistory = document.createElement('div')
        this.chatHistory.className = 'ai-chat-history'

        this.output = document.createElement('textarea')
        this.output.className = 'ai-output ai-latest-output-editor'
        this.output.placeholder = EMPTY_OUTPUT_TEXT
        this.output.spellcheck = false
        this.output.rows = VISIBLE_OUTPUT_LINES
        this.output.addEventListener('input', () => this.updateLatestOutputFromEditor())
        this.output.addEventListener('blur', () => this.render())
        const latestOutput = this.collapsibleOutput('Latest Session Output', this.output)
        this.latestOutputDetails = latestOutput.details
        this.latestOutputSummary = latestOutput.summary
        this.latestOutputMeta = latestOutput.meta
        this.latestOutputDetails.classList.add('ai-latest-output')
        this.latestOutputDetails.addEventListener('toggle', () => {
            this.render()
            if (this.latestOutputDetails.open) {
                this.scrollLatestOutputToBottom()
            }
        })

        this.chatViewport.append(this.chatHistory)
        this.chatStack.append(this.chatViewport, this.latestOutputDetails)
        this.chatBody.append(this.chatStack, this.question)

        this.savedCommandTabs = document.createElement('div')
        this.savedCommandTabs.className = 'ai-saved-command-tabs'
        this.savedCommandTabs.addEventListener('wheel', event => {
            if (this.savedCommandTabs.scrollWidth <= this.savedCommandTabs.clientWidth) {
                return
            }
            event.preventDefault()
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
            this.savedCommandTabs.scrollLeft += delta
        }, { passive: false })
        this.draft = this.textarea('Commands staged here will be sent to the terminal', 6)
        this.renderSavedCommandTabs()
        this.configSubscription = this.config.changed$.subscribe(() => this.renderSavedCommandTabs())

        this.headerControls.append(
            this.providerSelect,
            this.modelSelect,
            this.resetSessionButton,
            this.headerLogoutButton,
        )
        this.referenceFolderRow.append(this.referenceFolderPathElement, this.clearReferenceFolderButton, this.referenceFolderButton)
        this.header.append(this.signedInIdentity, this.headerControls, this.referenceFolderRow)

        this.loginOnly.append(
            this.section('AI Provider', this.statusLine, [
                this.loginOnlyLoginButton,
                this.button('Refresh', 'secondary', () => this.refreshProviderStatus()),
            ]),
        )

        const chatSection = this.section('AI Chat Panel', this.chatBody, [this.clearLatestButton, this.runningIndicator, this.analyzeButton, this.cancelButton])
        chatSection.classList.add('ai-chat-section')
        this.content.append(chatSection)

        this.senderElement.append(
            this.senderSection(this.draft, [
                this.button('Clear', 'secondary', () => {
                    this.draft.value = ''
                }),
                this.button('Send Line', 'success', () => this.sendDraftLine()),
                this.button('Send All', 'success', () => this.sendDraftAll()),
            ]),
        )

        this.element.append(this.header, this.loginOnly, this.content)
        this.observeDynamicLayout()
        this.applyProviderStatus({
            provider: this.providerAuth.getSelectedProvider(),
            state: 'checking',
            label: 'Checking provider status...',
        })
        this.render()
    }

    destroy (): void {
        this.cancelAnalyze()
        this.closeSenderTagEditor()
        this.layoutObserver?.disconnect()
        if (this.layoutFrame !== null) {
            cancelAnimationFrame(this.layoutFrame)
            this.layoutFrame = null
        }
        this.statusSubscription.unsubscribe()
        this.configSubscription?.unsubscribe()
        window.removeEventListener('focus', this.refreshAfterFocus)
        this.tab.element.nativeElement.classList.remove('ai-terminal-panel-visible')
        this.tab.element.nativeElement.classList.remove('ai-terminal-sender-visible')
        this.senderElement.remove()
        this.element.remove()
    }

    appendOutput (data: string): void {
        const normalized = this.outputSanitizer.write(data).replace(/\r\n?/g, '\n')
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
        const shouldStickToBottom = this.latestOutputDetails.open && this.isLatestOutputScrolledToBottom()
        this.render()
        if (shouldStickToBottom) {
            this.scrollLatestOutputToBottom()
        }
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
        const question = this.redactSensitiveText(this.question.value.trim())
        const terminalOutput = this.redactSensitiveText(this.getRecentOutputText())
        this.currentAnalysis = this.appendSentChatMessage(question, terminalOutput)
        this.clearLatestSessionOutput()
        this.draft.value = ''
        this.setRunning(true)
        const provider = this.providerAuth.getSelectedProvider()
        const runGeneration = ++this.runGeneration

        try {
            this.runHandle = this.providerRunner.run(
                {
                    provider,
                    sessionID: this.aiSessionID,
                    referenceFolder: this.referenceFolder,
                    question,
                    terminalOutput,
                },
                {
                    session: sessionID => {
                        if (runGeneration === this.runGeneration && provider === this.providerAuth.getSelectedProvider()) {
                            this.setAISessionID(sessionID)
                        }
                    },
                    output: chunk => {
                        if (runGeneration === this.runGeneration) {
                            this.appendAnalysis(chunk)
                        }
                    },
                    error: chunk => {
                        if (runGeneration === this.runGeneration) {
                            this.appendAnalysis(chunk)
                        }
                    },
                    done: code => {
                        if (runGeneration !== this.runGeneration) {
                            return
                        }
                        if (code && code !== 0) {
                            const definition = AI_PROVIDERS.find(item => item.id === provider)
                            this.appendAnalysis(`\n${definition?.label ?? 'AI provider'} exited with code ${code}.\n`)
                        }
                        this.runHandle = null
                        this.setRunning(false)
                    },
                },
            )
            this.question.value = ''
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
        this.runGeneration++
        this.runHandle?.cancel()
        this.runHandle = null
        this.setRunning(false)
    }

    private appendAnalysis (chunk: string): void {
        if (!chunk) {
            return
        }
        const analysis = this.currentAnalysis ?? this.appendSentChatMessage('', '')
        this.currentAnalysis = analysis
        if (analysis.textContent === ANALYSIS_PLACEHOLDER) {
            analysis.textContent = ''
        }
        analysis.textContent = `${analysis.textContent}${chunk}`
        this.syncDraftFromAnalysisCodeBlock(analysis.textContent ?? '')
        this.scrollChatToBottom()
    }

    private syncDraftFromAnalysisCodeBlock (analysisText: string): void {
        const commandBlock = this.extractLastCodeBlock(analysisText)
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
        this.runningIndicator.classList.toggle('is-active', running)
        this.runningIndicator.setAttribute('aria-hidden', running ? 'false' : 'true')
        this.question.disabled = running
        this.modelSelect.disabled = running
        this.headerLogoutButton.disabled = running
        this.clearLatestButton.disabled = running
        this.resetSessionButton.disabled = running
        this.referenceFolderButton.disabled = running
        this.clearReferenceFolderButton.disabled = running
    }

    private render (): void {
        this.applyFontSize()
        this.trimRecentOutput()
        const senderVisible = this.visible && this.signedIn
        this.element.classList.toggle('visible', this.visible)
        this.senderElement.classList.toggle('visible', senderVisible)
        this.tab.element.nativeElement.classList.toggle('ai-terminal-panel-visible', this.visible)
        this.tab.element.nativeElement.classList.toggle('ai-terminal-sender-visible', senderVisible)
        if (this.visible !== this.lastPanelVisible || senderVisible !== this.lastSenderVisible) {
            this.lastPanelVisible = this.visible
            this.lastSenderVisible = senderVisible
            this.requestTerminalRefit()
        }

        const lines = this.getDisplayOutputLines()
        const outputLines = this.latestOutputDetails.open ? lines : lines.slice(-VISIBLE_OUTPUT_LINES)
        const outputText = outputLines.join('\n')
        if (document.activeElement !== this.output && this.output.value !== outputText) {
            this.output.value = outputText
        }
        this.latestOutputMeta.textContent = this.formatLineCount(lines.length)
        this.renderReferenceFolder()
        this.scheduleDynamicLayoutUpdate()
    }

    private applyFontSize (): void {
        const fontSize = this.getFontSize()
        this.element.style.setProperty('--ai-terminal-font-size', `${fontSize}px`)
        this.senderElement.style.setProperty('--ai-terminal-font-size', `${fontSize}px`)
    }

    private getFontSize (): number {
        const value = Number(this.config.store.aiTerminal.fontSize)
        if (!Number.isFinite(value) || value < 8) {
            return 12
        }
        return Math.min(24, Math.floor(value))
    }

    private setAISessionID (sessionID: string): void {
        this.aiSessionID = sessionID
        this.renderProviderIdentity()
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
        await this.maybePromptForEnvironmentRefresh(status)
        return status
    }

    private async setProvider (provider: AIProviderID): Promise<void> {
        const statusPromise = this.providerAuth.setSelectedProvider(provider)
        this.applyProviderStatus({
            provider,
            state: 'checking',
            label: 'Checking provider status...',
        })
        const status = await statusPromise
        this.applyProviderStatus(status)
        await this.maybePromptForEnvironmentRefresh(status)
    }

    private async login (): Promise<void> {
        const status = await this.refreshProviderStatus()
        if (status.state === 'logged-in') {
            return
        }
        if (status.state === 'restart-required') {
            await this.maybePromptForEnvironmentRefresh(status, true)
            return
        }
        this.pendingLoginRefreshes = 30
        try {
            await this.providerAuth.startLogin(this.providerSelect.value as AIProviderID)
        } catch (error) {
            this.pendingLoginRefreshes = 0
            this.applyProviderStatus({
                provider: this.providerSelect.value as AIProviderID,
                state: 'error',
                label: 'Could not start provider login',
                detail: error instanceof Error ? error.message : `${error}`,
            })
        }
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
        if (status.provider !== this.providerAuth.getSelectedProvider()) {
            return
        }
        if (this.lastProviderStatus && this.lastProviderStatus.provider !== status.provider) {
            this.cancelAnalyze()
            this.resetAIChatSession()
        }
        this.lastProviderStatus = status
        this.providerSelect.value = status.provider
        this.refreshModelOptions()
        this.statusLine.textContent = status.detail ? `${status.label}\n${status.detail}` : status.label
        const signedIn = status.state === 'logged-in'
        this.loginOnly.hidden = signedIn
        this.content.hidden = !signedIn
        this.signedInIdentity.hidden = !signedIn
        this.providerSelect.hidden = false
        this.modelSelect.hidden = !signedIn
        this.resetSessionButton.hidden = !signedIn
        this.headerLogoutButton.hidden = !signedIn
        this.referenceFolderRow.hidden = !signedIn
        this.loginOnlyLoginButton.hidden = status.state === 'checking'
        this.loginOnlyLoginButton.textContent = this.getLoginButtonLabel(status)
        this.signedIn = signedIn
        if (status.state !== 'restart-required') {
            this.environmentRefreshPromptShown = false
        }
        if (signedIn) {
            this.pendingLoginRefreshes = 0
        }
        this.renderProviderIdentity()
        this.render()
    }

    private getLoginButtonLabel (status: AIProviderStatus): string {
        const provider = AI_PROVIDERS.find(item => item.id === status.provider)
        const providerLabel = provider?.label ?? status.provider
        if (status.state === 'not-installed') {
            return `Install ${providerLabel}`
        }
        if (status.state === 'error') {
            return `Retry ${providerLabel} setup`
        }
        if (status.state === 'restart-required') {
            return 'Close Tabby to finish setup'
        }
        return `Sign in with ${providerLabel}`
    }

    private async maybePromptForEnvironmentRefresh (status: AIProviderStatus, force = false): Promise<void> {
        if (status.state !== 'restart-required') {
            return
        }
        if (this.environmentRefreshPromptShown && !force) {
            return
        }

        this.environmentRefreshPromptShown = true
        this.pendingLoginRefreshes = 0
        await this.providerAuth.confirmCloseForEnvironmentRefresh(status.provider)
    }

    private renderProviderIdentity (): void {
        const providerID = this.lastProviderStatus?.provider ?? this.providerAuth.getSelectedProvider()
        const provider = AI_PROVIDERS.find(item => item.id === providerID)
        const providerLabel = provider?.label ?? providerID
        this.signedInIdentity.textContent = this.signedIn ? `${providerLabel} - ${this.aiSessionID ?? 'new session'}` : providerLabel
        this.signedInIdentity.title = this.signedInIdentity.textContent ?? ''
    }

    private shouldRefreshAfterFocus (): boolean {
        return this.pendingLoginRefreshes > 0
    }

    private async refreshModelOptions (force = false): Promise<void> {
        if (this.modelRefreshPromise) {
            return this.modelRefreshPromise
        }

        this.modelRefreshPromise = this.refreshModelOptionsNow(force)
        try {
            await this.modelRefreshPromise
        } finally {
            this.modelRefreshPromise = null
        }
    }

    private async refreshModelOptionsNow (force = false): Promise<void> {
        const provider = AI_PROVIDERS.find(item => item.id === this.providerSelect.value) ?? AI_PROVIDERS[0]
        const selectedModel = this.providerAuth.getSelectedModel()
        this.modelSelect.replaceChildren()
        this.modelSelect.appendChild(this.modelOption(selectedModel, selectedModel === 'auto' ? 'Auto model' : selectedModel))
        this.modelSelect.value = selectedModel

        const models = await this.providerAuth.getAvailableModels(provider.id, force)
        const modelOptions = models.includes(selectedModel) ? models : [selectedModel, ...models]
        this.modelSelect.replaceChildren()
        for (const model of modelOptions) {
            this.modelSelect.appendChild(this.modelOption(model, model === 'auto' ? 'Auto model' : model))
        }
        this.modelSelect.value = selectedModel
    }

    private modelOption (value: string, label: string): HTMLOptionElement {
        const option = document.createElement('option')
        option.value = value
        option.textContent = label
        return option
    }

    private appendSentChatMessage (question: string, terminalOutput: string): HTMLPreElement {
        const card = document.createElement('div')
        card.className = 'ai-chat-message'

        const prompt = document.createElement('div')
        prompt.className = 'ai-chat-question'
        prompt.textContent = question || 'Analyze the recent terminal output.'

        const output = document.createElement('pre')
        output.className = 'ai-output ai-output-snapshot'
        output.textContent = terminalOutput || EMPTY_OUTPUT_TEXT

        const sentOutput = this.collapsibleOutput(
            'Session Output Sent',
            output,
            this.formatLineCount(this.countOutputLines(terminalOutput)),
        )
        sentOutput.details.classList.add('ai-chat-output-collapse')

        const analysisBlock = document.createElement('div')
        analysisBlock.className = 'ai-analysis-block'

        const analysisLabel = document.createElement('div')
        analysisLabel.className = 'ai-message-label'
        analysisLabel.textContent = 'Analysis'

        const analysis = document.createElement('pre')
        analysis.className = 'ai-analysis ai-chat-analysis'
        analysis.textContent = ANALYSIS_PLACEHOLDER

        analysisBlock.append(analysisLabel, analysis)
        card.append(prompt, sentOutput.details, analysisBlock)
        this.chatHistory.appendChild(card)
        this.scrollChatToBottom(true)
        return analysis
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

    private createSavedCommandToolbar (): HTMLElement {
        const toolbar = document.createElement('div')
        toolbar.className = 'ai-saved-command-toolbar'

        const removeButton = this.button('－', 'secondary', () => this.removeSelectedSenderCommand())
        removeButton.classList.add('ai-saved-command-control', 'is-remove')
        removeButton.title = 'Remove selected saved command'

        const addButton = this.button('＋', 'secondary', () => this.openSenderTagEditor())
        addButton.classList.add('ai-saved-command-control', 'is-add')
        addButton.title = 'Save current sender command'

        toolbar.append(this.savedCommandTabs, removeButton, addButton)
        return toolbar
    }

    private insertSavedCommandIntoDraft (command: string, index: number): void {
        this.selectedSavedCommandIndex = index
        if (this.getSenderCommandInsertMode() === 'append') {
            const current = this.draft.value.trimEnd()
            this.draft.value = current ? `${current}\n${command}` : command
        } else {
            this.draft.value = command
        }
        this.renderSavedCommandTabs()
        this.draft.focus()
    }

    private async saveSenderCommand (name: string, command: string, editIndex: number|null): Promise<void> {
        const savedCommands = this.getSavedSenderCommands()
        const item: SavedSenderCommand = {
            command: command.trim(),
        }
        if (name.trim()) {
            item.name = name.trim()
        }

        if (editIndex !== null && editIndex >= 0 && editIndex < savedCommands.length) {
            savedCommands[editIndex] = item
            this.selectedSavedCommandIndex = editIndex
        } else {
            if (savedCommands.length >= MAX_SAVED_SENDER_COMMANDS) {
                savedCommands.splice(0, savedCommands.length - MAX_SAVED_SENDER_COMMANDS + 1)
            }
            savedCommands.push(item)
            this.selectedSavedCommandIndex = savedCommands.length - 1
        }
        await this.setSavedSenderCommands(savedCommands)
    }

    private openSenderTagEditor (editIndex: number|null = null): void {
        this.closeSenderTagEditor()

        const savedCommand = editIndex === null ? null : this.getSavedSenderCommands()[editIndex]
        if (editIndex !== null && !savedCommand) {
            return
        }

        const overlay = document.createElement('div')
        overlay.className = 'ai-sender-tag-editor-overlay'
        overlay.setAttribute('role', 'presentation')
        this.guardTerminalEvents(overlay)

        const editor = document.createElement('div')
        editor.className = 'ai-sender-tag-editor'
        editor.setAttribute('role', 'dialog')
        editor.setAttribute('aria-modal', 'true')
        editor.setAttribute('aria-label', editIndex === null ? 'Save Sender Tag' : 'Edit Sender Tag')

        const title = document.createElement('div')
        title.className = 'ai-sender-tag-editor-title'
        title.textContent = editIndex === null ? 'Save Sender Tag' : 'Edit Sender Tag'

        const nameLabel = document.createElement('label')
        nameLabel.className = 'ai-sender-tag-editor-label'
        nameLabel.textContent = 'Name (optional)'

        const nameInput = document.createElement('input')
        nameInput.type = 'text'
        nameInput.className = 'form-control'
        nameInput.placeholder = 'Leave blank to use the command as the tag name'
        nameInput.value = savedCommand?.name ?? ''
        nameLabel.appendChild(nameInput)

        const commandLabel = document.createElement('label')
        commandLabel.className = 'ai-sender-tag-editor-label'
        commandLabel.textContent = 'Command'

        const commandInput = document.createElement('textarea')
        commandInput.className = 'form-control ai-sender-tag-command-input'
        commandInput.rows = 6
        commandInput.placeholder = 'Command content to save'
        commandInput.value = savedCommand?.command ?? this.draft.value.trim()
        commandLabel.appendChild(commandInput)

        const error = document.createElement('div')
        error.className = 'ai-sender-tag-editor-error'
        error.setAttribute('role', 'alert')

        const actions = document.createElement('div')
        actions.className = 'ai-sender-tag-editor-actions'
        const cancelButton = this.button('Cancel', 'secondary', () => this.closeSenderTagEditor())
        const saveButton = this.button(editIndex === null ? 'Save' : 'Update', 'primary', () => {
            const command = commandInput.value.trim()
            if (!command) {
                error.textContent = 'Command cannot be empty.'
                commandInput.focus()
                return
            }
            saveButton.disabled = true
            void this.saveSenderCommand(nameInput.value, command, editIndex).then(() => this.closeSenderTagEditor())
        })
        actions.append(cancelButton, saveButton)

        editor.append(title, nameLabel, commandLabel, error, actions)
        overlay.appendChild(editor)
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) {
                this.closeSenderTagEditor()
            }
        })
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                this.closeSenderTagEditor()
            }
        })

        this.senderTagEditor = overlay
        document.body.appendChild(overlay)
        requestAnimationFrame(() => nameInput.focus())
    }

    private closeSenderTagEditor (): void {
        this.senderTagEditor?.remove()
        this.senderTagEditor = null
    }

    private async removeSelectedSenderCommand (): Promise<void> {
        const savedCommands = this.getSavedSenderCommands()
        if (!savedCommands.length) {
            return
        }

        const index = this.selectedSavedCommandIndex >= 0 ? this.selectedSavedCommandIndex : savedCommands.length - 1
        savedCommands.splice(index, 1)
        this.selectedSavedCommandIndex = Math.min(index, savedCommands.length - 1)
        await this.setSavedSenderCommands(savedCommands)
    }

    private async setSavedSenderCommands (commands: SavedSenderCommand[]): Promise<void> {
        this.config.store.aiTerminal.savedSenderCommands = commands
        await this.config.save()
        this.renderSavedCommandTabs()
    }

    private getSavedSenderCommands (): SavedSenderCommand[] {
        const savedCommands = this.config.store.aiTerminal.savedSenderCommands
        if (!Array.isArray(savedCommands)) {
            return []
        }

        return savedCommands
            .filter((item: any) => item && typeof item.command === 'string' && item.command.trim())
            .map((item: any) => ({
                name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined,
                command: item.command.trim(),
            }))
            .slice(-MAX_SAVED_SENDER_COMMANDS)
    }

    private renderSavedCommandTabs (): void {
        const savedCommands = this.getSavedSenderCommands()
        const previousScrollLeft = this.savedCommandTabs.scrollLeft
        this.savedCommandTabs.replaceChildren()
        savedCommands.forEach((item, index) => {
            const tab = document.createElement('button')
            tab.type = 'button'
            tab.className = 'ai-saved-command-tab'
            tab.classList.toggle('is-active', index === this.selectedSavedCommandIndex)
            tab.textContent = this.buildSavedCommandLabel(item.name || item.command)
            tab.title = item.name ? `${item.name}\n\n${item.command}\n\nRight-click to edit` : `${item.command}\n\nRight-click to edit`
            tab.addEventListener('click', () => this.insertSavedCommandIntoDraft(item.command, index))
            tab.addEventListener('contextmenu', event => {
                event.preventDefault()
                this.selectedSavedCommandIndex = index
                this.renderSavedCommandTabs()
                this.openSenderTagEditor(index)
            })
            this.savedCommandTabs.appendChild(tab)
        })
        this.savedCommandTabs.scrollLeft = previousScrollLeft
    }

    private buildSavedCommandLabel (value: string): string {
        const firstLine = value.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? 'Command'
        const characters = Array.from(firstLine)
        return characters.length > 16 ? `${characters.slice(0, 16).join('')}...` : firstLine
    }

    private getSenderCommandInsertMode (): 'replace'|'append' {
        return this.config.store.aiTerminal.senderCommandInsertMode === 'append' ? 'append' : 'replace'
    }

    private senderSection (body: HTMLElement, buttons: HTMLElement[] = []): HTMLElement {
        const section = document.createElement('div')
        section.className = 'ai-panel-section ai-sender-section'

        const heading = document.createElement('div')
        heading.className = 'ai-sender-heading'

        const titleElement = document.createElement('div')
        titleElement.className = 'ai-panel-title'
        titleElement.textContent = 'Sender'

        heading.append(titleElement, this.createSavedCommandToolbar())
        section.append(heading, body)

        if (buttons.length) {
            const actions = document.createElement('div')
            actions.className = 'ai-panel-actions'
            actions.append(...buttons)
            section.appendChild(actions)
        }

        return section
    }

    private section (title: string, body: HTMLElement, buttons: HTMLElement[] = []): HTMLElement {
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

    private collapsibleOutput (title: string, body: HTMLElement, metaText = ''): { details: HTMLDetailsElement, summary: HTMLElement, meta: HTMLElement } {
        const details = document.createElement('details')
        details.className = 'ai-output-collapse'

        const summary = document.createElement('summary')
        summary.className = 'ai-output-summary'

        const label = document.createElement('span')
        label.textContent = title

        const meta = document.createElement('span')
        meta.className = 'ai-collapse-meta'
        meta.textContent = metaText

        summary.append(label, meta)
        details.append(summary, body)

        return { details, summary, meta }
    }

    private observeDynamicLayout (): void {
        if (!window.ResizeObserver) {
            this.scheduleDynamicLayoutUpdate()
            return
        }

        this.layoutObserver = new ResizeObserver(() => this.scheduleDynamicLayoutUpdate())
        this.layoutObserver.observe(this.chatStack)
        this.layoutObserver.observe(this.chatViewport)
        this.layoutObserver.observe(this.latestOutputSummary)
        this.scheduleDynamicLayoutUpdate()
    }

    private scheduleDynamicLayoutUpdate (): void {
        if (this.layoutFrame !== null) {
            return
        }
        this.layoutFrame = requestAnimationFrame(() => {
            this.layoutFrame = null
            this.updateDynamicLayout()
        })
    }

    private updateDynamicLayout (): void {
        const detailsStyle = getComputedStyle(this.latestOutputDetails)
        const borderHeight = this.toPixels(detailsStyle.borderTopWidth) + this.toPixels(detailsStyle.borderBottomWidth)
        const collapsedHeight = Math.ceil(this.latestOutputSummary.getBoundingClientRect().height + borderHeight)
        const scrollbarGutter = Math.max(0, this.chatViewport.offsetWidth - this.chatViewport.clientWidth)

        this.chatStack.style.setProperty('--ai-latest-output-collapsed-height', `${collapsedHeight}px`)
        this.chatStack.style.setProperty('--ai-chat-scrollbar-gutter', `${scrollbarGutter}px`)
    }

    private toPixels (value: string): number {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : 0
    }

    private scrollChatToBottom (force = false): void {
        if (!force && !this.chatAutoScroll) {
            return
        }
        this.chatViewport.scrollTop = this.chatViewport.scrollHeight
        this.chatAutoScroll = true
    }

    private isChatScrolledToBottom (): boolean {
        const distanceFromBottom = this.chatViewport.scrollHeight - this.chatViewport.scrollTop - this.chatViewport.clientHeight
        return distanceFromBottom < 16
    }

    private clearLatestSessionOutput (): void {
        this.recentOutputLines = []
        this.pendingOutput = ''
        this.currentInputLine = ''
        this.skipNextEmptyInputOutputLine = false
        this.output.value = ''
        this.latestOutputDetails.open = false
        this.render()
    }

    private async resetSession (): Promise<void> {
        if (this.runHandle) {
            return
        }
        if (!await this.providerAuth.confirmResetSession()) {
            return
        }

        this.resetAIChatSession()
    }

    private async selectReferenceFolder (): Promise<void> {
        if (this.runHandle) {
            return
        }
        const folder = await this.platform.pickDirectory()
        if (!folder || folder === this.referenceFolder) {
            return
        }
        if (!await this.confirmSessionResetForReferenceFolderChange()) {
            return
        }

        this.referenceFolder = folder
        this.render()
    }

    private async clearReferenceFolder (): Promise<void> {
        if (this.runHandle || !this.referenceFolder) {
            return
        }
        if (!await this.confirmSessionResetForReferenceFolderChange()) {
            return
        }

        this.referenceFolder = null
        this.render()
    }

    private async confirmSessionResetForReferenceFolderChange (): Promise<boolean> {
        if (!this.aiSessionID) {
            return true
        }
        if (!await this.providerAuth.confirmResetSession()) {
            return false
        }
        this.resetAIChatSession()
        return true
    }

    private resetAIChatSession (): void {
        this.aiSessionID = null
        this.currentAnalysis = null
        this.chatHistory.replaceChildren()
        this.draft.value = ''
        this.renderProviderIdentity()
    }

    private renderReferenceFolder (): void {
        const hasFolder = Boolean(this.referenceFolder)
        this.clearReferenceFolderButton.hidden = !hasFolder
        this.referenceFolderPathElement.hidden = !hasFolder
        if (!this.referenceFolder) {
            this.referenceFolderPathElement.textContent = ''
            this.referenceFolderPathElement.removeAttribute('title')
            return
        }

        this.referenceFolderPathElement.textContent = this.formatReferenceFolderPath(this.referenceFolder)
        this.referenceFolderPathElement.title = this.referenceFolder
    }

    private formatReferenceFolderPath (folder: string): string {
        const normalized = folder.replace(/\\/g, '/').replace(/\/+$/g, '')
        const name = normalized.split('/').filter(Boolean).pop()
        return name ? `.../${name}` : normalized
    }

    private updateLatestOutputFromEditor (): void {
        this.recentOutputLines = this.output.value ? this.output.value.split(/\r?\n/) : []
        this.pendingOutput = ''
        this.currentInputLine = ''
        this.skipNextEmptyInputOutputLine = false
        this.trimRecentOutput()
        this.latestOutputMeta.textContent = this.formatLineCount(this.recentOutputLines.length)
    }

    private requestTerminalRefit (): void {
        setTimeout(() => this.tab.configure())
        setTimeout(() => this.tab.configure(), 80)
    }

    private scrollLatestOutputToBottom (): void {
        requestAnimationFrame(() => {
            this.output.scrollTop = this.output.scrollHeight
        })
    }

    private isLatestOutputScrolledToBottom (): boolean {
        const distanceFromBottom = this.output.scrollHeight - this.output.scrollTop - this.output.clientHeight
        return distanceFromBottom < 16
    }

    private guardTerminalEvents (element: HTMLElement): void {
        element.tabIndex = -1
        const stopPropagation = (event: Event) => event.stopPropagation()
        element.addEventListener('mousedown', event => {
            this.focusEventSurface(element, event)
            event.stopPropagation()
        })
        for (const eventName of ['click', 'mouseup', 'dblclick', 'contextmenu']) {
            element.addEventListener(eventName, stopPropagation)
        }
        for (const eventName of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'copy', 'cut', 'paste']) {
            element.addEventListener(eventName, stopPropagation)
        }
        element.addEventListener('wheel', stopPropagation, { passive: true })
        element.addEventListener('touchmove', stopPropagation, { passive: true })
    }

    private focusEventSurface (surface: HTMLElement, event: MouseEvent): void {
        const target = event.target
        if (!(target instanceof HTMLElement)) {
            return
        }
        if (target.closest('textarea, input, select, button, a, [contenteditable="true"]')) {
            return
        }
        surface.focus({ preventScroll: true })
    }

    private textarea (placeholder: string, rows: number): HTMLTextAreaElement {
        const element = document.createElement('textarea')
        element.className = 'form-control'
        element.rows = rows
        element.placeholder = placeholder
        return element
    }

    private button (label: string, variant: 'primary'|'success'|'secondary'|'danger', click: () => void): HTMLButtonElement {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `btn btn-sm btn-${variant === 'secondary' ? 'outline-secondary' : variant}`
        button.textContent = label
        button.addEventListener('click', click)
        return button
    }

    private createRunningIndicator (): HTMLElement {
        const indicator = document.createElement('span')
        indicator.className = 'ai-running-indicator'
        indicator.setAttribute('role', 'status')
        indicator.setAttribute('aria-live', 'polite')
        indicator.setAttribute('aria-hidden', 'true')

        const spinner = document.createElement('span')
        spinner.className = 'ai-running-spinner'

        const label = document.createElement('span')
        label.textContent = 'Thinking...'

        indicator.append(spinner, label)
        return indicator
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

    private redactSensitiveText (text: string): string {
        return text
            .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted-private-key]')
            .replace(/(authorization\s*:\s*bearer\s+)[^\s'"]+/gi, '$1[redacted]')
            .replace(/\b(sk-[A-Za-z0-9_-]{20,})\b/g, '[redacted-openai-key]')
            .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, '[redacted-github-token]')
            .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[redacted-aws-key]')
            .replace(/\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/g, '[redacted-slack-token]')
            .replace(/:\/\/([^:\s/@]+):([^@\s]+)@/g, '://[redacted]@')
            .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|pwd)\s*([:=])\s*(["'])(?:(?!\3).)*\3/gi, '$1$2$3[redacted]$3')
            .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|pwd)\s*([:=])\s*([^\s'"]+)/gi, '$1$2[redacted]')
    }

    private countOutputLines (output: string): number {
        return output ? output.split(/\r?\n/).length : 0
    }

    private formatLineCount (lineCount: number): string {
        if (lineCount === 0) {
            return 'empty'
        }
        return lineCount === 1 ? '1 line' : `${lineCount} lines`
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
        return stripTerminalControlSequences(line).replace(/\s+$/g, '')
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
