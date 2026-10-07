import { ChangeDetectorRef, Component, HostBinding, OnDestroy, OnInit } from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { AI_PROVIDERS, AIProviderID } from '../providers'
import { AIProviderAuthService } from '../services/aiProviderAuth.service'

/** @hidden */
@Component({
    templateUrl: './aiTerminalSettingsTab.component.pug',
})
export class AITerminalSettingsTabComponent implements OnInit, OnDestroy {
    @HostBinding('class.content-box') true

    providers = AI_PROVIDERS
    cliVersions: Partial<Record<AIProviderID, string>> = {}
    private cliUpdateSubscription?: Subscription
    private destroyed = false

    constructor (
        public config: ConfigService,
        private providerAuth: AIProviderAuthService,
        private changeDetector: ChangeDetectorRef,
    ) { }

    ngOnInit (): void {
        for (const provider of this.providers) {
            void this.loadCliVersion(provider.id)
        }
        this.cliUpdateSubscription = this.providerAuth.cliUpdated$.subscribe(providerID => {
            void this.loadCliVersion(providerID)
        })
    }

    ngOnDestroy (): void {
        this.destroyed = true
        this.cliUpdateSubscription?.unsubscribe()
    }

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

    fixCliUpdateInterval (): void {
        const value = Number(this.config.store.aiTerminal.cliUpdateIntervalHours)
        this.config.store.aiTerminal.cliUpdateIntervalHours = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 24
    }

    isCliUpdating (providerID: AIProviderID): boolean {
        return this.providerAuth.isCliUpdating(providerID)
    }

    updateCliNow (providerID: AIProviderID): void {
        void this.providerAuth.updateProviderCli(providerID)
        this.refresh()
    }

    describeCli (providerID: AIProviderID): string {
        const version = this.cliVersions[providerID]
        const parts = [version === undefined ? 'Checking version...' : version ? `Version ${version}` : 'Not installed']
        if (this.isCliUpdating(providerID)) {
            parts.push('updating...')
        } else {
            const status = this.providerAuth.getCliUpdateStatus(providerID)
            if (status) {
                const checked = new Date(status.checkedAt).toLocaleString()
                if (status.state === 'updated') {
                    parts.push(`updated from ${status.previousVersion} on ${checked}`)
                } else if (status.state === 'error') {
                    parts.push(`last update failed on ${checked}: ${status.message ?? 'unknown error'}`)
                } else {
                    parts.push(`up to date as of ${checked}`)
                }
            }
        }
        return parts.join(' - ')
    }

    private async loadCliVersion (providerID: AIProviderID): Promise<void> {
        const version = await this.providerAuth.getProviderCliVersion(providerID)
        this.cliVersions = { ...this.cliVersions, [providerID]: version ?? '' }
        this.refresh()
    }

    /** CLI callbacks run outside Angular's zone, so the view is refreshed explicitly */
    private refresh (): void {
        if (!this.destroyed) {
            this.changeDetector.detectChanges()
        }
    }
}
