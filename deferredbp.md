# Deferred — Items Not Yet Addressed

Items identified during the April 2026 deep analysis, reorganized into implementation waves by shared code areas, dependencies, and natural synergies.

---

## Wave 1 — Multi-Root & Lifecycle Safety

Fix the things that break when users actually use multi-window, and eliminate process leaks.

### Multi-Root Initialization

- **#13 — Context layer only initialized for one project root** — `initContextLayer()` called once with `defaultProjectRoot`. Secondary windows with different project roots get no context enrichment. Needs architecture refactor: context layer controller must support multiple roots or reinitialize per-window.
- **#14 — Codebase graph only initialized for one project root** — Same as #13 but for the graph. `initCodebaseGraph()` called once. Needs `GraphController` to support multiple roots or reinitialize when primary workspace root changes.

### PTY Lifecycle

- **#18 — `scheduleStartupCommand` 100ms race condition** — Hardcoded `setTimeout(..., 100)` assumes the shell is ready. On slow machines, the command arrives before the shell initializes. Needs shell-ready detection (wait for first prompt output) instead of a fixed delay.
- **#24 — `stopClaudeUsagePoller` doesn't drain in-flight PTY** — On shutdown, if `pollOnce` is mid-execution, killing the interval doesn't kill the spawned PTY. Becomes an orphan process.

### Hooks Infrastructure

- **#20 — Named pipe vs TCP fallback is silent** — On Windows, if the named pipe is unavailable, hooks server silently falls back to TCP. Hook scripts installed with a hard-coded named pipe path won't connect.
- **#22 — `hookInstaller` version cache is process-scoped** — SHA-256 computed once and cached. Hook scripts changed on disk while the app runs aren't detected until restart.

### Test Coverage (attach to Wave 1)

- **#89 — Hooks dispatch/session-inference/suppression** — The critical dispatch path in `hooks.ts` has zero test coverage. Only 3 smoke tests exist.
- **#96 — `hooks.test.ts` mocks 13 modules** — Closer to a type-check than a behavioral test.

---

## Wave 2 — Security Hardening ✓ (v1.4.0)

Closed plaintext credential and unauthenticated endpoint gaps.

### Credential & Auth Gaps

- **#2 — ✓ Move API keys from electron-store to `safeStorage`** — `SecureKeyStore` module created (`src/main/auth/secureKeyStore.ts`). One-time startup migration (`secretMigration.ts`) moves `modelProviders[].apiKey`, `webAccessToken`, `webAccessPassword` to encrypted `secrets.enc`. `config:get` IPC now sanitizes sensitive keys. `config:export` exports masked values. Extension sandbox `config.get` returns masked API keys.
- **#5 — ✓ IDE tool server + hooks server authenticated** — Per-session 32-byte random tokens generated at startup (`pipeAuth.ts`). Both `ideToolServer.ts` and `hooksNet.ts` require `{"auth":"<token>"}` as the first NDJSON line. Tokens injected into PTY env as `OUROBOROS_TOOL_TOKEN` / `OUROBOROS_HOOKS_TOKEN`. All 17 hook scripts updated.

### Trust Boundaries

- **#109 — ✓ Minimal workspace trust gate** — `workspaceTrust.ts` provides binary trusted/restricted mode. Restricted mode disables hook installation and extension loading. Trust persisted in `trustedWorkspaces` config. IPC handlers registered for renderer prompt/response.
- **#110 — MCP server sandboxing** — **Deferred to Wave 3** — requires `utilityProcess.fork()` infrastructure (same as #58/#61).

### Test Coverage (attach to Wave 2)

- **#90 — ✓ Extension sandbox** — `extensionsSandbox.test.ts`: 21 tests covering permission gates, config masking, path validation, safe globals, console proxy.
- **#91 — ✓ Web server auth + WebSocket bridge** — `webAuth.test.ts`: 30 tests. `webSocketBridge.test.ts`: 29 tests. Covers token CRUD, rate limiting, JSON-RPC dispatch, binary encoding.

---

## Wave 3 — SQLite & Process Architecture ✓ (v1.3.5)

The two biggest architectural debts — JSON graph and main-thread blocking.

### SQLite Infrastructure

