// Simulates how Windows delivers the cmd.exe invocation to the CLI: libuv command-line building,
// cmd.exe /s /c quote stripping, and the CRT (CommandLineToArgvW) argv parser.
Object.defineProperty(process, 'platform', { value: 'win32' })
process.env.USERPROFILE = 'C:\\Users\\FfoNy'
const { AIProviderAuthService } = require('./harness').load('services/aiProviderAuth.service')
const a = new AIProviderAuthService({ store: { aiTerminal: {} }, save: async () => {} }, {})
let failed = 0
const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`) }

// libuv src/win/process.c quote_cmd_arg
function quoteCmdArg (s) {
  if (s.length === 0) return '""'
  if (!/[ \t"]/.test(s)) return s
  if (!/["\\]/.test(s)) return `"${s}"`
  let out = ''; let quoteHit = true
  for (let i = s.length; i > 0; --i) {
    out += s[i - 1]
    if (quoteHit && s[i - 1] === '\\') out += '\\'
    else if (s[i - 1] === '"') { quoteHit = true; out += '\\' } else quoteHit = false
  }
  return `"${[...out].reverse().join('')}"`
}
const buildLine = (inv) => ['cmd.exe', ...inv.args].map(x => inv.windowsVerbatimArguments ? x : quoteCmdArg(x)).join(' ')
// cmd.exe /s /c: strip the first and the last quote of everything after /c, then run it
function cmdRun (line) {
  let rest = line.slice(line.indexOf('/c ') + 3)
  const first = rest.indexOf('"'); const last = rest.lastIndexOf('"')
  if (first !== -1 && last > first) rest = rest.slice(0, first) + rest.slice(first + 1, last) + rest.slice(last + 1)
  // split on && outside quotes (cmd keeps the text of each command as is)
  const parts = []; let cur = ''; let q = false
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === '"') q = !q
    if (!q && rest.startsWith('&&', i)) { parts.push(cur.trim()); cur = ''; i++; continue }
    cur += c
  }
  parts.push(cur.trim())
  return parts
}
// CommandLineToArgvW / CRT rules
function argv (cmd) {
  const args = []; let cur = ''; let inQ = false; let has = false; let i = 0
  while (i < cmd.length) {
    const c = cmd[i]
    if (c === '\\') {
      let n = 0; while (cmd[i] === '\\') { n++; i++ }
      if (cmd[i] === '"') { cur += '\\'.repeat(n >> 1); if (n % 2) { cur += '"'; i++ } ; has = true; continue }
      cur += '\\'.repeat(n); has = true; continue
    }
    if (c === '"') { if (inQ && cmd[i + 1] === '"') { cur += '"'; i += 2; continue } inQ = !inQ; has = true; i++; continue }
    if (!inQ && (c === ' ' || c === '\t')) { if (has) { args.push(cur); cur = ''; has = false } i++; continue }
    cur += c; has = true; i++
  }
  if (has) args.push(cur)
  return args
}
const want = ['--print', '--tools', 'Read,Glob,Grep', '--system-prompt', 'Model availability probe. Reply with exactly OK.', '--tools', '', '--session-id', '1f2e3d4c-0000-4000-8000-123456789abc', '-c', 'sandbox_mode="read-only"']
const received = (inv) => argv(cmdRun(buildLine(inv)).pop()).slice(1)

const inv = a.buildProviderCommandInvocation('claude', want, 'C:\\work\\fw')
const got = received(inv)
ok('new: CLI receives exactly the arguments', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got))
ok('new: verbatim, cwd kept for a local folder', inv.windowsVerbatimArguments === true && inv.cwd === 'C:\\work\\fw')
ok('new: code page switch still runs first', cmdRun(buildLine(inv))[0] === 'chcp 65001 >nul')

// the previous invocation: same command string, not verbatim, no outer quotes
const old = { args: ['/d', '/s', '/c', inv.args[3].slice(1, -1)], windowsVerbatimArguments: false }
const gotOld = received(old)
ok('old invocation mangled the arguments (reproduces the bug)', JSON.stringify(gotOld) !== JSON.stringify(want), JSON.stringify(gotOld.slice(0, 6)))

const unc = a.buildProviderCommandInvocation('claude', ['--print'], '\\\\wsl.localhost\\Ubuntu\\home\\asus_user\\code')
const uncParts = cmdRun(buildLine(unc))
ok('UNC folder: no cwd, entered with pushd', unc.cwd === undefined && uncParts[1] === 'pushd "\\\\wsl.localhost\\Ubuntu\\home\\asus_user\\code"', JSON.stringify(uncParts))
ok('UNC folder: CLI still gets its args', JSON.stringify(argv(uncParts[2]).slice(1)) === '["--print"]')
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0)
