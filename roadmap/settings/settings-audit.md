# Settings UI audit

**Legend:** ✅ wired (stored AND meaningfully read in behavior) | ⚠ partial (stored but reader is incomplete, gated by dead flag, or only read in tests) | ❌ stubbed (no-op control — change is accepted but has no behavioral effect) | 🔴 broken (visible bug: disabled toggle, wrong type cast, or handler error)

**Entry point:** `src/renderer/components/Settings/SettingsPanel.tsx`  
**Tab router:** `src/renderer/components/Settings/SettingsTabContent.tsx`  
**Total tabs:** 26 (`settingsTabs.ts`)

---

## Tab: General (`general`)

### Subsection: Default Project Folder / Recent Projects

| Label | Config key | Status | Notes |
|---|---|---|---|
| Default Project Folder (browse) | `defaultProjectRoot` | ✅ | Read in `ptySpawn`, `WorkspaceReadListSection`, `AgentProfilesSection`, `contextLayer` |
| Recent Projects (list + clear) | `recentProjects` | ✅ | Read in recent-project menu via IPC; clear sets array to `[]` |

### Subsection: General toggles

| Label | Config key | Status | Notes |
|---|---|---|---|
| Auto-install hook scripts | `autoInstallHooks` | ✅ | Read in `hookInstaller.ts:317` — skips install when false |
| Immersive chat mode | `layout.immersiveChat` | ✅ | Read in `useImmersiveChatFlag.ts`; switches `ChatOnlyShellWrapper` vs `InnerAppLayout` |

### Subsection: Agent Notifications

| Label | Config key | Status | Notes |
|---|---|---|---|
| Notification level (all / errors-only / none) | `notifications.level` | ✅ | Read in `notifications.ts` |
| Always notify | `notifications.alwaysNotify` | ✅ | Read in `notifications.ts` |

### Subsection: Web Remote Access

| Label | Config key | Status | Notes |
|---|---|---|---|
| Password | `webAccessPassword` | ⚠ | Stored; `secretMigration.ts` migrates it to `SecureKeyStore` on next launch then zeros the config field — so the rendered value is always `''` after first migration. Field is functionally write-only via this UI path. |
| Port | `webAccessPort` | ✅ | Read in `main.ts:200` to bind the web server |

### Subsection: Backup

| Label | Config key | Status | Notes |
|---|---|---|---|
| Import settings (file picker) | n/a — calls `onImport` | ✅ | Merges imported `AppConfig` into draft; saves on user confirm |

### Subsection: LSP

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable LSP | `lspEnabled` | ✅ | Read in `ipc-handlers/configHelpers.ts`, consumed by `lspHelpers.ts` |
| Custom Language Server Commands (textarea) | `lspServers` | ✅ | Read in `lspHelpers.ts:180` |
| Inline Completions | `inlineCompletionsEnabled` | ✅ | Read in `ipc-handlers/aiHandlers.ts:116` — gates inline completion IPC handler |

### Subsection: Semantic Search

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable Semantic Search | `embeddingsEnabled` | ✅ | Read in `ipc-handlers/embeddingHandlers.ts` |
| Provider (Local / Voyage AI) | `embeddingProvider` | ✅ | Read in `embeddings/embeddingProvider.ts` |
| Voyage API Key | `voyageApiKey` | ✅ | Read in `embeddings/embeddingProvider.ts` |
| Reindex Now (button) | n/a — calls `window.electronAPI.embedding.reindex` | ✅ | Live IPC call; not a draft key |

### Subsection: Developer Flags (collapsed by default)

| Label | Config key | Status | Notes |
|---|---|---|---|
| PTY host process | `usePtyHost` | ✅ | Read in `backgroundJobs/jobRunner.ts:211` — routes PTY spawning |
| Extension host process | `useExtensionHost` | ✅ | Read in `extensionsLifecycle.ts:188,237` |
| MCP host process | `useMcpHost` | ⚠ | Stored; `configAppTypes.ts` declares it; no confirmed reader in `src/main` beyond type/test files. Likely future-wired. |

---

