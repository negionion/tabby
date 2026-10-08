// behaviour after throttling: hidden panel catches up when opened; open panel updates within ~100 ms
const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const ok = (n, c, e = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e !== '' ? '  | ' + e : ''}`)
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['opus'], getClaudeModelStatus: () => undefined, publishStatus () {} }
const host = document.createElement('div'); document.body.appendChild(host)
const p = new AITerminalPanel({ element: { nativeElement: host }, title: 'C', sendInput () {}, frontend: { focus () {} }, configure () {} }, auth, { run () { return { cancel () {} } } }, { store: { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [] } }, save: async () => {}, changed$: sub }, { showMessageBox: async () => ({ response: 0 }) })
host.append(p.element, p.senderElement); p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
;(async () => {
  for (let i = 0; i < 50; i++) p.appendOutput(`line ${i}\r\n`)
  ok('hidden: lines captured but no re-render', p.capture.lines.length === 50 && p.analyzeButton.textContent === 'Analyze', p.analyzeButton.textContent)
  p.toggle(); await new Promise(r => setTimeout(r, 10))
  ok('opening the panel catches up immediately', p.analyzeButton.textContent === 'Analyze (50 lines)' && p.latestOutputDetails.open && p.output.value.split('\n').length === 50, p.analyzeButton.textContent)
  for (let i = 50; i < 60; i++) p.appendOutput(`line ${i}\r\n`)
  ok('visible: not re-rendered synchronously per chunk', p.analyzeButton.textContent === 'Analyze (50 lines)')
  await new Promise(r => setTimeout(r, 150))
  ok('visible: updated within ~100 ms', p.analyzeButton.textContent === 'Analyze (60 lines)' && p.output.value.endsWith('line 59'), p.analyzeButton.textContent)
  ok('count helper matches full list', p.getDisplayOutputCount() === p.capture.getDisplayLines().length)
  process.exit(0)
})()
