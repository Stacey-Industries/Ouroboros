# Ouroboros Dual-Mode & Auto-Research Roadmap

**Version:** 1.0 (draft)
**Drafted:** 2026-04-14
**Status:** Proposed — pending review
**Spans:** Wave 15 → Wave 26 (approximately v1.4 through v2.2)
**Current release:** v1.3.16 (Wave 14 — System 2 indexer revival + perf foundation)

---

## 1. Executive Summary

This roadmap plans the next twelve waves of Ouroboros development, spanning three interlocking arcs:

1. **Dual-mode UI** — a chat-primary layout alongside the existing IDE-primary layout, both views over the same state, with worktree-isolated parallel sessions.
2. **Auto-research** — automatic detection of when Claude's built-in knowledge is likely stale, dispatching a research subagent whose output is injected into the active session's context and whose effectiveness is measured by observed code outcomes.
3. **Mobile reach** — refinement of the existing web build into a genuine mobile-capable thin client, leveraging the already-functional `webPreload.ts` WebSocket shim, with a cross-device session dispatch capability as the final milestone.

The ordering is **foundation-first**. Instrumentation, the session primitive, and the layout preset engine all land before any user-visible "big reveal." Visible features are built on verified foundations. No quick wins; no feature flags hiding half-built work.

This document is descriptive, not prescriptive at the line level. Each wave's "Scope" section is concrete enough to brief a planning session; wave-specific design docs (in `plan/`) are expected to precede implementation.

---

## 2. Motivation & Context

### 2.1 The three pressures converging

**Meta-development constraint.** Ouroboros is edited from inside itself. An agent modifying the running IDE risks corrupting its own execution environment. Without per-session isolation, parallel agent work is serially blocked — the user currently queues two agents behind a third because they can't touch the shared working copy at the same time. Worktrees resolve this structurally.

**Competitive baseline shifted April 2026.** Anthropic's Claude Code Desktop redesign ships parallel sessions with automatic worktree isolation, a drag-and-drop pane layout (integrated terminal, file editor, diff, preview), side chats via `⌘+;`, session sidebar with filter/group/archive, view-mode calibration (Verbose/Normal/Summary), GitHub PR monitoring with auto-fix/auto-merge, cross-device Dispatch, scheduled routines on web infrastructure, and computer use on macOS/Windows. The "orchestrator seat" framing is explicit in the launch materials. This is now the category floor. Ouroboros's per-window isolation is architecturally analogous but weaker (no worktrees, no drag-and-drop, no session sidebar, no side chats).

**Model knowledge freshness gap.** Neither Claude Code Desktop nor Cursor nor Windsurf automatically detects when Claude's training-data view of a library is out of date relative to what the current codebase actually imports. This gap widens every month past the training cutoff and is felt most acutely in delegation-heavy workflows — where the user doesn't turn-by-turn validate output. Auto-research is the concrete differentiator that also compounds Ouroboros's other advantages (PTY ownership, hooks, codebase graph).

### 2.2 What Ouroboros keeps

The audit confirms several differentiators that no shipping competitor matches:

- **Hooks as first-class events** — 24 event types carrying tool-use, agent lifecycle, session lifecycle, workspace, and conversation data, dispatched in-process to the renderer. Claude Code Desktop's Verbose/Normal/Summary view modes are a strictly weaker surface.
- **Codebase-memory graph** — 1.4K nodes, 2.3K edges, SQLite-backed, auto-synced. No competitor ships this.
- **PTY ownership** — direct control over the agent's execution shell, with exit-code observability. This is the unlock for outcome-correlated telemetry.
- **The meta-development context itself** — Ouroboros is both the tool and the thing being built with it. Claude Code Desktop can never be this.

### 2.3 What Ouroboros does not try to match

- **Dispatch on Anthropic's cloud infra.** Out of scope; requires infrastructure Ouroboros does not own. A phone-to-desktop variant appears in Wave 25 but targets the user's own desktop instance, not cloud.
- **Scheduled routines on web backend.** Same reason.
- **Computer use.** Out of scope — orthogonal to the dual-mode/research arc.

---

## 3. Guiding Principles

1. **Foundation before features.** Instrumentation precedes research. Session primitive precedes sidebar UI. Layout preset engine precedes chat-primary layout. A wave that builds on a rotten foundation ships twice.
2. **Instrument first, automate later.** The router's deterministic-→-classifier-→-LLM progression worked because it was grounded in a 1,558-prompt labeling run. Auto-research follows the same discipline: explicit pipeline with outcome tracking in Wave 20, automated triggering only in Wave 21 after real telemetry.
3. **One state layer, two presets.** The dual-mode view is not two products. Chat-primary and IDE-primary are two layouts over the same `Session`, the same `Conversation`, the same `PTY`, the same `CodebaseGraph`. Implemented correctly, switching modes is a layout preset change.
4. **Amplify, don't throttle.** Feature decisions preserve the model's full capability surface. Research augments context; it never gates it. View modes calibrate transparency; they never hide agent actions from the user who wants to see them.
5. **Dogfood before shipping.** Every wave spends at least one week in the author's own working environment before release. Dual-mode in particular needs felt-workflow data, not theoretical design.
6. **ESLint discipline carries forward.** `max-lines-per-function: 40`, `max-lines: 300`, `complexity: 10`, `max-depth: 3`, `max-params: 4`. No wave relaxes these. Modules are split along natural seams; the nine-file `chatOrchestrationBridge*.ts` pattern is the precedent.
7. **Mobile-ready constraints bake in from Wave 17.** Every new layout decision considers narrow-viewport, touch-target, and no-hover-dependent-UI constraints from the start. Retrofitting mobile later is painful; baking in early is cheap.

---

## 4. Target Architecture (End State)

After Wave 26, the Ouroboros architecture is:

### 4.1 Core primitives

```
Session
 ├─ id, createdAt, archivedAt, lastUsedAt
 ├─ projectRoot (user-selected)
 ├─ worktreePath (isolated copy under .ouroboros/worktrees/<id>)
 ├─ conversation (thread + side-chat branches)
 ├─ layoutPreset ('chat-primary' | 'ide-primary' | named custom)
 ├─ activeTerminals[] (PTY session IDs)
 ├─ pinnedContext[] (research artifacts, user-pinned files)
 └─ telemetry (correlation IDs, outcome signals, research hits)

Window  (one or many; formerly carried session state)
 ├─ bounds, displayId
 └─ activeSessionId  (a window hosts one session at a time)
```

A window is now a *viewport onto a session*, not the session itself. Multiple windows can host the same session (read-only mirror) or different sessions. Sessions can exist without a window (background / queued).

### 4.2 Rendering

```
AppLayout.tsx  (slot shell — unchanged conceptually)
 └─ LayoutPresetResolver  (Wave 17)
     ├─ 'ide-primary'   → current slot populations
     ├─ 'chat-primary'  → chat in editorContent slot, session sidebar in leftSidebar
     └─ 'mobile'        → single-slot responsive, bottom nav
```

The six existing slots (`sidebarHeader`, `sidebarContent`, `editorTabBar`, `editorContent`, `agentCards`, `terminalContent`) stay. Presets decide which components populate which slots and how panels resize/collapse. The `WorkspaceLayout` preset concept already present in `LayoutSwitcher` is the substrate.

### 4.3 Research pipeline

```
User prompt → PreResearch Trigger Evaluator
                ├─ Rule layer  (package.json staleness, import analysis, slash commands, user toggle)
                ├─ Cache check (SQLite-backed, TTL per library)
                └─ (optional, Wave 26) Classifier / Haiku fallback

  → ResearchSubagent  (forked context, own tool suite: Context7, Ref, GitMCP, web search)
  → ResearchArtifact  (pinned to Session.pinnedContext, visible in chat UI)
  → Main agent turn proceeds with artifact in context

PostTurn: Outcome observer
  ├─ Next terminal exit code
  ├─ Typecheck failures
  ├─ Test run results
  └─ User-correction signals
  → correlated to research invocation; feeds Wave 21 trigger tuning
```

### 4.4 Mobile

A mobile companion app (Wave 24) runs the same renderer bundled via Capacitor or Tauri Mobile (choice deferred). It connects to a desktop Ouroboros instance over the existing `webPreload.ts` WebSocket transport, hardened for remote use. Wave 25 adds cross-device session dispatch.

### 4.5 Instrumentation

A new `telemetry.db` SQLite store (sibling of `graph.db` and `threads.db`) captures:

- Structured hook events (extending existing `HookPayload` schema, now persisted)
- Tool-use ↔ terminal exit code correlation
- Research invocations with outcome linkage
- Layout preset changes and session transitions

The existing `router-decisions.jsonl` / `router-quality-signals.jsonl` pattern is the precedent for append-only event logs.

---

## 5. Current State Snapshot

Grounded from the architecture audit. Full references in Appendix B.

