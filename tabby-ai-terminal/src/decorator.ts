import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal'
import { AITerminalService } from './services/aiTerminal.service'

@Injectable()
export class AITerminalDecorator extends TerminalDecorator {
    constructor (private aiTerminal: AITerminalService) {
        super()
    }

    attach (tab: BaseTerminalTabComponent<any>): void {
        this.aiTerminal.attachToTerminal(tab)
        this.subscribeUntilDetached(tab, tab.input$.subscribe(data => {
            this.aiTerminal.handleInput(tab, data)
        }))
        this.subscribeUntilDetached(tab, tab.output$.subscribe(data => {
            this.aiTerminal.captureOutput(tab, data)
        }))
    }

    detach (tab: BaseTerminalTabComponent<any>): void {
        this.aiTerminal.detachFromTerminal(tab)
        super.detach(tab)
    }
}