- **#62 — ✓ SQLite migration framework** — `storage/database.ts` provides WAL-mode primitives with `PRAGMA user_version` schema versioning. `storage/migrate.ts` runs one-time JSON→SQLite migrations for graph store, thread store, and cost history. Non-destructive (`.json.bak` on success).
- **#60 — ✓ Graph migrated to SQLite** — `graphStore.ts` rewritten with `better-sqlite3` (prepared statements, transactions, indexed queries). `graphStoreMemory.ts` kept for worker-thread scratch pad. `graphStoreTypes.ts` defines `IGraphStore` interface shared by both implementations.

### Main-Thread Unblocking

- **#61 / #114 — ✓ Dedicated PtyHost process** — `utilityProcessHost.ts` provides generic lifecycle wrapper around `utilityProcess.fork()` with typed IPC, request/response correlation, crash detection, and auto-restart. `ptyHost/` subtree implements spawn/write/resize/kill/getCwd/shellState via the host. Gated by `usePtyHost` config flag (default false). Crash recovery sends `pty:disconnected:${id}` with preserved scrollback.
- **#58 — ✓ ExtensionHost process** — `extensionHost/` subtree runs extension `vm` sandbox in a dedicated utility process. Supports activate/deactivate, config snapshot updates, files/terminal API calls relayed back to main, command registration, and crash recovery with automatic re-activation. Gated by `useExtensionHost` config flag.
- **#110 — ✓ MCP server sandboxing** — `mcpHost/` subtree runs the internal MCP HTTP/SSE server in a dedicated utility process. Tool list and tool call requests dispatched back to main via parentPort. Gated by `useMcpHost` config flag. (Deferred from Wave 2.)
- **#68 — ✓ PTY batchers unified** — `ptyBatcherCore.ts` provides a generic per-session 16ms batcher parameterized by transport. `ptyElectronBatcher.ts` and `web/ptyBatcher.ts` are now thin wrappers (~40 lines each) over the shared core. Behavioral drift eliminated.

### Test Coverage (attach to Wave 3)

- **#93 — ✓ PTY and host tests** — `pty.test.ts`, `utilityProcessHost.test.ts`, `ptyHostMain.test.ts`, `extensionHostMain.test.ts`, `extensionHostProxy.test.ts`, `mcpHostMain.test.ts`, `mcpHostProxy.test.ts` added. `TerminalDisconnectedBanner.test.tsx` covers the crash-recovery UI.

---

## Wave 4 — UI Architecture & Accessibility ✓ (v1.3.6)

Prop drilling, memoization, focus management, and the unified rendering initiative.

### AgentChat Performance

- **#71 — ✓ `AgentChatConversation` 51-prop interface eliminated** — Zustand store (`agentChatStore.ts`) with selector hooks replaces all prop threading. Per-workspace scoping via `AgentChatStoreContext`. Consumers use `useAgentChatThread()`, `useAgentChatActions()`, etc.
- **#73 — ✓ `buildModel` memoization automated** — React Compiler (`babel-plugin-react-compiler@1.0.0`) installed and wired into `electron.vite.config.ts`. Auto-memoizes all component/hook returns — eliminates the cascading re-render from `buildModel` and makes 1,177 manual `useMemo`/`useCallback` calls redundant (progressive removal is future work).

### Chat Rendering

- **#74 — ✓ Dual tool rendering paths unified** — `AgentChatStreamingMessage.tsx` deleted. All messages (streaming + persisted) render through `AssistantBlocksContent` in `AgentChatMessageComponents.messages.tsx` → `AgentChatBlockRenderer` → `AgentChatToolGroup`. Duplicated `TOOL_SUMMARIES`, `categorizeTools`, `buildRenderItems`, inline `ToolGroup` all removed. `react-markdown` replaced by Streamdown (`streamdown@2.5.0`) in `MessageMarkdown.tsx` for per-block memoization and streaming-aware rendering. `PendingStreamingView` simplified to `StreamingStatusMessage` (no longer wraps the deleted component).

### Focus & Accessibility

- **#76 — ✓ Focus ring implemented** — `focusRingStyle()` returns `boxShadow: inset 0 0 0 2px var(--interactive-focus)` for the focused panel. `pfs` in `AppLayout` wired to real implementation via `useFocusPanel()`.
- **#87 — ✓ Skip-to-content link added** — Visually hidden `<a href="#editor-main">Skip to editor</a>` as first child of `AppLayout`. Visible on Tab focus.
- **#88 — ✓ Focus-visible and accessibility media queries** — `prefers-reduced-motion: reduce` catch-all disables all animations/transitions. `prefers-contrast: more` increases focus ring to 3px white. Ctrl+1-4 now moves real DOM focus via `focusPanelElement()` with `data-panel` selectors on all four panel containers.

