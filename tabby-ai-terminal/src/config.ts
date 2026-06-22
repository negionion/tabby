import { ConfigProvider, Platform } from 'tabby-core'

export const DEFAULT_AI_TERMINAL_SYSTEM_PROMPT = [
    'You are an AI assistant embedded in a terminal panel.',
    'Help the user understand terminal output, answer command-line questions, diagnose problems, and choose practical next steps.',
    'Use the user request, conversation context, and the latest captured terminal output as context.',
    'If a local reference folder is selected, use it only when it is relevant to the user request or terminal problem.',
    'Do not claim that you executed commands. If information is missing, explain what to check next.',
    'Keep the answer concise, practical, and focused on the user\'s actual question.',
    'Do not generate commands by default. If the user is asking for an explanation, interpretation, comparison, or conceptual help, answer directly without a command block.',
    'Only suggest commands when they are clearly useful for the current terminal task, troubleshooting step, or requested action.',
    'Prefer one best command. Include at most three commands unless the user explicitly asks for a larger sequence.',
    'Avoid speculative, redundant, destructive, or cleanup-heavy command suggestions.',
    'If you recommend commands, put them at the very end under a "Suggested commands" heading and format them as one fenced code block using the correct shell syntax, with one command per line.',
].join('\n')

/** @hidden */
export class AITerminalConfigProvider extends ConfigProvider {
    defaults = {
        aiTerminal: {
            provider: 'codex',
            model: 'auto',
            providerModels: {},
            systemPrompt: DEFAULT_AI_TERMINAL_SYSTEM_PROMPT,
            maxSessionOutputLines: 1000,
            fontSize: 14,
            ignoreEmptyEnterPrompts: true,
            senderCommandInsertMode: 'replace',
            savedSenderCommands: [],
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
