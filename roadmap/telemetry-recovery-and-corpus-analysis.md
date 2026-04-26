# Plan: Telemetry Recovery + Session-Corpus Analysis

Written 2026-04-23 after investigating the semantic-ops-gap question and discovering the IDE's telemetry layer is almost entirely dark. Three parallel workstreams, roughly independent, with suggested sequencing at the end.

## Context (why this exists)

The IDE ships with four telemetry systems intended to drive the auto model router and measure agent quality: router decisions, quality signals, context decisions/outcomes, and edit provenance. In practice all four are producing minimal or zero data on disk:

- `router-decisions.jsonl` — 131 entries over 3 weeks, only 1 with a `features` field; `routedBy:"default"` on essentially every entry.
- `router-quality-signals.jsonl` — 14 entries over 3 weeks, all `terminal_natural_stop`. Zero `chat_regenerate`, `chat_correction`, `code_committed`, `user_override`, or `task_completed`.
- `context-decisions-*.jsonl` + `context-outcomes-*.jsonl` — do not exist on disk.
- `edit-provenance.jsonl` — does not exist on disk.
- `telemetry.structured` defaults `false` — raw `pre_tool_use`/`post_tool_use` events not captured.

Meanwhile, Claude Code CLI has been independently logging **4,831 session transcripts (685 MB)** at `~/.claude/projects/`. 800 of those are for this project. Each transcript contains full turn-by-turn tool calls, tool results (with `is_error` flags), user prompts, and assistant responses. That corpus is a far richer signal source than the IDE's own telemetry and is available today.

**Router cutoff date:** 2026-04-03 (commit `8f4bb79`). All sessions before that date are router-unseen. Because of the short-circuit bug below, essentially all sessions after that date are also router-unseen in practice.

## Workstream A — Fix dark telemetry signals

Goal: get every new session to produce real data in the telemetry jsonl/sqlite files so that forward-looking decisions (router training, context tuning) can be made on actual evidence.

### A.1 — Router short-circuit (highest leverage)

**File:** `src/main/agentChat/chatOrchestrationRequestSupport.ts:70-72`

```ts
if (request.overrides?.model) {
  logOverrideIfDiffers(request, previousAssistantMessage);
  return { overrides: request.overrides, routedBy: 'user' };   // early return
}
```

When the user has a manual model override (always true in practice), the function returns before `routePromptSync` runs. `logRoutingDecision` receives `null` and falls back to `logger.logOverride`, which writes a stub with `routedBy:"default"`, `confidence:1`, no features, and **no traceId**. That null traceId then breaks every downstream signal in A.2.

**Fix:** Run `routePromptSync` + `logRoutingDecision` unconditionally (shadow-route even when a manual override is present), then honor the override for the actual model used. ~5 lines. No behavior change for the user; enables full logging.

### A.2 — Quality signals wiring

**File:** `src/main/agentChat/chatOrchestrationRequestSupport.ts:186-188`

```ts
if (routerTraceId) {
  trackChatTurn({ traceId: routerTraceId, ... });
```

`routerTraceId` is null because of A.1, so `trackChatTurn` never fires, so regenerate/correction detection has no prior turn to compare against.

**Fix 1:** After A.1 lands, remove the `if (routerTraceId)` guard (or switch to `outcomeTraceId` which is always set).

**Fix 2:** `trackTaskCompleted` is a dead export — no production call site. Wire it into the hook handler that receives `session_stop` / `task_completed` events in `src/main/agentChat/hooksSessionHandlers.ts`.

### A.3 — Context decisions/outcomes for non-anthropic-api providers

**Files:** `src/main/orchestration/contextPacketBuilder.ts`, `contextPacketBuilderDecisions.ts`, `contextOutcomeObserver.ts`

`recordTurnStart` is only called from `contextPacketBuilder.ts`, which only runs on the `anthropic-api` provider path. `claude-code` and `codex` spawn CLI subprocesses and bypass it, so the entire observer never receives a turn to record.

**Fix:** Wire `recordTurnStart` / `recordTurnEnd` into `claudeCodeContextBuilder.ts` (already touched in current branch) and the codex adapter. Source included-files from the hook `pre_tool_use` snapshot (Claude Code) or the parsed Codex stdout events. Larger surgery than A.1/A.2.

### A.4 — Edit provenance for Codex

