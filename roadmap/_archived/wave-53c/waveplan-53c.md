# Wave 53c — Historical Corpus Analyzer & Decision Report
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.2 · Result: `roadmap/auto-briefs/wave-53c-result.md`
**Version target:** v2.7.2 (patch — measurement scripts + decision report; no production code path changes)
**Feature flags:** None. Pure-analysis scripts under `scripts/`; no runtime behavior touched.
**Dependencies:**
- Wave 53 Phase A–C (telemetry restoration) ✅ shipped
- Wave 53a (telemetry parity / external-session capture) ✅ shipped
- Wave 53b (ranker hit-rate measurement + ADR convention) ✅ shipped
**References:**
- `roadmap/wave-53-plan.md` — original Phase D scope (lines 269–308) and Phase F (lines 348+)
- `roadmap/auto-briefs/wave-53-result.md` — explicit "spin Phase D out as a standalone wave" recommendation
- `~/.claude/projects/C--Web-App-Agent-IDE/` — corpus directory (~800 sessions)
- `roadmap/wave-54-plan.md` — downstream wave whose start guard depends on this wave's decision report

---

## Why this wave exists

Wave 53 deferred its Phase D under time pressure. The deferral was clean — flagged in the result brief as "spin out as standalone wave" — but it never got picked up. 53a and 53b ran instead (both legitimate, neither addressed Phase D's question).

Two waves are blocked or guessing because of the missed deliverable:

1. **Wave 54 (TS semantic operations)** has a hard start guard that depends on this analyzer's decision report. The wave cannot start until the gate is answered with real numbers.
2. **Router classifier (Wave 31 area)** was trained on a theoretical task distribution. The analyzer reveals whether reality matches.

This wave is **read-only analysis**. No production code paths change. Worst case the report says "no real gap" — that's still a useful answer that retires Wave 54 and redirects effort.

---

## What this wave produces

A markdown decision report (`roadmap/wave-53c-corpus-analysis.md`) with hard numbers answering:

- Edit first-try failure rate, broken down by intent bucket.
- Grep-loop depth distribution (consecutive Grep/Glob runs without intervening Read/Edit/Write).
- Intent distribution across ~800 sessions (bug-fix / feature / refactor / review / meta-UX / continuation / other).
- Cross-tabs: intent × Edit-failure, intent × Grep-depth, top prompt patterns per bucket.
- Explicit Go/No-Go for Wave 54.
- Whether the router classifier needs offline evaluation against the real prompt distribution (gates Phase D below).

The reusable analyzer scripts live under `scripts/` and are runnable on any `~/.claude/projects/*/` directory.

---

## Scope

### In-scope

- **Phase A:** Intent classifier + tests.
- **Phase B:** Corpus analyzer + tests + `npm` script entries.
- **Phase C:** Run analyzer over the live corpus, write decision report. **Decision report is the wave's deliverable.**
- **Phase D (conditional on Phase C):** Router backfill + offline classifier evaluation. Ships only if Phase C says the router classifier needs validation against real workload.
- **Phase E:** Wave wrap-up — full suite, lint, format, typecheck, orchestrator diff review, result brief, ADR finalization, roadmap status update.

### Out-of-scope

- Any change to runtime telemetry, ranker, router, or context layer behavior. This wave reads existing data; it does not produce new signals.
- Wave 54 itself. The decision report from Phase C either greenlights Wave 54 or retires it; either outcome is a separate next step.
- Sample-size-extension automation. If the corpus is too small for a confident answer, the report says so honestly. We don't build a "wait for more data and re-run" trigger here.
- Visualizations / dashboards. Phase C's deliverable is a markdown report with tables. Charts come later if the report indicates ongoing measurement is worthwhile.

---

## Architecture

```text
~/.claude/projects/C--Web-App-Agent-IDE/
 └─ <session>.jsonl  (NDJSON: tool_use, tool_result, user, assistant)
                                │
                                ▼
scripts/analyze-claude-corpus.ts
 ├─ walks all session JSONLs
 ├─ per session: tool counts, Edit first-try failures, max Grep/Glob run, prompts, files touched
 ├─ uses scripts/intent-classifier.ts to bucket each session's prompt(s)
 └─ emits:
     ├─ corpus-analysis.csv  (per-session rows)
     └─ corpus-analysis.json (aggregate cross-tabs)
                                │
                                ▼
roadmap/wave-53c-corpus-analysis.md
 (human-written report from the JSON output;
  decision section answers Wave 54 gate + router-eval question)
```

**Key design calls:**

- **Pure-Node scripts**, runnable via `tsx`. No Electron imports. Mirrors the existing `scripts/analyze-ranker-hit-rate.ts` shape (already in repo).
- **Edit failure detection** is structural: `tool_result` with `is_error: true` whose parent `tool_use` is `Edit` and whose content matches the canonical "old_string didn't match" message.
- **Grep-loop depth** is the longest consecutive run of `Grep` or `Glob` calls with no intervening `Read` / `Edit` / `Write`.
- **Intent classification** is regex + keyword over user prompts only (continuation / "go ahead" prompts are their own bucket so they don't pollute primary buckets).
- **Sample bias** is a first-class output. The corpus skews toward whatever phase of work was active in the sampling window; the report flags this rather than burying it.
- **Decision rule is explicit, not buried.** The report's decision section uses the exact thresholds from the Wave 54 plan (≥10% / ≥15% / ≥5%) and renders Go/No-Go directly.

---

## Phase A — Intent classifier + tests

**Goal:** Reusable user-prompt classifier. Foundational; no dependencies on other phases.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/intent-classifier.ts` | ~180 | Regex + keyword classifier over user prompts. Buckets: `bug-fix`, `feature`, `refactor`, `review`, `meta-ux`, `continuation`, `other`. Pure function; no I/O. |
| `scripts/intent-classifier.test.ts` | ~200 | ~50 fixture prompts with expected classifications. Covers continuation prompts, multi-intent prompts (pick the strongest), and the `other` fallthrough. |

### Modified files

None.

### Subagent briefing

- **Read first:** the original Phase D brief in `roadmap/wave-53-plan.md:289–298` for the bucket definitions and the "continuation prompts are their own bucket" rule. Skim 5 representative session JSONLs from `~/.claude/projects/C--Web-App-Agent-IDE/` to ground the keyword choices in actual user phrasing.
- **Pure function.** No file I/O in `intent-classifier.ts`. Takes a string, returns `{ bucket, confidence, signals: string[] }`. Confidence is a simple "matched-keywords / total-keywords" ratio for the winning bucket; signals are the matched keywords (useful for debugging the classifier).
- **Continuation detection first.** Short prompts ("go", "continue", "yes", "ok do it", "next") match continuation regardless of other keywords. They wouldn't otherwise classify cleanly.
- **`other` is fine.** Don't overfit. If a prompt doesn't have strong signals, return `other` — the report will surface the prevalence and we can refine on the second pass.
- **Acceptance:** all fixture tests pass; classifier is exported as `classifyIntent(prompt: string): IntentResult` with the result shape declared in the same file.

### Acceptance

- [ ] `scripts/intent-classifier.ts` and `.test.ts` created.
- [ ] All ~50 fixture cases pass.
- [ ] Lint clean on touched files (max-lines-per-function:40, complexity:10, etc.).
- [ ] Typecheck clean.
- [ ] Commit: `feat(wave-53c): Phase A — intent classifier + fixtures`

---

## Phase B — Corpus analyzer + tests

**Goal:** The analyzer script. Walks JSONLs, computes per-session metrics, emits CSV + aggregate JSON.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-claude-corpus.ts` | ~420 | Walks `~/.claude/projects/<project>/*.jsonl`, parses NDJSON, builds per-session summary, applies `intent-classifier`, emits `corpus-analysis.csv` + `corpus-analysis.json`. Tolerates malformed lines and truncated sessions. |
| `scripts/analyze-claude-corpus.test.ts` | ~260 | Fixture-driven tests on synthetic JSONL. Covers: malformed lines, truncated sessions, multi-turn sequencing, Edit failure detection, Grep-loop counting, intent classification integration. |

### Modified files

| File | Change |
|---|---|
| `package.json` | Add `analyze:corpus` (CSV+JSON) and `analyze:corpus:json` (JSON only, faster) scripts. |

### Subagent briefing

- **Read first:** `scripts/analyze-ranker-hit-rate.ts` for the corpus-walking shape — same JSONL format, same project directory. Reuse parsing patterns where possible. Read 3–5 session JSONLs by hand to ground the parser in real shapes (`tool_use` / `tool_result` / `user` / `assistant`).
- **Edit first-try failure rule:** a `tool_result` with `is_error: true` whose parent `tool_use` was `Edit` and whose content text contains the canonical mismatch phrase. Document the regex you use; the report cites it.
- **Grep-loop depth rule:** longest consecutive run of `Grep` or `Glob` `tool_use` records with no intervening `Read` / `Edit` / `Write` `tool_use`. Reset on the first non-search tool.
- **Per-session summary fields:** `sessionId`, `startTs`, `endTs`, `durationMs`, `toolCounts: Record<string, number>`, `editAttempts`, `editFirstTryFailures`, `editFirstTryFailureRate`, `maxGrepLoopDepth`, `intentBucket`, `intentConfidence`, `userPromptCount`, `filesTouched: string[]`, `tokenUsage` if available.
- **Aggregate JSON shape:** `{ corpusStats, intentDistribution, intentXEditFailure, intentXGrepDepth, topPromptPatternsByBucket, sampleBiasNotes }`.
- **Sample-bias output is part of the deliverable.** Compute and emit: date range of the corpus, sessions-per-week histogram, files-touched-most-often (which surfaces "this corpus is dominated by UI work" or "this corpus is dominated by telemetry waves").
- **Performance:** ~800 sessions; analyzer must complete in under 3 minutes on the user's machine. Stream parse — don't load all sessions into memory at once.
- **Acceptance:** scoped tests cover the rules above with synthetic fixtures; running `npm run analyze:corpus` produces both output files cleanly.

### Acceptance

- [ ] `npm run analyze:corpus` completes in <3 min on the live corpus.
- [ ] CSV + JSON outputs are well-formed and contain the documented fields.
- [ ] Scoped tests pass.
- [ ] Lint, typecheck clean.
- [ ] Commit: `feat(wave-53c): Phase B — historical corpus analyzer`

---

## Phase C — Run analyzer + write decision report

**Goal:** Produce the wave's actual deliverable — the decision report.

### New files

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-53c-corpus-analysis.md` | ~280 | Findings from running Phase B's analyzer over the live corpus. Includes: corpus stats, intent distribution, intent × Edit-failure, intent × Grep-depth, top prompt patterns, sample-bias notes, **decision section** with explicit Wave 54 Go/No-Go and router-evaluation Go/No-Go. |

### Modified files

None (the artifact is the report).

### Subagent / orchestrator work

- **Run the analyzer.** `npm run analyze:corpus`. Capture both outputs.
- **Write the report from the JSON.** No guesses; every claim cites a number from the JSON. If a number isn't in the JSON, either add it to Phase B's output and re-run, or flag the question as out-of-scope for this report.
- **Honest sample size.** If the corpus produces fewer than ~50 relevant turns in any decision-driving bucket (e.g. rename-shaped intent), the decision section says "inconclusive — extend soak period."
- **Decision section uses Wave 54's explicit thresholds:**
  - ≥10% of turns show grep-loop depth ≥3 → positive signal for Wave 54.
  - ≥15% of Edits fail on first attempt → positive signal for Wave 54.
  - ≥5% of turns have rename/refactor intent AND those turns show above-average failure rates → positive signal for Wave 54.
  - Any of the above met → Wave 54 is justified.
  - None met → Wave 54 does not start; the decision section says so.
- **Router evaluation question:** does the corpus's intent distribution materially differ from what the router classifier was trained for? If yes, Phase D below ships. If no, Phase D is skipped and Phase E closes the wave.
- **No burying outcomes.** "Agent never grep-loops" is a valid result. "Edit failures are concentrated in a bucket Wave 54 wouldn't help" is a valid result. The honesty of the report is its value.

### Acceptance

- [ ] Decision report exists and explicitly answers the Wave 54 gate.
- [ ] Decision report explicitly answers whether Phase D (router backfill) ships.
- [ ] Every claim in the report cites a number from the analyzer JSON.
- [ ] Sample-bias section is present.
- [ ] `lint:claude-md` clean (report under length cap).
- [ ] Commit: `docs(wave-53c): Phase C — corpus analysis decision report`

---

## Phase D — Router backfill + offline evaluation (CONDITIONAL)

**Goal:** Replay historical user prompts through the router's feature extractor + classifier; evaluate classifier quality against real workload.

**Conditional gate:** Only runs if Phase C's decision report says the corpus's intent distribution materially differs from the router's training assumption. If not, this phase is skipped and Phase E closes the wave with three phases shipped.

### New files (conditional)

| File | ~Lines | Description |
|---|---|---|
| `scripts/router-backfill.ts` | ~340 | Walks session JSONLs, extracts user prompts (with prior-assistant context), runs each through the router's feature extractor + classifier, emits synthetic `EnrichedRoutingLogEntry` rows for offline analysis. |
| `scripts/router-backfill.test.ts` | ~220 | Fixture tests covering prompt extraction, prior-context threading, feature-extraction parity with the runtime path. |

### Modified files (conditional)

| File | Change |
|---|---|
| `package.json` | Add `analyze:router-backfill` script. |

### Subagent briefing

- **Read first:** the existing router code under `src/main/router/` (or wherever Wave 31 landed it) — specifically the feature extractor and classifier entry points. The backfill script must call the **same code path** the runtime does, otherwise the evaluation is meaningless.
- **Prior-context threading:** the router uses prior assistant message content as a feature. Reconstruct this from the JSONL's prior turn before classifying.
- **Output shape:** synthetic rows in the same schema the runtime router writes. Loadable by the existing offline-eval tooling without schema gymnastics.
- **No production code paths change.** This script consumes router code; it does not modify it.

### Acceptance (conditional)

- [ ] Backfill script runs against the corpus and emits enriched rows for every classifiable prompt.
- [ ] Output rows are schema-compatible with the runtime router log format.
- [ ] Scoped tests pass.
- [ ] Lint, typecheck clean.
- [ ] Commit: `feat(wave-53c): Phase D — router backfill + offline evaluation`

---

## Phase E — Wave wrap-up

**Goal:** Verify the full wave holds together, write the result brief, finalize the ADR, push.

### Tasks

- Full vitest suite (`timeout 360 npx vitest run`) — must be green.
- `npm run lint` — zero errors.
- `npx tsc --noEmit` (renderer) and `npx tsc --noEmit -p tsconfig.node.json` (main) — clean.
- Prettier / formatter pass.
- Orchestrator reviews the cumulative wave diff (Phases A + B + C + optionally D) — verify scope discipline, no stray refactors, no production paths altered.
- Result brief: `roadmap/auto-briefs/wave-53c-result.md`.
- ADR finalize: `roadmap/decisions/wave-53c.md`.
- Roadmap status update: flip Wave 53c plan header to ✅ COMPLETED with date and version.
- Memory update: add a one-line pointer in `~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md` capturing the Wave 54 Go/No-Go outcome and any non-obvious findings (don't duplicate the report — point at it).
- Commit + push.

### Acceptance

- [ ] Full suite, lint, typecheck all clean.
- [ ] Result brief written.
- [ ] ADR finalized.
- [ ] Roadmap reflects shipped status.
- [ ] Pushed to GitHub.
- [ ] Wave 54's start guard is now explicitly answered (in the report and in MEMORY.md).

---

## Subagent execution model

- **Phase A and Phase B are sequential** (B depends on A's classifier export). Single Sonnet subagent per phase.
- **Phase C is orchestrator-driven** — running the analyzer and writing the report is judgment work; it does not partition cleanly.
- **Phase D is conditional and dispatched only after Phase C's decision.**
- **Phase E is orchestrator-driven** — wrap-up work that doesn't subcontract.

All phase subagents skip `npm test` (full suite is the parent's responsibility per `~/.claude/rules/test-scope.md`). Each subagent runs scoped vitest + lint + typecheck on touched files only.

---

## Risks

| Risk | Mitigation |
|---|---|
| Corpus too small / biased to give a confident decision | Sample-bias output is first-class; report says "inconclusive" honestly rather than forcing a decision. Wave 54 stays blocked but with a clear reason, not a missing dependency. |
| Edit-failure detection regex misses real failures or counts false positives | Phase B test fixtures cover the canonical mismatch phrase explicitly; report cites the regex used so future readers can sanity-check. |
| Grep-loop definition produces uninteresting numbers (e.g., always 0 or always 20) | The metric is documented with rationale; if the distribution is degenerate, the report flags it and the decision section weights the other signals more heavily. |
| Phase D drifts again like the original Phase D drifted | Phase D in this wave is conditional on Phase C's explicit answer; either it ships in this wave or it's retired by the report. No deferral path. |
| Sample-bias note becomes a polite hedge that nobody reads | The report's decision section must reference the bias note explicitly when weighing the thresholds — orchestrator review catches this. |

---

## Acceptance criteria (wave-level)

- [ ] Decision report explicitly answers the Wave 54 start gate (Go / No-Go / Inconclusive-with-reason).
- [ ] Decision report explicitly answers the router-evaluation question.
- [ ] Reusable analyzer scripts under `scripts/` runnable on any `~/.claude/projects/*/`.
- [ ] No production code path altered; no new feature flags; no schema changes.
- [ ] Wave 54 is unblocked or retired by the end of this wave.
- [ ] ADR captures the analytical decisions (Edit-failure regex, grep-loop definition, intent buckets, threshold rationale).

---

## Out-of-wave follow-ups

- **Quarterly re-run** of `npm run analyze:corpus` against accumulated corpus. Reuses Phase B's script.
- **Visualization layer** — if the report's tables prove useful, a future wave can render them as a dashboard. Not required for the decision.
- **Wave 54 (TS semantic operations)** — gated on this wave's outcome. Either greenlit by Phase C and scheduled, or retired and closed.
- **Router retrain wave** — only if Phase D's evaluation surfaces real misclassification at scale.

---

## Cross-wave alignment

- Lineage: 53 → 53a → 53b → **53c** (this wave). All four are telemetry/corpus work; 53c closes the loop opened by 53's deferred Phase D.
- 53c does not interact with 58 (UI closeout) or 59 (workbench reshape) — different subsystems.
- 53c's outcome feeds into Wave 54's gate (or retires Wave 54).