### Renderer Cleanup

- **#77 — ✓ LSP diagnostics wired to file tree** — `useLspDiagnosticsSync` hook subscribes to `lsp:diagnostics:push` IPC, computes worst severity, feeds `fileTreeStore.updateDiagnostics()`. Mounted in `InnerApp`. TODO comment removed.
- **#80 — Already resolved (pre-Wave 4)** — `FileViewerManager.internal.ts` is 286 lines after prior splits. No further action needed.

### Test Coverage (attach to Wave 4)

- **#92 — ✓ Window manager tests** — `windowManagerHelpers.test.ts` (23 tests) covers all pure helpers. `windowManager.test.ts` (43 tests) covers create/get/close/focus/persist/restore lifecycle with full mock infrastructure. Module-level state isolation via `vi.resetModules()`.

---

## Wave 5 — Competitive Feature Parity (Context & Completions)

The features every competitor ships — ghost text, @-mentions, semantic search.

### Context Injection

- **#100 — @-mention context injection in chat** — No `@file`, `@symbol`, `@folder`, `@web` injection in chat input. Table-stakes UX. Needs: autocomplete picker triggered by `@` keystroke, backed by file tree, LSP symbol index, graph search. Estimated: 1-2 weeks.
- **#102 — Semantic codebase search (vector embeddings)** — Graph engine does string-based search only. Cursor (14.7% context utilization), Windsurf, VS Code Copilot all do semantic similarity. Without embeddings, context injection relies on structural graph traversal which misses semantically similar but textually distant code. Estimated: 2-4 weeks.
- **#117 — Cross-session persistent embedding index** — No vector index persisted across sessions. Rebuilt from scratch each time. Without this, #102 rebuilds on every launch.
- **#65 — Budget enforcement is greedy** — Snippets accepted in score order until budget exhausts. One large file early in ranking crowds out many smaller relevant ones. Should consider size-aware allocation. Directly affects how #100/#102 results are packed.

### Inline Completions

- **#99 — Inline ghost text completion** — No tab-completion. Every major competitor (Cursor, Windsurf, VS Code Copilot, Zed) offers inline AI completions as ghost text. Needs: completion provider in CodeMirror/Monaco, fast inference endpoint, debounced trigger. `codemirror-ai` and `monacopilot` provide extension points. Estimated: 2-3 weeks.

---

## Wave 6 — Multi-Agent & Workflow

Background agents, parallel conflict detection, checkpoints, spec workflows.

### Agent Management

- **#103 — Background/async agent mode** — All sessions require a visible terminal window. For long-running tasks, async/fire-and-forget is the pattern developers want most. Queue headless Claude Code sessions, notify on completion via hooks. Estimated: 2-4 weeks.
- **#104 — Parallel agent conflict detection** — When two Claude Code sessions modify overlapping symbols, no warning. The codebase graph can detect this via blast-radius comparison. Estimated: 2-3 weeks. Depends on #103.

### Workflow Features

- **#107 — Session checkpoint/rewind** — No timeline of AI checkpoints to revert to. Git-backed snapshots with UI timeline. Estimated: 1-2 weeks.
- **#108 — Spec-driven workflow scaffolding** — Kiro's `requirements.md → design.md → tasks.md` pattern. Add a `/spec` command. Estimated: 1-2 weeks.

### Diff & Edit Visibility

- **#106 — Hunk-level diff accept/reject** — DiffReview appears to be whole-file accept/reject. Industry standard is per-hunk. Estimated: 1 week.
- **#116 — Streaming diff protocol for inline edits** — Zed implements token-by-token edit streaming. Shows edits as-they-happen in the editor.

### Test Coverage (attach to Wave 6)

- **#95 — E2E tests are smoke-only** — App launches, window dimensions, no uncaught exceptions. No regression coverage for agent launch, file ops, or chat.

---

## Standalone / Opportunistic Fixes

Items that don't naturally cluster. Pick off individually when touching nearby code.

