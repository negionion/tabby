import { Component, HostBinding } from '@angular/core'
import { ConfigService } from 'tabby-core'

/** @hidden */
@Component({
    templateUrl: './aiTerminalSettingsTab.component.pug',
})
export class AITerminalSettingsTabComponent {
    @HostBinding('class.content-box') true

    constructor (
        public config: ConfigService,
    ) { }

    fixSessionOutputLimit (): void {
        const value = Number(this.config.store.aiTerminal.maxSessionOutputLines)
        if (!Number.isFinite(value) || value < 1) {
            this.config.store.aiTerminal.maxSessionOutputLines = 100
        } else {
            this.config.store.aiTerminal.maxSessionOutputLines = Math.floor(value)
        }
    }

    fixFontSize (): void {
        const value = Number(this.config.store.aiTerminal.fontSize)
        if (!Number.isFinite(value) || value < 8) {
            this.config.store.aiTerminal.fontSize = 12
        } else {
            this.config.store.aiTerminal.fontSize = Math.min(24, Math.floor(value))
        }
    }
}
