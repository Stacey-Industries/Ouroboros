# Wave 86 — Chat Orchestration State-Architecture Overhaul

## Status

DRAFT · target v2.16.0 (held tag, released with this overhaul) · drafted 2026-05-11.

**Wave-number adjustment:** Spec and brainstorming args referenced "wave-85"; folder `roadmap/wave-85-flow-tracer/` already exists. This wave is therefore **Wave 86**.

## Context — why this wave exists

Wave 84 (Chat Lifecycle Bug-Fix Bundle) closed 2026-05-11 with an explicit pivot decision. Across phases A/B/D/F, each "small bug" fix surfaced 1–2 adjacent issues; hypotheses were wrong twice in Phase A, completely wrong in Phase B, and disproven in Phase D. Mid-wave-discovered follow-ups outnumber the original six bugs. The pattern is consistent with **state-architecture leakage across the main↔renderer boundary**, not six independent defects (see Wave 84 closure status, commit `142566bb`).

A formal discovery initiative replaced the remaining Wave 84 work. Four prep artifacts now ground the design:

1. `roadmap/foundation/chat-orchestration/00-prep-codebase-manifest.md` — AS-IS map: state inventory, event flow, lifecycle, five conflated ID types, seven boundary leaks, persistence inventory, instrumentation inventory.
2. `roadmap/foundation/chat-orchestration/01-research-claude-code-cli-headless.md` — Claude Code CLI subscription/headless capabilities; what we can rely on vs what's only available via SDK/API. Ouroboros runs `claude` CLI subprocesses with Claude Max OAuth, NOT direct API.
3. `roadmap/foundation/chat-orchestration/02-research-ide-chat-patterns.md` — Survey of Cursor, Windsurf, Continue.dev, Zed, VS Code Copilot Chat, JetBrains AI, Cody, Aider. Continue.dev (Core/GUI split) is the closest architectural cousin.
4. `roadmap/foundation/chat-orchestration/03-research-streaming-state-architecture.md` — Industry-standard / emerging / cutting-edge spectrum across 8 topics; Ouroboros-specific load-bearing constraints.

The approved design spec at `docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md` (354 lines) locks the target architecture. This wave executes that spec.

**Companion follow-ups that will be re-evaluated post-overhaul** (many become no-bugs structurally):

- `roadmap/follow-ups/2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md` (bug 3 deferred from W84)
- `roadmap/follow-ups/2026-05-11-context-preview-rules-evicted-after-time.md`
- `roadmap/follow-ups/2026-05-11-context-preview-pre-send-missing-claude-md.md`
- `roadmap/follow-ups/2026-05-11-chat-agent-action-not-displayed-in-history.md`
- `roadmap/follow-ups/2026-05-11-heatmap-full-rescan-jank.md`

**Pre-flight code confirmations** (citing prep doc 00 for traceability):

- Five ID types currently in flight: `threadId`, `taskId`, orchestration `sessionId`, `providerSessionId` (from stream-json `session_id`), hook-pipe `sessionId` — conflated at 5 known sites (prep doc 00 §4.2).
- Seven boundary leaks documented at file:line (prep doc 00 §5).
- Five event channels carrying overlapping data: `agentChat:thread`, `agentChat:status`, `agentChat:stream`, `hooks:event`, and the `agent-chat:thread-snapshot` renderer-internal CustomEvent (prep doc 00 §2).
- `MinimalOrchestration.sessions` is pure in-memory; process restart wipes session state (prep doc 00 §5.3, `src/main/ipc-handlers/agentChatOrchestration.ts`).

## Goal

A single per-thread state machine in main owns all canonical chat state. Renderer is a pure projection consuming three IPC channels (`chatState:snapshot`, `chatState:diff`, `chatCommand:*`). The five chat-related ID types are formalized in an `IdentityRegistry` that throws on unknown IDs. SQLite schema v10 persists alias rows so the registry rebuilds across restart. The five-channel IPC fan-out is gone; the `agent-chat:thread-snapshot` DOM CustomEvent is gone; `inferSessionId` heuristic is gone; synthetic-sessionId-as-threadId masquerade is gone. After this wave: the six leak classes documented in spec §3 are structurally impossible or loud-fail; the ~100-sessions-in-memory failure mode cannot recur (hydration cap); and the next chat-flow bug investigation can be reconstructed from three permanent log tags.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md`.

1. **Targeted in-place refactor**, not parallel rebuild. Each phase leaves the build green and the app shippable. Confirmed in brainstorming Q3.
2. **Correctness over simplicity** when they conflict. Accept abstraction cost (hierarchical ID model, alias table) to make state-leakage bugs structurally impossible. Confirmed in brainstorming Q2.
3. **Hard-fail on impossible states.** Throw `ChatStateError`; renderer surfaces a non-dismissable error banner with trace + "Restart Chat Session" action; telemetry event emitted. No silent recovery in either dev or prod builds — regression tests catch throws before merge. Confirmed in brainstorming Q4.
4. **Main owns canonical chat state; renderer owns ephemeral UI state.** Composer drafts stay renderer-side in localStorage; main never sees a partial composition. Confirmed in brainstorming Q6.
5. **SQLite stays authoritative for persistence; CLI JSONL is read-only secondary** consulted only for crash-repair flows. No migration to JSONL-canonical. Confirmed in brainstorming Q5.
6. **Multi-window live mirror.** Main fans out diffs to every subscribed window; composer drafts are per-window. Confirmed in brainstorming Q7.
7. **Threads permanent until user-deleted.** Hydration cap of ~10 active threads in-memory; thread list is summary-only beyond that cap. Confirmed in brainstorming Q8.
8. **Three permanent `[trace:*]` tags.** `[trace:identity]`, `[trace:event]`, `[trace:state]` are permanent structural logs. Investigation-specific `[trace:DEBUG-*]` tags are the only category cleaned up at wave wrap.
9. **Schema v10 migration** ships with a tested up/down pair. Adds: `threads.lastProviderSessionId`, `threads.lastInterruptedAt`, `messages.canonical_event_log` (JSON), new `identity_aliases` table.
10. **Feature-flag gated rollout.** `chatOrchestration.useNewStateMachine` (default false in Phase 1, flipped true in Phase 3 dev builds, flipped true in prod at Phase 5, flag removed in Phase 6). The flag exists for the dual-emit comparison window only.

## Scope

**In scope:**

New main-process modules:
- `src/main/agentChat/identityRegistry.ts` — `IdentityRegistry` class with forward/reverse lookup methods (throws on unknown)
- `src/main/agentChat/eventNormalizer.ts` — converts stream-json events, hook events, and chatCommand events into `CanonicalChatEvent`
- `src/main/agentChat/chatSessionStateMachine.ts` — per-thread state machine, mutates state by event type
- `src/main/agentChat/chatStateBroadcaster.ts` — fans out diffs to subscribed windows; sends snapshots on subscribe
- `src/main/agentChat/chatPersistenceLayer.ts` — single-writer SQLite façade; replaces today's `threadStore.ts` direct callers
- `src/shared/types/chatStateError.ts` + `src/shared/types/canonicalChatEvent.ts` + `src/shared/types/chatStateDiff.ts` — type contracts

Reshaped existing modules (in-place):
- `src/main/agentChat/chatOrchestrationBridge*.ts` — delegate to state machine via normalizer
- `src/main/orchestration/providers/claudeStreamJsonRunner.ts` + `claudeCodeEventHandler.ts` — emit raw events to normalizer instead of directly to bridge progress
- `src/main/hooks.ts` + `src/main/hooksDispatchLogic.ts` — drop unknown PSIDs cleanly; no `inferSessionId` heuristic
- `src/renderer/components/AgentChat/useAgentChatStreaming.ts` + `agentChatWorkspaceSupport.ts` + `agentChatStore.ts` — read from `chatState:diff` only; state is projection of main

New IPC channels (replacing five):
- `chatState:snapshot` (main → renderer): full thread state on subscribe / on demand
- `chatState:diff` (main → renderer): incremental change events with per-thread monotonic `seq`
- `chatCommand:*` (renderer → main): user-initiated commands

Deletions:
- `agent-chat:thread-snapshot` DOM CustomEvent path
- `inferSessionId()` heuristic in `hooksDispatchLogic.ts`
- Synthetic-session-id-equals-threadId masquerade in `chatOrchestrationBridgeMonitor.ts`
- `applyStickyLinkFields()` merge rules in `eventProjector.ts`
- 2-second `syntheticSessionIds` cleanup delay logic in `hooks.ts`
- The four old IPC channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream` separate channels; `hooks:event` retained but normalized at receive)

