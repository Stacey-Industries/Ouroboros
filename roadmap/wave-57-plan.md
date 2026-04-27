# Wave 57 — Subagent Display in Agent Monitor
## Implementation Plan (DRAFT)

**Version target:** v2.9.x (patch — bug fix; restores subagent visibility that the Agent Monitor type system already advertises)
**Feature flags:** new `agentMonitor.subagentDisplay.enabled` (default `false` until Phase E validates), new `agentMonitor.subagentDisplay.diagnostics` (default `false` — gated trace logging for Phase A/E)
**Dependencies:**
- None hard. The fix is internal to the hook pipeline and the renderer reducer; no schema or contract changes leak to other waves.
- Soft synergy with Wave 53's restored telemetry — Phase E uses session JSONL signals to confirm parent/child topology end-to-end. If Wave 53 isn't shipped, Phase E's measurement falls back to manual smoke.
**References:**
- `src/main/agentChat/subagentTracker.ts` — main-process subagent record store (already exists; not replaced)
- `src/main/agentChat/chatOrchestrationBridgeMonitor.ts` — emits synthetic `agent_start` for chat parent (only the parent today)
- `src/main/agentChat/chatOrchestrationBridgeProgress.ts` — chat-side progress dispatch
- `src/main/hooks.ts` — named-pipe server; surface where CLI-path Task tool events arrive
- `src/renderer/hooks/useAgentEvents.helpers.ts` — reducer; `parentSessionId` resolution + temporal stamping
- `src/renderer/hooks/useAgentEvents.subagentReducers.ts` — `linkSubagent`, `pendingSubagentLinks`, `findTemporalParent`
- `src/renderer/hooks/useAgentEvents.payload.ts` — `HookPayload` → action parsing
- `src/renderer/components/AgentMonitor/types.ts` — `AgentSession.parentSessionId`
- `src/renderer/components/AgentMonitor/AgentTree.tsx` — tree-mode rendering for parent→child relationships

---

## Numbering note

Wave 55 is conceptually reserved by Wave 54's Phase E follow-up (`roadmap/wave-55-gating-decision.md` would carry the rename/safeDelete decision). Wave 56 (Teams Mode) is already drafted. Wave 57 is the next available wave-plan slot.

---

## Background

The Agent Monitor advertises subagent-aware UI:

- `AgentSession.parentSessionId` is a public field on the type (`src/renderer/components/AgentMonitor/types.ts:20`).
- `AgentTree.tsx` exists specifically to render parent→child relationships.
- The reducer carries linking machinery: `linkSubagent`, `pendingSubagentLinks`, `findTemporalParent`, and a 30-second temporal window (`useAgentEvents.subagentReducers.ts:21`).
- `subagentTracker.ts` (main process) tracks subagent lifecycle independently of the renderer reducer — `recordStart` / `recordMessage` / `recordUsage` / `recordEnd` with idempotent re-entry and a fast path via `onTaskToolPreUse` that reads `childSessionId` from Task tool input.

Despite all of that infrastructure, **subagents do not appear as separate entities nested under the parent in the Agent Monitor.** The user-visible bug is that a chat or CLI session that spawns subagents shows a single parent card with no children, even when work is genuinely happening in child sessions.

There are two spawning paths and they fail differently:

1. **CLI path** (terminal Claude Code → Task tool with a fresh child session). Hook events arrive via the named pipe. The child's `agent_start` payload may not carry `parentSessionId`, or the `childSessionId` in the parent's `pre_tool_use` Task event may not match the child's incoming `session_id`. The reducer's temporal-window fallback catches some cases but not all.
2. **Chat path** (Anthropic-API direct chat → orchestration bridge → in-process subagent spawn). The chat bridge emits exactly **one** synthetic `agent_start` for the parent thread (`chatOrchestrationBridgeMonitor.ts:91`). When the chat agent uses the Task tool internally, no synthetic `agent_start` fires for the child — the child is invisible to the renderer regardless of how good the linking machinery is.

