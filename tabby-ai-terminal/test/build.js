// Transpiles the plugin sources to CommonJS for the tests. Tabby and Angular modules are replaced by the
// stubs in ./stubs (see harness.js), so only the files the tests load are built.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

/** Angular entry points, components and Tabby providers, which the tests do not load */
const SKIPPED = ['index.ts', 'settings.ts', 'buttonProvider.ts', 'hotkeys.ts', 'decorator.ts', 'components', 'services/aiTerminal.service.ts']

const src = path.resolve(__dirname, '..', 'src')
const out = path.join(__dirname, '.build')

function listSources (dir = '') {
    return fs.readdirSync(path.join(src, dir), { withFileTypes: true }).flatMap(entry => {
        const file = path.posix.join(dir, entry.name)
        if (SKIPPED.includes(file)) {
            return []
        }
        if (entry.isDirectory()) {
            return listSources(file)
        }
        return file.endsWith('.ts') ? [file] : []
    })
}

function build () {
    fs.rmSync(out, { recursive: true, force: true })
    for (const file of listSources()) {
        const { outputText } = ts.transpileModule(fs.readFileSync(path.join(src, file), 'utf8'), {
            fileName: file,
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                esModuleInterop: true,
            },
        })
        const target = path.join(out, file.replace(/\.ts$/, '.js'))
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, outputText)
    }
}

module.exports = { build }

if (require.main === module) {
    build()
}
