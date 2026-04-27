import { Injectable } from '@angular/core'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { ConfigService } from 'tabby-core'
import { AIProviderAuthService } from './aiProviderAuth.service'
import { AIProviderID, getAIProvider } from '../providers'
import { DEFAULT_AI_TERMINAL_SYSTEM_PROMPT } from '../config'

export interface AIProviderRunRequest {
    provider: AIProviderID
    question: string
    terminalOutput: string
}

export interface AIProviderRunHandle {
    cancel: () => void
}

export interface AIProviderRunHandlers {
    output: (chunk: string) => void
    error: (chunk: string) => void
    done: (exitCode: number|null) => void
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

        const child = this.spawnCodex(request)
        let stderr = ''
        child.stdout.on('data', data => handlers.output(this.stripAnsi(data.toString())))
        child.stderr.on('data', data => {
            stderr = `${stderr}${this.stripAnsi(data.toString())}`
        })
        child.once('error', error => handlers.error(`${error.message}\n`))
        child.once('close', code => {
            if (code && code !== 0 && stderr.trim()) {
                handlers.error(stderr)
            }
            handlers.done(code)
        })

        child.stdin.end(this.buildPrompt(request))

        return {
            cancel: () => {
                if (!child.killed) {
                    child.kill()
                }
            },
        }
    }

    private spawnCodex (request: AIProviderRunRequest): ChildProcessWithoutNullStreams {
        const args = [
            'exec',
            '-',
            '--color',
            'never',
            '--ephemeral',
            '--sandbox',
            'read-only',
            '--skip-git-repo-check',
        ]
        const model = this.providerAuth.getSelectedModel()
        if (model !== 'auto') {
            args.push('-m', model)
        }

        if (process.platform === 'win32') {
            return spawn('cmd.exe', ['/d', '/s', '/c', this.commandLine(['codex', ...args])])
        }
        return spawn('codex', args)
    }

    private buildPrompt (request: AIProviderRunRequest): string {
        const systemPrompt = this.config.store.aiTerminal.systemPrompt?.trim() || DEFAULT_AI_TERMINAL_SYSTEM_PROMPT
        return [
            '<system_instructions>',
            systemPrompt,
            '</system_instructions>',
            '',
            '<user_request>',
            request.question.trim() || 'Analyze the recent terminal output.',
            '</user_request>',
            '',
            '<terminal_output>',
            request.terminalOutput.trim() || 'No recent terminal output captured.',
            '</terminal_output>',
            '',
        ].join('\n')
    }

    private commandLine (args: string[]): string {
        return args.map(arg => {
            if (/^[A-Za-z0-9._/-]+$/.test(arg)) {
                return arg
            }
            return `"${arg.replace(/"/g, '\\"')}"`
        }).join(' ')
    }

    private stripAnsi (input: string): string {
        return input
            .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
            .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    }
}
