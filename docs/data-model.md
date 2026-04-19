# Data Model

## Persisted State (electron-store)

All persistent config is managed by `src/main/config.ts` using `electron-store`.
Schema validation happens at the store level — the renderer treats it as opaque.

### AppConfig

Schema source: `src/main/configSchema.ts` + `configSchemaMiddle.ts` + `configSchemaTail.ts`.
Generated from schema at Wave 41 Phase M. Add new keys to the appropriate schema file by domain.

```typescript
type AppTheme =
  | 'retro'
  | 'modern'
  | 'warp'
  | 'cursor'
  | 'kiro'
  | 'glass'
  | 'light'
  | 'high-contrast'
  | 'custom'
  | (string & {});

interface AppConfig {
  // ── Project ──────────────────────────────────────────────────────────────
  recentProjects: string[]; // MRU list, max 10 entries
  defaultProjectRoot: string; // Last-opened folder path (or '')
  multiRoots: string[]; // @deprecated — superseded by per-window projectRoots
  bookmarks: string[]; // Absolute paths pinned to top of file tree
  fileTreeIgnorePatterns: string[]; // Extra ignore patterns merged with hardcoded list

  // ── Appearance ───────────────────────────────────────────────────────────
  activeTheme: AppTheme;
  activeFileIconTheme: string;
  activeProductIconTheme: string;
  showBgGradient: boolean;
  customThemeColors: Record<string, string>;
  customCSS: string;
  glassOpacity: number; // Glass theme transparency (0–100)
  fontUI: string; // UI font family
  fontMono: string; // Monospace font family
  fontSizeUI: number; // UI font size (11–18, default 13)

  // ── Window / Layout ──────────────────────────────────────────────────────
  windowBounds: WindowBounds; // Persisted window position/size
  panelSizes: PanelSizes; // Persisted panel dimensions
  activeLayoutName: string; // Name of active workspace layout
  workspaceLayouts: WorkspaceLayout[]; // Saved panel arrangements

  // Wave 17/20/28/32 layout preset engine
  layout: {
    presets: { v2: boolean };        // default true
    chatPrimary: boolean;            // default true
    dragAndDrop: boolean;            // default true
    customLayoutsPerSession: Record<string, unknown>;
    customLayoutsMru: string[];
    globalCustomPresets: object[];
    mobilePrimary: boolean;          // Wave 32 — enable mobile-first layout at <768px. Default false (soak gate).
  };

  // ── Terminal ─────────────────────────────────────────────────────────────
  hooksServerPort: number; // TCP fallback port (default: 3333, range: 1024–65535)
  terminalFontSize: number; // Terminal font size (default: 14, range: 8–32)
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  commandBlocksEnabled: boolean; // Warp-style command block overlay
  promptPattern: string; // Custom regex for prompt detection
  customPrompt: string; // Custom PS1 (empty = shell default)
  promptPreset: string; // 'default' | 'minimal' | 'powerline' | 'git' | 'custom'
  shell: string; // Override shell executable
  terminalSessions: TerminalSessionSnapshot[]; // Session restore data
  persistTerminalSessions: boolean; // Wave 8 — persist PTY descriptors across restarts (default false)

  // ── Keybindings ──────────────────────────────────────────────────────────
  keybindings: Record<string, string>; // action ID → shortcut string

  // ── Claude CLI ───────────────────────────────────────────────────────────
  claudeCliSettings: ClaudeCliSettings;
  claudeAutoLaunch: boolean; // Auto-launch Claude session on startup
  agentTemplates: AgentTemplate[]; // Pre-configured launch profiles

  // ── Codex CLI ────────────────────────────────────────────────────────────
  codexCliSettings: CodexCliSettings;

  // ── Agent Chat ───────────────────────────────────────────────────────────
  agentChatSettings: AgentChatSettings;

  // Wave 22/23 chat flags
  chat: {
    density: 'comfortable' | 'compact'; // default 'comfortable'
    desktopNotifications: boolean;       // default true
    sideChats: boolean;                  // default true
    branchingPolish: boolean;            // default true
  };

  // ── Context Layer ────────────────────────────────────────────────────────
  contextLayer: ContextLayerConfig;

  // Wave 19/24/31 context scoring flags
  context: {
    provenanceWeights: boolean;  // default true
    pagerank: boolean;           // default true
    pagerankSeeds: { pinned: number; symbol: number; user_edit: number };
    decisionLogging: boolean;    // Wave 24 — default true
    rerankerEnabled: boolean;    // Wave 24 — Haiku reranker. Default false (opt-in; cold-start ~1-3s).
    packetMode: 'full' | 'lean'; // Wave 31 — 'lean' drops project_structure, caps to 6 files. Default 'full'.
    learnedRanker: boolean;      // Wave 31 — classifier score as ranking key. Default false (shadow mode).
  };

  // ── CLAUDE.md generation ─────────────────────────────────────────────────
  claudeMdSettings: ClaudeMdSettings;

  // ── Model providers ──────────────────────────────────────────────────────
  modelProviders: ModelProvider[]; // Configured Anthropic-compatible endpoints
  modelSlots: ModelSlotAssignments; // Which provider:model for each session type

  // Wave 36 multi-provider support
  providers: {
    multiProvider: boolean; // default false — enables non-Claude session providers
  };

  // ── Hooks / Approval ─────────────────────────────────────────────────────
  autoInstallHooks: boolean; // Auto-install Claude Code hooks on startup
  approvalRequired: string[]; // Tool names requiring user approval
  approvalTimeout: number; // Auto-approve after N seconds (0 = never)
  approvalMemory: { alwaysAllow: object[]; alwaysDeny: object[] }; // Wave 26

  // ── Extensions ───────────────────────────────────────────────────────────
  extensionsEnabled: boolean;
  disabledExtensions: string[];
  installedVsxExtensions: VsxExtension[]; // VS Code extensions from Open VSX
  disabledVsxExtensions: string[];

  // ── LSP ──────────────────────────────────────────────────────────────────
  lspEnabled: boolean;
  lspServers: Record<string, string>; // language id → server command

  // ── Notifications ────────────────────────────────────────────────────────
  notifications: NotificationSettings;

  // ── Profiles ─────────────────────────────────────────────────────────────
  profiles: object[]; // Wave 26 — user profiles (built-ins merged at read time, never stored)
  workspaceProfileDefaults: Record<string, string>; // Wave 26 — projectRoot → profileId

  // ── Sessions ─────────────────────────────────────────────────────────────
  sessionsData: object[]; // Wave 16 — persisted Session records (typed by TS interface)
  sessionFolders: object[]; // Wave 21 — user-created session folders
  sessions: {
    worktreePerSession: boolean; // Wave 16 — git worktree per session. Default false.
  };

  // ── Background Jobs ──────────────────────────────────────────────────────
  backgroundJobsMaxConcurrent: number; // Wave 6 — max concurrent jobs (1–10, default 2)

  // ── Time travel / Workspace snapshots ────────────────────────────────────
  workspaceSnapshots: WorkspaceSnapshot[]; // Capped at 100
  autoCheckpoint: boolean; // Wave — auto-capture checkpoint on each assistant turn. Default true.

  // ── Editor ───────────────────────────────────────────────────────────────
  formatOnSave: boolean;
  provenanceTracking: boolean; // Wave 18 — edit provenance tracking. Default true.

  // ── Web remote access ────────────────────────────────────────────────────
  webAccessPort: number; // default: 7890
  webAccessToken: string;
  webAccessPassword: string;

  // ── Mobile access (Wave 33a/34) ──────────────────────────────────────────
  mobileAccess: {
    enabled: boolean; // default false
    pairedDevices: PairedDevice[];
    desktopFingerprint?: string;
    resumeTtlSec: number; // TTL for orphaned in-flight resumable calls (30–3600s, default 300)
  };

  // ── Session dispatch (Wave 34) ───────────────────────────────────────────
  sessionDispatch: {
    enabled: boolean;         // default false
    maxConcurrent: number;    // 1–3, default 1
    jobTimeoutMs: number;     // default 1 800 000 ms (30 min)
    queue: object[];
    fcmServiceAccountPath: string; // Wave 34 Phase F — push delivery
  };

  // ── Theming overrides (Wave 35) ──────────────────────────────────────────
  theming: {
    accentOverride?: string;
    verbOverride?: string;
    thinkingVerbs?: string[];
    spinnerChars?: string;
    fonts?: { editor?: string; chat?: string; terminal?: string };
    customTokens?: Record<string, string>;
  };

  // ── Ecosystem (Wave 37) ──────────────────────────────────────────────────
  // Ecosystem features ship as always-on code; the 'moat' label is a theme, not a config flag.
  ecosystem: {
    lastSeenSnapshot?: { cliVersion: string; capturedAt: number; promptHash: string; promptText: string };
    lastExport?: { path: string; at: number; rows: number };
    systemPrompt?: string; // Installed by marketplace bundle
    rulesAndSkillsInstallEnabled: boolean; // Wave 41 Phase C — gate for rules-and-skills install. Default false.
  };

  // ── Marketplace (Wave 41) ────────────────────────────────────────────────
  marketplace: {
    allowInstallOnRevocationFetchFailure: boolean; // default false (fail-closed)
  };

  // ── Platform (Wave 38) ───────────────────────────────────────────────────
  platform: {
    onboarding: { completed: boolean };
    language: 'en' | 'es'; // default 'en'
    updateChannel: 'stable' | 'beta'; // default 'stable'
    crashReports: {
      enabled: boolean;       // default false
      webhookUrl: string;
      allowInsecure: boolean; // Wave 41 Phase K — permit http: webhook URLs (debug only). Default false.
    };
    lastSeenVersion: string;
    dismissedEmptyStates: Record<string, boolean>; // Wave 38 Phase C — persistent "don't show again" map
  };

  // ── Router (Wave 19/29/31) ───────────────────────────────────────────────
  routerSettings: {
    enabled: boolean;
    layer1Enabled: boolean;
    layer2Enabled: boolean;
    layer3Enabled: boolean;
    layer2ConfidenceThreshold: number; // default 0.6
    paranoidMode: boolean;
    llmJudgeSampleRate: number; // 0–1, default 0 (disabled)
  };
  routerLastRetrainCount: number;

  // ── Research (Wave 30) ───────────────────────────────────────────────────
  researchSettings: {
    globalEnabled: boolean;
    defaultMode: 'off' | 'conservative' | 'aggressive';
    stalenessConfidenceFloor: number;
    factClaimEnabled: boolean;
    factClaimMinPatternConfidence: 'high' | 'medium' | 'low';
    preEditDryRunOnly: boolean;
    maxLatencyMs: number;
  };

  // ── Misc feature flags ───────────────────────────────────────────────────
  internalMcpEnabled: boolean;  // SSE MCP server enable (default true)
  usePtyHost: boolean;          // default false
  useExtensionHost: boolean;    // default false
  useMcpHost: boolean;          // default false
  review: { enhanced: boolean }; // Wave 29 — diff review enhanced UX (default true)
  agentic: { subagentUx: boolean }; // Wave 27 — subagent UX (default true)
  codebaseGraph: { gcEnabled: boolean; gcDaysThreshold: number }; // Wave 14
  telemetry: { structured: boolean; retentionDays: number }; // Wave 15
  workspaceReadLists: Record<string, string[]>; // Wave 25 — project root → auto-pinned file paths

  // Auth
  authOnboardingDismissed: boolean;
  trustedWorkspaces: string[];
}

interface PanelSizes {
  leftSidebar: number; // default: 220, range: 140-480
  rightSidebar: number; // default: 300, range: 200-600
  terminal: number; // default: 280, range: 120-600
}

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

interface TerminalSessionSnapshot {
  cwd: string;
  title: string;
  isClaude?: boolean;
  isCodex?: boolean;
  claudeSessionId?: string; // Used to restore with --resume <id>
  codexThreadId?: string; // Used to restore with `codex resume <id>`
}

interface ClaudeCliSettings {
  permissionMode: string; // 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'
  model: string; // '' = CLI default; e.g. 'sonnet', 'opus', full model ID
  effort: string; // 'low' | 'medium' | 'high' | 'max'
  appendSystemPrompt: string;
  verbose: boolean;
  maxBudgetUsd: number; // 0 = unlimited
  allowedTools: string; // comma-separated, empty = all
  disallowedTools: string; // comma-separated, empty = none
  addDirs: string[];
  chrome: boolean; // Claude in Chrome integration
  worktree: boolean; // Use git worktree for sessions
  dangerouslySkipPermissions: boolean;
}

interface CodexCliSettings {
  model: string;
  reasoningEffort: string; // 'low' | 'medium' | 'high' | 'xhigh'
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy: 'untrusted' | 'on-request' | 'never';
  profile: string; // Config profile from ~/.codex/config.toml
  addDirs: string[];
  search: boolean; // Live web search
  skipGitRepoCheck: boolean;
  dangerouslyBypassApprovalsAndSandbox: boolean;
}

interface NotificationSettings {
  level: string; // 'all' | 'errors-only' | 'none'
  alwaysNotify: boolean; // Notify even when app is focused
}

interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
  enabled: boolean;
  builtIn?: boolean;
}

interface ProviderModel {
  id: string;
  name: string;
  provider: string;
  capabilities?: string[];
}

interface ModelSlotAssignments {
  terminal: string; // 'providerId:modelId' for Claude Code terminals
  agentChat: string; // Model for agent chat subagent sessions
  claudeMdGeneration: string; // Model for CLAUDE.md generation
}

interface WorkspaceLayout {
  name: string;
  panelSizes: PanelSizes;
  visiblePanels: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
  rightSidebarTab?: string;
  builtIn?: boolean;
}

interface WorkspaceSnapshot {
  id: string;
  commitHash: string;
  sessionId: string;
  sessionLabel?: string;
  timestamp: number;
  type: 'session-start' | 'session-end' | 'manual';
  fileCount?: number;
  projectRoot?: string;
}

interface AgentTemplate {
  id: string;
  name: string;
  icon?: string;
  promptTemplate: string; // Supports {{projectRoot}}, {{projectName}}, {{openFile}}, {{openFileName}}
  cliOverrides?: Partial<ClaudeCliSettings>;
}

interface ClaudeMdSettings {
  enabled: boolean;
  triggerMode: 'post-session' | 'post-commit' | 'manual';
  model: 'haiku' | 'sonnet' | 'opus';
  autoCommit: boolean;
  generateRoot: boolean;
  generateSubdirs: boolean;
  excludeDirs: string[];
}

interface ContextLayerConfig {
  enabled: boolean;
  maxModules: number;
  maxSizeBytes: number;
  debounceMs: number;
  autoSummarize: boolean;
  moduleDepthLimit: number;
}

interface PairedDevice {
  id: string;
  label: string;
  refreshTokenHash: string; // SHA-256 base64url of raw token — raw token never stored
  fingerprint: string;
  capabilities: string[];
  issuedAt: string;
  lastSeenAt: string;
  pushToken?: string;      // Wave 34 Phase F — server-side only, never sent to renderer
  pushPlatform?: 'android' | 'ios';
}
```

