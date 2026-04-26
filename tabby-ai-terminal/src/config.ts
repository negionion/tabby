import { ConfigProvider, Platform } from 'tabby-core'

/** @hidden */
export class AITerminalConfigProvider extends ConfigProvider {
    defaults = {
        aiTerminal: {
            provider: 'codex',
            model: 'auto',
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
