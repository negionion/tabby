const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const { Subject } = require('rxjs')
const ok = (n, c, e = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e !== '' ? '  | ' + e : ''}`)
const changed = new Subject(); const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [], fontSize: 12 } }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['opus'], getClaudeModelStatus: () => undefined, publishStatus () {} }
const mk = () => { const host = document.createElement('div'); document.body.appendChild(host); const p = new AITerminalPanel({ element: { nativeElement: host }, title: 'C', sendInput () {}, frontend: { focus () {} }, configure () {} }, auth, { run () { return { cancel () {} } } }, { store, save: async () => changed.next(), changed$: changed }, { showMessageBox: async () => ({ response: 0 }) }); host.append(p.element, p.senderElement); p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' }); return p }
const shown = mk(); shown.toggle(); const hidden = mk()
const v = p => [p.element.style.getPropertyValue('--ai-terminal-font-size'), p.senderElement.style.getPropertyValue('--ai-terminal-font-size')].join('/')
ok('initial 12px', v(shown) === '12px/12px' && v(hidden) === '12px/12px')
store.aiTerminal.fontSize = 15; changed.next()
ok('visible panel applies 15px immediately on config change', v(shown) === '15px/15px', v(shown))
ok('hidden panel also applies 15px (no output needed)', v(hidden) === '15px/15px', v(hidden))
let renders = 0; const orig = shown.render.bind(shown); shown.render = () => { renders++; orig() }
changed.next(); ok('unrelated config saves do not re-render', renders === 0)
process.exit(0)