### Storage Location

- Windows: `%APPDATA%/agent-ide/config.json`
- macOS: `~/Library/Application Support/agent-ide/config.json`
- Linux: `~/.config/agent-ide/config.json`

## Renderer State

### Panel Sizes (localStorage)

Key: `agent-ide:panel-sizes` — JSON of `PanelSizes` (leftSidebar/rightSidebar/terminal in px). Mirrors electron-store but used for instant hydration without IPC round-trip.

### Panel Collapse State (localStorage)

Key: `agent-ide:panel-collapse` — JSON of `{ leftSidebar: boolean, rightSidebar: boolean, terminal: boolean }`.

### ProjectContext (React context)

```typescript
interface ProjectContextValue {
  projectRoot: string | null; // Absolute path of open folder
  projectName: string; // basename(projectRoot)
  setProjectRoot: (path: string) => void;
  clearProject: () => void;
}
```

Seeded from `config.defaultProjectRoot` on boot. Updated when user selects a folder.

### FileViewerManager (React context)

```typescript
interface OpenFile {
  path: string; // Absolute file path
  name: string; // basename
  content: string | null; // File content (null while loading)
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean; // Set when chokidar reports change
}

// State: OpenFile[], activeIndex
```

### TerminalManager (component state)

```typescript
interface TerminalSession {
  id: string; // 'term-{timestamp}-{random}'
  title: string; // From OSC sequence or 'Terminal N'
  status: 'running' | 'exited';
}

// State: TerminalSession[], activeSessionId
```