This wave fixes both paths under a common diagnostic and behind a feature flag.

**This wave does not redesign the subagent model.** `subagentTracker` stays. `AgentTree` stays. The reducer's linking actions stay. The wave closes the gaps between them.

---

## Implementation review summary

### Confirmed state (will be re-verified by Phase A spike)

- `AgentSession.parentSessionId` is the load-bearing field; `AgentTree` renders only when at least one session has it set AND no active filter query (per `AgentMonitor/CLAUDE.md`).
- `subagentTracker` and the renderer reducer are **two separate populations**. No code path reads from `subagentTracker` to seed renderer state. Renderer state is hook-event-driven.
- `chatOrchestrationBridgeMonitor.ts:91-110` emits the parent's synthetic `agent_start`. There is no equivalent code path for chat-spawned subagents.
- `useAgentEvents.helpers.ts:228-251` resolves `parentSessionId` from (in order): explicit payload field, `pendingSubagentLinks` map, temporal stamp match within 30s, otherwise undefined.
- `subagentTracker.onTaskToolPreUse` (`subagentTracker.ts:231-244`) reads `input.childSessionId` from the Task tool payload and calls `recordStart` — but only on the main-process side; this never feeds the renderer.

### Gaps this wave closes

- CLI path: child `agent_start` events arrive without `parentSessionId`; the renderer must use the temporal fallback or fail. The hook tap doesn't enrich the payload from `subagentTracker`'s known mapping.
- Chat path: no synthetic `agent_start` / `agent_end` for chat-spawned subagents; AgentTree never sees them.
- Diagnostics: today there is no structured trace of "did this Task tool's child get linked?" — debugging requires reading code rather than reading logs. Per `~/.claude/rules/multi-process-debugging.md` and the project's "debug before fix" feedback memory, instrumentation comes first.
- AgentTree triggering: the tree renders only when relationships exist AND no filter query — verify both conditions remain true once children are wired.

---

## Scope

### In-scope

- Phase A: instrument both paths, run real reproductions, capture a structured trace report. **No code changes that fix behavior.** The spike answers what's actually arriving.
- Phase B: CLI-path repair — guarantee `parentSessionId` propagation via the existing `subagentTracker` mapping. Surface as enrichment at the hook tap, not as a contract change.
- Phase C: Chat-path emission — chat orchestration bridge emits synthetic `agent_start` and `agent_end` for child sessions when the agent uses the Task tool. Emits `parentSessionId = ctx.threadId` and a stable child session ID derived from the Task tool call.
- Phase D: Renderer wiring polish — verify `AgentTree` switches to tree mode reliably; ensure the reducer doesn't lose `parentSessionId` on resume / restore.
- Phase E: integration test, soak window, decision on flipping the flag default to `true`.

### Out-of-scope

- Refactor of `subagentTracker` data model or the reducer's `AgentState` shape.
- Cost roll-up UI for subagents (already conceptually handled by `subagentTracker.rollupCostForParent`; surfacing it in the UI is a separate wave).
- Multi-level subagent nesting beyond a single parent → child relationship. The current types support arbitrary depth via repeated `parentSessionId` linkage, but this wave only commits to one level being correct end-to-end. Deeper nesting is a follow-up.
- Replacing the temporal-window heuristic. It's a fallback, not the primary linkage path; this wave makes the primary path more reliable so the fallback fires less often, but the heuristic stays.
- Any change to AgentMonitor's filter pipeline beyond what's required to keep tree mode rendering when children exist.

---

## Verified starting point

Reusable:

- `subagentTracker` lifecycle store — already records parent/child mapping on the main side.
- `linkSubagent` reducer + `pendingSubagentLinks` map + `findTemporalParent` — already handles late linkage.
- `dispatchSyntheticHookEvent` — main-process helper for emitting synthetic events into the hook pipeline.
- `AgentTree` — already renders parent→child when relationships exist.
- `chatOrchestrationBridgeMonitor.ts` — already has the synthetic-emit pattern for the parent; adding child emission follows the same shape.

