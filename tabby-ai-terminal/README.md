# Tabby AI Terminal

`tabby-ai-terminal` is a built-in Tabby plugin that adds an AI-assisted panel to terminal tabs. It captures recent terminal output, removes terminal control sequences, and sends the cleaned context and the user's question to either the Codex CLI or Claude Code CLI. The panel also supports continued provider sessions, configurable models and prompts, a local reference folder, and a command draft area.

## Requirements

- The Tabby monorepo dependencies must be installed in the repository root. The build scripts use `../node_modules`.
- Node.js and Yarn must be available.
- At least one supported provider CLI must be installed and authenticated at runtime: Codex or Claude Code.
- `tar` must be available if you want `pack:plugin` to create a ZIP archive. The unpacked export folder is still produced when ZIP creation is unavailable.

## Build

Run commands from the plugin directory:

```powershell
cd tabby-ai-terminal
```

Build the JavaScript bundle:

```powershell
yarn run build

yarn.cmd run build
```

The bundle is written to `dist/index.js`.

Build TypeScript declaration files:

```powershell
yarn run build:typings
```

The declarations are written to `typings/`.

Build both outputs and package the plugin for distribution:

```powershell
yarn run pack:plugin

yarn.cmd run pack:plugin
```

This command creates:

- `export/tabby-ai-terminal/` - the unpacked plugin folder.
- `export/tabby-ai-terminal.zip` - the distributable archive, when `tar` can create it.

The packaging script recreates `export/` on every run.

For development, rebuild the JavaScript bundle whenever a source file changes:

```powershell
yarn run watch
```

## AI providers

Use the provider selector in the panel header to switch between Codex and Claude Code. Each provider keeps its own model selection, while switching providers starts a fresh chat session so session IDs are never shared across CLIs.

If a selected CLI is missing, the panel opens an external terminal and runs that provider's official native installer. Claude Code uses Anthropic's [Windows PowerShell installer](https://claude.ai/install.ps1) on Windows and [shell installer](https://claude.ai/install.sh) on macOS and Linux. The plugin also checks the native install location (`~/.local/bin`) because the installer may not add it to Windows PATH. After installation, return to Tabby and refresh, then use the same panel button to sign in. Login, status checks, and logout are handled by `claude auth login`, `claude auth status`, and `claude auth logout`.

Claude Code runs in non-interactive, read-only Plan mode with only its Read, Glob, and Grep tools enabled. Its sessions can be resumed in the same way as Codex sessions from the panel.

## Project Structure

### Root files and directories

| Path | Purpose |
| --- | --- |
| `package.json` | Plugin metadata, peer dependencies, and build/package scripts. |
| `webpack.config.mjs` | Connects the plugin to Tabby's shared Webpack plugin configuration. |
| `tsconfig.json` | TypeScript configuration used by the plugin source. |
| `tsconfig.typings.json` | TypeScript configuration for emitting declarations into `typings/`. |
| `scripts/pack-plugin.mjs` | Copies the built bundle, declarations, and package metadata into `export/`, then creates a ZIP archive. |
| `dist/` | Generated Webpack output. |
| `typings/` | Generated TypeScript declarations. |
| `export/` | Generated distributable plugin folder and ZIP archive. |

### Source files

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Angular module and plugin entry point. Registers the toolbar button, configuration, hotkey, terminal decorator, and settings page. |
| `src/config.ts` | Default system prompt, AI Terminal settings, and the default `Alt+I` hotkey. |
| `src/providers.ts` | AI provider definitions, provider status types, and supported model choices. |
| `src/decorator.ts` | Attaches the AI panel to terminal tabs and forwards terminal input/output events. |
| `src/panel.ts` | Main panel UI and state: output capture, chat history, analysis requests, reference folders, and the command sender. |
| `src/panelStyles.ts` | CSS used by the AI panel and command sender. |
| `src/terminalOutputSanitizer.ts` | Streaming parser that removes ANSI, color, and other terminal control sequences before output is displayed or sent to AI. |
| `src/buttonProvider.ts` | Adds the AI Terminal toolbar button and handles the toggle hotkey. |
| `src/hotkeys.ts` | Declares the configurable AI Terminal hotkey. |
| `src/settings.ts` | Registers the AI Terminal settings tab. |
| `src/components/aiTerminalSettingsTab.component.ts` | Settings component logic and input validation. |
| `src/components/aiTerminalSettingsTab.component.pug` | Settings page template. |
| `src/icons/ai.svg` | Toolbar icon. |

### Services

| Path | Purpose |
| --- | --- |
| `src/services/aiTerminal.service.ts` | Coordinates one AI panel per terminal tab and manages panel attachment, visibility, and captured I/O. |
| `src/services/aiProviderAuth.service.ts` | Finds the provider CLI, checks authentication, starts login/logout flows, and discovers available models. |
| `src/services/aiProviderRunner.service.ts` | Builds prompts, starts or resumes Codex and Claude Code CLI sessions, streams responses, and resolves optional reference folders. |

## Build Outputs

Generated files should be changed by rebuilding rather than edited directly:

- `dist/index.js`
- `typings/`
- `export/`
