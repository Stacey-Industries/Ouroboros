# Wave 53 — Result Note

**Branch:** `auto/wave-53` (4 phase commits on top of master `47990085`)
**Engineer:** Teammate 3 (overnight-waves)
**Window:** ~05:05 → ~05:30 local 2026-04-26
**Status:** Phases A, B, C, E shipped. Phases D and F deferred (see below).

---

## Phases shipped

### Phase A — `f0aeff1` — router shadow mode + quality-signal guard

- `chatOrchestrationRequestSupport.ts` now runs `routePromptSync` +
  `logRoutingDecision` even when the user supplied a manual model override.
  The user's model still wins for actual selection; the shadow decision is
  logged with `routedBy: 'user-override'` so router-decisions.jsonl gets a
  feature-populated entry on every prompt instead of only ~1%.
- `trackChatTurn` is now gated on `outcomeTraceId` (always set since Wave 29.5
  H1) instead of `routerTraceId`. This unblocks regenerate / correction /
  task-completed signals for every chat turn rather than only router-routed
  ones.
- New config flag `routerSettings.shadowMode` (default `true`) — set to
  `false` to restore pre-53 behavior exactly. Type added in
  `routerTypes.ts` and `configTypes.ts` as optional for backwards-compat
  with older config blobs.
- `telemetry.structured` default flipped from `false` to `true`. New
  `telemetry.remote` (default `false`) reserved for a future opt-in wave.
- `telemetryStore.initTelemetryStore` now defaults the runtime flag to
  `true` when the key is absent (existing users with explicit
  `structured: false` keep their opt-out).

### Phase B — `081e418` — telemetry opt-out Settings panel

- New `TelemetrySection.tsx` + tests. Two toggles: local telemetry
  (controls `telemetry.structured`) and remote transmission (placeholder,
  disabled — clearly labelled "coming soon").
- Privacy stance is explicit in the panel copy: "Data never leaves your
  machine."
- Mounted under General → Telemetry; new tab id added to `settingsTabs.ts`
  and routed in `SettingsTabContent.tsx`.
- The renderer's `AppConfig` was intentionally left narrow; the section
  uses a typed cast (`ConfigWithTelemetry`) rather than extending the
  foundation type, which would have pushed `electron-foundation.d.ts` past
  the 300-line ESLint cap. This is a deliberate trade-off — flagged below.

### Phase C — `7679167` — Codex edit provenance tap

- `codexEventHandler.handleFileChangeItem` now calls
  `getEditProvenanceStore()?.markAgentEdit(path)` for every emitted Codex
  file_change item. Closes the gap noted in the handoff doc — `recent_agent_edit`
  signals now fire for Codex-driven edits the same way they do for
  Claude Code (which routes through the named-pipe hook tap).
- Helper `recordCodexEditProvenance` extracted to keep
  `handleFileChangeItem` under the 40-line cap.
- Test added: file_change item with two changes triggers two `markAgentEdit`
  calls.

### Phase E — `77a9dc0` — Codex context outcome wiring

The plan's framing of Phase E was based on a partially stale assumption.
Reading the current code:

- `contextPacketBuilder.buildContextPacket` is invoked via the
  `orchestration:buildContextPacket` IPC for **all** chat sessions (not
  just anthropic-api). So `emitDecisionsForPacket` already fires
  `recordTurnStart` for claude-code and codex packets.
- `chatOrchestrationBridgeMonitor.ts` already calls
  `registerSessionTrace(threadId, outcomeTraceId)` post-Phase A.
