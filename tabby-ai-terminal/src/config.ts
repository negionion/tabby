import { ConfigProvider, Platform } from 'tabby-core'

export const DEFAULT_AI_TERMINAL_SYSTEM_PROMPT = [
    'You are an AI assistant embedded in a terminal panel.',
    'Help the user analyze terminal output, diagnose command-line problems, and decide practical next steps.',
    'Use the user request and the latest captured terminal output as context.',
    'Do not claim that you executed commands. If information is missing, explain what to check next.',
    'Keep the answer concise, practical, and focused on helping the user solve the terminal issue.',
    'If you recommend commands to run, put them at the very end under a "Suggested commands" heading.',
    'Format suggested commands as a fenced code block using the correct shell syntax, with one command per line.',
].join('\n')

/** @hidden */
export class AITerminalConfigProvider extends ConfigProvider {
    defaults = {
        aiTerminal: {
            provider: 'codex',
            model: 'auto',
            systemPrompt: DEFAULT_AI_TERMINAL_SYSTEM_PROMPT,
            maxSessionOutputLines: 100,
            ignoreEmptyEnterPrompts: true,
        },
        hotkeys: {
            'toggle-ai-terminal-panel': [],
        },
    }

    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                'toggle-ai-terminal-panel': ['Alt-I'],
            },
        },
        [Platform.Windows]: {
            hotkeys: {
                'toggle-ai-terminal-panel': ['Alt-I'],
            },
        },
        [Platform.Linux]: {
            hotkeys: {
                'toggle-ai-terminal-panel': ['Alt-I'],
            },
        },
    }
}
