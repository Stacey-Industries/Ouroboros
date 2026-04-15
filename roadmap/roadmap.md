# Ouroboros Unified Roadmap

**Version:** 1.0 (draft)
**Drafted:** 2026-04-14
**Status:** Proposed — pending review
**Spans:** Wave 15 → Wave 40 (roughly v1.4 through v2.6)
**Supersedes:** `dual-mode-and-research-roadmap.md`, `piebald-improvement-waves.md`, `context-injection-overhaul.md` (all three consolidated here)
**Current release:** v1.3.16 (Wave 14 — System 2 indexer revival + perf foundation)

---

## 1. Executive Summary

This roadmap consolidates three planning arcs into one ordered wave plan spanning the next ~18–30 months of Ouroboros development:

1. **Dual-mode UI** — chat-primary layout alongside the existing IDE-primary layout, parallel sessions with worktree isolation, session sidebar, message polish, thread organization, branching.
2. **Context quality + research** — graph GC, edit provenance, PageRank repo map, context decision logging, Haiku reranker, research pipeline (explicit then auto), learned pointwise ranker (LTR).
3. **Agentic core + mobile + ecosystem** — profiles, subagent UX, drag-and-drop panes, diff/graph review, mobile responsive → native shell → cross-device dispatch, themes, multi-provider, ecosystem moat, onboarding.

The ordering enforces **foundation-first**, **instrument-before-automate**, and **data-before-ML** discipline. Telemetry infrastructure lands before any wave that needs to measure itself. Context decision logging lands before learned ranker. Research explicit pipeline lands before auto-firing. Mobile responsive work lands before the native shell.

Work is organized into 26 waves across 10 arcs. Each wave has a single anchor capability, clear scope, acceptance criteria, and a feature flag. Waves are shippable units; arcs are narrative groupings.

Dependency graph (§7) shows which waves can run in parallel. Critical path is 15 → 16 → 17 → 20, roughly 4–6 months. Total duration 18–30 months depending on execution parallelism and dogfood depth.

---

## 2. Motivation & Context

### 2.1 The three pressures converging

**Meta-development constraint.** Ouroboros is edited from inside itself. An agent modifying the running IDE risks corrupting its own execution environment. Without per-session isolation, parallel agent work is serially blocked — the user currently queues two agents behind a third because they can't touch the shared working copy at the same time. Worktrees resolve this structurally.

**Competitive baseline shifted April 2026.** Claude Code Desktop's redesign ships parallel sessions with automatic worktree isolation, drag-and-drop pane layout (integrated terminal, editor, diff, preview), side chats via `⌘+;`, session sidebar with filter/group/archive, view-mode calibration (Verbose/Normal/Summary), GitHub PR monitoring with auto-fix/auto-merge, cross-device Dispatch, scheduled routines on web infrastructure, and computer use on macOS/Windows. The "orchestrator seat" framing is explicit. This is now the category floor.

**Model knowledge freshness gap & context quality ceiling.** Neither Claude Code Desktop nor Cursor nor Windsurf automatically detects when Claude's training-data view of a library is out of date relative to what the codebase actually imports. Separately, Ouroboros's current context selection is a hand-weighted heuristic that double-counts the agent's own churn (recent_edit + git_diff weights together = 88 when the agent is the one editing), treats `semantic_match` as a weighted reason but has no active code path for it (dead weight of 45), and has no feedback loop against observed outcomes. Both gaps compound the more the user delegates.

### 2.2 What Ouroboros keeps and compounds

- **Hooks as first-class events** — 24 event types (`hooksLifecycleHandlers.ts:52-88`) carrying tool-use, agent lifecycle, session lifecycle, workspace, and conversation data, dispatched in-process to the renderer. Claude Code Desktop's Verbose/Normal/Summary view modes are a strictly weaker surface.
- **Codebase-memory graph** — 1.4K nodes, 2.3K edges, SQLite-backed, auto-synced. The graph is currently used for hotspots display; Aider's entire value prop is PageRank over the same kind of graph, used for retrieval. That upgrade (Wave 19) is a concrete compounding win.
- **PTY ownership** — direct control over the agent's execution shell, with exit-code observability. This is the unlock for outcome-correlated telemetry (Wave 15), which in turn enables learned context ranking (Wave 31) and research auto-firing (Wave 30).
- **Existing router infrastructure** — 19 features → logistic regression → Haiku/Sonnet/Opus, JSONL decision + quality-signal logs, Python retrain at ≥50 samples, hot-swap via `reloadWeights()`. Production-grade learned pipeline the context ranker can copy verbatim.
- **The meta-development context itself** — Ouroboros is both the tool and the thing being built with it. Claude Code Desktop can never be this.

### 2.3 What Ouroboros does not try to match

- **Dispatch on Anthropic's cloud infra.** Out of scope; requires infrastructure Ouroboros does not own. A phone-to-desktop variant (Wave 34) targets the user's own desktop instance, not cloud.
- **Scheduled routines on web backend.** Same reason.
- **Computer use.** Out of scope — orthogonal to the dual-mode/research arc.
- **Trained embeddings over sessions** (Cursor-style). The graph-based retrieval (Wave 19) gets most of the benefit at a fraction of the infrastructure cost and doesn't require maintaining an embedding index.

---

## 3. Guiding Principles

1. **Foundation before features.** Instrumentation precedes research and learned ranking. Session primitive precedes sidebar UI. Layout preset engine precedes chat-primary. Graph GC precedes PageRank retrieval. A wave that builds on a rotten foundation ships twice.
2. **Instrument first, automate later.** The router's deterministic-→-classifier-→-retrained progression worked because it was grounded in a real labeling run. Auto-research (Wave 30) follows the same discipline: explicit pipeline with outcome tracking (Wave 25), automated triggering only after ≥4 weeks of telemetry. Learned context ranker (Wave 31) only after ≥1000 samples from Wave 24's decision logging.
3. **One state layer, multiple presets.** Chat-primary and IDE-primary are two layouts over the same `Session`, the same `Conversation`, the same `PTY`, the same `CodebaseGraph`. Switching modes is a layout preset change, not a product fork.
4. **Reuse proven infrastructure.** Context decision logging mirrors router decision logging. Context retrain mirrors router retrain. Orchestration inspector extends the telemetry store. Don't reinvent.
5. **Amplify, don't throttle.** Feature decisions preserve the model's full capability surface. Research augments context; it never gates it. View modes calibrate transparency; they never hide agent actions from users who want to see them.
6. **Dogfood before shipping.** Every wave spends at least one week in the author's own working environment before release. User-visible waves dogfood for two weeks. Research and ranker waves dogfood for four weeks.
7. **ESLint discipline carries forward.** `max-lines-per-function: 40`, `max-lines: 300`, `complexity: 10`, `max-depth: 3`, `max-params: 4`. No wave relaxes these. Modules split along natural seams (the nine-file `chatOrchestrationBridge*.ts` is the precedent).
8. **Mobile-ready constraints bake in from Wave 17.** Every new layout decision considers narrow-viewport, touch-target (≥44px), and no-hover-dependent-UI constraints from the start. Retrofitting mobile later is painful; baking in early is cheap.
9. **Feature-flag every user-visible wave; skip flags for pure infra.** Infra waves (Wave 15, 18, 19, 24 partial) ship on by default because there's nothing to A/B. UX waves (Wave 20, 22, 23, 26, 27, 29, 32) ship off-by-default for a 2-week soak before flipping on.
10. **Defer any item that grows past 2× estimate.** Move it to a later wave rather than stretching the current one. Wave slippage compounds; wave deferral is recoverable.

---

## 4. Arc Overview

| Arc | Waves | Theme | Duration estimate |
|---|---|---|---|
| **A — Foundation** | 15–17 | Instrumentation, session primitive, layout engine | 4–6 months |
| **B — Context Groundwork** | 18–19 | Graph GC, edit provenance, PageRank retrieval | 2–3 months |
| **C — Dual-Mode UX** | 20–23 | Chat-primary, thread organization, message polish, branching | 3–5 months |
| **D — Context Learning & Research** | 24–25 | Decision logging, reranker, research pipeline, pinned context | 2–3 months |
| **E — Agentic Core** | 26–27 | Profiles, inference controls, tool toggles, subagent UX | 2–3 months |
| **F — Composition & Review** | 28–29 | Drag-and-drop panes, diff/graph review | 2–3 months |
| **G — Automation & Learning Tail** | 30–31 | Research auto-firing, learned context ranker (data-gated) | 2–4 months |
| **H — Mobile Reach** | 32–34 | Responsive refinement, native shell, cross-device dispatch | 3–5 months |
| **I — Ecosystem & Platform** | 35–38 | Themes, multi-provider, moat moves, onboarding | 2–3 months |
| **J — Contingent & Cleanup** | 39–40 | Research classifier (if data justifies), system cleanup | 1–2 months |

Arcs describe narrative flow; waves are the shippable unit. Some arcs can parallelize with later arcs (e.g., Arc F can begin during Arc E); see §7 for the dependency graph.

---

## 5. Target Architecture (End State)

After Wave 40, the architecture is:

### 5.1 Core primitives

```
Session (Wave 16+)
 ├─ id, createdAt, archivedAt, lastUsedAt, tags[] (Wave 21)
 ├─ projectRoot (user-selected)
 ├─ worktreePath (isolated copy under .ouroboros/worktrees/<id>) (Wave 16)
 ├─ conversation (thread + side-chat branches + named branches) (Waves 19, 23)
 ├─ layoutPreset ('chat-primary' | 'ide-primary' | 'mobile-primary' | custom) (Wave 17+)
 ├─ profileId (active agent config) (Wave 26)
 ├─ activeTerminals[] (PTY session IDs, tagged to thread via Wave 21)
 ├─ pinnedContext[] (files, research artifacts, graph neighborhoods) (Waves 25, 29)
 ├─ costRollup (cumulative tokens/USD, with subagent attribution) (Waves 21, 27)
 └─ telemetry (correlation IDs, outcome signals, research hits, context decisions)

Window  (one or many viewports onto sessions)
 ├─ bounds, displayId
 └─ activeSessionId  (one session at a time per window)
```

### 5.2 Rendering

```
AppLayout.tsx  (slot shell — six slots preserved)
 └─ LayoutPresetResolver  (Wave 17)
     ├─ 'ide-primary'    → current slot populations
     ├─ 'chat-primary'   → chat in editorContent, session sidebar in leftSidebar (Wave 20)
     ├─ 'mobile-primary' → single-slot responsive, bottom nav (Wave 32)
     └─ custom           → user-authored via drag-and-drop (Wave 28)
```

### 5.3 Context pipeline

```
User prompt / tool need
    │
    ▼
ContextPacketBuilder
    ├─ Features: pinned, diff, provenance-tagged recency, diagnostics, symbol matches,
    │            PageRank score, import adjacency, dependency, graph centrality
    ├─ Scorer  (v1: additive heuristic weights — current)
    │         (v2: provenance-aware weights — Wave 19)
    │         (v3: learned logistic classifier — Wave 31, data-gated)
    ├─ Haiku Reranker (top-30 → top-10, Wave 24, optional)
    ├─ Budget enforcement
    ├─ Pinned context panel (Wave 25 primitive, reused by research)
    └─ Decision log (Wave 24) → telemetry.db (Wave 15)
```

### 5.4 Research pipeline

```
User prompt → Research Trigger Evaluator
    ├─ Rule layer     (slash commands, user toggle, package.json staleness, imports, Wave 25+30)
    ├─ Cache check    (SQLite-backed, per-library TTL)
    └─ (Wave 39)      Classifier / Haiku fallback (contingent)

  → Research Subagent   (forked context, tools: Context7, Ref, GitMCP, web search)
  → Research Artifact   (pinned to Session.pinnedContext, reuses Wave 25 primitive)
  → Main turn proceeds with artifact in context packet

Post-turn outcome observer
  ├─ Next terminal exit code (PTY)
  ├─ Typecheck / lint / test artifacts
  ├─ User correction signals
  └─ Tool-use outcomes (Read/Edit targets matched vs missed)
  → correlated to research invocation and context decisions
  → feeds Wave 30 trigger tuning and Wave 31 classifier training
```

### 5.5 Mobile

Mobile companion app (Wave 33) bundles the same renderer via Capacitor/Tauri Mobile over the existing `webPreload.ts` WebSocket transport, hardened for remote use. Wave 34 adds cross-device session dispatch.

### 5.6 Learning infrastructure

Two independent learned systems sharing telemetry infrastructure:

```
telemetry.db (Wave 15, sibling of graph.db and threads.db)
 ├─ events        (hook events with correlation IDs)
 ├─ outcomes      (tool-use outcomes, exit codes)
 ├─ research_invocations / research_artifacts (Waves 25, 30)
 └─ context_decisions / context_outcomes     (Wave 24)

JSONL mirrors (author's userData directory, 30d retention)
 ├─ router-decisions.jsonl / router-quality-signals.jsonl (EXISTING)
 ├─ events-YYYY-MM-DD.jsonl                               (Wave 15)
 ├─ context-decisions.jsonl / context-outcomes.jsonl      (Wave 24)
 └─ research-decisions.jsonl                              (Wave 25)

Training & hot-reload
 ├─ tools/train-router.py   (EXISTING)                    → router-retrained-weights.json
 ├─ tools/train-context.py  (Wave 31)                     → context-retrained-weights.json
 └─ ResearchClassifier      (Wave 39, contingent)         → research-classifier.bin
```

---

## 6. Current State Snapshot

Grounded from the architecture audit and the context-injection analysis.

| Area | Current state | Gap addressed |
|---|---|---|
| Window ↔ Session | `ManagedWindow` at `windowManager.ts:33-38` conflates window with session | Wave 16 |
| Layout | `AppLayoutSlots` at `AppLayout.tsx:19-26` — 6 named slots, slot-based. `WorkspaceLayout` preset covers sizes/visibility only | Wave 17 |
| Chat orchestration | `AgentChatOrchestrationBridge` at `chatOrchestrationBridge*.ts` (9-file unit). `AgentChatThreadStore.branchThread` does full copy | Wave 23 |
| Hooks | 24 event types at `hooksLifecycleHandlers.ts:52-88`. `HookPayload` at `hooks.ts:39-70` carries rich data. **Not persisted.** | Wave 15 |
| Web build | `webPreload.ts` fully shims `window.electronAPI` over WebSocket. Web mode is **functionally usable** as a browser client | Waves 32–33 |
| Git | `ipc-handlers/git.ts` — ~25 channels. `claudeCliSettings.worktree: boolean` at `configSchema.ts:198`. **IDE does not create/manage worktrees itself.** `refs/ouroboros/checkpoints/{threadId}` checkpoint refs already exist | Wave 16 |
| Telemetry | `perfMetrics.ts:34-43` startup phases. Router decisions JSONL. No hook/outcome persistence. `IndexerCompletedPayload` emitter is unwired dead code (`perfMetrics.ts:179-197`) | Wave 15 |
| Mobile | `MobileNavBar` CSS-hidden in Electron, visible in web mode. No touch-target audit, no responsive layout | Wave 32 |
| Context selector | `contextSelector.ts:61-76` — additive hand-weights, uncapped, uncalibrated. `semantic_match` weighted 45 but no active code path (dead weight). `recent_edit` weighted 32 + `git_diff` 56 double-counts agent churn | Waves 18–19 |
| Graph GC | Stale worktree nodes persist in `.ouroboros/graph.json` from pre-skip-rule index. Incremental reindex only deletes on `fs.access` failure, never on "path now matches skip rule" | Wave 18 |
| Context feedback loop | **None.** Weights are constants. No training signal | Waves 24, 31 |
| Research | **None.** No automatic library-staleness detection, no research subagent, no outcome tracking for research | Waves 25, 30 |
| Profiles | **None.** Model, effort, permission mode, tool set, MCP servers are global | Wave 26 |
| Orchestration inspector | `perfMetrics` shows runtime metrics only. No per-turn orchestration traffic log, no IPC trace, no hook event timeline UI | Wave 15 |

