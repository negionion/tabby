import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider, TranslateService } from 'tabby-core'

/** @hidden */
@Injectable()
export class AITerminalHotkeyProvider extends HotkeyProvider {
    constructor (private translate: TranslateService) { super() }

    async provide (): Promise<HotkeyDescription[]> {
        return [
            {
                id: 'toggle-ai-terminal-panel',
                name: this.translate.instant('Toggle AI terminal panel'),
            },
        ]
    }
}
