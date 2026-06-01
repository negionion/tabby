import { HotkeysService, ToolbarButton, ToolbarButtonProvider, TranslateService } from 'tabby-core';
import { AITerminalService } from './services/aiTerminal.service';
export declare class AITerminalButtonProvider extends ToolbarButtonProvider {
    private aiTerminal;
    private translate;
    constructor(aiTerminal: AITerminalService, translate: TranslateService, hotkeys: HotkeysService);
    provide(): ToolbarButton[];
}
