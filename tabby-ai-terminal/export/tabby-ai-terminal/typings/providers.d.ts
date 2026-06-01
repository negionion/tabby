export type AIProviderID = 'codex';
export type AIProviderState = 'checking' | 'logged-in' | 'logged-out' | 'not-installed' | 'restart-required' | 'error';
export interface AIProviderStatus {
    provider: AIProviderID;
    state: AIProviderState;
    label: string;
    detail?: string;
    account?: string;
}
export interface AIProviderDefinition {
    id: AIProviderID;
    label: string;
    command: string;
    models: string[];
    defaultModel: string;
}
export declare const AI_PROVIDERS: AIProviderDefinition[];
export declare function getAIProvider(id: string): AIProviderDefinition;
