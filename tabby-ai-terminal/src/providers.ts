export type AIProviderID = 'codex'

export type AIProviderState = 'checking'|'logged-in'|'logged-out'|'not-installed'|'restart-required'|'error'

export interface AIProviderStatus {
    provider: AIProviderID
    state: AIProviderState
    label: string
    detail?: string
    account?: string
}

export interface AIProviderDefinition {
    id: AIProviderID
    label: string
    command: string
    models: string[]
    defaultModel: string
}

export const AI_PROVIDERS: AIProviderDefinition[] = [
    {
        id: 'codex',
        label: 'Codex',
        command: 'codex',
        models: ['auto', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-5.4', 'gpt-5.4-mini'],
        defaultModel: 'auto',
    },
]

export function getAIProvider (id: string): AIProviderDefinition {
    return AI_PROVIDERS.find(provider => provider.id === id) ?? AI_PROVIDERS[0]
}