**File:** `src/main/orchestration/providers/ptyCodexCapture.ts` (and/or the app-server adapter)

`markAgentEdit` is only called from the named-pipe hook channel (Claude Code). Codex parses tool events from stdout and never invokes the provenance store.

**Fix:** When the Codex parser identifies an `Edit` / `Write` / `MultiEdit` tool event, call `getEditProvenanceStore()?.markAgentEdit()` directly. ~10 lines.

### A.5 — Telemetry defaults

**File:** `src/main/configSchemaTail.ts:257`

```ts
telemetry: { type: 'object', properties: {
  structured: { type: 'boolean', default: false },   // ← flip to true
  retentionDays: { type: 'number', default: 30 }
}}
```

For a local-only single-user IDE where telemetry data never leaves the machine and is used to train the user's own router, `structured: false` is indefensible and inconsistent with `context.decisionLogging` and `context.provenanceTracking` (both default `true` for the same reason).

**Fix:** Flip `structured` default to `true`. Add a comment noting local-only storage. If external users ever ship, add a separate `telemetry.remote` flag defaulting `false` with explicit opt-in for transmission — do not conflate local recording with remote transmission.

### A.6 — Settings UI exposure

Once A.1–A.5 land, add a Settings panel under "Privacy" (or similar) exposing:
- `telemetry.structured` (default on, opt-out)
- `telemetry.retentionDays`
- `context.decisionLogging`, `context.provenanceTracking` (already true)

Currently users have no way to discover these flags exist. Also add a short explainer: "All data stored locally; never transmitted."

### Workstream A ordering

1. A.1 (router short-circuit) — unblocks everything else
2. A.5 (telemetry default flip) — 1 line, ship alongside A.1
3. A.2 (quality signals) — trivial after A.1
4. A.4 (Codex edit provenance) — independent, small
5. A.3 (context decisions for claude-code/codex) — larger, schedule separately
6. A.6 (Settings UI) — after A.1–A.5 are stable

## Workstream B — Claude Code session corpus analysis

Goal: answer the "semantic-ops gap" question (and future similar questions) from existing `~/.claude/projects/` transcripts instead of waiting weeks for new telemetry to accumulate.

### Corpus scope

| Directory | Sessions | Priority |
|---|---|---|
| `C--Web-App-Agent-IDE` | 800 | **Primary** |
| `C--Web-App-Agent-IDE--claude-worktrees-*` | 3 | Include (same project) |
| `C--Web-App-Contractor-App` | 22 | Secondary (other project) |
| `C--Users-coles` | 2,568 | Optional (home-dir scratch) |
| `C--Users-coles-AppData-Local-Programs-Ouroboros` | 95 | Skip (installed-app, not source) |

### B.1 — Analyzer v1 (headline pass)

Script: `scripts/analyze-claude-sessions.mjs` (new file).

Walks `~/.claude/projects/<target>/**.jsonl` streaming, emits:

**Per-session summary row:**
- `sessionId`, `project`, `startedAt`, `endedAt`, `durationMs`
- `userPromptCount`, `assistantTurnCount`
- `toolCounts` (map name → count)
- `toolErrors` (map name → error count)
- `editFirstTryFailures`, `editSuccesses`
- `grepRunMax`, `grepRunTotal` (longest consecutive Grep/Glob run without intervening Read/Edit/Write)
- `filesTouched` (distinct paths across Read/Edit/Write/Grep)
- `intentLabels` (list of regex-bucketed intents per prompt)
- `subagentDispatches` (Agent / TaskCreate counts)
- `tokensInput`, `tokensOutput`, `usdCost` (from usage events if present)

**Aggregate output:**
- Distribution of Edit failure rates across sessions (p50/p95/p99)
- Distribution of grep-run-max (is grep-looping actually a thing?)
- % of sessions containing any refactor/rename intent
- Tool-mix breakdown by intent class
- Top-10 failing Edit error messages (to distinguish "old_string didn't match" from real edit failures)

**Output formats:** CSV for per-session rows, markdown summary for aggregates.

Est. runtime: 30–90s for 825 sessions (Agent IDE + worktrees + Contractor). 5–10 min if we include the home-dir corpus.

### B.2 — Intent classifier

Start with regex bucketing on user prompts (rename / refactor / find-usages / bug-fix / feature-add / explain / review / test / continuation). Save labels alongside session rows.