Explicitly targeted:

- Hook-tap enrichment of `parentSessionId` on incoming `agent_start` from CLI-path subagents.
- New synthetic emission path for chat-spawned subagents in the chat orchestration bridge.
- Trace logging at every linkage decision point (gated on the diagnostics flag).
- AgentTree render-trigger verification under live (not just restored-from-disk) sessions.

---

## Architecture

```text
CLI path
─────────
terminal Claude Code (parent session)
  └─ pre_tool_use Task { childSessionId } ─┐
                                            ▼
src/main/hooks.ts                     subagentTracker.recordStart
  └─ on agent_start payload          (parent ↔ child mapping)
       ├─ if missing parentSessionId,
       │    look up subagentTracker  ◄────────── enrich
       └─ dispatch enriched event to renderer

renderer
  └─ AGENT_START reducer
       └─ parentSessionId set          → AgentTree renders nested

Chat path
──────────
chatOrchestrationBridge (parent thread)
  └─ Task block detected in stream  ─┐
                                      ▼
chatOrchestrationBridgeMonitor       (new)
  └─ emit synthetic agent_start for child
     { sessionId: childId, parentSessionId: ctx.threadId }
  └─ on child completion, emit synthetic agent_end

renderer
  └─ same AGENT_START reducer path; same AgentTree rendering
```

**Key design calls:**

- **Don't change the hook-payload contract.** The renderer's `HookPayload.parentSessionId` field already exists. Phase B fills it at the tap rather than introducing a new field or new event type.
- **Stable child session ID for chat path.** The chat path doesn't have a Claude Code child process to give us a `session_id`; we mint one as `chat-sub:{parentThreadId}:{toolCallId}`. The reducer treats it as opaque.
- **Diagnostics behind a flag.** `agentMonitor.subagentDisplay.diagnostics` gates the verbose trace logs. Default off; Phase A enables it for the spike, Phase E flips it back off after measurement.
- **Behavior change behind a flag.** `agentMonitor.subagentDisplay.enabled` gates Phases B and C. Default `false` until Phase E validates. Phase E proposes flipping to `true` based on soak data.
- **No reducer state-shape changes.** The fix lands by populating fields the reducer already consumes — no new actions, no new state slots, no migration concerns.

---

## Phase A — Diagnostic spike (no behavior change)

