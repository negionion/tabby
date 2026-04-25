export const AI_TERMINAL_PANEL_STYLES = `
.ai-terminal-panel-visible > .content { margin-right: 376px; }
.ai-terminal-panel {
    display: none;
    position: absolute;
    top: 10px;
    right: 10px;
    bottom: 10px;
    width: 360px;
    z-index: 6;
    overflow: auto;
    padding: 12px;
    border-radius: 8px;
    background: rgba(14, 19, 25, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}
.ai-terminal-panel.visible { display: block; }
.ai-panel-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.ai-panel-title { font-size: 12px; font-weight: 700; color: #8fd3ff; }
.ai-terminal-panel textarea {
    resize: vertical;
    background: rgba(255, 255, 255, 0.05);
    color: #eef6ff;
    border-color: rgba(255, 255, 255, 0.1);
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
.ai-panel-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-command-card { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
.ai-command { font-size: 12px; color: #fff1b8; }
.ai-command-reason, .ai-empty { font-size: 12px; color: #a9bed1; }
`
