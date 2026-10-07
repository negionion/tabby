const { JSDOM } = require('jsdom')
const { load, loadPanel, installDom } = require('./harness')
const { Subject } = require('rxjs')
const dom = new JSDOM('<!doctype html><body><div id=tab></div></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }
const host = document.getElementById('tab')
const sent = []
const tab = { element: { nativeElement: host }, title: 'COM10', customTitle: null, sendInput: t => sent.push(t), frontend: { focus () {} }, configure () { configures++ } }
let configures = 0
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 5, savedSenderCommands: [], ignoreEmptyEnterPrompts: false, senderLineTimeoutMs: 5000 } }
const statusChanged = new Subject()
let updating = false, finish = null, provider = 'claude', modelCalls = 0
const auth = {
  statusChanged$: statusChanged, cliUpdated$: sub, isCliUpdating: () => updating, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined,
  waitForCliUpdate: () => updating ? new Promise(r => { finish = () => { updating = false; r() } }) : Promise.resolve(),
  getSelectedProvider: () => provider, getSelectedModel: () => 'opus',
  getAvailableModels: async p => { modelCalls++; await sleep(20); return p === 'claude' ? ['auto', 'opus', 'sonnet'] : ['auto', 'gpt-5.4'] },
  getClaudeModelStatus: () => undefined, publishStatus () {}, clearClaudeModelCache () {},
}
const runs = []
const runner = { run (req, h) { runs.push({ req, h }); return { cancel () { h.cancelled = true } } }, getClaudeRunSettings: () => ({ mode: 'plan' }) }
const p = new AITerminalPanel(tab, auth, runner, { store, save: async () => {}, changed$: sub }, { showMessageBox: async () => ({ response: 0 }), popupContextMenu () {} })
host.append(p.element, p.senderElement)
p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
const lines = () => p.capture.getDisplayLines().join('|')
;(async () => {
  // terminal output handling
  p.appendOutput('Downloading 10%\r'); p.appendOutput('Downloading 50%\rDownloading 100%\r\n')
  ok('progress bar \\r updates collapse into one line', lines() === 'Downloading 100%', lines())
  p.appendOutput('line A\r'); p.appendOutput('\nline B\r\n')
  ok('\\r\\n split across chunks is one line break', lines() === 'Downloading 100%|line A|line B', lines())
  p.appendOutput('\n\rafter LF CR\r\r\n')
  ok('\\n\\r and \\r\\r\\n endings', lines().endsWith('line B|after LF CR'), lines())
  p.appendOutput('1\n2\n3\n4\n5\n6\n')
  ok('trimmed to the session limit once per chunk', lines() === '2|3|4|5|6', lines())
  p.appendOutput('x'.repeat(70 * 1024))
  ok('output without newline is capped', p.capture.pending === '' && p.capture.lines[p.capture.lines.length - 1].length === 8 * 1024)
  p.appendOutput('root@asus:~# ')
  ok('prompt stays as the pending line', p.capture.pending === 'root@asus:~# ')
  // redaction
  const red = load('redaction').redactSensitiveText('"password": "hunter2"\nsae_password=Secret1\nwireless.default_radio0.key=\'k99\'\n\toption key \'12345678\'\nkey_mgmt=WPA-PSK\nssid=ASUS')
  ok('redaction covers JSON, sae_password, UCI keys', !/hunter2|Secret1|k99|12345678/.test(red) && red.includes('key_mgmt=WPA-PSK') && red.includes('ssid=ASUS'), JSON.stringify(red))
  // suggested commands sanitized
  const sug = load('markdown').extractSuggestedCommands('ok\n\n## Suggested commands\n```sh\nls\rreboot\nwifi \x1b[31mstatus\x07\n```\n')
  ok('suggested commands: lone \\r splits, control chars removed', JSON.stringify(sug.commands) === JSON.stringify(['ls', 'reboot', 'wifi [31mstatus']), JSON.stringify(sug.commands))
  // inline underscore emphasis unchanged
  const md = load('markdown').renderMarkdown('use snake_case_name and _this_ word', () => undefined)
  ok('snake_case stays literal, _x_ is emphasis', md.querySelectorAll('em').length === 1 && md.querySelector('em').textContent === 'this' && md.textContent.includes('snake_case_name'))
  // streaming answer append
  p.question.value = 'q1'
  await p.analyze()
  const h = runs[0].h
  for (let i = 0; i < 50; i++) h.output(`chunk${i} `)
  ok('streamed chunks appended in order', p.currentAnalysis.textContent.startsWith('chunk0 chunk1') && p.currentAnalysis.textContent.endsWith('chunk49 ') && !p.currentAnalysis.textContent.includes('Analysis will stream'))
  // provider switch from another tab while running
  provider = 'codex'
  statusChanged.next({ provider: 'codex', state: 'logged-in', label: 'ok' })
  ok('switch elsewhere does not cancel the running answer', !h.cancelled && p.analyzing && p.chatHistory.childElementCount > 0)
  h.session('11111111-2222-4333-8444-555555555555')
  h.done(0); await sleep(10)
  ok('after the answer: chat kept, next question starts a new session', p.chatHistory.childElementCount > 0 && p.aiSessionID === null && !p.analyzing)
  statusChanged.next({ provider: 'claude', state: 'logged-in', label: 'ok' }); provider = 'claude'
  statusChanged.next({ provider: 'claude', state: 'logged-in', label: 'ok' })
  // analyze while a CLI update runs: example chip / Enter cannot start a second run
  updating = true
  p.question.value = 'q2'
  const a1 = p.analyze(); await sleep(5)
  const chip = p.exampleRow.querySelector('button')
  chip && chip.click(); await p.analyze(); await sleep(5)
  ok('second Analyze during the update wait is ignored', runs.length === 1 && p.analyzing)
  // Esc cancels during the wait even though the question box is disabled
  p.element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  ok('Esc cancels while waiting for the update', !p.analyzing)
  finish(); await a1; await sleep(5)
  ok('cancelled wait starts no run', runs.length === 1)
  // focus moves into the panel when the question box gets disabled
  p.question.value = 'q3'; p.question.focus()
  await p.analyze()
  ok('focus kept inside the panel while running', document.activeElement === p.element, document.activeElement && document.activeElement.className)
  runs[1].h.done(0); await sleep(5)
  // IME: Enter while composing does not submit the form dialog
  p.openFormDialog('Rename group', [{ label: 'Group name', value: 'x' }], 'Rename', () => { submitted++; return true })
  let submitted = 0
  const input = document.querySelector('.ai-sender-tag-editor-overlay input')
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
  ok('Enter during IME composition does not submit', submitted === 0 && !!document.querySelector('.ai-sender-tag-editor-overlay'))
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  ok('plain Enter submits', submitted === 1)
  // model dropdown keeps its list while refreshing, and follows provider switches
  await p.refreshModelOptions(); const before = p.modelSelect.options.length
  const refresh = p.refreshModelOptions()
  ok('list kept while refreshing', p.modelSelect.options.length === before && before >= 3, `${before}`)
  await refresh
  provider = 'codex'; p.providerSelect.value = 'codex'
  const r2 = p.refreshModelOptions(); p.providerSelect.value = 'claude'; provider = 'claude'
  await r2; await sleep(50)
  ok('provider changed during load: list matches the current provider', [...p.modelSelect.options].some(o => o.value === 'sonnet') && ![...p.modelSelect.options].some(o => o.value === 'gpt-5.4'), [...p.modelSelect.options].map(o => o.value).join(','))
  // destroy stops Send all and refits
  p.draft.value = 'echo 1\necho 2\necho 3'
  const sending = p.sendDraftAll(); await sleep(20)
  configures = 0
  p.destroy()
  await sending; await sleep(150)
  ok('destroy stops Send all', sent.filter(x => x.startsWith('echo')).length === 1, JSON.stringify(sent))
  ok('no refit after destroy', configures === 0)
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