**Goal:** Instrument both paths and capture what's actually arriving. Don't fix anything yet.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/agentChat/subagentLinkTrace.ts` | ~180 | Structured trace helpers gated on `agentMonitor.subagentDisplay.diagnostics`. Exports `traceLink(stage, payload)` with stable schema: `{stage, parentSessionId, childSessionId, toolCallId, source, timestamp}`. |
| `src/main/agentChat/subagentLinkTrace.test.ts` | ~140 | Unit tests for the trace gate (off by default; on when flag set; output schema is stable). |
| `roadmap/wave-57-phase-a-spike.md` | ~280 | Captured trace observations across 4 reproductions: CLI/single-Task, CLI/multi-Task, chat/single-Task, chat/multi-Task. Records what payload fields are present at each stage and what's missing. **The spike report is the gating artifact for Phase B/C.** |

### Modified files

| File | Change |
|---|---|
| `src/main/hooks.ts` | Insert `traceLink('hook:incoming', ...)` for incoming `agent_start` and `pre_tool_use` Task events. No payload mutation. |
| `src/main/agentChat/subagentTracker.ts` | `traceLink('tracker:recordStart', ...)` and `traceLink('tracker:recordEnd', ...)`. No behavior change. |
| `src/main/agentChat/chatOrchestrationBridgeProgress.ts` | `traceLink('chat:taskBlockObserved', ...)` when a Task tool block surfaces in the stream. No emission yet. |
| `src/renderer/hooks/useAgentEvents.helpers.ts` | `console.warn('[trace:subagent-link]', ...)` only when the diagnostics flag is on, at the `parentSessionId` resolution decision branch. Reverted at Phase E close. |
| `src/main/configSchemaTail.ts` | Add `agentMonitor.subagentDisplay.diagnostics` (default `false`). |

### Subagent briefing

- **Read first:** `src/main/agentChat/subagentTracker.ts` end-to-end, `src/main/hooks.ts` (the named-pipe server), `chatOrchestrationBridgeMonitor.ts:85-110`, `useAgentEvents.helpers.ts:200-260`, the four-bug compaction summary.
- **No fixes.** This phase only adds instrumentation. If you find an obvious bug, document it in the spike report; do NOT fix it. Phase B/C own the fixes.
- **Reproduction matters.** Capture all four scenarios; the chat-path multi-Task case is the load-bearing one for Phase C scope.
- **Use `console.warn` with `[trace:subagent-link]` prefix in the renderer** so the existing `no-console: warn` lint rule lets it through. Remove on Phase E close per `debug-before-fix.md`'s "Remove only the investigation-specific logging after a fix."
- **Trace schema must be stable** so Phase E can grep it programmatically. `{stage, parent, child, toolCallId, source, timestamp}` — same shape at every emission point.

### Acceptance

- [ ] Diagnostics flag toggles trace emission; default off produces no log noise.
- [ ] Phase A spike report exists in `roadmap/wave-57-phase-a-spike.md` with all four reproductions captured.
- [ ] Each reproduction documents: (a) which `parentSessionId`/`childSessionId` values flow at each stage, (b) which fields are missing from incoming events, (c) whether the temporal-window fallback fires.
- [ ] No behavior change committed. `npx vitest run` and `npx tsc --noEmit` clean against the existing test suite.
- [ ] Commit: `feat(wave-57): Phase A — subagent linkage diagnostic spike`

---

## Phase B — CLI-path enrichment

**Goal:** Guarantee `parentSessionId` propagation for CLI-spawned subagents using the mapping `subagentTracker` already maintains.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/agentChat/subagentLinkResolver.ts` | ~200 | `resolveParentSessionId(childSessionId): string \| undefined` reads from `subagentTracker`. Pure read; no mutation. Used by the hook tap to enrich incoming events. |
| `src/main/agentChat/subagentLinkResolver.test.ts` | ~220 | Resolver: returns parent when tracker has it, returns undefined when it doesn't, never throws on unknown IDs. |

### Modified files

| File | Change |
|---|---|
| `src/main/hooks.ts` | When an `agent_start` payload arrives without `parentSessionId`, call `resolveParentSessionId(payload.sessionId)` and enrich. Gated on `agentMonitor.subagentDisplay.enabled`. |
| `src/main/agentChat/subagentTracker.ts` | Add `getParentSessionIdFor(childSessionId)` accessor (thin wrapper around the existing records map). No data-model change. |
| `src/main/configSchemaTail.ts` | Add `agentMonitor.subagentDisplay.enabled` (default `false`). |

### Subagent briefing

- **Read first:** Phase A spike report, `src/main/hooks.ts` payload-handling code, `subagentTracker.ts` end-to-end.
- **Enrich, don't replace.** If the payload already carries `parentSessionId`, leave it. The resolver only fills missing fields.
- **Don't touch the renderer reducer.** The reducer already does the right thing once `parentSessionId` is present in the payload — Phase A's spike confirmed this. If Phase A's report shows the reducer also has bugs, scope a separate phase rather than mixing concerns.
- **Flag-gated.** When the flag is off, the enrichment is a no-op. This lets us ship Phase B without changing visible behavior, and lets Phase E flip the flag with a single config change.
- **No new hook event types.** Reuse `agent_start`. The wave's whole premise is that the existing types are sufficient.

### Acceptance

