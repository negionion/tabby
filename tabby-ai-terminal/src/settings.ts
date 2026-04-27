import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { TranslateService } from 'tabby-core'

import { AITerminalSettingsTabComponent } from './components/aiTerminalSettingsTab.component'

/** @hidden */
@Injectable()
export class AITerminalSettingsTabProvider extends SettingsTabProvider {
    id = 'ai-terminal'
    icon = 'robot'
    title: string

    constructor (
        private translate: TranslateService,
    ) {
        super()
        this.title = this.translate.instant('AI terminal')
    }

    getComponentType (): any {
        return AITerminalSettingsTabComponent
    }
}