| Area | Current state | Gap addressed by |
|---|---|---|
| Window ↔ Session | `ManagedWindow` at `src/main/windowManager.ts:33-38` conflates window with session. Per-window roots persisted in `windowSessions` config key. | Wave 16 |
| Layout | `AppLayoutSlots` at `src/renderer/components/Layout/AppLayout.tsx:19-26` — 6 named slots, already slot-based. `WorkspaceLayout` preset + `LayoutSwitcher` exists but covers panel sizes only, not slot population swaps. | Wave 17 |
| Chat orchestration | `AgentChatOrchestrationBridge` at `src/main/agentChat/chatOrchestrationBridge*.ts` — 9-file unit. `AgentChatThreadStore` has `branchThread` but it is a full copy (expensive). | Wave 19 |
| Hooks | 24 event types at `src/main/hooks/hooksLifecycleHandlers.ts:52-88`. `HookPayload` at `src/main/hooks.ts:39-70` carries rich data. **Not persisted.** Only downstream correlation is `tapConflictMonitor`. | Wave 15 |
| Web build | `src/web/webPreload.ts` fully shims `window.electronAPI` over WebSocket (JSON-RPC 2.0, 30s timeout). Web mode is **functionally usable** as a browser client, not just a build target. | Wave 23, 24 |
| Git | `src/main/ipc-handlers/git.ts` — ~25 channels, shells out to `git` CLI. `claudeCliSettings.worktree: boolean` at `configSchema.ts:198` passes `--worktree` to Claude CLI. **IDE does not create/manage worktrees itself.** `worktree_create`/`worktree_remove` hook types exist. Checkpoint refs at `refs/ouroboros/checkpoints/{threadId}` (`chatOrchestrationBridgeGit.ts:33-60`). | Wave 16 |
| Telemetry | Startup perf timing (`perfMetrics.ts:34-43`), router decisions JSONL, no hook/outcome persistence. `IndexerCompletedPayload` emitter exists but is **unwired dead code** (`perfMetrics.ts:179-197`). | Wave 15 |
| Mobile | `MobileNavBar` exists, CSS-hidden in Electron, visible in web mode. No touch-target audit, no responsive layout work. | Wave 23 |

**Known tech debt not addressed by this roadmap** (tracked separately in `CLAUDE.md`):
- Double terminal tab bar (TerminalPane + TerminalManager)
- Settings modal inline in `App.tsx` rather than `components/Settings/`
- `internalMcp/` module implemented but not wired into `main.ts` startup
- `streamingInlineEdit` feature flag unremoved post-soak

These should be cleaned up opportunistically when a wave touches the affected code, not as dedicated work.

---

## 6. Dependency Graph

```
Wave 15 — Instrumentation
    │
    ├─► Wave 16 — Session Primitive & Worktrees ──┐
    │                                              │
    ├─► Wave 17 — Layout Preset Engine ────────┐  │
    │                                           ▼  ▼
    │                       Wave 18 — Chat-Primary + Session Sidebar
    │                                           │
    │                                           ├─► Wave 19 — Side Chats
    │                                           │
    │                                           ├─► Wave 21 — AgentMonitor Integration (lands in 18, refined later)
    │                                           │
    │                                           └─► Wave 22 — Drag-and-Drop Panes
    │
    └─► Wave 20 — Research Explicit Pipeline
                  │
                  ├─► Wave 21 — Research Auto-Firing (depends on 20 telemetry soak ≥4 wks)
                  │
                  └─► Wave 26 — Research Classifier (contingent on 21 telemetry)

Wave 17 ──► Wave 23 — Mobile-Responsive Refinement
              │
              └─► Wave 24 — Mobile Shell & Client-Server Hardening
                           │
                           └─► Wave 25 — Cross-Device Session Dispatch
```

**Critical path:** 15 → 16 → 17 → 18. Every user-visible dual-mode feature depends on this chain. Wave 20 (research) is parallel to the dual-mode chain and can land earlier if implementation capacity allows.

---

## 7. Wave Plan

### Wave 15 — Instrumentation Foundation

**Target release:** v1.3.17 (patch — foundational, no user-visible UI change beyond an opt-in diagnostics panel)
**Dependencies:** None
**Feature flag:** `telemetry.structured` (default on in dev, opt-in in production for the first release cycle)

#### Goal
Establish a structured, persisted event stream that correlates agent tool use with observed outcomes (terminal exit codes, typecheck/lint/test results). No downstream wave can measure success without this.

#### Motivation
The hook infrastructure already captures 24 event types with rich payloads but dispatches them only to the renderer via in-memory IPC. There is no persistence, no correlation between a `pre_tool_use` and the terminal exit code that follows, no outcome tracking for Wave 20's research quality measurement. The router's JSONL decision log is the only existing event persistence pattern. Wave 15 generalizes that pattern.

#### Scope
- New `src/main/telemetry/telemetryStore.ts` backed by a new SQLite database `telemetry.db` (sibling of `graph.db`). Tables:
  - `events(id PK, type, session_id, correlation_id, timestamp, payload JSON)`
  - `outcomes(event_id FK, kind, exit_code, duration_ms, stderr_hash, signals JSON)`
  - `research_invocations(id PK, session_id, trigger_reason, topics JSON, artifact_hash, hit_cache BOOL, latency_ms)` (populated starting in Wave 20)
- Extend `HookPayload` in `src/main/hooks.ts` with a `correlationId` field (UUID v7 for temporal sortability). Emission side in `hooks.ts:143` gains a `telemetryStore.record()` call.
- New `OutcomeObserver` in `src/main/telemetry/outcomeObserver.ts`. Subscribes to PTY exit events (from `src/main/pty.ts`), to `conflictMonitor` signals, and (via a debounced tick) to typecheck / lint / test runner artifacts under `.ouroboros/outcomes/` if present. Correlates to the most recent `post_tool_use` for the same session/cwd within a configurable window (default 30s).
- Diagnostics panel in the Settings modal showing last N events and correlations. Developer-facing initially; becomes the basis for user-visible "session history" in later waves.
- Append-only JSONL mirror at `{userData}/telemetry/events-YYYY-MM-DD.jsonl` for out-of-band analysis (matches router convention). Rotated daily, retained 30 days.

#### Non-scope
- No behavioral changes to hook emission itself — purely additive persistence.
- No UI beyond developer diagnostics panel (user-facing session history surfaces in Wave 18).
- No research-specific telemetry shape — that arrives with Wave 20.

#### Key file touch points
- `src/main/hooks.ts` — add `correlationId` to `HookPayload`, wire telemetry store
- `src/main/pty.ts` — emit structured exit events on process termination
- `src/main/main.ts` / `mainStartup.ts` — initialize `telemetryStore` in service-ready phase
- `src/main/telemetry/*` — new module
- `src/preload/preload.ts` — expose `telemetry:*` IPC for the diagnostics panel

#### Acceptance criteria
- Every hook event within a session is persisted to `telemetry.db` with a unique `correlationId`.
- Every terminal exit (success or failure) is captured as an `outcome` row linkable to the `post_tool_use` that triggered it, when such linkage exists.
- The diagnostics panel renders the last 100 events for the active session with correlation lines drawn.
- No measurable startup regression (budget: < 50ms added to service-ready phase).
- JSONL mirror files exist and are parseable externally.

#### Testing
- Unit: `telemetryStore` CRUD, correlation resolver, retention policy.
- Integration: hook emission → store write → diagnostics panel read.
- Soak: one week in author's own environment with structured query validation.

#### Risks
- **SQLite write contention** — hook events can burst during agent tool calls. Mitigation: WAL mode, batched writes with 100ms flush window.
- **Disk growth** — 30-day retention + JSONL mirror could grow fast. Mitigation: size cap per file (10 MB) with rotation, and a configurable purge policy visible in Settings.
- **Correlation false positives** — OutcomeObserver may attribute an exit to the wrong tool call in rapid-fire sessions. Mitigation: correlation window is per-session, and a "confidence" score is stored (exact timestamp match = high, window match = medium).

#### Exit criteria
- One author-week dogfood with < 1 correlation error observed in review.
- Diagnostics panel responsive on sessions with 10K+ events.
- Schema stable enough to build Wave 16 session attribution on top without migration.

---

### Wave 16 — Session Primitive & Worktree Isolation

**Target release:** v1.4.0 (minor — first user-visible parallel capability)
**Dependencies:** Wave 15
**Feature flag:** `sessions.worktreePerSession` (default off for one release cycle, then default on)

#### Goal
Extract a `Session` abstraction from `ManagedWindow`. Give each session an isolated git worktree under `.ouroboros/worktrees/<id>/`. Unblock parallel agent work on the same project without working-copy collisions.

#### Motivation
Today the author queues two agents behind a third because the shared working copy prevents parallel execution. Worktrees solve this structurally — each session gets a full working-copy clone tied to the same git repo, with changes isolated until merge. Claude Code Desktop's `.claude/worktrees/<id>` pattern is the reference; Ouroboros's `refs/ouroboros/checkpoints/{threadId}` already hints at per-thread git state.

