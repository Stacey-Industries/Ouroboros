# Data Model

## Persisted State (electron-store)

All persistent config is managed by `src/main/config.ts` using `electron-store`.
Schema validation happens at the store level — the renderer treats it as opaque.

### AppConfig

```typescript
interface AppConfig {
  recentProjects: string[]           // MRU list, max 10 entries
  defaultProjectRoot: string         // Last-opened folder path (or '')
  activeTheme: AppTheme              // 'retro' | 'modern' | 'warp' | 'cursor' | 'kiro'
  hooksServerPort: number            // TCP fallback port (default: 3333, range: 1024-65535)
  terminalFontSize: number           // Terminal font size (default: 14, range: 8-32)
  autoInstallHooks: boolean          // Auto-install Claude Code hooks on startup
  panelSizes: PanelSizes             // Persisted panel dimensions
}

interface PanelSizes {
  leftSidebar: number                // default: 260, range: 140-480
  rightSidebar: number               // default: 340, range: 200-600
  terminal: number                   // default: 220, range: 120-600
}
```

### Storage Location
- Windows: `%APPDATA%/agent-ide/config.json`
- macOS: `~/Library/Application Support/agent-ide/config.json`
- Linux: `~/.config/agent-ide/config.json`

## Renderer State

### Panel Sizes (localStorage)
Key: `agent-ide:panel-sizes` — JSON of `PanelSizes`. Mirrors electron-store but used for instant hydration without IPC round-trip.

### Panel Collapse State (localStorage)
Key: `agent-ide:panel-collapse` — JSON of `{ leftSidebar: boolean, rightSidebar: boolean, terminal: boolean }`.

### ProjectContext (React context)
```typescript
interface ProjectContextValue {
  projectRoot: string | null     // Absolute path of open folder
  projectName: string            // basename(projectRoot)
  setProjectRoot: (path: string) => void
  clearProject: () => void
}
```
Seeded from `config.defaultProjectRoot` on boot. Updated when user selects a folder.

### FileViewerManager (React context)
```typescript
interface OpenFile {
  path: string                   // Absolute file path
  name: string                   // basename
  content: string | null         // File content (null while loading)
  isLoading: boolean
  error: string | null
  isDirtyOnDisk: boolean         // Set when chokidar reports change
}

// State: OpenFile[], activeIndex
```

### TerminalManager (component state)
```typescript
interface TerminalSession {
  id: string                     // 'term-{timestamp}-{random}'
  title: string                  // From OSC sequence or 'Terminal N'
  status: 'running' | 'exited'
}

// State: TerminalSession[], activeSessionId
```

### PTY Sessions (main process, in-memory Map)
```typescript
interface PtySession {
  id: string
  process: pty.IPty              // node-pty handle
  cwd: string
  shell: string
}
// Stored in: Map<string, PtySession>
```

## Event Types

### Hook Events (from Claude Code)
```typescript
type HookEventType = 'pre_tool_use' | 'post_tool_use' | 'agent_start' | 'agent_stop' | 'session_start' | 'session_stop'

interface HookPayload {
  type: HookEventType
  sessionId: string
  toolName?: string
  input?: unknown
  output?: unknown
  taskLabel?: string
  durationMs?: number
  timestamp: number              // Unix epoch ms
}
```

### Agent Events (renderer-side abstraction)
```typescript
type AgentEventType = 'tool_call' | 'tool_result' | 'message' | 'error' | 'status'

interface AgentEvent {
  type: AgentEventType
  sessionId?: string
  agentId?: string
  timestamp: number
  payload: unknown
}
```

### File Change Events
```typescript
type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

interface FileChangeEvent {
  type: FileChangeType
  path: string                   // Absolute path
}
```

## Theme Definitions

Each theme is a TypeScript object mapping CSS custom property names to values:
```typescript
interface ThemeDefinition {
  id: AppTheme
  name: string
  vars: Record<string, string>   // e.g. { '--bg': '#0d1117', '--text': '#e6edf3', ... }
}
```

Available themes: `retro`, `modern` (default), `warp`, `cursor`, `kiro`.
Applied by setting CSS vars on `document.documentElement.style`.