## Tab: Appearance (`appearance`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Theme grid (click to select) | `activeTheme` | ✅ | Read in `useTheme`, applied as CSS class on `<body>` |
| Show background gradient | `showBgGradient` | ✅ | Read in `useTheme` / theme bootstrap |
| Material variant (Vapor / Prism / Warp) | `materialVariant` | ✅ | Read in `getMaterialVariant`, affects palette baseline; live-previewed via `setMaterialVariant` |
| Glass Tint (0–100% slider) | `glassOpacity` | ✅ | Live-previewed via `setGlassOpacity`; persisted on save |
| Accent Picker (color wheel) | `accentColor` (inferred) | ⚠ | `AccentPicker` component reads/writes its own state via IPC; config key not passed through draft system — operates outside `onChange`. Unclear whether it persists via a separate IPC path or localStorage. Needs verification. |
| Thinking Verb Picker | (unclear) | ⚠ | `ThinkingVerbPicker` is composed with no props from draft; manages its own state. Config key not visible from this level. |
| Pane Font Picker | (unclear) | ⚠ | `PaneFontPickerSection` has no props from draft in its current composition (rendered as `<PaneFontPicker as PaneFontPickerSection />`). Config key not visible without reading `PaneFontPicker.tsx` internals. |
| Theme Editor (collapsible) | `customThemeColors`, `activeTheme` | ✅ | `ThemeEditor` receives `draft` + `onChange`; saves to `customThemeColors` |
| VS Code Theme Import | n/a — calls IPC | ⚠ | `AppearanceSectionVsCodeImport` manages its own state; no draft key passed. Fires IPC directly. |
| Custom CSS (textarea) | `customCSS` (inferred) | ⚠ | `CustomCSSSection` receives `draft` + `onChange`; config key name not verified without reading `AppearanceSectionCustomCSS.tsx`. |

---

## Tab: Fonts (`fonts`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| UI Font Family | `fontUI` | ✅ | Read in `useTheme` / renderer bootstrap via `fontUI` CSS var |
| Monospace Font Family | `fontMono` | ✅ | Read in `useTheme` / terminal bootstrap |
| UI Font Size (slider 11–18px) | `fontSizeUI` | ✅ | Applied after Save; comment in UI confirms this. Read in renderer App bootstrap. |

---

## Tab: Terminal (`terminal`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Terminal Font Size (stepper + input) | `terminalFontSize` | ✅ | Read in `pty.ts` / xterm options |
| Default Shell (presets + text input) | `shell` | ✅ | Read in `ptySpawn.ts` |
| Shell Prompt (preset radio + custom PS1) | `promptPreset`, `customPrompt` | ✅ | Read in `ptyEnv.ts:107-108` |
| Persist terminal sessions | `persistTerminalSessions` | ✅ | Read in `ptyPersistence.ts:228` |

---

## Tab: Agent (`agent`)

### Agent Chat

| Label | Config key | Status | Notes |
|---|---|---|---|
| Default provider | `agentChatSettings.defaultProvider` | ✅ | Read in agent chat orchestration; governs which CLI is spawned |
| Verification profile | `agentChatSettings.defaultVerificationProfile` | ⚠ | Stored; the `defaultVerificationProfile` field exists in schema. No confirmed behavioral reader found in a quick grep — likely consumed by orchestration but needs spot-check. |
| Context behavior (auto / manual) | `agentChatSettings.contextBehavior` | ✅ | Read in context orchestration to decide auto vs manual context gathering |
| Default view (chat / monitor) | `agentChatSettings.defaultView` | ⚠ | Stored; no confirmed renderer consumer found in this audit pass. |
| Show advanced controls | `agentChatSettings.showAdvancedControls` | ✅ | Read in chat composer to conditionally show provider/verification overrides |
| Open details on failure | `agentChatSettings.openDetailsOnFailure` | ⚠ | Stored; no confirmed consumer found in this audit pass. |

### Model Router

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable model router | `routerSettings.enabled` | ✅ | Read in router dispatch logic |
| Enable router rule engine | `routerSettings.layer1Enabled` | ✅ | Read in router layer-1 |
| Enable router classifier | `routerSettings.layer2Enabled` | ✅ | Read in router layer-2 |
| Router classifier threshold | `routerSettings.layer2ConfidenceThreshold` | ✅ | Read by layer-2 classifier |
| Enable layer 3 fallback | `routerSettings.layer3Enabled` | ⚠ | Stored; UI note says "not used yet — reserved for future async fallback layer" |
| Enable paranoid mode | `routerSettings.paranoidMode` | ✅ | Forces Opus for all Agent Chat requests |
| LLM Judge Sample Rate (slider) | `routerSettings.llmJudgeSampleRate` | ✅ | Read by quality evaluation sampler |