#### Scope
- New `src/main/session/session.ts` module defining the `Session` primitive listed in §4.1. Serialized to `electron-store` under a new `sessions` key (migrated from `windowSessions`).
- New `src/main/session/worktreeManager.ts` wrapping `git worktree add/list/remove`. Worktrees created under `${projectRoot}/../.ouroboros/worktrees/<session-id>/` to avoid polluting the project directory.
- `ManagedWindow` refactored to hold `activeSessionId: string` instead of `projectRoot`/`projectRoots` directly. `windowManager.ts:33-38` loses those fields; session lookup goes through the new session store.
- Migration path: existing `windowSessions` entries are converted to `Session` records on first launch of v1.4. The first conversion does **not** create a worktree (worktrees are opt-in per session), preserving the behavior of "this window operates on the real working copy."
- `claudeCliSettings.worktree: boolean` at `configSchema.ts:198` becomes per-session rather than global. The CLI flag is resolved from the active session's config, not global settings.
- Session lifecycle hooks: `session.created`, `session.activated`, `session.archived`. Persisted through Wave 15 telemetry.
- Background-session capability: a session can exist without a window (queued but not yet visible). This is the primitive Wave 18's sidebar queues on top of.
- Git checkpoint integration: `chatOrchestrationBridgeGit.ts:33-60` continues to write `refs/ouroboros/checkpoints/{threadId}`, now scoped per session's worktree.

#### Non-scope
- **Session sidebar UI** — that lands in Wave 18. Wave 16 exposes sessions via the existing window-creation flow and a command-palette entry only.
- **Cross-session merge / rebase UX** — merging a session's worktree back to the main branch is a manual `git` operation for now. Wave 22 or a later refinement may add UI.
- **Worktree garbage collection for deleted sessions** — a weekly lazy-GC task is scoped in Wave 18; Wave 16 ships with manual cleanup only and a warning if > 20 worktrees exist.

#### Key file touch points
- `src/main/windowManager.ts` — refactor `ManagedWindow`, add session ID field, remove `projectRoot`/`projectRoots`
- `src/main/config.ts` / `configSchema.ts` — new `sessions` key, migration from `windowSessions`
- `src/main/session/*` — new module
- `src/main/ipc-handlers/git.ts` — add worktree IPC channels (`git:worktreeAdd`, `git:worktreeRemove`, `git:worktreeList`)
- `src/main/pty.ts` — `spawnClaude` resolves `cwd` from session worktree, not global project root
- `src/main/codebaseGraph/graphController.ts` — graph state keyed by session ID, not project root alone (since multiple sessions may share a project root but have different working states)

#### Acceptance criteria
- Three sessions can run concurrent agent turns on the same git repo without any working-copy collision or lock error.
- Each session's terminal `pwd` resolves to its worktree, not the shared project root.
- Existing window layouts and project-root persistence survive the migration without user intervention.
- Creating, activating, and archiving a session emits the expected telemetry events.
- Worktrees are cleaned up on session archive (when feature-flag enabled; otherwise warned about).
- `git worktree list` from the terminal in any session shows all active worktrees, confirming the real git layer owns the isolation.

#### Testing
- Unit: `worktreeManager` add/remove/list, session store CRUD, migration from `windowSessions`.
- Integration: spawn two sessions on the same project, both run `npm test` concurrently — both succeed, neither sees the other's file modifications.
- Integration: kill Ouroboros mid-session — on relaunch, session state is restored without orphaned worktrees.
- Manual: one author-week dogfood running 3+ parallel sessions on this repo.

#### Risks
- **Disk usage** — a worktree is a full checkout. With 20+ sessions, disk impact on this repo (~500 MB checkout) is ~10 GB. Mitigation: sessions default to a single shared worktree (the current behavior) and opt in per-session for isolation; warn on creation if free disk < 5 GB.
- **node_modules** — each worktree is a separate directory, so `npm install` runs separately. Mitigation: document that `pnpm`'s store-based model is preferred for multi-worktree setups; for npm, recommend `npm ci` or document the trade-off.
- **Native module rebuilds** — electron-rebuild artifacts differ per-worktree. Mitigation: worktree manager detects if the main working copy has `node_modules/` and offers to symlink for read-only access (opt-in, with clear warning).
- **Graph indexer cost** — indexing N worktrees multiplies work. Mitigation: graph state keyed by `(projectRoot, worktreeHash)`; identical working copies share graph state via content hash.
- **Migration regression** — existing users' window layouts could break. Mitigation: migration is single-direction (v1.4 reads old `windowSessions`, writes new `sessions`; old key retained read-only as fallback for 2 releases).

#### Exit criteria
- Dogfood: author runs 3+ parallel agent sessions on Ouroboros itself for one week without collision or data loss.
- Migration validated on at least 3 users' pre-existing config files (dev, dev backup, clean install).
- Wave 15 telemetry confirms session lifecycle events fire correctly in realistic use.

---

### Wave 17 — Layout Preset Engine

**Target release:** v1.4.1 (patch — rendering refactor, minimal user-facing change)
**Dependencies:** Wave 16 (sessions are the unit that carries layout preferences)
**Feature flag:** `layout.presets.v2` (default off until Wave 18 is ready)

#### Goal
Formalize `WorkspaceLayout` into a first-class preset engine capable of swapping slot population, panel sizing, and visibility atomically. This is the substrate for chat-primary, IDE-primary, and (Wave 23) mobile presets, and for user-defined custom presets.

#### Motivation
The audit confirms a preset concept exists — `WorkspaceLayout` + `LayoutSwitcher` save and apply named panel-size + visibility configurations. But that preset concept operates only over sizes and visibility, not over *which components populate which slots*. Chat-primary needs the chat component to inhabit `editorContent` while `AgentCards` moves to a collapsible right drawer. That's a slot-population swap, which the current system cannot express.

#### Scope
- New `src/renderer/components/Layout/layoutPresets/` module. Presets are typed objects:
  ```ts
  type LayoutPreset = {
    id: string;
    name: string;
    slots: Partial<Record<SlotName, ComponentDescriptor>>;
    panelSizes: Partial<Record<PanelId, number>>;
    visiblePanels: Partial<Record<PanelId, boolean>>;
    breakpoints?: ResponsiveRules;
  };
  ```
- Three built-in presets: `ide-primary` (current default), `chat-primary` (Wave 18), `mobile-primary` (Wave 23; scaffold only in Wave 17).
- `LayoutPresetResolver` — a React context provider that reads the active session's preset and resolves slot components, sizes, and visibility. Replaces the direct `AppLayoutSlots` consumers with resolver-driven rendering.
- Preset persistence per session (via Wave 16 `Session` record). Global default preset in Settings.
- Migration: existing users land on `ide-primary` preset matching their current layout. Panel sizes in `localStorage` `agent-ide:panel-sizes` are migrated into the user's `ide-primary` preset copy.
- `LayoutSwitcher` in the status bar becomes the preset switcher. The current "Save current layout as…" UX becomes "Create custom preset based on…".
- **Responsive breakpoints scaffolding** — each preset declares a minimum viewport width; below it, a fallback preset is used (`mobile-primary` falls back to single-slot stacked layout). Wave 23 populates rules; Wave 17 ships with no-op rules for desktop presets.

#### Non-scope
- Drag-and-drop rearrangement — Wave 22.
- Full mobile preset implementation — Wave 23.
- Per-pane custom components (user-authored panes) — out of scope for this roadmap.
- The existing `display:none` trick for chat state preservation (`AppLayout.tsx:308`) stays; the resolver honors it.

#### Key file touch points
- `src/renderer/components/Layout/AppLayout.tsx` — inject `LayoutPresetResolver`, slot consumers read through it
- `src/renderer/components/Layout/layoutPresets/*` — new module
- `src/renderer/hooks/useResizable.ts` and `usePanelCollapse.ts` — consume resolver for defaults
- `src/renderer/components/StatusBar/LayoutSwitcher.tsx` — adapt to preset-based switching
- `src/main/session/session.ts` — add `layoutPresetId` field
- `src/renderer/types/electron.d.ts` — expand session type

#### Acceptance criteria
- Existing users experience no visible layout change on upgrade; their configuration migrates to `ide-primary` identically.
- Switching to a second built-in preset (a dev-only `debug-primary` for validation) demonstrates slot-population swap working.
- Streaming chat state survives preset switches (the `display:none` invariant holds across resolver re-renders).
- Panel sizes persist per session and per preset (e.g., chat-primary can have a different sidebar width than ide-primary).
- Per-session preset selection survives app restart.

#### Testing
- Unit: preset resolver slot resolution, panel-size layering (preset default + session override), migration from legacy `panelSizes`.
- Integration: preset switch during active chat streaming — chat does not flicker or lose state.
- Integration: two sessions with different presets in different windows — each window renders its session's preset correctly.
- Snapshot: render each preset in isolation and diff against fixture HTML to catch unintended slot-population changes.

#### Risks
- **Preset churn during streaming** — swapping slot components mid-stream could break React reconciliation. Mitigation: resolver uses stable component keys; streaming chat is specifically protected via the existing `display:none` pattern which the resolver preserves.
- **User layout loss on migration** — incorrect migration could reset users to defaults. Mitigation: migration is idempotent, original `panelSizes` `localStorage` key is preserved as fallback for one release.
- **Custom preset sprawl** — users could create dozens of custom presets, cluttering the switcher. Mitigation: switcher shows most-recent-5 by default, full list in a sub-menu.

#### Exit criteria
- Author-week dogfood with `ide-primary` preset confirming zero regressions.
- Dev-only `debug-primary` preset demonstrates slot-population swap in a controlled test.
- Wave 18 implementation work can begin without further refactoring of the slot system.

---

### Wave 18 — Chat-Primary Layout & Session Sidebar

