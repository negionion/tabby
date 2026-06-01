import { SettingsTabProvider } from 'tabby-settings';
import { TranslateService } from 'tabby-core';
/** @hidden */
export declare class AITerminalSettingsTabProvider extends SettingsTabProvider {
    private translate;
    id: string;
    icon: string;
    title: string;
    constructor(translate: TranslateService);
    getComponentType(): any;
}
