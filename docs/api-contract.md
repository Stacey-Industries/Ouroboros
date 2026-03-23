# API Contract (IPC)

All renderer↔main communication uses Electron IPC via the preload bridge.
The renderer accesses `window.electronAPI` — never raw `ipcRenderer`.

Type definitions: `src/renderer/types/electron.d.ts`
Implementation: `src/preload/preload.ts` (renderer side), `src/main/ipc.ts` (main side)
Handler modules: `src/main/ipc-handlers/` (one file per domain)

Channel naming: `domain:action` (e.g. `pty:spawn`, `files:readFile`, `config:set`)
All handlers return `{ success: boolean; error?: string }` pattern.
All `on*` event subscriptions return a `() => void` cleanup function.

---

## PTY API (`window.electronAPI.pty`)

### `pty:spawn`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string, options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string })`
- **Returns:** `{ success: boolean; error?: string; already?: boolean }`
- **Notes:** Create a generic terminal session. `already: true` if a session with the same `id` already exists.

### `pty:spawnClaude`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string, options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string; initialPrompt?: string; cliOverrides?: Record<string, unknown>; resumeMode?: string; providerModel?: string; env?: Record<string, string> })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Spawn a Claude Code CLI session. `providerModel` can be `provider:model` (resolves to env vars) or a plain Anthropic alias like `'opus'` (passed as `--model`).

### `pty:spawnCodex`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string, options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string; initialPrompt?: string; cliOverrides?: Record<string, unknown>; resumeThreadId?: string })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Spawn a Codex CLI session. `resumeThreadId` is the Codex thread UUID for `codex resume`.

### `pty:write`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string, data: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Send raw input to a running terminal session.

### `pty:resize`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string, cols: number, rows: number)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Resize terminal dimensions. Should be called after every layout change.

### `pty:kill`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Kill the terminal process. Session is removed from the map.

### `pty:getCwd`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; cwd?: string; error?: string }`
- **Notes:** Returns the current working directory of the PTY process.

### `pty:listSessions`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ id: string; cwd: string }[]`
- **Notes:** Returns all active PTY session IDs and their working directories.

### `pty:startRecording`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Start recording terminal output for a session. Used for session replay.

### `pty:stopRecording`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Stop recording and return the recorded buffer.

### `pty:data:${id}` (event)

- **Direction:** main → renderer
- **Callback:** `(data: string) => void`
- **Notes:** Terminal output for session `id`. Subscribe via `window.electronAPI.pty.onData(id, cb)`.

### `pty:exit:${id}` (event)

- **Direction:** main → renderer
- **Callback:** `(result: { exitCode: number | null; signal: number | null }) => void`
- **Notes:** Terminal exit for session `id`. Subscribe via `window.electronAPI.pty.onExit(id, cb)`.

---

## Config API

### `config:getAll`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `AppConfig` — the entire config object
- **Notes:** Defined in `src/main/config.ts`. Schema validated by electron-store.

### `config:get`

- **Direction:** renderer → main (invoke)
- **Payload:** `(key: keyof AppConfig)`
- **Returns:** `AppConfig[K]`
- **Notes:** Returns a single config value.

### `config:set`

- **Direction:** renderer → main (invoke)
- **Payload:** `(key: keyof AppConfig, value: AppConfig[keyof AppConfig])`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Writes a config value. When `key === 'contextLayer'`, also notifies the context layer controller.

### `config:export`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }`
- **Notes:** Opens native Save dialog and writes the full config as JSON.

### `config:import`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; cancelled?: boolean; config?: AppConfig; error?: string }`
- **Notes:** Opens native Open dialog, reads JSON, and applies importable keys to the live config.

### `config:openSettingsFile`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; filePath?: string; error?: string }`
- **Notes:** Writes the current config to `userData/settings.json`, starts a file watcher for external edits, then opens the file in the default editor.

### `config:externalChange` (event)

- **Direction:** main → renderer
- **Callback:** `(config: AppConfig) => void`
- **Notes:** Emitted when `settings.json` is changed externally (by another editor). Also broadcast to web clients.

**Config Keys (importable):**

| Key                                                            | Type                 | Notes                                    |
| -------------------------------------------------------------- | -------------------- | ---------------------------------------- |
| `recentProjects`                                               | `string[]`           | Recently opened project paths            |
| `defaultProjectRoot`                                           | `string`             | Default project root for new sessions    |
| `multiRoots`                                                   | `string[]`           | Multi-root workspace paths               |
| `activeTheme`                                                  | `AppTheme`           | Theme ID (`'modern'`, `'retro'`, etc.)   |
| `hooksServerPort`                                              | `number`             | Named pipe / hooks server port           |
| `terminalFontSize`                                             | `number`             | Terminal font size                       |
| `terminalCursorStyle`                                          | `string`             | Terminal cursor style                    |
| `autoInstallHooks`                                             | `boolean`            | Auto-install Claude Code hooks           |
| `shell`                                                        | `string`             | Shell override for PTY                   |
| `panelSizes`                                                   | `PanelSizes`         | Sidebar/terminal panel sizes             |
| `windowBounds`                                                 | `object`             | Window position/size                     |
| `fontUI` / `fontMono` / `fontSizeUI`                           | `string/number`      | UI/mono font overrides                   |
| `keybindings`                                                  | `object`             | Custom keybinding map                    |
| `showBgGradient`                                               | `boolean`            | Background gradient toggle               |
| `customThemeColors`                                            | `object`             | Custom CSS variable overrides            |
| `terminalSessions`                                             | `object`             | Persisted terminal sessions              |
| `claudeCliSettings` / `codexCliSettings`                       | `object`             | CLI defaults                             |
| `customCSS`                                                    | `string`             | Injected CSS                             |
| `bookmarks`                                                    | `object[]`           | File bookmarks                           |
| `fileTreeIgnorePatterns`                                       | `string[]`           | Additional ignore patterns for file tree |
| `profiles`                                                     | `object[]`           | Named setting profiles                   |
| `customPrompt` / `promptPreset`                                | `string`             | Prompt overrides                         |
| `agentChatSettings`                                            | `object`             | Chat provider/model/mode settings        |
| `notifications`                                                | `object`             | Notification preferences                 |
| `agentTemplates`                                               | `object[]`           | Saved prompt templates                   |
| `workspaceLayouts` / `activeLayoutName` / `workspaceSnapshots` | `object`             | Layout persistence                       |
| `extensionsEnabled` / `disabledExtensions`                     | `boolean/string[]`   | Extension enable state                   |
| `installedVsxExtensions` / `disabledVsxExtensions`             | `object[]/string[]`  | VSX extension state                      |
| `lspEnabled` / `lspServers`                                    | `boolean/object[]`   | LSP configuration                        |
| `claudeAutoLaunch`                                             | `boolean`            | Auto-launch Claude on session start      |
| `approvalRequired` / `approvalTimeout`                         | `boolean/number`     | Approval flow config                     |
| `commandBlocksEnabled` / `promptPattern`                       | `boolean/string`     | Command block settings                   |
| `formatOnSave`                                                 | `boolean`            | Auto-format on save                      |
| `contextLayer`                                                 | `ContextLayerConfig` | Context layer configuration              |
| `modelSlots`                                                   | `object`             | Provider/model slot assignments          |