If regex proves too noisy, swap to a small local LLM classification pass (Haiku) over the prompt field — cheap enough at ~3,400 user prompts × small token count. Only do this if v1 results are inconclusive.

### B.3 — Answering the semantic-ops question specifically

From B.1 aggregates:
- **If** rename/refactor/find-usages intents are <3% of sessions AND Edit failure rate stays <10% AND `grepRunMax` p95 is small → semantic ops is not the gap. Stop.
- **If** refactor/rename intents are >10% AND those sessions have 2–3× the Edit failure rate of other intents → semantic ops may help; proceed to pick a backend (tsserver native vs Serena).
- **If** Edit failure rate is high but dominated by "old_string didn't match" error messages across all intents → the win is in a better Edit tool, not in semantic ops.

Record the decision + evidence in a follow-up `plan/semantic-ops-decision.md`.

## Workstream C — Router backfill + evaluation

Goal: use the corpus to evaluate the existing router classifier against real workload, and optionally generate backfill training data.

### C.1 — Offline feature extraction

Build: `scripts/router-backfill.mjs`

Walks all session transcripts, extracts user prompts + preceding assistant messages (for `prevAssistant*` features), and runs each through the existing `featureExtractor.ts` and `classifier.ts`. Emits synthetic `EnrichedRoutingLogEntry` rows to a file like `~/.claude-router-backfill.jsonl`.

Because the feature extractor and rule engine are pure functions, this is strictly an offline replay — no side effects, no hot-reload issues, can re-run anytime the classifier weights change.

### C.2 — Evaluation

Compare backfill classifications against outcomes available in the transcript:

- Did the user prompt lead to many tool calls? → "hard" workload, should have routed SONNET/OPUS.
- Did the session produce a commit? → proxy for "task succeeded" — correlate with routed tier.
- Short prompts with trivial responses → HAIKU candidates.
- Did the user re-prompt similar text (regenerate proxy)? → router may have under-routed.

Output: confusion matrix / calibration chart showing where the current classifier under- or over-routes relative to real workload.

### C.3 — Retrain candidate

If evaluation shows meaningful miscalibration, use the backfill as labeled training data:
- X: the 19 extracted features per prompt
- y: derived tier label from actual workload proxy (tool-call count, token spend, commit outcome)

Retrain the logistic regression, save to `{userData}/router-retrained-weights.json` (the hot-reload path already supported in `classifier.ts`). Compare hold-out accuracy to the shipped `router-weights.json`.

This step is only worth it if C.2 shows the current classifier is meaningfully off. If it's roughly calibrated, don't retrain — save the backfill for future use and move on.

## Suggested sequencing

### Phase 1 — Quick wins (day 1)
- A.1 router short-circuit fix
- A.5 telemetry default flip
- A.2 quality signal guard removal
- Commit, verify new signals fire on the next session

### Phase 2 — Corpus analysis (day 1–2, parallel with Phase 1)
- B.1 analyzer v1
- B.2 regex intent classification
- B.3 semantic-ops decision document

Phase 1 and Phase 2 are independent — can be done in parallel.

### Phase 3 — Remaining telemetry fixes (day 2–3)
- A.3 context decisions for claude-code/codex
- A.4 Codex edit provenance
- A.6 Settings UI for privacy flags

### Phase 4 — Router work (only if Phase 2 reveals a gap worth closing)
- C.1 offline backfill
- C.2 evaluation
- C.3 retrain (only if C.2 warrants)

### What NOT to do until after Phase 2
- Don't start Serena integration. Don't start native tsserver integration. Both are blocked on B.3's evidence-based decision.
- Don't add new telemetry fields. Existing scaffolding covers what we need once A.1–A.5 land.

## Open questions / decisions to make later

1. **Whether to include the `C--Users-coles` home-dir corpus** (2,568 sessions). Adds volume but most are scratchpad/trivial. Recommend: run B.1 first on the 825-session project subset, include home-dir only if primary result is inconclusive.
2. **Whether to train a small LLM intent classifier** (B.2 upgrade). Decide based on regex bucket quality.
3. **Whether to surface telemetry status in the IDE UI** (not just settings toggles — e.g., a small indicator showing "recording"). Defer to Phase 3 / A.6.
4. **Retention policy for `~/.claude/projects/` corpus** — 685 MB and growing. Not part of this plan, but worth considering for a future cleanup.