- [ ] Resolver returns the recorded parent when the tracker has it; returns `undefined` cleanly when it doesn't.
- [ ] When the flag is on, CLI-path Task tool subagents land in the renderer with `parentSessionId` set; AgentTree renders them nested under the parent.
- [ ] When the flag is off, behavior matches today (no regression).
- [ ] Phase A's CLI repro now shows `[trace:subagent-link]` decisions resolving on the explicit-payload path, not the temporal fallback.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-57): Phase B — CLI-path parentSessionId enrichment`

---

## Phase C — Chat-path synthetic emission

**Goal:** When a chat agent uses the Task tool internally, emit synthetic `agent_start` / `agent_end` for the child so AgentTree sees it.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/agentChat/chatOrchestrationBridgeSubagent.ts` | ~280 | `emitChatSubagentStart(ctx, taskBlock)` and `emitChatSubagentEnd(ctx, taskBlock, result)`. Mints stable child session ID `chat-sub:{threadId}:{toolCallId}`. Calls `dispatchSyntheticHookEvent` with `parentSessionId: ctx.threadId`. |
| `src/main/agentChat/chatOrchestrationBridgeSubagent.test.ts` | ~260 | Tests: stable ID minting, parent linkage on emit, idempotent re-emit, end emission on success/failure/cancellation. |

### Modified files

| File | Change |
|---|---|
| `src/main/agentChat/chatOrchestrationBridgeProgress.ts` | When a Task tool block surfaces in the stream, call `emitChatSubagentStart` (gated on flag). On Task block completion (success/failure), call `emitChatSubagentEnd`. Cancellation routes through `emitChatSubagentEnd` with `'Cancelled'` status. |
| `src/main/agentChat/chatOrchestrationBridgeTypes.ts` | Add `chatSubagentEmissions: Map<toolCallId, {childSessionId, started: boolean, ended: boolean}>` to `ActiveStreamContext` to enforce idempotence. |
| `src/main/agentChat/chatOrchestrationBridgeMonitor.ts` | Reset `chatSubagentEmissions` on stream end so a refresh-mid-turn doesn't re-emit. |

### Subagent briefing

- **Read first:** Phase A's chat-path traces, `chatOrchestrationBridgeMonitor.ts:91-110` (parent's existing synthetic emission — your child emission mirrors its shape), `chatOrchestrationBridgeProgress.ts:170-200`.
- **Stable child IDs are non-negotiable.** Mid-stream chunks may arrive in any order; the renderer reducer dedupes by ID. `chat-sub:{threadId}:{toolCallId}` is deterministic — same Task call always maps to same child ID.
- **Emit before the first child tool event, end after the last.** AgentTree needs the parent linkage before children render; the end emission needs to fire even if the Task block fails.
- **Don't try to project chat-subagent message content.** This wave only ships start/end + parent linkage. Sub-tool capture (if useful) is a separate scope.
- **Idempotence matters.** Mid-turn refresh replays buffered chunks; the emitter must not re-emit. The `chatSubagentEmissions` map enforces this.

### Acceptance

- [ ] Chat-path Task tool spawn emits synthetic `agent_start` with `parentSessionId = ctx.threadId`.
- [ ] AgentTree renders chat-spawned subagents nested under the parent.
- [ ] Synthetic `agent_end` fires on Task block completion, failure, or cancellation; child status reflects the outcome.
- [ ] Mid-turn refresh does not duplicate child sessions in the renderer.
- [ ] When the flag is off, chat-path behavior matches today (no regression).
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-57): Phase C — chat-path subagent synthetic emission`

---

## Phase D — Renderer wiring polish

