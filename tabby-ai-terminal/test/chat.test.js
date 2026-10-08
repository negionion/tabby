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
const runner = { run (req, h) { runs.push({ req, h }); return { cancel () { cancels++ } } }, getClaudeRunSettings: folder => ({ requested: 'acceptEdits', mode: folder ? 'acceptEdits' : 'plan' }) }
let menu = null
const p = new AITerminalPanel(tab, auth, runner, { store, save: async () => {}, changed$: sub }, { showMessageBox: async () => ({ response: 0 }), setClipboard: ({ text }) => { clip = text }, popupContextMenu: items => { menu = items } })
host.append(p.element, p.senderElement)
p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' }); p.visible = true; p.render()
const summaryText = () => p.latestOutputSummary.textContent
;(async () => {
  ok('chat section has no title', !p.content.textContent.includes('AI Chat Panel'))
  ok('names: Output to send / Clear output', summaryText().includes('Output to send') && p.clearLatestButton.textContent === 'Clear output')
  ok('empty state shown on fresh session; example questions behind the lightbulb in the question box', !p.emptyState.hidden && !p.chatBody.querySelector('.ai-example-chip') && p.exampleButton.parentElement === p.question.parentElement)
  ok('placeholder mentions Enter/Shift+Enter', p.question.placeholder.includes('Enter to send') && p.question.title.includes('Shift+Enter') && p.question.rows === 1)
  p.appendOutput('root@asus:~# wifi status\r\n{ "up": true }\r\n'); p.render()
  ok('output arrives on empty chat -> auto expanded', p.latestOutputDetails.open === true)
  ok('empty-state text hidden once output exists', p.emptyState.hidden)
  ok('expanded shows editable hint', p.latestOutputPreview.textContent.startsWith('editable'))
  ok('button says Analyze when question empty', p.analyzeButton.textContent === 'Analyze (2 lines)', p.analyzeButton.textContent)
  p.question.value = 'why down?'; p.question.dispatchEvent(new window.Event('input'))
  ok('button says Ask when question typed', p.analyzeButton.textContent === 'Ask (2 lines)', p.analyzeButton.textContent)
  p.referenceFolder = 'C:/repo'
  await p.analyze()
  ok('Analyze collapses output', p.latestOutputDetails.open === false)
  ok('question box cleared after send', p.question.value === '')
  const r1 = runs[0]
  r1.h.output('The radio is **up**.\n\n## Suggested commands\n```sh\niw dev\n```\n'); await sleep(1100)
  ok('running indicator shows elapsed seconds', /Thinking\.\.\. \d+s/.test(p.runningLabel.textContent), p.runningLabel.textContent)
  r1.h.done(0)
  ok('timer reset after done', p.runningLabel.textContent === 'Thinking...')
  const card = p.chatHistory.querySelector('.ai-chat-message')
  ok('answer label is provider name', card.querySelector('.ai-message-label').textContent === 'Claude')
  const meta = card.querySelector('.ai-answer-meta').textContent
  ok('meta: model, mode, seconds', /^opus · Edit automatically · \d+\.\ds$/.test(meta), meta)
  ok('sent block labeled Output sent', card.textContent.includes('Output sent'))
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
  ok('New session: output expanded again', p.latestOutputDetails.open === true)
  // example questions: a native menu that only fills the question box
  const before = runs.length; p.question.value = ''; p.exampleButton.click()
  const labels = () => menu.map(i => i.label || i.type).join('|')
  ok('bulb button with an icon, not text', p.exampleButton.querySelector('svg') && p.exampleButton.textContent === '' && p.exampleButton.title === 'Example and recent questions')
  ok('menu: examples, then Recent with the questions asked', labels() === 'Why did the STA disconnect?|Summarize the errors and warnings in the output.|separator|Recent|why down?' && menu[3].enabled === false, labels())
  menu[0].click(); await sleep(10)
  ok('choosing an example fills the question without sending', p.question.value === 'Why did the STA disconnect?' && runs.length === before)
  const long = 'x'.repeat(120)
  p.questionHistory.push('why down?', long, 'second')
  p.exampleButton.click()
  ok('recent: newest first, no duplicates, long ones shortened', labels() === `Why did the STA disconnect?|Summarize the errors and warnings in the output.|separator|Recent|second|${'x'.repeat(80)}…|why down?`, labels())
  menu[5].click()
  ok('a shortened recent question fills in the whole question', p.question.value === long)
  // without a folder: one note per session, above the answer and not part of it
  const notes = () => p.chatHistory.querySelectorAll('.ai-answer-note')
  p.referenceFolder = null
  p.resetAIChatSession()
  ok('no note before asking', notes().length === 0)
  await p.analyze(); runs.at(-1).h.output('answer one'); runs.at(-1).h.done(0); await sleep(10)
  ok('first answer without a folder gets the note, with the display name', notes().length === 1 && notes()[0].textContent === 'No folder selected, so this runs as Plan (read-only). Select a folder to use Edit automatically.', notes()[0] && notes()[0].textContent)
  ok('the note is not part of the answer text', !p.chatHistory.querySelector('.ai-chat-message:last-child .ai-markdown').textContent.includes('No folder') && p.chatHistory.querySelector('.ai-chat-message:last-child .ai-markdown').dataset.raw === 'answer one')
  await p.analyze(); runs.at(-1).h.output('answer two'); runs.at(-1).h.done(0); await sleep(10)
  ok('no note on the next answer of the same session', notes().length === 1)
  p.resetAIChatSession()
  await p.analyze(); runs.at(-1).h.done(0); await sleep(10)
  ok('a new session shows the note again', notes().length === 1)
  p.referenceFolder = 'C:/repo'
  // codex label
  auth.getSelectedProvider = () => 'codex'; await p.analyze(); const last = [...p.chatHistory.querySelectorAll('.ai-message-label')].at(-1).textContent; runs.at(-1).h.done(0)
  ok('codex answers labelled Codex, no mode in meta', last === 'Codex' && !/Edit automatically|Plan/.test([...p.chatHistory.querySelectorAll('.ai-answer-meta')].at(-1).textContent))
})().catch(e => { console.error('ERROR', e); process.exit(1) })