Schema v10 migration:
- `threads.lastProviderSessionId TEXT NULL`
- `threads.lastInterruptedAt INTEGER NULL`
- `messages.canonical_event_log TEXT NULL` (JSON)
- New table `identity_aliases (thread_id TEXT PRIMARY KEY, turn_id TEXT, provider_session_id TEXT, created_at INTEGER, retired_at INTEGER NULL)`
- Up + down migration pair tested against a seeded Wave-84-era DB

Crash recovery:
- On app start, threads with non-terminal status get `lastInterruptedAt` marker
- Dangling `tool_use` without matching `tool_result` synthesizes `tool_result: [interrupted]` (avoids Anthropic strict-adjacency landmine on `--resume`; per prep doc 03 topic 2)
- Empirically test against real CLI process; fallback: "previous turn interrupted; please re-send" UI if synthesis rejected

Hydration cap:
- Max ~10 fully-hydrated threads in memory
- Thread list pulls summaries only (id, title, status, lastUpdated, messageCount)
- Open hydrates; switch dehydrates after 30s grace
- Target: thread-switch perceived latency < 100ms

Hard-fail banner:
- New renderer component `src/renderer/components/AgentChat/ChatStateErrorBanner.tsx`
- Non-dismissable; shows trace summary + "Restart Chat Session" action; telemetry event on render

Instrumentation:
- New permanent emit points for `[trace:identity]`, `[trace:event]`, `[trace:state]` with structured payloads
- Wave 84 retained `[trace:agent-record]`, `[trace:heat-map]`, `[trace:stream]`, `[trace:chat-order]` removed at Phase 7
- Hard-fail telemetry: every `ChatStateError` throw reports to `telemetry.db` with canonical event + state machine snapshot

Tests:
- Honeycomb shape (per `~/.claude/notes/wave-process.md` test doctrine — cross-layer integration wave)
- Unit tests on `IdentityRegistry`, `EventNormalizer`, `ChatSessionStateMachine` state transitions
- Integration tests on dual-emit equality, crash recovery, multi-window mirror
- Manual smoke gate (UI-bearing per `~/.claude/rules/manual-smoke-gate.md`)

**Out of scope:**

