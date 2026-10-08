import { BaseTerminalTabComponent } from 'tabby-terminal'
import { Subscription } from 'rxjs'
import { ConfigService, MenuItemOptions, PlatformService } from 'tabby-core'
import { AIProviderAuthService } from './services/aiProviderAuth.service'
import { AIProviderRunnerService, AIProviderRunHandle, AIToolPermissionRequest } from './services/aiProviderRunner.service'
import { AI_PROVIDERS, AIProviderID, AIProviderStatus } from './providers'
import { TerminalOutputCapture } from './outputCapture'
import { BuiltDialog, buildFormDialog, buildGroupColorDialog, createDialog } from './dialogs'
import { button, guardTerminalEvents, textarea } from './dom'
import { extractSuggestedCommands, renderMarkdown } from './markdown'
import { redactSensitiveText } from './redaction'
import {
    ALL_GROUPS_COLOR,
    GROUP_COLORS,
    MAX_SAVED_SENDER_COMMANDS,
    SavedSenderCommand,
    UNGROUPED_FILTER,
    applyGroupColor,
    automaticGroupColors,
    buildSavedCommandLabel,
    chosenGroupColor,
    fillVariables,
    findVariableNames,
    getGroupEndIndex,
    getSavedGroups,
    groupColorHex,
    matchesGroupFilter,
    normalizeGroupName,
    normalizeSavedCommands,
    withGroupColor,
} from './senderTags'

const VISIBLE_OUTPUT_LINES = 14
const ANALYSIS_PLACEHOLDER = 'Analysis will stream here from the captured session output.'
const EMPTY_OUTPUT_TEXT = 'No terminal output captured yet.'
/** How long "CLI is up to date" / "CLI update failed" stays in the header after a check */
const CLI_NOTICE_MS = 60 * 1000
let tagGroupListSeq = 0
const DEFAULT_PROMPT_PATTERN = '[#$>]\\s*$'
const DEFAULT_DANGEROUS_COMMAND_PATTERNS = [
    '\\breboot\\b', '\\bpoweroff\\b', '\\bhalt\\b', '\\bfirstboot\\b', '\\bjffs2reset\\b', '\\bsysupgrade\\b',
    '\\bmtd\\s+(-\\S+\\s+)*(erase|write|unlock)\\b', '\\bdd\\b.*\\bof=/dev/', '\\brm\\s+-\\w*[rf]', '\\bmkfs',
    '\\buci\\s+(commit|import|batch)\\b', '\\bfw_setenv\\b', '^\\s*wifi(\\s+(up|down|reload))?\\s*$',
    '/etc/init\\.d/\\S+\\s+(stop|restart|disable)\\b', '\\bkillall\\b', '\\bkill\\s+-9\\b',
]
const CLAUDE_MODE_LABELS: Partial<Record<string, string>> = { plan: 'Plan', manual: 'Manual', acceptEdits: 'Edit automatically', auto: 'Auto' }

interface PendingPermission {
    requestID: string
    finish: (allowed: boolean, label: string) => void
}

interface AnswerRunInfo {
    question: string
    terminalOutput: string
    provider: AIProviderID
    startedAt: number
    model: string
    mode: string
}

interface LiveRenderState {
    timer: ReturnType<typeof setTimeout>|null
    view: HTMLElement|null
}

export class AITerminalPanel {
    readonly element: HTMLElement
    readonly senderElement: HTMLElement
    private header: HTMLElement
    private headerControls: HTMLElement
    private referenceFolderRow: HTMLElement
    private signedInIdentity: HTMLElement
    private cliNoticeTimer: ReturnType<typeof setTimeout>|null = null
    private providerSelect: HTMLSelectElement
    private modelSelect: HTMLSelectElement
    private modeSelect: HTMLSelectElement
    private effortSelect: HTMLSelectElement
    private modelRow: HTMLElement
    private modeRow: HTMLElement
    private headerFooter: HTMLElement
    private headerSummary: HTMLElement
    private headerSummaryText: HTMLElement
    private headerCollapseButton: HTMLButtonElement
    private statusLine: HTMLElement
    private loginOnly: HTMLElement
    private content: HTMLElement
    private moreButton: HTMLButtonElement
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
    private latestOutputPreview: HTMLElement
    /** While true the captured output opens on an empty chat and closes after Analyze */
    private latestOutputAuto = true
    private emptyState: HTMLElement
    private exampleRow: HTMLElement
    private jumpLatestButton: HTMLButtonElement
    private output: HTMLTextAreaElement
    private currentAnalysis: HTMLElement|null = null
    private liveRenders = new WeakMap<HTMLElement, LiveRenderState>()
    private answerViewer: HTMLElement|null = null
    private questionHistory: string[] = []
    private questionHistoryIndex = -1
    private retryPayload: { question: string, terminalOutput: string }|null = null
    private runningLabel: HTMLElement|null = null
    private runningTimer: ReturnType<typeof setInterval>|null = null
    private pendingPermissions: PendingPermission[] = []
    /** Tags of one group chip, in a panel that opens upwards from the chip */
    private tagMenu: HTMLElement|null = null
    /** Which chip the open tag menu belongs to: '' (all tags), a group name or UNGROUPED_FILTER */
    private tagMenuFilter: string|null = null
    private savedGroupBar: HTMLElement
    private draft: HTMLTextAreaElement
    /** The tab name last written into the send button tooltips */
    private senderTargetLabel = ''
    private senderNextPreview: HTMLElement
    private senderLineButton: HTMLButtonElement
    private senderAllButton: HTMLButtonElement
    private senderStopButton: HTMLButtonElement
    private senderBusy = false
    private senderStopRequested = false
    private senderForceOpen = false
    private senderPointerDown = false
    /** True from Analyze until the answer ends, including a wait for a CLI update */
    private analyzing = false
    private providerSwitchedDuringRun = false
    private destroyed = false
    private openLink = (url: string): void => this.platform.openExternal(url)
    private modelOptionsProvider: AIProviderID|null = null
    /** Automatic group colors, computed once per tag render */
    private automaticGroupColors: Map<string, string>|null = null
    private senderNotice = ''
    private senderProgress = ''
    private lineSeqAtSend = 0
    private promptAtLineSeq = 0
    private promptPatternSource: string|null = null
    private promptPattern = /[#$>]\s*$/
    private dangerousPatternSource: string[]|null = null
    private dangerousPatterns: RegExp[] = []
    private outputRenderTimer: ReturnType<typeof setTimeout>|null = null
    private appliedFontSize = 0
    private appliedPanelWidth = 0
    private appliedSenderHeight = 0

    /** Captured terminal output: the lines sent with the next question */
    private capture = new TerminalOutputCapture({
        lineLimit: () => this.getSessionOutputLimit(),
        ignoreEmptyEnterPrompts: () => Boolean(this.config.store.aiTerminal.ignoreEmptyEnterPrompts),
    })

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
    private dragTagIndex: number|null = null
    private dragGroup: string|null = null
    private senderTagEditor: HTMLElement|null = null
    private statusSubscription: Subscription
    private cliUpdateSubscription: Subscription
    private configSubscription: Subscription|null = null
    private runHandle: AIProviderRunHandle|null = null
    private runGeneration = 0
    private modelRefreshPromise: Promise<void>|null = null
    private layoutObserver: ResizeObserver|null = null
    private layoutFrame: number|null = null

    constructor (
        private tab: BaseTerminalTabComponent<any>,
        private providerAuth: AIProviderAuthService,
        private providerRunner: AIProviderRunnerService,
        private config: ConfigService,
        private platform: PlatformService,
    ) {
        this.statusSubscription = this.providerAuth.statusChanged$.subscribe(status => {
            this.applyProviderStatus(status)
        })
        this.cliUpdateSubscription = this.providerAuth.cliUpdated$.subscribe(() => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!this.signedInIdentity) {
                return
            }
            this.renderProviderIdentity()
            // The short "up to date" / "failed" note only stays for a minute
            if (this.cliNoticeTimer) {
                clearTimeout(this.cliNoticeTimer)
            }
            this.cliNoticeTimer = setTimeout(() => {
                this.cliNoticeTimer = null
                this.renderProviderIdentity()
            }, CLI_NOTICE_MS + 100)
        })
        this.element = document.createElement('aside')
        this.element.className = 'ai-terminal-panel'
        guardTerminalEvents(this.element)
        this.senderElement = document.createElement('div')
        this.senderElement.className = 'ai-terminal-sender'
        guardTerminalEvents(this.senderElement)

