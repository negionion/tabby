import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

import TabbyCorePlugin, { ConfigProvider, HotkeyProvider, ToolbarButtonProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import TabbyTerminalModule, { TerminalDecorator } from 'tabby-terminal'
import { AITerminalButtonProvider } from './buttonProvider'
import { AITerminalConfigProvider } from './config'
import { AITerminalHotkeyProvider } from './hotkeys'
import { AITerminalDecorator } from './decorator'
import { AITerminalSettingsTabProvider } from './settings'
import { AITerminalSettingsTabComponent } from './components/aiTerminalSettingsTab.component'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCorePlugin,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: AITerminalButtonProvider, multi: true },
        { provide: ConfigProvider, useClass: AITerminalConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: AITerminalHotkeyProvider, multi: true },
        { provide: TerminalDecorator, useClass: AITerminalDecorator, multi: true },
        { provide: SettingsTabProvider, useClass: AITerminalSettingsTabProvider, multi: true },
    ],
    declarations: [
        AITerminalSettingsTabComponent,
    ],
})
export default class AITerminalModule { }
