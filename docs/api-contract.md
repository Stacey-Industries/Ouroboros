# API Contract (IPC)

All renderer↔main communication uses Electron IPC via the preload bridge.
The renderer accesses `window.electronAPI` — never raw `ipcRenderer`.

Type definitions: `src/renderer/types/electron.d.ts`
Implementation: `src/preload/preload.ts` (renderer side), `src/main/ipc.ts` (main side)

## PTY API (`window.electronAPI.pty`)

### `spawn(id, options?) → Promise<PtySpawnResult>`
Create a new terminal session.

| Param | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique session ID (e.g. `term-1710000000000-abc12`) |
| `options.cwd` | `string?` | Working directory (default: `os.homedir()`) |
| `options.cols` | `number?` | Initial columns (default: 80) |
| `options.rows` | `number?` | Initial rows (default: 24) |

**Returns:** `{ success: boolean, error?: string, already?: boolean }`

### `write(id, data) → Promise<IpcResult>`
Send input to a terminal session.

### `resize(id, cols, rows) → Promise<IpcResult>`
Resize terminal dimensions.

### `kill(id) → Promise<IpcResult>`
Kill the terminal process. Session is removed from the map.

### `onData(id, callback) → () => void`
Subscribe to terminal output. Returns cleanup function.
- **Channel:** `pty:data:${id}`
- **Callback:** `(data: string) => void`

### `onExit(id, callback) → () => void`
Subscribe to terminal exit. Returns cleanup function.
- **Channel:** `pty:exit:${id}`
- **Callback:** `(result: { exitCode: number | null, signal: number | null }) => void`

---

## Config API (`window.electronAPI.config`)

### `getAll() → Promise<AppConfig>`
Returns the entire config object.

### `get(key) → Promise<AppConfig[K]>`
Returns a single config value.

### `set(key, value) → Promise<IpcResult>`
Writes a config value. Schema validation happens in electron-store.

**Config Keys:**
| Key | Type | Default |
|-----|------|---------|
| `recentProjects` | `string[]` | `[]` |
| `defaultProjectRoot` | `string` | `''` |
| `activeTheme` | `AppTheme` | `'modern'` |
| `hooksServerPort` | `number` | `3333` |
| `terminalFontSize` | `number` | `14` |
| `autoInstallHooks` | `boolean` | `true` |
| `panelSizes` | `PanelSizes` | `{ leftSidebar: 260, rightSidebar: 340, terminal: 220 }` |

---

## Files API (`window.electronAPI.files`)

### `readFile(filePath) → Promise<ReadFileResult>`
Read file contents as UTF-8.

**Returns:** `{ success: boolean, content?: string, error?: string }`

### `readDir(dirPath) → Promise<ReadDirResult>`
List directory entries.

**Returns:**
```typescript
{
  success: boolean
  items?: Array<{
    name: string        // Entry name
    path: string        // Absolute path
    isDirectory: boolean
    isFile: boolean
    isSymlink: boolean
  }>
  error?: string
}
```

### `watchDir(dirPath) → Promise<IpcResult>`
Start watching a directory with chokidar. Events are sent via `files:change` channel.

### `unwatchDir(dirPath) → Promise<IpcResult>`
Stop watching a directory.

### `selectFolder() → Promise<SelectFolderResult>`
Open the native folder picker dialog.

**Returns:** `{ success: boolean, cancelled?: boolean, path?: string | null }`

### `onFileChange(callback) → () => void`
Subscribe to file change events. Returns cleanup function.
- **Channel:** `files:change`
- **Callback:** `(change: FileChangeEvent) => void`
- **FileChangeEvent:** `{ type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', path: string }`

---

## Hooks API (`window.electronAPI.hooks`)

### `onAgentEvent(callback) → () => void`
Subscribe to all hook events from Claude Code sessions.
- **Channel:** `hooks:event`
- **Callback:** `(event: AgentEvent) => void`

### `onToolCall(callback) → () => void`
Subscribe to tool_call events only (filtered from hooks:event).
- **Channel:** `hooks:event` (filtered to `type === 'tool_call'`)

---

## App API (`window.electronAPI.app`)

### `getVersion() → Promise<string>`
Returns the app version from package.json.

### `getPlatform() → Promise<NodeJS.Platform>`
Returns the OS platform (`'win32'`, `'darwin'`, `'linux'`).

### `openExternal(url) → Promise<IpcResult>`
Open a URL in the default browser. Only `http:` and `https:` protocols are allowed.

### `onMenuEvent(callback) → () => void`
Subscribe to application menu events. Returns cleanup function.
- **Events:** `'menu:open-folder'`, `'menu:new-terminal'`, `'menu:command-palette'`
- These are sent from `menu.ts` via `win.webContents.send()`

---

## Theme API (`window.electronAPI.theme`)

### `get() → Promise<AppTheme>`
Returns the active theme ID.

### `set(theme) → Promise<IpcResult>`
Sets the active theme and broadcasts `theme:changed` to all windows.

### `onChange(callback) → () => void`
Subscribe to theme changes. Returns cleanup function.
- **Channel:** `theme:changed`
- **Callback:** `(theme: AppTheme) => void`

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
  const cleanup = window.electronAPI.pty.onData(id, handler)
  return cleanup
}, [id])
```

### Channel Naming Convention
```
domain:action          →  pty:spawn, files:readFile, config:set
domain:event:qualifier →  pty:data:${id}, pty:exit:${id}
domain:notification    →  files:change, hooks:event, theme:changed
menu:action            →  menu:open-folder, menu:new-terminal
```