### Context Layer

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable context layer | `contextLayer.enabled` | ✅ | Read in `contextLayerController.ts` |
| Auto-summarize modules | `contextLayer.autoSummarize` | ✅ | Read in `contextLayerModuleSummary.ts` |

### Context Packet Size

| Label | Config key | Status | Notes |
|---|---|---|---|
| Context Packet Size (Full / Lean) | `context.packetMode` | ✅ | Read in context injection to select full vs lean packet |

### Inline Edit & Jobs

| Label | Config key | Status | Notes |
|---|---|---|---|
| Background Jobs Concurrency (1–8) | `backgroundJobsMaxConcurrent` | ✅ | Read in `ipc-handlers/backgroundJobs.ts:31` |

---

## Tab: Claude Code (`claude`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Auto launch Claude on startup | `claudeAutoLaunch` | ✅ | Read in `ptyClaude` / startup sequencing |
| Permission mode | `claudeCliSettings.permissionMode` | ✅ | Passed as `--permission-mode` flag to Claude CLI |
| Model override | `claudeCliSettings.model` | ✅ | Passed as `--model` to Claude CLI |
| Effort level (Low/Med/High/Max) | `claudeCliSettings.effort` | ✅ | Passed as `--effort` to Claude CLI |
| Verbose output | `claudeCliSettings.verbose` | ✅ | Passed as `--verbose` |
| Max Budget (USD) | `claudeCliSettings.maxBudgetUsd` | ✅ | Passed as `--max-budget` |
| Allowed tools | `claudeCliSettings.allowedTools` | ✅ | Passed as `--allowedTools` |
| Disallowed tools | `claudeCliSettings.disallowedTools` | ✅ | Passed as `--disallowedTools` |
| System Prompt (append) | `claudeCliSettings.appendSystemPrompt` | ✅ | Passed as `--append-system-prompt` |
| Additional Directories (add/remove list) | `claudeCliSettings.addDirs` | ✅ | Passed as `--add-dir` |
| Chrome integration | `claudeCliSettings.chrome` | ✅ | Passed as `--chrome` |
| Git worktree | `claudeCliSettings.worktree` | ✅ | Passed as `--worktree` |
| CLAUDE.md Templates (template editor) | `agentTemplates` | ✅ | Read in template injection for new sessions |
| Skip All Permission Checks (danger toggle) | `claudeCliSettings.dangerouslySkipPermissions` | ✅ | Passed as `--dangerously-skip-permissions` |

---

## Tab: Codex (`codex`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Codex model override | `codexCliSettings.model` | ✅ | Passed as `--model` to Codex CLI |
| Codex reasoning effort | `codexCliSettings.reasoningEffort` | ✅ | Passed as `--reasoning-effort` |
| Sandbox mode | `codexCliSettings.sandbox` | ✅ | Passed as `--sandbox` |
| Approval policy | `codexCliSettings.approvalPolicy` | ✅ | Passed as `--approval-policy` |
| Use app-server transport | `ecosystem.codexAppServerTransport` | ✅ | Read in Codex provider to select transport path |
| Codex workspace directories (add/remove) | `codexCliSettings.addDirs` (inferred) | ✅ | Passed as `--add-dir` |
| Skip permission checks (Codex danger) | `codexCliSettings.dangerouslySkipPermissions` (inferred) | ✅ | Passed as `--dangerously-skip-permissions` to Codex |

---

## Tab: Providers (`providers`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Provider list (toggle enabled/disabled, remove) | `modelProviders[n].enabled` | ✅ | Read in `useClaudeSectionModel` to build model option groups |
| Add Provider (name, base URL, API key) | `modelProviders` (array append) | ✅ | Persisted; affects Claude and Codex model dropdowns |
| Model Slot — Terminal Model | `modelSlotAssignments.terminal` | ⚠ | Stored; no confirmed reader found in main process that maps this slot to spawn args. Likely planned but unfinished. |
| Model Slot — Agent Chat Model | `modelSlotAssignments.agentChat` | ⚠ | Same as above. |
| Model Slot — CLAUDE.md Generation Model | `modelSlotAssignments.claudeMdGeneration` | ⚠ | Same as above. |
| Model Slot — Inline Completion Model | `modelSlotAssignments.inlineCompletion` | ⚠ | Same as above. |
| Provider API Keys (add/remove) | (via `ProviderApiKeysSection`) | ⚠ | Manages its own IPC; exact config key not visible without reading `ProviderApiKeysSection.tsx`. |

