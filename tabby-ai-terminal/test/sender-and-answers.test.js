const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body><div id=tab></div></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`)
const sent = [], boxes = []; let decide = 0, clip = null, handlers = null
const host = document.getElementById('tab')
const tab = { element: { nativeElement: host }, title: 'Console_ASUS1 - COM10', customTitle: null, sendInput: t => sent.push(t), frontend: { focus () {} }, configure () {} }
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, ignoreEmptyEnterPrompts: true, savedSenderCommands: [], claudeMode: 'plan', senderLineTimeoutMs: 400 } }
const config = { store, save: async () => {}, changed$: sub }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['auto', 'opus'], getClaudeModelStatus: () => undefined, checkSelectedProviderStatus: async () => ({ provider: 'claude', state: 'logged-in', label: 'ok' }), publishStatus () {} }
const runner = { run (req, h) { handlers = h; return { cancel () {} } }, getClaudeRunSettings: () => ({ mode: 'plan' }) }
const platform = { showMessageBox: async o => { boxes.push(o); return { response: decide } }, setClipboard: ({ text }) => { clip = text } }
const p = new AITerminalPanel(tab, auth, runner, config, platform)
host.append(p.element, p.senderElement)
p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
;(async () => {
  // header
  ok('header rows: provider+buttons / Model / Mode+Effort', p.header.querySelectorAll('.ai-header-row').length === 2 && p.headerControls.contains(p.resetSessionButton) && p.modelRow.contains(p.modelSelect) && p.modeRow.contains(p.effortSelect))
  ok('labels', [...p.header.querySelectorAll('.ai-header-label')].map(x => x.textContent).join(',') === 'Model,Mode,Effort,Folder')
  ok('rows visible when signed in', p.modelRow.style.display === '' && p.modeRow.style.display === '')
  ok('identity line', p.signedInIdentity.textContent === 'Session: new', p.signedInIdentity.textContent)
  ok('buttons renamed', p.resetSessionButton.textContent === 'New session' && p.headerControls.contains(p.moreButton))
  ok('effort options plain', [...p.effortSelect.options].map(o => o.textContent).join(',') === 'auto,low,medium,high,xhigh,max')
  // sender target + collapse
  ok('target tab named in the send button tooltips', p.senderLineButton.title === 'Send the first line to Console_ASUS1 - COM10' && p.senderAllButton.title.startsWith('Send every line to Console_ASUS1 - COM10') && !p.senderElement.querySelector('.ai-sender-title'), p.senderLineButton.title)
  ok('empty sender collapsed', host.classList.contains('ai-terminal-sender-collapsed'))
  ok('tag hint shown when no tags', !!p.savedCommandTabs.querySelector('.ai-saved-command-hint'))
  // analyze label + draft preserved
  p.appendOutput('line one\r\nline two\r\n'); p.render()
  ok('Analyze shows line count', p.analyzeButton.textContent === 'Analyze (2 lines)', p.analyzeButton.textContent)
  p.draft.value = 'my staged cmd'; p.updateSenderState()
  ok('non-empty sender expanded', !host.classList.contains('ai-terminal-sender-collapsed'))
  ok('next preview', p.senderNextPreview.textContent === 'Next: my staged cmd')
  await p.analyze()
  const answer = '## Diagnosis\nThe **radio** looks fine. Check `hostapd`:\n- item one\n- item two\n\n| key | value |\n|---|---|\n| ch | 36 |\n\n```\nsome log excerpt\n```\n\n## Suggested commands\n```sh\nwifi status\n# comment line\nreboot\n```\n'
  for (const part of answer.match(/[\s\S]{1,17}/g)) handlers.output(part)
  ok('draft NOT overwritten while streaming', p.draft.value === 'my staged cmd')
  handlers.done(0)
  const md = p.chatHistory.querySelector('.ai-markdown')
  ok('markdown rendered', md && md.querySelector('ul li') && md.querySelector('strong').textContent === 'radio' && md.querySelector('code').textContent === 'hostapd' && md.querySelector('table td') && md.querySelector('pre.ai-md-code').textContent === 'some log excerpt')
  ok('suggested section removed from markdown body', !md.textContent.includes('Suggested commands') && !md.textContent.includes('wifi status'))
  const rows = [...p.chatHistory.querySelectorAll('.ai-suggested-row')]
  ok('suggested rows (comment skipped, log block not treated as command)', rows.map(r => r.querySelector('code').textContent).join('|') === 'wifi status|reboot')
  ok('suggested target shown', p.chatHistory.querySelector('.ai-suggested-target').textContent === '→ Console_ASUS1 - COM10')
  // inline send
  rows[0].querySelectorAll('button')[0].click(); await sleep(10)
  ok('safe command sent without prompt', sent.at(-1) === 'wifi status\r' && boxes.length === 0)
  decide = 1; rows[1].querySelectorAll('button')[0].click(); await sleep(10)
  ok('dangerous command asks, Cancel blocks it', boxes.length === 1 && sent.at(-1) === 'wifi status\r', boxes[0] && boxes[0].message)
  decide = 0; rows[1].querySelectorAll('button')[0].click(); await sleep(10)
  ok('dangerous command sent after confirm', sent.at(-1) === 'reboot\r')
  rows[0].querySelectorAll('button')[1].click()
  ok('-> Sender appends', p.draft.value === 'my staged cmd\nwifi status')
  rows[0].querySelectorAll('button')[2].click()
  ok('Copy', clip === 'wifi status')
  // Send next
  sent.length = 0; await p.sendDraftLine()
  ok('Send next sends first line and removes it', sent[0] === 'my staged cmd\r' && p.draft.value === 'wifi status')
  // Send all with prompt waiting
  p.draft.value = 'cmd1\ncmd2\ncmd3'; p.updateSenderState(); sent.length = 0
  ok('Send all label shows count', p.senderAllButton.textContent === 'Send all (3)')
  p.appendOutput('root@asus:~# ')
  const run = p.sendDraftAll(); await sleep(30)
  ok('first line sent, second waits for prompt', sent.join(',') === 'cmd1\r' && p.draft.readOnly && !p.senderStopButton.hidden, p.senderAllButton.textContent)
  p.appendOutput('c'); await sleep(250)
  ok('echo without newline does not release next line', sent.length === 1)
  p.appendOutput('md1\r\nresult\r\nroot@asus:~# '); await sleep(250)
  ok('prompt after output releases next line', sent.join(',') === 'cmd1\r,cmd2\r')
  p.appendOutput('cmd2\r\nroot@asus:~# '); await sleep(250)
  await run
  ok('all three sent in order, draft empty, busy cleared', sent.join(',') === 'cmd1\r,cmd2\r,cmd3\r' && p.draft.value === '' && !p.senderBusy && p.senderStopButton.hidden)
  // timeout keeps the rest
  p.draft.value = 'a1\na2\na3'; sent.length = 0
  await p.sendDraftAll()
  ok('no prompt -> stops, remaining lines kept', sent.join(',') === 'a1\r' && p.draft.value === 'a2\na3' && p.senderNextPreview.textContent.startsWith('Stopped'), p.senderNextPreview.textContent)
  // stop button
  sent.length = 0; const run2 = p.sendDraftAll(); await sleep(50); p.senderStopButton.click(); await run2
  ok('Stop works', sent.join(',') === 'a2\r' && p.draft.value === 'a3' && p.senderNextPreview.textContent === 'Stopped')
  // dangerous in Send all asks once for the batch
  boxes.length = 0; decide = 1; p.draft.value = 'ls\nuci commit wireless\nfirstboot'; sent.length = 0; await p.sendDraftAll()
  ok('batch with dangerous lines asks once, cancel sends nothing', boxes.length === 1 && boxes[0].detail === 'uci commit wireless\nfirstboot' && sent.length === 0)
  // tags with variables
  await p.saveSenderCommand('station dump', 'iw dev {{iface}} station dump', '', null)
  ok('tag saved, hint gone', p.savedCommandTabs.querySelectorAll('.ai-saved-command-tab').length === 1 && !p.savedCommandTabs.querySelector('.ai-saved-command-hint'))
  p.draft.value = ''; p.savedCommandTabs.querySelector('.ai-saved-command-tab').click()
  const dlg = document.querySelector('.ai-sender-tag-editor-overlay')
  ok('variable dialog opened', dlg && dlg.querySelector('label').textContent.startsWith('iface'))
  dlg.querySelector('input').value = 'phy0-ap0'; dlg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  ok('variable filled into draft and remembered', p.draft.value === 'iw dev phy0-ap0 station dump' && store.aiTerminal.senderVariables.iface === 'phy0-ap0')
  p.openSenderTagEditor(0)
  const del = [...document.querySelectorAll('.ai-sender-tag-editor button')].find(b => b.textContent === 'Delete')
  ok('edit dialog has Delete', !!del); del.click(); await sleep(10)
  ok('tag deleted', store.aiTerminal.savedSenderCommands.length === 0 && !document.querySelector('.ai-sender-tag-editor-overlay'))
  for (let i = 0; i < 15; i++) await p.saveSenderCommand('', `c${i}`, '', null)
  ok('more than 10 tags kept', p.getSavedSenderCommands().length === 15)
  // no Clear button; typing dismisses a notice
  ok('sender has no Clear button', ![...p.senderElement.querySelectorAll('button')].some(b => b.textContent === 'Clear'))
  p.senderNotice = 'Stopped'; p.updateSenderState()
  p.draft.value = 'x'; p.draft.dispatchEvent(new window.Event('input', { bubbles: true }))
  ok('typing in the draft dismisses the notice', p.senderNotice === '' && !p.senderNextPreview.classList.contains('is-notice'))
  // collapse back
  p.draft.value = ''; p.draft.blur(); p.updateSenderState()
  ok('empty + blurred -> collapsed again', host.classList.contains('ai-terminal-sender-collapsed'))
  store.aiTerminal.senderAutoCollapse = false; p.updateSenderState()
  ok('senderAutoCollapse=false keeps sender open', !host.classList.contains('ai-terminal-sender-collapsed'))
  delete store.aiTerminal.senderAutoCollapse; p.updateSenderState()
  ok('default auto-collapse again', host.classList.contains('ai-terminal-sender-collapsed'))
  p.draft.focus(); ok('focusing the one-line input expands', !host.classList.contains('ai-terminal-sender-collapsed')); p.draft.blur()
  // codex hides mode row
  auth.getSelectedProvider = () => 'codex'; p.providerSelect.value = 'codex'; p.applyProviderStatus({ provider: 'codex', state: 'logged-in', label: 'ok' })
  ok('codex hides Mode/Effort row', p.modeRow.style.display === 'none' && p.modelRow.style.display === '')
  p.applyProviderStatus({ provider: 'codex', state: 'logged-out', label: 'x' })
  ok('logged out hides rows', p.modelRow.style.display === 'none' && p.modeRow.style.display === 'none')
})().catch(e => { console.error('ERROR', e); process.exit(1) })