### Agent Chat (SQLite, in renderer via IPC)

```typescript
type AgentChatThreadStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'verifying'
  | 'needs_review'
  | 'complete'
  | 'failed'
  | 'cancelled';

type AgentChatMessageRole = 'user' | 'assistant' | 'system' | 'status';

// Threads and messages persisted in SQLite (userData/agent-chat.db).
// JSON file fallback lives in userData/agent-chat/threads/{sha1(threadId)}.json.
// Max 100 threads per workspace root.

// Schema v2 → v3 addition (Wave 6 / Session Checkpoints):
// ALTER TABLE messages ADD COLUMN checkpointCommit TEXT;
// Populated by chatOrchestrationBridgeGit.ts post-turn capture.
```

### Background Jobs (SQLite — Wave 6)

Table `background_jobs` in the main `storage/database.ts` database (`userData/storage.db`).
Created by `src/main/storage/migrate.ts` schema migration.

```sql
CREATE TABLE IF NOT EXISTS background_jobs (
  id           TEXT PRIMARY KEY,
  projectRoot  TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  createdAt    INTEGER NOT NULL,
  startedAt    INTEGER,
  completedAt  INTEGER,
  exitCode     INTEGER,
  sessionId    TEXT,
  resultSummary TEXT
);
```

Status enum: `'queued' | 'running' | 'done' | 'error' | 'cancelled'`