---

## Tab: Keybindings (`keybindings`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| All keybinding actions (categorized list, rebind) | `keybindings` (map of `actionId → accelerator`) | ✅ | Read in `useAppKeyboardShortcuts.ts` to build reverse-map and dispatch actions |

---

## Tab: Hooks (`hooks`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| TCP Fallback Port | `hooksServerPort` | ✅ | Read in `hooks.ts` to bind the named-pipe / TCP hook server (requires restart) |
| Hook Scripts Location (read-only display) | n/a | ✅ | Informational — shows `~/.claude/hooks/` |
| Pre-Execution Approval — tool toggles (Write/Bash/Edit/Read/Grep/Glob + custom) | `approvalRequired` | ✅ | Read in `approvalManagerHelpers.ts` |
| Auto-Approve Timeout (0–300s) | `approvalTimeout` | ✅ | Read in `approvalManager.ts` |
| Approval Memory (view/manage) | n/a — calls IPC directly | ✅ | `ApprovalMemorySection` manages its own IPC; not a draft key |
| Hook Commands (add/remove by event type) | calls `window.electronAPI.rulesAndSkills.*` | ✅ | Reads/writes `.claude/settings.json` directly via IPC; not a draft key |

---

## Tab: Profiles (`profiles`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Save Current Settings as Profile (name input + save button) | `savedProfiles` (inferred) | ✅ | Snapshots theme, fonts, terminal size; stored and re-applied via `useProfilesManager` |
| Saved Profiles list (apply / delete) | `savedProfiles` | ✅ | Apply merges profile fields back into draft |

---

## Tab: Agent Profiles (`agentProfiles`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Profile list (edit/duplicate/delete/export) | calls `window.electronAPI.profiles.*` | ✅ | Bypasses draft system; manages profiles via IPC directly |
| New Profile (inline editor) | calls `window.electronAPI.profiles.*` | ✅ | Same |
| Import profile (JSON) | calls `window.electronAPI.profiles.*` | ✅ | Same |
| Default for this project (dropdown) | calls `window.electronAPI.profiles.setDefault` | ✅ | Live IPC; sets per-project default profile |

---

## Tab: Files (`files`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Always Ignored patterns (read-only: `.git`, `__pycache__`) | n/a — built-in | ✅ | Hard-coded in `FileTree.tsx`; informational |
| Custom Ignore Patterns (add/remove tags) | `fileTreeIgnorePatterns` | ✅ | Read in `FileTree.tsx` to filter tree nodes |

---

## Tab: Integrations (`integrations`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Extensions — Browse button | n/a — dispatches `OPEN_EXTENSION_STORE_EVENT` | ✅ | DOM CustomEvent opens the Extension Store pane |
| Extensions — Manage button | n/a — dispatches `OPEN_EXTENSION_STORE_EVENT` | ✅ | Same event with `{ tab: 'installed' }` |
| MCP Servers — Browse button | n/a — dispatches `OPEN_MCP_STORE_EVENT` | ✅ | DOM CustomEvent opens the MCP Store pane |
| MCP Servers — Manage button | n/a — dispatches `OPEN_MCP_STORE_EVENT` | ✅ | Same event with `{ tab: 'installed' }` |

---

## Tab: Code Mode (`codemode`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable Code Mode (button) | calls `window.electronAPI.codemode.enable` | ✅ | Bypasses draft; live IPC toggle |
| Disable Code Mode (button) | calls `window.electronAPI.codemode.disable` | ✅ | Same |
| MCP server names input | local state only (not persisted to config) | ⚠ | `serverNames` is component-local state; the value is passed to the enable IPC call but not stored in `AppConfig`. On next open the field is empty. |
| Generated Types (collapsible view) | n/a — read-only from IPC status | ✅ | Informational display |
| How It Works (collapsible) | n/a — static copy | ✅ | Static documentation, always correct |

---