**Known tech debt not directly addressed** (tracked in CLAUDE.md, to be handled opportunistically):
- Double terminal tab bar (TerminalPane + TerminalManager)
- Settings modal inline in `App.tsx` rather than `components/Settings/`
- `internalMcp/` module implemented but not wired into `main.ts` startup
- `streamingInlineEdit` feature flag unremoved post-soak

---

## 7. Dependency Graph

```
Wave 15 — Instrumentation & Observability Foundation
   │
   ├─► Wave 16 — Session Primitive & Worktrees ──┐
   │                                              │
   ├─► Wave 17 — Layout Preset Engine ─────────┐  │
   │       │                                    ▼  ▼
   │       │               Wave 20 — Chat-Primary Layout & Session Sidebar
   │       │                            │
   │       │                            ├─► Wave 21 — Thread Organization
   │       │                            │          │
   │       │                            │          └─► Wave 22 — Message Polish
   │       │                            │
   │       │                            └─► Wave 23 — Side Chats & Branching
   │       │
   │       ├─► Wave 32 — Mobile-Responsive Refinement
   │       │          │
   │       │          └─► Wave 33 — Mobile Shell
   │       │                     │
   │       │                     └─► Wave 34 — Cross-Device Session Dispatch
   │       │
   │       └─► Wave 28 — Drag-and-Drop Pane Composition
   │
   ├─► Wave 18 — Graph GC & Edit Provenance
   │          │
   │          └─► Wave 19 — Context Scoring: PageRank & Provenance-Aware Weights
   │                     │
   │                     └─► Wave 24 — Context Decision Logging & Haiku Reranker
   │                                │
   │                                ├─► Wave 31 — Learned Context Ranker (≥1000 samples gate)
   │                                │
   │                                └─► (feeds Wave 25 outcome correlation)
   │
   ├─► Wave 25 — Research Pipeline (Explicit) & Pinned Context
   │          │
   │          └─► Wave 30 — Research Auto-Firing (≥4 week soak gate)
   │                     │
   │                     └─► Wave 39 — Research Classifier (contingent)
   │
   ├─► Wave 26 — Profiles, Inference Controls, Tool Toggles
   │          │
   │          └─► Wave 27 — Subagent UX
   │
   ├─► Wave 29 — Diff Review, Graph Panel, Hook/Rule Authoring
   │
   ├─► Wave 35 — Theme Import & Customization
   ├─► Wave 36 — Multi-Provider Optionality
   ├─► Wave 37 — Ecosystem Moat
   └─► Wave 38 — Platform & Onboarding ── Wave 40 — System Cleanup & Deprecation
```

**Critical path (sequential, blocks user-visible dual-mode):** 15 → 16 → 17 → 20. Estimated 4–6 months.

**Parallel tracks available:**
- Context quality (18 → 19 → 24 → 31) runs parallel to the dual-mode chain.
- Agentic core (26 → 27), Arc F (28, 29), Arc I (35–38) can start once their prerequisites land and are independent of each other.
- Mobile arc (32 → 33 → 34) starts after Wave 17 and runs parallel to everything else.

---

## 8. Wave Plan

Per-wave format (consistent throughout):

- **Target release** — tentative version bump
- **Dependencies** — upstream waves
- **Feature flag** — flag name and default behavior
- **Goal** — one-sentence objective
- **Motivation** — why now
- **Scope** — concrete deliverables (sub-items where needed)
- **Non-scope** — explicit deferrals
- **Key file touch points** — grounded references
- **Acceptance criteria** — user-observable gates
- **Testing** — unit / integration / manual requirements
- **Risks** — risk → mitigation
- **Exit criteria** — dogfood and measurement gates before declaring done

---

## Arc A — Foundation

### Wave 15 — Instrumentation & Observability Foundation

**Target release:** v1.3.17 (patch)
**Dependencies:** None
**Feature flag:** `telemetry.structured` (default on in dev; opt-in in production for first release cycle)

#### Goal
Establish a structured, persisted event stream correlating agent tool use with observed outcomes, plus an orchestration-traffic inspector UI. Every downstream wave needing measurement depends on this.

#### Motivation
The hook infrastructure already captures 24 event types with rich payloads but dispatches them only in-memory to the renderer. There is no persistence, no correlation between a `pre_tool_use` and the terminal exit code that follows, no outcome tracking for research quality measurement, no context-decision logging infrastructure, no orchestration traffic inspector. The router's JSONL decision log is the only existing event-persistence pattern. Wave 15 generalizes that pattern and adds the user-facing inspector.

#### Scope

**Structured telemetry store:**
- New `src/main/telemetry/telemetryStore.ts` backed by `telemetry.db` (sibling of `graph.db`). Tables:
  - `events(id PK, type, session_id, correlation_id, timestamp, payload JSON)`
  - `outcomes(event_id FK, kind, exit_code, duration_ms, stderr_hash, signals JSON)`
  - `orchestration_traces(id PK, trace_id, session_id, phase, timestamp, payload JSON)` — CLI invocations, stdin, stdout chunks, timing, exit codes
  - `research_invocations(id PK, session_id, trigger_reason, topics JSON, artifact_hash, hit_cache BOOL, latency_ms)` (populated starting Wave 25)
  - `context_decisions(id PK, trace_id, file_id, features JSON, score, included BOOL)` (populated starting Wave 24)
  - `context_outcomes(decision_id FK, kind ('used'|'unused'|'missed'), tool_used)` (populated starting Wave 24)
- WAL mode, 100ms batched-write window, 10 MB per-file cap on mirrors.

**Correlation ID plumbing:**
- Extend `HookPayload` in `src/main/hooks.ts` with `correlationId` (UUID v7 for temporal sortability).
- Thread the router's existing `traceId` through `buildContextPacket()`. Context decisions share `traceId` with the routing decision for the same turn.
- Emission side in `hooks.ts:143` gains a `telemetryStore.record()` call.

**Outcome observer:**
- New `src/main/telemetry/outcomeObserver.ts`. Subscribes to PTY exit events from `src/main/pty.ts`, to `conflictMonitor` signals, and to typecheck/lint/test runner artifacts under `.ouroboros/outcomes/` if present.
- Correlates to the most recent `post_tool_use` for the same session/cwd within a configurable window (default 30s). Stores a confidence score (exact timestamp match = high, window match = medium).

**Orchestration inspector UI:**
- New `src/renderer/components/Observability/OrchestrationInspector.tsx` + sub-views:
  - Traffic tab — each CLI invocation, stdin, stdout chunks, timing, exit code
  - Hook event timeline — per-session, per-correlationId tree view
  - IPC trace viewer — main↔preload↔renderer flows, filterable by channel
  - Decision viewer — router decisions, context decisions (Wave 24), research invocations (Wave 25)
- Accessible via command palette ("Show Orchestration Inspector") and a status-bar icon.
- Export-as-JSON action for any trace (HAR-like format for bug reports).

**Append-only JSONL mirrors:**
- `{userData}/telemetry/events-YYYY-MM-DD.jsonl` rotated daily, 30-day retention.
- Matches existing router JSONL convention so external analysis tools work uniformly.

**Session-replay scaffold (read-only):**
- A captured trace can be reloaded into the inspector in read-only mode. Full replay (re-running the session) is out of scope; just structured playback of events.

#### Non-scope
- No behavioral change to hook emission itself — purely additive persistence.
- Hook-authoring UI — Wave 29.
- Session replay that actually re-executes — potentially a later wave; only structured event playback here.

#### Key file touch points
- `src/main/hooks.ts` — add `correlationId` to `HookPayload`, wire telemetry store
- `src/main/pty.ts` — emit structured exit events on process termination
- `src/main/main.ts` / `mainStartup.ts` — initialize `telemetryStore` in service-ready phase
- `src/main/telemetry/*` — new module
- `src/main/orchestration/contextTypes.ts` (new) — `ContextDecision`, `ContextFeatures`, `ContextOutcome`, `EditProvenance` types; storage path constants
- `src/main/orchestration/contextPacketBuilder.ts` — add `traceId` parameter (signature only; content waits for Wave 24)
- `src/main/orchestration/contextSelector.ts` — extend `SelectionReason` with optional `provenance?: EditProvenance` and `pagerank_score?: number` fields (signature only)
- `src/main/agentChat/chatOrchestrationBridgeSend.ts` — pass existing router `traceId` into context builder
- `src/preload/preload.ts` — expose `telemetry:*` and `observability:*` IPC for the inspector
- `src/renderer/components/Observability/*` — new module

#### Acceptance criteria
- Every hook event in a session is persisted with a unique `correlationId`.
- Every terminal exit is captured as an `outcome` row, linkable to the triggering `post_tool_use` when the correlation window applies.
- Orchestration inspector renders last 100 events for the active session with correlation lines drawn.
- `tsc --noEmit` clean with new context types; no behavior change in context selection (content waits for later waves).
- JSONL mirror files exist, parseable externally.
- Startup regression < 50 ms added to service-ready phase.

#### Testing
- Unit: `telemetryStore` CRUD, correlation resolver, retention policy, inspector filters.
- Integration: hook emission → store write → inspector read.
- Soak: one author-week with structured query validation.

#### Risks
- **SQLite write contention** during burst tool calls → WAL mode + batched 100ms flush.
- **Disk growth** → per-file size cap, retention purge in Settings.
- **Correlation false positives in rapid-fire sessions** → per-session scoping + confidence score.
- **Inspector performance on sessions with 10K+ events** → virtualized lists, server-side filter/query.

#### Exit criteria
- Author-week dogfood with < 1 correlation error observed in review.
- Inspector responsive on sessions with 10K+ events.
- Schema stable enough for Wave 16 session attribution and Wave 24 context decision logging without migration.

---

### Wave 16 — Session Primitive & Worktree Isolation

**Target release:** v1.4.0 (minor — first user-visible parallel capability)
**Dependencies:** Wave 15
**Feature flag:** `sessions.worktreePerSession` (default off for one release, then default on)

#### Goal
Extract a `Session` abstraction from `ManagedWindow`. Give each session an isolated git worktree under `.ouroboros/worktrees/<id>/`. Unblock parallel agent work on the same project without working-copy collisions.

#### Motivation
Today the author queues two agents behind a third because the shared working copy prevents parallel execution. Worktrees solve this structurally — each session gets a full working-copy clone tied to the same git repo, with changes isolated until merge. Claude Code Desktop's `.claude/worktrees/<id>` pattern is the reference.

#### Scope
- New `src/main/session/session.ts` defining the `Session` primitive (§5.1 target). Serialized under a new `sessions` electron-store key (migrated from `windowSessions`).
- New `src/main/session/worktreeManager.ts` wrapping `git worktree add/list/remove`. Worktrees under `${projectRoot}/../.ouroboros/worktrees/<session-id>/` to avoid polluting the project directory.
- `ManagedWindow` refactored to hold `activeSessionId: string` instead of `projectRoot`/`projectRoots` directly. `windowManager.ts:33-38` loses those fields; session lookup goes through the new session store.
- Migration: existing `windowSessions` entries convert to `Session` records on first launch of v1.4. The first conversion does **not** create a worktree (worktrees are opt-in per session initially), preserving the behavior of "this window operates on the real working copy."
- `claudeCliSettings.worktree: boolean` at `configSchema.ts:198` becomes per-session rather than global.
- Session lifecycle hooks: `session.created`, `session.activated`, `session.archived`. Emitted to Wave 15 telemetry.
- Background-session capability: a session can exist without a window (queued but not yet visible). This is the primitive Wave 20's sidebar queues on top of.
- Git checkpoint integration: `chatOrchestrationBridgeGit.ts:33-60` continues to write `refs/ouroboros/checkpoints/{threadId}`, now scoped per session's worktree.

#### Non-scope
- Session sidebar UI — Wave 20.
- Cross-session merge / rebase UX — manual git operation initially; potential later refinement.
- Worktree garbage collection beyond manual cleanup — lazy weekly GC scoped in Wave 20.

#### Key file touch points
- `src/main/windowManager.ts` — refactor `ManagedWindow`
- `src/main/config.ts` / `configSchema.ts` — new `sessions` key, migration from `windowSessions`
- `src/main/session/*` — new module
- `src/main/ipc-handlers/git.ts` — add `git:worktreeAdd` / `git:worktreeRemove` / `git:worktreeList` channels
- `src/main/pty.ts` — `spawnClaude` resolves `cwd` from session worktree
- `src/main/codebaseGraph/graphController.ts` — graph state keyed by session ID + content hash

#### Acceptance criteria
- Three sessions can run concurrent agent turns on the same git repo without working-copy collision.
- Each session's terminal `pwd` resolves to its worktree, not the shared project root.
- Existing window layouts and project-root persistence survive migration without user intervention.
- Session lifecycle events fire and persist via Wave 15 telemetry.
- Worktrees clean up on session archive when flag is on; warn otherwise.
- `git worktree list` from any session's terminal confirms real git-layer isolation.

#### Testing
- Unit: `worktreeManager` add/remove/list, session store CRUD, migration.
- Integration: two sessions run `npm test` concurrently — both succeed, neither sees the other's file modifications.
- Integration: kill Ouroboros mid-session; relaunch restores sessions without orphaned worktrees.
- Manual: one author-week dogfood running 3+ parallel sessions.

#### Risks
- **Disk usage** — 20 worktrees × ~500 MB = ~10 GB. Mitigation: opt-in per session; warn if free disk < 5 GB.
- **node_modules** — per-worktree installs. Mitigation: document pnpm store-based model for multi-worktree; offer symlink-from-main-copy for read-only access (opt-in).
- **Native module rebuilds** — electron-rebuild per-worktree. Mitigation: symlink with warning if main copy has `node_modules/`.
- **Graph indexer cost** — N worktrees multiply indexing. Mitigation: graph state keyed by `(projectRoot, worktreeHash)`; identical working copies share graph state.
- **Migration regression** — mitigation via idempotent migration with read-only fallback to `windowSessions` for 2 releases.

