export const AI_TERMINAL_PANEL_STYLES = `
.ai-terminal-panel-visible > .content {
    margin-right: 386px !important;
}
.ai-terminal-sender-visible > .content {
    margin-bottom: 204px !important;
}
.ai-terminal-panel {
    display: none;
    position: absolute;
    top: 54px;
    right: 10px;
    bottom: 10px;
    width: 360px;
    z-index: 6;
    overflow: hidden;
    padding: 12px;
    border-radius: 8px;
    background: rgba(14, 19, 25, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    user-select: text;
}
.ai-terminal-panel.visible {
    display: flex;
    flex-direction: column;
}
.ai-terminal-sender {
    display: none;
    position: absolute;
    left: 10px;
    right: 386px;
    bottom: 10px;
    height: 178px;
    z-index: 5;
    overflow: hidden;
    padding: 12px;
    border-radius: 8px;
    background: rgba(14, 19, 25, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
    user-select: text;
}
.ai-terminal-sender.visible { display: flex; }
.ai-terminal-sender .ai-panel-section {
    flex: 1;
    min-height: 0;
    margin-bottom: 0;
}
.ai-terminal-sender textarea {
    flex: 1;
    min-height: 0;
    resize: none;
}
.ai-provider-header { flex: 0 0 auto; display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.ai-terminal-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.ai-provider-select { flex: 1 1 120px; min-width: 0; }
.ai-model-select { flex: 1 1 130px; min-width: 0; }
.ai-provider-identity {
    flex: 1 1 170px;
    min-width: 0;
    color: #eef6ff;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-provider-status {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.05);
    color: #d7e7f5;
    font-size: 12px;
}
.ai-panel-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.ai-chat-section {
    flex: 1;
    min-height: 0;
    margin-bottom: 0;
}
.ai-panel-title { font-size: 12px; font-weight: 700; color: #8fd3ff; }
.ai-terminal-panel textarea,
.ai-terminal-sender textarea {
    resize: vertical;
    background: rgba(255, 255, 255, 0.05);
    color: #eef6ff;
    border-color: rgba(255, 255, 255, 0.1);
}
.ai-terminal-sender textarea { resize: none; }
.ai-chat-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.ai-chat-stack {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.ai-chat-viewport {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
    padding-right: 4px;
    padding-bottom: 42px;
}
.ai-chat-history {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: visible;
}
.ai-chat-message {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.07);
}
.ai-chat-question {
    align-self: flex-end;
    max-width: 92%;
    padding: 9px 10px;
    border-radius: 10px 10px 2px 10px;
    background: rgba(88, 166, 255, 0.16);
    border: 1px solid rgba(88, 166, 255, 0.28);
    color: #eef6ff;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
}
.ai-analysis-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.ai-message-label {
    color: #8fd3ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
}
.ai-output-collapse {
    display: block;
    margin-bottom: 14px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
}
.ai-output-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    cursor: pointer;
    color: #8fd3ff;
    font-size: 12px;
    font-weight: 700;
    list-style: none;
}
.ai-output-summary::-webkit-details-marker { display: none; }
.ai-output-summary::before {
    content: '>';
    color: #a9bed1;
    font-size: 11px;
}
.ai-output-collapse[open] > .ai-output-summary::before { content: 'v'; }
.ai-output-summary span:first-child {
    flex: 1;
    min-width: 0;
}
.ai-collapse-meta {
    color: #a9bed1;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
}
.ai-output, .ai-analysis {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.05);
    color: #d7e7f5;
    font-size: 12px;
    max-height: 160px;
    overflow: auto;
}
.ai-output-collapse > .ai-output {
    border-radius: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
}
.ai-chat-stack > .ai-latest-output {
    position: absolute;
    left: 0;
    right: 4px;
    bottom: 0;
    z-index: 4;
    display: grid;
    grid-template-rows: auto;
    margin-bottom: 0;
    background: rgba(14, 19, 25, 0.98);
}
.ai-chat-stack > .ai-latest-output[open] {
    top: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.42);
}
.ai-chat-stack > .ai-latest-output > .ai-output-summary {
    grid-row: 1;
    background: rgba(14, 19, 25, 0.98);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.ai-chat-stack > .ai-latest-output[open] > .ai-output-summary {
    grid-row: 2;
}
.ai-chat-stack > .ai-latest-output > .ai-output {
    grid-row: 1;
    height: 100%;
    min-height: 0;
    max-height: none;
    overflow: auto;
    resize: none;
}
.ai-latest-output-editor {
    width: 100%;
    font-family: inherit;
    line-height: 1.35;
}
.ai-chat-output-collapse {
    margin-bottom: 0;
}
.ai-output-snapshot {
    max-height: 130px;
}
.ai-chat-analysis {
    max-height: none;
    overflow: visible;
}
.ai-chat-suggestions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.ai-chat-suggestions[hidden] { display: none; }
.ai-panel-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-chat-section > .ai-panel-actions {
    flex: 0 0 auto;
}
.ai-chat-section > .ai-panel-actions .ai-analyze-button {
    margin-left: auto;
}
.ai-command-card { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
.ai-command { font-size: 12px; color: #fff1b8; }
.ai-command-reason, .ai-empty { font-size: 12px; color: #a9bed1; }
`
