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
}

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
        const child = provider.id === 'claude'
            ? this.spawnClaude(request, claudeSessionID!, referenceFolder)
            : this.spawnCodex(request, referenceFolder)
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
                claudeOutputBuffer += data.toString()
                const lines = claudeOutputBuffer.split(/\r?\n/)
                claudeOutputBuffer = lines.pop() ?? ''
                for (const line of lines) {
                    claudeProducedText = this.handleClaudeOutputLine(line, handlers, claudeProducedText)
                }
                return
            }
            const chunk = stdoutSanitizer.write(data.toString())
            if (!detectedSessionID) {
                outputForSessionID = `${outputForSessionID}${chunk}`.slice(-4096)
                detectedSessionID = this.extractSessionID(outputForSessionID)
                if (detectedSessionID) {
                    handlers.session(detectedSessionID)
                }
            }
            handlers.output(chunk)
        })
        child.stderr.on('data', data => {
            const chunk = stderrSanitizer.write(data.toString())
            stderr = `${stderr}${chunk}`
            if (!detectedSessionID) {
                outputForSessionID = `${outputForSessionID}${chunk}`.slice(-4096)
                detectedSessionID = this.extractSessionID(outputForSessionID)
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
                handlers.error(stderr)
            }
            handlers.done(code)
        })

        child.stdin.end(prompt)

        return {
            cancel: () => {
                if (!child.killed) {
                    child.kill()
                }
            },
        }
    }

    private spawnClaude (
        request: AIProviderRunRequest,
        sessionID: string,
        referenceFolder: ReferenceFolderPaths|null,
    ): ChildProcessWithoutNullStreams {
        const args = [
            '--print',
            '--verbose',
            '--output-format',
            'stream-json',
            '--permission-mode',
            'plan',
            '--tools',
            'Read,Glob,Grep',
        ]
        if (request.sessionID) {
            args.push('--resume', sessionID)
        } else {
            args.push('--session-id', sessionID)
        }
        const model = this.providerAuth.getSelectedModel()
        if (model !== 'auto') {
            args.push('--model', model)
        }

        const invocation = this.providerAuth.buildProviderCommandInvocation('claude', args)
        return spawn(invocation.command, invocation.args, { env: invocation.env, cwd: referenceFolder?.nativePath })
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
                handlers.output(text)
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

        const invocation = this.providerAuth.buildProviderCommandInvocation('codex', args)
        return spawn(invocation.command, invocation.args, { env: invocation.env, cwd: referenceFolder?.nativePath })
    }

    private resolveReferenceFolder (folder: string|null): ReferenceFolderPaths|null {
        const trimmed = folder?.trim()
        if (!trimmed) {
            return null
        }

        const resolved = path.resolve(trimmed)
        let stat: fs.Stats
        try {
            stat = fs.statSync(resolved)
        } catch {
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
            const id = this.extractSessionID(filePath)
            if (id) {
                return id
            }
        }
        return null
    }

    private getCodexHome (): string {
        return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
    }

    private findRecentSessionFiles (directory: string, modifiedAfter: number): string[] {
        const files: { path: string, mtime: number }[] = []
        const visit = (dir: string): void => {
            let entries: fs.Dirent[]
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true })
            } catch {
                return
            }
            for (const entry of entries) {
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

    private extractSessionID (filePath: string): string|null {
        const sessionIDPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
        const fromPath = sessionIDPattern.exec(filePath)?.[0]
        if (fromPath) {
            return fromPath
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8')
            return sessionIDPattern.exec(content)?.[0] ?? null
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
            this.escapePromptContent(referenceFolder?.nativePath || 'No local reference folder selected.'),
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