---

## Files API

All file handlers enforce path security via `assertPathAllowed()` — paths must be within the window's project root(s).

### `files:readFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(filePath: string)`
- **Returns:** `{ success: boolean; content?: string; error?: string }`
- **Notes:** Reads file as UTF-8. Has a size limit; large files return a truncated result.

### `files:readBinaryFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(filePath: string)`
- **Returns:** `{ success: boolean; content?: string; error?: string }`
- **Notes:** Reads file as binary (base64 encoded).

### `files:readDir`

- **Direction:** renderer → main (invoke)
- **Payload:** `(dirPath: string)`
- **Returns:**

```typescript
{
  success: boolean
  items?: Array<{
    name: string
    path: string        // Absolute path
    isDirectory: boolean
    isFile: boolean
    isSymlink: boolean
  }>
  error?: string
}
```

### `files:watchDir`

- **Direction:** renderer → main (invoke)
- **Payload:** `(dirPath: string)`
- **Returns:** `{ success: boolean; already?: true; error?: string }`
- **Notes:** Starts a chokidar watcher. Events are emitted via `files:change`. Ignores `.git`, `node_modules`, `dist`, `out`, `build`, `coverage`.

### `files:unwatchDir`

- **Direction:** renderer → main (invoke)
- **Payload:** `(dirPath: string)`
- **Returns:** `{ success: boolean }`
- **Notes:** Stops watching. No-op if directory not currently watched.

### `files:createFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(filePath: string, content?: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Creates a new file exclusively — fails if the file already exists.

### `files:mkdir`

