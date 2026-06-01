/// <reference types="node" />
/// <reference types="node" />
import { AppService, ConfigService, NotificationsService, PlatformService } from 'tabby-core';
import { BaseTerminalTabComponent } from 'tabby-terminal';
import { AIProviderAuthService } from './aiProviderAuth.service';
import { AIProviderRunnerService } from './aiProviderRunner.service';
export declare class AITerminalService {
    private app;
    private config;
    private notifications;
    private platform;
    readonly providerAuth: AIProviderAuthService;
    readonly providerRunner: AIProviderRunnerService;
    private panels;
    private stylesInstalled;
    constructor(app: AppService, config: ConfigService, notifications: NotificationsService, platform: PlatformService, providerAuth: AIProviderAuthService, providerRunner: AIProviderRunnerService);
    attachToTerminal(tab: BaseTerminalTabComponent<any>): void;
    detachFromTerminal(tab: BaseTerminalTabComponent<any>): void;
    captureOutput(tab: BaseTerminalTabComponent<any>, data: string): void;
    handleInput(tab: BaseTerminalTabComponent<any>, data: string | Buffer): void;
    toggleActiveTerminalPanel(): void;
    togglePanel(tab: BaseTerminalTabComponent<any>): void;
    private getActiveTerminal;
    private installStyles;
}