**Goal:** Verify the renderer renders nested subagents reliably under live conditions, including resume/restore paths.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/renderer/hooks/useAgentEvents.subagentReducers.live.test.ts` | ~280 | Live-event tests: AGENT_START with `parentSessionId` lands in tree; resume/restore preserves the field; `pendingSubagentLinks` flushes correctly when the child arrives after the parent learned its mapping. |
| `src/renderer/components/AgentMonitor/AgentTree.subagent.test.tsx` | ~240 | Component test: tree mode activates when ≥1 session has `parentSessionId`; flat mode resumes when no relationships exist; filter query disables tree mode (existing behavior preserved). |

### Modified files

| File | Change |
|---|---|
| `src/renderer/hooks/useAgentEvents.helpers.ts` | If a parent session has `restored: true` but a live child arrives with that parent's ID, ensure the parent is shown in the live group (not Previous Sessions). This is a known interaction with the bucketing logic; verify behavior, do not redesign. |
| `src/renderer/components/AgentMonitor/AgentMonitorManagerPanels.tsx` | Verify tree mode triggers correctly when relationships exist mid-session, not only at first render. Add a test fixture if the trigger is render-time only. |

### Subagent briefing

- **Read first:** Phase B and C output, `AgentMonitor/CLAUDE.md` ("Tree vs flat" pattern), `useAgentEvents.helpers.ts:200-260`.
- **No reducer redesign.** If you find that fixing nested-subagent rendering requires reshaping `AgentState`, stop and escalate. The wave's premise is that the existing shape is sufficient.
- **Restored vs live interaction.** A parent loaded from disk (`restored: true`) that receives a live child should pull both into the live group. This was the surface of the recent (now-reverted) Bug 2/3 fix; coordinate with current `restored`-flag bucketing logic — don't reintroduce that fix here.
- **Filter query disables tree.** That's intentional (per `AgentMonitor/CLAUDE.md`). Don't change it.
- **Test against real reducer state.** Use `act()` and dispatch real actions; don't mock the reducer.

### Acceptance

- [ ] Live AGENT_START with `parentSessionId` produces tree-mode rendering on first frame.
- [ ] Restored parent + live child produces tree mode with parent in the live group.
- [ ] Filter query disables tree mode and keeps the existing flat-list behavior.
- [ ] All existing AgentMonitor tests pass.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-57): Phase D — renderer rendering polish for nested subagents`

---

## Phase E — Integration test, soak, flag flip decision

**Goal:** End-to-end verification across both paths; soak window; explicit decision on flipping `agentMonitor.subagentDisplay.enabled` to `true` by default.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/agentChat/subagentDisplay.integration.test.ts` | ~340 | End-to-end: spawn CLI parent → Task with `childSessionId` → assert renderer state contains nested child. Same for chat path: stream Task block → assert synthetic emission → assert renderer state. |
| `roadmap/wave-57-phase-e-decision.md` | ~220 | Soak observations; flag-flip Go/No-Go with criteria. Numbers, not narrative. |
| `docs/agent-monitor-subagents.md` | ~200 | How subagent linkage works end-to-end (CLI vs chat), known limits (single-level nesting only, temporal-fallback window 30s), opt-out via the flag. |

### Modified files

| File | Change |
|---|---|
| `src/main/configSchemaTail.ts` | If Phase E goes positive, change `agentMonitor.subagentDisplay.enabled` default from `false` to `true`. Per `feedback_defaults_true.md`, new feature flags default to `true` unless destructive/security-risky/experimental — this fix is none of those once verified. |
| `CLAUDE.md` (project root) | Add a line under "Known Issues / Tech Debt" if Phase E surfaces residual gaps; otherwise no change. |
| `src/renderer/hooks/useAgentEvents.helpers.ts` | Remove the Phase A diagnostic `console.warn` lines (the structural `[subagentTracker]` log lines stay). |
| `src/main/agentChat/subagentLinkTrace.ts` | Keep the trace helpers but ensure default-off is true; the diagnostics flag remains for future investigation. |

### Subagent briefing

- **Read first:** Phases A–D output, `roadmap/wave-57-phase-a-spike.md` (the original symptom log).
- **Soak length:** at minimum one week of normal IDE usage with the flag on, including at least one chat-path turn that uses subagents and at least one CLI-path session that uses Task. Per `feedback_verify_before_planning.md`, verify against actual sessions, not assumed behavior.
- **Decision criteria for default flip:**
  - Zero observed cases of subagent rendering failure during soak → flip to `true`.
  - Any observed case of regression on AgentTree (e.g., flat-mode breakage) → keep `false`, file the regression, hold the flip.
  - Any observed case of duplicate child emission on chat path → keep `false`, fix the dedup, hold the flip.
- **Don't bury outcomes.** If the data says "this isn't reliable enough," that's a valid result. The wave still delivered Phases A–D infrastructure; the flag stays off until reliable.
- **Remove only investigation-specific logging.** The structural `[subagentTracker]` log lines in `subagentTracker.ts` stay; they're baseline observability per `debug-before-fix.md`. The renderer's `[trace:subagent-link]` diagnostic warns get removed.

### Acceptance

- [ ] Integration test exercises both paths end-to-end and asserts AgentTree state.
- [ ] Soak observations recorded in `wave-57-phase-e-decision.md` with numbers (occurrences, duration, regressions if any).
- [ ] Flag-flip decision documented; if positive, default flipped in commit.
- [ ] Docs cover subagent linkage, limits, opt-out.
- [ ] Diagnostic noise removed from the renderer.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-57): Phase E — integration, soak decision, flag flip`