- **Direction:** renderer → main (invoke)
- **Payload:** `(dirPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Creates a directory. Fails if the directory already exists.

### `files:rename`

- **Direction:** renderer → main (invoke)
- **Payload:** `(oldPath: string, newPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Renames/moves a file or directory. Fails if `newPath` already exists.

### `files:writeFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(filePath: string, data: Uint8Array)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Writes raw binary data to a file.

### `files:saveFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(filePath: string, content: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Writes UTF-8 text to a file (overwrites).

### `files:copyFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(sourcePath: string, destPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Copies a file. Does not check for existing destination.

### `files:delete`

- **Direction:** renderer → main (invoke)
- **Payload:** `(targetPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Sends to OS trash via `shell.trashItem`. Non-destructive.

### `files:softDelete`

- **Direction:** renderer → main (invoke)
- **Payload:** `(targetPath: string)`
- **Returns:** `{ success: boolean; tempPath?: string; error?: string }`
- **Notes:** Moves to agent-ide temp directory instead of trash. Reversible via `files:restoreDeleted`.

### `files:restoreDeleted`

- **Direction:** renderer → main (invoke)
- **Payload:** `(tempPath: string, originalPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Restores a soft-deleted file. `tempPath` must be within the agent-ide temp directory.

### `files:selectFolder`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; cancelled: boolean; path: string | null }`
- **Notes:** Opens the native folder picker dialog.

### `files:showImageDialog`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; cancelled?: boolean; attachments?: ImageAttachment[]; error?: string }`
- **Notes:** Opens native file picker for images (PNG, JPG, GIF, WEBP). Returns up to 5 images as base64 `ImageAttachment` objects. `ImageAttachment` type defined in `src/shared/types/agentChat.ts`.

### `files:change` (event)

- **Direction:** main → renderer
- **Callback:** `(change: { type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'; path: string }) => void`
- **Notes:** Fired by active chokidar watchers. Also broadcast to web clients.

---

## Hooks API

### `hooks:event` (event)

- **Direction:** main → renderer
- **Callback:** `(event: AgentEvent) => void`
- **Notes:** All hook events from Claude Code sessions (tool calls, completion, etc.). The hooks server (`src/main/hooks.ts`) receives events via named pipe and broadcasts them here. `window.electronAPI.hooks.onAgentEvent(cb)` subscribes to all events; `onToolCall(cb)` is a filtered variant (`type === 'tool_call'`).

---

## App API

### `app:getVersion`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `string` — app version from `package.json`

### `app:getPlatform`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `NodeJS.Platform` — `'win32'`, `'darwin'`, or `'linux'`

### `app:openExternal`

- **Direction:** renderer → main (invoke)
- **Payload:** `(url: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Opens URL in default browser. Only `http:` and `https:` protocols are allowed.

### `app:notify`

- **Direction:** renderer → main (invoke)
- **Payload:** `(options: { title: string; body: string; icon?: string; force?: boolean })`
- **Returns:** `{ success: boolean; skipped?: boolean; error?: string }`
- **Notes:** Shows an OS notification. Skipped (returns `skipped: true`) if a window is focused, unless `force: true`. No-op on platforms without notification support.

### `app:rebuildAndRestart`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Runs `npm run build && npm run build:web` then relaunches the app. Broadcasts `app:rebuilding` events to web clients during the process.

### `app:rebuildWeb`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Runs `npm run build:web` and restarts the web dev server. For web deployment mode only.

### `app:getCrashLogs`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; logs?: Array<{ name: string; content: string; mtime: number }>; error?: string }`
- **Notes:** Returns crash logs from `userData/crashes/`, sorted newest first.

### `app:clearCrashLogs`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Deletes all crash log files.

### `app:openCrashLogDir`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Opens the `userData/crashes/` directory in the native file explorer.

### `app:logError`

- **Direction:** renderer → main (invoke)
- **Payload:** `(source: string, message: string, stack?: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Writes a crash log entry to `userData/crashes/crash-{timestamp}.log`. Used by renderer error boundaries.

### `app:open-logs-folder`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean }`
- **Notes:** Opens Electron's logs folder in the native file explorer.

### `app:rebuilding` (event)

- **Direction:** main → web clients only
- **Callback:** `(payload: { status: 'building' | 'restarting' | 'error' | 'done'; message?: string }) => void`
- **Notes:** Broadcast to web clients during `app:rebuildAndRestart` / `app:rebuildWeb`.

### `menu:*` events (event)

- **Direction:** main → renderer
- **Notes:** Sent from `menu.ts` via `win.webContents.send()`. Events: `'menu:open-folder'`, `'menu:new-terminal'`, `'menu:command-palette'`, `'menu:settings'`.

---

## Shell API

### `shell:showItemInFolder`

- **Direction:** renderer → main (invoke)
- **Payload:** `(fullPath: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Reveals a file in the native file explorer (Finder/Explorer). Path-security checked.

### `shell:openExtensionsFolder`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Opens `userData/extensions/` in the native file explorer. Creates the directory if missing.

---

## Theme API

### `theme:get`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `AppTheme` string (e.g. `'modern'`, `'retro'`, `'warp'`, `'cursor'`, `'kiro'`)

### `theme:set`

- **Direction:** renderer → main (invoke)
- **Payload:** `(theme: AppTheme)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Sets the active theme in config and broadcasts `theme:changed` to all windows and web clients.

### `theme:changed` (event)

- **Direction:** main → renderer
- **Callback:** `(theme: AppTheme) => void`
- **Notes:** Broadcast to all windows when theme changes.

---

## Titlebar API

### `titlebar:setOverlayColors`

- **Direction:** renderer → main (invoke)
- **Payload:** `(color: string, symbolColor: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Sets the Windows 11 titlebar overlay colors. No-op on non-Windows platforms.

---

## Agent Chat API (`agentChat:*`)

Types: `src/shared/types/agentChat.ts`, `src/shared/ipc/agentChatChannels.ts`

### Thread Management

#### `agentChat:createThread`

- **Direction:** renderer → main (invoke)
- **Payload:** `(request: AgentChatCreateThreadRequest)` — must include `workspaceRoot: string`
- **Returns:** `{ success: boolean; thread?: AgentChatThreadRecord; error?: string }`

#### `agentChat:deleteThread`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `agentChat:loadThread`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string)`
- **Returns:** `{ success: boolean; thread?: AgentChatThreadRecord; error?: string }`

#### `agentChat:listThreads`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot?: string)`
- **Returns:** `{ success: boolean; threads?: AgentChatThreadRecord[]; error?: string }`
- **Notes:** Returns up to 100 threads for the workspace, sorted by `updatedAt` descending.

#### `agentChat:branchThread`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string, fromMessageId: string)`
- **Returns:** `{ success: boolean; thread?: AgentChatThreadRecord; error?: string }`
- **Notes:** Creates a new thread branched from `fromMessageId` (copies messages up to that point).

#### `agentChat:resumeLatestThread`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot: string)`
- **Returns:** `{ success: boolean; thread?: AgentChatThreadRecord; error?: string }`
- **Notes:** Loads the most recently updated thread for the workspace.

#### `agentChat:revertToSnapshot`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string, messageId: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Reverts the git workspace to the pre-snapshot hash stored in the message's orchestration link. **Destructive — uses `git checkout`, not undoable.**

### Message Operations

#### `agentChat:sendMessage`

- **Direction:** renderer → main (invoke)
- **Payload:** `(request: AgentChatSendMessageRequest)` — must include `content: string`
- **Returns:** `{ success: boolean; messageId?: string; error?: string }`
- **Notes:** Sends a message and triggers the orchestration pipeline. Streaming chunks are pushed via `agentChat:stream`.

#### `agentChat:getLinkedDetails`

- **Direction:** renderer → main (invoke)
- **Payload:** `(link: AgentChatOrchestrationLink)`
- **Returns:** `{ success: boolean; session?: TaskSessionRecord; error?: string }`
- **Notes:** Loads the orchestration session for a given link.

#### `agentChat:getBufferedChunks`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string)`
- **Returns:** `{ success: boolean; chunks?: StreamChunk[]; error?: string }`
- **Notes:** Returns buffered stream chunks for reconnection after renderer refresh. Chunks accumulate in memory during active streaming.

#### `agentChat:cancelTask`

- **Direction:** renderer → main (invoke)
- **Payload:** `(taskId: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Cancels a running task via the singleton orchestration instance.

#### `agentChat:getLinkedTerminal`

- **Direction:** renderer → main (invoke)
- **Payload:** `(threadId: string)`
- **Returns:** `{ success: boolean; provider?: string; claudeSessionId?: string; codexThreadId?: string; linkedTerminalId?: string; error?: string }`
- **Notes:** Returns terminal/session identifiers linked to the thread's latest orchestration run.

### Session Memory

#### `agentChat:listMemories`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot: string)`
- **Returns:** `{ success: boolean; memories?: SessionMemoryEntry[]; error?: string }`

#### `agentChat:createMemory`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot: string, entry: { type: SessionMemoryEntry['type']; content: string; relevantFiles?: string[] })`
- **Returns:** `{ success: boolean; memory?: SessionMemoryEntry; error?: string }`

#### `agentChat:updateMemory`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot: string, memoryId: string, updates: Partial<Pick<SessionMemoryEntry, 'content' | 'type' | 'relevantFiles'>>)`
- **Returns:** `{ success: boolean; memory?: SessionMemoryEntry; error?: string }`

#### `agentChat:deleteMemory`

- **Direction:** renderer → main (invoke)
- **Payload:** `(workspaceRoot: string, memoryId: string)`
- **Returns:** `{ success: boolean; error?: string }`

### Events (main → renderer)

#### `agentChat:thread` (event)

- **Callback:** `(thread: AgentChatThreadRecord) => void`
- **Notes:** Full thread record update. Emitted when the session projector detects a state change after a session update event (and the thread is not actively streaming).

#### `agentChat:status` (event)

- **Callback:** `(payload: { threadId: string; workspaceRoot: string; status: AgentChatThreadStatus; latestMessageId?: string; latestOrchestration?: AgentChatOrchestrationLink; updatedAt: number }) => void`
- **Notes:** Lightweight status update. Always emitted on session updates, even during streaming.

#### `agentChat:stream` (event)

- **Callback:** `(chunk: StreamChunk) => void`
- **Notes:** Real-time streaming response chunks from the provider. Chunk format defined in `src/shared/types/agentChat.ts`.

#### `agentChat:message` (event)

- **Callback:** `(message: AgentChatMessageRecord) => void`
- **Notes:** Individual message updates. Defined but less commonly used; most updates come via `agentChat:thread`.

#### `agentChat:event` (event)

- **Callback:** `(event: AgentChatEvent) => void`
- **Notes:** Generic agent chat event channel.

---

## Sessions API (`sessions:*`)

Persists agent session records (tool calls, tokens, cost) to `userData/sessions/*.json`. Max 100 files; oldest are pruned automatically.

### `sessions:save`

- **Direction:** renderer → main (invoke)
- **Payload:** `(session: SessionRecord)` — must have `id: string` and `startedAt: number`
- **Returns:** `{ success: boolean; filePath?: string; error?: string }`

### `sessions:load`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; sessions?: unknown[]; error?: string }`
- **Notes:** Reads all JSON files in `userData/sessions/`.

### `sessions:delete`

- **Direction:** renderer → main (invoke)
- **Payload:** `(sessionId: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Deletes all `{sessionId}-*.json` files for the given session ID.

### `sessions:export`

- **Direction:** renderer → main (invoke)
- **Payload:** `(session: unknown, format: 'json' | 'markdown')`
- **Returns:** `{ success: boolean; cancelled?: true; filePath?: string; error?: string }`
- **Notes:** Opens native Save dialog. Markdown format includes session info, error, and tool call log table.

---

## Context API (`context:*`)

### `context:scan`

- **Direction:** renderer → main (invoke)
- **Payload:** `(projectRoot: string)`
- **Returns:** `{ success: boolean; context?: ProjectContext; error?: string }`
- **Notes:** Detects language, framework, package manager, entry points, and test runner for the project. Path-security checked.

### `context:generate`

- **Direction:** renderer → main (invoke)
- **Payload:** `(projectRoot: string, options?: ContextGenerateOptions)`
- **Returns:** `{ success: boolean; content?: string; context?: ProjectContext; error?: string }`
- **Notes:** Scans the project and generates CLAUDE.md content. Types exported from `src/main/ipc-handlers/contextTypes.ts`.

---

## MCP API (`mcp:*`)

Manages MCP server entries in `~/.claude/settings.json` (global) or `<projectRoot>/.claude/settings.json` (project).

### `mcp:getServers`

- **Direction:** renderer → main (invoke)
- **Payload:** `(opts?: { projectRoot?: string })`
- **Returns:** `{ success: boolean; servers?: McpServerEntry[]; error?: string }`
- **Notes:** Returns combined server list from global + project settings. `McpServerEntry = { name, config, scope: 'global'|'project', enabled }`.

### `mcp:addServer`

- **Direction:** renderer → main (invoke)
- **Payload:** `(args: { name: string; scope: 'global'|'project'; projectRoot?: string; config: McpServerConfig })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** `McpServerConfig = { command?, args?, env?, url? }`.

### `mcp:removeServer`

- **Direction:** renderer → main (invoke)
- **Payload:** `(args: { name: string; scope: 'global'|'project'; projectRoot?: string })`
- **Returns:** `{ success: boolean; error?: string }`

### `mcp:updateServer`

- **Direction:** renderer → main (invoke)
- **Payload:** `(args: { name: string; scope: 'global'|'project'; projectRoot?: string; config: McpServerConfig })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Fails if server not found in the specified scope.

### `mcp:toggleServer`

- **Direction:** renderer → main (invoke)
- **Payload:** `(args: { name: string; scope: 'global'|'project'; projectRoot?: string; enabled: boolean })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Moves server between `mcpServers` (enabled) and `disabledMcpServers` in settings file.

---

## MCP Store API (`mcpStore:*`)

Fetches from [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io) and installs servers.

### `mcpStore:search`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string, cursor?: string)`
- **Returns:** `{ success: boolean; servers?: McpRegistryServer[]; nextCursor?: string; error?: string }`

### `mcpStore:getDetails`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; server?: McpRegistryServer; error?: string }`
- **Notes:** Fetches from `/servers/{name}/versions/latest` endpoint.

### `mcpStore:install`

- **Direction:** renderer → main (invoke)
- **Payload:** `(server: McpRegistryServer, scope: 'global'|'project', envOverrides?: Record<string, string>)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Installs first package from `server.packages` using `npx`/`uvx`/`docker` depending on `registry_type`.

### `mcpStore:getInstalled`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; names?: string[]; error?: string }`
- **Notes:** Returns de-duplicated names of all installed servers (global + project, enabled + disabled).

### `mcpStore:searchNpm`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string, offset?: number)`
- **Returns:** `{ success: boolean; servers?: McpRegistryServer[]; error?: string }`
- **Notes:** Searches npm registry for MCP-tagged packages.

---

## Git API (`git:*`)

All git handlers require a `root` (project root) as the first argument and enforce path-security checks.

### Core Operations

#### `git:isRepo`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; isRepo?: boolean; error?: string }`

#### `git:status`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; output?: string; error?: string }` — raw `git status` output

#### `git:statusDetailed`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; files?: GitStatusEntry[]; error?: string }`
- **Notes:** Structured file-by-file status with staging state.

#### `git:branch`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; branch?: string; error?: string }`

#### `git:branches`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; branches?: string[]; error?: string }`

#### `git:checkout`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, branch: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:diff`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; diff?: string; error?: string }` — unstaged diff

#### `git:log`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; log?: string; error?: string }`

#### `git:show`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, ref: string)`
- **Returns:** `{ success: boolean; output?: string; error?: string }`

#### `git:stage`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:unstage`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:stageAll`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:unstageAll`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:commit`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, message: string)`
- **Returns:** `{ success: boolean; error?: string }`

### Snapshot / Diff Operations

#### `git:discardFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:revertFile`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:snapshot`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; hash?: string; error?: string }` — creates a git stash snapshot

#### `git:createSnapshot`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; hash?: string; error?: string }`

#### `git:restoreSnapshot`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, hash: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `git:diffReview`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; diff?: string; error?: string }` — diff for review purposes

#### `git:diffCached`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; diff?: string; error?: string }` — staged diff

#### `git:diffBetween`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, fromRef: string, toRef: string)`
- **Returns:** `{ success: boolean; diff?: string; error?: string }`

#### `git:diffRaw`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, ...refs: string[])`
- **Returns:** `{ success: boolean; diff?: string; error?: string }`

#### `git:changedFilesBetween`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, fromRef: string, toRef: string)`
- **Returns:** `{ success: boolean; files?: string[]; error?: string }`

#### `git:fileAtCommit`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string, ref: string)`
- **Returns:** `{ success: boolean; content?: string; error?: string }`

#### `git:blame`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; blame?: string; error?: string }`

#### `git:dirtyCount`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; count?: number; error?: string }`

### Hunk Operations

#### `git:applyHunk`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, patchContent: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Applies a unified diff hunk via `git apply`.

#### `git:revertHunk`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, patchContent: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Reverts a unified diff hunk via `git apply --reverse`.

#### `git:stageHunk`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, patchContent: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Stages a specific hunk via `git apply --cached`.

---

## LSP API (`lsp:*`)

All LSP handlers enforce path-security on both `root` and `filePath`.

### `lsp:start`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, language: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Starts an LSP server for the given language in the workspace root.

### `lsp:stop`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, language: string)`
- **Returns:** `{ success: boolean; error?: string }`

### `lsp:getStatus`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: true; servers: RunningServerInfo[] }`

### `lsp:completion`

- **Direction:** renderer → main (invoke)
- **Payload:** `(opts: { root: string; filePath: string; line: number; character: number })`
- **Returns:** LSP `CompletionList` or `null`

### `lsp:hover`

- **Direction:** renderer → main (invoke)
- **Payload:** `(opts: { root: string; filePath: string; line: number; character: number })`
- **Returns:** LSP `Hover` or `null`

### `lsp:definition`

- **Direction:** renderer → main (invoke)
- **Payload:** `(opts: { root: string; filePath: string; line: number; character: number })`
- **Returns:** LSP `Location[]` or `null`

### `lsp:diagnostics`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** LSP `Diagnostic[]`

### `lsp:didOpen`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string, content: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Notifies the LSP server that a document was opened.

### `lsp:didChange`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string, content: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Notifies the LSP server that document content changed (full sync).

### `lsp:didClose`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string, filePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

---

## Extensions API (`extensions:*`)

Manages native (JS/TS) IDE extensions in `userData/extensions/`.

### `extensions:list`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; extensions?: ExtensionInfo[]; error?: string }`

### `extensions:enable`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; error?: string }`

### `extensions:disable`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; error?: string }`

### `extensions:install`

- **Direction:** renderer → main (invoke)
- **Payload:** `(sourcePath: string)`
- **Returns:** `{ success: boolean; error?: string }`

### `extensions:uninstall`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; error?: string }`

### `extensions:getLog`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; log?: string; error?: string }`

### `extensions:openFolder`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Opens the extensions directory in the native file explorer.

### `extensions:activate`

- **Direction:** renderer → main (invoke)
- **Payload:** `(name: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Force-activates a disabled extension without enabling it permanently.

### `extensions:commandExecuted`

- **Direction:** renderer → main (invoke)
- **Payload:** `(commandId: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Notifies extensions that a command was executed (dispatches command event to subscribers).

---

## Extension Store API (`extensionStore:*`)

Manages VS Code-compatible (`.vsix`) extensions. Searches Open VSX Registry and VS Code Marketplace.

### Open VSX Registry

#### `extensionStore:search`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string, offset?: number)`
- **Returns:** `{ success: boolean; extensions?: VsxExtensionDetail[]; totalSize?: number; error?: string }`

#### `extensionStore:getDetails`

- **Direction:** renderer → main (invoke)
- **Payload:** `(namespace: string, name: string)`
- **Returns:** `{ success: boolean; extension?: VsxExtensionDetail; error?: string }`

#### `extensionStore:install`

- **Direction:** renderer → main (invoke)
- **Payload:** `(namespace: string, name: string, version?: string)`
- **Returns:** `{ success: boolean; installed?: InstalledVsxExtension; error?: string }`

#### `extensionStore:uninstall`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `extensionStore:getInstalled`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; extensions?: InstalledVsxExtension[]; error?: string }`

#### `extensionStore:enableContributions`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `extensionStore:disableContributions`

- **Direction:** renderer → main (invoke)
- **Payload:** `(id: string)`
- **Returns:** `{ success: boolean; error?: string }`

#### `extensionStore:getThemeContributions`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; contributions?: ThemeContribution[]; error?: string }`

### VS Code Marketplace

#### `extensionStore:searchMarketplace`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string, offset?: number, category?: string)`
- **Returns:** `{ success: boolean; extensions?: VsxExtensionDetail[]; totalSize?: number; offset?: number; error?: string }`

#### `extensionStore:getMarketplaceDetails`

- **Direction:** renderer → main (invoke)
- **Payload:** `(namespace: string, name: string)`
- **Returns:** `{ success: boolean; extension?: VsxExtensionDetail; error?: string }`
- **Notes:** Includes `readme` field (fetched separately from Marketplace).

#### `extensionStore:installMarketplace`

- **Direction:** renderer → main (invoke)
- **Payload:** `(namespace: string, name: string, version?: string)`
- **Returns:** `{ success: boolean; installed?: InstalledVsxExtension; error?: string }`
- **Notes:** Downloads `.vsix` from VS Code Marketplace, installs, and removes from disabled list.

### Events

#### `extensionStore:installed` (event)

- **Direction:** main → renderer
- **Callback:** `(installed: InstalledVsxExtension) => void`
- **Notes:** Broadcast to all windows when a Marketplace extension finishes installing.

---

## Approval API (`approval:*`)

Controls the pre-execution tool approval flow. The agent writes response files to `~/.ouroboros/approvals/`.

### `approval:respond`

- **Direction:** renderer → main (invoke)
- **Payload:** `(requestId: string, decision: 'approve' | 'reject', reason?: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Writes the approval decision to the response file that the hook script is polling.

### `approval:alwaysAllow`

- **Direction:** renderer → main (invoke)
- **Payload:** `(sessionId: string, toolName: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Adds an always-allow rule so future calls to `toolName` in `sessionId` are approved automatically.

---

## Orchestration API (`orchestration:*`)

### `orchestration:previewContext`

- **Direction:** renderer → main (invoke)
- **Payload:** `(request: { workspaceRoots: string[] })`
- **Returns:** `ContextPacket`
- **Notes:** Builds a context packet for preview (does not start a task). Includes repo facts and LSP diagnostics. Type defined in `src/main/orchestration/types.ts`.

### `orchestration:buildContextPacket`

- **Direction:** renderer → main (invoke)
- **Payload:** `(request: { workspaceRoots: string[] })`
- **Returns:** `ContextPacket`
- **Notes:** Same as `orchestration:previewContext`. Both exist for API compat; `cancelTask` is NOT registered here — use `agentChat:cancelTask`.

---

## CLAUDE.md API (`claudeMd:*`)

### `claudeMd:generate`

- **Direction:** renderer → main (invoke)
- **Payload:** `(projectRoot: string, options?: { fullSweep?: boolean })`
- **Returns:** `{ success: boolean; results?: GenerationResult[]; error?: string }`
- **Notes:** Generates CLAUDE.md files for the project. `fullSweep: true` processes all subdirectories. Delegates to `src/main/claudeMdGenerator.ts`.

### `claudeMd:generateForDir`

- **Direction:** renderer → main (invoke)
- **Payload:** `(projectRoot: string, dirPath: string)`
- **Returns:** `{ success: boolean; result?: GenerationResult; error?: string }`
- **Notes:** Generates a CLAUDE.md for a specific directory within the project.

### `claudeMd:getStatus`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; status?: GenerationStatus; error?: string }`
- **Notes:** Returns the current generation status (idle, running, last run timestamp, etc.).

---

## IDE Tools API (`ideTools:*`)

Reverse channel: the IDE tool server (HTTP) queries the renderer for context; the renderer responds via IPC.

### `ideTools:respond`

- **Direction:** renderer → main (invoke)
- **Payload:** `(queryId: string, result: unknown, error?: string)`
- **Returns:** `{ success: boolean }`
- **Notes:** Renderer sends back a response to a pending tool server query identified by `queryId`.

### `ideTools:getAddress`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ address: string | null }`
- **Notes:** Returns the HTTP address of the IDE tool server (e.g. `http://127.0.0.1:PORT`).

### `ideTools:query` (event)

- **Direction:** main → renderer
- **Callback:** `(payload: { queryId: string; tool: string; args: unknown }) => void`
- **Notes:** Tool server pushes a query to the renderer. Renderer must reply via `ideTools:respond`.

---

## CodeMode API (`codemode:*`)

Manages Cloudflare CodeMode (tool-call optimizer) integration.

### `codemode:enable`

- **Direction:** renderer → main (invoke)
- **Payload:** `(args: { serverNames: string[]; scope: 'global' | 'project'; projectRoot?: string })`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Installs the CodeMode MCP server(s) into Claude Code settings for the given scope.

### `codemode:disable`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`

### `codemode:status`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; enabled: boolean; serverNames?: string[] }`

---

## Providers API (`providers:*`)

### `providers:list`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `ProviderInfo[]` — list of configured providers with API keys masked (last 4 chars visible)
- **Notes:** Defined in `src/main/providers.ts`.

### `providers:getSlots`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `ModelSlots` — the `modelSlots` config value (provider/model assignments per slot)

### `codex:listModels`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `string[]` — available Codex model names

---

## Authentication API (`auth:*`)

Credential management for three providers: GitHub, Anthropic (Claude), and OpenAI (Codex). Credentials are encrypted at rest via Electron's `safeStorage` (OS keychain). The renderer never receives raw tokens — only status and user info.

Type definitions: `src/shared/types/auth.ts` (canonical), `src/renderer/types/electron-auth.d.ts` (renderer surface)
Implementation: `src/main/ipc-handlers/auth.ts`, `src/main/auth/` (providers + credential store)

### `auth:getStates`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; states?: AuthState[]; error?: string }`
- **Notes:** Returns the current `AuthState` for all three providers (`github`, `anthropic`, `openai`). Each state includes `provider`, `status` (`'authenticated'` | `'unauthenticated'` | `'expired'` | `'refreshing'`), and optionally `credentialType` (`'oauth'` | `'apikey'`) and `user` (GitHub only).

### `auth:startLogin`

- **Direction:** renderer → main (invoke)
- **Payload:** `(provider: AuthProvider)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Only meaningful for `'github'` — starts the GitHub Device Flow (RFC 8628). Progress events are pushed to the renderer via `auth:loginEvent`. For `'anthropic'` and `'openai'`, returns an error directing the user to `auth:setApiKey` or CLI import instead.

### `auth:cancelLogin`

- **Direction:** renderer → main (invoke)
- **Payload:** `(provider: AuthProvider)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Aborts an in-progress GitHub Device Flow login. No-op for other providers.

### `auth:logout`

- **Direction:** renderer → main (invoke)
- **Payload:** `(provider: AuthProvider)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Deletes the stored credential for the given provider. Broadcasts `auth:stateChanged` on success.

### `auth:setApiKey`

- **Direction:** renderer → main (invoke)
- **Payload:** `(provider: AuthProvider, apiKey: string)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Stores an API key for `'anthropic'` or `'openai'`. Returns an error for `'github'` (use OAuth login instead). Anthropic keys must start with `sk-ant-`. OpenAI keys must start with `sk-` and are validated against the OpenAI models endpoint before storage (if online). Broadcasts `auth:stateChanged` on success.

### `auth:importCliCreds`

- **Direction:** renderer → main (invoke)
- **Payload:** `(provider: AuthProvider)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Imports credentials from CLI tools into the credential store. Sources: `gh` CLI `hosts.yml` (GitHub), `~/.claude/.credentials.json` or `ANTHROPIC_API_KEY` env var (Anthropic), `OPENAI_API_KEY` env var or Codex CLI `config.toml` (OpenAI). Broadcasts `auth:stateChanged` on success.

### `auth:detectCliCreds`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; detections?: CliCredentialDetection[]; error?: string }`
- **Notes:** Checks which providers have importable CLI credentials without actually importing them. Each `CliCredentialDetection` includes `provider`, `available` (boolean), and `source` (human-readable origin description like `"gh CLI (user: octocat)"` or `"ANTHROPIC_API_KEY env var"`).

### `auth:openExternal`

- **Direction:** renderer → main (invoke)
- **Payload:** `(url: string)`
- **Returns:** `void`
- **Notes:** Opens a URL in the user's default browser via `shell.openExternal`. Used during GitHub Device Flow to open the verification URI.

### `auth:loginEvent` (event)

- **Direction:** main → renderer
- **Callback:** `(event: GitHubLoginEvent) => void`
- **Notes:** Pushed during GitHub Device Flow login. Event types:
  - `{ type: 'device_code', info: GitHubDeviceFlowInfo }` — contains `userCode`, `verificationUri`, `expiresIn`
  - `{ type: 'authenticated', state: AuthState }` — login succeeded, includes user info
  - `{ type: 'error', message: string }` — login failed
  - `{ type: 'cancelled' }` — login was cancelled via `auth:cancelLogin`

### `auth:stateChanged` (event)

- **Direction:** main → renderer
- **Callback:** `(states: AuthState[]) => void`
- **Notes:** Pushed whenever any provider's auth state changes (login, logout, API key set, CLI import). Contains the full `AuthState[]` for all three providers — not a delta.

---

## Window API (`window:*`)

### `window:new`

- **Direction:** renderer → main (invoke)
- **Payload:** `(projectRoot?: string)`
- **Returns:** `{ success: boolean; windowId?: number; error?: string }`
- **Notes:** Creates a new BrowserWindow, optionally scoped to a project root.

### `window:list`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; windows?: WindowInfo[] }`
- **Notes:** Returns all open windows with their IDs and project roots.

### `window:focus`

- **Direction:** renderer → main (invoke)
- **Payload:** `(windowId: number)`
- **Returns:** `{ success: boolean; error?: string }`

### `window:close`

- **Direction:** renderer → main (invoke)
- **Payload:** `(windowId: number)`
- **Returns:** `{ success: boolean; error?: string }`

### `window:minimize`

- **Direction:** renderer → main (invoke)
- **Payload:** none (acts on sender window)
- **Returns:** `{ success: boolean }`

### `window:maximize-toggle`

- **Direction:** renderer → main (invoke)
- **Payload:** none (acts on sender window)
- **Returns:** `{ success: boolean }`

### `window:close-self`

- **Direction:** renderer → main (invoke)
- **Payload:** none (acts on sender window)
- **Returns:** `{ success: boolean }`

### `window:toggle-fullscreen`

- **Direction:** renderer → main (invoke)
- **Payload:** none (acts on sender window)
- **Returns:** `{ success: boolean }`

### `window:toggle-devtools`

- **Direction:** renderer → main (invoke)
- **Payload:** none (acts on sender window)
- **Returns:** `{ success: boolean }`

---

## Graph API (`graph:*`)

Wraps the in-process codebase knowledge graph. All handlers return `{ success: false, error: 'Graph not initialized' }` if the graph controller is not ready.

### `graph:getStatus`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; status?: GraphStatus; error?: string }`

### `graph:reindex`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; result?: IndexResult; error?: string }`
- **Notes:** Triggers a full (non-incremental) re-index of the project.

### `graph:searchGraph`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string, limit?: number)`
- **Returns:** `{ success: boolean; results?: GraphNode[]; error?: string }`

### `graph:queryGraph`

- **Direction:** renderer → main (invoke)
- **Payload:** `(query: string)`
- **Returns:** `{ success: boolean; results?: unknown; error?: string }`
- **Notes:** Cypher-style query against the in-process graph.

### `graph:traceCallPath`

- **Direction:** renderer → main (invoke)
- **Payload:** `(fromId: string, toId: string, maxDepth?: number)`
- **Returns:** `{ success: boolean; result?: CallPath; error?: string }`

### `graph:getArchitecture`

- **Direction:** renderer → main (invoke)
- **Payload:** `(aspects?: string[])`
- **Returns:** `{ success: boolean; architecture?: ArchitectureSummary; error?: string }`
- **Notes:** `aspects` can include `'hotspots'`, `'file_tree'`, etc.

### `graph:getCodeSnippet`

- **Direction:** renderer → main (invoke)
- **Payload:** `(symbolId: string)`
- **Returns:** `{ success: boolean; snippet?: CodeSnippet; error?: string }`

### `graph:detectChanges`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; changes?: ChangeSet; error?: string }`
- **Notes:** Maps uncommitted changes to affected symbols + blast radius.

### `graph:searchCode`

- **Direction:** renderer → main (invoke)
- **Payload:** `(pattern: string, opts?: { fileGlob?: string; maxResults?: number })`
- **Returns:** `{ success: boolean; results?: CodeSearchResult[]; error?: string }`

### `graph:getGraphSchema`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; schema?: GraphSchema; error?: string }`

---

## Updater API (`updater:*`)

### `updater:check`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Returns `{ success: false, error: 'electron-updater not installed' }` if auto-updater is not configured.

### `updater:download`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`

### `updater:install`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Calls `quitAndInstall()` — the app will exit and restart with the new version.

---

## Cost API (`cost:*`)

### `cost:addEntry`

- **Direction:** renderer → main (invoke)
- **Payload:** `(entry: CostEntry)`
- **Returns:** `{ success: boolean; error?: string }`
- **Notes:** Persists a cost entry. `CostEntry` defined in `src/main/costHistory.ts`.

### `cost:getHistory`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; entries?: CostEntry[]; error?: string }`

### `cost:clearHistory`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; error?: string }`

---

## Usage API (`usage:*`)

Reads token/cost data from `~/.claude/` session files.

### `usage:getSummary`

- **Direction:** renderer → main (invoke)
- **Payload:** `(options?: { projectFilter?: string; since?: number; maxSessions?: number })`
- **Returns:** `{ success: boolean; summary?: UsageSummary; error?: string }`

### `usage:getSessionDetail`

- **Direction:** renderer → main (invoke)
- **Payload:** `(sessionId: string)`
- **Returns:** `{ success: boolean; detail?: SessionDetail; error?: string }`

### `usage:getRecentSessions`

- **Direction:** renderer → main (invoke)
- **Payload:** `(count?: number)` — defaults to 3
- **Returns:** `{ success: boolean; sessions?: SessionDetail[]; error?: string }`

### `usage:getWindowedUsage`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; windowed?: WindowedUsage; error?: string }`
- **Notes:** Returns usage bucketed into time windows (e.g. last hour, last day).

---

## Performance API (`perf:*`)

### `perf:ping`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; ts: number }` — current timestamp in main process

### `perf:subscribe`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean }`
- **Notes:** Subscribes the sender window to periodic performance metric events.

### `perf:unsubscribe`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean }`

---

## Shell History API (`shellHistory:*`)

### `shellHistory:read`

- **Direction:** renderer → main (invoke)
- **Payload:** none
- **Returns:** `{ success: boolean; commands?: string[]; error?: string }`
- **Notes:** Reads shell history from `~/.bash_history`, `~/.zsh_history`, or similar.

---

## Symbol API (`symbol:*`)

### `symbol:search`

- **Direction:** renderer → main (invoke)
- **Payload:** `(root: string)`
- **Returns:** `{ success: boolean; symbols?: SymbolInfo[]; error?: string }`
- **Notes:** Cross-file symbol search within the project root. Path-security checked.

---

## Common Patterns

### Result Shape

All IPC handlers return:

```typescript
{ success: true }
{ success: false, error: "Human-readable error message" }
```

### Event Subscriptions

All `on*` methods return a cleanup function:

```typescript
const cleanup = window.electronAPI.pty.onData(id, (data) => { ... })
// Later:
cleanup() // removes the listener
```

Always call cleanup in `useEffect` return:

```typescript
useEffect(() => {
  const cleanup = window.electronAPI.pty.onData(id, handler);
  return cleanup;
}, [id]);
```

### Channel Naming Convention

```
domain:action          →  pty:spawn, files:readFile, config:set
domain:event:qualifier →  pty:data:${id}, pty:exit:${id}
domain:notification    →  files:change, hooks:event, theme:changed
menu:action            →  menu:open-folder, menu:new-terminal
```
