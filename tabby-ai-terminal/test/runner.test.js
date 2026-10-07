const fs = require('fs')
const path = require('path')
const { load, useStubHome } = require('./harness')
const H = useStubHome({ claude: 'claude-runner', codex: 'codex-runner' })
process.env.WORK = fs.mkdtempSync(path.join(H, 'work-'))
const { AIProviderRunnerService } = load('services/aiProviderRunner.service')
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }
let uncaught = null
process.on('uncaughtException', e => { uncaught = e })
const store = { aiTerminal: { systemPrompt: 'x', claudeMode: 'manual', claudeEffort: 'auto' } }
let runs = 0
const auth = { getSelectedModel: () => 'auto', buildProviderCommandInvocation: (command, args, cwd) => ({ command, args, env: process.env, cwd, windowsVerbatimArguments: false }), beginProviderRun: () => runs++, endProviderRun: () => runs--, killProcessTree: c => c.kill() }
const r = new AIProviderRunnerService(auth, { store })
const run = (provider, mode, request = {}) => new Promise(resolve => {
  fs.writeFileSync(`${H}/mode`, mode)
  let out = '', err = ''
  const t0 = Date.now()
  const handle = r.run({ provider, question: 'q', terminalOutput: '', referenceFolder: null, sessionID: null, ...request }, {
    session () {}, output: t => { out += t }, error: t => { err += t }, done: code => resolve({ code, out, err, ms: Date.now() - t0 }),
  })
  if (mode === 'slow') setTimeout(() => handle.cancel(), 300)
})
;(async () => {
  let res = await run('claude', 'utf8')
  ok('multi-byte character split across chunks is intact', res.out.includes('中文 answer') && !res.out.includes('�'), JSON.stringify(res.out))
  ok('assistant messages around a tool call are separated', res.out.endsWith('中文 answer\n\nsecond part'), JSON.stringify(res.out.slice(-30)))
  ok('run counter balanced', runs === 0)
  res = await run('claude', 'early', { referenceFolder: process.env.WORK, terminalOutput: 'x'.repeat(4 * 1024 * 1024) })
  await new Promise(r => setTimeout(r, 200))
  ok('CLI exiting before reading stdin: no uncaught EPIPE', uncaught === null && res.code === 3, uncaught && uncaught.message)
  res = await run('claude', 'slow')
  ok('cancel ends the run quickly', res.ms < 3000, `${res.ms}ms`)
  res = await run('codex', 'x')
  const lines = res.err.trim().split('\n')
  ok('failed Codex run shows only the last 40 stderr lines', res.code === 1 && lines[0] === '...' && lines.length === 41 && lines[40] === 'stderr line 100', `${lines.length} lines, first=${lines[0]}`)
  ok('no uncaught errors at all', uncaught === null)
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
})()
