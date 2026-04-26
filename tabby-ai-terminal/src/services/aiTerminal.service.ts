import { Injectable } from '@angular/core'
import { AppService, NotificationsService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import { AITerminalAnalyzer } from '../analysis'
import { AITerminalPanel } from '../panel'
import { AI_TERMINAL_PANEL_STYLES } from '../panelStyles'
import { AIProviderAuthService } from './aiProviderAuth.service'

@Injectable({ providedIn: 'root' })
export class AITerminalService {
    private analyzer = new AITerminalAnalyzer()
    private panels = new Map<BaseTerminalTabComponent<any>, AITerminalPanel>()
    private stylesInstalled = false

    constructor (
        private app: AppService,
        private notifications: NotificationsService,
        readonly providerAuth: AIProviderAuthService,
    ) { }

    attachToTerminal (tab: BaseTerminalTabComponent<any>): void {
        if (this.panels.has(tab)) {
            return
        }

        this.installStyles()
        const panel = new AITerminalPanel(tab, this.analyzer, this.providerAuth)
        this.panels.set(tab, panel)
        tab.element.nativeElement.appendChild(panel.element)
    }

    detachFromTerminal (tab: BaseTerminalTabComponent<any>): void {
        this.panels.get(tab)?.destroy()
        this.panels.delete(tab)
    }

    captureOutput (tab: BaseTerminalTabComponent<any>, data: string): void {
        this.panels.get(tab)?.appendOutput(data)
    }

    toggleActiveTerminalPanel (): void {
        const tab = this.getActiveTerminal()
        if (!tab) {
            this.notifications.notice('AI panel is available on terminal tabs')
            return
        }
        this.togglePanel(tab)
    }

    togglePanel (tab: BaseTerminalTabComponent<any>): void {
        this.panels.get(tab)?.toggle()
    }

    private getActiveTerminal (): BaseTerminalTabComponent<any>|null {
        const activeTab = this.app.activeTab instanceof SplitTabComponent ? this.app.activeTab.getFocusedTab() : this.app.activeTab
        return activeTab instanceof BaseTerminalTabComponent ? activeTab : null
    }

    private installStyles (): void {
        if (this.stylesInstalled) {
            return
        }
        this.stylesInstalled = true
        const style = document.createElement('style')
        style.textContent = AI_TERMINAL_PANEL_STYLES
        document.head.appendChild(style)
    }
}
