import { NgModule } from '@angular/core'

import TabbyCorePlugin, { ConfigProvider, HotkeyProvider, ToolbarButtonProvider } from 'tabby-core'
import TabbyTerminalModule, { TerminalDecorator } from 'tabby-terminal'
import { AITerminalButtonProvider } from './buttonProvider'
import { AITerminalConfigProvider } from './config'
import { AITerminalHotkeyProvider } from './hotkeys'
import { AITerminalDecorator } from './decorator'

@NgModule({
    imports: [
        TabbyCorePlugin,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ToolbarButtonProvider, useClass: AITerminalButtonProvider, multi: true },
        { provide: ConfigProvider, useClass: AITerminalConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: AITerminalHotkeyProvider, multi: true },
        { provide: TerminalDecorator, useClass: AITerminalDecorator, multi: true },
    ],
})
export default class AITerminalModule { }