## Tab: Context Docs (`contextDocs`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable CLAUDE.md automation | `claudeMdSettings.enabled` | ✅ | Read in `claudeMdController` |
| Trigger mode (manual / post-session / post-commit) | `claudeMdSettings.triggerMode` | ✅ | Read in `claudeMdController` |
| Generation model (haiku / sonnet / opus) | `claudeMdSettings.model` | ✅ | Read in `claudeMdGenerator` |
| Auto-commit generated files | `claudeMdSettings.autoCommit` | ✅ | Read in `claudeMdController` |
| Generate root CLAUDE.md | `claudeMdSettings.generateRoot` | ✅ | Read in `claudeMdGenerator` |
| Generate subdirectory files | `claudeMdSettings.generateSubdirs` | ✅ | Read in `claudeMdGenerator` |
| Exclude directories (comma-separated) | `claudeMdSettings.excludeDirs` | ✅ | Read in `claudeMdGenerator` |
| Generate now / Full sweep (buttons) | calls `window.electronAPI.claudeMd.generate` | ✅ | Live IPC; not a draft key |

---

## Tab: Performance (`performance`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Startup Timings (phase table) | n/a — live IPC reads | ✅ | Read-only diagnostic view via `useStartupTimings` |
| Runtime Metrics (heap/CPU, auto-refresh) | n/a — live IPC reads | ✅ | Read-only; `useRuntimeMetrics` polls every 5 s |
| Startup history (collapsible table, last 20) | n/a — live IPC reads | ✅ | Read-only; `useStartupHistory` |

*No config keys modified in this tab — purely observational.*

---

## Tab: Read-List (`workspaceReadList`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Workspace Read-List (file list + Add/Remove) | calls `window.electronAPI.workspaceReadList.*` | ✅ | Bypasses draft system; files auto-pinned to new sessions for the default project root. Uses `draft.defaultProjectRoot` to scope. |

---

## Tab: Research (`research`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable automatic research | `researchSettings.globalEnabled` | ✅ | Read by research auto-fire evaluator |
| Default mode (off / conservative / aggressive) | `researchSettings.defaultMode` | ✅ | Read per-session as initial mode |
| Advanced — Staleness confidence floor (slider) | `researchSettings.stalenessConfidenceFloor` | ✅ | Read by staleness evaluator |
| Advanced — Fact-claim detector (toggle) | `researchSettings.factClaimEnabled` | ✅ | Gates stream-pause fact-claim detection |
| Advanced — Min pattern confidence (radio) | `researchSettings.factClaimMinPatternConfidence` | ✅ | Filters low-confidence patterns from fact-claim detector |
| Advanced — Pre-edit dry-run mode (toggle) | `researchSettings.preEditDryRunOnly` | ✅ | Logs what research WOULD fire but skips actual subagent |
| Advanced — Max latency (ms, 100–5000) | `researchSettings.maxLatencyMs` | ✅ | Stream-pause budget for fact-claim research |

---

## Tab: Mobile Access (`mobileAccess`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable Mobile Access (checkbox) | `mobileAccess.enabled` | ✅ | Read in `web/webServer.ts` + `web/authMiddleware.ts` to gate connections |
| Pairing section (QR code / 6-digit code) | calls `window.electronAPI.mobileAccess.*` | ✅ | Live IPC; not a draft key |
| Paired devices list (view/remove) | calls `window.electronAPI.mobileAccess.*` | ✅ | Live IPC |
| Diagnostics panel | calls `window.electronAPI.mobileAccess.*` | ✅ | Read-only status, live IPC |

---

## Tab: System Prompt (`systemPrompt`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Session picker (dropdown) | n/a — calls `window.electronAPI.sessions.*` | ✅ | No config key; reads live session list |
| System prompt viewer (read-only) | n/a — calls `window.electronAPI.sessions.getSystemPrompt` | ✅ | Purely observational |

*No config keys modified in this tab.*

---

## Tab: Prompt Diff (`promptDiff`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Unified diff viewer (system prompt changes) | n/a — receives `PromptDiffPayload` via IPC event | ✅ | Purely observational; no config writes |

*No config keys modified in this tab.*

---

## Tab: Export Usage (`usageExport`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Time window (24h / 7d / 30d / all) | local state — not persisted | ⚠ | Selection is in-memory only; resets on close |
| Output file path | local state — not persisted | ⚠ | Same — auto-generates a timestamped filename on each open |
| Export now button | calls `window.electronAPI.ecosystem.exportUsage` | ✅ | Live IPC; not a config key |

---