**Target release:** v1.5.0 (minor — major new view mode, "dual mode" becomes real)
**Dependencies:** Wave 16 (sessions), Wave 17 (preset engine)
**Feature flag:** `layout.chatPrimary` (default off at release; opt-in via command palette; default on after 2 weeks of dogfood)

#### Goal
Make chat-primary the Ouroboros-equivalent of Claude Code Desktop's Code tab — a view where the chat is the central surface, the session sidebar lists parallel work, and IDE capabilities (terminal, file editor, diff, preview) are available as collapsible side panes rather than always-on.

#### Motivation
This is the user-visible payoff for Waves 15–17. The dual-mode view is the single most-requested UX evolution and the Claude Code Desktop redesign confirms the category direction. The sidebar over Wave 16's session primitive turns parallel worktrees from "a thing that exists" into "a thing I can see and drive."

#### Scope

**The chat-primary preset (layout side):**
- `chat-primary` preset definition — chat in `editorContent`, session sidebar in `sidebarContent`, `AgentCards` in a collapsible right drawer (`display:none` preserved), terminal in `terminalContent` (collapsible), file editor available via a secondary tab alongside chat.
- Keyboard shortcut `Ctrl+Shift+L` / `⌘+Shift+L` to toggle between `ide-primary` and `chat-primary` for the active session.
- Command palette entries: "Switch to Chat-Primary Layout," "Switch to IDE-Primary Layout."

**Session sidebar UI:**
- New `src/renderer/components/SessionSidebar/` component tree.
- Lists all sessions, grouped by project root by default.
- Filters: status (active / archived / queued / errored), project, worktree state (clean / dirty).
- Auto-archive: sessions closed for > 7 days auto-archive; sessions whose PR merged auto-archive (via Wave 15 telemetry linkage — deferred to after Wave 20 if PR monitoring lands there).
- Create-new-session button → opens project picker, optionally selects "use worktree" toggle (defaults on if Wave 16 feature flag is on).
- Session switching preserves the target session's preset.
- Worktree garbage collection: on session archive, the worktree is removed (with a 7-day grace period via a `.trash/` folder in case of accidental archive).

**AgentMonitor integration:**
- Default: AgentMonitor / agent cards render as a collapsible right drawer, like Claude Code Desktop's Verbose/Normal/Summary mode but with Ouroboros's richer event data.
- User opt-in: per-session setting for "surface selected event types inline in chat," with a curated default list (`pre_tool_use` for edit/write, `post_tool_use_failure`, `user_prompt_submit`, `notification`). Noisy event types (`file_changed`, `cwd_changed`) default to drawer-only.
- View modes: Verbose (all events), Normal (tool calls + failures + errors), Summary (results only). Wired to Wave 15 telemetry so view-mode preference is captured.

#### Non-scope
- Side chats — Wave 19.
- Drag-and-drop pane rearrangement — Wave 22.
- Mobile-specific chat-primary adjustments — Wave 23.
- PR monitoring / auto-archive via merge signal — deferred until/if it makes sense alongside Wave 20.

#### Key file touch points
- `src/renderer/components/SessionSidebar/*` — new module
- `src/renderer/components/Layout/layoutPresets/chatPrimary.ts` — new preset definition
- `src/renderer/components/AgentChat/*` — split rendering for chat-primary (center) vs ide-primary (sidebar) rendering paths. May require extracting a `ChatView` primitive that both presets consume.
- `src/renderer/components/AgentMonitor/` — add view-mode selector, inline-event opt-in setting
- `src/main/session/session.ts` — add `agentMonitorSettings` sub-record

#### Acceptance criteria
- Toggling `⌘+Shift+L` swaps layouts cleanly; active streaming chat is uninterrupted.
- Three+ sessions visible in sidebar, each showing correct status, project, worktree state.
- Creating a new session via sidebar produces a working session with a worktree when the flag is on.
- AgentMonitor drawer toggles open/closed; inline events appear in chat per user settings.
- View mode switching updates visible event density without losing history.
- Keyboard navigation: session sidebar fully keyboard-accessible (Tab, Arrow keys, Enter to switch).

#### Testing
- Integration: create 3 sessions, switch between them, verify each's terminal/chat/file state is isolated.
- Integration: stream a chat in session A, switch to session B, switch back — stream state preserved.
- Accessibility: screen-reader announcements for sidebar, focus management on session switch.
- Manual: 2-week author dogfood comparing IDE-primary vs chat-primary for typical workflows.

#### Risks
- **Muscle memory break** — user's existing IDE-primary workflow may be disrupted by a wholesale UI shift even if opt-in. Mitigation: chat-primary is off by default for 2 weeks; switch is one-click reversible.
- **AgentMonitor noise overwhelms chat** — inline events may make the chat unreadable. Mitigation: opt-in per event type with curated safe defaults; escape hatch via view-mode switcher.
- **Session sidebar performance** — with 50+ sessions, the sidebar needs virtualized rendering. Mitigation: virtualize at > 20 sessions, matching existing virtualized message list patterns.
- **Worktree garbage collection edge cases** — a session archive that accidentally deletes uncommitted work in the worktree would be a disaster. Mitigation: 7-day `.trash/` grace period, one-click restore from sidebar, explicit confirmation if worktree has uncommitted changes.

#### Exit criteria
- Two-week author dogfood with chat-primary as daily driver, documented pros and cons.
- Feature flag default flipped to on after dogfood if no regressions observed.
- User-visible docs (`docs/` update) describing both layouts.

---

### Wave 19 — Side Chats & Conversation Forking

**Target release:** v1.5.1 (patch)
**Dependencies:** Wave 18 (chat UI is the surface for side chats)
**Feature flag:** `chat.sideChats` (default on — low-risk additive feature)

#### Goal
Implement side chats matching Claude Code Desktop's `⌘+;` pattern: a branched conversation that does not pollute the main thread's context, with an explicit "merge into main" action if the branch's output should flow back.

#### Motivation
The "quick question without derailing the session" pattern is the single cheapest UX win in this roadmap. It maps to a common workflow: mid-implementation, need to verify a fact or explore a tangent without adding N messages to the main context.

#### Scope
- Keyboard shortcut: `⌘+;` / `Ctrl+;` to summon a side chat panel over the active session.
- Side chat lifecycle: side chats share the main thread's pinned context (research artifacts, system prompt) but do not persist back unless the user explicitly invokes "Merge into main."
- New `AgentChatThreadStore` method: `forkThread(threadId, includeHistory: boolean): SideThread`. Lightweight — references parent thread's messages by ID range rather than copying them. The existing `branchThread` full-copy method remains for the (separate) checkpoint/revert flow.
- UI: side chats appear in a modal-style drawer, closable with `Esc`. Multiple side chats can exist simultaneously; they list in a tab bar at the drawer top.
- "Merge into main" action: appends a summary of the side chat (user-editable, defaulted to an LLM-generated brief) as a single system message to the main thread, plus optional inclusion of specific messages from the side chat.
- Telemetry: side chats are logged as their own session-scoped events (Wave 15) so we can measure whether the feature is used.

#### Non-scope
- Persistent side chats that survive app restart — Wave 19 scope is session-scoped ephemeral side chats. Persistent variant can be added later if telemetry justifies.
- Side chats across sessions — a side chat belongs to one session and one main thread.

#### Key file touch points
- `src/main/agentChat/threadStore.ts` — new `forkThread` method; keep existing `branchThread`
- `src/renderer/components/AgentChat/SideChatDrawer.tsx` — new component
- `src/renderer/hooks/useSideChat.ts` — new hook managing active side chats
- `src/main/agentChat/chatOrchestrationBridge*.ts` — recognize side-thread IDs in routing

#### Acceptance criteria
- `⌘+;` opens a side chat; messages sent in it do not appear in the main thread.
- Closing the side chat (or `Esc`) does not modify the main thread.
- Merge action adds a single system message to the main thread summarizing the side chat.
- Multiple simultaneous side chats are navigable via the drawer tab bar.

#### Testing
- Unit: `forkThread` creates a new thread ID, lightweight message references resolve correctly.
- Integration: side chat uses parent's pinned context but not parent's recent messages (unless includeHistory is true).
- Manual: workflow test — start a side chat mid-implementation, get answer, close, verify main thread unchanged.

#### Risks
- **Context overhead** — if side chats include full parent history, they double the token cost. Mitigation: default is minimal context (pinned artifacts + system prompt), user opts in to include recent messages.
- **Accidental main-thread pollution** — users might expect merge-on-close. Mitigation: explicit "Merge into main" button, never implicit.

#### Exit criteria
- Author dogfood confirms the shortcut and merge UX feel natural.
- Telemetry shows side-chat usage > 5% of chat sessions (if lower, reconsider whether the feature is valuable).

---

### Wave 20 — Research Trigger: Explicit Pipeline

