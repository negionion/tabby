// Shared test helpers: stubs for Tabby/Angular imports, loading the transpiled sources, and PASS/FAIL output
// that run.js counts.
const Module = require('module')
const path = require('path')

const STUBS = {
    'tabby-core': path.join(__dirname, 'stubs', 'tabby-core.js'),
    'tabby-terminal': path.join(__dirname, 'stubs', 'tabby-terminal.js'),
    '@angular/core': path.join(__dirname, 'stubs', 'angular-core.js'),
}
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
    return STUBS[request] ?? resolveFilename.call(this, request, ...rest)
}

/** Loads a transpiled source file, e.g. load('panel') or load('services/aiProviderAuth.service') */
function load (name) {
    return require(path.join(__dirname, '.build', name))
}

/** The panel module together with its stylesheet, as the tests use both */
function loadPanel () {
    return { ...load('panel'), ...load('panelStyles') }
}

/** Sets the jsdom window and the DOM classes the panel code uses as globals */
function installDom (dom) {
    Object.assign(global, {
        window: dom.window,
        document: dom.window.document,
        requestAnimationFrame: dom.window.requestAnimationFrame,
        cancelAnimationFrame: dom.window.cancelAnimationFrame,
        getComputedStyle: dom.window.getComputedStyle,
        Element: dom.window.Element,
        Node: dom.window.Node,
        HTMLElement: dom.window.HTMLElement,
    })
}

/**
 * Runs the test against stub CLIs: a temporary HOME whose ~/.local/bin holds the given fixtures/bin scripts,
 * first on PATH, so the real claude / codex are never started. The stubs are shell scripts, so the test is
 * skipped on Windows.
 */
function useStubHome (commands) {
    if (process.platform === 'win32') {
        console.log('SKIP stub CLIs are shell scripts')
        process.exit(0)
    }
    const fs = require('fs')
    const os = require('os')
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-terminal-test-'))
    const bin = path.join(home, '.local', 'bin')
    fs.mkdirSync(bin, { recursive: true })
    for (const [command, fixture] of Object.entries(commands)) {
        fs.copyFileSync(path.join(__dirname, 'fixtures', 'bin', fixture), path.join(bin, command))
        fs.chmodSync(path.join(bin, command), 0o755)
    }
    process.env.HOME = home
    process.env.PATH = `${bin}:/usr/bin:/bin`
    process.on('exit', () => fs.rmSync(home, { recursive: true, force: true }))
    return home
}

module.exports = { load, loadPanel, installDom, useStubHome }
