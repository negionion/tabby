import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tabby-core';
/** @hidden */
export declare class AITerminalHotkeyProvider extends HotkeyProvider {
    private translate;
    constructor(translate: TranslateService);
    provide(): Promise<HotkeyDescription[]>;
}