---

## Subagent execution model

- **Model:** `sonnet` per `~/.claude/rules/agent-model-selection.md`. Phase A's instrumentation is judgment-light enough for `haiku-implementer`; Phases B/C/D/E favor `sonnet-implementer` because the linkage logic intersects multiple subsystems.
- **Isolation:** Phase A handled directly by parent (instrumentation precision matters; the spike report drives the rest of the wave). Phases B/C/D dispatchable to subagents with tight specs. Phase E parent-driven (decision artifact).
- **Test policy:** scoped vitest per phase; parent runs full suite at wave close per `feedback_agent_test_verification.md` (subagents skip `npm test` to avoid the ~280s hang).
- **Lint policy:** no relaxations per `feedback_never_change_lint_rules.md`.
- **Commit policy:** one per phase; push policy per `feedback_wave_push_policy.md` — push once at wave close, not per-phase.
- **Scope discipline:** do NOT redesign `subagentTracker`. Do NOT introduce new hook event types. Do NOT extend to multi-level nesting in this wave.

### Phase dispatch order

1. **Phase A** — diagnostic spike (parent or `sonnet-diagnostician`; instrumentation precision)
2. **Phase B** — CLI enrichment (`sonnet-implementer`; tight spec from Phase A)
3. **Phase C** — chat synthetic emission (`sonnet-implementer`; can run in parallel with B if specs are tight)
4. **Phase D** — renderer polish (`sonnet-implementer`; depends on B/C being live for live-event tests)
5. **Phase E** — integration + soak + decision (parent)

Phases B and C are independent and can be parallelized via `sonnet-batch-coordinator` if specs are written tightly enough. Phase D depends on both being landed.

---

## Risks

