# Wave 53 — Telemetry Recovery & Router Signal Restoration
## Implementation Plan (DRAFT)

**Version target:** v2.8.2 (patch — activate existing instrumentation, analyze historical corpus)
**Feature flags:** flip `telemetry.structured` default `false` → `true`; new `telemetry.remote` default `false` for future remote-transmit toggle; new `router.shadowMode` default `true`
**Dependencies:** none structurally; cross-refs to `roadmap/telemetry-recovery-and-corpus-analysis.md` (existing handoff doc)
**References:**
- `roadmap/telemetry-recovery-and-corpus-analysis.md` (keep as the canonical handoff; this wave plan is its execution contract)
- `src/main/agentChat/chatOrchestrationRequestSupport.ts` (short-circuit site)
- `src/main/orchestration/qualitySignalCollector.ts` (guard site)
- `src/main/orchestration/contextPacketBuilder.ts` (anthropic-api-only recordTurnStart path)
- `src/main/orchestration/contextPacketBuilderDecisions.ts` (decision writer)
- `src/main/agentChat/hooksEditTap.ts` (hook-pipe edit tap)
- `src/main/orchestration/providers/ptyCodexCapture.ts` (Codex stdout parser)
- `src/main/configSchemaTail.ts` (`telemetry.structured` default)
- `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` (800 session transcripts)

---

## Overview

The IDE has four instrumentation systems wired and failing silently:

1. **Model router** — `routePromptSync` + feature extractor + classifier are built, but `chatOrchestrationRequestSupport.ts:70-72` returns early whenever the request carries a manual model override. You always carry one. Result: 130 of 131 router-decision rows have no features, `routedBy:"default"`, and `traceId: null`.
2. **Quality signals** — `trackChatTurn` is guarded on `routerTraceId` being set, which it never is because of #1. Result: regenerate / correction / code_committed / task_completed signals never fire. Only `terminal_natural_stop` fires because it comes from a separate hook path.
3. **Context decisions / outcomes** — `recordTurnStart` is called only from `contextPacketBuilder.ts` on the anthropic-api provider path. Claude Code and Codex spawn CLI subprocesses that handle their own context, so these writers stay dark.
4. **Edit provenance** — `tapEditProvenance` fires on named-pipe `post_tool_use` events. Codex parses tool events from stdout (`ptyCodexCapture.ts`) without routing through the hook pipe, so Codex edit provenance is never captured.

Meanwhile, `~/.claude/projects/` contains **4,831 session JSONLs (685 MB, 800 for this project alone)** — every user prompt, every tool call, every tool result, every error. Each session is a complete turn-by-turn record. The data for every question the router was built to answer **already exists**; it's just in a different format.

Wave 53 does three things:

1. **Activate what's already wired** (Phases A, B, C, E) — unblocks the production telemetry loop with ~30 lines of code.
2. **Analyze the historical corpus** (Phase D) — 800 sessions of rich tool-call data, answerable without new instrumentation.
3. **Backfill the router** (Phase F, conditional) — replay historical prompts through the feature extractor + classifier to evaluate / retrain.

Router commit date: **2026-04-03 (8f4bb79)**. Everything before that is router-unseen; everything after is router-unseen *in practice* due to the short-circuit bug. The full 4,831-session corpus is available for offline backfill.

---

## Implementation review summary

### Confirmed state (from subagent inventory)

- `chatOrchestrationRequestSupport.ts:70-72` — early return when `request.overrides?.model` is set. Kills router + traceId propagation for every user-directed prompt.
- `qualitySignalCollector.ts` — `trackChatTurn` gated on non-null traceId. `trackTaskCompleted` is a dead export — no call site in production hook handlers.
- `contextPacketBuilder.ts` — only invoked on anthropic-api path. Claude Code + Codex adapters build context internally, never touch this.
- `hooksEditTap.ts` — subscribes to named-pipe `post_tool_use` events. Codex doesn't emit on the pipe.
- `ptyCodexCapture.ts` — parses tool-call events from Codex stdout but doesn't call `markAgentEdit`.
- `telemetry.structured` defaults `false` in `configSchemaTail.ts`. `context.decisionLogging` defaults `true`, `context.provenanceTracking` defaults `true`. The schema is internally inconsistent.
- Feature extractor is pure (prompt → 19 features, no persistence). Classifier is a loaded logistic regression — also pure.
- `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl`: 800 files, richest per-session format we have. Sample shows 141 Edit calls with 6.4% first-try failure rate — the metric we were missing is already measurable.

