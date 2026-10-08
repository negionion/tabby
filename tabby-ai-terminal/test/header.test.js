const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const { Subject } = require('rxjs')
const ok = (n, c, e = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e !== '' ? '  | ' + e : ''}`)
const changed = new Subject(); const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [], claudeMode: 'plan' } }
let resets = 0
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['opus'], getClaudeModelStatus: () => undefined, publishStatus () {}, confirmResetSession: async () => { resets++; return true } }
const mk = () => { const host = document.createElement('div'); document.body.appendChild(host); const p = new AITerminalPanel({ element: { nativeElement: host }, title: 'C', sendInput () {}, frontend: { focus () {} }, configure () {} }, auth, { run () { return { cancel () {} } } }, { store, save: async () => changed.next(), changed$: changed }, { showMessageBox: async () => ({ response: 0 }) }); host.append(p.element, p.senderElement); return p }
;(async () => {
  const p = mk()
  p.applyProviderStatus({ provider: 'claude', state: 'logged-out', label: 'x' })
  store.aiTerminal.headerCollapsed = true; p.updateHeaderSummary()
  ok('not signed in: never collapsed, hide button hidden', !p.header.classList.contains('is-collapsed') && p.headerCollapseButton.hidden)
  delete store.aiTerminal.headerCollapsed
  p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
  ok('signed in: expanded, chevron bar is the last row', !p.header.classList.contains('is-collapsed') && p.header.lastElementChild === p.headerCollapseButton && !p.headerCollapseButton.hidden && p.headerControls.firstChild === p.providerSelect)
  p.headerCollapseButton.click(); await new Promise(r => setTimeout(r, 10))
  ok('collapse -> one summary line, saved to config', p.header.classList.contains('is-collapsed') && store.aiTerminal.headerCollapsed === true)
  ok('summary text', p.headerSummaryText.textContent === 'Claude Code · opus · Plan · effort auto · no folder', p.headerSummaryText.textContent)
  p.effortSelect.value = 'high'; p.effortSelect.dispatchEvent(new window.Event('change')); p.modeSelect.value = 'manual'; p.modeSelect.dispatchEvent(new window.Event('change'))
  p.referenceFolder = 'C:/work/enw-device-firmware'; p.render()
  ok('summary follows mode/effort/folder changes', p.headerSummaryText.textContent === 'Claude Code · opus · Manual · effort high · .../enw-device-firmware', p.headerSummaryText.textContent)
  const nb = [...p.headerSummary.querySelectorAll('button')].find(b => b.textContent === 'New session'); nb.click(); await new Promise(r => setTimeout(r, 10))
  ok('New session in summary works and keeps it collapsed', resets === 1 && p.header.classList.contains('is-collapsed'))
  ok('collapsed: chevron still visible with Show title', p.headerCollapseButton.title === 'Show settings' && p.headerCollapseButton.getAttribute('aria-expanded') === 'false')
  p.headerCollapseButton.click(); await new Promise(r => setTimeout(r, 10)); ok('chevron expands again', !p.header.classList.contains('is-collapsed') && p.headerCollapseButton.title === 'Hide settings')
  p.setHeaderCollapsed(true); await new Promise(r => setTimeout(r, 10))
  p.headerSummary.click(); await new Promise(r => setTimeout(r, 10))
  ok('click summary -> expanded, saved', !p.header.classList.contains('is-collapsed') && store.aiTerminal.headerCollapsed === false)
  auth.getClaudeModelStatus = m => ({ opus: { state: 'ok', resolved: 'claude-opus-5-5' }, 'claude-haiku-4-5-20251001': { state: 'ok', resolved: 'claude-haiku-4-5-20251001' } })[m]
  ok('alias shows resolved short name', p.getModelShortLabel('claude', 'opus') === 'opus-5-5')
  ok('full id drops claude- prefix and date', p.getModelShortLabel('claude', 'claude-haiku-4-5-20251001') === 'haiku-4-5')
  ok('unprobed model shown as-is; auto', p.getModelShortLabel('claude', 'sonnet') === 'sonnet' && p.getModelShortLabel('claude', 'auto') === 'auto model')
  p.setHeaderCollapsed(true); await new Promise(r => setTimeout(r, 10))
  ok('collapsed summary uses opus-5-5', p.headerSummaryText.textContent.startsWith('Claude Code · opus-5-5 · '), p.headerSummaryText.textContent)
  p.setHeaderCollapsed(false)
  store.aiTerminal.headerCollapsed = true
  const q = mk(); q.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
  ok('state persists for new panels / after restart', q.header.classList.contains('is-collapsed'))
  process.exit(0)
})()
