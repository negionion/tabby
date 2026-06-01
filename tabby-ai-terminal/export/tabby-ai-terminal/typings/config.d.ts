import { ConfigProvider } from 'tabby-core';
export declare const DEFAULT_AI_TERMINAL_SYSTEM_PROMPT: string;
/** @hidden */
export declare class AITerminalConfigProvider extends ConfigProvider {
    defaults: {
        aiTerminal: {
            provider: string;
            model: string;
            systemPrompt: string;
            maxSessionOutputLines: number;
            fontSize: number;
            ignoreEmptyEnterPrompts: boolean;
        };
        hotkeys: {
            'toggle-ai-terminal-panel': never[];
        };
    };
    platformDefaults: {
        macOS: {
            hotkeys: {
                'toggle-ai-terminal-panel': string[];
            };
        };
        Windows: {
            hotkeys: {
                'toggle-ai-terminal-panel': string[];
            };
        };
        Linux: {
            hotkeys: {
                'toggle-ai-terminal-panel': string[];
            };
        };
    };
}
