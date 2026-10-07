const { JSDOM } = require('jsdom')
const { loadPanel, installDom } = require('./harness')
const { Subject } = require('rxjs')
const dom = new JSDOM('<!doctype html><body><div id=tab></div></body>', { pretendToBeVisual: true })
installDom(dom)
const { AITerminalPanel } = loadPanel()
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }
const host = document.getElementById('tab')
const tab = { element: { nativeElement: host }, title: 'COM10', customTitle: null, sendInput () {}, frontend: { focus () {} }, configure () {} }
const sub = { subscribe: () => ({ unsubscribe () {} }) }
const store = { aiTerminal: { maxSessionOutputLines: 1000, savedSenderCommands: [] } }
const cliUpdated = new Subject()
let updating = false, finish = null, status
const clicks = []
let known, rechecks = 0, menu = null, logouts = 0
const auth = {
  statusChanged$: sub, cliUpdated$: cliUpdated,
  isCliUpdating: () => updating,
  waitForCliUpdate: () => updating ? new Promise(r => { finish = () => { updating = false; r() } }) : Promise.resolve(),
  getCliUpdateStatus: () => status,
  getKnownCliVersion: () => known,
  clearClaudeModelCache () { rechecks++ },
  updateProviderCli: id => { clicks.push(id); return Promise.resolve() },
  getSelectedProvider: () => 'claude', getSelectedModel: () => 'opus', getAvailableModels: async () => ['auto'], getClaudeModelStatus: () => undefined, publishStatus () {},
}
const runs = []
const runner = { run (req, h) { runs.push(h); return { cancel () {} } }, getClaudeRunSettings: () => ({ mode: 'plan' }) }
const p = new AITerminalPanel(tab, auth, runner, { store, save: async () => {}, changed$: sub }, { showMessageBox: async () => { logouts++; return { response: 1 } }, popupContextMenu: items => { menu = items } })
host.append(p.element, p.senderElement)
p.applyProviderStatus({ provider: 'claude', state: 'logged-in', label: 'ok' })
const identity = () => p.signedInIdentity.textContent
;(async () => {
  ok('no CLI note by default', identity() === 'Session: new', identity())
  known = '2.1.283'; cliUpdated.next('claude')
  ok('identity shows the CLI version', identity() === 'Session: new · Claude Code 2.1.283', identity())
  const more = p.moreButton
  ok('⋯ button in the header controls, Logout button gone', !more.hidden && p.headerControls.contains(more) && !p.headerControls.querySelector('.btn-danger, .btn-outline-danger'))
  more.click()
  ok('⋯ menu: update with version, re-check, separator, log out', menu.map(i => i.label || i.type).join('|') === 'Update Claude Code CLI (2.1.283)|Re-check model availability|separator|Log out of Claude Code...', menu.map(i => i.label || i.type).join('|'))
  menu[0].click()
  ok('menu runs the update for the selected provider', clicks.join() === 'claude')
  menu[1].click()
  ok('menu re-checks models', rechecks === 1)
  updating = true; cliUpdated.next('claude')
  more.click()
  ok('while updating: menu entry disabled, header says updating', menu[0].enabled === false && menu[0].label === 'Updating Claude Code CLI...' && identity() === 'Session: new · updating Claude Code CLI...', identity())
  // analyze waits for the update
  p.question.value = 'why?'
  const done = p.analyze()
  await sleep(10)
  ok('run not started during update', runs.length === 0)
  ok('running label says updating', p.runningLabel.textContent === 'Updating Claude Code CLI...', p.runningLabel.textContent)
  ok('analyze disabled while waiting', p.analyzeButton.disabled)
  status = { checkedAt: Date.now(), state: 'updated', version: '2.1.290', previousVersion: '2.1.283' }
  finish(); cliUpdated.next('claude'); await done; await sleep(10)
  ok('run starts after the update', runs.length === 1)
  ok('label back to Thinking', p.runningLabel.textContent.startsWith('Thinking...'))
  ok('identity shows the new version', identity() === 'Session: new · CLI updated to 2.1.290', identity())
  ok('identity tooltip shows from -> to', p.signedInIdentity.title.includes('2.1.283 → 2.1.290'))
  runs[0].done(0); await sleep(10)
  // cancel while waiting
  updating = true
  p.question.value = 'again'
  const done2 = p.analyze(); await sleep(10)
  p.cancelAnalyze()
  finish(); await done2; await sleep(10)
  ok('cancel during update wait: no run started', runs.length === 1)
  ok('cancel resets running state', !p.analyzeButton.disabled)
  // old update / error: no text, tooltip only
  status = { checkedAt: Date.now() - 48 * 3600 * 1000, state: 'updated', version: '2.1.290', previousVersion: '2.1.283' }
  cliUpdated.next('claude')
  ok('old update not shown', identity() === 'Session: new · Claude Code 2.1.283', identity())
  status = { checkedAt: Date.now(), state: 'error', version: '2.1.290', message: 'network unreachable' }
  cliUpdated.next('claude')
  ok('fresh error shows a short note, details in tooltip', identity() === 'Session: new · CLI update failed' && p.signedInIdentity.title.includes('update failed: network unreachable'), identity())
  status = { checkedAt: Date.now() - 120 * 1000, state: 'error', version: '2.1.290', message: 'network unreachable' }
  cliUpdated.next('claude')
  ok('old error only in tooltip', identity() === 'Session: new · Claude Code 2.1.283' && p.signedInIdentity.title.includes('update failed'))
  status = { checkedAt: Date.now(), state: 'current', version: '2.1.290' }
  cliUpdated.next('claude')
  ok('fresh check says up to date', identity() === 'Session: new · CLI 2.1.290 is up to date', identity())
  ok('version in tooltip', p.signedInIdentity.title.includes('Claude Code CLI 2.1.290'), JSON.stringify(p.signedInIdentity.title))
  status = { checkedAt: Date.now() - 120 * 1000, state: 'current', version: '2.1.290' }
  cliUpdated.next('claude')
  ok('old check: shows the version again', identity() === 'Session: new · Claude Code 2.1.283', identity())
  p.applyProviderStatus({ provider: 'claude', state: 'logged-out', label: 'out' })
  ok('⋯ hidden when signed out', more.hidden)
  p.destroy()
  ok('destroy unsubscribes', (() => { try { cliUpdated.next('claude'); return cliUpdated.observers.length === 0 } catch (e) { return false } })())
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
