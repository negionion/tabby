const fs = require('fs')
const { load, useStubHome } = require('./harness')
const H = useStubHome({ claude: 'claude-update' })
const { AIProviderAuthService } = load('services/aiProviderAuth.service')
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }
const mode = m => fs.writeFileSync(`${H}/claude.mode`, m)
const calls = () => (fs.existsSync(`${H}/calls.log`) ? fs.readFileSync(`${H}/calls.log`, 'utf8').trim().split('\n').filter(Boolean).length : 0)
const store = { aiTerminal: { provider: 'claude', model: 'auto', providerModels: {}, cliAutoUpdate: true, cliUpdateIntervalHours: 24, cliUpdateStatus: {}, claudeModelCandidates: ['haiku'], claudeModelCacheHours: 24, claudeModelCache: { checkedAt: Date.now(), results: { haiku: { state: 'ok' } } } } }
let saves = 0
const a = new AIProviderAuthService({ store, save: async () => { saves++ } }, { showMessageBox: async () => ({ response: 1 }) })
const events = []; a.cliUpdated$.subscribe(p => events.push(`${p}:${a.isCliUpdating(p)}`))
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  ok('stub is the CLI that runs (not the real one)', (await a.getProviderCliVersion('claude')) === '2.1.1')
  ok('missing CLI version is null', (await a.getProviderCliVersion('codex')) === null)
  mode('update')
  const p = a.updateProviderCli('claude')
  ok('updating flag while running', a.isCliUpdating('claude'))
  ok('same promise for concurrent calls', a.updateProviderCli('claude') === p)
  let st = await p
  ok('updated with versions', st.state === 'updated' && st.previousVersion === '2.1.1' && st.version === '2.1.2', JSON.stringify(st))
  ok('last output line kept', st.message === 'Successfully updated from 2.1.1 to version 2.1.2')
  ok('status stored in config and saved', store.aiTerminal.cliUpdateStatus.claude.version === '2.1.2' && saves > 0)
  ok('events at start and end', events.join(',') === 'claude:true,claude:false', events.join(','))
  ok('one update call made', calls() === 1)
  mode('current'); st = await a.updateProviderCli('claude')
  ok('already current', st.state === 'current' && st.version === '2.1.2')
  mode('fail'); st = await a.updateProviderCli('claude')
  ok('failure recorded with first error line', st.state === 'error' && /network unreachable/.test(st.message) && st.version === '2.1.2', JSON.stringify(st))
  mode('prompt'); const t0 = Date.now(); st = await a.updateProviderCli('claude')
  ok('stdin is closed: a prompt does not hang', st.state === 'current' && Date.now() - t0 < 5000)
  // timeout
  const t1 = Date.now(); let err = null
  try { await a.execProviderCommand('claude', ['hang'], 500) } catch (e) { err = e }
  ok('timeout kills a stuck command', err && Date.now() - t1 < 3000, `${Date.now() - t1}ms`)
  // auto update throttling
  const before = calls()
  mode('current')
  store.aiTerminal.cliUpdateStatus.claude.checkedAt = Date.now() - 3600 * 1000
  a.maybeAutoUpdateProviderCli('claude'); await sleep(300)
  ok('auto update skipped inside interval', calls() === before)
  store.aiTerminal.cliUpdateStatus.claude.checkedAt = Date.now() - 25 * 3600 * 1000
  a.beginProviderRun(); a.maybeAutoUpdateProviderCli('claude'); await sleep(300)
  ok('auto update skipped while a CLI run is active', calls() === before && !a.isCliUpdating('claude'))
  a.endProviderRun()
  store.aiTerminal.cliAutoUpdate = false; a.maybeAutoUpdateProviderCli('claude'); await sleep(300)
  ok('auto update off by setting', calls() === before)
  store.aiTerminal.cliAutoUpdate = true; a.maybeAutoUpdateProviderCli('claude')
  ok('auto update runs when due', a.isCliUpdating('claude'))
  await a.waitForCliUpdate('claude')
  ok('auto update finished and recorded', calls() === before + 1 && Date.now() - store.aiTerminal.cliUpdateStatus.claude.checkedAt < 5000)
  // status check triggers it
  store.aiTerminal.cliUpdateStatus.claude.checkedAt = 0
  const status = await a.checkProviderStatus('claude')
  ok('status check reports signed in', status.state === 'logged-in', status.state)
  ok('status check starts the due update', a.isCliUpdating('claude'))
  await a.waitForCliUpdate('claude')
  // a run waiting for update
  mode('slow'); store.aiTerminal.cliUpdateStatus.claude.checkedAt = 0
  a.maybeAutoUpdateProviderCli('claude')
  const t2 = Date.now(); await a.waitForCliUpdate('claude')
  ok('waitForCliUpdate waits for the slow update', Date.now() - t2 >= 800 && (await a.getProviderCliVersion('claude')) === '2.1.9')
  ok('waitForCliUpdate returns at once when idle', await Promise.race([a.waitForCliUpdate('claude').then(() => true), sleep(50).then(() => false)]))
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
})().catch(e => { console.log('ERROR', e); process.exit(1) })