| # | Item | When to address |
|---|------|-----------------|
| 19 | `claudeUsagePoller` brittle regex | When Claude CLI adds `--usage --json` |
| 21 | `enrichFromPermissionRequest` is a log stub | When enhancing approval UX |
| 25 | `getPtyCwd` stale on Windows/macOS | When #61 restructures PTY |
| 30 | `estimatedHistoryTokens` 3.5 chars/token heuristic | When calibration data shows it matters |
| 33 | Shadow routing training/serving distribution mismatch | When router accuracy is measured |
| 36 | `graphStore ingestTraces` tool returns a stub | When trace ingestion is actually needed |
| 64 | Title logic duplicated in two files | When touching either file |
| 59 | Approval response uses 500ms file polling | When hooks infrastructure is next revisited |
| 6 | Web mode `wsToken` is non-HttpOnly | When web deployment is prioritized |
| 112 | V8 snapshot for fast startup | After cold startup is measured |
| 113 | Route-based code splitting in renderer | After bundle analysis |
| 115 | Persistent terminal sessions across restarts | When #61 lands (PtyHost pattern enables this) |

## Standalone Test Fixes

| # | Item | Effort |
|---|------|--------|
| 97 | `retrainTrigger.test.ts` calls `findPython()` from system PATH | Pin Python path in CI — 15min fix |
| 98 | `better-sqlite3` ABI mismatch in tests | Document/automate `sqlite-fresh` setup — 30min fix |

---

## Items Requiring Runtime Measurement / Manual Testing

These need runtime profiling, manual testing, or tooling output — not code changes.

### Performance Measurements

- **Cold startup time** — No baseline. Target: <2.0s. Requires `perfMetrics.ts` instrumentation + Electron DevTools timeline.
- **Memory baseline (idle)** — Unknown. Target: <400MB. Requires Chrome DevTools heap snapshot.
- **Memory per terminal session** — Unknown. Target: <50MB. *(Feed into Wave 3 — confirms #61 priority.)*
- **Chat first-token display latency** — Unknown. Target: <300ms.
- **Graph full-index wall time** — Estimated 15-20s for 1,286 files. Needs measurement.
- **Graph JSON serialize/deserialize cost** — Theoretical O(n) bottleneck. Need to time on actual `.ouroboros/graph.json`. *(Feed into Wave 3 — confirms #60 priority.)*
- **Bundle size regression baseline** — No automated gate. Run `ANALYZE=true npm run build`.
- **Renderer re-render frequency** — React DevTools Profiler needed for AgentChatConversation and AgentMonitorManager. *(Feed into Wave 4 — confirms #71/#73 severity.)*
- **Approval response perceived latency** — Theoretical ~500ms from poll interval.

### Security (Need Active Testing)

- **Extension sandbox escape paths** — Need proof-of-concept extension testing `this.constructor.constructor('return process')()`.
- **Web mode full attack surface** — WebSocket auth, SPA token injection, rate limiting. Needs pen test.
- **CSP effectiveness in production** — Verify `onHeadersReceived` CSP overrides `index.html` meta tag (CSP is additive).

### Multi-Window Regression Testing

- **OAuth login in window 2+** — Fixed in code (`event.sender` instead of captured `win`). Needs manual verification.
- **Context layer per-window** — Confirmed limitation. Needs manual test with two different project roots.
- **Graph per-window** — Same as context layer.

### Dependency Analysis

- **`npm audit` output** — Need to run for known vulnerabilities.
- **xterm addon version alignment** — All `@xterm/*` use `^`. Need to verify compatible resolution.
- **`@anthropic-ai/sdk` usage verification** — May be types-only; needs grep confirmation.
- **pdfjs-dist bundle impact** — ~5-10MB. Verify lazy-loading.
- **Native addon rebuild consistency** — Verify Electron 41 ABI on all platforms.

### IPC Surface Area

- **Full 125-channel audit** — Only ~40 channels deeply analyzed. ~85 remain.
- **`claudeMd:*` handlers** — Verify path validation on CLAUDE.md generation.
- **`graphHandlers.ts`** — Verify no renderer-supplied path can redirect graph queries.

### Router Accuracy

- **Classifier accuracy metrics** — No precision/recall data. Evaluate against `router-decisions.jsonl`.
- **Retrain trigger safety** — Verify validation catches degraded weights. (Backup file now exists from Phase 1 fix.)

### Accessibility

- **Screen reader testing** — ARIA roles added in Phase 4 but not tested with NVDA/VoiceOver.
- **Keyboard-only navigation within panels** — Ctrl+1-4 works. Within-panel navigation unverified.
- **High contrast / reduced motion** — No `prefers-reduced-motion` or `prefers-contrast` support.
- **Large font / zoom behavior** — Verify at 150% and 200%.