### Gaps this wave closes

- **Zero features captured** for any production prompt.
- **Zero quality signals** beyond terminal_natural_stop.
- **Zero context decisions / outcomes** for claude-code and codex sessions.
- **Zero edit provenance** for Codex sessions.
- **Zero analysis** of the 685 MB historical corpus.
- **Zero backfill** of historical prompts through the router.
- **Telemetry default is indefensible** for local-only data with no transmission surface.

---

## Scope

### In-scope

- Remove the router short-circuit (run `routePromptSync` + `logRoutingDecision` unconditionally, honor user override separately for model selection).
- Relax quality-signal guards (use `outcomeTraceId` which is always set, not `routerTraceId`).
- Wire `trackTaskCompleted` into the `SessionEnd` / `TaskCompleted` hook handler.
- Flip `telemetry.structured` default to `true`; add `telemetry.remote` default `false`.
- Add an "opt-out" toggle in Settings UI surface.
- Call `markAgentEdit` from `ptyCodexCapture.ts` when Codex emits edit tool events.
- Wire `recordTurnStart` / `recordTurnEnd` into `claudeCodeEventHandler.ts` and the Codex adapter.
- Build `scripts/analyze-claude-corpus.ts` walking `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` and emitting per-session summary + aggregate stats.
- Build `scripts/router-backfill.ts` that replays historical prompts through the feature extractor and classifier, emits synthetic `EnrichedRoutingLogEntry` rows for offline evaluation.
- Produce a decision report from corpus analysis: is semantic-ops workflow worth building for? Is the router's current classifier appropriate for the real workload?

### Out-of-scope

