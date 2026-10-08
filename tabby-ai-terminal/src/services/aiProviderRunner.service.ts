import { Injectable } from '@angular/core'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { randomBytes } from 'crypto'
import { ConfigService } from 'tabby-core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AIProviderAuthService } from './aiProviderAuth.service'
import { AIProviderID, getAIProvider } from '../providers'
import { DEFAULT_AI_TERMINAL_SYSTEM_PROMPT } from '../config'
import { stripTerminalControlSequences, TerminalOutputSanitizer } from '../terminalOutputSanitizer'

export interface AIProviderRunRequest {
    provider: AIProviderID
    sessionID: string|null
    referenceFolder: string|null
    question: string
    terminalOutput: string
}

export interface AIProviderRunHandle {
    cancel: () => void
}

export interface AIProviderRunHandlers {
    session: (sessionID: string) => void
    output: (chunk: string) => void
    error: (chunk: string) => void
    done: (exitCode: number|null) => void
    /** Asked when Claude Code wants to use a tool that needs approval. Resolve true to allow. */
    permission?: (request: AIToolPermissionRequest, requestID: string) => Promise<boolean>|boolean
    permissionCancel?: (requestID: string) => void
}

export interface AIToolPermissionRequest {
    tool_name: string
    display_name?: string
    description?: string
    input?: Record<string, any>
}

export type ClaudeMode = 'plan'|'manual'|'acceptEdits'|'auto'

export interface ClaudeRunSettings {
    /** Mode selected in the panel */
    requested: ClaudeMode
    /** Mode actually used (Plan when no reference folder is selected) */
    mode: ClaudeMode
    tools: string
    /** Non-plan modes answer permission prompts through the stream-json control protocol */
    interactive: boolean
    effort: string|null
}

const CLAUDE_MODE_TOOLS: Record<ClaudeMode, string> = {
    plan: 'Read,Glob,Grep',
    manual: 'Read,Glob,Grep,Edit,Write,Bash',
    acceptEdits: 'Read,Glob,Grep,Edit,Write',
    auto: 'Read,Glob,Grep,Edit,Write,Bash',
}

const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
const SESSION_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
/** stderr kept for the error message of a failed run, and how many of its last lines are shown */
const STDERR_KEEP_CHARS = 64 * 1024
const STDERR_SHOWN_LINES = 40

interface ReferenceFolderPaths {
    nativePath: string
}

@Injectable({ providedIn: 'root' })
export class AIProviderRunnerService {
    constructor (
        private providerAuth: AIProviderAuthService,
        private config: ConfigService,
    ) { }

