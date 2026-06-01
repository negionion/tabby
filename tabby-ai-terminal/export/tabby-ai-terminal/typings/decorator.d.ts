import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal';
import { AITerminalService } from './services/aiTerminal.service';
export declare class AITerminalDecorator extends TerminalDecorator {
    private aiTerminal;
    constructor(aiTerminal: AITerminalService);
    attach(tab: BaseTerminalTabComponent<any>): void;
    detach(tab: BaseTerminalTabComponent<any>): void;
}
