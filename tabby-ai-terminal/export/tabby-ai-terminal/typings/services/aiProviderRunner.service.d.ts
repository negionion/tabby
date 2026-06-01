import { ConfigService } from 'tabby-core';
import { AIProviderAuthService } from './aiProviderAuth.service';
import { AIProviderID } from '../providers';
export interface AIProviderRunRequest {
    provider: AIProviderID;
    sessionID: string | null;
    referenceFolder: string | null;
    question: string;
    terminalOutput: string;
}
export interface AIProviderRunHandle {
    cancel: () => void;
}
export interface AIProviderRunHandlers {
    session: (sessionID: string) => void;
    output: (chunk: string) => void;
    error: (chunk: string) => void;
    done: (exitCode: number | null) => void;
}
export declare class AIProviderRunnerService {
    private providerAuth;
    private config;
    constructor(providerAuth: AIProviderAuthService, config: ConfigService);
    run(request: AIProviderRunRequest, handlers: AIProviderRunHandlers): AIProviderRunHandle;
    private spawnCodex;
    private resolveReferenceFolder;
    private findRecentCodexSessionID;
    private getCodexHome;
    private findRecentSessionFiles;
    private extractSessionID;
    private buildPrompt;
    private escapePromptContent;
    private stripAnsi;
}