        this.buildHeaderControls()
        this.buildChat()
        this.buildSenderInput()
        this.assembleHeaderAndChat()
        this.assembleSender()
        this.element.append(this.header, this.loginOnly, this.content)
        this.installResizeHandle(this.element, 'x')
        this.installResizeHandle(this.senderElement, 'y')
        this.observeDynamicLayout()
        this.applyProviderStatus({
            provider: this.providerAuth.getSelectedProvider(),
            state: 'checking',
            label: 'Checking provider status...',
        })
        this.render()
        this.updateSenderState()
    }

    /** Header controls: provider, model, mode and effort selects, buttons and the running indicator */
    private buildHeaderControls (): void {
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
            if (this.modelSelect.value === '__recheck__') {
                this.modelSelect.value = this.providerAuth.getSelectedModel()
                this.recheckModels()
                return
            }
            this.providerAuth.setSelectedModel(this.modelSelect.value)
        })
        // Lists are cached by the auth service, so opening the menu does not spawn the CLI each time
        this.modelSelect.addEventListener('pointerdown', () => {
            void this.refreshModelOptions()
        })
        this.modelSelect.addEventListener('focus', () => {
            void this.refreshModelOptions()
        })
        this.modeSelect = this.createSettingSelect('claudeMode', [
            ['plan', 'Plan (read-only)'],
            ['manual', 'Manual'],
            ['acceptEdits', 'Edit automatically'],
            ['auto', 'Auto'],
        ], 'plan', 'Plan: read-only\nManual: ask before every edit or command\nEdit automatically: accept edits in the selected folder\nAuto: Claude Code safety check decides, risky actions ask')
        this.effortSelect = this.createSettingSelect('claudeEffort', [
            ['auto', 'auto'],
            ['low', 'low'],
            ['medium', 'medium'],
            ['high', 'high'],
            ['xhigh', 'xhigh'],
            ['max', 'max'],
        ], 'auto', 'Reasoning effort')
        this.refreshModelOptions()

        this.statusLine = document.createElement('div')
        this.statusLine.className = 'ai-provider-status'

        this.loginOnly = document.createElement('div')
        this.loginOnly.className = 'ai-login-only'
        this.content = document.createElement('div')
        this.content.className = 'ai-terminal-content'

        this.moreButton = button('⋯', 'secondary', event => this.openMoreMenu(event))
        this.moreButton.classList.add('ai-more-button')
        this.moreButton.title = 'Update CLI, re-check models, log out'
        this.loginOnlyLoginButton = button('Install / Login with Provider', 'primary', () => this.login())
        this.clearLatestButton = button('Clear output', 'secondary', () => this.clearLatestSessionOutput())
        this.clearLatestButton.title = 'Clear the captured output (nothing is sent)'
        this.resetSessionButton = button('Reset Session', 'secondary', () => this.resetSession())
        this.resetSessionButton.classList.add('ai-reset-session-button')
        this.referenceFolderButton = button('Select Folder', 'secondary', () => this.selectReferenceFolder())
        this.clearReferenceFolderButton = button('Clear Folder', 'secondary', () => this.clearReferenceFolder())
        this.referenceFolderPathElement = document.createElement('span')
        this.referenceFolderPathElement.className = 'ai-reference-folder-path'
        this.analyzeButton = button('Analyze', 'primary', () => this.analyze())
        this.analyzeButton.classList.add('ai-analyze-button')
        this.cancelButton = button('Cancel', 'secondary', () => this.cancelAnalyze())
        this.cancelButton.hidden = true
        this.runningIndicator = this.createRunningIndicator()
    }

    /** Question box, chat history and the "Output to send" editor */
    private buildChat (): void {
        this.question = textarea('Ask about the output (Enter to send)', 1)
        this.question.classList.add('ai-question-input')
        this.question.title = 'Enter: send - Shift+Enter: new line - Up/Down: previous questions - Esc: cancel'
        this.question.addEventListener('input', () => this.updateQuestionBox())
        this.question.addEventListener('keydown', event => {
            if (event.isComposing) {
                return
            }
            if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !this.question.value.includes('\n') && this.questionHistory.length) {
                const atStart = this.question.selectionStart === 0 && this.question.selectionEnd === 0
                const browsing = this.questionHistoryIndex !== -1
                if (event.key === 'ArrowUp' && (atStart || !this.question.value || browsing)) {
                    event.preventDefault()
                    this.questionHistoryIndex = this.questionHistoryIndex === -1 ? this.questionHistory.length - 1 : Math.max(0, this.questionHistoryIndex - 1)
                    this.question.value = this.questionHistory[this.questionHistoryIndex]
                    this.updateQuestionBox()
                    return
                }
                if (event.key === 'ArrowDown' && browsing) {
                    event.preventDefault()
                    this.questionHistoryIndex = this.questionHistoryIndex + 1 >= this.questionHistory.length ? -1 : this.questionHistoryIndex + 1
                    this.question.value = this.questionHistoryIndex === -1 ? '' : this.questionHistory[this.questionHistoryIndex]
                    this.updateQuestionBox()
                    return
                }
            }
            if (event.key !== 'Enter' || event.shiftKey) {
                return
            }
            event.preventDefault()
            this.analyze()
        })
        this.element.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.analyzing) {
                event.preventDefault()
                this.cancelAnalyze()
            }
        })
        this.chatBody = document.createElement('div')
        this.chatBody.className = 'ai-chat-body'
        this.chatStack = document.createElement('div')
        this.chatStack.className = 'ai-chat-stack'
        this.chatViewport = document.createElement('div')
        this.chatViewport.className = 'ai-chat-viewport'
        this.chatViewport.addEventListener('scroll', () => {
            this.chatAutoScroll = this.isChatScrolledToBottom()
            if (this.chatAutoScroll) {
                this.jumpLatestButton.hidden = true
            }
        })
        this.jumpLatestButton = button('↓ Latest', 'primary', () => {
            this.jumpLatestButton.hidden = true
            this.scrollChatToBottom(true)
        })
        this.jumpLatestButton.classList.add('ai-jump-latest')
        this.jumpLatestButton.hidden = true
        this.emptyState = document.createElement('div')
        this.emptyState.className = 'ai-empty-state'
        this.emptyState.textContent = 'Output from this tab is captured automatically and shown in "Output to send". Ask a question, or press Analyze to explain the latest output.'
        this.exampleRow = document.createElement('div')
        this.exampleRow.className = 'ai-example-row'
        for (const [label, prompt] of [
            ['Analyze output', ''],
            ['Why did the STA disconnect?', 'Why did the STA disconnect?'],
            ['Summarize errors', 'Summarize the errors and warnings in the output.'],
        ]) {
            const chip = document.createElement('button')
            chip.type = 'button'
            chip.className = 'ai-example-chip'
            chip.textContent = label
            chip.addEventListener('click', () => {
                this.question.value = prompt
                void this.analyze()
            })
            this.exampleRow.appendChild(chip)
        }
        this.chatHistory = document.createElement('div')
        this.chatHistory.className = 'ai-chat-history'

        this.output = document.createElement('textarea')
        this.output.className = 'ai-output ai-latest-output-editor'
        this.output.placeholder = EMPTY_OUTPUT_TEXT
        this.output.spellcheck = false
        this.output.rows = VISIBLE_OUTPUT_LINES
        this.output.addEventListener('input', () => this.updateLatestOutputFromEditor())
        this.output.addEventListener('blur', () => this.render())
        const latestOutput = this.collapsibleOutput('Output to send', this.output)
        this.latestOutputDetails = latestOutput.details
        this.latestOutputSummary = latestOutput.summary
        this.latestOutputMeta = latestOutput.meta
        this.latestOutputDetails.classList.add('ai-latest-output')
        this.latestOutputPreview = document.createElement('span')
        this.latestOutputPreview.className = 'ai-output-preview'
        this.latestOutputMeta.before(this.latestOutputPreview)
        this.latestOutputSummary.addEventListener('click', () => {
            this.latestOutputAuto = false
        })
        this.latestOutputDetails.addEventListener('toggle', () => {
            this.render()
            if (this.latestOutputDetails.open) {
                this.scrollLatestOutputToBottom()
            }
        })

        this.chatViewport.append(this.emptyState, this.chatHistory)
        this.chatStack.append(this.chatViewport, this.jumpLatestButton, this.latestOutputDetails)
        this.chatBody.append(this.chatStack, this.exampleRow, this.question)
    }

    /** Sender tag and group bars, the draft and the listeners that keep the sender open or collapse it */
    private buildSenderInput (): void {
        this.savedGroupBar = document.createElement('div')
        this.savedGroupBar.className = 'ai-saved-group-bar'
        this.savedGroupBar.addEventListener('wheel', event => {
            if (this.savedGroupBar.scrollWidth <= this.savedGroupBar.clientWidth) {
                return
            }
            event.preventDefault()
            this.savedGroupBar.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        }, { passive: false })
        this.draft = textarea('Type a command to stage it here - sent to the terminal one line at a time', 6)
        this.draft.addEventListener('input', () => {
            // A "Stopped" notice is about the previous draft; editing dismisses it
            this.senderNotice = ''
            this.updateSenderState()
        })
        this.draft.addEventListener('focus', () => this.updateSenderState())
        this.draft.addEventListener('blur', event => {
            // Clicking tags, groups or buttons of the sender keeps it open, so they do not move under the pointer
            const related = event.relatedTarget
            if (this.senderPointerDown || related instanceof Node && (this.senderElement.contains(related) || this.tagMenu?.contains(related))) {
                this.senderForceOpen = true
                return
            }
            this.senderForceOpen = false
            this.updateSenderState()
        })
        this.senderElement.addEventListener('mousedown', () => {
            this.senderPointerDown = true
            setTimeout(() => {
                this.senderPointerDown = false
            })
        }, true)
        document.addEventListener('mousedown', this.collapseSenderOnOutsideClick, true)
        this.renderSavedCommandTabs()
        this.configSubscription = this.config.changed$.subscribe(() => {
            this.renderSavedCommandTabs()
            this.updateHeaderSummary()
            // Settings saved elsewhere (e.g. font size) must apply without waiting for terminal output
            if (this.getFontSize() !== this.appliedFontSize) {
                this.applyFontSize()
                if (this.visible) {
                    this.updateQuestionBox()
                    this.scheduleDynamicLayoutUpdate()
                }
            }
        })
    }

    /** Puts the header rows, the sign-in view and the chat section together */
    private assembleHeaderAndChat (): void {
        this.resetSessionButton.textContent = 'New session'
        this.resetSessionButton.title = 'Start a new conversation'
        this.headerControls.append(
            this.providerSelect,
            this.resetSessionButton,
            this.moreButton,
        )
        this.headerCollapseButton = document.createElement('button')
        this.headerCollapseButton.type = 'button'
        this.headerCollapseButton.className = 'ai-header-chevron'
        this.headerCollapseButton.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        this.headerCollapseButton.addEventListener('click', event => {
            event.stopPropagation()
            this.setHeaderCollapsed(!this.header.classList.contains('is-collapsed'))
        })
        this.headerFooter = document.createElement('div')
        this.headerFooter.className = 'ai-header-footer'
        this.headerSummary = document.createElement('div')
        this.headerSummary.className = 'ai-header-summary'
        this.headerSummary.title = 'Click to show settings'
        this.headerSummaryText = document.createElement('span')
        this.headerSummaryText.className = 'ai-header-summary-text'
        const summaryNewSession = button('New session', 'secondary', event => {
            event.stopPropagation()
            void this.resetSession()
        })
        summaryNewSession.title = 'Start a new conversation'
        this.headerSummary.append(this.headerSummaryText, summaryNewSession)
        this.headerSummary.addEventListener('click', () => this.setHeaderCollapsed(false))
        this.modelRow = this.labeledRow([['Model', this.modelSelect]])
        this.modeRow = this.labeledRow([['Mode', this.modeSelect], ['Effort', this.effortSelect]])
        const folderLabel = document.createElement('span')
        folderLabel.className = 'ai-header-label'
        folderLabel.textContent = 'Folder'
        // The folder looks like the selects above: the whole field picks a folder, ✕ clears it
        this.referenceFolderButton.className = 'ai-folder-field-button'
        const folderIcon = document.createElement('span')
        folderIcon.className = 'ai-folder-icon'
        folderIcon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.75 3.5h4.2l1.4 1.5h6.9v7.75H1.75z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
        this.referenceFolderButton.replaceChildren(folderIcon, this.referenceFolderPathElement)
        this.clearReferenceFolderButton.className = 'ai-folder-clear-button'
        this.clearReferenceFolderButton.textContent = '✕'
        this.clearReferenceFolderButton.title = 'Clear folder'
        const folderField = document.createElement('div')
        folderField.className = 'form-control form-control-sm ai-folder-field'
        folderField.append(this.referenceFolderButton, this.clearReferenceFolderButton)
        folderField.addEventListener('click', event => {
            if (event.target === folderField && !this.referenceFolderButton.disabled) {
                void this.selectReferenceFolder()
            }
        })
        this.referenceFolderRow.append(folderLabel, folderField)
        this.headerFooter.append(this.signedInIdentity)
        this.header.append(
            this.headerSummary,
            this.headerControls,
            this.modelRow,
            this.modeRow,
            this.referenceFolderRow,
            this.headerFooter,
            this.headerCollapseButton,
        )

        this.loginOnly.append(
            this.section('AI Provider', this.statusLine, [
                this.loginOnlyLoginButton,
                button('Refresh', 'secondary', () => this.refreshProviderStatus()),
            ]),
        )

        const chatSection = this.section('AI Chat Panel', this.chatBody, [this.clearLatestButton, this.runningIndicator, this.analyzeButton, this.cancelButton])
        chatSection.classList.add('ai-chat-section')
        chatSection.querySelector(':scope > .ai-panel-title')?.remove()
        this.content.append(chatSection)
    }

    /** Sender actions (Send next / Send all / Stop) and the click that expands a collapsed sender */
    private assembleSender (): void {
        this.senderNextPreview = document.createElement('span')
        this.senderNextPreview.className = 'ai-sender-next'
        this.senderLineButton = button('Send next', 'success', () => this.sendDraftLine())
        this.senderAllButton = button('Send all', 'success', () => this.sendDraftAll())
        this.senderStopButton = button('Stop', 'danger', () => {
            this.senderStopRequested = true
        })
        this.senderStopButton.hidden = true
        this.senderElement.append(
            this.senderSection(this.draft, [
                this.senderNextPreview,
                this.senderLineButton,
                this.senderAllButton,
                this.senderStopButton,
            ]),
        )
        this.senderElement.addEventListener('click', event => {
            // Tags and groups work in the collapsed sender without expanding it. The path is
            // recorded at dispatch, so it still holds the heading after a click re-renders the tags
            if (event.composedPath().some(node => node instanceof Element && node.classList.contains('ai-sender-heading'))) {
                return
            }
            if (this.tab.element.nativeElement.classList.contains('ai-terminal-sender-collapsed')) {
                this.senderForceOpen = true
                this.updateSenderState()
                setTimeout(() => this.draft.focus())
            }
        })
    }

    destroy (): void {
        this.destroyed = true
        this.senderStopRequested = true
        this.cancelAnalyze()
        this.closeSenderTagEditor()
        this.closeTagMenu()
        this.closeAnswerViewer()
        if (this.outputRenderTimer) {
            clearTimeout(this.outputRenderTimer)
            this.outputRenderTimer = null
        }
        this.layoutObserver?.disconnect()
        if (this.layoutFrame !== null) {
            cancelAnimationFrame(this.layoutFrame)
            this.layoutFrame = null
        }
        this.statusSubscription.unsubscribe()
        this.cliUpdateSubscription.unsubscribe()
        if (this.cliNoticeTimer) {
            clearTimeout(this.cliNoticeTimer)
        }
        this.configSubscription?.unsubscribe()
        window.removeEventListener('focus', this.refreshAfterFocus)
        document.removeEventListener('mousedown', this.collapseSenderOnOutsideClick, true)
        this.tab.element.nativeElement.classList.remove('ai-terminal-panel-visible')
        this.tab.element.nativeElement.classList.remove('ai-terminal-sender-visible')
        this.senderElement.remove()
        this.element.remove()
    }

    appendOutput (data: string): void {
        if (!this.capture.write(data)) {
            return
        }
        // While "Send all" is waiting, remember when a shell prompt appears after new output lines
        if (this.senderBusy && this.capture.pending.length < 300 && this.getPromptPattern().test(this.capture.getPendingLine())) {
            this.promptAtLineSeq = this.capture.lineSeq
        }
        this.scheduleOutputRender()
    }

    /** Output is only recorded while the panel is hidden; when visible, re-render at most every 100 ms */
    private scheduleOutputRender (): void {
        if (!this.visible || this.outputRenderTimer) {
            return
        }
        this.outputRenderTimer = setTimeout(() => {
            this.outputRenderTimer = null
            if (!this.visible) {
                return
            }
            const shouldStickToBottom = this.latestOutputDetails.open && this.isLatestOutputScrolledToBottom()
            this.render()
            if (shouldStickToBottom) {
                this.scrollLatestOutputToBottom()
            }
        }, 100)
    }

    handleInput (data: string|Buffer): void {
        const text = Buffer.isBuffer(data) ? data.toString('utf-8') : data
        if (text) {
            this.capture.trackInput(text)
        }
    }

    toggle (): void {
        this.visible = !this.visible
        this.render()

        if (this.visible) {
            this.updateQuestionBox()
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
        if (this.analyzing) {
            return
        }
        const retry = this.retryPayload
        this.retryPayload = null
        let question = ''
        let terminalOutput = ''
        if (retry) {
            question = retry.question
            terminalOutput = retry.terminalOutput
        } else {
            this.capture.flush()
            this.capture.resetInputTracking()
            question = redactSensitiveText(this.question.value.trim())
            terminalOutput = redactSensitiveText(this.capture.getText())
            if (question && this.questionHistory[this.questionHistory.length - 1] !== question) {
                this.questionHistory.push(question)
                this.questionHistory = this.questionHistory.slice(-50)
            }
            this.questionHistoryIndex = -1
        }
        this.currentAnalysis = this.appendSentChatMessage(question, terminalOutput)
        this.latestOutputAuto = true
        if (!retry) {
            this.clearLatestSessionOutput()
        }
        this.latestOutputDetails.open = false
        this.setRunning(true)
        const provider = this.providerAuth.getSelectedProvider()
        const runGeneration = ++this.runGeneration
        const runInfo: AnswerRunInfo = {
            question,
            terminalOutput,
            provider,
            startedAt: Date.now(),
            model: this.providerAuth.getSelectedModel(),
            mode: this.getEffectiveModeLabel(provider),
        }

        if (this.providerAuth.isCliUpdating(provider)) {
            // The CLI binary may be replaced during the update, so the run starts after it
            if (this.runningTimer) {
                clearInterval(this.runningTimer)
                this.runningTimer = null
            }
            if (this.runningLabel) {
                this.runningLabel.textContent = `Updating ${this.getProviderLabel(provider)} CLI...`
            }
            await this.providerAuth.waitForCliUpdate(provider)
            if (runGeneration !== this.runGeneration) {
                return
            }
            this.setRunning(true)
        }

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
                    permission: (request, requestID) => runGeneration === this.runGeneration ? this.askPermission(request, requestID) : Promise.resolve(false),
                    permissionCancel: requestID => this.dismissPermission(requestID),
                    done: code => {
                        if (runGeneration !== this.runGeneration) {
                            return
                        }
                        if (code && code !== 0) {
                            const definition = AI_PROVIDERS.find(item => item.id === provider)
                            this.appendAnalysis(`\n${definition?.label ?? 'AI provider'} exited with code ${code}.\n`)
                        }
                        this.finishPendingPermissions()
                        this.finalizeAnalysis(this.currentAnalysis)
                        this.decorateAnswerCard(this.currentAnalysis, runInfo, code)
                        this.runHandle = null
                        this.setRunning(false)
                    },
                },
            )
            if (!retry) {
                this.question.value = ''
                this.updateQuestionBox()
            }
            this.capture.resetInputTracking()
            this.render()
        } catch (error) {
            this.appendAnalysis(error instanceof Error ? error.message : `${error}`)
            this.runHandle = null
            this.setRunning(false)
        }
    }

    private createSettingSelect (key: string, options: [string, string][], fallback: string, title: string): HTMLSelectElement {
        const select = document.createElement('select')
        select.className = 'form-control form-control-sm ai-model-select'
        select.title = title
        for (const [value, label] of options) {
            select.appendChild(this.modelOption(value, label))
        }
        const current = this.config.store.aiTerminal[key]
        select.value = options.some(([value]) => value === current) ? current : fallback
        select.addEventListener('change', () => {
            this.config.store.aiTerminal[key] = select.value
            void this.config.save()
        })
        return select
    }

    private askPermission (request: AIToolPermissionRequest, requestID: string): Promise<boolean> {
        return new Promise(resolve => {
            const card = document.createElement('div')
            card.className = 'ai-permission-card'
            const title = document.createElement('div')
            title.className = 'ai-permission-title'
            title.textContent = `Allow ${request.display_name ?? request.tool_name}?`
            const detail = document.createElement('pre')
            detail.className = 'ai-permission-detail'
            detail.textContent = this.describePermission(request)
            const actions = document.createElement('div')
            actions.className = 'ai-permission-actions'
            const item: PendingPermission = {
                requestID,
                finish: (allowed, label) => {
                    this.pendingPermissions = this.pendingPermissions.filter(other => other !== item)
                    const status = document.createElement('span')
                    status.className = 'ai-permission-status'
                    status.textContent = label
                    actions.replaceChildren(status)
                    resolve(allowed)
                },
            }
            actions.append(
                button('Allow', 'success', () => item.finish(true, 'Allowed')),
                button('Deny', 'danger', () => item.finish(false, 'Denied')),
            )
            card.append(title, detail, actions)
            this.chatHistory.appendChild(card)
            this.pendingPermissions = [...this.pendingPermissions, item]
            this.scrollChatToBottom(true)
        })
    }

    private describePermission (request: AIToolPermissionRequest): string {
        const input = request.input ?? {}
        if (typeof input.command === 'string') {
            return input.description ? `${input.command}\n# ${input.description}` : input.command
        }
        const parts: string[] = []
        if (input.file_path) {
            parts.push(input.file_path)
        }
        if (typeof input.old_string === 'string') {
            parts.push(`- ${input.old_string.slice(0, 400)}`)
        }
        if (typeof input.new_string === 'string') {
            parts.push(`+ ${input.new_string.slice(0, 400)}`)
        }
        if (typeof input.content === 'string') {
            parts.push(input.content.slice(0, 400))
        }
        return parts.length ? parts.join('\n') : JSON.stringify(input, null, 2).slice(0, 800)
    }

    /** Pending approval cards are denied when the run ends or is cancelled */
    private finishPendingPermissions (): void {
        for (const item of [...this.pendingPermissions]) {
            item.finish(false, 'Cancelled')
        }
    }

    private dismissPermission (requestID: string): void {
        for (const item of [...this.pendingPermissions]) {
            if (item.requestID === requestID) {
                item.finish(false, 'Cancelled')
            }
        }
    }

    private cancelAnalyze (): void {
        this.runGeneration++
        this.finishPendingPermissions()
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
        if (analysis.childNodes.length === 1 && analysis.firstChild?.nodeValue === ANALYSIS_PLACEHOLDER) {
            analysis.textContent = ''
        }
        // Appending a text node keeps streaming linear; `textContent +=` copies the whole answer for every chunk
        analysis.append(chunk)
        this.scheduleLiveRender(analysis)
        this.scrollChatToBottom()
    }

    /** Renders the streaming answer as markdown at most every 200 ms; the raw text stays in the hidden <pre> */
    private scheduleLiveRender (analysis: HTMLElement): void {
        if (analysis.tagName !== 'PRE') {
            return
        }
        let state = this.liveRenders.get(analysis)
        if (!state) {
            state = { timer: null, view: null }
            this.liveRenders.set(analysis, state)
        }
        if (state.timer) {
            return
        }
        const live = state
        live.timer = setTimeout(() => {
            live.timer = null
            if (!analysis.isConnected) {
                return
            }
            if (!live.view) {
                live.view = document.createElement('div')
                live.view.className = 'ai-analysis ai-chat-analysis ai-markdown'
                analysis.after(live.view)
                analysis.hidden = true
            }
            live.view.replaceChildren(...Array.from(renderMarkdown(analysis.textContent ?? '', this.openLink).childNodes))
            this.scrollChatToBottom()
        }, 200)
    }

    private setRunning (running: boolean): void {
        this.analyzing = running
        if (running && document.activeElement === this.question) {
            // The question box is disabled below; keep focus in the panel so Esc still cancels
            this.element.focus({ preventScroll: true })
        }
        if (!running && this.providerSwitchedDuringRun) {
            // Another tab switched the provider during this answer; the next question starts a new session
            this.providerSwitchedDuringRun = false
            this.aiSessionID = null
            this.renderProviderIdentity()
        }
        if (this.runningTimer) {
            clearInterval(this.runningTimer)
            this.runningTimer = null
        }
        const label = this.runningLabel
        if (label) {
            label.textContent = 'Thinking...'
            if (running) {
                const started = Date.now()
                this.runningTimer = setInterval(() => {
                    label.textContent = `Thinking... ${Math.floor((Date.now() - started) / 1000)}s`
                }, 1000)
            }
        }
        this.cancelButton.title = 'Cancel (Esc)'
        this.analyzeButton.disabled = running
        this.cancelButton.hidden = !running
        this.runningIndicator.classList.toggle('is-active', running)
        this.runningIndicator.setAttribute('aria-hidden', running ? 'false' : 'true')
        this.question.disabled = running
        this.modelSelect.disabled = running
        this.modeSelect.disabled = running
        this.effortSelect.disabled = running
        this.clearLatestButton.disabled = running
        this.resetSessionButton.disabled = running
        this.referenceFolderButton.disabled = running
        this.clearReferenceFolderButton.disabled = running
    }

    private render (): void {
        if (this.getFontSize() !== this.appliedFontSize) {
            this.applyFontSize()
        }
        this.capture.trim()
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

        const lines = this.capture.getDisplayLines()
        const chatEmpty = this.chatHistory.childElementCount === 0
        if (this.latestOutputAuto) {
            // Open the captured output on an empty chat; keep it closed after an answer
            const shouldOpen = chatEmpty && lines.length > 0
            if (this.latestOutputDetails.open !== shouldOpen) {
                this.latestOutputDetails.open = shouldOpen
            }
        }
        const hideEmptyState = !chatEmpty || lines.length > 0
        if (this.emptyState.hidden !== hideEmptyState) {
            this.emptyState.hidden = hideEmptyState
        }
        if (this.exampleRow.hidden !== !chatEmpty) {
            this.exampleRow.hidden = !chatEmpty
        }
        const outputLines = this.latestOutputDetails.open ? lines : lines.slice(-VISIBLE_OUTPUT_LINES)
        const outputText = outputLines.join('\n')
        if (document.activeElement !== this.output && this.output.value !== outputText) {
            this.output.value = outputText
        }
        this.latestOutputMeta.textContent = this.formatLineCount(lines.length)
        const preview = this.latestOutputDetails.open ? 'editable' : lines.length ? lines[lines.length - 1].trim() : ''
        if (this.latestOutputPreview.textContent !== preview) {
            this.latestOutputPreview.textContent = preview
            this.latestOutputPreview.title = this.latestOutputDetails.open ? 'You can edit this text - exactly this is sent with your question' : preview
        }
        this.latestOutputPreview.classList.toggle('is-hint', this.latestOutputDetails.open)
        this.updateAnalyzeLabel()
        if (this.senderTargetLabel !== this.getTargetLabel()) {
            this.updateSenderState()
        }
        this.renderReferenceFolder()
        this.updateHeaderSummary()
        this.scheduleDynamicLayoutUpdate()
    }

    private applyPanelSize (): void {
        const store = this.config.store.aiTerminal
        const width = Math.max(260, Math.min(2000, Math.round(Number(store.panelWidth) || 360)))
        const height = Math.max(100, Math.min(1500, Math.round(Number(store.senderHeight) || 178)))
        if (width === this.appliedPanelWidth && height === this.appliedSenderHeight) {
            return
        }
        this.appliedPanelWidth = width
        this.appliedSenderHeight = height
        for (const element of [this.tab.element.nativeElement, this.element, this.senderElement]) {
            element.style.setProperty('--ai-panel-width', `${width}px`)
            element.style.setProperty('--ai-sender-height', `${height}px`)
        }
    }

    /** Drag the panel's left edge (x) or the sender's top edge (y); double-click resets the size */
    private installResizeHandle (parent: HTMLElement, axis: 'x'|'y'): void {
        const handle = document.createElement('div')
        handle.className = axis === 'x' ? 'ai-resize-handle-x' : 'ai-resize-handle-y'
        handle.title = 'Drag to resize, double-click to reset'
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) {
                return
            }
            event.preventDefault()
            event.stopPropagation()
            const store = this.config.store.aiTerminal
            const startPos = axis === 'x' ? event.clientX : event.clientY
            const startSize = axis === 'x' ? this.element.getBoundingClientRect().width : this.senderElement.getBoundingClientRect().height
            const host = this.tab.element.nativeElement.getBoundingClientRect()
            handle.classList.add('ai-resizing')
            try {
                handle.setPointerCapture(event.pointerId)
            } catch { }
            const move = (moveEvent: PointerEvent) => {
                const delta = startPos - (axis === 'x' ? moveEvent.clientX : moveEvent.clientY)
                if (axis === 'x') {
                    store.panelWidth = Math.round(Math.max(260, Math.min(host.width - 200, startSize + delta)))
                } else {
                    store.senderHeight = Math.round(Math.max(100, Math.min(host.height - 160, startSize + delta)))
                }
                this.applyPanelSize()
            }
            const end = () => {
                handle.removeEventListener('pointermove', move)
                handle.removeEventListener('pointerup', end)
                handle.removeEventListener('pointercancel', end)
                handle.classList.remove('ai-resizing')
                void this.config.save()
                this.requestTerminalRefit()
            }
            handle.addEventListener('pointermove', move)
            handle.addEventListener('pointerup', end)
            handle.addEventListener('pointercancel', end)
        })
        handle.addEventListener('dblclick', event => {
            event.stopPropagation()
            const store = this.config.store.aiTerminal
            if (axis === 'x') {
                store.panelWidth = 360
            } else {
                store.senderHeight = 178
            }
            this.applyPanelSize()
            void this.config.save()
            this.requestTerminalRefit()
        })
        parent.appendChild(handle)
    }

    private applyFontSize (): void {
        const fontSize = this.getFontSize()
        this.appliedFontSize = fontSize
        this.element.style.setProperty('--ai-terminal-font-size', `${fontSize}px`)
        this.senderElement.style.setProperty('--ai-terminal-font-size', `${fontSize}px`)
        this.applyPanelSize()
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

    /** Collapses a sender that was kept open for tag or group clicks once the user clicks elsewhere */
    private collapseSenderOnOutsideClick = (event: MouseEvent): void => {
        const target = event.target
        // The tag menu closes on a click anywhere but in the menu or on a group chip (which toggles it)
        if (this.tagMenu && !(target instanceof Element && (this.tagMenu.contains(target) || target.closest('.ai-saved-group-chip')))) {
            this.closeTagMenu()
        }
        if (!this.senderForceOpen || document.activeElement === this.draft) {
            return
        }
        if (target instanceof Element && (this.senderElement.contains(target) || target.closest('.ai-sender-tag-editor-overlay, .ai-tag-menu'))) {
            return
        }
        this.senderForceOpen = false
        this.updateSenderState()
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
            // The provider is shared by all tabs: a running answer here is not cut off by a switch in another tab
            if (this.analyzing) {
                this.providerSwitchedDuringRun = true
            } else {
                this.cancelAnalyze()
                this.resetAIChatSession()
            }
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
        this.modelRow.style.display = signedIn ? '' : 'none'
        this.modeRow.style.display = signedIn && status.provider === 'claude' ? '' : 'none'
        this.resetSessionButton.hidden = !signedIn
        this.moreButton.hidden = !signedIn
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
        const session = this.signedIn ? `Session: ${this.aiSessionID ? `${this.aiSessionID.slice(0, 8)}…` : 'new'}` : providerLabel
        const cli = this.describeCliUpdate(providerID)
        this.signedInIdentity.textContent = cli.text ? `${session} · ${cli.text}` : session
        const sessionTitle = this.aiSessionID ? `${providerLabel} session ${this.aiSessionID}` : `${providerLabel} - new session`
        this.signedInIdentity.title = cli.title ? `${sessionTitle}\n${cli.title}` : sessionTitle
    }

    /** Short CLI version / update note for the identity line */
    private describeCliUpdate (providerID: AIProviderID): { text: string, title: string } {
        const label = this.getProviderLabel(providerID)
        if (this.providerAuth.isCliUpdating(providerID)) {
            return { text: `updating ${label} CLI...`, title: `Updating the ${label} CLI` }
        }
        const status = this.providerAuth.getCliUpdateStatus(providerID)
        const known = this.providerAuth.getKnownCliVersion(providerID)
        if (!status) {
            return { text: known ? `${label} ${known}` : '', title: known ? `${label} CLI ${known}` : '' }
        }
        const checked = `Checked ${new Date(status.checkedAt).toLocaleString()}`
        const age = Date.now() - status.checkedAt
        if (status.state === 'updated' && age < 24 * 3600 * 1000) {
            return { text: `CLI updated to ${status.version}`, title: `${label} CLI ${status.previousVersion} → ${status.version}\n${checked}` }
        }
        if (status.state === 'error') {
            return { text: age < CLI_NOTICE_MS ? 'CLI update failed' : known ? `${label} ${known}` : '', title: `${label} CLI update failed: ${status.message ?? 'unknown error'}\n${checked}` }
        }
        const version = status.version ? ` ${status.version}` : ''
        const current = known ? `${label} ${known}` : ''
        return { text: status.state === 'current' && age < CLI_NOTICE_MS ? `CLI${version} is up to date` : current, title: `${label} CLI${version}\n${checked}` }
    }

    private getProviderLabel (providerID: AIProviderID): string {
        return AI_PROVIDERS.find(item => item.id === providerID)?.label ?? providerID
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
        // Also called from the constructor before the header rows exist
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.modeRow) {
            this.modeRow.style.display = this.signedIn && provider.id === 'claude' ? '' : 'none'
        }
        // Keep the current list while loading, so an open menu does not shrink to one entry under the pointer
        if (this.modelOptionsProvider !== provider.id) {
            this.modelSelect.replaceChildren(this.modelOption(selectedModel, selectedModel === 'auto' ? 'Auto model' : selectedModel))
            this.modelSelect.value = selectedModel
        }

        const models = await this.providerAuth.getAvailableModels(provider.id, force)
        if (this.providerSelect.value !== provider.id) {
            // The provider changed while this list was loading
            return this.refreshModelOptionsNow(force)
        }
        const currentModel = this.providerAuth.getSelectedModel()
        const modelOptions = models.includes(currentModel) ? models : [currentModel, ...models]
        const options = modelOptions.map(model => this.decorateModelOption(provider.id, this.modelOption(model, model === 'auto' ? 'Auto model' : model)))
        if (provider.id === 'claude') {
            options.push(this.modelOption('__recheck__', '↻ Re-check model availability'))
        }
        this.modelSelect.replaceChildren(...options)
        this.modelSelect.value = currentModel
        this.modelOptionsProvider = provider.id
    }

    private recheckModels (): void {
        const recheck = this.modelSelect.querySelector<HTMLOptionElement>('option[value="__recheck__"]')
        if (recheck) {
            recheck.textContent = '↻ Checking models...'
            recheck.disabled = true
        }
        this.providerAuth.clearClaudeModelCache()
        void this.refreshModelOptions(true)
    }

    /** Less frequent actions: CLI update, model re-check and log out */
    private openMoreMenu (event: MouseEvent): void {
        const provider = this.providerAuth.getSelectedProvider()
        const label = this.getProviderLabel(provider)
        const updating = this.providerAuth.isCliUpdating(provider)
        const version = this.providerAuth.getKnownCliVersion(provider)
        const menu: MenuItemOptions[] = [
            {
                label: updating ? `Updating ${label} CLI...` : `Update ${label} CLI${version ? ` (${version})` : ''}`,
                enabled: !updating,
                click: () => void this.providerAuth.updateProviderCli(provider),
            },
        ]
        if (provider === 'claude') {
            menu.push({ label: 'Re-check model availability', enabled: !this.analyzing, click: () => this.recheckModels() })
        }
        menu.push(
            { type: 'separator' },
            { label: `Log out of ${label}...`, enabled: !this.analyzing, click: () => void this.logout() },
        )
        this.platform.popupContextMenu(menu, event)
    }

    /** Marks probed Claude models: resolved alias, unavailable (disabled) or check failed */
    private decorateModelOption (providerID: AIProviderID, option: HTMLOptionElement): HTMLOptionElement {
        if (providerID !== 'claude' || option.value === 'auto') {
            return option
        }
        const status = this.providerAuth.getClaudeModelStatus(option.value)
        if (!status) {
            return option
        }
        if (status.state === 'ok') {
            if (status.resolved && status.resolved !== option.value) {
                option.textContent = `${option.value} → ${status.resolved}`
            }
        } else if (status.state === 'unavailable') {
            option.textContent = `${option.value} (unavailable)`
            option.disabled = true
        } else {
            option.textContent = `${option.value} (check failed)`
        }
        if (status.reason) {
            option.title = status.reason
        }
        return option
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
            'Output sent',
            output,
            this.formatLineCount(this.countOutputLines(terminalOutput)),
        )
        sentOutput.details.classList.add('ai-chat-output-collapse')

        const analysisBlock = document.createElement('div')
        analysisBlock.className = 'ai-analysis-block'

        const answerHead = document.createElement('div')
        answerHead.className = 'ai-answer-head'
        const analysisLabel = document.createElement('div')
        analysisLabel.className = 'ai-message-label'
        analysisLabel.textContent = this.providerAuth.getSelectedProvider() === 'claude' ? 'Claude' : 'Codex'
        const answerMeta = document.createElement('span')
        answerMeta.className = 'ai-answer-meta'
        const answerActions = document.createElement('span')
        answerActions.className = 'ai-answer-actions'
        answerHead.append(analysisLabel, answerMeta, answerActions)

        const analysis = document.createElement('pre')
        analysis.className = 'ai-analysis ai-chat-analysis'
        analysis.textContent = ANALYSIS_PLACEHOLDER

        analysisBlock.append(answerHead, analysis)
        card.append(prompt, sentOutput.details, analysisBlock)
        this.chatHistory.appendChild(card)
        this.scrollChatToBottom(true)
        return analysis
    }

    private getDraftCommandLines (): string[] {
        return this.draft.value
            .split(/\r?\n/)
            .map(line => line.trimEnd())
            .filter(line => line.trim().length > 0)
    }

    private removeFirstDraftLine (): void {
        const lines = this.draft.value.split(/\r?\n/)
        const index = lines.findIndex(line => line.trim().length > 0)
        if (index !== -1) {
            lines.splice(index, 1)
        }
        this.draft.value = lines.join('\n').replace(/^\n+/, '')
    }

    private sendToTerminal (line: string): void {
        this.lineSeqAtSend = this.capture.lineSeq
        this.handleInput(`${line}\r`)
        this.tab.sendInput(`${line}\r`)
    }

    private getTargetLabel (): string {
        return this.tab.customTitle || this.tab.title || 'this tab'
    }

    private getDangerousPatterns (): RegExp[] {
        const configured = this.config.store.aiTerminal.dangerousCommandPatterns
        const sources: string[] = Array.isArray(configured) ? configured : DEFAULT_DANGEROUS_COMMAND_PATTERNS
        if (this.dangerousPatternSource !== sources) {
            this.dangerousPatternSource = sources
            this.dangerousPatterns = sources.map(source => {
                try {
                    return new RegExp(source, 'i')
                } catch {
                    return null
                }
            }).filter((pattern): pattern is RegExp => !!pattern)
        }
        return this.dangerousPatterns
    }

    /** Asks before sending commands that reboot, erase or reconfigure the device */
    private async confirmDangerousCommands (lines: string[]): Promise<boolean> {
        const patterns = this.getDangerousPatterns()
        const risky = lines.filter(line => patterns.some(pattern => pattern.test(line)))
        if (!risky.length) {
            return true
        }
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: `Send ${risky.length === 1 ? 'this command' : `these ${risky.length} commands`} to ${this.getTargetLabel()}?`,
            detail: risky.join('\n'),
            buttons: ['Send', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
        })
        return result.response === 0
    }

    private getPromptPattern (): RegExp {
        const source = this.config.store.aiTerminal.senderPromptPattern || DEFAULT_PROMPT_PATTERN
        if (this.promptPatternSource !== source) {
            this.promptPatternSource = source
            try {
                this.promptPattern = new RegExp(source)
            } catch {
                this.promptPattern = new RegExp(DEFAULT_PROMPT_PATTERN)
            }
        }
        return this.promptPattern
    }

    /** Resolves once a shell prompt shows up after at least one new output line, or on stop/timeout */
    private waitForPrompt (lineSeqAtSend: number): Promise<'prompt'|'stopped'|'timeout'> {
        const timeout = Number(this.config.store.aiTerminal.senderLineTimeoutMs) || 20000
        const started = Date.now()
        return new Promise(resolve => {
            const check = () => {
                if (this.senderStopRequested) {
                    resolve('stopped')
                } else if (this.promptAtLineSeq > lineSeqAtSend) {
                    setTimeout(() => resolve('prompt'), 50)
                } else if (Date.now() - started > timeout) {
                    resolve('timeout')
                } else {
                    setTimeout(check, 100)
                }
            }
            check()
        })
    }

    private async sendDraftLine (): Promise<void> {
        const [line] = this.getDraftCommandLines()
        if (!line || this.senderBusy || !await this.confirmDangerousCommands([line])) {
            return
        }
        this.senderNotice = ''
        this.sendToTerminal(line)
        this.removeFirstDraftLine()
        this.updateSenderState()
    }

    /** Sends the draft line by line, waiting for the shell prompt between lines */
    private async sendDraftAll (): Promise<void> {
        const lines = this.getDraftCommandLines()
        if (!lines.length || this.senderBusy || !await this.confirmDangerousCommands(lines)) {
            return
        }
        this.senderBusy = true
        this.senderStopRequested = false
        this.senderNotice = ''
        try {
            for (let index = 0; index < lines.length; index++) {
                this.senderProgress = `${index + 1}/${lines.length}`
                this.updateSenderState()
                this.sendToTerminal(lines[index])
                const sentAt = this.lineSeqAtSend
                this.removeFirstDraftLine()
                if (index === lines.length - 1) {
                    break
                }
                const result = await this.waitForPrompt(sentAt)
                if (result !== 'prompt') {
                    this.senderNotice = result === 'stopped' ? 'Stopped' : 'Stopped: no shell prompt came back'
                    break
                }
            }
        } finally {
            this.senderBusy = false
            this.senderStopRequested = false
            this.senderProgress = ''
            this.updateSenderState()
        }
    }

    private async sendSingleCommand (command: string): Promise<void> {
        if (this.senderBusy || !await this.confirmDangerousCommands([command])) {
            return
        }
        this.sendToTerminal(command)
    }

    private appendToDraft (text: string): void {
        const current = this.draft.value.trimEnd()
        this.draft.value = current ? `${current}\n${text}` : text
        this.senderNotice = ''
        this.updateSenderState()
    }

    private copyText (text: string): void {
        this.platform.setClipboard({ text })
    }

    private updateSenderState (): void {
        const lines = this.getDraftCommandLines()
        const busy = this.senderBusy
        this.draft.readOnly = busy
        this.senderLineButton.disabled = busy || !lines.length
        this.senderAllButton.disabled = busy || !lines.length
        this.senderStopButton.hidden = !busy
        this.senderAllButton.textContent = busy ? `Sending ${this.senderProgress}` : lines.length > 1 ? `Send all (${lines.length})` : 'Send all'
        const preview = this.senderNotice || (lines.length ? `Next: ${lines[0]}` : '')
        if (this.senderNextPreview.textContent !== preview) {
            this.senderNextPreview.textContent = preview
            this.senderNextPreview.title = preview
        }
        this.senderNextPreview.classList.toggle('is-notice', !!this.senderNotice)
        // The target tab is named in the send button tooltips (and in the confirmation for risky commands)
        const target = this.getTargetLabel()
        if (this.senderTargetLabel !== target) {
            this.senderTargetLabel = target
            this.senderLineButton.title = `Send the first line to ${target}`
            this.senderAllButton.title = `Send every line to ${target}, waiting for the prompt between lines`
        }
        // An empty sender shrinks to one input line unless disabled in the config
        const collapsed = this.config.store.aiTerminal.senderAutoCollapse !== false
            && !lines.length && !this.draft.value && !busy && !this.senderForceOpen && document.activeElement !== this.draft
        const host = this.tab.element.nativeElement
        if (host.classList.contains('ai-terminal-sender-collapsed') !== collapsed) {
            host.classList.toggle('ai-terminal-sender-collapsed', collapsed)
            if (this.visible) {
                this.requestTerminalRefit()
            }
        }
    }

    private getEffectiveModeLabel (provider: AIProviderID): string {
        if (provider !== 'claude') {
            return ''
        }
        const settings = this.providerRunner.getClaudeRunSettings(this.referenceFolder)
        return CLAUDE_MODE_LABELS[settings.mode] ?? settings.mode
    }

    /** Adds model / mode / duration and the Open, Copy and Retry buttons once an answer is complete */
    private decorateAnswerCard (analysis: HTMLElement|null, info: AnswerRunInfo, code: number|null): void {
        const card = analysis?.closest('.ai-chat-message')
        if (!analysis || !card) {
            return
        }
        const meta = card.querySelector('.ai-answer-meta')
        const actions = card.querySelector('.ai-answer-actions')
        const seconds = ((Date.now() - info.startedAt) / 1000).toFixed(1)
        const parts = [this.getModelShortLabel(info.provider, info.model), info.mode, `${seconds}s`].filter(Boolean)
        if (code && code !== 0) {
            parts.push(`exit ${code}`)
        }
        if (meta) {
            meta.textContent = parts.join(' · ')
        }
        if (actions) {
            const raw = analysis.dataset.raw ?? analysis.textContent ?? ''
            const open = button('Open', 'secondary', () => this.openAnswerViewer(raw, meta?.textContent ?? ''))
            open.title = 'Read the answer in a large window'
            const copy = button('Copy', 'secondary', () => this.copyText(raw))
            copy.title = 'Copy the whole answer'
            const retry = button('Retry', 'secondary', () => {
                if (this.runHandle) {
                    return
                }
                this.retryPayload = { question: info.question, terminalOutput: info.terminalOutput }
                void this.analyze()
            })
            retry.title = 'Ask the same question with the same output again'
            actions.replaceChildren(open, copy, retry)
        }
    }

    private openAnswerViewer (raw: string, metaText: string): void {
        this.closeAnswerViewer()
        const overlay = document.createElement('div')
        overlay.className = 'ai-viewer-overlay'
        guardTerminalEvents(overlay)
        const viewer = document.createElement('div')
        viewer.className = 'ai-viewer'
        viewer.setAttribute('role', 'dialog')
        viewer.style.setProperty('--ai-terminal-font-size', `${Math.round(this.getFontSize() * 1.15)}px`)
        const head = document.createElement('div')
        head.className = 'ai-viewer-head'
        const title = document.createElement('span')
        title.className = 'ai-viewer-title'
        title.textContent = metaText ? `Answer · ${metaText}` : 'Answer'
        const copy = button('Copy', 'secondary', () => this.copyText(raw))
        const close = button('Close', 'secondary', () => this.closeAnswerViewer())
        close.title = 'Close (Esc)'
        head.append(title, copy, close)
        const body = renderMarkdown(raw, this.openLink)
        body.className = 'ai-viewer-body ai-markdown'
        viewer.append(head, body)
        overlay.appendChild(viewer)
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) {
                this.closeAnswerViewer()
            }
        })
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                this.closeAnswerViewer()
            }
        })
        overlay.tabIndex = -1
        this.answerViewer = overlay
        document.body.appendChild(overlay)
        requestAnimationFrame(() => overlay.focus())
    }

    private closeAnswerViewer (): void {
        this.answerViewer?.remove()
        this.answerViewer = null
    }

    /** Grows the question box from one line up to five */
    private updateQuestionBox (): void {
        const box = this.question
        box.style.height = 'auto'
        const style = getComputedStyle(box)
        const lineHeight = parseFloat(style.lineHeight) || this.getFontSize() * 1.5
        const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
        const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) + borders
        const maxHeight = lineHeight * 5 + padding
        box.style.height = `${Math.min(Math.max(box.scrollHeight + borders, lineHeight + padding), maxHeight)}px`
        box.style.overflowY = box.scrollHeight > maxHeight ? 'auto' : 'hidden'
        this.updateAnalyzeLabel()
    }

    private getDisplayOutputCount (): number {
        return this.capture.getDisplayCount()
    }

    private updateAnalyzeLabel (): void {
        const count = this.getDisplayOutputCount()
        const verb = this.question.value.trim() ? 'Ask' : 'Analyze'
        const label = count ? `${verb} (${count} ${count === 1 ? 'line' : 'lines'})` : verb
        if (this.analyzeButton.textContent !== label) {
            this.analyzeButton.textContent = label
        }
    }

    /** e.g. opus -> opus-5-5 (resolved alias), claude-haiku-4-5-20251001 -> haiku-4-5 */
    private getModelShortLabel (provider: AIProviderID, model: string): string {
        if (!model || model === 'auto') {
            return 'auto model'
        }
        let label = model
        if (provider === 'claude') {
            const status = this.providerAuth.getClaudeModelStatus(model)
            if (status?.state === 'ok' && status.resolved) {
                label = status.resolved
            }
            label = label.replace(/^claude-/, '').replace(/-\d{8}$/, '')
        }
        return label
    }

    private setHeaderCollapsed (collapsed: boolean): void {
        this.config.store.aiTerminal.headerCollapsed = collapsed
        void this.config.save()
        this.updateHeaderSummary()
    }

    private updateHeaderSummary (): void {
        const collapsed = !!this.config.store.aiTerminal.headerCollapsed && this.signedIn
        if (this.headerCollapseButton.hidden !== !this.signedIn) {
            this.headerCollapseButton.hidden = !this.signedIn
        }
        if (this.header.classList.contains('is-collapsed') !== collapsed) {
            this.header.classList.toggle('is-collapsed', collapsed)
            this.headerCollapseButton.title = collapsed ? 'Show settings' : 'Hide settings'
            this.headerCollapseButton.setAttribute('aria-expanded', String(!collapsed))
            this.scheduleDynamicLayoutUpdate()
        } else if (!this.headerCollapseButton.title) {
            this.headerCollapseButton.title = collapsed ? 'Show settings' : 'Hide settings'
        }
        if (!collapsed) {
            return
        }
        const provider = this.providerAuth.getSelectedProvider()
        const parts = [provider === 'claude' ? 'Claude Code' : 'Codex', this.getModelShortLabel(provider, this.providerAuth.getSelectedModel())]
        if (provider === 'claude') {
            const effort = this.config.store.aiTerminal.claudeEffort || 'auto'
            parts.push(CLAUDE_MODE_LABELS[this.modeSelect.value] ?? this.modeSelect.value, `effort ${effort}`)
        }
        parts.push(this.referenceFolder ? this.formatReferenceFolderPath(this.referenceFolder) : 'no folder')
        const text = parts.join(' · ')
        if (this.headerSummaryText.textContent !== text) {
            this.headerSummaryText.textContent = text
            this.headerSummaryText.title = `${text}\nClick to show settings`
        }
    }

    private labeledRow (pairs: [string, HTMLElement][]): HTMLElement {
        const row = document.createElement('div')
        row.className = 'ai-header-row'
        for (const [label, control] of pairs) {
            const field = document.createElement('label')
            field.className = 'ai-header-field'
            const text = document.createElement('span')
            text.className = 'ai-header-label'
            text.textContent = label
            field.append(text, control)
            row.appendChild(field)
        }
        return row
    }

    /** Replaces the streamed answer with rendered markdown and lifts "Suggested commands" into action rows */
    private finalizeAnalysis (analysis: HTMLElement|null): void {
        if (!analysis?.isConnected || analysis.tagName !== 'PRE') {
            return
        }
        const live = this.liveRenders.get(analysis)
        if (live) {
            if (live.timer) {
                clearTimeout(live.timer)
            }
            live.view?.remove()
            this.liveRenders.delete(analysis)
        }
        analysis.hidden = false
        const text = analysis.textContent ?? ''
        if (!text.trim() || text === ANALYSIS_PLACEHOLDER) {
            return
        }
        const { commands, rest } = extractSuggestedCommands(text)
        const rendered = renderMarkdown(rest, this.openLink)
        rendered.className = 'ai-analysis ai-chat-analysis ai-markdown'
        rendered.dataset.raw = text
        analysis.replaceWith(rendered)
        if (this.currentAnalysis === analysis) {
            this.currentAnalysis = rendered
        }
        if (commands.length) {
            rendered.after(this.renderSuggestedCommands(commands))
        }
        this.scrollChatToBottom()
    }

    private renderSuggestedCommands (commands: string[]): HTMLElement {
        const box = document.createElement('div')
        box.className = 'ai-suggested'
        const head = document.createElement('div')
        head.className = 'ai-suggested-head'
        const title = document.createElement('span')
        title.textContent = 'Suggested commands'
        const target = document.createElement('span')
        target.className = 'ai-suggested-target'
        target.textContent = `→ ${this.getTargetLabel()}`
        const allButton = button('All →', 'secondary', () => this.appendToDraft(commands.join('\n')))
        allButton.title = 'Put every command into the Sender'
        head.append(title, target, allButton)
        box.appendChild(head)
        for (const command of commands) {
            const row = document.createElement('div')
            row.className = 'ai-suggested-row'
            const code = document.createElement('code')
            code.textContent = command
            code.title = command
            const send = button('▶', 'success', () => void this.sendSingleCommand(command))
            send.title = `Send to ${this.getTargetLabel()} now`
            const stage = button('→', 'secondary', () => this.appendToDraft(command))
            stage.title = 'Put into the Sender'
            const copy = button('Copy', 'secondary', () => this.copyText(command))
            copy.title = 'Copy to clipboard'
            row.append(code, send, stage, copy)
            box.appendChild(row)
        }
        return box
    }

    private createSavedCommandToolbar (): HTMLElement {
        const toolbar = document.createElement('div')
        toolbar.className = 'ai-saved-command-toolbar'

        const addButton = button('+ Save', 'secondary', () => this.openSenderTagEditor())
        addButton.classList.add('ai-saved-command-control', 'is-add')
        addButton.title = 'Save the Sender content as a tag. Use {{name}} for values to fill in when inserting.'

        toolbar.append(this.savedGroupBar, addButton)
        return toolbar
    }

    private insertSavedCommandIntoDraft (command: string, index: number): void {
        this.resolveVariables([command], ([filled]) => this.insertResolvedCommand(filled, index))
    }

    /** Fills the {{name}} placeholders of the commands, asking for all values in one dialog */
    private resolveVariables (commands: string[], done: (filled: string[]) => void): void {
        const names = findVariableNames(commands)
        if (!names.length) {
            done(commands)
            return
        }
        this.openVariableDialog(names, values => {
            done(commands.map(command => fillVariables(command, values)))
        })
    }

    /** Asks for the {{name}} values of a saved tag; the last values are remembered */
    private openVariableDialog (names: string[], done: (values: Record<string, string>) => void): void {
        const remembered: Partial<Record<string, string>> = { ...this.config.store.aiTerminal.senderVariables ?? {} }
        const fields = names.map(name => ({ label: name, value: remembered[name] ?? '' }))
        this.openFormDialog('Fill in values', fields, 'Insert', inputs => {
            const values: Record<string, string> = {}
            names.forEach((name, index) => {
                values[name] = inputs[index]
            })
            this.config.store.aiTerminal.senderVariables = { ...remembered, ...values }
            void this.config.save()
            this.closeSenderTagEditor()
            done(values)
            return true
        })
    }

    /** Modal with one text input per field; submit returns false to keep the dialog open */
    private openFormDialog (title: string, fields: { label: string, value: string }[], confirmLabel: string, submit: (values: string[]) => boolean): void {
        this.showDialog(buildFormDialog({
            title,
            fields,
            confirmLabel,
            close: () => this.closeSenderTagEditor(),
            submit: values => {
                if (submit(values)) {
                    this.closeSenderTagEditor()
                }
            },
        }))
    }

    /** Shows a dialog from dialogs.ts; one sender dialog is open at a time */
    private showDialog (dialog: BuiltDialog): void {
        this.closeSenderTagEditor()
        this.senderTagEditor = dialog.overlay
        document.body.appendChild(dialog.overlay)
        requestAnimationFrame(dialog.focus)
    }

    private insertResolvedCommand (command: string, index: number): void {
        this.selectedSavedCommandIndex = index
        this.insertIntoDraft(command)
    }

    private insertIntoDraft (text: string): void {
        if (this.getSenderCommandInsertMode() === 'append') {
            const current = this.draft.value.trimEnd()
            this.draft.value = current ? `${current}\n${text}` : text
        } else {
            this.draft.value = text
        }
        this.renderSavedCommandTabs()
        this.senderNotice = ''
        this.draft.focus()
        this.updateSenderState()
    }

    private async saveSenderCommand (name: string, command: string, group: string, editIndex: number|null): Promise<void> {
        const savedCommands = this.getSavedSenderCommands()
        const item: SavedSenderCommand = {
            command: command.trim(),
        }
        if (name.trim()) {
            item.name = name.trim()
        }
        const groupName = normalizeGroupName(group)
        if (groupName) {
            item.group = groupName
        }

        if (editIndex !== null && editIndex >= 0 && editIndex < savedCommands.length) {
            savedCommands[editIndex] = item
            this.selectedSavedCommandIndex = editIndex
        } else {
            if (savedCommands.length >= MAX_SAVED_SENDER_COMMANDS) {
                savedCommands.splice(0, savedCommands.length - MAX_SAVED_SENDER_COMMANDS + 1)
            }
            // A new tag goes right after the other tags of its group
            const insertAt = getGroupEndIndex(savedCommands, item.group)
            savedCommands.splice(insertAt, 0, item)
            this.selectedSavedCommandIndex = insertAt
        }
        await this.setSavedSenderCommands(savedCommands)
    }

    private openSenderTagEditor (editIndex: number|null = null, presetGroup = ''): void {

        const savedCommand = editIndex === null ? null : this.getSavedSenderCommands()[editIndex]
        if (editIndex !== null && !savedCommand) {
            return
        }

        const { overlay, editor } = createDialog(editIndex === null ? 'Save Sender Tag' : 'Edit Sender Tag', () => this.closeSenderTagEditor())

        const nameLabel = document.createElement('label')
        nameLabel.className = 'ai-sender-tag-editor-label'
        nameLabel.textContent = 'Name (optional)'

        const nameInput = document.createElement('input')
        nameInput.type = 'text'
        nameInput.className = 'form-control'
        nameInput.placeholder = 'Leave blank to use the command as the tag name'
        nameInput.value = savedCommand?.name ?? ''
        nameLabel.appendChild(nameInput)

        const groupLabel = document.createElement('label')
        groupLabel.className = 'ai-sender-tag-editor-label'
        groupLabel.textContent = 'Group (optional)'

        const groupInput = document.createElement('input')
        groupInput.type = 'text'
        groupInput.className = 'form-control'
        groupInput.placeholder = 'Leave blank to keep the tag ungrouped'
        groupInput.value = savedCommand ? savedCommand.group ?? '' : presetGroup
        const groupOptions = document.createElement('datalist')
        groupOptions.id = `ai-sender-tag-groups-${++tagGroupListSeq}`
        for (const group of getSavedGroups(this.getSavedSenderCommands())) {
            const option = document.createElement('option')
            option.value = group
            groupOptions.appendChild(option)
        }
        groupInput.setAttribute('list', groupOptions.id)
        groupLabel.append(groupInput, groupOptions)

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
        const cancelButton = button('Cancel', 'secondary', () => this.closeSenderTagEditor())
        if (editIndex !== null) {
            const deleteButton = button('Delete', 'danger', () => {
                this.selectedSavedCommandIndex = editIndex
                void this.removeSelectedSenderCommand().then(() => this.closeSenderTagEditor())
            })
            deleteButton.classList.add('ai-tag-delete-button')
            actions.appendChild(deleteButton)
        }
        const saveButton = button(editIndex === null ? 'Save' : 'Update', 'primary', () => {
            const command = commandInput.value.trim()
            if (!command) {
                error.textContent = 'Command cannot be empty.'
                commandInput.focus()
                return
            }
            saveButton.disabled = true
            void this.saveSenderCommand(nameInput.value, command, groupInput.value, editIndex).then(() => this.closeSenderTagEditor())
        })
        actions.append(cancelButton, saveButton)

        editor.append(nameLabel, groupLabel, commandLabel, error, actions)
        this.showDialog({ overlay, focus: () => nameInput.focus() })
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
        return normalizeSavedCommands(this.config.store.aiTerminal.savedSenderCommands)
    }

    private renderSavedCommandTabs (): void {
        this.automaticGroupColors = null
        this.renderSavedGroupBar(this.getSavedSenderCommands())
        if (this.tagMenuFilter !== null) {
            this.renderTagMenu()
        }
    }

    private renderSavedGroupBar (commands: SavedSenderCommand[]): void {
        this.savedGroupBar.replaceChildren()
        if (!commands.length) {
            const hint = document.createElement('span')
            hint.className = 'ai-saved-command-hint'
            hint.textContent = 'No saved tags yet - type a command and press + Save'
            this.savedGroupBar.appendChild(hint)
            return
        }

        const chip = (label: string, value: string, count: number): HTMLButtonElement => {
            const element = document.createElement('button')
            element.type = 'button'
            element.className = 'ai-saved-group-chip'
            element.dataset.filter = value
            element.classList.toggle('is-active', value === this.tagMenuFilter)
            const text = document.createElement('span')
            text.className = 'ai-saved-group-name'
            text.textContent = label
            const badge = document.createElement('span')
            badge.className = 'ai-saved-group-count'
            badge.textContent = String(count)
            const arrow = document.createElement('span')
            arrow.className = 'ai-saved-group-arrow'
            arrow.textContent = '▴'
            element.append(text, badge, arrow)
            const color = value === '' ? ALL_GROUPS_COLOR : value === UNGROUPED_FILTER ? GROUP_COLORS.gray.hex : this.getGroupColor(value)
            applyGroupColor(element, color)
            element.addEventListener('click', () => this.toggleTagMenu(value))
            this.savedGroupBar.appendChild(element)
            return element
        }

        const groups = getSavedGroups(commands)
        chip(groups.length ? 'All' : 'Tags', '', commands.length).title = 'Show the saved tags'
        if (!groups.length) {
            return
        }
        for (const group of groups) {
            const element = chip(group, group, commands.filter(item => item.group === group).length)
            element.title = `${group}\n\nClick to show its tags, right-click for group actions, drag to reorder`
            element.addEventListener('contextmenu', event => {
                event.preventDefault()
                this.openGroupMenu(group, event)
            })
            this.installGroupDrag(element, group)
        }
        const ungroupedCount = commands.filter(item => !item.group).length
        const ungrouped = chip('Ungrouped', UNGROUPED_FILTER, ungroupedCount)
        ungrouped.classList.add('is-ungrouped')
        // Shown only while a tag is dragged when there are no ungrouped tags
        ungrouped.classList.toggle('is-empty', ungroupedCount === 0)
        ungrouped.title = 'Tags without a group\n\nDrop a tag here to take it out of its group'
        ungrouped.addEventListener('contextmenu', event => {
            event.preventDefault()
            this.openGroupMenu(null, event)
        })
        this.installGroupChipDrop(ungrouped, null)
    }

    private toggleTagMenu (filter: string): void {
        if (this.tagMenuFilter === filter) {
            this.closeTagMenu()
            return
        }
        this.tagMenuFilter = filter
        this.renderSavedCommandTabs()
    }

    private closeTagMenu (): void {
        this.tagMenu?.remove()
        this.tagMenu = null
        if (this.tagMenuFilter !== null) {
            this.tagMenuFilter = null
            this.renderSavedGroupBar(this.getSavedSenderCommands())
        }
    }

    /** Lists the tags of the open chip above it; the sender sits at the bottom, so the list opens upwards */
    private renderTagMenu (): void {
        const filter = this.tagMenuFilter
        const anchor = Array.from(this.savedGroupBar.querySelectorAll<HTMLElement>('.ai-saved-group-chip')).find(element => element.dataset.filter === filter)
        if (filter === null || !anchor) {
            this.closeTagMenu()
            return
        }
        if (!this.tagMenu) {
            this.tagMenu = this.createTagMenuElement()
        }

        const list = document.createElement('div')
        list.className = 'ai-tag-menu-list'
        this.getSavedSenderCommands().forEach((item, index) => {
            if (matchesGroupFilter(item, filter)) {
                list.appendChild(this.createTagMenuItem(item, index))
            }
        })
        if (!list.childElementCount) {
            const empty = document.createElement('div')
            empty.className = 'ai-tag-menu-empty'
            empty.textContent = 'No tags here yet'
            list.appendChild(empty)
        }
        const saveHere = button('+ Save current here', 'secondary', () => {
            this.closeTagMenu()
            this.openSenderTagEditor(null, filter && filter !== UNGROUPED_FILTER ? filter : '')
        })
        saveHere.classList.add('ai-tag-menu-save')
        saveHere.title = 'Save the Sender content as a tag in this group'
        this.tagMenu.replaceChildren(list, saveHere)
        this.positionTagMenu(anchor)
    }

    private createTagMenuElement (): HTMLElement {
        const menu = document.createElement('div')
        menu.className = 'ai-tag-menu'
        menu.setAttribute('role', 'menu')
        guardTerminalEvents(menu)
        // Clicks in the menu count as clicks in the sender, so it does not collapse under the pointer
        menu.addEventListener('mousedown', () => {
            this.senderPointerDown = true
            setTimeout(() => {
                this.senderPointerDown = false
            })
        }, true)
        menu.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                this.closeTagMenu()
            }
        })
        menu.style.setProperty('--ai-terminal-font-size', `${this.getFontSize()}px`)
        document.body.appendChild(menu)
        return menu
    }

    private createTagMenuItem (item: SavedSenderCommand, index: number): HTMLElement {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'ai-tag-menu-item'
        row.setAttribute('role', 'menuitem')
        row.classList.toggle('is-active', index === this.selectedSavedCommandIndex)
        if (item.group) {
            row.classList.add('has-group')
            applyGroupColor(row, this.getGroupColor(item.group))
        }
        const name = document.createElement('span')
        name.className = 'ai-tag-menu-name'
        name.textContent = item.name ?? buildSavedCommandLabel(item.command)
        const command = document.createElement('span')
        command.className = 'ai-tag-menu-command'
        command.textContent = item.command.split(/\r?\n/)[0]
        row.append(name, command)
        row.title = [
            item.name,
            item.command,
            item.group ? `Group: ${item.group}` : '',
            'Click to insert, right-click to edit or move, drag to reorder',
        ].filter(Boolean).join('\n\n')
        row.addEventListener('click', () => {
            this.closeTagMenu()
            this.insertSavedCommandIntoDraft(item.command, index)
        })
        row.addEventListener('contextmenu', event => {
            event.preventDefault()
            this.openTagActions(index, event)
        })
        this.installTagDrag(row, index, 'y')
        return row
    }

    private positionTagMenu (anchor: HTMLElement): void {
        if (!this.tagMenu) {
            return
        }
        const rect = anchor.getBoundingClientRect()
        this.tagMenu.style.bottom = `${window.innerHeight - rect.top + 6}px`
        this.tagMenu.style.maxHeight = `${Math.max(120, rect.top - 16)}px`
        this.tagMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - this.tagMenu.offsetWidth - 8))}px`
    }

    /** Right-click on a tag in the menu */
    private openTagActions (index: number, event: MouseEvent): void {
        const commands = this.getSavedSenderCommands()
        const item = commands[index] as SavedSenderCommand|undefined
        if (!item) {
            return
        }
        const moveTargets: MenuItemOptions[] = getSavedGroups(commands).map(group => ({
            label: group,
            enabled: item.group !== group,
            click: () => void this.moveTagToGroup(index, group),
        }))
        moveTargets.push(
            { type: 'separator' },
            { label: 'Ungrouped', enabled: !!item.group, click: () => void this.moveTagToGroup(index, undefined) },
            {
                label: 'New group...',
                click: () => this.openFormDialog('Move to a new group', [{ label: 'Group name', value: '' }], 'Move', ([value]) => {
                    const name = normalizeGroupName(value)
                    if (!name) {
                        return false
                    }
                    void this.moveTagToGroup(index, name)
                    return true
                }),
            },
        )
        this.platform.popupContextMenu([
            {
                label: 'Edit...',
                click: () => {
                    this.closeTagMenu()
                    this.selectedSavedCommandIndex = index
                    this.openSenderTagEditor(index)
                },
            },
            { label: 'Move to group', submenu: moveTargets },
            { type: 'separator' },
            {
                label: 'Delete',
                click: () => {
                    this.selectedSavedCommandIndex = index
                    void this.removeSelectedSenderCommand()
                },
            },
        ], event)
    }

    private openGroupMenu (group: string|null, event: MouseEvent): void {
        const count = this.getSavedSenderCommands().filter(item => group === null ? !item.group : item.group === group).length
        const menu: MenuItemOptions[] = [
            { label: `Insert all into Sender (${count})`, enabled: count > 0, click: () => this.insertGroupIntoDraft(group) },
        ]
        if (group !== null) {
            menu.push(
                { type: 'separator' },
                { label: 'Rename group...', click: () => this.openRenameGroupDialog(group) },
                { label: 'Color', submenu: this.buildGroupColorMenu(group) },
                { label: 'Delete group', click: () => void this.deleteGroup(group) },
            )
        }
        this.platform.popupContextMenu(menu, event)
    }

    /**
     * One run of radio items with no separator in between: Electron treats every separator-delimited run as
     * its own radio group and checks the first item of a group with nothing checked
     */
    private buildGroupColorMenu (group: string): MenuItemOptions[] {
        const chosen = this.getChosenGroupColor(group)
        const custom = chosen?.startsWith('#') ? chosen : null
        return [
            { label: 'Automatic', type: 'radio', checked: !chosen, click: () => void this.setGroupColor(group, null) },
            ...Object.entries(GROUP_COLORS).map(([key, color]): MenuItemOptions => ({
                label: color.label,
                type: 'radio',
                checked: chosen === key,
                click: () => void this.setGroupColor(group, key),
            })),
            { label: custom ? `Custom (${custom})...` : 'Custom...', type: 'radio', checked: !!custom, click: () => this.openGroupColorDialog(group) },
        ]
    }

    /** A palette name or a custom #rrggbb color */
    private getChosenGroupColor (group: string): string|null {
        return chosenGroupColor(this.config.store.aiTerminal.senderGroupColors, group)
    }

    private getGroupColor (group: string): string {
        this.automaticGroupColors ??= automaticGroupColors(getSavedGroups(this.getSavedSenderCommands()), this.config.store.aiTerminal.senderGroupColors)
        return groupColorHex(group, this.config.store.aiTerminal.senderGroupColors, this.automaticGroupColors)
    }

    private openGroupColorDialog (group: string): void {
        this.showDialog(buildGroupColorDialog({
            group,
            color: this.getGroupColor(group),
            chosen: this.getChosenGroupColor(group),
            close: () => this.closeSenderTagEditor(),
            apply: color => {
                this.closeSenderTagEditor()
                void this.setGroupColor(group, color)
            },
        }))
    }

    private async setGroupColor (group: string, color: string|null): Promise<void> {
        this.config.store.aiTerminal.senderGroupColors = withGroupColor(this.config.store.aiTerminal.senderGroupColors, group, color)
        await this.config.save()
        this.renderSavedCommandTabs()
    }

    /** Puts every command of the group into the Sender, one per line, ready for Send all */
    private insertGroupIntoDraft (group: string|null): void {
        const commands = this.getSavedSenderCommands()
            .filter(item => group === null ? !item.group : item.group === group)
            .map(item => item.command)
        if (!commands.length) {
            return
        }
        this.resolveVariables(commands, filled => {
            this.selectedSavedCommandIndex = -1
            this.insertIntoDraft(filled.join('\n'))
        })
    }

    private openRenameGroupDialog (group: string): void {
        this.openFormDialog('Rename group', [{ label: 'Group name', value: group }], 'Rename', ([value]) => {
            const name = normalizeGroupName(value)
            if (!name) {
                return false
            }
            void this.renameGroup(group, name)
            return true
        })
    }

    /** Renaming to an existing group name merges the two groups */
    private async renameGroup (from: string, to: string): Promise<void> {
        const commands = this.getSavedSenderCommands()
        for (const item of commands) {
            if (item.group === from) {
                item.group = to
            }
        }
        if (this.tagMenuFilter === from) {
            this.tagMenuFilter = to
        }
        // The color moves with the name; when merging into an existing group, that group keeps its color
        const fromColor = this.getChosenGroupColor(from)
        const colors = withGroupColor(this.config.store.aiTerminal.senderGroupColors, from, null)
        if (fromColor && !this.getChosenGroupColor(to)) {
            colors[to] = fromColor
        }
        this.config.store.aiTerminal.senderGroupColors = colors
        await this.setSavedSenderCommands(commands)
    }

    /** Removes the group only; its tags become ungrouped */
    private async deleteGroup (group: string): Promise<void> {
        const commands = this.getSavedSenderCommands()
        const count = commands.filter(item => item.group === group).length
        const result = await this.platform.showMessageBox({
            type: 'warning',
            message: `Delete group "${group}"?`,
            detail: `Its ${count === 1 ? 'tag moves' : `${count} tags move`} to Ungrouped. The commands are kept.`,
            buttons: ['Delete group', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
        })
        if (result.response !== 0) {
            return
        }
        for (const item of commands) {
            if (item.group === group) {
                delete item.group
            }
        }
        this.config.store.aiTerminal.senderGroupColors = withGroupColor(this.config.store.aiTerminal.senderGroupColors, group, null)
        await this.setSavedSenderCommands(commands)
    }

    private installTagDrag (tab: HTMLElement, index: number, axis: 'x'|'y' = 'x'): void {
        tab.draggable = true
        tab.addEventListener('dragstart', event => {
            event.stopPropagation()
            this.dragTagIndex = index
            this.dragGroup = null
            event.dataTransfer?.setData('application/x-tabby-ai-tag', String(index))
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move'
            }
            tab.classList.add('is-dragging')
            this.savedGroupBar.classList.add('is-dragging-tag')
        })
        tab.addEventListener('dragend', () => this.endSavedDrag())
        tab.addEventListener('dragover', event => {
            if (this.dragTagIndex === null || this.dragTagIndex === index) {
                return
            }
            event.preventDefault()
            event.stopPropagation()
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move'
            }
            const before = this.isBeforeMidpoint(tab, event, axis)
            tab.classList.toggle('is-drop-before', before)
            tab.classList.toggle('is-drop-after', !before)
        })
        tab.addEventListener('dragleave', () => tab.classList.remove('is-drop-before', 'is-drop-after'))
        tab.addEventListener('drop', event => {
            if (this.dragTagIndex === null) {
                return
            }
            event.preventDefault()
            event.stopPropagation()
            const from = this.dragTagIndex
            const before = this.isBeforeMidpoint(tab, event, axis)
            this.endSavedDrag()
            if (from !== index) {
                void this.moveTag(from, index, before)
            }
        })
    }

    private installGroupDrag (element: HTMLElement, group: string): void {
        element.draggable = true
        element.addEventListener('dragstart', event => {
            event.stopPropagation()
            this.dragGroup = group
            this.dragTagIndex = null
            event.dataTransfer?.setData('application/x-tabby-ai-group', group)
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move'
            }
            element.classList.add('is-dragging')
        })
        element.addEventListener('dragend', () => this.endSavedDrag())
        this.installGroupChipDrop(element, group)
    }

    /** A group chip accepts a dragged tag (moves it into the group) or a dragged group (reorders groups) */
    private installGroupChipDrop (element: HTMLElement, group: string|null): void {
        const acceptsGroup = () => group !== null && this.dragGroup !== null && this.dragGroup !== group
        element.addEventListener('dragover', event => {
            if (this.dragTagIndex === null && !acceptsGroup()) {
                return
            }
            event.preventDefault()
            event.stopPropagation()
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move'
            }
            if (this.dragTagIndex !== null) {
                element.classList.add('is-drop-target')
            } else {
                const before = this.isBeforeMidpoint(element, event)
                element.classList.toggle('is-drop-before', before)
                element.classList.toggle('is-drop-after', !before)
            }
        })
        element.addEventListener('dragleave', () => element.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after'))
        element.addEventListener('drop', event => {
            if (this.dragTagIndex === null && !acceptsGroup()) {
                return
            }
            event.preventDefault()
            event.stopPropagation()
            const tagIndex = this.dragTagIndex
            const draggedGroup = this.dragGroup
            const before = this.isBeforeMidpoint(element, event)
            this.endSavedDrag()
            if (tagIndex !== null) {
                void this.moveTagToGroup(tagIndex, group ?? undefined)
            } else if (draggedGroup !== null && group !== null) {
                void this.moveGroup(draggedGroup, group, before)
            }
        })
    }

    private endSavedDrag (): void {
        this.dragTagIndex = null
        this.dragGroup = null
        this.savedGroupBar.classList.remove('is-dragging-tag')
        for (const container of [this.savedGroupBar, this.tagMenu]) {
            if (!container) {
                continue
            }
            for (const element of Array.from(container.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after, .is-drop-target'))) {
                element.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after', 'is-drop-target')
            }
        }
    }

    private isBeforeMidpoint (element: HTMLElement, event: MouseEvent, axis: 'x'|'y' = 'x'): boolean {
        const rect = element.getBoundingClientRect()
        return axis === 'x' ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2
    }

    /** Moves a tag next to another tag; it joins the group of that tag */
    private async moveTag (from: number, to: number, before: boolean): Promise<void> {
        const commands = this.getSavedSenderCommands()
        const item = commands[from]
        const target = commands[to] as SavedSenderCommand|undefined
        if (!target) {
            return
        }
        commands.splice(from, 1)
        if (target.group) {
            item.group = target.group
        } else {
            delete item.group
        }
        const insertAt = commands.indexOf(target) + (before ? 0 : 1)
        commands.splice(insertAt, 0, item)
        this.selectedSavedCommandIndex = insertAt
        await this.setSavedSenderCommands(commands)
    }

    private async moveTagToGroup (index: number, group: string|undefined): Promise<void> {
        const commands = this.getSavedSenderCommands()
        const [item] = commands.splice(index, 1) as (SavedSenderCommand|undefined)[]
        if (!item || item.group === group) {
            return
        }
        if (group) {
            item.group = group
        } else {
            delete item.group
        }
        const insertAt = getGroupEndIndex(commands, group)
        commands.splice(insertAt, 0, item)
        this.selectedSavedCommandIndex = insertAt
        await this.setSavedSenderCommands(commands)
    }

    /** Moves all tags of a group before or after the tags of another group */
    private async moveGroup (group: string, target: string, before: boolean): Promise<void> {
        const commands = this.getSavedSenderCommands()
        const selected = commands[this.selectedSavedCommandIndex] as SavedSenderCommand|undefined
        const moving = commands.filter(item => item.group === group)
        const rest = commands.filter(item => item.group !== group)
        const first = rest.findIndex(item => item.group === target)
        if (first < 0) {
            return
        }
        rest.splice(before ? first : getGroupEndIndex(rest, target), 0, ...moving)
        this.selectedSavedCommandIndex = selected ? rest.indexOf(selected) : -1
        await this.setSavedSenderCommands(rest)
    }

    private getSenderCommandInsertMode (): 'replace'|'append' {
        return this.config.store.aiTerminal.senderCommandInsertMode === 'append' ? 'append' : 'replace'
    }

    private senderSection (body: HTMLElement, buttons: HTMLElement[] = []): HTMLElement {
        const section = document.createElement('div')
        section.className = 'ai-panel-section ai-sender-section'

        const heading = document.createElement('div')
        heading.className = 'ai-sender-heading'

        heading.append(this.createSavedCommandToolbar())
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
        // jsdom, which runs the tests, has no ResizeObserver
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
            this.jumpLatestButton.hidden = false
            return
        }
        this.jumpLatestButton.hidden = true
        this.chatViewport.scrollTop = this.chatViewport.scrollHeight
        this.chatAutoScroll = true
    }

    private isChatScrolledToBottom (): boolean {
        const distanceFromBottom = this.chatViewport.scrollHeight - this.chatViewport.scrollTop - this.chatViewport.clientHeight
        return distanceFromBottom < 16
    }

    private clearLatestSessionOutput (): void {
        this.capture.clear()
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
        if (this.runHandle !== null || !this.referenceFolder) {
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
        this.latestOutputAuto = true
        this.jumpLatestButton.hidden = true
        this.renderProviderIdentity()
        this.render()
    }

    private renderReferenceFolder (): void {
        const hasFolder = Boolean(this.referenceFolder)
        this.clearReferenceFolderButton.hidden = !hasFolder
        this.referenceFolderPathElement.hidden = false
        this.referenceFolderPathElement.classList.toggle('is-empty', !hasFolder)
        if (!this.referenceFolder) {
            this.referenceFolderPathElement.textContent = 'not selected - click to choose'
            this.referenceFolderButton.title = 'Choose a folder Claude Code may read.\nWithout a folder, every mode runs as Plan (read-only).'
            return
        }

        this.referenceFolderPathElement.textContent = this.formatReferenceFolderPath(this.referenceFolder)
        this.referenceFolderButton.title = `${this.referenceFolder}\n\nClick to choose another folder`
    }

    private formatReferenceFolderPath (folder: string): string {
        const normalized = folder.replace(/\\/g, '/').replace(/\/+$/g, '')
        const name = normalized.split('/').filter(Boolean).pop()
        return name ? `.../${name}` : normalized
    }

    private updateLatestOutputFromEditor (): void {
        this.capture.replaceLines(this.output.value ? this.output.value.split(/\r?\n/) : [])
        this.latestOutputMeta.textContent = this.formatLineCount(this.capture.lines.length)
    }

    private requestTerminalRefit (): void {
        const refit = () => {
            if (!this.destroyed) {
                this.tab.configure()
            }
        }
        setTimeout(refit)
        setTimeout(refit, 80)
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
        this.runningLabel = label

        indicator.append(spinner, label)
        return indicator
    }

    private getSessionOutputLimit (): number {
        const value = Number(this.config.store.aiTerminal.maxSessionOutputLines)
        if (!Number.isFinite(value) || value < 1) {
            return 100
        }
        return Math.floor(value)
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

}
