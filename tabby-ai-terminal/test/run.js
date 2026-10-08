// Builds the sources, runs every *.test.js in its own process, and fails on a FAIL line, an error or a
// non-zero exit. A test prints "SKIP <reason>" when it cannot run on this platform.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { build } = require('./build')

build()
const only = process.argv.slice(2)
const files = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.test.js'))
    .filter(file => !only.length || only.some(name => file.includes(name)))
    .sort()

let failedFiles = 0
let passed = 0
for (const file of files) {
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], { cwd: __dirname, encoding: 'utf8', timeout: 180000 })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    const lines = output.split('\n')
    const pass = lines.filter(line => line.startsWith('PASS')).length
    const fail = lines.filter(line => line.startsWith('FAIL'))
    const skip = lines.find(line => line.startsWith('SKIP'))
    // PASS lines may quote error messages on purpose; anything else mentioning an Error is a crash
    const crashed = result.status !== 0 || lines.some(line => !line.startsWith('PASS') && /\bError\b/.test(line))
    passed += pass
    if (skip) {
        console.log(`skip  ${file}  ${skip.slice(5)}`)
    } else if (fail.length || crashed) {
        failedFiles++
        console.log(`FAIL  ${file}  ${pass} passed, ${fail.length} failed${crashed ? `, exit ${result.status}` : ''}`)
        console.log(output.split('\n').filter(line => !line.startsWith('PASS')).map(line => `      ${line}`).join('\n'))
    } else {
        console.log(`ok    ${file}  ${pass} passed`)
    }
}
console.log(`\n${passed} checks passed${failedFiles ? `, ${failedFiles} file(s) failed` : ''}`)
process.exit(failedFiles ? 1 : 0)
