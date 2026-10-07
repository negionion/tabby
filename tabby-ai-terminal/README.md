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

Claude Code sessions can be resumed in the same way as Codex sessions from the panel.

### Claude Code modes

The Mode selector controls the tools and permission mode passed to Claude Code:

| Mode | `--permission-mode` | Tools |
| --- | --- | --- |
| Plan (read-only) | `plan` | Read, Glob, Grep |
| Manual | `manual` | Read, Glob, Grep, Edit, Write, Bash |
| Edit automatically | `acceptEdits` | Read, Glob, Grep, Edit, Write |
| Auto | `auto` | Read, Glob, Grep, Edit, Write, Bash |

Without a reference folder every mode runs as Plan. Non-Plan modes run Claude Code with `--input-format stream-json --permission-prompt-tool stdio`; each permission request is shown in the chat as an Allow/Deny card. The Effort selector passes `--effort` (`auto` omits it).

### Claude Code models

The Claude Code CLI has no model-list command, so the model list is built by probing each candidate with a one-turn `claude -p --model <name>` call. Candidates that fail are marked unavailable, and the full model IDs that aliases resolve to are added to the list. Results are cached for `claudeModelCacheHours`; the `Re-check model availability` entry probes again.

### CLI updates

When the panel checks the selected provider, the plugin runs `claude update` or `codex update` if the last check is older than `cliUpdateIntervalHours`. Updates start only while no Claude Code or Codex process from the plugin is running, and an Analyze request made during an update waits until it finishes. The header shows `CLI updated to <version>` for a day after an update. The settings page shows each CLI's version and last result, and has an Update now button. Turn off `Update provider CLIs automatically` to update only from the settings page.

## Panel

- **Header**: provider, model, mode, effort, and reference folder rows. The chevron bar collapses the header into a one-line summary.
- **Chat**: answers are rendered as Markdown, with Open (full-size viewer), Copy, and Retry actions. Commands under a "Suggested commands" heading are listed as rows with Send, → Sender, and Copy buttons.
- **Output to send**: the captured terminal output that the next Analyze request includes. It is expanded while the chat is empty and collapsed once an answer is shown.
- **Sender**: commands to send to the current terminal. Send next sends the first line. Send all sends one line at a time, waits for the terminal prompt (`senderPromptPattern`) before the next line, and stops when the prompt does not return within `senderLineTimeoutMs` or when Stop is pressed. Commands matching `dangerousCommandPatterns` ask for confirmation. An empty sender collapses to one line (`senderAutoCollapse`).
- **Saved tags**: + Save stores the sender content as a tag, up to 100 tags. Right-click a tag to edit or delete it. `{{name}}` placeholders are filled in through a dialog when the tag is inserted, and the last values are remembered.
- **Tag groups**: a tag can belong to a group, set in the tag dialog. When any tag has a group, group chips (All, each group, Ungrouped) appear before the tags and filter them. Right-click a group to insert all of its commands into the sender, rename it, or delete it (its tags become ungrouped). Drag a tag onto another tag to reorder it, which also moves it into that tag's group; drag it onto a group chip to move it into that group, or drag a group chip to reorder groups.
- **Resize**: drag the panel's left edge or the sender's top edge. Double-click a handle to restore the default size.

## Settings

Settings under `aiTerminal` in `config.yaml` that are not on the settings page:

| Key | Default | Purpose |
| --- | --- | --- |
| `claudeMode` | `plan` | Claude Code mode: `plan`, `manual`, `acceptEdits`, or `auto`. |
| `claudeEffort` | `auto` | Claude Code effort: `auto`, `low`, `medium`, `high`, `xhigh`, or `max`. |
| `claudeModelCandidates` | `[]` | Models to probe. Empty uses the built-in candidate list. |
| `claudeModelCacheHours` | `24` | How long model probe results are cached. |
| `claudeModelCache` | `null` | Cached model probe results. |
| `cliUpdateStatus` | `{}` | Last CLI update result for each provider. |
| `panelWidth` | `360` | Panel width in pixels. |
| `senderHeight` | `178` | Sender height in pixels. |
| `headerCollapsed` | `false` | Whether the panel header is collapsed. |
| `senderAutoCollapse` | `true` | Collapse an empty sender to one line. |
| `senderPromptPattern` | `''` | Regular expression for the terminal prompt that Send all waits for. Empty uses `[#$>]\s*$`. |
| `senderLineTimeoutMs` | `20000` | How long Send all waits for the prompt before it stops. |
| `dangerousCommandPatterns` | `null` | Regular expressions for commands that need confirmation. `null` uses the built-in list. |
| `senderVariables` | `{}` | Last values entered for `{{name}}` tag placeholders. |
| `senderGroupFilter` | `''` | Group shown in the sender. Empty shows all tags. |

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