- Shipping Serena, tsserver, or any semantic-ops integration (blocked on Phase D's decision).
- Building a new router classifier based on backfill findings (that's Wave 54 if Phase F motivates it).
- Remote telemetry transmission of any kind.
- Changing the effort "router" (it's user-selected — not a router).
- Touching the 232 already-uncommitted files in the user's working tree (clean baseline is a prerequisite, not wave scope).

---

## Verified starting point

Reusable (already built, just needs to be activated):

- `routePromptSync`, `logRoutingDecision`, feature extractor (all in `src/main/router/`).
- `trackChatTurn`, `trackTaskCompleted`, quality signal detectors (`qualitySignalCollector.ts`).
- `recordTurnStart`, `recordTurnEnd`, decision/outcome writers (`contextPacketBuilderDecisions.ts`).
- `getEditProvenanceStore`, `markAgentEdit` (`editProvenanceStore.ts`).
- `hookInstaller` / hook event routing from prior waves.
- 800 relevant session JSONLs at `~/.claude/projects/C--Web-App-Agent-IDE/`.
- Pure feature-extractor + classifier (safe for offline replay).

Explicitly targeted:

- Router short-circuit removal.
- Quality-signal guard relaxation.
- Task-completed hook wiring.
- Telemetry default flip + opt-out UI.
- Codex edit provenance tap.
- claude-code + codex context decision/outcome writers.
- Historical corpus analyzer.
- Offline router backfill + evaluation.

---

## Architecture

```text
today (pre-53)
 ├─ every prompt with user-selected model
 │    ├─ bypasses routePromptSync                 ← router blind
 │    ├─ traceId = null                           ← trackChatTurn gated off
 │    └─ quality signals = only terminal_natural_stop
 ├─ claude-code / codex providers
 │    ├─ no recordTurnStart                       ← context decisions dark
 │    └─ no recordTurnEnd                         ← context outcomes dark
 ├─ Codex adapter
 │    └─ parses stdout events but no markAgentEdit ← edit provenance dark
 └─ telemetry.structured = false                  ← raw tool-call stream dark

post-53
 ├─ every prompt
 │    ├─ routePromptSync runs (shadow + features) ← always
 │    ├─ outcomeTraceId always set                ← trackChatTurn fires
 │    ├─ user override still honored              ← model selection unchanged
 │    └─ regenerate / correction / completed signals live
 ├─ claude-code + codex providers
 │    └─ recordTurnStart / recordTurnEnd          ← context loop lit
 ├─ Codex adapter
 │    └─ markAgentEdit on stdout parse            ← edit provenance live
 ├─ telemetry.structured = true                   ← raw events captured
 ├─ opt-out toggle in Settings                    ← user control
 └─ scripts/
      ├─ analyze-claude-corpus.ts                 ← 800 sessions analyzed
      └─ router-backfill.ts                       ← replay historical prompts
```

**Key design calls:**

- **Shadow mode is the router default:** `router.shadowMode = true` means features are extracted and decisions logged even when user overrides the model. The override still wins for actual model selection. This is the keystone behavior change.
- **Quality signals use `outcomeTraceId`, not `routerTraceId`.** `outcomeTraceId` is assigned by the outcome observer and is always non-null for chat turns. Relaxing this guard is the single-line unblock for regenerate/correction detection.
- **Context loop wiring for claude-code / codex must source included-files correctly.** Claude Code gets them from the hook pre_tool_use snapshot; Codex gets them from `ptyCodexCapture.ts` parsed events. These are different protocols — not interchangeable.
- **Telemetry default is `true`, but `telemetry.remote` stays `false` forever unless explicitly opted in.** Local recording has no privacy surface; remote transmission does. Split them.
- **Historical corpus analysis is a *decision* artifact**, not a production feature. It produces a Go/No-Go report for future waves (semantic ops, router retrain, etc.). The analyzer script is reusable for future gap investigations.

---

## Phase A — Router short-circuit fix + quality signal guard relaxation

**Goal:** Remove the keystone bug blocking features, traceId propagation, and 3 downstream signals.

### New files

None — this is a targeted surgical change.

### Modified files

| File | Change |
|---|---|
| `src/main/agentChat/chatOrchestrationRequestSupport.ts` | Remove the `if (request.overrides?.model)` early return at line 70-72. Always call `routePromptSync` and `logRoutingDecision`. Honor the user's override for the final model selection in a separate step after routing completes. Add `router.shadowMode` config respect — if `false`, preserve today's early-return behavior for users who want the old shape. |
| `src/main/agentChat/chatOrchestrationRequestSupport.ts` | Same file: change `trackChatTurn` guard from `if (routerTraceId)` to `if (outcomeTraceId)`. Update callsite to pass `outcomeTraceId`. |
| `src/main/orchestration/qualitySignalCollector.ts` | Confirm `trackChatTurn` signature matches the new call shape. Add a unit test that verifies regenerate + correction fire when prior turn exists. |
| `src/main/configSchemaTail.ts` | Add `router.shadowMode: boolean` — default `true`. |

### Subagent briefing

- **Read first:** `chatOrchestrationRequestSupport.ts:50-100`, `qualitySignalCollector.ts`, the subagent report at `roadmap/telemetry-recovery-and-corpus-analysis.md`.
- **Do NOT rip out the user override.** The fix is "shadow-route but keep the override." The model the user chose still ships; the router just gets to record features and decision for the same prompt.
- After routing runs, the override replaces whatever tier the router chose. Log the shadow decision and the override both; the difference is the signal.
- Quality signal guard: change `routerTraceId` to `outcomeTraceId`. They are distinct identifiers — `outcomeTraceId` is set by the outcome observer and is always populated for chat turns.
- After the fix, verify a manual test: send a prompt with user-override model, check that `router-decisions.jsonl` has features populated and `router-quality-signals.jsonl` gets a fresh entry on next turn.

### Acceptance

- [ ] `router-decisions.jsonl` gets a feature-populated entry for every prompt, not just 1%.
- [ ] `routedBy` reflects actual decision source (`user-override` for overrides, `classifier` / `heuristic` otherwise).
- [ ] `router-quality-signals.jsonl` gains non-terminal_natural_stop entries within 10 prompts of post-fix usage.
- [ ] User-selected model still ships.
- [ ] `router.shadowMode: false` restores pre-53 behavior exactly.
- [ ] Scoped tests pass.
- [ ] Commit: `fix(wave-53): Phase A — router shadow mode and quality signal guard relaxation`

---

## Phase B — Telemetry default flip + settings UI

**Goal:** Activate the raw tool-call stream by default; give users an opt-out surface.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/renderer/components/Settings/TelemetrySection.tsx` | ~220 | Settings panel: describes what's recorded (local only), what isn't, toggle for `telemetry.structured`, disabled placeholder for future `telemetry.remote`. |
| `src/renderer/components/Settings/TelemetrySection.test.tsx` | ~180 | Toggle behavior, copy correctness, disabled-future-flag rendering. |

### Modified files

| File | Change |
|---|---|
| `src/main/configSchemaTail.ts` | Flip `telemetry.structured: boolean` default to `true`. Add `telemetry.remote: boolean` default `false` with comment "reserved for future remote transmission; explicit opt-in required". Add schema comment on `telemetry.structured`: "local-only; data stored in userData and never transmitted". |
| `src/renderer/components/Settings/SettingsPanel.tsx` (or equivalent) | Mount the new TelemetrySection. |

### Subagent briefing

- **Read first:** `configSchemaTail.ts`, existing Settings panel components for design-token conventions, `roadmap/telemetry-recovery-and-corpus-analysis.md`.
- Telemetry copy must be accurate and non-scary. Example: "Records tool calls, routing decisions, and quality signals locally in `~/.ouroboros/telemetry/` to improve context selection and model routing. Data never leaves your machine."
- The "remote transmission" toggle is a placeholder — disable it with a "coming soon" state, don't make it functional this wave.
- Respect the renderer token system (no hardcoded colors, use `bg-surface-panel` / `text-text-semantic-primary` / etc.).
- Settings change applies on save — no restart required.

### Acceptance

- [ ] Fresh install captures events to `telemetry.db` by default.
- [ ] Toggle off in Settings stops new events from being written.
- [ ] Toggle back on resumes capture.
- [ ] Remote-transmit toggle renders but is disabled with "coming soon" state.
- [ ] Copy explicitly states "data never leaves this machine".
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53): Phase B — telemetry default flip and opt-out UI`

---

## Phase C — Codex edit provenance tap

**Goal:** Close the edit-provenance gap for Codex sessions.

### New files

None — single targeted call site.

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/ptyCodexCapture.ts` | On parsed edit tool event (patterns: `edit`, `write`, `apply_patch` — confirm against Codex event shapes), call `getEditProvenanceStore()?.markAgentEdit({ filePath, threadId, provider: 'codex', timestamp })`. |
| `src/main/orchestration/providers/ptyCodexCapture.test.ts` | Add test: parsed edit event triggers `markAgentEdit`. Mock `getEditProvenanceStore`. |

### Subagent briefing

- **Read first:** `ptyCodexCapture.ts` in full, `editProvenanceStore.ts` API, a real Codex session log from `~/.claude/projects/` to see actual edit tool event shapes.
- Codex emits tool-call events as NDJSON in stdout. Parse carefully — the schema evolves across Codex versions.
- Path normalization: `markAgentEdit` expects absolute or workspace-relative paths; Codex may emit relative. Normalize via workspace root.
- Null-guard the store access — `getEditProvenanceStore()` can return `null` if the store hasn't initialized.
- Don't miss batched edits — if Codex emits multiple edits in one event, iterate.

### Acceptance

- [ ] `edit-provenance.jsonl` gets entries for Codex edit events.
- [ ] Existing Claude Code hook-pipe path still works (no regression).
- [ ] Path normalization handles relative + absolute inputs.
- [ ] Batched edits produce multiple entries.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53): Phase C — Codex edit provenance tap`

---

## Phase D — Historical corpus analyzer + decision report

**Goal:** Analyze the 800 relevant sessions in `~/.claude/projects/C--Web-App-Agent-IDE/` and answer the questions we've been guessing at.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-claude-corpus.ts` | ~420 | Walks JSONL files, parses NDJSON entries, builds per-session summary (tool counts, Edit first-try failure rate, longest Grep/Glob run, user prompts, files touched), emits CSV + aggregate JSON. |
| `scripts/analyze-claude-corpus.test.ts` | ~260 | Fixture-driven tests on synthetic session JSONL. Covers malformed lines, truncated sessions, multi-turn sequencing. |
| `scripts/intent-classifier.ts` | ~180 | Regex + keyword classifier over user prompts: bug-fix, feature, refactor, review, meta-UX, continuation, other. Reusable. |
| `scripts/intent-classifier.test.ts` | ~200 | ~50 fixture prompts with expected classifications. |
| `roadmap/wave-53-corpus-analysis.md` | ~280 | Findings from running the analyzer over the 800-session corpus. Intent distribution, Edit failure rate by intent, Grep-loop depth distribution, top noise patterns. Decision section: what gaps (if any) are worth building for. |

### Modified files

| File | Change |
|---|---|
| `package.json` | Add `npm run analyze:corpus` and `npm run analyze:corpus:json` scripts. |

### Subagent briefing

- **Read first:** 3–5 representative session JSONLs from `~/.claude/projects/C--Web-App-Agent-IDE/` to understand the actual NDJSON shape. Focus on `tool_use`, `tool_result`, user message, assistant message records.
- **Edit first-try failure rate:** a `tool_result` with `is_error: true` whose parent `tool_use` was `Edit` and whose content contains the "old_string didn't match" canonical message.
- **Grep-loop depth:** longest consecutive run of `Grep` or `Glob` tool calls with no intervening `Read` / `Edit` / `Write`.
- **Intent classification:** prompt text over user messages only. Continuation prompts ("go ahead", "continue", "hi") are their own bucket. Review and reclassify "other" after first run to tighten the classifier.
- **Sample bias:** flag it in the report. If the 800 sessions skew toward a specific phase of work (UI, bug hunting, codex integration), call that out. Current + 90d past is likely biased.
- **Decision rule template:** "Intent bucket X has N sessions, Y% Edit-failure rate, Z% Grep-heavy sessions. Building semantic ops would address case if {high grep depth + high rename-shaped intent + high Edit failures for symbol-touching edits}. If any of those three are <threshold, don't build."
- Write findings with hard numbers. No guesses. The decision doc is the deliverable.

### Acceptance

- [ ] `npm run analyze:corpus` completes on the 800-session corpus in under 3 minutes.
- [ ] CSV output includes per-session: sessionId, duration, tool counts, Edit first-try rate, max Grep/Glob run, intent bucket, token usage.
- [ ] Aggregate JSON includes: intent distribution, intent × Edit-failure matrix, intent × Grep-depth matrix, top-20 prompt patterns per bucket.
- [ ] Decision report explicitly answers: "Is semantic-ops tooling worth building? Is the router classifier appropriate for real workload?"
- [ ] Script is reusable — runs on any `~/.claude/projects/*/` directory.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53): Phase D — historical corpus analyzer and decision report`

---

## Phase E — Context decision / outcome writers for claude-code and codex

**Goal:** Close the context loop for the two providers that actually matter.

### New files

None — wiring into existing adapters.

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeCodeEventHandler.ts` | On new turn detected: call `recordTurnStart(threadId, { includedFiles: <from pre_tool_use snapshot> })`. On turn end: call `recordTurnEnd(threadId, { usedFiles: <derived from Read/Edit/Write tool calls> })`. |
| `src/main/orchestration/providers/codexEventHandler.ts` (or equivalent) | Same wiring, sourcing `includedFiles` from `ptyCodexCapture.ts` parsed events. |
| `src/main/orchestration/contextPacketBuilderDecisions.ts` | Ensure writer handles provider-tagged entries (add `provider` field). |
| `src/main/orchestration/contextPacketBuilderDecisions.test.ts` | Add tests for claude-code and codex provider paths. |

### Subagent briefing

- **Read first:** `contextPacketBuilder.ts` to see how `recordTurnStart` / `recordTurnEnd` are used on the anthropic-api path. Replicate the pattern.
- **Trickiest gotcha:** file path normalization. Claude Code emits absolute paths via hooks; Codex emits whatever its CLI produces. Normalize both to workspace-relative before calling the writers.
- **Turn boundary detection differs by provider.** Claude Code signals new turn via `user` event in the stream-json protocol (per `streamJsonTypes.ts`). Codex emits `assistant_message_end` or equivalent. Use the existing turn-detection logic already in each event handler.
- **Don't change the writer's public API.** Only the call sites change.
- **This is the risky phase.** Do not subcontract to a parallel subagent. Handle directly or pair on it.

### Acceptance

- [ ] `context-decisions-YYYY-MM-DD.jsonl` gets entries for claude-code and codex turns.
- [ ] `context-outcomes-YYYY-MM-DD.jsonl` same.
- [ ] Entries include provider field.
- [ ] Existing anthropic-api path still works unchanged.
- [ ] File path normalization correct on both providers.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-53): Phase E — context decision writers for claude-code and codex`

---

## Phase F — Router backfill + offline evaluation (conditional)

**Goal:** Replay historical prompts through the router to evaluate classifier quality on real workload.

**Conditional:** Only runs if Phase D's decision report indicates the router classifier needs evaluation against actual prompt distribution. If Phase D shows intent distribution is wildly different from what the classifier was trained for, this phase delivers the evaluation data for a future retrain wave.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/router-backfill.ts` | ~340 | Walks session JSONLs, extracts user prompts, threads prior-assistant-message context, runs each prompt through the feature extractor + classifier. Emits synthetic `EnrichedRoutingLogEntry` rows. |
| `scripts/router-evaluation.ts` | ~280 | Compares synthetic decisions against actual user overrides from historical sessions. Reports classifier accuracy, disagreement patterns. |
| `scripts/router-backfill.test.ts` | ~220 | Fixture tests for feature extraction on full prompts. |
| `roadmap/wave-53-router-evaluation.md` | ~220 | Findings from backfill: classifier accuracy, top disagreement patterns, whether retrain is warranted. |

### Modified files

| File | Change |
|---|---|
| `package.json` | Add `npm run backfill:router` and `npm run evaluate:router` scripts. |

### Subagent briefing

- **Read first:** `src/main/router/featureExtractor.ts`, `src/main/router/classifier.ts`, `scripts/analyze-claude-corpus.ts` from Phase D.
- **Feature extractor is pure** — safe to call offline, no side effects. Same for classifier.
- **prevAssistant features** need session-context threading. The prompt's features depend on the prior assistant message. Walk sessions chronologically, maintain a running "last assistant message" per session, feed both into extraction.
- **Don't re-train here.** This wave evaluates only. Retraining is a follow-up wave, gated on this evaluation.
- **Decision artifact:** the evaluation doc answers "should we retrain the router classifier?" with evidence. If accuracy is >85% on actual workload, no retrain needed. If <70%, plan a retrain wave.

### Acceptance (conditional)

- [ ] `npm run backfill:router` processes the full 4,831-session corpus (or filtered subset) in reasonable time.
- [ ] Synthetic routing entries emitted to `~/.ouroboros/telemetry/router-backfill.jsonl`.
- [ ] Evaluation report produces accuracy, disagreement patterns, retrain recommendation.
- [ ] Commit: `feat(wave-53): Phase F — router backfill and offline evaluation`

---

## Phase G — Integration, migration notes, decision close

**Goal:** Prove the signal loop is alive end-to-end, document what each restored signal measures, close wave.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/agentChat/telemetryRestoration.integration.test.ts` | ~320 | End-to-end: send prompt with override → features logged, outcomeTraceId propagated, trackChatTurn fires, quality signal emitted on next turn, context decision + outcome written, Codex edit provenance captured. |
| `docs/telemetry.md` | ~240 | What each signal file contains, how to query, how to opt out. Privacy stance. |

### Modified files

| File | Change |
|---|---|
| `roadmap/telemetry-recovery-and-corpus-analysis.md` | Mark phases complete; link to Phase D and F reports. |
| `CLAUDE.md` (project root) | Update "Known Issues / Tech Debt": drop stale "telemetry dark signals" entry; replace with pointer to `docs/telemetry.md`. |
| `docs/architecture.md` | Reflect telemetry-on-by-default, opt-out via Settings, shadow-mode router behavior. |
| `roadmap/session-handoff.md` | Record Phase F finding and any Wave 54 candidates (semantic ops gate, router retrain gate). |
| `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` | Update the "telemetry dark signals" memory entry to reflect post-53 state. |

### Acceptance

- [ ] Integration test exercises every restored signal.
- [ ] `docs/telemetry.md` documents privacy stance, signal descriptions, opt-out flow.
- [ ] Corpus analysis and router evaluation findings linked from session handoff.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-53): Phase G — integration, telemetry docs, wave close`

---

## Subagent execution model

**CRITICAL PREREQUISITE:** the working tree must be clean before dispatch. The user's transcript flagged 232 uncommitted files; parallel subagents cannot distinguish in-flight changes from wave targets. Commit, stash, or use `EnterWorktree` per workstream before any Phase starts.

- **Model:** `sonnet`
- **Isolation:** Phase A and Phase E handled directly by the parent (keystone precision, integration subtlety); other phases dispatch to subagents.
- **Test policy:** scoped vitest per phase; parent runs full suite + `npm run analyze:corpus` smoke + telemetry integration test at wave close
- **Lint policy:** no relaxations
- **Commit policy:** one per phase; Phase D emits two commits (analyzer + report)
- **Scope discipline:** do NOT touch the 232 pre-existing modifications. Do NOT merge corpus findings into implementation decisions mid-wave — Phase D's report is a gate for Phase F only.

### Parallelism model (from subagent confidence analysis)

**Parallel-safe once baseline is clean:**
- Phase B (Settings UI + config defaults)
- Phase C (Codex edit provenance)
- Phase D (corpus analyzer — standalone scripts)

**Must serialize:**
- Phase A (parent handles directly — keystone)
- Phase E (parent handles directly — integration risk)
- Phase F (conditional on Phase D's report)
- Phase G (depends on all prior phases)

### Phase dispatch order

1. **Phase A** — router short-circuit + quality signal guard (parent, keystone)
2. **Phase B + C + D in parallel** — telemetry UI, Codex provenance, corpus analyzer (Sonnet subagents)
3. **Phase E** — context writers for claude-code/codex (parent, integration risk)
4. **Phase F** — conditional on Phase D decision report (Sonnet subagent if triggered)
5. **Phase G** — integration, docs, close (parent)

---

## Risks

| Risk | Mitigation |
|---|---|
| Router short-circuit fix breaks user override behavior. | Phase A acceptance criteria explicitly requires user-selected model still ships. Manual smoke before commit. `router.shadowMode: false` reverts. |
| `outcomeTraceId` turns out to have edge cases where it's also null. | Phase A adds a unit test that verifies `outcomeTraceId` is set before the quality signal call. Fail loudly rather than silently drop. |
| Telemetry default flip surprises existing users who expected opt-in. | Settings panel (Phase B) surfaces the toggle. Release notes call out the change. `telemetry.remote` staying `false` forever addresses the real concern (transmission). |
| Codex tool event schema shifts and `markAgentEdit` misses events. | Phase C acceptance requires fixture tests against a real Codex session log. If schemas drift, tests catch it. |
| Corpus analyzer overfits to the biased sample. | Phase D decision doc explicitly names the sample bias and bounds conclusions accordingly. Decision is "probably X" not "definitely X". |
| Phase E wiring introduces path-normalization bugs that corrupt context outcome data. | Phase E is handled by parent, not subagent. Integration test in Phase G verifies full round-trip. Disable via config flag if needed post-ship. |
| Router backfill reveals the classifier is wrong for real workload but retraining requires labeled data we don't have. | That's a valid outcome. Phase F's report documents the finding; Wave 54 (if needed) scopes a retrain including label-collection strategy. |
| Parent takes on too much (A + E + G directly) and slows the wave. | Phase ordering allows B + C + D to run in parallel in the background while parent handles A. By the time parent finishes A, the subagents have completed their parallel phases. |

---

## Acceptance criteria (wave-level)

- [ ] Seven phase commits on `master` (Phase D contributes 2).
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] Send prompt with user-override model → `router-decisions.jsonl` has features populated, `routedBy: user-override`.
  - [ ] Send a regenerate → `router-quality-signals.jsonl` gets `chat_regenerate` entry.
  - [ ] Edit a file via Claude Code → `edit-provenance.jsonl` gets entry.
  - [ ] Edit a file via Codex → `edit-provenance.jsonl` gets entry.
  - [ ] Claude Code turn → `context-decisions-*.jsonl` + `context-outcomes-*.jsonl` get entries.
  - [ ] Codex turn → same.
  - [ ] Toggle telemetry off in Settings → new events stop writing.
  - [ ] `npm run analyze:corpus` produces a readable report.
- [ ] Corpus analysis report (Phase D) published with explicit Go/No-Go on semantic ops.
- [ ] If Phase F ran: router evaluation report published with retrain recommendation.

---

## Out-of-wave follow-ups

- **Wave 54 candidate: Semantic ops build-out** — only if Phase D's report shows the gap is real.
- **Wave 54 candidate: Router retrain** — only if Phase F's report shows classifier accuracy is insufficient for real workload.
- **Hook handler for `task_completed`** — if Wave 50 didn't already land it, wire via Phase B's hook infrastructure.
- **Telemetry aggregation dashboard** — once signals are flowing, a renderer-side view of the data (regenerate rate, grep-depth distribution, edit-failure rate) would inform future UX decisions.
- **Remote telemetry transmission** — separate explicit-opt-in wave if/when product grows beyond single-user IDE. Splits `telemetry.structured` (local, default-on) from `telemetry.remote` (transmit, default-off).
- **Cross-project corpus analysis** — run the Phase D analyzer on other projects' session corpora (Contractor App, worktrees). Different projects may reveal different patterns.
- **Effort signal instrumentation** — effort is user-selected today (no router), but logging what effort users pick per intent bucket would reveal whether a real effort router is worth building.

---

## Cross-wave alignment

- **Wave 48** (token baseline) — ships `<workspace_state>` dedupe and lean packet mode. Its telemetry hook for graph-vs-Grep classification is a sibling to Wave 53's broader telemetry restoration. Both write to `~/.ouroboros/telemetry/`.
- **Wave 50** (rule-to-hook) — depends on Wave 48's graph-usage telemetry for enforcement decisions. Wave 53's restoration of quality signals compounds this: a rule-hook dataset + a quality-signal dataset together form the corpus for future enforcement tuning.
- **Wave 51** (CodeMode + internalMcp) — its per-spawn telemetry extension benefits from Wave 53's restored signal loop. If CodeMode routing is live, Wave 53's context decision/outcome writers capture the CodeMode-routed turns correctly.
- **Wave 52** (context ranker) — relies on `context-outcomes-*.jsonl` to compute ranker hit rate. That file is produced only after Wave 53 Phase E. **Wave 52 Phase A cannot meaningfully run until Wave 53 Phase E ships.**

**Re-sequencing note:** Wave 52 should move to after Wave 53 in the roadmap. Wave 53's signal restoration is a prerequisite for Wave 52's measurement work.
