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

## Wave 2 — Security Hardening

Close the plaintext credential and unauthenticated endpoint gaps.

### Credential & Auth Gaps

- **#2 — Move API keys from electron-store to `safeStorage`** — `modelProviders[].apiKey`, `webAccessToken`, `webAccessPassword` are still stored as plaintext JSON in electron-store. Auth provider credentials (GitHub, Anthropic, OpenAI) correctly use `safeStorage`, but custom provider keys do not. Requires a new encrypted storage mechanism mirroring `credentialStore.ts`, plus migration of existing keys.
- **#5 — IDE tool server has no authentication** — `\\.\pipe\ouroboros-tools` (Win) / `/tmp/ouroboros-tools.sock` (Unix) accepts NDJSON from any local process. Needs a token-based auth scheme: generate on startup, inject into PTY env alongside the socket path. Design decision needed: random per-session token vs persistent token.

### Trust Boundaries

- **#109 — Workspace trust model** — Opening untrusted project folder runs all hooks/extensions with full permissions. No restricted mode.
- **#110 — MCP server sandboxing** — Any locally installed MCP server runs with full user permissions. VS Code has per-server file/network restrictions on macOS/Linux.

### Test Coverage (attach to Wave 2)

- **#90 — Extension sandbox** — Zero tests for `extensionsSandbox.ts` / `extensionsLifecycle.ts`.
- **#91 — Web server auth** — Zero tests for web server auth, rate limiting, WebSocket bridge.

---

## Wave 3 — SQLite & Process Architecture

The two biggest architectural debts — JSON graph and main-thread blocking.

### SQLite Infrastructure

- **#62 — No forward-migration framework for SQLite schemas** — Single `PRAGMA user_version` guard. No "run migrations 1 through N" loop. Will be a problem when post-release schema changes are needed. **Prerequisite for #60.**
- **#60 — Graph stored as JSON** — `graphStore.ts` uses JSON serialize/deserialize which is O(n) with no indexing. Should migrate to SQLite (infrastructure already exists via `better-sqlite3`). Major refactor — need to assess query patterns first.

### Main-Thread Unblocking

- **#61 — PTY runs in main process** — Heavy terminal output can block the Electron main thread. Should migrate to `utilityProcess.fork()` (VS Code uses a dedicated PtyHost). Major refactor.
- **#114 — Dedicated Pty Host process** — VS Code pattern. Prevents terminal output from blocking Electron main thread. Same deliverable as #61.
- **#58 — Extension sandbox uses Node `vm` (same-process, blocking)** — Should migrate to `utilityProcess.fork()` or a hidden BrowserWindow with restricted contextBridge. Long-running extensions block the main thread. `vm` is not a security boundary. Major refactor. Same `utilityProcess.fork()` pattern as #61.
- **#68 — Two parallel PTY batchers could drift** — `ptyElectronBatcher.ts` (Electron IPC) and `web/ptyBatcher.ts` (WebSocket) have identical logic but are separate implementations. Behavioral divergence over time is likely. Natural to unify when #61 restructures PTY.

### Test Coverage (attach to Wave 3)

- **#93 — PTY core** — Zero tests for `pty.ts`, `ptySpawn.ts`, `ptyAgent.ts` (requires native node-pty).

---

## Wave 4 — UI Architecture & Accessibility

Prop drilling, memoization, focus management, and the unified rendering initiative.

### AgentChat Performance

- **#71 — `AgentChatConversation` receives ~30 props** — Severe prop drilling. Should extract into a React context inside `AgentChatWorkspace` (or split into sub-contexts by concern: thread state, context state, model settings).
- **#73 — `buildModel` returns new reference every render** — Defeats downstream memoization. Should memoize the model object or split into stable sub-objects.

### Chat Rendering

- **#74 — Dual tool rendering paths in chat** — Streaming uses `AgentChatStreamingMessage`, persisted uses `AgentChatBlockRenderer`, with duplicated grouping logic. The "unified chat rendering" initiative targets this.

### Focus & Accessibility

- **#76 — Focus ring not implemented** — `focusRingStyle()` returns `{}`, `pfs()` is stubbed. Users have no visual indication of which panel has keyboard focus. Marked with TODO.
- **#87 — No skip-to-content links** — Standard web accessibility pattern missing.
- **#88 — No focus-visible styles beyond browser default** — No custom `:focus-visible` styles. Power users relying on keyboard can't see which element has focus.

### Renderer Cleanup

- **#77 — LSP diagnostics never reach file tree** — `fileTreeStore.updateDiagnostics` action exists with TODO comment but nothing calls it. LSP errors don't produce per-file badges.
- **#80 — `FileViewerManager.internal.ts` at 781 lines** — Single source of truth for tab management. Justified density but could be split into tab-state, dirty-tracking, and lifecycle concerns.

### Test Coverage (attach to Wave 4)

- **#92 — Window manager** — Zero tests for CSP installation, window creation, multi-window lifecycle.

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