| Risk | Mitigation |
|---|---|
| Phase A's spike doesn't reproduce the bug reliably (intermittent timing). | Capture multiple reproductions per scenario; `~/.claude/rules/multi-process-debugging.md` notes that the IDE runs inside itself, which adds a confounding parallel session — filter trace output by `parentSessionId` to disambiguate. |
| `subagentTracker.recordStart` arrives AFTER the child's `agent_start` arrives at the renderer (race). | Phase B's resolver returns `undefined` cleanly in this case; the reducer's existing `pendingSubagentLinks` + temporal window catches it. Phase A measures how often this race occurs; if frequent, scope a separate phase to buffer-and-flush. |
| Chat-path subagent's stable-ID scheme collides with a real Claude Code session ID. | `chat-sub:` prefix is deliberate to avoid collision. Verify the prefix is namespace-safe across all consumers (renderer reducer, `subagentTracker`, persistence). |
| AgentTree mode switches mid-session cause render flicker. | Phase D's component test exercises the transition; if flicker shows, gate tree-mode entry on a stability threshold (e.g., 100ms after first child arrives). |
| Idempotence bug in chat-path emission causes duplicate children on refresh. | Phase C's `chatSubagentEmissions` map enforces per-toolCallId guards; tested explicitly. |
| Diagnostic logs leak into production after Phase E. | The structural `[subagentTracker]` lines stay (intentional); only Phase A's renderer `[trace:subagent-link]` warns are removed. Verified by grep at Phase E close. |
| Phase E soak surfaces a regression we can't fix in this wave. | The flag stays off; Wave 57 still ships Phases A–D as infrastructure, the regression files into a follow-up. Per `feedback_verify_before_planning.md`, the flag default flip is the verification — don't ship the default flip on hope. |
| The Bug 4 wave (parent-stays-running-while-children-work) interacts unexpectedly with new child sessions arriving on the chat path. | Bug 4's `hasLiveChildren` check now matters more: parent staying `running` while live children stream is correct behavior. Phase D's live-event tests cover this; if they fail, root-cause before scope-creeping. |

---

## Acceptance criteria (wave-level)

- [ ] All five phases committed to `master`.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (with the flag enabled):
  - [ ] CLI: open a terminal Claude Code session, ask it to use Task to spawn a subagent → AgentTree shows the parent with the child nested under it.
  - [ ] Chat: open a chat thread, send a prompt that triggers a Task tool call → AgentTree shows the chat parent with the child nested under it.
  - [ ] Multi-Task case (CLI and chat): two simultaneous children both nest correctly under the same parent.
  - [ ] Refresh during a streaming chat with an active subagent → no duplicate children.
  - [ ] Resume a previous-sessions thread → children rendered correctly.
- [ ] Phase A spike report published.
- [ ] Phase E decision report published with explicit Go/No-Go on the default flip.
- [ ] Diagnostic flag (`subagentDisplay.diagnostics`) defaults to `false`; behavior flag (`subagentDisplay.enabled`) default reflects Phase E's decision.

---

## Out-of-wave follow-ups

- **Multi-level nesting (depth > 1)** — current scope is single-level only. If Phase E reveals real-world cases of nested-Task chains (a subagent spawning its own subagent), file Wave 58+ to extend `AgentTree` and the linkage logic.
- **Sub-tool capture for chat subagents** — chat-path children currently emit only start/end. Sub-tool calls inside the child aren't projected. Useful for parity with CLI-path children; not load-bearing for this fix.
- **Cost roll-up UI for subagents** — `subagentTracker.rollupCostForParent` already computes this. Surfacing it in the AgentMonitor card UI is a separate scope.
- **Replace temporal-window fallback** — the 30s heuristic stays as a fallback. Once Phase B/C make the explicit-payload path reliable, measure how often the fallback fires; if rare, consider deletion in a future cleanup wave.

---

## Cross-wave alignment

- **Wave 53** — telemetry recovery: orthogonal but useful. Phase E's soak measurement can use Wave 53's session JSONLs to confirm parent/child topology end-to-end. If Wave 53 isn't shipped, Phase E falls back to manual smoke; doesn't block.
- **Wave 56** — Teams Mode for chat panel: each team agent in a multi-agent chat is potentially a "subagent" in Wave 57's sense. Confirm with Wave 56's design that team-agent linkage uses the same `parentSessionId` mechanism, not a parallel one. If Wave 56 ships first, Wave 57's Phase C may need to coordinate with the team-mode emit path.
- **Bug 4 (already shipped)** — `hasLiveChildren`-gated end finalization: this wave's Phase C and D both interact with Bug 4's logic. The interaction is intentional and correct (parent stays `running` while children stream); Phase D's tests cover it. If a regression surfaces, it's a Phase D bug, not a Bug 4 reversion.
- **Wave 48** — `--strict-mcp-config` rollout: orthogonal. No interaction.

**Re-sequencing note:** No hard dependencies. Wave 57 can run independently and immediately.