- Mention types (@url, @web, @thread, @diff/@commit) — feature additions; sized for separate wave
- System prompt visibility (#21) — UX feature; Cole's separate scoping
- Per-hunk accept/reject in diff review (#43) — separate wave (selective `git apply` integration)
- `AgentChatConversation.tsx` line-count refactor — known tech debt unrelated to state architecture
- Event sourcing / CQRS-style append-only log refactor — explicitly rejected (per spec §6 and prep doc 03 topic 2 verdict)
- Migration of chat history to CLI JSONL canonical format — SQLite stays authoritative (per Decision 5)
- Pure-reducer Elm-style refactor — testability gain doesn't justify ceremony cost (Approach B in brainstorming)
- Bug 4 (subagent dispatch 500) fix — deferred from Wave 84 to a follow-up wave once passive-instrumentation samples accumulate
- CRDT-based collaborative chat — wrong shape (single-user IDE)
- Refactor of context-injection or rules-loading subsystem — touched only where it intersects identity resolution

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR + pre-flight inventory | orchestrator | Transcribe Locked decisions into `wave-86-decisions.md`. Grep all consumers of the five old IPC channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream`, `hooks:event`, `agent-chat:thread-snapshot` CustomEvent) — produces consumer list for Phase 6 deletion brief. Catalog all retained `[trace:*]` instrumentation from Wave 84 (location + tag + purpose) so Phase 7 can retire what's superseded. Baseline lint + typecheck + scoped vitest under `src/main/agentChat/` and `src/renderer/components/AgentChat/` to confirm clean entry state. Output: `wave-86-decisions.md` populated; `phase-0-results.md` with the consumer grep + instrumentation inventory + baseline gate results. |
| 1 | Walking skeleton — end-to-end new path behind feature flag | sonnet-implementer | **WALKING SKELETON per `~/.claude/rules/walking-skeleton-first.md`.** Build the thinnest end-to-end slice that exercises all new modules at once: `IdentityRegistry` (in-memory only), `EventNormalizer`, minimal `ChatSessionStateMachine` (states IDLE/SUBMITTING/STREAMING/COMPLETING; events `turn_submitted`, `provider_session_assigned`, `text_delta`, `turn_completed`), minimal `ChatStateBroadcaster` (single-window snapshot+diff), one `chatCommand:sendMessage` IPC handler, one renderer-side `chatState:diff` subscriber that renders status + streaming text into a debug panel. Feature flag `chatOrchestration.useNewStateMachine` (default `false`); Phase 1's smoke runs with flag `true` on a NEW thread in a dev session. Old chat code path is untouched. **End-to-end smoke run is the deliverable**: in a live IDE dev session with flag on, Cole sends "hello" via the debug panel; CLI subprocess spawns; stream-json events flow through normalizer; state machine transitions IDLE→SUBMITTING→STREAMING→COMPLETING; renderer's debug panel shows status transitions and final assistant text. No persistence yet (state lost on reload). Unit tests cover `IdentityRegistry.threadIdForProviderSession` happy + throw paths, `EventNormalizer` drop-unknown + throw-malformed, `ChatSessionStateMachine` allowed transitions. |
| 2 | Schema v10 migration + persistence façade | sonnet-implementer | Implement up + down migrations for schema v10 (`threads.lastProviderSessionId`, `threads.lastInterruptedAt`, `messages.canonical_event_log`, new `identity_aliases` table). Migration runs on app start; tested against a wave-84-era seeded DB checked into the test fixtures. Implement `ChatPersistenceLayer` as the only SQLite writer (existing `threadStore.ts` callers route through it). `IdentityRegistry` gains rebuild-from-SQLite on app start; populated from `identity_aliases` rows. No behavioral change yet — state machine is still in-memory; this phase wires the persistence bedrock so Phase 5's crash recovery has somewhere to write. |
| 3 | State machine expansion + dual-emit + diff comparator | sonnet-implementer | Expand `ChatSessionStateMachine` to the full state set (IDLE/SUBMITTING/STREAMING/TOOL_RUNNING/COMPLETING) and full event vocabulary (all 16 canonical event types from spec §4.4). Wire the existing `chatOrchestrationBridge*` runtime to dual-emit: every event that fires the old `activeSends` / progress / monitor path ALSO fires through the normalizer → state machine. Implement `DiffComparator` that snapshots both the old projection (from existing reducers) and the new state machine after each event; asserts shape-equality; throws `ChatStateError` in dev builds on divergence; logs + telemetry in prod builds. Persistence on stable transitions only (`message_committed`, `turn_completed`, `turn_failed`, `turn_cancelled`, `queue_appended`, status transitions). Feature flag stays `false` in production; flipped `true` in dev/test only. |
| 4 | Renderer migration to new IPC contract | sonnet-implementer | Renderer subscribes to `chatState:snapshot` + `chatState:diff` for every thread it displays. `useAgentChatStreaming.ts`, `agentChatStore.ts`, and `agentChatWorkspaceSupport.ts` become projection-only consumers — they read from the new channels and never mutate canonical state. Old IPC channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream`) still emit from main (dual-write) but renderer ignores them. The `agent-chat:thread-snapshot` DOM CustomEvent emit site in `useAgentChatStreaming.ts` is removed; subscribers updated to listen on `chatState:diff` for the same trigger. Multi-window live mirror works: opening the same thread in a second window subscribes to the same broadcaster channel; sends from window A appear in window B within one frame. Snapshot-on-gap implemented: renderer detecting `seq` gap requests a fresh snapshot. Feature flag flipped `true` for dev builds. |
| 5 | Hard-fail banner + crash recovery | sonnet-implementer | Implement `ChatStateErrorBanner` renderer component (non-dismissable; shows trace summary + "Restart Chat Session" action). Banner mounted at the chat workspace root; subscribes to a new `chatState:error` IPC channel that main emits when `ChatStateError` is thrown anywhere in the state-machine path. Telemetry event written to `telemetry.db` on every throw with full canonical event + state snapshot. Crash recovery: on app start, iterate threads in SQLite with non-terminal status; set `lastInterruptedAt = now()`; if last persisted message has a `tool_use` block without matching `tool_result`, synthesize a `tool_result: [interrupted]` message and append to SQLite before any user action. Empirical test against real Claude Code CLI subprocess: kill the subprocess mid-stream, restart the IDE, re-open the affected thread, verify `--resume` succeeds OR fallback "previous turn interrupted — re-send to retry" UI shows. Feature flag flipped `true` for production builds at the end of this phase. |
| 6 | Old code deletion + feature flag removal | sonnet-implementer | Delete: `inferSessionId()` and its call sites; synthetic-session-id-as-threadId masquerade in `chatOrchestrationBridgeMonitor.ts`; `applyStickyLinkFields()` and its call sites; 2-second `syntheticSessionIds` cleanup delay; the four old IPC channel emit sites (`agentChat:thread`, `agentChat:status`, `agentChat:stream`); the `agent-chat:thread-snapshot` CustomEvent path; the old `activeSends` map and progress handlers superseded by the state machine; the `DiffComparator` (no longer needed once old code is gone); the `chatOrchestration.useNewStateMachine` feature flag itself. Phase 0's consumer list from the pre-flight grep is the authoritative deletion checklist — every entry must be addressed (deleted or migrated). Existing test suite must continue to pass; tests that asserted on old IPC channel shapes update to the new channels. |
| 7 | Hydration cap + telemetry hardening + permanent instrumentation finalize | sonnet-implementer | Implement hydration cap: max ~10 fully-hydrated threads in memory; thread list view loads summaries only (id, title, status, lastUpdated, messageCount) via a new `chatCommand:listSummaries`. Opening a thread hydrates; switching dehydrates after 30s grace. Verify thread-switch perceived latency < 100ms under a seeded 50-thread DB. Retire Wave 84 transient instrumentation (`[trace:agent-record]` 3-site chain in `hooksDispatchLogic.ts` + `useAgentEvents.ruleSkillDispatchers.ts` + `ComposerContextPreview.tsx`; `[trace:heat-map]` in `useFileHeatMap.ts`; `[trace:stream]` emit/receive pair; `[trace:chat-order]` snapshot ordering pair). Finalize the three permanent emit points (`[trace:identity]` at every `IdentityRegistry` resolve method; `[trace:event]` at `ChatSessionStateMachine.dispatch()`; `[trace:state]` at `ChatSessionStateMachine` transition method) with structured payloads per spec §4.7. Hard-fail telemetry table created in `telemetry.db` if not already; populated by Phase 5's banner-emit path. |
| Z | Wave wrap | orchestrator | Full `npm run lint`, full `npm run typecheck`, scoped vitest on `src/main/agentChat/`, `src/main/orchestration/`, `src/main/ipc-handlers/`, `src/renderer/components/AgentChat/`, full vitest at push-time. `/review` mechanical gap-check; address all FLAGs. Manual smoke gate (UI-bearing wave per `~/.claude/rules/manual-smoke-gate.md`): six smoke probes per the Verification table, each in light AND dark theme. Update each companion follow-up file in `roadmap/follow-ups/` listed in §Context: re-evaluate against new architecture; close as RESOLVED-BY-OVERHAUL where the leak class is structurally gone, or carry forward as still-OPEN. Author `roadmap/wave-86-chat-orchestration-overhaul/wave-86-auto-brief.md`. Run `/promote-vendor-lessons 86` to extract Claude Code CLI lessons into `.claude/vendor-gotchas/claude-code-cli.md`. Commit Phase Z deliverables; push accumulated wave commits; release the held v2.16.0 tag; update CHANGELOG.md. |

### Phase ordering

```
Phase 0 (ADR + pre-flight inventory)
    ↓
Phase 1 (WALKING SKELETON — end-to-end new path, in-memory only, behind flag)
    ↓                                  ← Gate: smoke runs end-to-end
Phase 2 (Schema v10 + ChatPersistenceLayer)
    ↓
Phase 3 (State machine expansion + dual-emit + diff comparator)
    ↓                                  ← Gate: dual-emit reports zero divergence across 20+ chat turns
Phase 4 (Renderer migration to new IPC contract)
    ↓                                  ← Gate: multi-window live mirror smoke
Phase 5 (Hard-fail banner + crash recovery)
    ↓                                  ← Gate: subprocess-kill crash-recovery smoke
Phase 6 (Old code deletion + feature flag removal)
    ↓                                  ← Gate: Phase 0's consumer list fully resolved
Phase 7 (Hydration cap + instrumentation finalize)
    ↓                                  ← Gate: thread-switch < 100ms under 50-thread seeded DB
Phase Z (Wave wrap)
```

All phases are strictly serial. Phase 5 cannot start before Phase 4 (renderer must read from new channels to display banner). Phase 6 cannot start before Phase 5 (banner is the loud signal that catches deletion regressions). Phase 7 cannot start before Phase 6 (instrumentation finalize depends on old tags being gone).

## Risks

| Risk | Mitigation |
|---|---|
| Phase 1's walking skeleton surfaces an unanticipated cross-subsystem coupling that makes the design unworkable. | Phase 1 smoke IS the gate: if the end-to-end smoke can't run, halt and re-evaluate the design before Phase 2. This is the entire reason walking-skeleton-first is the ordering rule — surface integration risk at the cheapest point. |
| Dual-emit (Phase 3) introduces divergence between old and new paths that's hard to debug. | `DiffComparator` asserts shape-equality after every event and throws `ChatStateError` in dev builds on divergence. Every divergence gets captured to telemetry with both projections. Phase 3 acceptance gate requires zero divergence across ≥20 chat turns in seeded scenarios. |
| Schema v10 migration breaks on a real user's existing v9 DB. | Migration up + down pair tested against a wave-84-era seeded DB checked into test fixtures. Manual smoke at Phase Z runs against Cole's actual DB before tag release; if migration fails, rollback path documented in Phase 2 commit body. |
| Crash-recovery `tool_result: [interrupted]` synthesis is rejected by the CLI on `--resume`. | Phase 5 empirical test: kill subprocess mid-stream, restart, attempt `--resume`. If CLI rejects, code falls back to "previous turn interrupted — re-send to retry" UI marker (no `--resume`). The marker is the `threads.lastInterruptedAt` column from Decision 9. Fallback behavior verified during Phase 5 smoke. |
| Hard-fail banner appears in production on a regression we missed at merge. | Regression-test coverage in Phases 1/2/3/5 explicitly asserts every code path that could throw `ChatStateError` does so under the intended conditions and only those. Phase Z's `/review` mechanical gap-check forward-traces every throw site. If the banner appears in production, telemetry surfaces it within hours and the fix becomes a hotfix wave. Brainstorming Q4 explicitly accepted this tradeoff. |
| Phase 6 deletion misses a consumer of one of the four old IPC channels (e.g., `src/main/web/` HTTP layer, an extension, a test). | Phase 0's pre-flight greps every consumer of every soon-deleted channel and produces a checklist consumed verbatim by Phase 6's brief. Each consumer must be either migrated to the new contract or formally deferred to a follow-up wave with a documented gap. If a consumer's migration is out of scope, the channel emit is preserved (with a deprecation log) and Phase 6's brief is updated to reflect partial deletion. |
| Hydration cap regresses UX when Cole has many open chat tabs and switches quickly. | Phase 7 acceptance gate: thread-switch perceived latency < 100ms under a seeded 50-thread DB. If not achievable, raise the cap (15 / 20) or implement predictive hydration on hover. Phase 7 manual smoke includes a "30+ tabs open, switch between them rapidly" scenario. |
| Wave 84's retained `[trace:*]` instrumentation continues to fire and litters logs during Phases 1–6. | Wave 84 instrumentation stays in place until Phase 7's instrumentation finalize step. During Phases 1–6, both old and new traces coexist; logs are noisy but informative. Phase 7 removes the superseded tags in one sweep with the consumer-list discipline. |
| Manual smoke at Phase Z requires extensive Cole time given the breadth of changes. | Phase Z's smoke checklist groups by surface: chat send/receive (1), multi-window mirror (1), crash recovery (1), hard-fail banner (1 — induced), tab switching (1), light/dark theme parity (×2 over all probes). Roughly 20–30 minutes of focused smoke time. |
| `/review` mechanical gap-check FLAGs hard-fail `throw` statements as scope creep or as "incomplete error handling". | Every `throw ChatStateError(...)` site has an inline comment citing the relevant Locked Decision (#3) and the spec §4.3 location. The `/review` author (orchestrator at Phase Z) addresses each FLAG with the citation. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | n/a | n/a | ADR + pre-flight inventory; no code changes. |
| 1 | `IdentityRegistry.threadIdFor*` happy + throw paths; `EventNormalizer` drop-unknown-PSID + throw-malformed; `ChatSessionStateMachine` allowed transitions (IDLE→SUBMITTING→STREAMING→COMPLETING) and rejected transitions throw; `ChatStateBroadcaster` snapshot + diff emission. | End-to-end smoke: in a live IDE dev session with feature flag on, send "hello" on a new thread via debug panel; verify CLI subprocess spawn, stream-json reception, state machine transitions, renderer status updates. Honeycomb shape — integration smoke is the gate per `~/.claude/notes/wave-process.md` test doctrine. | Walking skeleton phase. Smoke is load-bearing. |
| 2 | Schema v10 migration `up` populates new columns/table with NULL defaults on existing rows; `down` restores v9 shape; `ChatPersistenceLayer.insertAlias` + `loadAliases` round-trip; `IdentityRegistry.rebuildFromSQLite` populates correctly. | Seeded v9 DB → migrate up → verify all existing data preserved AND new schema present; migrate down → verify rollback restores v9 cleanly. | Test fixture: `src/main/storage/__fixtures__/threads-v9-seeded.db` checked in. |
| 3 | Full event vocabulary state-machine transitions (all 16 event types); `DiffComparator.snapshotEquality` happy + divergence paths; persistence on stable transitions only. | Dual-emit on a real chat turn: open chat, send message, complete; both old projection and new state machine produce equal shape; `DiffComparator` reports zero divergence. Honeycomb shape — boundary between old runtime and new state machine is where failures live. | Phase 3 acceptance gate: ≥20 chat turns dual-emitted with zero `DiffComparator` divergence. |
| 4 | Renderer `chatState:diff` subscriber dispatches state updates correctly; snapshot-on-gap behavior fires when `seq` skipped; renderer state mutations all originate from main diff stream. | Multi-window: open same thread in two BrowserWindows, send from window A, verify window B's projection updates within one frame. Honeycomb shape — IPC boundary fan-out is the failure surface. | Live IDE smoke required: multi-window scenario can't be fully exercised in jsdom. |
| 5 | `ChatStateErrorBanner` renders on `chatState:error` IPC; "Restart Chat Session" action dispatches `chatCommand:restartSession`; crash-recovery synthesizes `tool_result: [interrupted]` for dangling `tool_use`; `lastInterruptedAt` populated on stranded threads at startup. | Kill claude subprocess via taskkill mid-stream; restart IDE; verify thread shows interrupted marker; attempt `--resume`; verify success OR documented fallback UI. Honeycomb shape — process-boundary failure is the failure surface. | Live IDE smoke required: real subprocess kill. |
| 6 | n/a — deletion phase. | Existing AgentChat + orchestration vitest suites continue to pass after deletions. Test files asserting against old IPC channel shapes updated to assert new shapes. | Most tests are unchanged. Phase 0 consumer list resolved before Phase 6 completes. |
| 7 | Hydration cap eviction behavior (open 11th thread evicts least-recently-active); thread summary list loads under cap; `[trace:identity]` `[trace:event]` `[trace:state]` emit structured payloads. | Seeded 50-thread DB; UX smoke: tab switching perceived latency. Hard-fail telemetry table populated when banner-emit path fires. | Performance smoke: 50-thread seeded DB; tab-switch latency measured. |
| Z | n/a | Full vitest at push-time; full lint; full typecheck; `/review` mechanical gap-check. | Wave wrap. The wave's deliverable is the overhaul shipped + companion follow-ups re-evaluated, not the tests. |

## Acceptance criteria

- [ ] ADR file `roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md` exists with the ten locked decisions transcribed from Locked decisions above.
- [ ] Phase 0 `phase-0-results.md` includes (a) the consumer grep for each of the five soon-deleted channels, (b) the inventory of Wave 84 retained `[trace:*]` tags by location, (c) clean baseline lint + typecheck + scoped vitest output.
- [ ] Phase 1 walking-skeleton smoke succeeds: with `chatOrchestration.useNewStateMachine=true` in a fresh dev session, Cole sends a message via the debug panel and observes the full IDLE→SUBMITTING→STREAMING→COMPLETING transition, with `[trace:event]` and `[trace:state]` log lines visible for the thread, and the final assistant text rendered.
- [ ] Schema v10 migration `up` + `down` pair tested against the seeded v9 fixture DB; both directions preserve data correctly.
- [ ] `IdentityRegistry` throws `ChatStateError` on any reverse-lookup with an unknown ID; no `inferSessionId()` heuristic remains in the codebase after Phase 6.
- [ ] `DiffComparator` reports zero divergence across ≥20 dual-emitted chat turns in Phase 3 acceptance gate.
- [ ] Multi-window live mirror: opening the same thread in two BrowserWindows shows synchronized state within one frame on a chat send from either window. Verified in Phase 4 live smoke.
- [ ] Crash recovery: killing the `claude` subprocess mid-stream and restarting the IDE shows the affected thread with the `lastInterruptedAt` marker visible in UI; user can re-send to retry. Verified in Phase 5 live smoke.
- [ ] `ChatStateErrorBanner` renders correctly when a `ChatStateError` is induced (test endpoint); displays trace summary + "Restart Chat Session" action; telemetry event written.
- [ ] Old IPC channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream`) and the `agent-chat:thread-snapshot` DOM CustomEvent are removed from the codebase (grep returns zero matches at Phase 6 completion).
- [ ] `chatOrchestration.useNewStateMachine` feature flag is removed from `configSchemaTail.ts` after Phase 6.
- [ ] Hydration cap: thread-switch latency < 100ms under the 50-thread seeded fixture; verified in Phase 7 performance smoke.
- [ ] Three permanent `[trace:*]` tags (`identity`, `event`, `state`) emit structured payloads at their canonical sites; Wave 84 retained `[trace:agent-record]`, `[trace:heat-map]`, `[trace:stream]`, `[trace:chat-order]` tags removed at Phase 7.
- [ ] Companion follow-up files re-evaluated at Phase Z: each is either marked RESOLVED-BY-OVERHAUL with explanation of how the new architecture eliminates the leak class, OR carried forward as still-OPEN with a note on why the overhaul didn't resolve it.
- [ ] Full `npm run lint` clean.
- [ ] Full `npm run typecheck` clean.
- [ ] Scoped + full vitest passes.
- [ ] `/review` mechanical gap-check returns PASS or all FLAGs addressed.
- [ ] Manual smoke checklist signed in `wave-86-auto-brief.md`; verified in both light and dark theme.
- [ ] v2.16.0 tag pushed to origin; CHANGELOG.md entry added; release labels updated.
- [ ] `/promote-vendor-lessons 86` run; `.claude/vendor-gotchas/claude-code-cli.md` updated with Wave 86 lessons (e.g., stream-json `session_id` field timing, `--resume` semantics, tool_use/tool_result adjacency landmine).

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | Phase 0 produces the ADR + pre-flight inventory consumed by later phases. No user-facing surface. |
| 1 | Cole opens the IDE in a dev build with `chatOrchestration.useNewStateMachine=true`, opens a NEW chat thread, types "hello", and presses send | debug panel click → `chatCommand:sendMessage` IPC → `EventNormalizer.fromCommand` → `IdentityRegistry.registerTurn` → `ChatSessionStateMachine.dispatch(turn_submitted)` → `claudeStreamJsonRunner.spawn` → stream-json events arrive → `EventNormalizer.fromStreamJson` resolves to ThreadId → `ChatSessionStateMachine.dispatch(provider_session_assigned + text_delta + turn_completed)` → `ChatStateBroadcaster.diff` IPC → renderer debug-panel subscriber renders status + final text | Cole sees the debug panel's status indicator transition from "idle" to "submitting" to "streaming" to "completed" within a few seconds; the final assistant reply is rendered as plain text in the debug panel. The full transition is also visible in the dev-tools console as `[trace:event]` and `[trace:state]` log lines for the thread. |
| 2 | Internal — no observation point | n/a | Schema migration + persistence façade; no user-facing surface at this phase. User-observable effects (registry-rebuild-after-restart visibility) surface at Phase 5. |
| 3 | Internal — no observation point | n/a | Dual-emit + diff comparator; behaviorally identical to current chat surface from user's perspective. The state machine runs in shadow alongside existing code; verification is the diff-comparator's zero-divergence assertion, not a user-facing change. |
| 4 | Cole opens the same chat thread in two IDE windows (window A and window B) simultaneously, types a message in window A's composer, and presses send | window A composer → `chatCommand:sendMessage` IPC → main `ChatSessionStateMachine` dispatches turn → state machine emits diffs → `ChatStateBroadcaster` fans out to BOTH window A and window B's subscribers → window A's renderer projection updates → window B's renderer projection updates (separate IPC fan-out) → both windows render the new user message and the streaming agent reply | Both window A AND window B show the new user message appearing at the same time (within one animation frame). The streaming agent reply progresses simultaneously in both windows. Cole can switch focus between windows without losing any rendered state. Composer drafts in each window are independent (typing in window A's composer doesn't appear in window B's composer). |
| 5 | Cole has an active chat with the agent mid-stream; Cole opens Task Manager and kills the `claude.exe` subprocess for that chat; Cole switches back to the IDE | subprocess SIGKILL → main detects stdout EOF → `ChatSessionStateMachine.dispatch(turn_failed)` → state transitions to COMPLETING → persistence writes `lastInterruptedAt` to threads row → if dangling `tool_use` without `tool_result`, synthesizes `tool_result: [interrupted]` and writes to messages → `ChatStateBroadcaster` emits status diff → renderer projection updates → thread header renders the "Previous turn interrupted" badge with a "Re-send to retry" action | The chat thread shows a yellow "Previous turn interrupted" badge near the top of the conversation. The half-finished assistant message remains visible (frozen at last-received state). Clicking "Re-send to retry" re-submits the user's last message and the agent starts fresh. No error banner appears. No data loss. |
| 6 | Internal — no observation point | n/a | Old code deletion; behaviorally identical to Phase 5's end state. Cole notices nothing different in the chat surface. Verification is grep zero-matches on deleted symbols + existing test suite passing. |
| 7 | Cole opens the IDE with a seeded 50-thread workspace, clicks on a thread in the sidebar, then rapidly clicks between five different threads in the sidebar | Sidebar click → `chatCommand:hydrateThread(threadId)` IPC → main `ChatPersistenceLayer.hydrate(threadId)` reads from SQLite (cap-aware) → `ChatStateBroadcaster` emits snapshot for that thread → renderer projection renders messages → previously-hydrated thread beyond cap dehydrates 30s later → repeat on next click | Each thread the sidebar renders has its messages visible within ~100ms (perceived as instant). Rapid clicking between threads does not produce a "loading" placeholder. Memory profiler in dev-tools shows roughly constant heap size as Cole bounces between threads — the hydration cap holds. |
| Z | Internal — no observation point | n/a | Wave wrap. The user-observable phases (1, 4, 5, 7) carry the experiential observations. Phase Z's deliverable is the wave shipping cleanly to main with the held v2.16.0 tag released and companion follow-ups re-evaluated. |

### Data-shape probes

```bash
# After Phase 0, verify ADR + pre-flight outputs
test -f roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md
test -f roadmap/wave-86-chat-orchestration-overhaul/phase-0-results.md
grep -c "^[0-9]\+\." roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md   # expect >= 10

# After Phase 1, verify walking-skeleton modules exist
test -f src/main/agentChat/identityRegistry.ts
test -f src/main/agentChat/eventNormalizer.ts
test -f src/main/agentChat/chatSessionStateMachine.ts
test -f src/main/agentChat/chatStateBroadcaster.ts
test -f src/shared/types/chatStateError.ts
test -f src/shared/types/canonicalChatEvent.ts

# After Phase 2, verify schema v10 migration
sqlite3 ~/AppData/Roaming/ouroboros/agent-chat/threads/<hash>.db "PRAGMA user_version;"   # expect 10
sqlite3 <db> "SELECT name FROM sqlite_master WHERE type='table' AND name='identity_aliases';"   # expect identity_aliases
sqlite3 <db> "SELECT name FROM pragma_table_info('threads') WHERE name='lastProviderSessionId';"   # expect non-empty

# After Phase 3, verify dual-emit + diff comparator
grep -rn "DiffComparator" src/main/agentChat/   # expect emit point
grep -rn "useNewStateMachine" src/main/configSchemaTail.ts   # expect feature flag declared

# After Phase 6, verify deletions
grep -rn "inferSessionId\|applyStickyLinkFields\|syntheticSessionIds" src/main/   # expect zero matches
grep -rn "agent-chat:thread-snapshot" src/renderer/   # expect zero matches
grep -rn "useNewStateMachine" src/main/   # expect zero matches (flag removed)
grep -rn "agentChat:thread\b\|agentChat:status\b\|agentChat:stream\b" src/   # expect zero matches (old channels)

# After Phase 7, verify permanent instrumentation
grep -rn "\[trace:identity\]" src/main/agentChat/identityRegistry.ts   # expect emit points
grep -rn "\[trace:event\]" src/main/agentChat/chatSessionStateMachine.ts   # expect single emit point
grep -rn "\[trace:state\]" src/main/agentChat/chatSessionStateMachine.ts   # expect single emit point
grep -rn "\[trace:agent-record\]\|\[trace:heat-map\]\|\[trace:stream\]\|\[trace:chat-order\]" src/   # expect zero matches

# Confirm companion follow-ups re-evaluated at Phase Z
grep -l "RESOLVED-BY-OVERHAUL\|status: RESOLVED.*wave-86" roadmap/follow-ups/2026-05-11-*.md | wc -l   # expect >= 4

# Confirm CHANGELOG entry
grep -A 10 "v2.16.0" CHANGELOG.md   # expect non-empty section with this wave's bullets
```

## Files the next agent should read first

1. `docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md` — the approved design spec; this wave's source of truth.
2. `roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md` — ADR scaffold; Phase 0 fills from the Locked decisions above.
3. `roadmap/foundation/chat-orchestration/00-prep-codebase-manifest.md` — AS-IS map with file:line citations for every leak class.
4. `roadmap/foundation/chat-orchestration/01-research-claude-code-cli-headless.md` — CLI subscription/headless capability matrix; what the CLI provides vs SDK.
5. `roadmap/foundation/chat-orchestration/02-research-ide-chat-patterns.md` — IDE survey; Continue.dev is the closest architectural cousin.
6. `roadmap/foundation/chat-orchestration/03-research-streaming-state-architecture.md` — streaming/state architecture spectrum + Ouroboros-specific load-bearing constraints synthesis.
7. `roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md` — original follow-up that framed this overhaul.
8. `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/waveplan-84.md` — closure status documents the pivot decision and inherited instrumentation.
9. `src/main/agentChat/CLAUDE.md` (if present) and `src/renderer/components/AgentChat/CLAUDE.md` — chat surface maps.
10. `src/main/agentChat/chatOrchestrationBridge.ts` + `chatOrchestrationBridge*.ts` siblings — the runtime being reshaped.
11. `src/main/orchestration/providers/claudeStreamJsonRunner.ts` + `claudeCodeEventHandler.ts` — stream-json ingress point.
12. `src/main/hooks.ts` + `src/main/hooksDispatchLogic.ts` + `src/main/hooksChatLaunch.ts` — hook-pipe ingress point + the suppression gate being replaced.
13. `src/main/storage/threadStoreSqlite.ts` + `threadStoreSqliteHelpers.ts` — schema v9 source; Phase 2 builds v10 here.
14. `src/renderer/components/AgentChat/useAgentChatStreaming.ts` + `agentChatWorkspaceSupport.ts` + `agentChatStore.ts` — renderer reducers being reshaped to projection-only.
15. `~/.claude/rules/walking-skeleton-first.md` — non-negotiable for Phase 1's framing.
16. `~/.claude/rules/debug-before-fix.md` — applies to dual-emit divergence investigations in Phase 3.
17. `~/.claude/rules/agent-catalog.md` — implementer dispatch routing (all sonnet-implementer in this wave; no haiku phases).
18. `~/.claude/notes/wave-process.md` — Sites 1/2/3 + walking-skeleton + honeycomb test doctrine. Re-read before drafting any phase brief.

## Note to the implementer

This wave is the structural overhaul that Wave 84 surfaced the need for. The spec at `docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md` is the source of truth — read it end-to-end before touching any code. The four prep artifacts in `roadmap/foundation/chat-orchestration/` are the grounding for every decision; cite them in commit messages when behavior derives from them.

The single most likely failure mode is **shipping a phase that "works in isolation" but doesn't compose with adjacent phases**. The dual-emit window in Phase 3 is the primary defense — old and new paths run side-by-side and `DiffComparator` hard-fails on divergence. Resist the temptation to skip dual-emit or weaken the comparator to "warn instead of throw" because the equality assertion is what surfaces the integration bugs that bug-by-bug fixing missed in Wave 84. The hard-fail discipline (Decision 3) is non-negotiable in dev builds; production builds inherit the same throws because regression tests catch them at merge.

The second most likely failure mode is **scope creep into adjacent code that "looks broken"**. Tier-3 scope creep per `~/.claude/rules/development-pipeline.md` is especially tempting in chat code because the surface is dense with adjacent issues — surface anything noticed-but-unrelated as a follow-up in `roadmap/follow-ups/` and keep moving. The mention-types cluster, system prompt visibility, per-hunk accept/reject, the `AgentChatConversation.tsx` line-count refactor, and the chat-history-to-JSONL migration are explicitly out of scope. Do not pull them forward; they have their own scoping decisions pending.

Phase 1 is a walking skeleton per `~/.claude/rules/walking-skeleton-first.md` because this wave introduces a new architectural surface (`IdentityRegistry` + `EventNormalizer` + `ChatSessionStateMachine` + `ChatStateBroadcaster` interacting end-to-end). Phase 1's deliverable is the slice running end-to-end with the smoke run — not "scaffolding the modules". If Phase 1's smoke can't run, halt and re-evaluate before Phase 2. This is the cheapest point to surface integration risk; the entire wave plan depends on it.

The instrumentation discipline is the third permanent defense. Three tags (`[trace:identity]`, `[trace:event]`, `[trace:state]`) at canonical single emit points; investigation-specific `[trace:DEBUG-*]` tags can be added per bug AND must be removed at end of the investigating wave. The Wave 84 retained tags (`[trace:agent-record]`, `[trace:heat-map]`, `[trace:stream]`, `[trace:chat-order]`) coexist with the new tags through Phases 1–6 and are retired in Phase 7 in one sweep. Don't remove them mid-wave; they're the only diagnostic surface for the very bugs this wave exists to eliminate.

Per existing repo policy: subagents skip full `npm test` (~280s exceeds patience); orchestrator runs scoped vitest on touched paths after each phase commit, full vitest at push-time. Push policy is per-wave, not per-phase — accumulate phase commits locally and push once at Phase Z wrap after `/review` PASS. All Phase implementers in this wave are `sonnet-implementer` (cross-subsystem judgment required throughout; no haiku-friendly tight-spec phases).

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. **Verify ADR scaffold exists.** Confirm `roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md` exists with the ten locked decisions transcribed from the Locked decisions section above. If empty, populate it before dispatching Phase 1. All ten decisions are pre-locked from brainstorming + spec — no pending user lock.
2. **Phase 0 dispatch (orchestrator-only).** Run the consumer grep for each of the five soon-deleted channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream`, `hooks:event`, `agent-chat:thread-snapshot`). Inventory all Wave 84 retained `[trace:*]` tags by location. Run baseline `npm run lint` + `npm run typecheck` + scoped `vitest run src/main/agentChat src/renderer/components/AgentChat` to confirm clean entry state. Output: `phase-0-results.md` with grep results, instrumentation inventory, baseline gate results.
3. **Phase 1 dispatch (sonnet-implementer).** Brief covers: walking-skeleton rule (the smoke is the deliverable, not the scaffolding); new module locations (`src/main/agentChat/identityRegistry.ts`, `eventNormalizer.ts`, `chatSessionStateMachine.ts`, `chatStateBroadcaster.ts`); new shared types (`src/shared/types/chatStateError.ts`, `canonicalChatEvent.ts`); new IPC channels (`chatState:snapshot`, `chatState:diff`, `chatCommand:sendMessage` minimal); feature flag `chatOrchestration.useNewStateMachine` (default false); minimal state set (IDLE/SUBMITTING/STREAMING/COMPLETING) and minimal event set (4 types); no persistence yet (in-memory only). Unit tests on registry happy + throw, normalizer drop-unknown + throw-malformed, state machine transitions. Acceptance gate: end-to-end smoke as described in Verification table row 1.
4. **Orchestrator diff review of Phase 1.** Verify smoke ran end-to-end (Cole confirms or implementer cites observed runtime trace); modules created with intended responsibilities; no premature additions beyond walking-skeleton scope; unit tests assert the throw paths (not just happy paths).
5. **Phase 2 dispatch (sonnet-implementer).** Brief covers: schema v10 migration (four additions per Decision 9); seeded v9 fixture DB at `src/main/storage/__fixtures__/threads-v9-seeded.db` checked in; up + down migration pair; `ChatPersistenceLayer` class as the only SQLite writer; `IdentityRegistry.rebuildFromSQLite` on app start; no behavioral change yet (state machine still in-memory). Acceptance gate: seeded DB migrates up + down cleanly, all data preserved; identity_aliases table populated by existing dual-write path.
6. **Orchestrator diff review of Phase 2.** Verify migration is reversible; persistence writes go ONLY through `ChatPersistenceLayer`; no direct `threadStoreSqlite.ts` calls remain outside the layer.
7. **Phase 3 dispatch (sonnet-implementer).** Brief covers: state machine expansion to full 5-state, 16-event vocabulary per spec §4.4–§4.5; dual-emit from existing bridge runtime; `DiffComparator` class that snapshots both projections and throws `ChatStateError` on divergence in dev builds; persistence on stable transitions only. Acceptance gate: ≥20 dual-emitted chat turns in seeded scenarios produce zero `DiffComparator` divergences; if divergences appear, instrument-before-fix per `~/.claude/rules/debug-before-fix.md`.
8. **Orchestrator diff review of Phase 3.** Verify diff comparator is non-bypassable; all 16 canonical event types covered with allowed-transition table; persistence writes fired only on stable transitions (not per-delta).
9. **Phase 4 dispatch (sonnet-implementer).** Brief covers: renderer subscribes to `chatState:snapshot` + `chatState:diff` for every thread it displays; `useAgentChatStreaming.ts`, `agentChatStore.ts`, `agentChatWorkspaceSupport.ts` reshaped to projection-only (no canonical state mutation); old IPC channels still emit from main but renderer ignores them; `agent-chat:thread-snapshot` DOM CustomEvent emit site removed; multi-window live-mirror smoke. Acceptance gate: multi-window smoke per Verification table row 4 (two windows, same thread, send in A, observe mirror in B within one frame).
10. **Orchestrator diff review of Phase 4.** Verify all renderer state mutations originate from `chatState:*` channels; old IPC channel subscribers in renderer fully removed (grep zero matches); `agent-chat:thread-snapshot` CustomEvent path gone; multi-window mirror smoke verified by Cole.
11. **Phase 5 dispatch (sonnet-implementer).** Brief covers: `ChatStateErrorBanner` component (non-dismissable); new `chatState:error` IPC channel; telemetry on every throw; crash recovery (synthesize `tool_result: [interrupted]` for dangling `tool_use`; `lastInterruptedAt` marker); empirical CLI `--resume` test (subprocess kill → restart → resume succeeds or documented fallback); feature flag flipped to `true` for production at end of phase. Acceptance gate: subprocess-kill crash-recovery smoke per Verification table row 5.
12. **Orchestrator diff review of Phase 5.** Verify banner appears on induced throw; telemetry payload includes full canonical event + state snapshot; crash recovery synthesizes `tool_result` correctly; `--resume` empirically tested (or fallback documented if rejected).
13. **Phase 6 dispatch (sonnet-implementer).** Brief includes Phase 0's consumer list as the authoritative deletion checklist. Cover: delete `inferSessionId`, synthetic-sessionId masquerade, `applyStickyLinkFields`, 2-second cleanup delay, four old IPC channel emit sites, DOM CustomEvent path, old `activeSends` and progress handlers superseded by state machine, `DiffComparator` itself, feature flag declaration. Update tests that asserted against old channel shapes. Acceptance gate: grep zero matches for deleted symbols + Phase 0 consumer list fully resolved.
14. **Orchestrator diff review of Phase 6.** Verify Phase 0 consumer list addressed entry-by-entry; existing test suites pass after deletions; no residual feature-flag references.
15. **Phase 7 dispatch (sonnet-implementer).** Brief covers: hydration cap implementation; thread summary list IPC; 30s dehydration grace; performance smoke under seeded 50-thread DB; retire Wave 84 retained `[trace:*]` tags; finalize three permanent emit points with structured payloads per spec §4.7; hard-fail telemetry table. Acceptance gate: thread-switch < 100ms under 50-thread seeded DB; Wave 84 trace tags grep returns zero matches.
16. **Orchestrator diff review of Phase 7.** Verify hydration cap holds under load; perceived latency goal met; three permanent traces emit structured payloads at single canonical sites; Wave 84 traces fully retired.
17. **Phase Z (orchestrator).** Run full `npm run lint`, full `npm run typecheck`, scoped vitest, full vitest at push-time. `/review` mechanical gap-check; address all FLAGs. Manual smoke gate per `~/.claude/rules/manual-smoke-gate.md`: six smoke probes per Verification table, each in light AND dark theme. Re-evaluate every companion follow-up file: mark RESOLVED-BY-OVERHAUL where leak class is structurally gone, or carry forward OPEN with explanation. Author `wave-86-auto-brief.md`. Run `/promote-vendor-lessons 86`. Commit Phase Z deliverables; push wave commits; release the held v2.16.0 tag; update CHANGELOG.md and release labels.
