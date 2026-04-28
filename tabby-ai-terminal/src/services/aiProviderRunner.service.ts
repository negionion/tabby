import { Injectable } from '@angular/core'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { ConfigService } from 'tabby-core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AIProviderAuthService } from './aiProviderAuth.service'
import { AIProviderID, getAIProvider } from '../providers'
import { DEFAULT_AI_TERMINAL_SYSTEM_PROMPT } from '../config'

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
        if (provider.id !== 'codex') {
            throw new Error(`${provider.label} is not supported yet`)
        }

        const referenceFolder = this.resolveReferenceFolder(request.referenceFolder)
        const prompt = this.buildPrompt(request, referenceFolder)
        const child = this.spawnCodex(request, referenceFolder)
        let stderr = ''
        let detectedSessionID = request.sessionID
        let outputForSessionID = ''
        const startedAt = Date.now()
        child.stdout.on('data', data => {
            const chunk = this.stripAnsi(data.toString())
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
            const chunk = this.stripAnsi(data.toString())
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
            const sessionID = detectedSessionID ?? this.findRecentCodexSessionID(startedAt)
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
            this.escapePromptContent(request.terminalOutput.trim() || 'No recent terminal output captured.'),
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

    private stripAnsi (input: string): string {
        return input
            .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
            .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    }
}
