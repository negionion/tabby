export const AI_TERMINAL_PANEL_STYLES = `
.ai-terminal-panel-visible > .content {
    margin-right: calc(var(--ai-panel-width, 360px) + 26px) !important;
}
.ai-terminal-sender-visible > .content {
    margin-bottom: calc(var(--ai-sender-height, 178px) + 26px) !important;
}
.ai-terminal-panel {
    --ai-terminal-font-size: 12px;
    display: none;
    position: absolute;
    top: 54px;
    right: 10px;
    bottom: 10px;
    width: var(--ai-panel-width, 360px);
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
.ai-permission-card {
    margin: 6px 0;
    padding: 8px;
    border: 1px solid rgba(255, 193, 7, 0.6);
    border-radius: 6px;
    background: rgba(255, 193, 7, 0.08);
}
.ai-permission-title {
    font-weight: 700;
    margin-bottom: 4px;
}
.ai-permission-detail {
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow: auto;
    margin: 0 0 6px;
}
.ai-permission-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}
.ai-terminal-panel.visible {
    display: flex;
    flex-direction: column;
}
.ai-resize-handle-x {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 10;
}
.ai-resize-handle-y {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
    z-index: 10;
}
.ai-resize-handle-x:hover,
.ai-resize-handle-y:hover,
.ai-resizing {
    background: rgba(255, 255, 255, 0.15);
}
.ai-terminal-sender {
    --ai-terminal-font-size: 12px;
    display: none;
    position: absolute;
    left: 10px;
    right: calc(var(--ai-panel-width, 360px) + 26px);
    bottom: 10px;
    height: var(--ai-sender-height, 178px);
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
}
/* Group selector, then the tags of the shown group, then + Save */
.ai-saved-command-toolbar {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    overflow: hidden;
}
.ai-saved-command-tabs {
    flex: 1 1 auto;
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
/* A tag shows its group color as a bar on the left, also in the All view */
.ai-saved-command-tab.has-group,
.ai-saved-command-tab.has-group.is-active {
    border-left: 3px solid var(--ai-group-accent);
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
    padding: 0 10px;
    font-weight: 700;
    background: transparent;
    white-space: nowrap;
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
.ai-more-button {
    flex: 0 0 auto;
    align-self: stretch;
    padding-left: 10px;
    padding-right: 10px;
    font-weight: 700;
}
.ai-folder-field {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: 0;
    padding-bottom: 0;
    padding-right: 4px;
    cursor: pointer;
}
.ai-folder-field:hover {
    border-color: rgba(143, 211, 255, 0.45);
}
.ai-folder-field-button {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
}
.ai-folder-icon {
    flex: 0 0 auto;
    display: inline-flex;
    color: #8fa7bd;
}
.ai-folder-clear-button {
    flex: 0 0 auto;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #8fa7bd;
    line-height: 1.4;
}
.ai-folder-clear-button:hover:not(:disabled) {
    color: #ff8d8d;
    background: rgba(255, 96, 96, 0.12);
}
.ai-folder-clear-button[hidden] {
    display: none;
}
.ai-folder-field-button:disabled,
.ai-folder-clear-button:disabled {
    opacity: 0.55;
    cursor: default;
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
    color: #7f97ad;
    font-size: calc(var(--ai-terminal-font-size) * 0.85);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-header-row {
    display: flex;
    gap: 10px;
    align-items: center;
}
.ai-header-field {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
}
.ai-header-label {
    flex: 0 0 3.4em;
    color: #8fa7bd;
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
}
.ai-header-row .ai-header-field + .ai-header-field .ai-header-label {
    flex-basis: auto;
}
.ai-header-row .ai-header-field:first-child:not(:last-child) {
    flex: 1.5 1 0;
}
.ai-header-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.ai-header-footer .ai-provider-identity {
    flex: 1 1 auto;
    min-width: 0;
}
.ai-header-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 16px;
    margin: -2px 0 -4px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #6f8396;
    cursor: pointer;
}
.ai-header-chevron:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #8fd3ff;
}
.ai-header-chevron svg {
    transform: rotate(180deg);
    transition: transform 0.15s ease;
}
.ai-provider-header.is-collapsed .ai-header-chevron svg {
    transform: rotate(0deg);
}
.ai-header-chevron[hidden] {
    display: none;
}
.ai-header-summary {
    display: none;
    align-items: center;
    gap: 6px;
    min-width: 0;
    cursor: pointer;
}
.ai-header-summary .btn {
    flex: 0 0 auto;
    white-space: nowrap;
}
.ai-header-summary-text {
    flex: 1 1 0;
    width: 0;
    color: #a9bed1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-provider-header.is-collapsed .ai-header-summary {
    display: flex;
}
.ai-provider-header.is-collapsed > :not(.ai-header-summary):not(.ai-header-chevron) {
    display: none !important;
}
.ai-provider-header.is-collapsed {
    margin-bottom: 8px;
}
.ai-header-field .form-control {
    flex: 1 1 auto;
    min-width: 0;
}
.ai-sender-next {
    flex: 1 1 auto;
    min-width: 0;
    align-self: center;
    color: #8fa7bd;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-saved-group-bar {
    flex: 0 0 auto;
    max-width: 40%;
    min-width: 0;
    min-height: 28px;
    display: flex;
    align-items: center;
}
.ai-saved-group-chip {
    max-width: 100%;
    min-width: 0;
    height: 24px;
    padding: 0 9px;
    border-radius: 12px;
    border: 1px solid var(--ai-group-border, rgba(255, 199, 94, 0.5));
    background: transparent;
    color: var(--ai-group-accent, #ffc75e);
    font-size: calc(var(--ai-terminal-font-size) * 0.92);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
}
.ai-saved-group-chip:hover {
    background: var(--ai-group-tint, rgba(255, 199, 94, 0.14));
}
.ai-saved-group-chip.is-active {
    color: var(--ai-group-on, #10151b);
    background: var(--ai-group-color, #ffc75e);
    border-color: var(--ai-group-color, #ffc75e);
}
.ai-saved-group-arrow {
    flex: 0 0 auto;
    font-size: 0.8em;
    opacity: 0.75;
}
.ai-saved-group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ai-saved-group-chip.is-ungrouped .ai-saved-group-name {
    font-style: italic;
}
.ai-saved-group-bar[hidden] {
    display: none;
}
.ai-group-menu.is-dragging-tag .ai-group-menu-item.is-empty {
    display: flex;
}
.ai-saved-group-count {
    flex: 0 0 auto;
    font-size: 0.82em;
    opacity: 0.7;
}
.ai-saved-command-tab.is-dragging,
.ai-group-menu-item.is-dragging {
    opacity: 0.45;
}
.ai-saved-command-tab.is-drop-before {
    box-shadow: inset 3px 0 0 #8fd3ff;
}
.ai-saved-command-tab.is-drop-after {
    box-shadow: inset -3px 0 0 #8fd3ff;
}
/* Group list: a panel on document.body that opens upwards from the group selector */
.ai-group-menu {
    position: fixed;
    z-index: 1500;
    min-width: 200px;
    max-width: min(360px, calc(100vw - 16px));
    display: flex;
    flex-direction: column;
    padding: 6px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: #121920;
    box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.45);
    font-size: var(--ai-terminal-font-size, 12px);
    color: #d7e7f5;
}
.ai-group-menu-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
}
.ai-group-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 5px 8px;
    border: 0;
    border-left: 3px solid var(--ai-group-accent, transparent);
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font-size: inherit;
    text-align: left;
}
.ai-group-menu-item:hover {
    background: rgba(143, 211, 255, 0.14);
}
.ai-group-menu-item.is-active {
    background: var(--ai-group-tint);
}
.ai-group-menu-item.is-active .ai-group-menu-name {
    color: var(--ai-group-accent);
    font-weight: 700;
}
.ai-group-menu-item.is-ungrouped .ai-group-menu-name {
    font-style: italic;
}
.ai-group-menu-item.is-empty {
    display: none;
}
.ai-group-menu-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-group-menu-count {
    flex: 0 0 auto;
    color: #7f97ad;
    font-size: 0.85em;
}
.ai-group-menu-item.is-drop-target {
    box-shadow: inset 0 0 0 2px #8fd3ff;
}
.ai-group-menu-item.is-drop-before {
    box-shadow: inset 0 2px 0 #8fd3ff;
}
.ai-group-menu-item.is-drop-after {
    box-shadow: inset 0 -2px 0 #8fd3ff;
}
.ai-color-current {
    margin: -4px 0 10px;
    color: #8fa7bd;
    font-size: 12px;
}
.ai-color-swatch:hover {
    transform: scale(1.15);
}
.ai-color-preview {
    align-self: flex-start;
    height: 26px;
    margin-bottom: 14px;
}
.ai-color-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
}
.ai-color-swatch {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
}
.ai-color-swatch.is-selected {
    border-color: #ffffff;
}
.ai-color-custom {
    flex-direction: row;
    align-items: center;
    gap: 8px;
}
.ai-color-picker {
    width: 36px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: transparent;
}
.ai-color-hex {
    width: 9em;
    font-family: monospace;
}
.ai-saved-command-hint {
    align-self: center;
    color: #6f8396;
    font-style: italic;
    white-space: nowrap;
}
.ai-tag-delete-button {
    margin-right: auto;
}
.ai-terminal-sender-collapsed .ai-terminal-sender {
    height: 88px;
}
.ai-terminal-sender-visible.ai-terminal-sender-collapsed > .content {
    margin-bottom: 114px !important;
}
.ai-terminal-sender-collapsed .ai-terminal-sender textarea {
    overflow: hidden;
    padding-top: 4px;
    padding-bottom: 4px;
    line-height: 1.4;
}
.ai-terminal-sender-collapsed .ai-terminal-sender .ai-panel-actions,
.ai-terminal-sender-collapsed .ai-resize-handle-y {
    display: none;
}
.ai-suggested {
    margin-top: 8px;
    border: 1px solid rgba(143, 211, 255, 0.28);
    border-radius: 8px;
    overflow: hidden;
}
.ai-suggested-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: rgba(143, 211, 255, 0.08);
    color: #8fd3ff;
    font-weight: 700;
    white-space: nowrap;
}
.ai-suggested-head .btn {
    flex: 0 0 auto;
    padding: 1px 8px;
}
.ai-reference-folder-path.is-empty {
    color: #6f8396;
    font-style: italic;
}
.ai-suggested-target {
    flex: 1 1 auto;
    min-width: 0;
    color: #a9bed1;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-suggested-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ai-suggested-row code {
    flex: 1 1 auto;
    min-width: 0;
    color: #e8f3ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-suggested-row .btn {
    flex: 0 0 auto;
    padding: 1px 8px;
}
.ai-markdown {
    white-space: normal;
}
.ai-markdown p {
    margin: 0 0 8px;
}
.ai-markdown ul,
.ai-markdown ol {
    margin: 0 0 8px;
    padding-left: 1.4em;
}
.ai-markdown code {
    padding: 0 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    color: #ffd58a;
}
.ai-markdown .ai-md-code {
    margin: 0 0 8px;
    padding: 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
    white-space: pre-wrap;
    word-break: break-word;
}
.ai-markdown .ai-md-heading {
    margin: 4px 0 6px;
    color: #8fd3ff;
    font-weight: 700;
}
.ai-markdown .ai-md-h1,
.ai-markdown .ai-md-h2 {
    font-size: 1.1em;
}
.ai-markdown .ai-md-table {
    margin: 0 0 8px;
    border-collapse: collapse;
}
.ai-markdown .ai-md-table th,
.ai-markdown .ai-md-table td {
    padding: 2px 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    text-align: left;
}
.ai-markdown {
    color: #e6edf3;
    line-height: 1.6;
}
.ai-markdown p {
    margin: 0 0 10px;
}
.ai-markdown > :last-child {
    margin-bottom: 0;
}
.ai-markdown li {
    margin: 3px 0;
}
.ai-markdown li > ul,
.ai-markdown li > ol {
    margin: 3px 0 0;
}
.ai-markdown strong {
    color: #ffffff;
    font-weight: 700;
}
.ai-markdown strong code {
    font-weight: 700;
}
.ai-markdown em {
    font-style: italic;
    color: #f0f6fc;
}
.ai-markdown code {
    color: #f2cc8f;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    padding: 1px 4px;
    font-size: 0.95em;
}
.ai-markdown .ai-md-code {
    border: 1px solid rgba(255, 255, 255, 0.08);
    line-height: 1.45;
}
.ai-markdown .ai-md-code,
.ai-markdown .ai-md-code * {
    color: #dce6f0;
    background: transparent;
}
.ai-markdown .ai-md-code {
    background: rgba(0, 0, 0, 0.35);
}
.ai-markdown .ai-md-heading {
    margin: 12px 0 6px;
}
.ai-markdown > .ai-md-heading:first-child {
    margin-top: 0;
}
.ai-markdown blockquote {
    margin: 0 0 10px;
    padding: 2px 10px;
    border-left: 3px solid rgba(143, 211, 255, 0.5);
    color: #b8c7d6;
}
.ai-markdown hr {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    margin: 12px 0;
}
.ai-markdown .ai-md-link {
    color: #8fd3ff;
    text-decoration: underline;
    cursor: pointer;
}
.ai-markdown .ai-md-table-wrap {
    max-width: 100%;
    overflow-x: auto;
    margin: 0 0 10px;
}
.ai-markdown .ai-md-table-wrap .ai-md-table {
    margin: 0;
}
.ai-viewer-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    outline: none;
}
.ai-viewer {
    display: flex;
    flex-direction: column;
    width: min(980px, 92vw);
    max-height: 88vh;
    border-radius: 10px;
    background: #0e1319;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    font-size: var(--ai-terminal-font-size);
}
.ai-viewer-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.ai-viewer-title {
    flex: 1 1 auto;
    min-width: 0;
    color: #8fd3ff;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-viewer-body {
    padding: 16px 24px 20px;
    overflow: auto;
    font-size: var(--ai-terminal-font-size);
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
.ai-terminal-panel textarea.ai-question-input {
    flex: 0 0 auto;
    resize: none;
    overflow-y: hidden;
    line-height: 1.5;
}
.ai-question-row {
    position: relative;
    display: flex;
}
.ai-question-row textarea.ai-question-input {
    flex: 1 1 auto;
    min-width: 0;
    padding-right: 30px;
}
/* Sits inside the question box at its bottom right, so it stays put when the box grows */
.ai-example-button {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #5f7487;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
.ai-example-button:hover,
.ai-example-button:focus-visible {
    color: #cfe9ff;
    background: rgba(143, 211, 255, 0.12);
}
.ai-example-button:disabled {
    opacity: 0.5;
    cursor: default;
}
.ai-answer-note {
    margin: 2px 0 6px;
    color: #8fa7bd;
    font-size: 0.9em;
    font-style: italic;
}
.ai-empty-state {
    margin: auto 8px;
    padding: 16px;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    color: #8fa7bd;
    text-align: center;
    line-height: 1.5;
}
.ai-empty-state[hidden] {
    display: none;
}
.ai-jump-latest {
    position: absolute;
    right: calc(var(--ai-chat-scrollbar-gutter) + 10px);
    bottom: calc(var(--ai-latest-output-collapsed-height) + 10px);
    z-index: 5;
    padding: 2px 10px;
    border-radius: 999px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.ai-jump-latest[hidden] {
    display: none;
}
.ai-output-preview {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    margin: 0 8px;
    color: #8fa7bd;
    font-family: monospace;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-output-preview.is-hint {
    font-family: inherit;
    font-style: italic;
    color: #6f8396;
}
.ai-answer-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.ai-answer-meta {
    flex: 1 1 auto;
    min-width: 0;
    color: #6f8396;
    font-size: calc(var(--ai-terminal-font-size) * 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ai-answer-actions {
    display: inline-flex;
    gap: 4px;
}
.ai-answer-actions .btn {
    padding: 0 8px;
    font-size: calc(var(--ai-terminal-font-size) * 0.85);
}
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
    flex: 0 0 auto;
    margin-right: auto;
    white-space: nowrap;
}
.ai-chat-stack > .ai-latest-output {
    grid-template-columns: minmax(0, 1fr);
}
.ai-output-summary {
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
