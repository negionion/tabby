import { BaseTerminalTabComponent } from 'tabby-terminal'
import { AITerminalAnalyzer, SuggestedCommand } from './analysis'

const RECENT_OUTPUT_LIMIT = 12000
const VISIBLE_OUTPUT_LINES = 14

export class AITerminalPanel {
    readonly element: HTMLElement
    private question: HTMLTextAreaElement
    private output: HTMLElement
    private analysis: HTMLElement
    private suggestions: HTMLElement
    private draft: HTMLTextAreaElement
    private recentOutput = ''
    private visible = false

    constructor (
        private tab: BaseTerminalTabComponent<any>,
        private analyzer: AITerminalAnalyzer,
    ) {
        this.element = document.createElement('aside')
        this.element.className = 'ai-terminal-panel'
        this.element.addEventListener('click', event => event.stopPropagation())

        this.question = this.textarea('Example: help me analyze the recent hostapd disconnect', 3)
        this.output = document.createElement('pre')
        this.analysis = document.createElement('pre')
        this.suggestions = document.createElement('div')
        this.draft = this.textarea('Commands staged here will be sent to the terminal', 6)

        this.element.append(
            this.section('AI Chat Panel', this.question, [
                this.button('Analyze', 'primary', () => this.analyze()),
            ]),
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

        this.render()
    }

    destroy (): void {
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
            setTimeout(() => this.question.focus())
        } else {
            this.tab.frontend?.focus()
        }
    }

    private analyze (): void {
        const result = this.analyzer.analyze(this.question.value, this.recentOutput)
        this.analysis.textContent = result.message
        this.renderSuggestions(result.suggestions)
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