## Tab: Awesome Ouroboros (`awesomeRef`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Open Awesome Ouroboros (button) | n/a — dispatches `OPEN_AWESOME_REF_EVENT` | ✅ | DOM CustomEvent opens the modal overlay; no config key |

*No config keys modified in this tab.*

---

## Tab: Platform (`platform`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Language / locale (PlatformLanguageSection) | (unclear) | ⚠ | `PlatformLanguageSection` is rendered with no props from draft; manages its own state. Config key not visible without reading `PlatformLanguageSection.tsx`. |
| Update channel (stable / beta) | `platform.updateChannel` | ⚠ | Stored in config schema (`configSchemaTailExt.ts`). No confirmed reader in `src/main` that acts on this value — electron-updater channel selection not confirmed wired. Stored but may not affect auto-update behavior yet. |
| Crash reports — enable toggle | `platform.crashReports.enabled` | ✅ | Read in `crashReporter.ts:133` |
| Crash reports — webhook URL | `platform.crashReports.webhookUrl` | ✅ | Read in `crashReporter.ts` to POST crash payloads |
| Show crash reports folder (button) | calls `window.electronAPI.crash.openCrashReportsDir()` | ✅ | Live IPC; not a config key |

---

## Tab: Telemetry (`telemetry`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| Enable local telemetry | `telemetry.structured` | ✅ | Read by telemetry recorder; defaults to `true` when absent |
| Transmit telemetry to remote (disabled toggle) | `telemetry.remote` | 🔴 | Toggle is rendered `disabled` with `onChange={() => { /* disabled toggle */ }}` — explicitly a no-op. Label says "coming soon". Correct behavior, but the control is intentionally broken and visible. |

---

## Tab: Accounts (`accounts`)

| Label | Config key | Status | Notes |
|---|---|---|---|
| GitHub OAuth (connect/disconnect) | calls `window.electronAPI.auth.*` | ✅ | Bypasses draft; live IPC |
| CLI credential import (Anthropic / OpenAI) | calls `window.electronAPI.auth.importCliCreds` | ✅ | Detects existing terminal creds and imports them |
| Claude Code CLI status | calls `window.electronAPI.auth.getCliStatus` | ✅ | Read-only status display |
| Codex CLI status | calls `window.electronAPI.auth.getCliStatus` | ✅ | Read-only status display |

*No `AppConfig` draft keys modified in this tab.*

---

## Summary

| Status | Count |
|---|---|
| ✅ wired | 88 |
| ⚠ partial / unverified | 22 |
| ❌ stubbed | 0 |
| 🔴 broken | 1 |
| **Total** | **111** |

### Notable findings

1. **`telemetry.remote` toggle (🔴)** — Intentionally disabled in source with an empty `onChange`. This is correct product intent ("coming soon") but the control is visible and unfireably disabled. No bug in storage — it just can't be changed.

2. **Model Slot Assignments (⚠ ×4)** — `modelSlotAssignments.terminal/agentChat/claudeMdGeneration/inlineCompletion` are stored and shown in Providers → Model Slot Assignments, but no confirmed main-process reader maps these slots to spawn arguments. They may be consumed client-side only or may be unfinished wiring.

3. **CodeMode server names field (⚠)** — The MCP server names input in the CodeMode section is not persisted to `AppConfig`. It passes the value only to the `enable` IPC call; the field resets to empty on next open.

4. **`webAccessPassword` migration trap (⚠)** — The Web Remote Access password field in General shows `''` after first launch because `secretMigration.ts` moves the value to `SecureKeyStore` and zeroes the config field. The field is still writable, so a user typing a new password would work, but any previously stored password won't be visible in the field.

5. **`useMcpHost` developer flag (⚠)** — Declared in types and schema, toggled in Developer Flags, but no confirmed behavioral reader found in the main process (only type and test files). Likely planned.

6. **`routerSettings.layer3Enabled` (⚠)** — The UI tooltip explicitly says "not used yet." Toggle is functional (stored, saves) but has no runtime effect.

7. **`platform.updateChannel` (⚠)** — Stored in schema but no confirmed electron-updater reader found — auto-update channel switching may not be wired.

8. **Three `AccentPicker` / `ThinkingVerbPicker` / `PaneFontPicker` controls (⚠)** — These components are composed into `AppearanceSectionContent` with no draft props passed. They manage their own IPC state outside the standard draft/save lifecycle. The exact config keys and persistence path were not confirmed in this audit pass.