    run (request: AIProviderRunRequest, handlers: AIProviderRunHandlers): AIProviderRunHandle {
        const provider = getAIProvider(request.provider)
        const referenceFolder = this.resolveReferenceFolder(request.referenceFolder)
        const prompt = this.buildPrompt(request, referenceFolder)
        const claudeSessionID = provider.id === 'claude' ? request.sessionID ?? this.createSessionID() : null
        const claudeSettings = provider.id === 'claude' ? this.getClaudeRunSettings(referenceFolder) : null
        const claudeInteractive = !!claudeSettings?.interactive
        const child = provider.id === 'claude'
            ? this.spawnClaude(request, claudeSessionID!, referenceFolder)
            : this.spawnCodex(request, referenceFolder)
        this.providerAuth.beginProviderRun()
        child.once('close', () => this.providerAuth.endProviderRun())
        // Decode as a stream, so a multi-byte character split across chunks is not garbled
        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        // A CLI that exits early (unknown flag, cancel) makes pending writes fail with EPIPE
        child.stdin.on('error', () => undefined)
        let stderr = ''
        let detectedSessionID = request.sessionID
        let outputForSessionID = ''
        let claudeOutputBuffer = ''
        let claudeProducedText = false
        const stdoutSanitizer = new TerminalOutputSanitizer()
        const stderrSanitizer = new TerminalOutputSanitizer()
        const startedAt = Date.now()
        child.stdout.on('data', data => {
            if (provider.id === 'claude') {
                if (!detectedSessionID && claudeSessionID) {
                    detectedSessionID = claudeSessionID
                    handlers.session(claudeSessionID)
                }
                claudeOutputBuffer += data
                const lines = claudeOutputBuffer.split(/\r?\n/)
                claudeOutputBuffer = lines.pop() ?? ''
                for (const line of lines) {
                    if (claudeInteractive && this.handleClaudeControlLine(line, child, handlers)) {
                        continue
                    }
                    claudeProducedText = this.handleClaudeOutputLine(line, handlers, claudeProducedText)
                }
                return
            }
            const chunk = stdoutSanitizer.write(data)
            if (!detectedSessionID) {
                outputForSessionID = `${outputForSessionID}${chunk}`.slice(-4096)
                detectedSessionID = this.findSessionID(outputForSessionID)
                if (detectedSessionID) {
                    handlers.session(detectedSessionID)
                }
            }
            handlers.output(chunk)
        })
        child.stderr.on('data', data => {
            const chunk = stderrSanitizer.write(data)
            stderr = `${stderr}${chunk}`.slice(-STDERR_KEEP_CHARS)
            if (!detectedSessionID) {
                outputForSessionID = `${outputForSessionID}${chunk}`.slice(-4096)
                detectedSessionID = this.findSessionID(outputForSessionID)
                if (detectedSessionID) {
                    handlers.session(detectedSessionID)
                }
            }
        })
        child.once('error', error => handlers.error(`${error.message}\n`))
        child.once('close', code => {
            if (provider.id === 'claude' && claudeOutputBuffer.trim()) {
                claudeProducedText = this.handleClaudeOutputLine(claudeOutputBuffer, handlers, claudeProducedText)
            }
            const sessionID = detectedSessionID ?? (provider.id === 'codex' ? this.findRecentCodexSessionID(startedAt) : null)
            if (sessionID && sessionID !== detectedSessionID) {
                handlers.session(sessionID)
            }
            if (code && code !== 0 && stderr.trim()) {
                // Codex echoes the whole prompt (with the terminal output) on stderr; the end holds the error
                const lines = stderr.trim().split(/\r?\n/)
                handlers.error(`${lines.length > STDERR_SHOWN_LINES ? `...\n${lines.slice(-STDERR_SHOWN_LINES).join('\n')}` : lines.join('\n')}\n`)
            }
            handlers.done(code)
        })

        if (claudeInteractive) {
            // Keep stdin open for control responses; it is closed when the result event arrives
            child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null, session_id: '' })}\n`)
        } else {
            child.stdin.end(prompt)
        }

        return {
            // On Windows this also ends the CLI under cmd.exe, so a cancelled run stops editing files
            cancel: () => this.providerAuth.killProcessTree(child),
        }
    }

    private spawnClaude (
        request: AIProviderRunRequest,
        sessionID: string,
        referenceFolder: ReferenceFolderPaths|null,
    ): ChildProcessWithoutNullStreams {
        const settings = this.getClaudeRunSettings(referenceFolder)
        const args = [
            '--print',
            '--verbose',
            '--output-format',
            'stream-json',
            '--permission-mode',
            settings.mode,
            '--tools',
            settings.tools,
        ]
        if (settings.interactive) {
            args.push('--input-format', 'stream-json', '--permission-prompt-tool', 'stdio')
        }
        if (settings.effort) {
            args.push('--effort', settings.effort)
        }
        if (request.sessionID) {
            args.push('--resume', sessionID)
        } else {
            args.push('--session-id', sessionID)
        }
        const model = this.providerAuth.getSelectedModel()
        if (model !== 'auto') {
            args.push('--model', model)
        }

        return this.spawnProvider('claude', args, referenceFolder)
    }

    /** Mode, tools and effort for the next Claude Code run. Without a reference folder every mode runs as Plan. */
    getClaudeRunSettings (referenceFolder: string|ReferenceFolderPaths|null): ClaudeRunSettings {
        const store = this.config.store.aiTerminal
        const requested: ClaudeMode = store.claudeMode in CLAUDE_MODE_TOOLS ? store.claudeMode : 'plan'
        const mode = referenceFolder ? requested : 'plan'
        const effort = CLAUDE_EFFORT_LEVELS.includes(store.claudeEffort) ? store.claudeEffort : null
        return { requested, mode, tools: CLAUDE_MODE_TOOLS[mode], interactive: mode !== 'plan', effort }
    }

    /**
     * Handles stream-json control messages (tool permission prompts) in interactive modes.
     * Returns true when the line was consumed.
     */
    private handleClaudeControlLine (
        line: string,
        child: ChildProcessWithoutNullStreams,
        handlers: AIProviderRunHandlers,
    ): boolean {
        if (!line.includes('"control_request"') && !line.includes('"control_cancel_request"') && !line.includes('"type":"result"')) {
            return false
        }
        let event: any = null
        try {
            event = JSON.parse(line.trim())
        } catch {
            return false
        }
        const reply = (response: Record<string, any>) => {
            // The run may have been cancelled while the permission card was open
            if (child.stdin.writable) {
                child.stdin.write(`${JSON.stringify({ type: 'control_response', response })}\n`)
            }
        }
        if (event.type === 'result') {
            // The conversation turn is over; closing stdin lets the CLI exit
            try {
                child.stdin.end()
            } catch { }
            return false
        }
        if (event.type === 'control_cancel_request') {
            handlers.permissionCancel?.(event.request_id)
            return true
        }
        if (event.type !== 'control_request') {
            return false
        }
        const request = event.request ?? {}
        if (request.subtype !== 'can_use_tool') {
            reply({ subtype: 'error', request_id: event.request_id, error: `Unsupported control request: ${request.subtype}` })
            return true
        }
        Promise.resolve(handlers.permission ? handlers.permission(request, event.request_id) : false).then(allowed => {
            reply({
                subtype: 'success',
                request_id: event.request_id,
                response: allowed ? { behavior: 'allow', updatedInput: request.input } : { behavior: 'deny', message: 'The user denied this action.' },
            })
        })
        return true
    }

    private handleClaudeOutputLine (
        line: string,
        handlers: AIProviderRunHandlers,
        producedText: boolean,
    ): boolean {
        const trimmed = line.trim()
        if (!trimmed) {
            return producedText
        }

        let event: any = null
        try {
            event = JSON.parse(trimmed)
        } catch {
            handlers.output(`${stripTerminalControlSequences(line)}\n`)
            return true
        }

        if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
            const text = event.message.content
                .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
                .map((block: any) => block.text)
                .join('')
            if (text) {
                // Each assistant event is a whole message; keep messages around tool calls apart
                handlers.output(producedText ? `\n\n${text}` : text)
                return true
            }
        }
        if (event.type === 'result' && !producedText && typeof event.result === 'string') {
            handlers.output(event.result)
            return true
        }
        return producedText
    }

    private createSessionID (): string {
        const bytes = randomBytes(16)
        bytes[6] = bytes[6] & 0x0f | 0x40
        bytes[8] = bytes[8] & 0x3f | 0x80
        const hex = bytes.toString('hex')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }

    private spawnCodex (request: AIProviderRunRequest, referenceFolder: ReferenceFolderPaths|null): ChildProcessWithoutNullStreams {
        const args = request.sessionID ? [
            'exec',
            'resume',
            '-c',
            'sandbox_mode="read-only"',
            '--skip-git-repo-check',
        ] : [
            'exec',
            '--color',
            'never',
            '--sandbox',
            'read-only',
            '--skip-git-repo-check',
        ]
        const model = this.providerAuth.getSelectedModel()
        if (model !== 'auto') {
            args.push('-m', model)
        }
        if (request.sessionID) {
            args.push(request.sessionID)
        }
        args.push('-')

        return this.spawnProvider('codex', args, referenceFolder)
    }

    private spawnProvider (command: string, args: string[], referenceFolder: ReferenceFolderPaths|null): ChildProcessWithoutNullStreams {
        const invocation = this.providerAuth.buildProviderCommandInvocation(command, args, referenceFolder?.nativePath)
        return spawn(invocation.command, invocation.args, {
            env: invocation.env,
            cwd: invocation.cwd,
            windowsHide: true,
            windowsVerbatimArguments: invocation.windowsVerbatimArguments,
        })
    }

    private resolveReferenceFolder (folder: string|null): ReferenceFolderPaths|null {
        const trimmed = folder?.trim()
        if (!trimmed) {
            return null
        }

        const resolved = path.resolve(trimmed)
        const stat = this.statPath(resolved)
        if (!stat) {
            throw new Error(`Reference folder does not exist: ${resolved}`)
        }
        if (!stat.isDirectory()) {
            throw new Error(`Reference folder is not a directory: ${resolved}`)
        }
        return {
            nativePath: resolved,
        }
    }

    private findRecentCodexSessionID (startedAt: number): string|null {
        const sessionsDir = path.join(this.getCodexHome(), 'sessions')
        const candidates = this.findRecentSessionFiles(sessionsDir, startedAt - 5000)
        for (const filePath of candidates) {
            const id = this.readSessionIDFromFile(filePath)
            if (id) {
                return id
            }
        }
        return null
    }

    private getCodexHome (): string {
        const codexHome = process.env.CODEX_HOME
        return codexHome ? codexHome : path.join(os.homedir(), '.codex')
    }

    private findRecentSessionFiles (directory: string, modifiedAfter: number): string[] {
        const files: { path: string, mtime: number }[] = []
        const visit = (dir: string): void => {
            for (const entry of this.readDirectory(dir)) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                    visit(fullPath)
                    continue
                }
                if (!entry.isFile()) {
                    continue
                }
                try {
                    const stat = fs.statSync(fullPath)
                    if (stat.mtimeMs >= modifiedAfter) {
                        files.push({ path: fullPath, mtime: stat.mtimeMs })
                    }
                } catch { }
            }
        }
        visit(directory)
        return files.sort((a, b) => b.mtime - a.mtime).map(item => item.path)
    }

    private statPath (target: string): fs.Stats|null {
        try {
            return fs.statSync(target)
        } catch {
            return null
        }
    }

    private readDirectory (dir: string): fs.Dirent[] {
        try {
            return fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            return []
        }
    }

    private findSessionID (text: string): string|null {
        return SESSION_ID_PATTERN.exec(text)?.[0] ?? null
    }

    private readSessionIDFromFile (filePath: string): string|null {
        const fromPath = this.findSessionID(filePath)
        if (fromPath) {
            return fromPath
        }

        try {
            return this.findSessionID(fs.readFileSync(filePath, 'utf8'))
        } catch {
            return null
        }
    }

    private buildPrompt (request: AIProviderRunRequest, referenceFolder: ReferenceFolderPaths|null): string {
        const systemPrompt = this.config.store.aiTerminal.systemPrompt?.trim() || DEFAULT_AI_TERMINAL_SYSTEM_PROMPT
        const terminalOutput = stripTerminalControlSequences(request.terminalOutput).trim()
        return [
            '<system_instructions>',
            systemPrompt,
            '</system_instructions>',
            '',
            '<user_request>',
            this.escapePromptContent(request.question.trim() || 'Analyze the recent terminal output.'),
            '</user_request>',
            '',
            '<terminal_output>',
            this.escapePromptContent(terminalOutput || 'No recent terminal output captured.'),
            '</terminal_output>',
            '',
            '<reference_folder>',
            this.escapePromptContent(referenceFolder?.nativePath ?? 'No local reference folder selected.'),
            '</reference_folder>',
            '',
        ].join('\n')
    }

    private escapePromptContent (input: string): string {
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }

}
