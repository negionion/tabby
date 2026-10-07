const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const dom = new JSDOM('<!doctype html><body><div id=tab></div></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  | ' + extra : ''}`)
const runs = []; let clip = null, cancels = 0
const host = document.getElementById('tab')
const tab = { element: { nativeElement: host }, title: 'Console_ASUS1', sendInput () {}, frontend: { focus () {} }, configure () {} }
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, ignoreEmptyEnterPrompts: true, savedSenderCommands: [], claudeMode: 'manual' } }
const auth = { statusChanged$: sub, cliUpdated$: sub, isCliUpdating: () => false, getCliUpdateStatus: () => undefined, getKnownCliVersion: () => undefined, getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['auto', 'opus'], getClaudeModelStatus: () => undefined, publishStatus () {} }
const runner = { run (req, h) { runs.push({ req, h }); return { cancel () { cancels++ } } }, getClaudeRunSettings: folder => ({ mode: folder ? 'manual' : 'plan' }) }
const p = new AITerminalPanel(tab, auth, runner, { store, save: async () => {}, changed$: sub }, { showMessageBox: async () => ({ response: 0 }), setClipboard: ({ text }) => { clip = text } })
host.append(p.element, p.senderElement)
p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' }); p.visible = true; p.render()
const summaryText = () => p.latestOutputSummary.textContent
;(async () => {
  ok('chat section title removed', !p.content.textContent.includes('AI Chat Panel'))
  ok('names: Output to send / Clear output', summaryText().includes('Output to send') && p.clearLatestButton.textContent === 'Clear output')
  ok('empty state + example chips shown on fresh session', !p.emptyState.hidden && !p.exampleRow.hidden && p.exampleRow.querySelectorAll('.ai-example-chip').length === 3)
  ok('placeholder mentions Enter/Shift+Enter', p.question.placeholder.includes('Enter to send') && p.question.title.includes('Shift+Enter') && p.question.rows === 1)
  p.appendOutput('root@asus:~# wifi status\r\n{ "up": true }\r\n'); p.render()
  ok('output arrives on empty chat -> auto expanded', p.latestOutputDetails.open === true)
  ok('empty-state text hidden once output exists (chips still there)', p.emptyState.hidden && !p.exampleRow.hidden)
  ok('expanded shows editable hint', p.latestOutputPreview.textContent.startsWith('editable'))
  ok('button says Analyze when question empty', p.analyzeButton.textContent === 'Analyze (2 lines)', p.analyzeButton.textContent)
  p.question.value = 'why down?'; p.question.dispatchEvent(new window.Event('input'))
  ok('button says Ask when question typed', p.analyzeButton.textContent === 'Ask (2 lines)', p.analyzeButton.textContent)
  p.referenceFolder = 'C:/repo'
  await p.analyze()
  ok('Analyze collapses output, hides chips', p.latestOutputDetails.open === false && p.exampleRow.hidden)
  ok('question box cleared after send', p.question.value === '')
  const r1 = runs[0]
  r1.h.output('The radio is **up**.\n\n## Suggested commands\n```sh\niw dev\n```\n'); await sleep(1100)
  ok('running indicator shows elapsed seconds', /Thinking\.\.\. \d+s/.test(p.runningLabel.textContent), p.runningLabel.textContent)
  r1.h.done(0)
  ok('timer reset after done', p.runningLabel.textContent === 'Thinking...')
  const card = p.chatHistory.querySelector('.ai-chat-message')
  ok('answer label is provider name', card.querySelector('.ai-message-label').textContent === 'Claude')
  const meta = card.querySelector('.ai-answer-meta').textContent
  ok('meta: model, mode, seconds', /^opus · Manual · \d+\.\ds$/.test(meta), meta)
  ok('sent block renamed', card.textContent.includes('Output sent'))
  const btns = [...card.querySelectorAll('.ai-answer-actions button')]; const copyBtn = btns.find(b => b.textContent === 'Copy'), retryBtn = btns.find(b => b.textContent === 'Retry')
  copyBtn.click(); ok('Copy copies raw answer text', clip && clip.startsWith('The radio is **up**.') && clip.includes('iw dev'))
  retryBtn.click(); await sleep(10)
  ok('Retry re-sends same question and same output', runs.length === 2 && runs[1].req.question === 'why down?' && runs[1].req.terminalOutput === r1.req.terminalOutput)
  runs[1].h.done(0)
  // new output after an answer: stays collapsed, preview shows last line
  p.appendOutput('[ 12.345678] wlan0: deauthenticated\r\n'); p.render()
  ok('new output after answer stays collapsed', p.latestOutputDetails.open === false)
  ok('collapsed preview shows last line', p.latestOutputPreview.textContent === '[ 12.345678] wlan0: deauthenticated', p.latestOutputPreview.textContent)
  // manual open sticks until next analyze
  p.latestOutputSummary.click(); await sleep(10); p.appendOutput('more\r\n'); p.render()
  ok('manual open is kept while output keeps coming', p.latestOutputDetails.open === true && p.latestOutputAuto === false)
  await p.analyze(); ok('next Analyze collapses again', p.latestOutputDetails.open === false && p.latestOutputAuto === true); runs.at(-1).h.done(0)
  // question history
  p.question.value = ''; p.question.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  ok('ArrowUp recalls previous question', p.question.value === 'why down?', p.question.value)
  p.question.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  ok('ArrowDown goes back to empty', p.question.value === '')
  // Esc cancels a running request
  await p.analyze(); p.element.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  ok('Esc cancels running request', cancels === 1 && !p.runHandle)
  // jump to latest
  await p.analyze(); p.chatAutoScroll = false; runs.at(-1).h.output('streaming...')
  ok('jump-to-latest appears when scrolled up during streaming', p.jumpLatestButton.hidden === false)
  p.jumpLatestButton.click(); ok('click jumps and hides it', p.jumpLatestButton.hidden === true && p.chatAutoScroll === true); runs.at(-1).h.done(0)
  // new session
  p.draft.value = 'keep me'; p.appendOutput('x\r\n'); p.resetAIChatSession()
  ok('New session keeps Sender draft', p.draft.value === 'keep me')
  ok('New session: chips back, output expanded again', !p.exampleRow.hidden && p.latestOutputDetails.open === true)
  // example chip sends
  const before = runs.length; p.exampleRow.querySelectorAll('.ai-example-chip')[1].click(); await sleep(10)
  ok('example chip sends its question', runs.length === before + 1 && runs.at(-1).req.question === 'Why did the STA disconnect?'); runs.at(-1).h.done(0)
  // codex label
  auth.getSelectedProvider = () => 'codex'; await p.analyze(); const last = [...p.chatHistory.querySelectorAll('.ai-message-label')].at(-1).textContent; runs.at(-1).h.done(0)
  ok('codex answers labelled Codex, no mode in meta', last === 'Codex' && !/Manual|Plan/.test([...p.chatHistory.querySelectorAll('.ai-answer-meta')].at(-1).textContent))
})().catch(e => { console.error('ERROR', e); process.exit(1) })