**Target release:** v1.6.0 (minor — new capability class)
**Dependencies:** Wave 15 (outcome telemetry)
**Feature flag:** `research.explicit` (default on — it's opt-in per invocation)

#### Goal
Ship the explicit research pipeline: slash commands and hook-based triggers dispatch a research subagent with a forked context and a focused tool suite, whose output is surfaced as a pinned context artifact visible in the active session's chat. Outcome telemetry links research invocations to downstream implementation results.

#### Motivation
The sequencing decision from the design discussion stands: ship explicit triggers first, accumulate telemetry for 2–4 weeks, then build automated triggering on empirical data rather than guessed rules. Wave 20 is the explicit half; Wave 21 is the auto half.

#### Scope

**Trigger surfaces (explicit only in Wave 20):**
- Slash commands: `/research <topic>`, `/spec-with-research`, `/implement-with-research`. Added to `.claude/commands/` and/or surfaced via the command palette.
- User toggle: a research button in the chat composer with three states — Off (default), Auto (reserved for Wave 21), Always-on-this-message.
- PreToolUse hook: when Claude is about to invoke Edit/Write on a file importing from a flagged library, the hook can pre-fetch a research artifact (optional; off by default in Wave 20, on in Wave 21).

**Research subagent:**
- New `src/main/research/researchSubagent.ts`. Invokes the Agent tool with `subagent_type: "general-purpose"` and a dedicated tool subset: `mcp__claude_ai_Context7__*`, web search (when available), Ref, GitMCP. Cannot write code; returns a structured artifact.
- Research prompt template constrains the subagent to: (a) identify the specific library/topic, (b) fetch current docs, (c) return a synthesis capped at ~1.5–2K tokens (the "first 2K tokens capture 80% of value" heuristic).
- Artifact structure: `{ topic, sources[], summary, relevantSnippets[], confidenceHint }`. Persisted in `telemetry.db.research_invocations`.

**Cache:**
- Keyed by `(library, topic, version)`. TTL per library — defaults: high-velocity (Next.js, React, Vercel AI SDK, shadcn): 48h; mid-velocity (Prisma, Tailwind): 7d; stable (Lodash, Express): 30d; system-level (Node built-ins, git): 90d.
- Cache stored in `telemetry.db.research_invocations` with `artifact_hash` pointing to a compressed artifact blob table.
- User-visible cache inspector in a Settings panel.

**Context injection:**
- Artifact rendered as a pinned first-class panel in chat (option 3 from the design discussion — UI surface, not a hidden system-prompt injection). User can collapse, dismiss, or re-use the artifact.
- Injected into the model context as a synthetic assistant-side tool-result block (option 2) so prefix-caching stays intact.

**Outcome correlation:**
- Every research invocation gets a correlation ID. The next `post_tool_use` Edit/Write in the session attributes its outcome (typecheck, test, exit code) back to the research invocation.
- A research artifact's "usefulness score" accumulates over the session based on outcome signals. Visible in the diagnostics panel initially; powers Wave 21 tuning.

**Status streaming:**
- While the subagent runs, the chat shows an ambient "Researching <topic>…" indicator. The main agent's turn can proceed in parallel with an explicit gate before implementation claims (a `wait-for-research` marker token that the streaming layer respects).

#### Non-scope
- Automatic triggering — Wave 21.
- Classifier / Haiku ambiguity-resolver — Wave 26 (contingent).
- Internal-code-memory research (graph-based lookups) — kept separate intentionally. The design discussion flagged that "external knowledge research" and "internal context research" should not be collapsed. Graph-based lookups are already handled by the codebase-memory MCP; they are not part of this research pipeline.
- PR monitoring / auto-fix surfaces — orthogonal to research.

#### Key file touch points
- `src/main/research/*` — new module
- `src/main/hooks.ts` — PreToolUse research-check extension point (off by default)
- `src/renderer/components/AgentChat/PinnedContext.tsx` — new component for artifact rendering
- `src/main/agentChat/chatOrchestrationBridge*.ts` — insert research artifact into context packet
- `.claude/commands/` — new slash command definitions

#### Acceptance criteria
- `/research <topic>` invokes the subagent, returns an artifact within 15s typical latency, pins it to the current session's chat.
- `/spec-with-research` runs research before the main model's response begins (chat shows "Researching…" ambient state).
- Repeated invocation of the same topic within TTL hits the cache (< 500ms).
- Artifact is visible, collapsible, and dismissable in chat.
- Outcome correlation: after research-then-implementation, the diagnostics panel shows the invocation linked to the subsequent tool-use outcomes.

#### Testing
- Unit: cache TTL enforcement, key normalization (`next@15.2.0` and `next@^15.2` hit the same cache entry).
- Integration: `/research react-server-components` → artifact rendered; repeat → cache hit.
- Integration: research invocation → implementation → outcome correlation visible in telemetry.
- Manual: 4-week author dogfood exercising explicit triggers across different library ecosystems (JS/TS, Python if applicable, others).

#### Risks
- **Subagent latency** — 3–15s blocking is a flow killer. Mitigation: status streaming + user can cancel; parallel-with-main-turn for non-blocking topics (where the main agent can start exploring without committing to implementation claims).
- **Hallucinated sources** — the subagent could return plausible-looking but fabricated research. Mitigation: the artifact must cite sources; UI shows source domain on hover; user can click through to verify.
- **Cache staleness** — TTLs that are too generous mean stale research; too aggressive means burning tokens. Mitigation: TTL matrix is user-editable per library; telemetry flags suspicious cache hits (research artifact for library whose version in package.json has changed since cache entry).
- **Token budget explosion** — research artifacts compound over long sessions. Mitigation: artifact cap 2K tokens, injected as a summary block, original full artifact stored in DB but not re-sent with each turn.

#### Exit criteria
- 4 weeks of author dogfood with ≥20 explicit research invocations.
- Telemetry shows outcome correlation working: research-then-implementation turns have measurable outcome differentiation from non-research turns (either signal direction).
- No unacknowledged performance regressions in chat responsiveness.

---

### Wave 21 — Research Trigger: Context-Based Auto-Firing

**Target release:** v1.7.0 (minor — automation layer on top of Wave 20)
**Dependencies:** Wave 20 with ≥4 weeks of telemetry soak
**Feature flag:** `research.auto` (default off for first release, default on after 2 weeks of post-launch telemetry)

#### Goal
Automate research firing based on context signals — primarily package.json + import analysis, secondarily "Claude about to commit to a fact-shaped claim" detection — using the staleness and outcome data accumulated in Wave 20 to set defensible thresholds.

#### Motivation
The design discussion established that context-based triggering (package.json + imports) is categorically stronger than prompt classification or self-signaling. Wave 21 builds the dominant auto-trigger on that foundation. The classifier (Wave 26) is explicitly deferred; rules + cache + outcome feedback may prove sufficient.

#### Scope

**Rule layer (deterministic):**
- Import analysis on files in the active session's dirty set. When Claude is about to edit a file that imports from a flagged library, fire research.
- Staleness matrix: hybrid — manually curated top-30 high-velocity libraries with explicit known-cutoff versions (Next.js, React, Vercel AI SDK, shadcn, Tailwind, Prisma, Drizzle, Zod, tRPC, Electron, Vite, etc.) + release-date heuristic for long-tail libraries (any library with a major release after Claude's training cutoff is flagged stale unless in a denylist).
- Slash-command precedence: explicit `/research off` on a message overrides auto-firing; explicit `/research on` forces it.

**Self-correction capture:**
- When the user corrects Claude's output with specific-library-related feedback ("that's not how useEffect works in React 19"), capture the correction and flag the library for enhanced research on future invocations in this session.
- A per-session "correction log" accumulates; at session archive, high-confidence corrections feed the global staleness matrix.

**"Fact-shaped claim" detection (lightweight):**
- A minimal regex-level detector on the model's outgoing stream flags when the model is about to make a verifiable factual claim about a specific library API (e.g., `use\w+\(` for React hook names, `z\.\w+\(` for Zod methods). When detected + library is flagged stale + no cached research exists, the model stream pauses briefly while research fires.
- This is deliberately simple. A proper detector is Wave 26's scope; Wave 21 ships the most basic version.

**User controls:**
- Per-session setting: auto-research off / conservative (only flagged libraries) / aggressive (any library post-cutoff).
- Global default in Settings.
- Keyboard shortcut to toggle auto for the current session.

**Telemetry-driven threshold tuning:**
- Weekly review dashboard (dev-facing) showing: invocations fired, outcomes correlated, false positive rate (research fired but outcome was identical to predicted no-research outcome), false negative rate (proxied by: user corrections that followed a turn where research did NOT fire).
- Threshold adjustments become a Settings UI knob rather than a code change.

#### Non-scope
- Classifier / ML trigger — Wave 26.
- Haiku ambiguity-resolver — Wave 26.
- Internal context research integration — still separate; out of scope.

#### Key file touch points
- `src/main/research/triggerEvaluator.ts` — new module
- `src/main/research/stalenessMatrix.ts` — new, with initial curated list
- `src/main/research/correctionCapture.ts` — new, listens to user messages
- `src/main/hooks.ts` — PreToolUse hook consumes trigger evaluator
- `src/main/agentChat/chatOrchestrationBridge*.ts` — fact-shaped claim detector on outgoing stream

#### Acceptance criteria
- Editing a file that imports `next@15.*` fires research automatically when no cached artifact exists.
- User correction "that API was removed in Zod 4" flags Zod for session-enhanced research; next Zod-adjacent edit fires research even without staleness-matrix trigger.
- Per-session toggle changes auto-firing behavior immediately.
- Telemetry dashboard shows ≥4 weeks of explicit-pipeline data has been used to set initial thresholds.

#### Testing
- Integration: mock project with `next@15.2` imports — edit to such a file triggers research; edit to a non-importing file does not.
- Integration: correction capture → next-edit enhanced trigger.
- Soak: 4-week dogfood measuring false-positive rate and subjective annoyance ("did research fire when it shouldn't have").

#### Risks
- **False-positive rate ruins the feature** — if research fires on 40% of edits and latency is noticeable, users disable auto. Mitigation: conservative default (only curated top-30), aggressive mode is opt-in, per-session override is one keystroke.
- **Staleness matrix maintenance burden** — keeping 30 libraries' cutoffs current requires discipline. Mitigation: matrix update is a quarterly task; release-date heuristic covers the long tail; matrix is user-overridable.
- **Correction capture accuracy** — distinguishing "user corrected Claude's library claim" from "user changed their mind about implementation" is hard. Mitigation: conservative heuristic (user message contains library name + negation pattern), captured corrections require user confirmation before feeding the global matrix.

#### Exit criteria
- 4 weeks of auto-firing dogfood with recorded subjective annoyance score ≤ 2/10.
- Measured false-positive rate < 15% (firing when outcome shows research didn't differ).
- Feature flag default flipped to on.

---

### Wave 22 — Drag-and-Drop Pane Composition

**Target release:** v1.7.1 (patch)
**Dependencies:** Wave 17 (preset engine), Wave 18 (chat-primary, because drag-and-drop is most useful there)
**Feature flag:** `layout.dragAndDrop` (default on — non-destructive)

#### Goal
Match Claude Code Desktop's drag-and-drop pane layout. Users can rearrange the terminal, file editor, diff viewer, preview pane, and chat into custom grid configurations. Arrangements persist per session as derived presets.

#### Motivation
The audit confirms the slot + preset infrastructure is already in place after Wave 17. Drag-and-drop is the ergonomics layer on top — cheap relative to building the slot system but meaningful for users who want to set up a scratch layout per task.

#### Scope
- HTML5 drag-and-drop with react-dnd or equivalent (evaluate in Wave 17 design doc; prefer native events if viable).
- Drop targets: the six existing slots plus "split horizontally/vertically" affordances at slot edges for dynamic pane creation.
- Per-session custom-layout persistence (derived preset automatically saved; user can name and promote to a global preset).
- Undo / reset-to-original-preset action in the preset switcher.
- Touch-friendly drag for the Wave 23/24 mobile targets: long-press to initiate, visible drag handles, snap-to-grid feedback.

#### Non-scope
- Out-of-window drag (tear off a pane into a separate window) — not in this roadmap.
- User-authored custom panes — out of scope.

#### Key file touch points
- `src/renderer/components/Layout/*` — drag layer
- `src/renderer/components/Layout/layoutPresets/*` — derived preset persistence

#### Acceptance criteria
- User drags the terminal from `terminalContent` slot to split the `editorContent` slot; layout updates live.
- Session persistence: on reopen, custom arrangement is restored.
- Undo action returns to the preset's default layout without data loss in any pane.

#### Testing
- Integration: drag → drop → persist → reload → restored.
- Manual: touch test on the web build running in a tablet browser.

#### Risks
- **Layout rubbish state** — user creates an unusable layout (e.g., all panes minimized). Mitigation: reset-to-preset is always one click from the preset switcher.
- **Drag perf on large projects** — rearranging while a large diff is rendered could hitch. Mitigation: drag preview uses a placeholder; actual content re-renders on drop only.

#### Exit criteria
- Author dogfood with a self-created "refactoring layout" used for a week.
- Touch drag validated on Wave 23 responsive preparation.

---

### Wave 23 — Mobile-Responsive Refinement

**Target release:** v1.8.0 (minor — prepares the ground for Wave 24)
**Dependencies:** Wave 17 (preset engine with breakpoint scaffolding), Wave 22 (touch-friendly drag)
**Feature flag:** `layout.mobilePrimary` (default on in web build, always active at narrow breakpoints)

#### Goal
Harden the web build into a genuinely usable mobile browser client. Implement the `mobile-primary` preset, ensure all components are touch-friendly and responsive, and eliminate desktop-only interaction patterns from the mobile render path.

#### Motivation
The audit confirms the web build is functionally usable (`webPreload.ts` shims all major APIs over WebSocket). `MobileNavBar` exists as a scaffold. The gap is execution, not architecture. A 1–2 wave refinement pass makes the existing web build usable on a phone, which is the prerequisite for Wave 24's native mobile shell.

#### Scope
- `mobile-primary` preset populated: single active pane at a time, bottom navigation for switching between chat, terminal, file editor, session list. Reuses the existing `MobileNavBar` (`AppLayout.tsx:312`).
- Touch-target audit: every interactive element in the renderer hits ≥44px minimum hit zone on mobile. Automated lint rule added in `.claude/rules/` (or via `stylelint-a11y` equivalent).
- Hover-dependent UI replaced on mobile: tooltips become tap-to-show, hover-reveal actions become always-visible at narrow breakpoints.
- Virtual keyboard awareness: chat composer stays above the keyboard, editor scrolls cursor into view on focus.
- Viewport meta tag + safe-area insets honored.
- Swipe gestures: swipe between sessions in the sidebar, swipe between chat/terminal/editor in `mobile-primary`.
- Remove Monaco workers or replace with a lightweight read-only viewer on mobile — Monaco's worker overhead is painful on mobile browsers. User can view files with syntax highlighting; full editing falls back to a simple textarea with syntax overlay for now.
- Session sidebar becomes a drawer on mobile (not always-visible left column).
- AgentMonitor drawer becomes a bottom sheet on mobile.

#### Non-scope
- Native mobile app — Wave 24.
- Offline capability — out of scope; the mobile client requires a connected desktop Ouroboros.
- Mobile-specific keyboard shortcuts — shortcuts are a desktop affordance.

#### Key file touch points
- `src/renderer/components/Layout/layoutPresets/mobilePrimary.ts` — full implementation
- `src/renderer/components/**` — responsive audit across all components
- `src/renderer/components/Layout/MobileNavBar.tsx` — expand from scaffold to fully functional
- `src/web/webPreload.ts` — Electron-only stubs replaced with appropriate mobile fallbacks (e.g., file dialogs → native mobile file pickers)

#### Acceptance criteria
- Web build opened in a mobile browser (iOS Safari, Chrome Android) usable for: viewing a session's chat, sending prompts, reading terminal output, browsing file tree, viewing file contents.
- All interactive elements hit the 44px touch-target minimum per automated audit.
- No hover-dependent-only interactions on mobile breakpoints.
- Bottom nav switches between primary surfaces smoothly.
- Virtual keyboard does not obscure the active input.

#### Testing
- Automated: Playwright tests in mobile viewport profiles (iPhone 14, Pixel 7).
- Manual: 1-week dogfood using Ouroboros from a phone against the desktop instance on home network.

#### Risks
- **Monaco on mobile is painful** — the editor is the single heaviest renderer cost and not mobile-friendly. Mitigation: mobile fallback is a read-only viewer; editing on mobile is acknowledged as minimal until a dedicated lightweight editor lands (out of this roadmap's scope).
- **WebSocket reliability over cellular** — mobile connections drop; the transport needs to reconnect and resume without losing state. Mitigation: the existing WebSocket shim gains reconnect logic with streaming resume (replay via `bufferedChunks`).

#### Exit criteria
- Author dogfood: 1 week using phone browser for ad-hoc session interaction.
- Touch-target audit passes with zero violations on all refreshed components.

---

### Wave 24 — Mobile Shell & Client-Server Split Hardening

**Target release:** v2.0.0 (major — first non-Electron runtime target)
**Dependencies:** Wave 23
**Feature flag:** N/A (separate distribution)

#### Goal
Package the web renderer as a native mobile app (iOS / Android) via Capacitor, Tauri Mobile, or React Native bridge (decision in design doc). Harden the client-server protocol for production use over the public internet.

#### Motivation
The existing `webPreload.ts` WebSocket shim already proxies all major APIs. The gap for a real mobile app is: (a) packaging, (b) auth/security hardening, (c) latency tolerance, (d) store distribution. This wave is primarily infrastructure and packaging, not new product features.

#### Scope

**Packaging:**
- Evaluate Capacitor vs Tauri Mobile vs React Native (decision in wave design doc). Factor: which preserves the most renderer code without rewriting; which integrates best with the existing vite web build; which has the least runtime overhead.
- Produce signed iOS and Android builds. App Store / Play Store submission is scope but may not land in this wave's release window — that's acceptable.

**Client-server protocol hardening:**
- Auth: the current short-lived WS ticket at `/api/ws-ticket` becomes part of a proper device-pairing flow. Mobile device + desktop instance exchange a pairing code (QR or six-digit), producing a persistent refresh token.
- Transport encryption: WSS required for remote connections; LAN connections can stay WS with explicit user opt-in.
- Latency tolerance: WebSocket transport gains streaming resume on reconnect (foundation from Wave 23), configurable request timeout per-call class (long-running invoke = 120s, short = 10s).
- Security review: the web mode currently exposes essentially all of `window.electronAPI`. For remote connections, a scoped surface (no arbitrary filesystem access, no shell spawn from mobile, no process termination) with explicit capability grants.

**UX for pairing:**
- Desktop: Settings → Mobile Access → Generate Pairing Code.
- Mobile: on first launch, "Pair with desktop" screen requesting the code.
- Paired devices are listed in desktop settings; user can revoke access.

#### Non-scope
- Offline mode or on-device LLM — out of scope.
- App store publishing optimization (screenshots, marketing copy) — handled outside this roadmap.
- Apple Watch / wearables — out of scope.

#### Key file touch points
- `src/web/webPreload.ts` — pairing token handling, scoped capability surface
- New `src/web/capabilityGate.ts` — per-capability authz layer
- `src/main/mobileAccess/*` — new module: pairing token store, WSS listener, revocation
- Build: new mobile packaging pipeline (Capacitor/Tauri config)

#### Acceptance criteria
- Mobile app pairs with desktop via QR code in under 60s.
- Session list, chat, terminal output, file viewing all functional on mobile over WSS.
- Paired device revocation in Settings immediately terminates active connections from that device.
- Scoped capabilities prevent unauthorized filesystem access from the mobile client.

#### Testing
- E2E: full pairing flow from mobile to desktop over localhost and over LAN.
- Security: penetration test of the scoped capability surface (hired out or authored with security-review skill).
- Manual: 2 weeks of author-daily mobile use.

#### Risks
- **Security surface** — remote access is a fundamentally larger threat model than local Electron. Mitigation: security review is a hard gate, not optional; default config requires LAN or tailscale/VPN, public-internet exposure is opt-in with warnings.
- **Packaging maturity** — Capacitor/Tauri Mobile may have rough edges with the full Monaco renderer bundle. Mitigation: evaluation wave in the design doc picks the pragmatic option; mobile build may ship with a reduced feature surface initially.
- **Battery impact** — a persistent WebSocket is expensive on mobile. Mitigation: connection pauses on app background, resumes on foreground with streaming replay.

#### Exit criteria
- Mobile app runs 2 weeks in author daily use with acceptable battery/connection UX.
- Security review signed off.
- Pairing flow validated on at least 3 desktop + 2 mobile device combinations.

---

### Wave 25 — Cross-Device Session Dispatch

**Target release:** v2.1.0 (minor — completes the Ouroboros-owned "Dispatch" story)
**Dependencies:** Wave 24
**Feature flag:** `mobile.dispatch` (default on once Wave 24 is mature)

#### Goal
Let the user send a task from the mobile app to the desktop Ouroboros instance: "Implement the login feature in the signup-flow branch" dispatched from phone spawns a new session with a worktree on desktop and returns status updates to the phone.

#### Motivation
This is Ouroboros's equivalent of Claude Code Desktop's Dispatch — but running against the user's own desktop instance rather than Anthropic's cloud, which keeps it private, cost-free beyond the user's existing model access, and composable with the user's local worktree/session infrastructure.

#### Scope
- Mobile UI: "New Task" with fields for title, prompt, target project (pulled from desktop's session list), and optional branch/worktree name.
- On submit: mobile client calls a new `sessions:dispatchTask` IPC (now exposed over WSS) on desktop, which creates a session, optionally creates a worktree, and begins the agent run.
- Status streaming: the mobile session view subscribes to the new session's stream and shows progress inline.
- Notifications: mobile native push notification (via Capacitor / Tauri plugin) when the dispatched task completes or fails.
- Queue: multiple dispatches queue behind current desktop capacity; user can see queue status on mobile.

#### Non-scope
- Dispatch to a cloud-hosted Ouroboros instance — no cloud instance exists.
- Voice-driven dispatch ("Hey Ouroboros, implement X") — out of scope.

#### Key file touch points
- `src/main/session/sessionDispatch.ts` — new, coordinates dispatch flow
- `src/web/webPreload.ts` — new `sessions:dispatchTask` capability
- Mobile app: new "Dispatch" screen

#### Acceptance criteria
- User on phone dispatches a task; desktop spawns session; agent turn begins within 10s.
- Status streams to mobile in real-time during the dispatched run.
- Completion triggers a mobile notification.
- Dispatched sessions appear in the desktop's session sidebar alongside local sessions.

#### Testing
- E2E: full dispatch cycle over LAN.
- E2E: dispatch over WAN (tailscale or similar).
- Manual: 1 week of author use dispatching tasks during commute / away-from-desk.

#### Risks
- **Queue overflow** — dispatching faster than desktop processes them leads to long waits. Mitigation: queue depth visible on mobile; user can cancel queued items.
- **Desktop offline** — dispatched task can't proceed. Mitigation: mobile shows "desktop offline, will deliver on reconnect" clearly; user can cancel.

#### Exit criteria
- Author dispatches ≥10 real tasks over a 2-week period with satisfaction review.

---

### Wave 26 — Research Classifier (Contingent)

**Target release:** v2.2.0 (contingent — skipped if Wave 21 telemetry shows rules + cache sufficient)
**Dependencies:** Wave 21 with ≥8 weeks of auto-firing telemetry
**Feature flag:** `research.classifier` (default off until telemetry justifies)

#### Goal
Train a lightweight classifier on the research-invocation outcome dataset from Waves 20–21 to catch cases where rules + cache + context signals missed but research would have helped. Add a Haiku ambiguity-resolver only if the classifier itself has irreducibly ambiguous cases.

#### Motivation
The design discussion argued strongly for skipping the classifier layer until data proves it necessary. Wave 26 is the place where that data earns its way in (or doesn't). If the router's 1,558-prompt labeling run is the methodology precedent, Wave 26 applies the same discipline to research triggering.

#### Scope

**Gating check:**
- Before scope commits, review Wave 21 telemetry. Proceed only if there's a measurable false-negative rate (user corrections following a turn where research did NOT fire) greater than a pre-declared threshold (e.g., 10%).

**Classifier training:**
- Feature extraction from captured turns: prompt length, library-name presence, implementation verb detection, recency keywords, past-conversation context, import-graph signals, package.json version fingerprint.
- Labels: outcome signal (compile success, test pass, user acceptance without correction).
- Model: logistic regression or gradient-boosted trees; evaluation by held-out test set.
- Threshold tuning: minimize false-positive rate subject to a target false-negative improvement.

**Haiku ambiguity-resolver (if needed):**
- For prompts the classifier rates in the 0.4–0.6 confidence band, a single Haiku call decides. Added only if classifier thresholding doesn't partition cleanly.

**Integration:**
- Classifier runs after rule layer. Rules fire → research fires. Rules don't fire + classifier high-confidence-yes → research fires. Rules don't fire + classifier low-confidence → Haiku (if enabled) or skip.

#### Non-scope
- LLM-based trigger (full model call for every prompt) — too expensive, not on the table.
- Classifier that decides research topics, not just fire/don't-fire — that's a downstream refinement.

#### Key file touch points
- `src/main/research/classifier.ts` — new (if proceeding)
- `src/main/research/triggerEvaluator.ts` — add classifier layer
- Training pipeline: offline, writes classifier artifact to `%LOCALAPPDATA%/Ouroboros/research-classifier.bin`

#### Acceptance criteria
- Classifier demonstrably reduces false-negative rate in held-out test.
- Integration into the trigger evaluator does not increase false-positive rate beyond an agreed tolerance.
- Inference latency < 20ms per prompt.

#### Testing
- Offline: evaluation on held-out test set.
- Online: A/B comparison (classifier-enabled vs rules-only) over a 2-week soak.

#### Risks
- **Overfitting** — the training set from Waves 20–21 may be small and author-biased. Mitigation: hold a strict test set, evaluate on synthetic cases, be honest if data is insufficient and defer.
- **Feature drift** — what the classifier learns from today's data may not generalize to future library ecosystems. Mitigation: retraining cadence (quarterly) and monitoring for decay.

#### Exit criteria
- Classifier deployed with measurable false-negative improvement ≥ 20% over rules-only baseline, without false-positive regression.
- OR: telemetry review concludes classifier is unnecessary and Wave 26 is formally closed unshipped.

---

## 8. Cross-Cutting Concerns

### 8.1 Feature flag policy

- Every wave lands behind a feature flag (listed in each wave's header).
- Flags default off for the first release after the wave ships, with a soak period of ≥2 weeks before flipping to default on.
- Flags are never removed until at least 2 releases after being default-on (per existing `streamingInlineEdit` precedent referenced in `CLAUDE.md`).
- Flags live in the existing `config.ts` schema.

### 8.2 Telemetry strategy

- All telemetry writes go through the Wave 15 `telemetryStore`.
- Router-style JSONL mirror for out-of-band analysis.
- Every wave defines its telemetry schema additions in its wave design doc (not in this roadmap).
- User-facing opt-out for telemetry in Settings (default: on for dev, opt-in for production users until v2.0).

### 8.3 Testing strategy

- Each wave's "Testing" section specifies unit/integration/manual requirements.
- Vitest for unit. Playwright for E2E (browser + Electron). Manual dogfood gate on every user-visible wave.
- Coverage thresholds (currently 5% per `vitest.config.ts`) ratchet up by 5% per wave touching the relevant module. No wave decreases coverage.
- Regression suite runs on every wave release; prior waves' acceptance criteria are included as regression checks.

### 8.4 Migration & rollout

- Every wave with persisted-data changes (Waves 15, 16, 17, others) ships an idempotent migration.
- Migrations preserve a read-only fallback to the prior-version key for 2 releases.
- No "flag day" cutovers. Every change coexists with the prior behavior until the flag flip.

### 8.5 Rollback strategy

- Any wave can be rolled back within its release cycle by flipping its feature flag off.
- For waves with persisted-data changes, rollback preserves written data (readable but unused by rolled-back code).
- A rollback event is a blocker for the next wave's release until root cause is understood.

### 8.6 ESLint & code-quality discipline

Every wave respects the existing constraints:
- `max-lines-per-function: 40` — extract helpers
- `max-lines: 300` per file — split along natural seams (the nine-file `chatOrchestrationBridge*.ts` is the precedent)
- `complexity: 10` — early returns and guard clauses
- `max-depth: 3`
- `max-params: 4` — use options objects
- `simple-import-sort` on imports and exports
- Security rules at error level in main/preload

No wave relaxes any of these. If a wave's implementation legitimately needs a violation, that's a signal to re-split the work, not to change the rule.

### 8.7 Meta-development hygiene

- No wave's implementation work runs `taskkill`, `npm run dev` fresh, or other host-process-disruptive commands without explicit user direction.
- Graph-sync and hot-reload are preferred over restarts.
- Any wave that changes the main-process startup sequence (Wave 15, 16) must be tested by the author with a *separate* Ouroboros instance before the change is committed to the one running the edit session.

### 8.8 Risk register

| Risk | Wave(s) | Severity | Status |
|---|---|---|---|
| Worktree disk explosion | 16 | High | Mitigated (opt-in per session) |
| Chat state loss on layout switch | 17, 18 | High | Mitigated (`display:none` preserved) |
| Research latency ruins chat flow | 20 | High | Mitigated (status streaming, parallel turns) |
| Auto-research false-positive rate | 21 | High | Gated (telemetry-driven thresholds) |
| Security surface for mobile | 24 | Critical | Hard gate (security review required) |
| Migration regressions | 15, 16, 17 | Medium | Mitigated (read-only fallbacks) |
| Monaco on mobile | 23 | Medium | Accepted (read-only fallback) |
| Classifier overfitting | 26 | Medium | Gated (held-out test, contingent wave) |
| Side-chat context overhead | 19 | Low | Mitigated (minimal default context) |
| Drag-and-drop unusable layout | 22 | Low | Mitigated (one-click reset) |

---

## 9. Open Questions & Decisions Pending

Decisions required before wave work begins, with proposed owners and deadlines:

| # | Question | Owner | Deadline |
|---|---|---|---|
| Q1 | Package manager for multi-worktree builds: npm (current) vs pnpm (shared store). Choice affects Wave 16 disk economics. | Author | Before Wave 16 design doc |
| Q2 | Mobile packaging: Capacitor vs Tauri Mobile vs React Native. Decided in Wave 24 design doc; evaluation starts during Wave 23. | Author + external review | Before Wave 24 design doc |
| Q3 | Staleness matrix initial list: which 30 libraries, which cutoff versions. Needs one research pass referencing Claude's own knowledge-cutoff self-reports. | Author | Before Wave 21 |
| Q4 | AgentMonitor inline-event defaults: which event types show by default in chat vs drawer-only. Design-sensitive; needs author dogfood. | Author | During Wave 18 dogfood |
| Q5 | Research artifact token cap: 1.5K vs 2K vs dynamic. Affects Wave 20 cost economics. | Author | Before Wave 20 |
| Q6 | Pairing token lifetime and revocation strategy for Wave 24 mobile access. Security-sensitive. | Author + security reviewer | Before Wave 24 design doc |
| Q7 | Whether to integrate internal-code-memory research (codebase-memory graph queries) into the same research pipeline or keep them fully separate. Design discussion argued separate; Wave 20 implementation needs the final call. | Author | Before Wave 20 |
| Q8 | Version numbering: do Waves 15–22 stay on v1.x with minor bumps per visible wave, or move to v2.x once chat-primary lands? | Author | Before Wave 18 release |

Each open question is scoped small enough that a design doc in `plan/` can resolve it before the corresponding wave begins.

---

## 10. Appendices

### Appendix A: Glossary

- **Session** — the Wave 16+ primitive combining project root, worktree, chat thread, layout preset, and telemetry attribution. Formerly conflated with a window.
- **Preset** — a named layout configuration (slots, panel sizes, visibility, breakpoints). Wave 17+ replaces the `WorkspaceLayout` preset-but-only-for-sizes.
- **Side chat** — a lightweight conversation fork that does not persist back to the main thread unless explicitly merged. Wave 19.
- **Research artifact** — structured output of the research subagent, pinned to a session's context. Wave 20.
- **Staleness matrix** — the library → known-cutoff-version mapping that drives Wave 21 auto-triggering.
- **Correlation ID** — Wave 15's UUID v7 per event, enabling tool-use ↔ outcome linking.
- **Dispatch** — in this roadmap, Ouroboros's cross-device task handoff (Wave 25), not Anthropic's cloud Dispatch feature.

### Appendix B: Key file references (grounded from audit)

| Area | File | Lines |
|---|---|---|
| ManagedWindow definition | `src/main/windowManager.ts` | 33–38 |
| windowSessions persistence | `src/main/windowManager.ts` | 343 (persist), 376 (restore) |
| windowSessions schema | `src/main/configSchema.ts` | 157–176 |
| Legacy multiRoots | `src/main/configSchema.ts` | 145–151 |
| AppLayoutSlots definition | `src/renderer/components/Layout/AppLayout.tsx` | 19–26 |
| AppLayout structural shell | `src/renderer/components/Layout/AppLayout.tsx` | 280–316 |
| Chat state preservation via display:none | `src/renderer/components/Layout/AppLayout.tsx` | 308 |
| MobileNavBar integration | `src/renderer/components/Layout/AppLayout.tsx` | 312 |
| Workspace layout apply event | `src/renderer/components/Layout/AppLayout.tsx` | 73–76 |
| AgentChatOrchestrationBridge surface | `src/main/agentChat/chatOrchestrationBridge.ts` | 48–61 |
| ActiveStreamContext shape | `src/main/agentChat/chatOrchestrationBridgeTypes.ts` | 29–66 |
| Checkpoint commit capture | `src/main/agentChat/chatOrchestrationBridgeGit.ts` | 33–60 |
| Git rev-parse HEAD per turn | `src/main/agentChat/chatOrchestrationBridgeGit.ts` | 118–124 |
| HookEventType enum | `src/main/hooks/hooksLifecycleHandlers.ts` | 52–88 |
| HookPayload shape | `src/main/hooks.ts` | 39–70 |
| Hook dispatch to renderer | `src/main/hooks.ts` | 143 |
| tapConflictMonitor | `src/main/hooks.ts` | 219–240 |
| webPreload electronAPI bridge | `src/web/webPreload.ts` | 93–128 |
| webPreload auth ticket | `src/web/webPreload.ts` | 59–66 |
| webPreload transport | `src/web/webPreload.ts` | 70 |
| claudeCliSettings.worktree | `src/main/configSchema.ts` | 198 |
| Graph DB schema | `src/main/codebaseGraph/graphDatabaseSchema.ts` | 24–80 |
| Graph skips worktrees dirs | `src/main/codebaseGraph/graphParserShared.ts` | 12 |
| Threads DB migrations | `src/main/agentChat/threadStoreSqlite.ts` | 172–188 |
| Perf metrics startup phases | `src/main/perfMetrics.ts` | 34–43 |
| Runtime metrics broadcast | `src/main/perfMetrics.ts` | 126–129 |
| Unwired IndexerCompletedPayload | `src/main/perfMetrics.ts` | 179–197 |
| Worktree flag to Claude CLI | `src/main/pty/ptyClaude.ts` | 31 |

### Appendix C: External references

- Claude Code Desktop redesign blog: https://claude.com/blog/claude-code-desktop-redesign
- Claude Code Desktop docs: https://code.claude.com/docs/en/desktop
- 9to5Mac coverage of routines feature: https://9to5mac.com/2026/04/14/anthropic-adds-repeatable-routines-feature-to-claude-code-heres-how-it-works/

### Appendix D: Versioning notes

Version targets in each wave header are tentative and can be revised as wave work lands. The major signals:
- Patch bump: internal refactor, no user-visible change (e.g., Wave 15, 17).
- Minor bump: new user-visible capability or significant behavior change (e.g., 16, 18, 20, 21).
- Major bump: new platform target or breaking API (e.g., 24 — mobile shell).

### Appendix E: What this roadmap does not plan

- Billing, monetization, licensing.
- Multi-user collaboration (real-time cursors, shared sessions) — potential future work beyond this roadmap.
- Plugin marketplace / third-party extensions — potential future work.
- Voice input / voice dispatch.
- Team / enterprise features beyond what already exists.
- Any work on the existing known tech debt (double terminal tab bar, inline Settings modal, unwired `internalMcp`, `streamingInlineEdit` flag removal) — these should be handled opportunistically when a wave touches the affected code, not as dedicated scope.

---

**End of roadmap.**

Expected full duration: 9–15 months depending on dogfood depth and wave execution parallelism. Wave dependency graph permits some parallelism (e.g., Wave 20 can start before Wave 18 is complete), but the critical path (15 → 16 → 17 → 18) is sequential and takes an estimated 4–6 months.
