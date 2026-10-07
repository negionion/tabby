import { stripTerminalControlSequences, TerminalOutputSanitizer } from './terminalOutputSanitizer'

/** Output without a line break is cut into a line of its last MAX_OUTPUT_LINE_CHARS characters past this size */
const MAX_PENDING_OUTPUT_CHARS = 64 * 1024
const MAX_OUTPUT_LINE_CHARS = 8 * 1024

export interface OutputCaptureOptions {
    /** Number of lines kept */
    lineLimit: () => number
    /** Skip the prompt line that an Enter on an empty command line prints */
    ignoreEmptyEnterPrompts: () => boolean
}

/**
 * Turns the terminal output of a tab into clean lines: control sequences removed, \r\n and lone \r handled,
 * at most lineLimit() lines kept. The typed input is tracked only to recognise Enter on an empty line.
 */
export class TerminalOutputCapture {
    /** Complete lines, oldest first */
    lines: string[] = []
    /** The line still being written (no line break yet) */
    pending = ''
    /** Counts every completed line, also the ones trimmed away */
    lineSeq = 0
    private sanitizer = new TerminalOutputSanitizer()
    private pendingCarriageReturn = false
    private currentInputLine = ''
    private skipNextEmptyInputLine = false

    constructor (private options: OutputCaptureOptions) { }

    /** Adds a chunk of terminal output; false when it held nothing visible */
    write (data: string): boolean {
        let text = this.sanitizer.write(data)
        if (this.pendingCarriageReturn) {
            text = `\r${text}`
            this.pendingCarriageReturn = false
        }
        // A trailing \r may be the first half of a \r\n split across chunks
        if (text.endsWith('\r')) {
            this.pendingCarriageReturn = true
            text = text.slice(0, -1)
        }
        if (!text) {
            return false
        }

        const segments = text.replace(/\r+\n/g, '\n').split('\n')
        segments[0] = this.pending + segments[0]
        // A lone \r returns to the line start (progress bars, prompt redraws): keep what was written after it
        this.pending = this.afterCarriageReturn(segments.pop() ?? '')
        for (const segment of segments) {
            this.addLine(this.afterCarriageReturn(segment))
            this.lineSeq++
        }
        if (this.pending.length > MAX_PENDING_OUTPUT_CHARS) {
            // Output without line breaks must not grow without limit
            this.addLine(this.pending.slice(-MAX_OUTPUT_LINE_CHARS))
            this.lineSeq++
            this.pending = ''
        }
        this.trim()
        return true
    }

    /** Typed input; only used to skip the prompt after an Enter on an empty line */
    trackInput (input: string): void {
        if (!this.options.ignoreEmptyEnterPrompts()) {
            return
        }
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
                const hadInput = this.handleSubmit(!sawCommandSubmitInThisInput)
                sawCommandSubmitInThisInput ||= hadInput
                continue
            }

            this.currentInputLine = this.applyInputCharacter(this.currentInputLine, char)
            if (this.currentInputLine.trim().length > 0) {
                this.skipNextEmptyInputLine = false
            }
        }
    }

    /** Moves the pending line into the lines, so it is sent too */
    flush (): void {
        if (!this.pending.trim()) {
            this.pending = ''
            return
        }

        this.addLine(this.pending)
        this.pending = ''
        this.trim()
    }

    resetInputTracking (): void {
        this.currentInputLine = ''
        this.skipNextEmptyInputLine = false
    }

    clear (): void {
        this.lines = []
        this.pending = ''
        this.resetInputTracking()
    }

    /** Replaces the lines with text the user edited */
    replaceLines (lines: string[]): void {
        this.lines = lines
        this.pending = ''
        this.resetInputTracking()
        this.trim()
    }

    trim (): void {
        const excess = this.lines.length - this.options.lineLimit()
        if (excess > 0) {
            this.lines.splice(0, excess)
        }
    }

    getText (): string {
        return this.lines.join('\n')
    }

    getPendingLine (): string {
        return this.normalizeLine(this.pending)
    }

    /** The lines plus the pending one, as shown in "Output to send" */
    getDisplayLines (): string[] {
        return this.hasDisplayedPendingLine() ? [...this.lines, this.getPendingLine()] : this.lines
    }

    getDisplayCount (): number {
        return this.lines.length + (this.hasDisplayedPendingLine() ? 1 : 0)
    }

    private hasDisplayedPendingLine (): boolean {
        return !!this.getPendingLine() && !(this.skipNextEmptyInputLine && this.options.ignoreEmptyEnterPrompts())
    }

    private addLine (line: string): void {
        const normalizedLine = this.normalizeLine(line)
        if (!normalizedLine.trim()) {
            return
        }

        if (this.skipNextEmptyInputLine && this.options.ignoreEmptyEnterPrompts()) {
            this.skipNextEmptyInputLine = false
            return
        }

        this.skipNextEmptyInputLine = false
        this.lines.push(normalizedLine)
    }

    private handleSubmit (allowEmptyInputSuppression = true): boolean {
        const hasInput = this.currentInputLine.trim().length > 0
        this.skipNextEmptyInputLine = this.options.ignoreEmptyEnterPrompts() && !hasInput && allowEmptyInputSuppression
        this.currentInputLine = ''
        return hasInput
    }

    private afterCarriageReturn (line: string): string {
        const index = line.lastIndexOf('\r')
        return index === -1 ? line : line.slice(index + 1)
    }

    private normalizeLine (line: string): string {
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