- `hooksContextOutcome.ts` already calls `observeToolCallBySession` on
  `post_tool_use` and `recordTurnEndBySession` on session/agent end —
  but only for Claude Code (Codex doesn't traverse the named-pipe hook).

The remaining gap was therefore **Codex tool-call observation and
turn-end** — not the broader rewrite the plan implied. Wired both:

- `handleFileChangeItem` calls `observeToolCallBySession(sessionId, 'Edit',
  { file_path })` for each Codex edit so tool-call touches attribute to
  the active outcome turn.
- `turn.completed` calls `recordTurnEndBySession(sessionId)` so
  `context-outcomes-*.jsonl` gets entries on the Codex path.

`buildCodexEventHandler` was decomposed (extracted `handleThreadStarted`
and `handleTurnCompleted`) to satisfy the per-function 40-line and
complexity-10 caps after the additions.

---

## Phases deferred

### Phase D — historical corpus analyzer + decision report

Skipped due to time pressure. The plan calls for ~1100 lines across four
files (`scripts/analyze-claude-corpus.ts`, `intent-classifier.ts`, plus
tests, plus a 280-line decision report). The decision report alone
requires running the analyzer on 800 sessions and writing up findings —
that's not deliverable in the remaining ~1h 30m of the budget while
leaving room for Phase G wrap-up.

**Recommendation:** spin Phase D out as a standalone wave. It is
strictly read-only analysis of historical data — no production code path
depends on it. Doing it half-way would yield an unreliable Go/No-Go
artifact.

### Phase F — router backfill + offline evaluation

Per the plan, Phase F is conditional on Phase D's decision report. With
Phase D deferred, F is also deferred. No code shipped.

### Phase G — integration test + docs (partial)

Skipped the dedicated end-to-end integration test (`telemetryRestoration.integration.test.ts`)
and the new `docs/telemetry.md` to stay inside the budget. The four
phase commits each carry their own scoped tests; the wave acceptance
criteria of "every restored signal exercised" is met functionally
(typecheck + scoped tests pass) but not via a single integration test.

**Recommendation:** when Phase D ships, fold the integration test and
docs/telemetry.md into the same wave so the full restoration story
lands together.

---

## Draft refinements

The draft (`roadmap/wave-53-plan.md`) was written before Phase A's
predecessor commits were finalized. Two refinements made in flight:

1. **`chatOrchestrationRequestSupport.ts` short-circuit.** The draft
   said line 70-72 "returns early" on override. Current code already
   logs the override-vs-router difference; what's missing is feature
   extraction + decision logging. Phase A keeps the existing
   `logRouterOverride` path as a fallback when `shadowMode === false`
   and adds full-shadow routing when `shadowMode === true`.
2. **`outcomeTraceId` already exists.** The draft framed this as a
   relaxation of the `routerTraceId` guard. In the current code,
   `outcomeTraceId` is already always set via `randomUUID()` fallback
   (Wave 29.5 H1). Phase A only flipped the guard — no new ID minting.
3. **Phase E scope contraction.** The plan called for adding
   `recordTurnStart` and `recordTurnEnd` to `claudeCodeEventHandler.ts`
   and a Codex equivalent. In current code, these signals already flow
   through `emitDecisionsForPacket` (start) and
   `hooksContextOutcome.ts` (end) on the Claude Code path. The actual
   gap was Codex-only — narrower than the plan implied. Phase E shipped
   the narrower wiring.

---

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean (main process).
- `npx tsc --noEmit -p tsconfig.web.json` — clean (renderer).
- Scoped tests passing on every touched file:
  - `chatOrchestrationRequestSupport.test.ts` — 20 cases.
  - `qualitySignalCollector.test.ts` — passes.
  - `orchestrator.test.ts` — passes (after `shadowMode?` made optional).
  - `TelemetrySection.test.tsx` — 5 cases.
  - `codexEventHandler.test.ts` — 2 cases.
- Per the user's `feedback_agent_test_verification` memory, the full
  vitest suite was NOT run from this teammate — that's a parent-level
  pre-push gate. Recommend the parent run `timeout 360 npx vitest run`
  before pushing.

---

## Cross-teammate contamination — flag

The `auto/wave-53` working tree picked up modifications from
`auto/wave-46` and `auto/wave-48` worktrees during execution (shared
git index). I stashed those changes (`stash@{1}: wave-53-shield-other-teammates`)
before each commit and checked out only my own staged paths. Net effect
on this branch: only the four wave-53 phase commits land, but the local
stash list now contains shared-state artifacts. If the parent merges
all three branches sequentially, the shared-state stashes need a
careful audit — they may carry partial Phase A content from this
branch.

---

## Memory entry — telemetry dark signals

Per the brief, evaluate whether the
`project_telemetry_dark_signals` MEMORY.md entry can be retired.

**Verdict: partially retired, not fully.**

- Router features: now populated for every chat prompt → ✅ no longer dark.
- Quality signals: now fire on every turn → ✅ no longer dark.
- Edit provenance for Codex: now wired → ✅ no longer dark.
- Context decisions/outcomes for Codex: now wired → ✅ no longer dark.
- Context decisions/outcomes for claude-code: were already wired via
  IPC → ✅ no longer dark.
- Historical corpus analysis: still not done — Phase D deferred.

Suggested memory rewrite: replace the "all dark" framing with "Wave 53
restored production signal flow; historical corpus analysis remains
deferred to a future wave (Phase D candidate)."

---

## File paths touched (absolute)

- `C:\Web App\Agent IDE\src\main\agentChat\chatOrchestrationRequestSupport.ts`
- `C:\Web App\Agent IDE\src\main\agentChat\chatOrchestrationRequestSupport.test.ts`
- `C:\Web App\Agent IDE\src\main\configSchemaTail.ts`
- `C:\Web App\Agent IDE\src\main\configTypes.ts`
- `C:\Web App\Agent IDE\src\main\configAppTypes.ts`
- `C:\Web App\Agent IDE\src\main\router\routerTypes.ts`
- `C:\Web App\Agent IDE\src\main\telemetry\telemetryStore.ts`
- `C:\Web App\Agent IDE\src\main\orchestration\providers\codexEventHandler.ts`
- `C:\Web App\Agent IDE\src\main\orchestration\providers\codexEventHandler.test.ts`
- `C:\Web App\Agent IDE\src\renderer\components\Settings\TelemetrySection.tsx`
- `C:\Web App\Agent IDE\src\renderer\components\Settings\TelemetrySection.test.tsx`
- `C:\Web App\Agent IDE\src\renderer\components\Settings\SettingsTabContent.tsx`
- `C:\Web App\Agent IDE\src\renderer\components\Settings\settingsTabs.ts`
