import { Injectable } from '@angular/core'
import { HotkeysService, ToolbarButton, ToolbarButtonProvider, TranslateService } from 'tabby-core'
import { AITerminalService } from './services/aiTerminal.service'

@Injectable()
export class AITerminalButtonProvider extends ToolbarButtonProvider {
    constructor (
        private aiTerminal: AITerminalService,
        private translate: TranslateService,
        hotkeys: HotkeysService,
    ) {
        super()
        hotkeys.hotkey$.subscribe(hotkey => {
            if (hotkey === 'toggle-ai-terminal-panel') {
                this.aiTerminal.toggleActiveTerminalPanel()
            }
        })
    }

    provide (): ToolbarButton[] {
        return [
            {
                icon: require('./icons/ai.svg'),
                title: this.translate.instant('AI terminal panel'),
                weight: 9,
                click: () => {
                    this.aiTerminal.toggleActiveTerminalPanel()
                },
            },
        ]
    }
}
