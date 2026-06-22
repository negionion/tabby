export const AI_TERMINAL_PANEL_STYLES = `
.ai-terminal-panel-visible > .content {
    margin-right: 386px !important;
}
.ai-terminal-sender-visible > .content {
    margin-bottom: 204px !important;
}
.ai-terminal-panel {
    --ai-terminal-font-size: 12px;
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
    font-size: var(--ai-terminal-font-size);
}
.ai-terminal-panel.visible {
    display: flex;
    flex-direction: column;
}
.ai-terminal-sender {
    --ai-terminal-font-size: 12px;
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
    font-size: var(--ai-terminal-font-size);
}
.ai-terminal-sender,
.ai-terminal-sender * {
    box-sizing: border-box;
}
.ai-terminal-panel .btn,
.ai-terminal-panel .form-control,
.ai-terminal-sender .btn,
.ai-terminal-sender .form-control {
    font-size: var(--ai-terminal-font-size);
}
.ai-terminal-sender.visible { display: flex; }
.ai-terminal-sender .ai-panel-section {
    flex: 1;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    margin-bottom: 0;
    overflow: hidden;
}
.ai-sender-heading {
    flex: 0 0 auto;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 10px;
    align-items: center;
}
.ai-sender-heading > .ai-panel-title {
    flex: 0 0 auto;
}
.ai-saved-command-toolbar {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px 32px;
    gap: 6px;
    align-items: center;
    overflow: hidden;
}
.ai-saved-command-tabs {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    justify-content: flex-start;
    overscroll-behavior-x: contain;
}
.ai-saved-command-tab,
.ai-saved-command-control {
    flex: 0 0 auto;
    min-width: 0;
    height: 28px;
    padding: 3px 9px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #d7e7f5;
    font-size: var(--ai-terminal-font-size);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
}
.ai-saved-command-tab {
    max-width: 20em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-saved-command-tab:hover,
.ai-saved-command-control:hover {
    background: rgba(143, 211, 255, 0.16);
    border-color: rgba(143, 211, 255, 0.36);
}
.ai-saved-command-control.is-remove:hover,
.ai-saved-command-control.is-add:hover {
    background: transparent;
}
.ai-saved-command-tab.is-active {
    color: #0b141d;
    background: #8fd3ff;
    border-color: #8fd3ff;
}
.ai-saved-command-control {
    width: 32px;
    padding: 0;
    font-weight: 700;
    background: transparent;
}
.ai-saved-command-control.is-remove {
    color: #ff8d8d;
    border-color: rgba(255, 96, 96, 0.75);
}
.ai-saved-command-control.is-add {
    color: #8cff75;
    border-color: rgba(124, 255, 96, 0.78);
}
.ai-saved-command-control.is-remove:hover {
    background: rgba(255, 96, 96, 0.12);
    border-color: #ff6060;
}
.ai-saved-command-control.is-add:hover {
    background: rgba(124, 255, 96, 0.12);
    border-color: #7cff60;
}
.ai-sender-tag-editor-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.58);
}
.ai-sender-tag-editor {
    width: min(560px, 100%);
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 20px;
    border: 1px solid rgba(143, 211, 255, 0.28);
    border-radius: 10px;
    background: #18232d;
    color: #d7e7f5;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}
.ai-sender-tag-editor-title {
    margin-bottom: 16px;
    font-size: 18px;
    font-weight: 600;
}
.ai-sender-tag-editor-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
    font-size: 13px;
    color: #b9cad8;
}
.ai-sender-tag-editor .form-control {
    color: #e7f2fa;
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.18);
}
.ai-sender-tag-editor .form-control:focus {
    border-color: #8fd3ff;
    box-shadow: 0 0 0 2px rgba(143, 211, 255, 0.18);
}
.ai-sender-tag-command-input {
    min-height: 130px;
    resize: vertical;
    font-family: var(--bs-font-monospace, monospace);
}
.ai-sender-tag-editor-error {
    min-height: 20px;
    margin-top: -6px;
    color: #ff8d8d;
    font-size: 13px;
}
.ai-sender-tag-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
}
.ai-terminal-sender textarea {
    flex: 1;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 0;
    resize: none;
}
.ai-provider-header {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
}
.ai-provider-controls {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}
.ai-provider-controls .btn {
    white-space: nowrap;
}
.ai-reset-session-button {
    margin-left: auto;
}
.ai-reference-folder-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: nowrap;
}
.ai-reference-folder-path {
    flex: 1 1 auto;
    min-width: 0;
    color: #a9bed1;
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-reference-folder-row .btn {
    flex: 0 0 auto;
    white-space: nowrap;
}
.ai-terminal-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.ai-provider-select { flex: 1 1 120px; min-width: 0; }
.ai-model-select { flex: 1 1 130px; min-width: 0; }
.ai-provider-identity {
    color: #eef6ff;
    font-size: var(--ai-terminal-font-size);
    font-weight: 700;
    overflow-wrap: anywhere;
    word-break: break-word;
}
.ai-provider-status {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.05);
    color: #d7e7f5;
    font-size: var(--ai-terminal-font-size);
}
.ai-panel-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.ai-chat-section {
    flex: 1;
    min-height: 0;
    margin-bottom: 0;
}
.ai-panel-title { font-size: var(--ai-terminal-font-size); font-weight: 700; color: #8fd3ff; }
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
    --ai-latest-output-collapsed-height: 0px;
    --ai-chat-scrollbar-gutter: 0px;
}
.ai-chat-viewport {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
    padding-right: var(--ai-chat-scrollbar-gutter);
    padding-bottom: var(--ai-latest-output-collapsed-height);
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
    font-size: var(--ai-terminal-font-size);
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
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
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
    font-size: var(--ai-terminal-font-size);
    font-weight: 700;
    list-style: none;
}
.ai-output-summary::-webkit-details-marker { display: none; }
.ai-output-summary::before {
    content: '>';
    color: #a9bed1;
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
}
.ai-output-collapse[open] > .ai-output-summary::before { content: 'v'; }
.ai-output-summary span:first-child {
    flex: 1;
    min-width: 0;
}
.ai-collapse-meta {
    color: #a9bed1;
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
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
    font-size: var(--ai-terminal-font-size);
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
    right: var(--ai-chat-scrollbar-gutter);
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
.ai-panel-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-terminal-sender .ai-panel-actions {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    justify-content: flex-end;
}
.ai-chat-section > .ai-panel-actions {
    flex: 0 0 auto;
}
.ai-running-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    color: #a9bed1;
    font-size: var(--ai-terminal-font-size);
    line-height: 1;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    white-space: nowrap;
}
.ai-running-indicator.is-active {
    opacity: 1;
    visibility: visible;
}
.ai-running-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(169, 190, 209, 0.25);
    border-top-color: #8ed4ff;
    border-radius: 50%;
    animation: ai-terminal-spin 0.8s linear infinite;
}
@keyframes ai-terminal-spin {
    to { transform: rotate(360deg); }
}
`