#### Exit criteria
- Author-week dogfood running 3+ parallel agent sessions without collision or data loss.
- Migration validated on 3+ pre-existing config files.
- Wave 15 telemetry confirms session lifecycle events.

---

### Wave 17 — Layout Preset Engine

**Target release:** v1.4.1 (patch — rendering refactor, minimal user-facing change)
**Dependencies:** Wave 16
**Feature flag:** `layout.presets.v2` (default off until Wave 20 is ready)

#### Goal
Formalize `WorkspaceLayout` into a first-class preset engine capable of swapping slot population, panel sizing, and visibility atomically. Substrate for chat-primary, IDE-primary, mobile, and drag-and-drop presets.

#### Motivation
A preset concept exists (`WorkspaceLayout` + `LayoutSwitcher` at `AppLayout.tsx:73-76`) but operates only over panel sizes and visibility, not over *which components populate which slots*. Chat-primary needs the chat component in `editorContent` while `AgentCards` moves to a collapsible right drawer — a slot-population swap the current system cannot express.

#### Scope
- New `src/renderer/components/Layout/layoutPresets/` module. Presets are typed:
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
- Built-in presets: `ide-primary` (current default), `chat-primary` (scaffold for Wave 20), `mobile-primary` (scaffold for Wave 32).
- `LayoutPresetResolver` — React context provider reading the active session's preset and resolving slot components, sizes, visibility.
- Preset persistence per session (Wave 16 `Session.layoutPresetId`). Global default preset in Settings.
- Migration: existing users land on `ide-primary` matching their current layout. `localStorage` `agent-ide:panel-sizes` migrates into each user's `ide-primary` preset copy.
- `LayoutSwitcher` in the status bar becomes the preset switcher. "Save current layout as…" becomes "Create custom preset based on…".
- Responsive breakpoints scaffolding — each preset declares a minimum viewport width with fallback. Wave 32 populates actual mobile rules.
- Sidebar resize ceiling lift (Piebald #4) — raise the 600px right-sidebar max when no editor is open; implemented as a `chat-primary` preset default.

#### Non-scope
- Drag-and-drop rearrangement — Wave 28.
- Full mobile preset — Wave 32.
- User-authored custom panes — out of scope for the roadmap.
- The `display:none` trick preserving chat state (`AppLayout.tsx:308`) stays; resolver honors it.

#### Key file touch points
- `src/renderer/components/Layout/AppLayout.tsx` — inject resolver, consumers read through it
- `src/renderer/components/Layout/layoutPresets/*` — new module
- `src/renderer/hooks/useResizable.ts` and `usePanelCollapse.ts` — consume resolver defaults
- `src/renderer/components/StatusBar/LayoutSwitcher.tsx` — adapt
- `src/main/session/session.ts` — add `layoutPresetId` field
- `src/renderer/types/electron.d.ts` — expand session type

#### Acceptance criteria
- Existing users experience no visible layout change on upgrade.
- Dev-only `debug-primary` preset demonstrates slot-population swap.
- Streaming chat state survives preset switches (`display:none` invariant holds).
- Panel sizes persist per session and per preset.
- Per-session preset selection survives app restart.

#### Testing
- Unit: preset resolver slot resolution, panel-size layering, migration from legacy `panelSizes`.
- Integration: preset switch during active chat streaming — no flicker or state loss.
- Integration: two sessions with different presets in different windows render correctly.
- Snapshot: each preset rendered in isolation.

#### Risks
- **Preset churn during streaming** → stable component keys, preserve `display:none` pattern.
- **User layout loss on migration** → idempotent migration, legacy `localStorage` preserved as fallback for one release.
- **Custom preset sprawl** → switcher shows most-recent-5 by default; full list in sub-menu.

#### Exit criteria
- Author-week dogfood with `ide-primary` confirming zero regressions.
- Dev-only `debug-primary` preset demonstrates slot-population swap.

---

## Arc B — Context Quality Groundwork

### Wave 18 — Graph GC & Edit Provenance

**Target release:** v1.4.2 (patch)
**Dependencies:** Wave 15 (types from context scaffolding)
**Feature flag:** `context.provenanceTracking` (default on — additive only)

#### Goal
Fix the stale-worktree graph hotspots bug and tag edits by origin (agent vs user) so later waves' recency signals stop double-counting the agent's own churn.

#### Motivation
Two concrete problems:

1. **Stale worktree nodes** persist in `.ouroboros/graph.json` from a pre-skip-rule index. `graphQueryArchitecture.ts:63-75` filters them by path regex at query time but doesn't purge the store. Incremental reindex (`graphController`) only evicts nodes on `fs.access` failure — never on "path now matches skip rule." Stale nodes are immortal and surface in hotspots.
2. **Edit provenance unknown.** The context scorer weights `recent_edit` at 32 and `git_diff` at 56 (`contextSelector.ts:61-76`). When the agent did all the editing, these weights double-count the agent's own churn and promote files that have nothing to do with the current turn. Wave 19 rebalances weights, but only once provenance is known.

#### Scope

**Graph GC (Phase 1 of context-injection overhaul):**
- Modify `src/main/codebaseGraph/graphParserShared.ts` — export `isPathSkipped(path)` combining `SKIP_DIRS` + `isWorktreePath`.
- Modify `graphController` `loadFromDisk` — iterate nodes, drop any whose `filePath` matches `isPathSkipped`. Log purged count.
- Modify `reindexSingleFile` to delete nodes when path now matches skip rule.
- One-time migration flag in `.ouroboros/graph.json` meta (`schema: 2`) so purge runs once per upgrade.

**Edit provenance (Phase 2 of context-injection overhaul):**
- New `src/main/orchestration/editProvenance.ts` — in-memory ring buffer keyed by absolute path → `{ lastAgentEditAt, lastUserEditAt }`. Persisted to `{userData}/edit-provenance.jsonl` (append-only, compacted on load).
- Hook agent writes: in `chatOrchestrationBridgeSend.ts` tool-call dispatch (where `Write`/`Edit`/`NotebookEdit` results return), call `markAgentEdit(path)`.
- Hook user writes: extend `nativeWatcher.ts` to call `markUserEdit(path)` when no recent agent edit sits within a 2 s window for that path.
- Expose `getEditProvenance(path)` to `contextSelector`.

#### Non-scope
- Weight rebalance — Wave 19.
- Commit-author-based provenance (from git) — covered by the agent-commit trailer detection in Wave 19 as a secondary signal.
- Rewriting the graph indexer — GC only touches existing store.

#### Key file touch points
- `src/main/codebaseGraph/graphParserShared.ts`
- `src/main/codebaseGraph/graphController.ts`
- `src/main/codebaseGraph/graphParser.ts`
- `src/main/orchestration/editProvenance.ts` (new)
- `src/main/orchestration/editProvenance.test.ts` (new)
- `src/main/nativeWatcher.ts`
- `src/main/agentChat/chatOrchestrationBridgeSend.ts`

#### Acceptance criteria
- After upgrade + one session, `buildHotspots()` returns zero `.claude/worktrees/*` entries.
- Synthetic worktree-node unit test verifies eviction.
- Integration test simulates 1 agent edit + 1 user edit on the same file, then queries provenance — both timestamps present.
- Manual: after a full agent-driven turn, no file has `lastUserEditAt` within the last minute.

#### Testing
- Unit: `isPathSkipped`, `editProvenance` CRUD + compaction.
- Integration: graph startup purge with synthetic stale nodes; provenance race conditions between tool-call callback and fs watcher.

#### Risks
- **Overzealous graph purge** deletes live nodes → allowlist-first approach + log diff of purged paths before commit.
- **Watcher-vs-tool-call race** on provenance → 2 s debounce window; validate in real-world use.

#### Exit criteria
- Hotspots display is worktree-noise-free for one full author-week.
- Provenance data accumulates cleanly with <1% unknown-provenance rate in author sessions.

---

### Wave 19 — Context Scoring: PageRank & Provenance-Aware Weights

**Target release:** v1.5.0 (minor — context quality improvement)
**Dependencies:** Wave 18
**Feature flag:** `context.pagerank` + `context.provenanceWeights` (both default on)

#### Goal
Replace the agent-churn-double-counting weights with provenance-aware scoring, and wire the symbol graph into retrieval via weighted personalized PageRank (Aider-style).

#### Motivation
`recent_edit` + `git_diff` doubled-count the agent's own churn. `semantic_match` is weighted 45 but has no active code path (dead weight). The graph is indexed and queried for hotspots but not used for retrieval — Aider's entire value prop is PageRank over the same kind of graph.

#### Scope

**Weight rebalance (Phase 3 of context-injection overhaul):**
- `contextSelector.ts` — split `recent_edit` into `recent_user_edit` (weight 32) and `recent_agent_edit` (weight 4).
- Split `git_diff` similarly — if all diff commits are agent-authored (detect via `Co-Authored-By: Claude` commit trailer or hook metadata), weight 12 instead of 56.
- Remove dead `semantic_match` weight (45) until the PageRank scoring below replaces it.
- Unit tests covering pure-agent-edit, pure-user-edit, and mixed cases.

**PageRank repo map (Phase 4 of context-injection overhaul):**
- New `src/main/codebaseGraph/graphPageRank.ts` — weighted personalized PageRank over existing node/edge store. Personalization vector = pinned files + symbol matches from user goal + diagnostic files.
- Cache results per (seed-set hash, graph-version) with 60 s TTL.
- Wire into `contextSelector.ts` as new reason `pagerank` (weight dynamic — normalized rank × 40). Returns top-N files not already in the set.
- Expose `pagerank_score` in XML `<file>` attributes for observability.
- Deprioritize isolated self-loops (weight 0.1, Aider convention).

#### Non-scope
- Decision/outcome logging — Wave 24.
- Haiku reranker — Wave 24.
- Learned classifier — Wave 31 (data-gated).
- Lean packet mode — Wave 31.

#### Key file touch points
- `src/main/orchestration/contextSelector.ts`
- `src/main/orchestration/contextSelectorHelpers.ts`
- `src/main/orchestration/contextSelector.test.ts`
- `src/main/codebaseGraph/graphPageRank.ts` (new)
- `src/main/codebaseGraph/graphPageRank.test.ts` (new)
- `src/main/codebaseGraph/graphController.ts` — version counter for cache invalidation

#### Acceptance criteria
- In a recorded all-agent session, `<relevant_code>` no longer promotes files the agent just touched unless they have other signals.
- Golden-file test captures new ranking for 3 synthetic scenarios (pure-agent, pure-user, mixed).
- On a target-file rename, PageRank surfaces its top callers in `<relevant_code>` within one turn.
- PageRank benchmark on the project's own graph completes < 200 ms.

#### Testing
- Unit: weight math with every reason combination; PageRank seed-set + convergence.
- Integration: full turn with agent-tagged provenance produces measurably different ranking vs untagged.
- Benchmark: PageRank compute time vs graph size.

#### Risks
- **PageRank performance on large graphs** → cache + early termination; deprioritize isolated nodes.
- **Hand-tuned weights still hand-tuned** → acknowledged interim state; Wave 31 replaces with learned model.
- **Author-bias in golden files** → test the scoring harness with synthetic provenance to reduce bias.

#### Exit criteria
- One author-week dogfood with `<relevant_code>` visibly improved (measured by reduced agent re-reads of files not in the packet).
- No performance regression on large-repo context packet build.

---

## Arc C — Dual-Mode UX

### Wave 20 — Chat-Primary Layout & Session Sidebar

**Target release:** v1.5.1 (minor — major new view mode)
**Dependencies:** Waves 16, 17
**Feature flag:** `layout.chatPrimary` (default off at release; opt-in via command palette; default on after 2 weeks of dogfood)

#### Goal
Make chat-primary the Ouroboros-equivalent of Claude Code Desktop's Code tab — chat as central surface, session sidebar listing parallel work, IDE capabilities as collapsible side panes rather than always-on. Add the keyboard-accessibility and dedicated-chat-window options from the piebald analysis.

#### Motivation
User-visible payoff for Arc A. Dual-mode is the single most-requested UX evolution and the Claude Code Desktop redesign confirms the category direction. The sidebar over Wave 16's session primitive turns parallel worktrees from "a thing that exists" into "a thing I can see and drive."

#### Scope

**Chat-primary preset (layout side):**
- Preset definition — chat in `editorContent`, session sidebar in `sidebarContent`, `AgentCards` in a collapsible right drawer (`display:none` preserved), terminal in `terminalContent` (collapsible), file editor as a secondary tab alongside chat.
- Keyboard shortcut `Ctrl+Shift+L` / `⌘+Shift+L` to toggle between `ide-primary` and `chat-primary` for the active session.
- Command palette: "Switch to Chat-Primary Layout" / "Switch to IDE-Primary Layout".

**Dedicated chat window (piebald Option C):**
- Optional secondary `BrowserWindow` running the `chat-primary` preset, bound to a session. Toggle via View menu and `Ctrl+Shift+O`.
- Shared thread state with the main window (session is the shared primitive).

**Session sidebar UI:**
- New `src/renderer/components/SessionSidebar/` tree.
- Lists all sessions, grouped by project root by default.
- Filters: status (active / archived / queued / errored), project, worktree state (clean / dirty).
- Create-new-session button → project picker + "use worktree" toggle.
- Session switching preserves target session's preset.
- Worktree garbage collection: on session archive, worktree removed with 7-day `.trash/` grace.
- Lazy GC task runs weekly to purge archived session worktrees past grace period.
- Virtualized rendering at > 20 sessions (reuses `VirtualizedMessageList` patterns).

**AgentMonitor integration:**
- Default: collapsible right drawer with Verbose / Normal / Summary view modes.
- Per-session opt-in "surface selected event types inline in chat" with curated defaults (`pre_tool_use` for edit/write, `post_tool_use_failure`, `user_prompt_submit`, `notification`).
- Noisy event types (`file_changed`, `cwd_changed`) default to drawer-only.
- View-mode preference captured via Wave 15 telemetry.

**Accessibility (piebald #81, #82):**
- Keyboard-only navigation audit of `AgentChatWorkspace` — every interactive element reachable by Tab, Shift+Tab, Arrow, Enter, Space.
- Screen-reader labels on streaming tool cards.
- Focus management on session switch and preset toggle.

#### Non-scope
- Side chats — Wave 23.
- Drag-and-drop pane rearrangement — Wave 28.
- Mobile-specific chat-primary adjustments — Wave 32.
- Thread tags, search, folders — Wave 21.
- Message polish (quoting, raw markdown, reactions, etc.) — Wave 22.

#### Key file touch points
- `src/renderer/components/SessionSidebar/*` (new)
- `src/renderer/components/Layout/layoutPresets/chatPrimary.ts` (new)
- `src/renderer/components/AgentChat/*` — split rendering for chat-primary (center) vs ide-primary (sidebar); extract a `ChatView` primitive
- `src/renderer/components/AgentMonitor/` — view-mode selector, inline-event opt-in
- `src/main/session/session.ts` — add `agentMonitorSettings` sub-record
- `src/main/windowManager.ts` — support "dedicated chat window" secondary browser window

#### Acceptance criteria
- `⌘+Shift+L` swaps layouts cleanly; active streaming chat uninterrupted.
- 3+ sessions visible in sidebar with correct status, project, worktree state.
- Dedicated chat window opens and binds to a session; thread state shared with main window.
- AgentMonitor drawer toggles; inline events appear per user settings.
- View mode switching updates visible event density without losing history.
- Keyboard navigation: sidebar and chat fully keyboard-accessible.
- Screen reader announces session switches and streaming state transitions.

#### Testing
- Integration: create 3 sessions, switch between them, verify isolation of terminal/chat/file state.
- Integration: stream in session A, switch to B, switch back — stream state preserved.
- Accessibility: axe-core scan on chat-primary; manual NVDA/VoiceOver pass.
- Manual: 2-week author dogfood comparing ide-primary vs chat-primary for typical workflows.

#### Risks
- **Muscle memory break** → chat-primary off by default for 2 weeks; one-click reversible.
- **AgentMonitor noise overwhelms chat** → opt-in per event type; curated safe defaults; view-mode escape hatch.
- **Session sidebar performance at scale** → virtualize > 20 sessions.
- **Worktree GC accidents** → 7-day `.trash/` grace, confirmation if uncommitted changes, one-click restore.

#### Exit criteria
- 2-week author dogfood with chat-primary as daily driver, documented pros/cons.
- Feature-flag default flipped to on after dogfood if no regressions.
- `docs/` update describing both layouts.

---

### Wave 21 — Thread Organization

**Target release:** v1.5.2 (patch)
**Dependencies:** Wave 20
**Feature flag:** `threads.organization` (default on — additive, low-risk)

#### Goal
Ship the full thread-organization surface: tags (auto + manual), full-text search, pinning/starring, folders, export, import, and cumulative cost tracking per thread and across threads. Also tag terminal sessions to their chat thread.

#### Motivation
Piebald Wave 3. Once parallel sessions exist (Wave 16/20), users need to find and organize them. A sidebar listing 50 sessions without tags or search is noise.

#### Scope

**Tags (piebald #16):**
- Auto-tag derivation: files touched, tools used, language detected, git branch, active profile (Wave 26).
- Manual override: user can add/remove tags from session and thread.
- Tag filter in session sidebar.
- Schema change in `threads` table: add `tags JSON` column (migration v4 of threads.db).

**Full-text search (piebald #18):**
- SQLite FTS5 virtual table over messages + tags + filenames in the thread.
- Command palette "Search threads…" opens dedicated search UI.
- Per-session scoped search and global search.
- Search results link deep into message positions.

**Pinning / starring + archive vs delete (piebald #19):**
- Pin/star separate from archive — pinned stays visible in sidebar; archive hides; delete removes entirely.
- Soft delete with 30-day undelete grace.

**Folders / workspaces (piebald #20):**
- Session grouping. Default: auto-group by project root. Custom: user-created folders.
- Drag-and-drop sessions between folders in sidebar.

**Export / Import (piebald #21, #22):**
- Export single thread as markdown, JSON, or self-contained HTML.
- Import: paste a transcript or drop a JSON file; hydrates as a new thread.
- Round-trip test: export → import produces an equivalent thread.

**Cumulative cost tracking (piebald #17):**
- Per-thread cost rollup (tokens in/out, USD estimate) — aggregates from existing `claudeUsagePoller` data.
- Global "usage dashboard" panel in Settings showing per-thread and total over time ranges.
- Integrates with subagent cost attribution (Wave 27).

**Terminal session tagging (piebald #77):**
- Attach a terminal to a chat thread. Terminal output appears in a "Terminals" sub-pane of the thread, plus optionally inline.
- Terminal close does not delete the log; it becomes part of the thread history.

**Deep-link permalinks (piebald #12):**
- `thread://<id>#msg=<id>` URL scheme. Command palette "Go to thread…" resolves these.
- Copy-permalink action on any message.

#### Non-scope
- Thread sharing / collaboration beyond single-user export — out of scope for roadmap.
- Team-scoped tag conventions — out of scope.

#### Key file touch points
- `src/main/agentChat/threadStore.ts` — v4 schema migration: `tags` column, FTS5 virtual table
- `src/main/agentChat/threadStoreSearch.ts` (new)
- `src/main/agentChat/threadTagger.ts` (new) — auto-tag derivation
- `src/renderer/components/SessionSidebar/*` — filter UI, folder UI
- `src/renderer/components/Search/ThreadSearch.tsx` (new)
- `src/renderer/components/UsageDashboard/*` (new)
- `src/main/claudeUsagePoller.ts` — expose per-thread rollup API
- `src/main/pty.ts` — terminal-to-thread binding

#### Acceptance criteria
- Tags auto-derive on thread creation; user can override.
- Search returns results in < 200 ms on 1 000-thread corpus.
- Pin/star, archive, delete behave as specified; soft-delete undo works.
- Export → import round-trip equivalent.
- Cost dashboard shows per-thread and total rollups.
- Terminal session output surfaces in thread view.
- Permalinks resolve deterministically.

#### Testing
- Unit: auto-tag derivation, FTS5 indexing, export/import round trip, permalink resolution.
- Integration: 1 000-thread corpus search perf test.
- Migration: threads.db v3 → v4 on real author data.

#### Risks
- **Migration of existing threads.db** → idempotent; preserve v3 read-only fallback for one release.
- **FTS5 index size** → periodic rebuild; scope to recent N threads if size problematic.
- **Auto-tag noise** — too many tags → cap per-thread tag count at 10, user can prune.

#### Exit criteria
- 2-week author dogfood with active use of search and tags.
- Exported/imported thread validated on a second machine.

---

### Wave 22 — Message Polish & UX Refinement

**Target release:** v1.6.0 (minor)
**Dependencies:** Wave 20
**Feature flag:** `chat.messagePolish` (default on — additive polish)

#### Goal
Ship the full message-level UX polish set from the piebald analysis: quoting, raw markdown toggle, reactions, clickable file references, desktop notifications, collapsing, re-run, citation hover cards, copy actions, density toggle.

#### Motivation
Piebald Wave 1. This is the "we sweat details" signal — polish features that collectively transform the chat experience without architectural changes. Most are independent; few have dependencies beyond message schema.

#### Scope

**Message interactions:**
- **Message quoting (piebald #6)** — select assistant text, "Quote" injects a blockquote into the composer with an authorship attribution.
- **Raw markdown toggle (piebald #7)** — per-message card toggle revealing raw markdown source.
- **Message reactions (piebald #8)** — 👍/👎 (and optional custom) stored on message records. Serves as early signal for Wave 31 training.
- **Clickable file references (piebald #9)** — regex-scan assistant output for paths and `file:line:col` forms; make them clickable. Uses the same resolver the terminal uses.
- **Message collapsing (piebald #13)** — fold long tool outputs and thinking blocks by default (threshold configurable).
- **Copy-as-markdown / Copy-as-plain (piebald #11)** — per-message actions.
- **Re-run from message (piebald #14)** — retry same prompt with different model/effort. Always creates a branch (never destructive).
- **Inline citation badges (piebald #15)** — hover card with file snippet when agent cites a file.
- **Chat density toggle (piebald #5)** — compact vs comfortable spacing.

**Notifications (piebald #10):**
- Desktop notifications on stream completion when the window is unfocused.
- Respect OS "Do Not Disturb." Configurable per-session in Settings.
- Uses Electron's native `new Notification(...)` (no third-party dependency).

#### Non-scope
- Thread-level organization (tags, search, folders) — Wave 21.
- Branching UX beyond "re-run from message branches" — Wave 23.
- Keyboard shortcuts for message actions — covered in Wave 20's accessibility pass.

#### Key file touch points
- `src/main/agentChat/threadStore.ts` — message schema additions (reactions column, collapsed-by-default flag)
- `src/renderer/components/AgentChat/MessageCard/*` — most new surfaces
- `src/renderer/components/AgentChat/FileRefResolver.ts` (new) — shared with terminal
- `src/main/notifications.ts` (new or extend existing)

#### Acceptance criteria
- Each polish item from the scope list works per its piebald description.
- No regression in message rendering performance (> 500 messages per thread).
- Desktop notifications respect OS DND and fire only when unfocused.

#### Testing
- Unit: file-ref regex on a corpus of real agent outputs (no false positives on Markdown).
- Manual: 1-week author dogfood touching every polish feature.
- Perf: 1 000-message thread scroll test.

#### Risks
- **Clickable-reference false positives** → strict regex that requires path separators or `:line` form.
- **Reactions data adds noise to training signals** → keep reactions separate from outcome labels; they're a secondary signal for Wave 31.

#### Exit criteria
- Dogfood confirms all polish items land cleanly.
- Message render perf unchanged on large threads.

---

### Wave 23 — Side Chats & Branching

**Target release:** v1.6.1 (patch)
**Dependencies:** Wave 20
**Feature flag:** `chat.sideChats` + `chat.branchingPolish` (both default on — additive)

#### Goal
Ship two conversation-forking primitives: side chats (lightweight `⌘+;` branch that doesn't pollute main) and named branches (current `branchThread` full-copy gets proper UI). Visual branch indicators, named branches, branch tree view, branch comparison.

#### Motivation
Two distinct patterns, same chat surface:

1. **Side chats** — the "quick question without derailing" pattern from Claude Code Desktop (`⌘+;`). Mid-implementation, need to verify a fact or explore a tangent. Cheap UX win.
2. **Branching** (piebald Wave 4) — the existing `branchThread` full-copy mechanism lacks visual indicators, names, and a tree view. "Branch 2" is meaningless; "with JSON output" is useful.

Both share the chat UI and the underlying thread-forking machinery, so they ship together.

#### Scope

**Side chats (prior Wave 19):**
- Keyboard shortcut `⌘+;` / `Ctrl+;` opens a side chat over the active session.
- Side chat shares the main thread's pinned context (research artifacts, system prompt) but does NOT persist back unless the user explicitly invokes "Merge into main."
- New `forkThread(threadId, includeHistory: boolean): SideThread` — lightweight, references parent thread's messages by ID range rather than copying them.
- UI: modal-style drawer, closable with `Esc`. Multiple side chats simultaneously; tab bar at drawer top.
- "Merge into main" action: appends LLM-generated summary (user-editable) as a system message, plus optional inclusion of specific side-chat messages.
- Telemetry via Wave 15.

**Branching polish (piebald Wave 4):**
- **Visual branch indicator (piebald #23)** at the branch point — a diverging arrow with the branch names.
- **Named branches (piebald #24)** — rename default "branch 2" to any string. Rename action in message context menu.
- **Branch tree view (piebald #25)** — tab bar or mini-map showing all branches in the active thread.
- **Branch comparison (piebald #26)** — side-by-side diff of two branches' outputs.
- **Auto-branch on edit (piebald #27)** — edit-and-resend always branches (never destructive).

#### Non-scope
- Persistent side chats surviving app restart — side chats are session-scoped and ephemeral; revisit if telemetry shows need.
- Cross-session side chats — a side chat belongs to one session and one main thread.
- Branch merging of diverged implementations — out of scope (git does this for actual code; thread branches are for conversation exploration).

#### Key file touch points
- `src/main/agentChat/threadStore.ts` — new `forkThread` method, branch metadata (name, parent message ID)
- `src/renderer/components/AgentChat/SideChatDrawer.tsx` (new)
- `src/renderer/components/AgentChat/BranchTreeView.tsx` (new)
- `src/renderer/components/AgentChat/BranchIndicator.tsx` (new)
- `src/renderer/hooks/useSideChat.ts` (new)
- `src/main/agentChat/chatOrchestrationBridge*.ts` — recognize side-thread and branch IDs in routing

#### Acceptance criteria
- `⌘+;` opens a side chat; main thread unchanged on close.
- "Merge into main" adds a single system message summarizing the side chat.
- Multiple simultaneous side chats navigable via drawer tab bar.
- Named branches persist; renaming updates all references.
- Branch tree view renders threads with > 5 branches clearly.
- Branch comparison shows side-by-side diff.
- Auto-branch-on-edit: edit-resend creates a branch, original preserved.

#### Testing
- Unit: `forkThread` — new thread ID, lightweight references resolve.
- Integration: side chat uses parent's pinned context but not recent messages unless opted in.
- Integration: branch tree rendering with 10+ branches.

#### Risks
- **Context overhead in side chats** → default is minimal context (pinned + system prompt); user opts in to include recent messages.
- **Accidental main-thread pollution** → explicit "Merge into main" button, never implicit.
- **Branch UI clutter with > 20 branches** → collapse tree view; allow archiving branches.

#### Exit criteria
- Side-chat usage > 5 % of chat sessions (below that, reconsider feature).
- Branch tree view tested on a thread with 15+ branches.

---

## Arc D — Context Learning & Research

### Wave 24 — Context Decision Logging & Haiku Reranker

**Target release:** v1.7.0 (minor)
**Dependencies:** Waves 15, 19
**Feature flag:** `context.decisionLogging` (default on) + `context.rerankerEnabled` (default on)

#### Goal
Start collecting context decisions and outcomes (groundwork for Wave 31's learned ranker) and add a Haiku reranker over top-30 candidates → top-10, serving as a quality improvement while the learned model accumulates training data.

#### Motivation
The learned ranker (Wave 31) requires ≥1 000 labeled samples. Wave 24 is the data collection start. In parallel, a Haiku reranker is a cheap, proven quality uplift (Cody ships a pointwise ranker) that doesn't need training data.

#### Scope

**Decision + outcome logging (Phase 5 of context-injection overhaul):**
- New `src/main/orchestration/contextSignalCollector.ts` — on packet build, emit `ContextDecision` lines (traceId, fileId, features, final score, included: bool) to Wave 15 telemetry store.
- Per-turn outcome aggregator — subscribe to tool-call stream for the turn. When turn ends, emit `ContextOutcome` per file:
  - `used` — agent Read/Edited a file in the packet
  - `missed` — agent Read/Edited a file NOT in the packet (negative signal)
  - `unused` — in packet, not touched
- Append to `{userData}/context-decisions.jsonl` and `context-outcomes.jsonl`. Reuse `traceId` established in Wave 15.
- Rotation at 10 MB per file, matching router's pattern.

**Haiku reranker (Phase 6 of context-injection overhaul):**
- New `src/main/orchestration/contextReranker.ts` — after `selectContextFiles`, if > 15 candidates, call Haiku with file paths + 200-char snippet previews + user goal → JSON ranked paths.
- 500 ms timeout, silent fallback to heuristic order.
- Gate via `contextRerankerEnabled` config flag (default on).
- Inserted into `buildPacketFiles` before byte-budget enforcement.
- **Auth spike required**: Max subscription has no API key; must use `spawnClaude` CLI pattern for the Haiku call. Validate this in a standalone spike before implementation.

#### Non-scope
- Learned pointwise ranker — Wave 31, data-gated.
- Lean packet mode — Wave 31 (moved from prior sequencing so it lands with the learned ranker it complements).
- Research-specific decision logging — shares infrastructure, populated in Wave 25.

#### Key file touch points
- `src/main/orchestration/contextSignalCollector.ts` (new)
- `src/main/orchestration/contextSignalCollector.test.ts` (new)
- `src/main/orchestration/contextPacketBuilder.ts` — emit decisions, invoke reranker
- `src/main/agentChat/chatOrchestrationBridgeSend.ts` — tool-call outcome observer
- `src/main/orchestration/contextReranker.ts` (new)
- `src/main/orchestration/contextReranker.test.ts` (new)
- `src/main/config.ts` — add `contextRerankerEnabled`

#### Acceptance criteria
- After a 5-turn conversation, `context-decisions.jsonl` and `context-outcomes.jsonl` exist with the expected line counts.
- Manual inspection of one `traceId` shows full round trip (decision → outcomes for that turn).
- With reranker on, top-10 order changes vs flag off on the same query.
- p95 added latency for reranker < 800 ms.
- Reranker auth spike confirms Haiku call works via `spawnClaude` with Max subscription.

#### Testing
- Unit: decision collection correctness, reranker prompt correctness, fallback on timeout.
- Integration: full turn → decision+outcome logs match.
- Perf: reranker latency distribution over 50 real turns.

#### Risks
- **Tool-call observation is the fragile bit** — leverage existing logging hooks rather than re-instrumenting `chatOrchestrationBridgeSend.ts`.
- **Reranker adds latency** → 500 ms timeout with silent fallback; on by default but one toggle to disable.
- **Auth model for Haiku** — Max subscription has no API key. Hard spike first; kill-switch the reranker path if `spawnClaude`-based invocation doesn't meet latency targets.

#### Exit criteria
- 4 weeks of author use accumulating ≥ 500 outcome samples.
- Reranker latency p95 < 800 ms in production.

---

### Wave 25 — Research Pipeline (Explicit) & Pinned Context Primitive

**Target release:** v1.7.1 (patch — major capability class, but additive and opt-in)
**Dependencies:** Wave 15
**Feature flag:** `research.explicit` (default on — opt-in per invocation)

#### Goal
Ship the explicit research pipeline (slash commands, hook-based triggers) dispatching a research subagent whose output is surfaced as a pinned context artifact. Define `pinnedContext` as a first-class session primitive so research artifacts, symbol-mention context, and user-pinned files all share one surface.

#### Motivation
Research is the single largest differentiator not covered by Claude Code Desktop. The explicit pipeline collects telemetry needed for Wave 30's auto-firing. Pinned context is a generic primitive several features need (research, symbol mentions, blast-radius auto-include, user-pinned read lists from piebald #66–69).

#### Scope

**Pinned context primitive (piebald #66, #69):**
- Session-scoped `pinnedContext[]` array of `{ type, source, title, content, tokens }`. Types: `research-artifact`, `user-file`, `symbol-neighborhood`, `graph-blast-radius`.
- UI: pinned items render as collapsible cards at the top of the chat, above the composer.
- Always included in context packet (with tokens counted against budget).
- Dismissable (session-scoped) and "remove-from-session" actions.
- Workspace read-list: user can mark certain files as always-pinned for a project (new Settings surface).

**Research subagent:**
- New `src/main/research/researchSubagent.ts`. Invokes Agent tool with `subagent_type: "general-purpose"` and a dedicated tool subset: `mcp__claude_ai_Context7__*`, web search, Ref, GitMCP. Cannot write code; returns a structured artifact.
- Research prompt template: (a) identify library/topic, (b) fetch current docs, (c) synthesize capped at ~1.5–2K tokens.
- Artifact: `{ topic, sources[], summary, relevantSnippets[], confidenceHint }`. Persisted in `telemetry.db.research_invocations`.

**Trigger surfaces (explicit only):**
- Slash commands: `/research <topic>`, `/spec-with-research`, `/implement-with-research`. Added to `.claude/commands/`.
- User toggle in chat composer: Off (default) / Auto (reserved for Wave 30) / Always-on-this-message.
- PreToolUse hook: when Claude is about to Edit/Write a file importing from a flagged library, the hook CAN pre-fetch research (off by default; on in Wave 30).

**Cache:**
- Keyed by `(library, topic, version)`. Defaults: high-velocity (Next, React, Vercel AI SDK, shadcn) 48 h; mid (Prisma, Tailwind) 7 d; stable (Lodash, Express) 30 d; system-level 90 d.
- User-editable TTL matrix in Settings.

**Context injection:**
- Artifact rendered as a pinned card (piebald #66 primitive).
- Injected into model context as a synthetic assistant-side tool-result block (option 2 of the design discussion — preserves prefix-caching).

**Outcome correlation:**
- Every research invocation gets a correlation ID. Next `post_tool_use` Edit/Write in the session attributes its outcome back to the research invocation.
- Usefulness score accumulates per session and informs Wave 30 tuning.

**Status streaming:**
- Ambient "Researching <topic>…" indicator while subagent runs. Main agent's turn can proceed in parallel with a `wait-for-research` marker before implementation claims.

#### Non-scope
- Automatic triggering — Wave 30.
- Classifier — Wave 39, contingent.
- Internal-code research (graph-based lookups) — kept separate intentionally; covered by symbol-mention and blast-radius surfaces in this wave.

#### Key file touch points
- `src/main/research/*` (new)
- `src/main/orchestration/pinnedContextStore.ts` (new) — persists session-scoped pins
- `src/renderer/components/AgentChat/PinnedContextCard.tsx` (new)
- `src/main/hooks.ts` — PreToolUse research-check extension point (off by default in Wave 25)
- `src/main/agentChat/chatOrchestrationBridge*.ts` — inject research artifact into context packet
- `.claude/commands/` — slash command definitions
- `src/main/session/session.ts` — add `pinnedContext: PinnedContextItem[]`

#### Acceptance criteria
- `/research <topic>` invokes subagent, returns artifact within 15 s typical, pins to session.
- `/spec-with-research` runs research before main response begins (ambient "Researching…" state).
- Repeated invocation on same topic within TTL hits cache (< 500 ms).
- Artifact visible, collapsible, dismissable.
- After research-then-implementation, diagnostics panel shows linked outcomes.
- Workspace read-list persists across sessions for a project.
- Symbol-mention (`@symbol:functionName`) pins graph neighborhood as context.

#### Testing
- Unit: cache TTL enforcement, key normalization (`next@15.2.0` and `next@^15.2` same entry).
- Integration: `/research react-server-components` → artifact; repeat → cache hit.
- Integration: pinned context persists across restart.
- Manual: 4-week author dogfood exercising explicit triggers across ecosystems.

#### Risks
- **Subagent latency** → status streaming, parallel-with-main-turn where safe, user can cancel.
- **Hallucinated sources** → artifact must cite sources; click-through to verify.
- **Cache staleness** → TTL user-editable; telemetry flags suspicious hits (version changed since cache entry).
- **Token budget explosion** → artifact capped; full artifact stored in DB, only summary re-sent.
- **Pinned context sprawl** → per-session cap (e.g., 10 pins); user must dismiss old ones to add new.

#### Exit criteria
- 4 weeks of author dogfood with ≥ 20 explicit research invocations.
- Outcome correlation measurably differentiates research-then-implement vs non-research turns.
- Pinned context primitive adopted by at least one non-research use case (symbol mention or workspace read-list).

---

## Arc E — Agentic Core

### Wave 26 — Profiles, Inference Controls, Tool Toggles

**Target release:** v1.8.0 (minor — large agentic surface)
**Dependencies:** Wave 16 (session primitive owns active profile)
**Feature flag:** `agentic.profiles` (default on — additive, with sane defaults)

#### Goal
Ship the "agentic core" — profiles, inference controls, and tool toggles — as a unified configuration surface. Piebald Wave 5. Also wires per-tool approval memory and MCP server toggles per chat.

#### Motivation
Today model, effort, permission mode, tool set, and MCP servers are global. Users want per-session configuration matching task intent (Reviewer vs Scaffolder vs Debugger). Bundling profiles + inference controls + tool toggles together avoids half-finished surfaces.

#### Scope

**Profiles system (piebald #28):**
- New `src/main/profiles/profileStore.ts` — named bundle of `{ id, name, model, effort, permissionMode, systemPromptAddendum, enabledTools, mcpServers, temperature?, maxTokens?, stopSequences?, topP?, topK?, jsonSchema? }`.
- Role-based presets (piebald #29): Reviewer, Scaffolder, Explorer, Debugger — bundled.
- Per-project default profile (piebald #30) — workspace config override.
- Profile export/import JSON (piebald #31).
- Profile diff on mid-thread switch (piebald #32) — shows what changes.

**Inference controls (piebald #33–38):**
- Temperature slider (per thread/profile).
- Max tokens override.
- Stop sequences (advanced panel).
- JSON-mode toggle + optional schema.
- Top-p / top-k (advanced collapse).
- Effort-vs-tokens estimator — predicted latency + cost before send, uses per-profile historical data.

**Tool toggles (piebald #39–43):**
- Per-chat tool-toggle UI: grid of available tools with checkboxes.
- Per-profile default tool set.
- Tool-allow-list lint: warn on incoherent profiles (e.g., "Scaffolder without Write").
- MCP server toggle UI per chat.
- Per-tool approval memory: "always allow `Bash('npm test')`" — hashed command-pattern whitelist, revocable in Settings.

**Command approval UI at terminal layer (piebald #78):**
- When Claude spawns a terminal process, a modal/inline banner surfaces the command with allow-once / allow-always / deny-once / deny-always actions. Decisions feed the per-tool approval memory.

#### Non-scope
- Role marketplace — Wave 37.
- Cross-device profile sync — future work.
- Multi-provider profile variants — Wave 36 (which adds provider abstraction).

#### Key file touch points
- `src/main/profiles/*` (new)
- `src/renderer/components/Settings/Profiles.tsx` (new)
- `src/renderer/components/AgentChat/ComposerProfile.tsx` (new) — active profile indicator in composer
- `src/renderer/components/AgentChat/ToolToggles.tsx` (new)
- `src/main/session/session.ts` — add `profileId` field
- `src/main/agentChat/chatOrchestrationBridgeSend.ts` — resolve inference params from session profile
- `src/main/approvalMemory.ts` (new)
- `src/renderer/components/Terminal/CommandApprovalBanner.tsx` (new)

#### Acceptance criteria
- Create a profile → apply to session → model/effort/tools/MCPs switch.
- Per-project default profile persists and applies on session creation.
- Profile diff on switch shows clear before/after.
- Inference controls all configurable and take effect on next message.
- Tool toggles persist per session; lint warns on incoherent sets.
- Command approval banner works end-to-end, including always-allow memory.

#### Testing
- Unit: profile schema validation, approval-memory hash comparison, lint rules.
- Integration: profile switch mid-session reflects in next turn's actual API call (observable in Wave 15 orchestration inspector).
- Manual: 2-week author dogfood using Reviewer vs Scaffolder presets.

#### Risks
- **Profile bloat** — cap at 50 per user; deprecate stale presets.
- **Inference-control footguns** (e.g., stop-sequences breaking tool output) → "advanced" panel gated behind acknowledgment.
- **Approval-memory security** — hashed pattern match prevents broad wildcards by default.

#### Exit criteria
- At least 4 distinct profiles used in author dogfood.
- Approval memory reduces tool-approval friction > 50% in dogfood sessions.

---

### Wave 27 — Subagent UX

**Target release:** v1.8.1 (patch)
**Dependencies:** Wave 26 (profile abstraction), Wave 21 (cost attribution)
**Feature flag:** `agentic.subagentUx` (default on)

#### Goal
Surface subagent conversations as first-class, not just log lines. Cancellation, cost attribution, live status.

#### Motivation
Piebald Wave 6. Claude Code's subagent spawning is powerful but opaque. The existing agent-cards view shows tool invocations but the subagent's internal conversation is buried. Users can't cancel or attribute cost cleanly.

#### Scope
- **Open subagent conversation view (piebald #44)** — inline full subagent transcript, navigable from the parent's tool-call card.
- **Subagent status indicator (piebald #45)** — count of live subagents per session; sidebar chip.
- **Subagent cancellation (piebald #46)** — cancel from UI; sends the cancellation through the Agent tool's existing mechanism.
- **Subagent cost attribution (piebald #47)** — roll child token spend into parent's cumulative cost (Wave 21 cost dashboard).

#### Non-scope
- Nested-subagent visualization beyond one level — out of scope initially.
- Subagent process isolation beyond what Claude Code already provides — out of scope.

#### Key file touch points
- `src/renderer/components/AgentMonitor/SubagentPanel.tsx` (new)
- `src/renderer/components/AgentChat/ToolCallCard.tsx` — "Open subagent chat" link
- `src/main/agentChat/subagentTracker.ts` (new) — lifecycle + cost rollup
- `src/main/claudeUsagePoller.ts` — expose subagent attribution

#### Acceptance criteria
- Click a subagent tool-call card → full subagent transcript opens.
- Live subagent count visible in session sidebar.
- Cancel action terminates subagent; parent continues gracefully.
- Cost dashboard shows parent + subagent rollup.

#### Testing
- Integration: spawn subagent, cancel mid-run, parent survives.
- Integration: 3 nested subagents cost attribution aggregates correctly.

#### Risks
- **Cancellation race** — subagent mid-tool-call on cancel → parent sees error; treat as normal tool failure.
- **Transcript size** — long subagent runs → virtualize, paginate.

#### Exit criteria
- 2-week dogfood with subagent usage, cost attribution within 1% of actual.

---

## Arc F — Composition & Review

### Wave 28 — Drag-and-Drop Pane Composition

**Target release:** v1.9.0 (minor)
**Dependencies:** Waves 17, 20
**Feature flag:** `layout.dragAndDrop` (default on — non-destructive)

#### Goal
Match Claude Code Desktop's drag-and-drop pane layout. Users rearrange terminal, file editor, diff viewer, preview, chat into custom grid configurations. Arrangements persist per session as derived presets.

#### Motivation
Preset + slot infrastructure lands in Wave 17; Wave 28 is the ergonomics layer on top.

#### Scope
- HTML5 drag-and-drop (evaluate react-dnd vs native events in Wave 17 design doc).
- Drop targets: six existing slots plus "split horizontally/vertically" at slot edges.
- Per-session custom-layout persistence; derived preset auto-saved; user can name and promote to global.
- Undo / reset-to-preset action.
- Touch-friendly drag for Waves 32–33: long-press to initiate, visible handles, snap-to-grid feedback.

#### Non-scope
- Out-of-window drag (tear-off) — not in roadmap.
- User-authored custom panes — out of scope.

#### Key file touch points
- `src/renderer/components/Layout/*`
- `src/renderer/components/Layout/layoutPresets/*`

#### Acceptance criteria
- Drag the terminal from `terminalContent` to split `editorContent`; layout updates live.
- Session persistence restores custom arrangement on reopen.
- Undo returns to preset default without data loss.

#### Testing
- Integration: drag → drop → persist → reload → restored.
- Manual: touch test on web build in a tablet browser.

#### Risks
- **Unusable layout state** → one-click reset-to-preset.
- **Drag perf on large diffs** → placeholder preview; content re-renders only on drop.

#### Exit criteria
- Author dogfood with a self-created "refactoring layout" for a week.
- Touch drag validated during Wave 32 prep.

---

### Wave 29 — Diff Review, Graph Panel, Hook/Rule Authoring

**Target release:** v1.9.1 (patch)
**Dependencies:** Wave 17
**Feature flag:** `review.enhanced` (default on)

#### Goal
Ship three related review surfaces bundled for shared infrastructure: per-hunk diff accept/reject, interactive codebase graph explorer, and hook/rule authoring UI.

#### Motivation
Piebald Wave 9. Diff review is currently file-level; graph is used for hotspots display; hooks and rules are hand-authored. All three are review/inspection surfaces that benefit from a shared panel framework.

#### Scope

**Diff review (piebald #73–76):**
- Per-hunk accept/reject within a file (upgrade from file-level).
- Keyboard shortcuts: Vim-style `a`/`r`/`n`/`p`.
- Post-acceptance rollback: one-click revert the last accepted agent edit batch.
- Change summary export as a PR description draft.

**Codebase graph panel (piebald #79, #80):**
- Interactive visual graph explorer — zoomable, pan, click-to-focus.
- "Why this suggestion" panel: for any agent-proposed edit, show the graph neighborhood it touches (callers, callees, symbol type).
- Blast-radius auto-include (piebald #68): when user `@`-mentions a function, offer to include callers as pinned context. Uses Wave 25 pinned-context primitive.
- Symbol-level mentions (piebald #67): `@symbol:functionName` resolves via graph, pins.

**Hook / Rule authoring UI (piebald #70–72):**
- Hook event replay (inspector → replay trigger against current code state).
- Hook-authoring wizard writes `.claude/settings.json` hook configs.
- Rule-authoring wizard writes `.claude/rules/*.md` with live glob-match preview.

#### Non-scope
- Graph-based refactoring tools (rename-across-callers) — potential future work.
- Multi-file diff review across a whole session — possible extension if single-file UX is validated.

#### Key file touch points
- `src/renderer/components/Diff/*` — per-hunk controls, keyboard handlers
- `src/renderer/components/GraphPanel/*` (new)
- `src/renderer/components/HookAuthoring/*` (new)
- `src/renderer/components/RuleAuthoring/*` (new)
- `src/main/codebaseGraph/*` — expose interactive query endpoints

#### Acceptance criteria
- Per-hunk accept/reject works; mixed accept/reject produces correct final file state.
- Keyboard shortcuts match spec.
- Graph panel renders the project's ~1.4K-node graph in < 2 s with interactive zoom.
- Hook wizard outputs valid `.claude/settings.json`; rule wizard outputs valid `.md` with frontmatter.
- Blast-radius pin includes callers up to configurable depth (default 2).

#### Testing
- Unit: hunk-state machine (accept some, reject others, final content).
- Integration: graph panel perf on the project's own graph.
- Manual: hook authored via UI fires as expected.

#### Risks
- **Graph rendering perf** on larger repos → virtualize offscreen nodes; level-of-detail at zoom.
- **Hook-authoring UI produces invalid config** → JSON-schema validation in UI before save.

#### Exit criteria
- Per-hunk review used in author dogfood for a week.
- At least one hook authored via the UI.

---

## Arc G — Automation & Learning Tail

### Wave 30 — Research Auto-Firing (Context-Based)

**Target release:** v2.0.0 (major — first automated layer on top of research)
**Dependencies:** Wave 25 with ≥ 4 weeks of telemetry
**Feature flag:** `research.auto` (default off first release; default on after 2 weeks post-launch telemetry)

#### Goal
Automate research firing based on context signals: package.json + import analysis, staleness matrix, "fact-shaped claim" detection. Use data from Wave 25's explicit pipeline to set defensible thresholds.

#### Motivation
Context-based triggering is categorically stronger than prompt classification. Rules + cache + outcome feedback may prove sufficient without a classifier (Wave 39 is contingent).

#### Scope

**Rule layer (deterministic):**
- Import analysis on files in active session's dirty set. Editing a file that imports a flagged library fires research.
- Staleness matrix: hybrid — curated top-30 libraries (Next, React, Vercel AI SDK, shadcn, Tailwind, Prisma, Drizzle, Zod, tRPC, Electron, Vite, etc.) with explicit known-cutoff versions + release-date heuristic for long-tail (any library with major release after Claude's training cutoff unless in denylist).
- Slash-command precedence: `/research off` overrides auto; `/research on` forces it.

**Self-correction capture:**
- User correction with library-specific feedback ("that's not how useEffect works in React 19") captures the correction and flags the library for enhanced research in the session.
- Per-session correction log accumulates; high-confidence corrections feed global staleness matrix at session archive.

**"Fact-shaped claim" detection (lightweight):**
- Regex-level detector on model's outgoing stream flags when the model is about to make a verifiable factual claim about a library API (e.g., `use\w+\(` for React hooks, `z\.\w+\(` for Zod). When detected + library is flagged stale + no cached research, the model stream pauses briefly while research fires.
- Simple by design; proper detector is Wave 39.

**User controls:**
- Per-session: auto-research off / conservative (curated top-30 only) / aggressive (any library post-cutoff).
- Global default in Settings. Keyboard shortcut to toggle for current session.

**Telemetry-driven threshold tuning:**
- Weekly dev-facing dashboard: invocations fired, outcomes correlated, false-positive rate (fired but no outcome difference), false-negative rate (user corrections following turns where research did NOT fire).
- Thresholds adjustable via Settings knob rather than code change.

#### Non-scope
- ML classifier — Wave 39.
- Haiku ambiguity-resolver — Wave 39.
- Internal-context research integration — separate track.

#### Key file touch points
- `src/main/research/triggerEvaluator.ts` (new)
- `src/main/research/stalenessMatrix.ts` (new) — initial curated list
- `src/main/research/correctionCapture.ts` (new)
- `src/main/hooks.ts` — PreToolUse consumes trigger evaluator
- `src/main/agentChat/chatOrchestrationBridge*.ts` — fact-shaped claim detector on outgoing stream

#### Acceptance criteria
- Editing a file importing `next@15.*` fires research automatically when no cached artifact exists.
- "That API was removed in Zod 4" correction flags Zod for session-enhanced research; next Zod-adjacent edit fires without staleness trigger.
- Per-session toggle changes behavior immediately.
- Weekly dashboard exists and reflects ≥ 4 weeks of explicit-pipeline data.

#### Testing
- Integration: mock project with `next@15.2` imports — fires; non-importing edit does not.
- Integration: correction capture → next-edit enhanced trigger.
- Soak: 4-week dogfood measuring false-positive rate and subjective annoyance.

#### Risks
- **False-positive rate ruins the feature** → conservative default, aggressive opt-in, per-session override.
- **Staleness matrix maintenance** → quarterly review; release-date heuristic for tail.
- **Correction accuracy** → conservative heuristic; global matrix updates require confirmation.

#### Exit criteria
- 4 weeks of auto-firing dogfood with subjective annoyance ≤ 2/10.
- Measured false-positive rate < 15%.
- Flag flipped to default on.

---

### Wave 31 — Learned Context Ranker (LTR)

**Target release:** v2.0.1 (patch)
**Dependencies:** Wave 24 with ≥ 1 000 outcome samples
**Feature flag:** `context.learnedRanker` (default off for first release; soak for 2 weeks)

#### Goal
Replace hand-tuned context weights with a logistic classifier trained on the agent tool-use outcomes from Wave 24, reusing router infrastructure verbatim. Also ship lean packet mode (Phase 8 of context-injection overhaul).

#### Motivation
The router's deterministic-→-classifier progression is the proven template. With ≥ 1 000 samples accumulated, weights graduate from guessed to learned. Lean packet mode lets us test trimming the packet now that ranking is better.

#### Scope

**Learned pointwise ranker (Phase 7 of context-injection overhaul):**
- New `tools/train-context.py` mirrors `tools/train-router.py`. Joins `context-decisions.jsonl` ↔ `context-outcomes.jsonl` on `(traceId, fileId)`. Labels: `used`=1, `unused`=0, `missed`=synthetic negative for included-but-irrelevant candidates. Pointwise logistic model; outputs `context-retrained-weights.json`.
- New `src/main/orchestration/contextClassifier.ts` mirrors `classifier.ts` — feature vector → sigmoid → relevance probability. Weights loaded at startup; fallback to bundled defaults if file absent.
- New `src/main/orchestration/contextRetrainTrigger.ts` mirrors `retrainTrigger.ts` — ≥ 200 new outcome lines → spawn Python → hot-swap via `reloadContextWeights()`.
- `contextSelector.ts` switches from additive weights to `contextClassifier.score(features)`. Old reasons stay as features, not scalars. Wave 24 reranker runs on top of top-N.

**Lean packet mode (Phase 8 of context-injection overhaul):**
- A/B config: `contextPacketMode: 'full' | 'lean'`. Lean drops `<project_structure>`, caps `<relevant_code>` to top 6 files, keeps `<workspace_state>`, `<current_focus>`, PageRank repo map (~500 tokens), `<system_instructions>`.
- Default `lean` for new sessions after 2 weeks of observation.

#### Non-scope
- Classifier that decides research topics — not on roadmap.
- Full transformer-based ranker — out of roadmap scope.

#### Key file touch points
- `tools/train-context.py` (new)
- `src/main/orchestration/contextClassifier.ts` (new)
- `src/main/orchestration/contextRetrainTrigger.ts` (new)
- `src/main/orchestration/contextSelector.ts` (major refactor — replace additive scoring)
- `src/main/orchestration/providers/claudeCodeContextBuilder.ts` — lean vs full
- `src/main/config.ts` — `contextPacketMode` flag

#### Acceptance criteria
- With ≥ 1 000 labeled samples, held-out AUC > 0.75.
- Hot-swap works without restart (verify via weight-version log line).
- Old weight path works when retrained file absent.
- Lean mode: side-by-side on 20 recorded sessions shows `missed` rate (agent Reads something cut) < 5%.

#### Testing
- Offline: AUC on held-out set.
- Integration: full turn in lean mode; `missed` rate tracked.
- Soak: 2-week A/B with half sessions lean.

#### Risks
- **Label noise** (tool-use ≠ true relevance — agent may Read irrelevant files to verify) → weight `Edit` > `Read` in reward signal.
- **Overfitting to author's workflows** → hold strict test set; evaluate on synthetic cases; retrain quarterly.
- **Lean mode regresses complex multi-file tasks** → `full` remains available as override.

#### Exit criteria
- Classifier default-on with zero regression in author-perceived context quality.
- Lean mode default for new sessions after 2 weeks of observation.

---

## Arc H — Mobile Reach

### Wave 32 — Mobile-Responsive Refinement

**Target release:** v2.1.0 (minor — mobile readiness)
**Dependencies:** Waves 17, 28
**Feature flag:** `layout.mobilePrimary` (default on in web build, active at narrow breakpoints)

#### Goal
Harden the web build into a usable mobile browser client. Implement `mobile-primary` preset; ensure all components are touch-friendly and responsive.

#### Motivation
`MobileNavBar` exists as a scaffold; the web build is already functionally usable (`webPreload.ts` shims all APIs). The gap is execution.

#### Scope
- `mobile-primary` preset populated: single active pane, bottom nav switching chat / terminal / file editor / session list.
- Touch-target audit: every interactive element ≥ 44 px on mobile. Automated lint rule.
- Hover-dependent UI replaced on mobile: tap-to-show tooltips; hover-reveal actions always-visible at narrow breakpoints.
- Virtual keyboard awareness: composer stays above keyboard; editor scrolls cursor into view.
- Viewport meta + safe-area insets.
- Swipe gestures: between sessions in sidebar; between chat/terminal/editor in `mobile-primary`.
- Monaco on mobile: worker overhead is painful → replace with read-only syntax-highlighted viewer; full editing falls back to textarea with syntax overlay.
- Session sidebar becomes a drawer on mobile.
- AgentMonitor becomes a bottom sheet on mobile.

#### Non-scope
- Native mobile app — Wave 33.
- Offline capability — out of scope.
- Mobile-specific keyboard shortcuts — desktop affordance.

#### Key file touch points
- `src/renderer/components/Layout/layoutPresets/mobilePrimary.ts` (full impl)
- `src/renderer/components/**` — responsive audit across every component
- `src/renderer/components/Layout/MobileNavBar.tsx` — expand from scaffold
- `src/web/webPreload.ts` — Electron-only stubs replaced with mobile fallbacks (file dialogs → native mobile file pickers)

#### Acceptance criteria
- Web build on iOS Safari / Chrome Android usable for chat view, prompt send, terminal output, file tree, file viewing.
- All interactive elements pass 44-px audit.
- No hover-dependent-only interactions at mobile breakpoints.
- Bottom nav switches primary surfaces smoothly.
- Virtual keyboard does not obscure active input.

#### Testing
- Automated: Playwright on iPhone 14 / Pixel 7 viewport profiles.
- Manual: 1-week phone dogfood against desktop instance on home LAN.

#### Risks
- **Monaco on mobile** → acknowledged; read-only fallback.
- **WebSocket over cellular** → existing shim gains reconnect with streaming resume (replay via `bufferedChunks`).

#### Exit criteria
- 1-week phone dogfood.
- Touch-target audit passes.

---

### Wave 33 — Mobile Shell & Client-Server Hardening

**Target release:** v2.2.0 (major — first non-Electron target)
**Dependencies:** Wave 32
**Feature flag:** N/A (separate distribution)

#### Goal
Package the web renderer as a native iOS/Android app (Capacitor or Tauri Mobile). Harden client-server protocol for production over the public internet.

#### Motivation
`webPreload.ts` already proxies all APIs. Gap is packaging, auth hardening, latency tolerance, store distribution.

#### Scope

**Packaging:**
- Evaluate Capacitor vs Tauri Mobile vs React Native (decision in wave design doc). Factors: renderer code reuse, vite integration, runtime overhead.
- Signed iOS + Android builds. App Store / Play Store submission in scope but may not land this cycle.

**Client-server protocol hardening:**
- Auth: short-lived WS ticket becomes part of device-pairing flow (QR or 6-digit). Produces persistent refresh token.
- WSS required for remote; LAN WS with explicit opt-in.
- Latency tolerance: streaming resume on reconnect; per-call-class timeouts (long-running invoke 120 s, short 10 s).
- Scoped capability surface for remote connections — no arbitrary filesystem, no shell spawn from mobile, no process termination. Explicit capability grants per session.

**Pairing UX:**
- Desktop: Settings → Mobile Access → Generate Pairing Code.
- Mobile: "Pair with desktop" screen on first launch.
- Paired devices listed in desktop Settings; revocable.

#### Non-scope
- Offline mode / on-device LLM.
- App-store marketing / screenshots.
- Wearables.

#### Key file touch points
- `src/web/webPreload.ts` — pairing token handling, scoped capability surface
- `src/web/capabilityGate.ts` (new)
- `src/main/mobileAccess/*` (new)
- Build: Capacitor/Tauri config

#### Acceptance criteria
- Mobile app pairs with desktop via QR in < 60 s.
- Session list, chat, terminal output, file viewing functional over WSS.
- Paired-device revocation immediately terminates active connections.
- Scoped capabilities enforce no unauthorized filesystem access.

#### Testing
- E2E: pairing on localhost and LAN.
- Security: penetration test of scoped capability surface.
- Manual: 2-week author mobile-daily use.

#### Risks
- **Security surface** — hard gate; security review required before release.
- **Packaging maturity** — Capacitor/Tauri Mobile may have rough edges with Monaco bundle; evaluation picks pragmatic option; reduced feature surface acceptable initially.
- **Battery impact** — connection pauses on background, resumes on foreground with replay.

#### Exit criteria
- 2-week author daily use with acceptable battery/UX.
- Security review signed off.
- Pairing validated on 3+ desktop × 2+ mobile combinations.

---

### Wave 34 — Cross-Device Session Dispatch

**Target release:** v2.3.0 (minor)
**Dependencies:** Wave 33
**Feature flag:** `mobile.dispatch` (default on once Wave 33 is mature)

#### Goal
Send a task from mobile to desktop Ouroboros — Ouroboros's own Dispatch, against the user's own instance.

#### Motivation
Anthropic's Dispatch runs on cloud infra Ouroboros doesn't own. This version runs against desktop, private and cost-free beyond existing model access, composable with worktree/session infrastructure.

#### Scope
- Mobile UI: "New Task" with title, prompt, target project, optional branch/worktree name.
- On submit: `sessions:dispatchTask` IPC over WSS creates session, optionally creates worktree, begins agent run.
- Status streams to mobile; mobile session view shows progress.
- Native push notifications on completion/failure.
- Queue: multiple dispatches queue behind desktop capacity; queue status visible on mobile.

#### Non-scope
- Cloud-hosted Ouroboros — no cloud instance.
- Voice-driven dispatch.

#### Key file touch points
- `src/main/session/sessionDispatch.ts` (new)
- `src/web/webPreload.ts` — `sessions:dispatchTask` capability
- Mobile app: "Dispatch" screen

#### Acceptance criteria
- Phone dispatches a task; desktop spawns session; agent turn begins within 10 s.
- Status streams real-time to mobile.
- Completion triggers native notification.
- Dispatched sessions appear in desktop sidebar alongside local.

#### Testing
- E2E: full dispatch on LAN.
- E2E: dispatch over WAN via tailscale or similar.
- Manual: 1 week commute-dispatch dogfood.

#### Risks
- **Queue overflow** → queue depth visible; cancellable.
- **Desktop offline** → "desktop offline, will deliver on reconnect" message; cancel option.

#### Exit criteria
- 2-week period with ≥ 10 real dispatches.

---

## Arc I — Ecosystem & Platform

### Wave 35 — Theme Import & Customization

**Target release:** v2.3.1 (patch)
**Dependencies:** Wave 17
**Feature flag:** `theming.vsCodeImport` (default on)

#### Goal
Piebald Wave 10. VS Code theme import, accent-color picker decoupled from full theme swap, thinking-verb / spinner customization, per-pane font-family.

#### Motivation
Theming is a cheap surface area where competitors often have stronger defaults. VS Code theme import is a concrete parity move.

#### Scope
- **VS Code theme import (piebald #62)** — parse `.json` VS Code theme into the token set (`src/renderer/styles/tokens.css`).
- **Accent color picker (piebald #63)** — decouple accent from full theme; color-wheel + hex input; previews live.
- **Thinking-verb / spinner customization (piebald #64)** — tweakcc-parity; pick from presets or type custom.
- **Per-pane font-family (piebald #65)** — editor, chat, terminal each configurable.

#### Non-scope
- Theme marketplace — Wave 37.
- Cross-device theme sync.

#### Key file touch points
- `src/renderer/themes/vsCodeImport.ts` (new)
- `src/renderer/components/Settings/Theming.tsx` (extend)
- `src/renderer/styles/tokens.css` — dynamic accent override mechanism

#### Acceptance criteria
- Paste a VS Code theme JSON → theme applies.
- Accent picker live-updates without reload.
- Thinking-verb customization persists and displays.
- Per-pane fonts render correctly.

#### Risks
- **VS Code theme compatibility** — partial support acceptable; document unsupported keys.

---

### Wave 36 — Multi-Provider Optionality

**Target release:** v2.4.0 (minor)
**Dependencies:** Wave 26 (profile abstraction can carry provider)
**Feature flag:** `providers.multiProvider` (default off; opt-in per profile)

#### Goal
Piebald Wave 11. Ship provider abstraction layer even if only Claude is default. Add Codex-as-chat-provider adapter, Gemini CLI adapter, and a "compare providers" mode.

#### Motivation
Multi-provider is intentional-Claude-first today; adding abstraction late is much harder than designing it in. Ship the abstraction once the IDE side is saturated (Wave 26 profiles give the natural seam).

#### Scope
- **Provider abstraction (piebald #53)** — new `src/main/providers/provider.ts` interface: `spawn`, `send`, `cancel`, event-stream shape. Existing Claude CLI implementation becomes one provider.
- **Codex adapter (piebald #54)** — orchestration adapter for `openai/codex` CLI.
- **Gemini CLI adapter (piebald #55)** — similar.
- **"Compare providers" mode (piebald #56)** — same prompt, two providers, side-by-side output. Triggered via command palette or composer action.

#### Non-scope
- Provider-specific feature parity (e.g., Codex-only features).
- API-key management — existing auth pattern preserved.

#### Key file touch points
- `src/main/providers/*` (new)
- `src/main/pty/ptyClaude.ts` — refactored to implement Provider interface
- `src/renderer/components/AgentChat/CompareProviders.tsx` (new)
- `src/main/profiles/profileStore.ts` — add `providerId` to profile

#### Acceptance criteria
- New Codex-based profile successfully completes a turn.
- Compare-providers mode runs same prompt against Claude + Codex and shows diff.
- No regression in Claude-default path.

#### Risks
- **Adapter parity** — each provider has quirks (tool-call shape, streaming format) → the abstraction deliberately narrow (happy path first); document non-parity.

---

### Wave 37 — Ecosystem Moat

**Target release:** v2.4.1 (patch)
**Dependencies:** Wave 26
**Feature flag:** `ecosystem.moat` (default on — mostly additive)

#### Goal
Piebald Wave 12. System-prompt transparency page, prompt diff on CLI version change, splitrail integration, theme/prompt marketplace, "Awesome Ouroboros" reference page.

#### Motivation
Competitive moat moves. Each is small individually; bundled they signal ecosystem investment.

#### Scope
- **System-prompt transparency (piebald #57)** — surface resolved CLI prompt inside the IDE (read-only).
- **Prompt diff on CLI version change (piebald #58)** — alert on upstream Claude Code prompt changes between CLI releases.
- **splitrail integration (piebald #59)** — optional export of usage data to splitrail.
- **Theme / prompt marketplace (piebald #60)** — curated JSON bundles installable from command palette. Security: signed bundles only.
- **"Awesome Ouroboros" page (piebald #61)** — curated hooks, slash commands, MCP configs, ships as in-app reference.

#### Non-scope
- User-submitted marketplace content — out of scope (security implications).
- Paid marketplace — out of scope.

#### Key file touch points
- `src/renderer/components/Settings/SystemPrompt.tsx` (new)
- `src/main/promptDiff.ts` (new) — diff tracker
- `src/main/providers/splitrailExporter.ts` (new)
- `src/renderer/components/Marketplace/*` (new)
- `src/renderer/components/AwesomeRef/*` (new)

#### Acceptance criteria
- System-prompt page shows current resolved prompt.
- CLI upgrade shows diff if prompt changed.
- splitrail export produces valid output.
- Marketplace: install a curated bundle → theme/prompt applies.
- Awesome page shipped as in-app reference.

---

### Wave 38 — Platform & Onboarding

**Target release:** v2.5.0 (minor)
**Dependencies:** Wave 20 (chat-primary is the onboarding landing surface)
**Feature flag:** `platform.onboarding` (default on)

#### Goal
Piebald Wave 13. First-run walkthrough, empty-state prompts, command-palette discoverability, auto-update channel, in-app changelog, crash-report opt-in, multilingual UI, Linux-first testing pass.

#### Motivation
Rounds out the platform for broader users. Onboarding was deferred through the early waves while the experience stabilized; by Wave 38 the product is shaped enough to teach.

#### Scope
- **First-run walkthrough (piebald #85)** — 5-step guided tour anchored on chat-primary view.
- **Empty-state prompts (piebald #86)** — in chat, file tree, terminal.
- **Command palette discoverability (piebald #87)** — searchable by description, not just name.
- **Auto-update channel (piebald #88)** — stable / beta toggle in Settings.
- **In-app changelog (piebald #89)** — drawer on version bump.
- **Crash-report opt-in (piebald #90)** — with redaction of paths and user content.
- **Multilingual UI (piebald #83)** — i18n framework with English + 1 additional language to validate (Spanish or Japanese).
- **Linux-first testing pass (piebald #84)** — CI matrix includes Ubuntu; manual test pass on Fedora.

#### Non-scope
- Video tutorials.
- Full translation beyond the pilot languages.

#### Key file touch points
- `src/renderer/components/Onboarding/*` (new)
- `src/renderer/components/CommandPalette/CommandPalette.tsx` — description-indexed search
- `src/main/autoUpdater.ts` — channels
- `src/renderer/components/Changelog/*` (new)
- `src/main/crashReporter.ts` (extend existing)
- `src/renderer/i18n/*` (new)
- `.github/workflows/*` — Linux CI matrix

#### Acceptance criteria
- First-run walkthrough completes; skippable.
- Empty-state prompts contextual and dismissable.
- Command palette search finds commands by description.
- Auto-update channel switchable; downgrade blocked.
- Changelog drawer shows on version bump.
- Crash report redacts paths and message content.
- Pilot language switches full UI.
- Linux CI green on Ubuntu.

---

## Arc J — Contingent & Cleanup

### Wave 39 — Research Classifier (Contingent)

**Target release:** v2.5.1 (patch — contingent; skipped if Wave 30 telemetry shows rules + cache sufficient)
**Dependencies:** Wave 30 with ≥ 8 weeks of auto-firing telemetry
**Feature flag:** `research.classifier` (default off until telemetry justifies)

#### Goal
Train a lightweight classifier on research-invocation outcome data from Waves 25 + 30 to catch cases where rules + cache missed but research would have helped. Add Haiku ambiguity-resolver only if classifier has irreducibly ambiguous band.

#### Motivation
The router precedent: classifier earns its way in with data. This wave tests whether rules + cache + outcome feedback were enough (in which case Wave 39 is formally closed unshipped) or not.

#### Scope

**Gating check:**
- Proceed only if measured false-negative rate (user corrections following turns without research) > 10%.

**Classifier:**
- Feature extraction from captured turns: prompt length, library-name presence, implementation verb detection, recency keywords, past-conversation context, import-graph signals, package.json version fingerprint.
- Labels: outcome signal (compile success, test pass, user acceptance without correction).
- Model: logistic regression or gradient-boosted trees. Held-out test evaluation.
- Threshold tuning: minimize false-positive rate subject to target false-negative improvement.

**Haiku ambiguity-resolver (if needed):**
- Prompts in classifier 0.4–0.6 confidence band → single Haiku call decides. Only if classifier thresholding doesn't partition cleanly.

**Integration:**
- Runs after rule layer. Rules fire → research fires. Rules don't fire + classifier high-confidence-yes → research fires. Rules don't fire + classifier low-confidence → Haiku (if enabled) or skip.

#### Non-scope
- LLM-based trigger per prompt — too expensive.
- Classifier deciding research topics — out of scope.

#### Acceptance criteria
- Classifier measurably reduces false-negative rate on held-out test.
- Integration does not increase false-positive rate beyond agreed tolerance.
- Inference latency < 20 ms per prompt.

#### Exit criteria
- Classifier deployed with measurable false-negative improvement ≥ 20% over rules-only baseline, no false-positive regression.
- OR: telemetry review concludes unnecessary; wave closed unshipped.

---

### Wave 40 — System Cleanup & Deprecation

**Target release:** v2.6.0 (minor — consolidates cleanup from prior waves)
**Dependencies:** All prior waves default-on for ≥ 2 releases
**Feature flag:** N/A

#### Goal
Retire dead code, remove migration fallbacks, consolidate documentation, deprecate unused features.

#### Motivation
Each wave accumulates cleanup debt (legacy fallback keys, removed features' flag scaffolding, old weight paths). Wave 40 is the scheduled sweep.

#### Scope
- Remove `semantic_match` reason entirely (superseded by PageRank + learned ranker).
- Remove `active_file` / `open_file` zero-weight reasons.
- Delete old `REASON_WEIGHTS` constant after Wave 31 default-on for 1 release.
- Remove legacy `windowSessions` key after Wave 16 default-on for 2 releases.
- Remove `panelSizes` localStorage fallback after Wave 17 default-on for 1 release.
- Remove `streamingInlineEdit` flag (long-standing tech debt per CLAUDE.md).
- Remove `internalMcp` if still unwired after Wave 29, or wire it if it found a use.
- Add `docs/context-injection.md` covering the full context pipeline (v3: learned ranker).
- Update `docs/architecture.md` to reflect Session primitive and layout presets.
- Update `CLAUDE.md` known-issues section — remove closed items.
- Knip audit — zero dead exports in `orchestration/`, `research/`, `session/`.

#### Non-scope
- Refactors beyond deprecation removal.
- API redesign.

#### Acceptance criteria
- Knip: zero dead exports in specified modules.
- All migration fallback paths confirmed unused and removed.
- Docs reviewed.

#### Exit criteria
- One release cycle passes since Wave 40 ships without regression.

---

## 9. Cross-Cutting Concerns

### 9.1 Feature flag policy

- Every user-visible wave lands behind a feature flag (listed in each wave's header).
- User-visible waves flag-default-off for the first release; soak ≥ 2 weeks before flipping on.
- Infrastructure waves (15, 18 partial, 19, 24 partial) ship default-on because there's nothing to A/B; feature flags exist but default to enabled.
- Flags are not removed until at least 2 releases after default-on (per `streamingInlineEdit` precedent).
- Flags live in `src/main/config.ts` schema. Flag state observable in Wave 15 orchestration inspector for debugging.

### 9.2 Telemetry strategy

- All structured telemetry writes go through Wave 15 `telemetryStore`.
- Router-style JSONL mirrors for out-of-band analysis.
- Each wave specifies telemetry schema additions in its wave design doc.
- User-facing opt-out in Settings. Default: on for dev, opt-in for production users until Wave 33 establishes the remote-auth trust model.

### 9.3 Testing strategy

- Vitest for unit (current framework).
- Playwright for E2E (browser + Electron).
- Manual dogfood gate on every user-visible wave.
- Coverage thresholds (currently 5% in `vitest.config.ts`) ratchet up by 5% per wave touching the relevant module. No wave decreases coverage.
- Regression suite: prior waves' acceptance criteria run on every subsequent release.
- Accessibility: axe-core automated + manual screen-reader pass on every UI wave.

### 9.4 Migration & rollout

- Every wave with persisted-data changes ships an idempotent migration.
- Migrations preserve read-only fallback to prior-version keys for 2 releases.
- No "flag day" cutovers. Every change coexists with prior behavior until flag flip.
- Schema migrations include "write new + read old" phase before "read new only."

### 9.5 Rollback strategy

- Any wave can be rolled back within its release cycle by flipping its feature flag off.
- Persisted-data changes preserve writes (readable but unused by rolled-back code).
- A rollback event blocks the next wave's release until root cause is understood.

### 9.6 ESLint & code-quality discipline

Every wave respects existing constraints:
- `max-lines-per-function: 40` — extract helpers
- `max-lines: 300` per file — split along natural seams (the nine-file `chatOrchestrationBridge*.ts` is the precedent)
- `complexity: 10` — early returns, guard clauses
- `max-depth: 3`
- `max-params: 4` — options objects
- `simple-import-sort` on imports and exports
- Security rules at error level in main/preload

No wave relaxes any of these. If an implementation legitimately needs a violation, that's a signal to re-split the work, not to change the rule.

### 9.7 Meta-development hygiene

- No wave's implementation work runs `taskkill`, `npm run dev` fresh, or host-process-disruptive commands without explicit user direction.
- Graph-sync and hot-reload preferred over restarts.
- Any wave changing main-process startup (15, 16) tested with a *separate* Ouroboros instance before the change commits to the running edit session.
- Worktrees (Wave 16+) enable per-wave agent work in isolation — a natural force multiplier.

### 9.8 Risk register (consolidated)

| Risk | Wave(s) | Severity | Status |
|---|---|---|---|
| Worktree disk explosion | 16 | High | Mitigated (opt-in per session) |
| Chat state loss on layout switch | 17, 20 | High | Mitigated (`display:none` preserved) |
| Research latency ruins chat flow | 25 | High | Mitigated (status streaming, parallel turns) |
| Auto-research false-positive rate | 30 | High | Gated (telemetry-driven thresholds) |
| Security surface for mobile | 33 | Critical | Hard gate (security review) |
| Context-decision label noise | 24, 31 | High | Mitigated (Edit-weighted rewards, synthetic negatives) |
| PageRank perf on large graphs | 19 | Medium | Mitigated (cache + early termination) |
| Migration regressions | 15, 16, 17, 21 | Medium | Mitigated (read-only fallbacks) |
| Monaco on mobile | 32 | Medium | Accepted (read-only fallback) |
| Classifier overfitting | 31, 39 | Medium | Gated (held-out test, retrain cadence) |
| Haiku reranker auth model | 24 | Medium | Spike-gated before implementation |
| Side-chat context overhead | 23 | Low | Mitigated (minimal default context) |
| Drag-and-drop unusable layout | 28 | Low | Mitigated (one-click reset) |
| Provider-adapter parity | 36 | Low | Accepted (happy path first, document non-parity) |

---

## 10. Open Questions & Decisions Pending

| # | Question | Owner | Deadline |
|---|---|---|---|
| Q1 | Package manager for multi-worktree builds: npm vs pnpm (affects Wave 16 disk economics) | Author | Before Wave 16 design doc |
| Q2 | Haiku reranker auth model — can `spawnClaude`-based invocation meet p95 < 800 ms? Spike required | Author | Before Wave 24 impl |
| Q3 | Mobile packaging: Capacitor vs Tauri Mobile vs React Native | Author + external review | Before Wave 33 design doc |
| Q4 | Staleness matrix initial curation: which 30 libraries, which cutoff versions | Author | Before Wave 30 |
| Q5 | AgentMonitor inline-event defaults: which event types default-visible in chat | Author | During Wave 20 dogfood |
| Q6 | Research artifact token cap: 1.5K vs 2K vs dynamic | Author | Before Wave 25 |
| Q7 | Pairing token lifetime and revocation strategy | Author + security reviewer | Before Wave 33 design doc |
| Q8 | Version numbering: do Waves 15–22 stay v1.x or move to v2.x when chat-primary lands | Author | Before Wave 20 release |
| Q9 | Whether to integrate internal-code research (graph lookups) into the research pipeline or keep separate | Author | Before Wave 25 |
| Q10 | PageRank seed-vector composition: pinned + symbol matches alone, or also + recent-user-edit | Author | Before Wave 19 |
| Q11 | Learned ranker training cadence: ≥ 200 new samples (router default) or different threshold for context | Author | Before Wave 31 |
| Q12 | Lean packet mode default (Wave 31): ship default-on after 2 weeks observation, or require explicit opt-in longer | Author | During Wave 31 soak |
| Q13 | Pilot i18n language for Wave 38: Spanish vs Japanese vs other | Author | Before Wave 38 |
| Q14 | Provider abstraction scope: include tool-call shape normalization, or accept per-provider quirks at adapter level | Author | Before Wave 36 design doc |
| Q15 | Multi-level subagent visualization (Wave 27): cap at one level or support nesting | Author | During Wave 27 impl |

Each question is scoped small enough that a design doc in `plan/` can resolve it before the corresponding wave begins.

---

## 11. Appendices

### Appendix A: Glossary

- **Session** — Wave 16+ primitive combining project root, worktree, chat thread, layout preset, profile, pinned context, telemetry attribution. Formerly conflated with a window.
- **Preset** — named layout configuration (slots, panel sizes, visibility, breakpoints). Wave 17+ replaces the sizes-only `WorkspaceLayout`.
- **Pinned context** — Wave 25 session primitive. Items surfaced as cards at chat top; always in packet. Types: research-artifact, user-file, symbol-neighborhood, graph-blast-radius.
- **Side chat** — lightweight conversation fork that doesn't persist back to main unless merged. Wave 23.
- **Branch** (chat) — full-copy thread fork via `branchThread`. Exists today; Wave 23 adds UI.
- **Research artifact** — structured output of research subagent. Reuses pinned-context primitive.
- **Staleness matrix** — library → known-cutoff-version mapping driving Wave 30 auto-triggering.
- **Correlation ID** — Wave 15 UUID v7 per event enabling tool-use ↔ outcome linking.
- **Trace ID** — existing router `traceId`, extended in Wave 15 to cover context decisions too.
- **Edit provenance** — agent vs user attribution per file, tracked from Wave 18.
- **PageRank repo map** — weighted personalized PageRank over symbol graph used for context retrieval. Wave 19.
- **Decision logging** — append-only JSONL + SQLite of what the context ranker chose and why. Wave 24.
- **Outcome logging** — append-only log of whether the agent actually used packet files (Used/Unused/Missed). Wave 24.
- **Lean packet mode** — context packet shape that drops `<project_structure>` and trims `<relevant_code>`. Wave 31.
- **Dispatch** — in this roadmap, Ouroboros's cross-device task handoff (Wave 34), targeting user's own desktop.

### Appendix B: Key file references (grounded from audit)

| Area | File | Lines |
|---|---|---|
| ManagedWindow definition | `src/main/windowManager.ts` | 33–38 |
| windowSessions persistence | `src/main/windowManager.ts` | 343 (persist), 376 (restore) |
| windowSessions schema | `src/main/configSchema.ts` | 157–176 |
| Legacy multiRoots | `src/main/configSchema.ts` | 145–151 |
| AppLayoutSlots definition | `src/renderer/components/Layout/AppLayout.tsx` | 19–26 |
| AppLayout structural shell | `src/renderer/components/Layout/AppLayout.tsx` | 280–316 |
| Chat display:none preservation | `src/renderer/components/Layout/AppLayout.tsx` | 308 |
| MobileNavBar integration | `src/renderer/components/Layout/AppLayout.tsx` | 312 |
| WorkspaceLayout apply event | `src/renderer/components/Layout/AppLayout.tsx` | 73–76 |
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
| Context packet builder entry | `src/main/orchestration/contextPacketBuilder.ts` | 335 |
| Context scoring weights | `src/main/orchestration/contextSelector.ts` | 61–76 |
| Graph hotspots query (worktree filter) | `src/main/codebaseGraph/graphQueryArchitecture.ts` | 63–75 |

### Appendix C: External references

- Claude Code Desktop redesign blog: https://claude.com/blog/claude-code-desktop-redesign
- Claude Code Desktop docs: https://code.claude.com/docs/en/desktop
- Aider repo map (PageRank): https://aider.chat/docs/repomap.html
- Cursor indexing approach: https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast
- Windsurf SWE-grep (RL retrieval): https://cognition.ai/blog/swe-grep
- Cody context paper (pointwise ranker): https://arxiv.org/html/2408.05344v1
- Anthropic on context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- LTRR academic framework: arXiv:2506.13743

### Appendix D: Versioning

Wave version targets are tentative and revisable. Conventions:
- Patch bump: internal refactor, minimal user-visible change (Waves 15, 17, 18, 21, 22, 23, 27, 28, 29, 35, 37, 39).
- Minor bump: new user-visible capability (Waves 16, 19, 20, 24, 25, 26, 30, 31, 32, 34, 36, 38, 40).
- Major bump: new platform target or breaking API (Waves 30 — first automation, 33 — mobile shell).

### Appendix E: What this roadmap does not plan

- Billing, monetization, licensing.
- Multi-user collaboration (real-time cursors, shared sessions).
- User-submitted marketplace content (beyond curated bundles).
- Voice input / voice dispatch.
- Team / enterprise features beyond what already exists.
- Existing known tech debt (double terminal tab bar, inline Settings modal, unwired `internalMcp`, `streamingInlineEdit` flag removal) — handled opportunistically when a wave touches the affected code, consolidated in Wave 40.
- Scheduled routines / background workers running without the user's machine (Anthropic's lane).
- Computer use (Claude Code Desktop's lane).

### Appendix F: Consolidation notes

This roadmap supersedes three separate planning documents. Resolution of overlap:

| Source doc | Original unit | Merged into | Rationale |
|---|---|---|---|
| `dual-mode-and-research-roadmap.md` Wave 15 | Instrumentation | Wave 15 | Same wave; expanded scope to include orchestration inspector (Piebald #48–52) and context decision scaffolding (context Phase 0) |
| `dual-mode-and-research-roadmap.md` Wave 16 | Session + worktrees | Wave 16 | Unchanged |
| `dual-mode-and-research-roadmap.md` Wave 17 | Layout preset engine | Wave 17 | Unchanged scope; added sidebar-ceiling lift from Piebald #4 |
| `dual-mode-and-research-roadmap.md` Wave 18 | Chat-primary + sidebar | Wave 20 | Renumbered to sit after context-quality groundwork; merged Piebald Wave 2 (chat-only view) and accessibility items #81, #82 |
| `dual-mode-and-research-roadmap.md` Wave 19 | Side chats | Wave 23 | Renumbered; merged with Piebald Wave 4 branching polish since they share chat-forking machinery |
| `dual-mode-and-research-roadmap.md` Wave 20 | Research explicit | Wave 25 | Renumbered; pinned context primitive (Piebald #66–69) consolidated here so research and user-pinning share one surface |
| `dual-mode-and-research-roadmap.md` Wave 21 | Research auto | Wave 30 | Renumbered to land after learned ranker data collection begins |
| `dual-mode-and-research-roadmap.md` Wave 22 | Drag-and-drop panes | Wave 28 | Renumbered |
| `dual-mode-and-research-roadmap.md` Wave 23 | Mobile responsive | Wave 32 | Renumbered |
| `dual-mode-and-research-roadmap.md` Wave 24 | Mobile shell | Wave 33 | Renumbered |
| `dual-mode-and-research-roadmap.md` Wave 25 | Cross-device dispatch | Wave 34 | Renumbered |
| `dual-mode-and-research-roadmap.md` Wave 26 | Research classifier | Wave 39 | Renumbered; remains contingent |
| `context-injection-overhaul.md` Phase 0 | Scaffolding, types, traceId | Wave 15 | Merged into foundation wave — same infrastructure supports context decisions + hooks + orchestration inspector |
| `context-injection-overhaul.md` Phase 1 | Graph GC | Wave 18 | Dedicated wave |
| `context-injection-overhaul.md` Phase 2 | Edit provenance | Wave 18 | Same wave as graph GC — both prerequisites for provenance-aware scoring |
| `context-injection-overhaul.md` Phase 3 | Weight rebalance | Wave 19 | Combined with PageRank (Phase 4) |
| `context-injection-overhaul.md` Phase 4 | PageRank | Wave 19 | Combined with weight rebalance |
| `context-injection-overhaul.md` Phase 5 | Decision + outcome logging | Wave 24 | Dedicated wave with Haiku reranker |
| `context-injection-overhaul.md` Phase 6 | Haiku reranker | Wave 24 | Combined with decision logging |
| `context-injection-overhaul.md` Phase 7 | Learned ranker | Wave 31 | Data-gated |
| `context-injection-overhaul.md` Phase 8 | Lean packet mode | Wave 31 | Combined with learned ranker — makes sense to test shape-trimming once ranking is better |
| `context-injection-overhaul.md` Phase 9 | Migration / cleanup | Wave 40 | Consolidated system cleanup |
| `piebald-improvement-waves.md` Wave 1 | Message polish | Wave 22 | |
| `piebald-improvement-waves.md` Wave 2 | Chat-only view | Wave 20 | |
| `piebald-improvement-waves.md` Wave 3 | Thread organization | Wave 21 | |
| `piebald-improvement-waves.md` Wave 4 | Branching polish | Wave 23 | Combined with side chats |
| `piebald-improvement-waves.md` Wave 5 | Agentic core | Wave 26 | |
| `piebald-improvement-waves.md` Wave 6 | Subagent UX | Wave 27 | |
| `piebald-improvement-waves.md` Wave 7 | Observability | Wave 15 | Merged into foundation |
| `piebald-improvement-waves.md` Wave 8 | Cost + pinned context | Waves 21 (cost), 25 (pinned context) | Split by natural seam |
| `piebald-improvement-waves.md` Wave 9 | Diff / change / graph | Wave 29 | |
| `piebald-improvement-waves.md` Wave 10 | Theme | Wave 35 | |
| `piebald-improvement-waves.md` Wave 11 | Multi-provider | Wave 36 | |
| `piebald-improvement-waves.md` Wave 12 | Ecosystem moat | Wave 37 | |
| `piebald-improvement-waves.md` Wave 13 | Platform + onboarding | Wave 38 | |

Every numbered item from each source doc lands somewhere in this roadmap or is explicitly deferred in Appendix E.

---

**End of unified roadmap.**

Expected total duration: 18–30 months depending on parallelism and dogfood depth. Critical path through Arcs A, C, and H estimated 12 months; remaining arcs can parallelize.
