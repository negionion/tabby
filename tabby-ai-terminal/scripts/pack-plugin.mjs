#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginName = 'tabby-ai-terminal'
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const exportRoot = path.join(root, 'export')
const packageRoot = path.join(exportRoot, pluginName)
const archivePath = path.join(exportRoot, `${pluginName}.zip`)

function copyDirectory (source, target) {
    fs.mkdirSync(target, { recursive: true })
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name)
        const targetPath = path.join(target, entry.name)
        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath)
        } else {
            fs.copyFileSync(sourcePath, targetPath)
        }
    }
}

fs.rmSync(exportRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true })

fs.copyFileSync(path.join(root, 'package.json'), path.join(packageRoot, 'package.json'))
fs.copyFileSync(path.join(root, 'dist', 'index.js'), path.join(packageRoot, 'dist', 'index.js'))
copyDirectory(path.join(root, 'typings'), path.join(packageRoot, 'typings'))

const archive = spawnSync('tar', ['-a', '-cf', archivePath, '-C', exportRoot, pluginName], {
    stdio: 'inherit',
})

console.log(`Packaged plugin folder: ${packageRoot}`)
if (archive.status === 0) {
    console.log(`Created archive: ${archivePath}`)
} else {
    console.log('Could not create zip archive with tar. Use the packaged folder above.')
}
