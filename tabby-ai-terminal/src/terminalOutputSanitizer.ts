enum ParserState {
    Text = 'text',
    Escape = 'escape',
    EscapeIntermediate = 'escape-intermediate',
    CSI = 'csi',
    ControlString = 'control-string',
    ControlStringEscape = 'control-string-escape',
}

/**
 * Removes terminal control sequences while keeping ordinary text intact.
 *
 * The parser keeps its state between writes because a terminal can split an
 * ANSI sequence across any number of output chunks.
 */
export class TerminalOutputSanitizer {
    private state = ParserState.Text

    write (input: string): string {
        let output = ''

        for (const character of input) {
            const code = character.charCodeAt(0)

            switch (this.state) {
                case ParserState.Text:
                    if (code === 0x1b) {
                        this.state = ParserState.Escape
                    } else if (code === 0x9b) {
                        this.state = ParserState.CSI
                    } else if (this.isControlStringIntroducer(code)) {
                        this.state = ParserState.ControlString
                    } else if (code >= 0x80 && code <= 0x9f) {
                        // Other C1 controls do not produce visible text.
                    } else if (code < 0x20 && character !== '\n' && character !== '\r' && character !== '\t' && character !== '\b') {
                        // Drop C0 controls such as BEL, but retain text layout controls.
                    } else {
                        output += character
                    }
                    break

                case ParserState.Escape:
                    if (character === '[') {
                        this.state = ParserState.CSI
                    } else if (character === ']' || character === 'P' || character === 'X' || character === '^' || character === '_') {
                        this.state = ParserState.ControlString
                    } else if (code >= 0x20 && code <= 0x2f) {
                        this.state = ParserState.EscapeIntermediate
                    } else {
                        this.state = ParserState.Text
                    }
                    break

                case ParserState.EscapeIntermediate:
                    if (code >= 0x30 && code <= 0x7e) {
                        this.state = ParserState.Text
                    }
                    break

                case ParserState.CSI:
                    // CSI parameters include 0-9, ;, :, and private markers.
                    if (code >= 0x40 && code <= 0x7e) {
                        this.state = ParserState.Text
                    } else if (code === 0x1b) {
                        this.state = ParserState.Escape
                    }
                    break

                case ParserState.ControlString:
                    if (code === 0x07 || code === 0x9c) {
                        this.state = ParserState.Text
                    } else if (code === 0x1b) {
                        this.state = ParserState.ControlStringEscape
                    }
                    break

                case ParserState.ControlStringEscape:
                    if (character === '\\') {
                        this.state = ParserState.Text
                    } else if (code !== 0x1b) {
                        this.state = ParserState.ControlString
                    }
                    break
            }
        }

        return output
    }

    private isControlStringIntroducer (code: number): boolean {
        return code === 0x90 || code === 0x98 || code === 0x9d || code === 0x9e || code === 0x9f
    }
}

export function stripTerminalControlSequences (input: string): string {
    return new TerminalOutputSanitizer().write(input)
}