- `sessionId` — set from the first `session_id` field in the stream-json output; used to correlate `session_stop` hook events back to the job.
- Queue cap: 50 pending. Concurrency cap: `config.backgroundJobsMaxConcurrent` (default 2).
- On restart: rows with `status = 'running'` whose PTY process is gone are updated to `status = 'error'` with `resultSummary = 'interrupted'`.

```typescript
// Shared type — src/shared/types/backgroundJob.ts
interface BackgroundJob {
  id: string;
  projectRoot: string;
  prompt: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  createdAt: number;       // Unix ms
  startedAt?: number;
  completedAt?: number;
  exitCode?: number;
  sessionId?: string;
  resultSummary?: string;
}
```

### Session Checkpoints (Wave 6)

Checkpoints are stored as git commits on a dedicated ref rather than in a separate database.

- **Git ref convention**: `refs/ouroboros/checkpoints/<threadId>`
- **Commit scope**: per assistant turn (each assistant message boundary that modifies files).
- **Metadata**: the `checkpointCommit` column on the `messages` table links a thread message to its post-turn commit hash.
- **Restore**: `git:restoreSnapshot` (checkout with `git stash` guard for dirty working tree). Intervening messages are flagged `rewound` in the thread record.
- **GC policy**: keep last 50 checkpoints per thread; older commits pruned on next capture.

