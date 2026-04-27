import { Injectable } from '@angular/core'
import { AppService, ConfigService, NotificationsService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'
import { AITerminalPanel } from '../panel'
import { AI_TERMINAL_PANEL_STYLES } from '../panelStyles'
import { AIProviderAuthService } from './aiProviderAuth.service'
import { AIProviderRunnerService } from './aiProviderRunner.service'

@Injectable({ providedIn: 'root' })
export class AITerminalService {
    private panels = new Map<BaseTerminalTabComponent<any>, AITerminalPanel>()
    private stylesInstalled = false

    constructor (
        private app: AppService,
        private config: ConfigService,
        private notifications: NotificationsService,
        readonly providerAuth: AIProviderAuthService,
        readonly providerRunner: AIProviderRunnerService,
    ) { }

    attachToTerminal (tab: BaseTerminalTabComponent<any>): void {
        if (this.panels.has(tab)) {
            return
        }

        this.installStyles()
        const panel = new AITerminalPanel(tab, this.providerAuth, this.providerRunner, this.config)
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

    handleInput (tab: BaseTerminalTabComponent<any>, data: string|Buffer): void {
        this.panels.get(tab)?.handleInput(data)
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