```typescript
// Shared type — src/shared/types/sessionCheckpoint.ts
interface SessionCheckpoint {
  id: string;
  threadId: string;
  messageId: string;
  commitHash: string;
  filesChanged: string[];
  createdAt: number;
  label?: string;
}
```

### PTY Sessions (main process, in-memory Map)

```typescript
interface PtySession {
  id: string;
  process: pty.IPty; // node-pty handle
  cwd: string;
  shell: string;
}
// Stored in: Map<string, PtySession>
```

## Event Types

### Hook Events (from Claude Code)

```typescript
type AgentEventType =
  | 'agent_start'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_end'
  | 'agent_stop'
  | 'session_start'
  | 'session_stop';

interface HookPayload {
  type: AgentEventType;
  sessionId: string;
  timestamp: number; // Unix epoch ms
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  prompt?: string;
  error?: string;
  parentSessionId?: string;
  usage?: RawApiTokenUsage;
  model?: string;
  requestId?: string;
  cwd?: string; // Working directory of the Claude Code session
}

interface RawApiTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
```

### Agent Events (renderer-side abstraction)

```typescript
interface AgentEvent {
  type: AgentEventType; // Same union as HookPayload.type
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  payload: unknown;
}
```

### File Change Events

```typescript
type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

interface FileChangeEvent {
  type: FileChangeType;
  path: string; // Absolute path
}
```

## Theme Definitions

Each theme is a TypeScript object mapping CSS custom property names to values:

```typescript
interface ThemeDefinition {
  id: AppTheme;
  name: string;
  vars: Record<string, string>; // e.g. { '--bg': '#0d1117', '--text': '#e6edf3', ... }
}
```

Available themes: `retro`, `modern` (default), `warp`, `cursor`, `kiro`, `glass`, `light`, `high-contrast`.
Applied by setting CSS vars on `document.documentElement.style`.
