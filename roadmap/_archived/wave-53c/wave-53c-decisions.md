# Wave 53c — Architecture Decision Record

**Status:** FINALIZED. Decisions 1–11 resolved at wave close. Decision 11 was added late in the wave when post-Phase-C diagnostics revealed the verdict in Decision 8 was based on a measurement that was correct but interpreted incorrectly.

This wave is read-only analysis. Decisions here are analytical (what to count, how to bucket, where the thresholds come from) rather than architectural. Following the abbreviated form per `~/.claude/rules/best-practice-spectrum.md` for decisions that don't need the full industry-standard / emerging / experimental spectrum.

---

## Decision 1: Wave naming as `53c` rather than reopening Wave 53

**Context:** Wave 53's Phase D was deferred and tagged for "spin out as a standalone wave." Two naming options: reopen Wave 53 (treat as completing originally-planned scope) or number as 53c (new wave).

**Pick:** `53c`.

**Rationale:** Wave 53 is closed and tagged ✅ COMPLETED in its result brief. Reopening shipped waves muddies status and breaks the "result briefs are authoritative" convention. 53a / 53b already established the lettered-suffix pattern for follow-on telemetry/corpus work; 53c continues the lineage cleanly.

---

## Decision 2: Intent classifier — keyword/regex over ML

**Context:** Phase A needs a user-prompt classifier. Options: hand-tuned keyword/regex rules, fine-tuned small model, embedding similarity to bucket exemplars.

**Pick:** Keyword/regex.

**Rationale:** ~800-session corpus is small enough that classifier accuracy is dominated by bucket-definition correctness, not model sophistication. Hand-tuned rules are inspectable, debuggable, and the reviewer can sanity-check fixture cases. ML approaches would add infra cost (model loading, embedding generation) for accuracy improvement that the corpus size doesn't justify. If the corpus grows to 10K+ sessions and the classifier becomes a bottleneck, revisit then.

**Consequences:** The classifier's accuracy ceiling is set by the keyword set's coverage. Fixture tests (Phase A's ~50 cases) act as the regression gate. The report flags `other`-bucket prevalence so we know if the classifier is missing a real bucket.

---

## Decision 3: Edit failure detection — structural match on canonical phrase

**Context:** "Edit first-try failure" needs an unambiguous detection rule. Options: (a) `tool_result.is_error: true` with parent `Edit`; (b) (a) + content matches the canonical "old_string didn't match" phrase; (c) full diff between attempted and actual.

**Pick:** (b) — `is_error: true` AND parent is `Edit` AND content matches the canonical mismatch phrase.

**Rationale:** (a) over-counts (Edit can error for permission reasons, missing file, etc. — those aren't the failure mode Wave 54 would address). (c) is overkill and brittle to phrasing changes. (b) is the actual failure mode Wave 54 targets — "the agent's `old_string` doesn't match because the file shifted." The regex used is documented in the report so future readers can sanity-check or extend.

**Consequences:** If Anthropic changes the canonical mismatch phrase, the regex needs updating. Phase B includes a test fixture asserting the phrase pattern, so a phrase change shows up as a test failure rather than a silent miscount.

---

## Decision 4: Grep-loop depth — consecutive search runs without intervening read/write

**Context:** "Grep-loop depth" needs a concrete definition. Options: (a) total Grep+Glob count per session; (b) longest consecutive run of Grep/Glob with no intervening Read/Edit/Write; (c) Grep/Glob calls per user turn.

**Pick:** (b).

**Rationale:** The behavior Wave 54 would address is the "wandering" pattern — agent searches, doesn't find, searches again, doesn't find, searches again. Total counts (a) over-weight legitimate exploration; per-turn counts (c) are noisier because turn boundaries vary. Consecutive-run depth captures the failure mode cleanly: a depth of 5 means five searches in a row produced nothing actionable.

**Consequences:** A single search followed immediately by a Read is depth 1, even if the Read found nothing useful. That's intentional — the agent did the right thing. Wave 54 wouldn't change that behavior.

---

## Decision 5: Wave 54 start thresholds — taken verbatim from the Wave 54 plan

**Context:** Phase C's decision section needs explicit Go/No-Go thresholds. Options: (a) re-derive from this wave's findings; (b) use Wave 54's own start guard verbatim.

**Pick:** (b) — use Wave 54's published thresholds verbatim:
- ≥10% of turns show grep-loop depth ≥3, OR
- ≥15% of Edits fail on first attempt, OR
- ≥5% of turns have rename/refactor intent AND those turns show above-average failure rates.

**Rationale:** Wave 54's plan (lines 30–34) declared these thresholds before this analysis ran. Using them verbatim keeps the gate honest — we're not redefining the bar based on the data we collected. If the thresholds turn out to be wrong, that's a separate conversation with the Wave 54 plan, not a recalibration we sneak into Phase C.

**Consequences:** If reality lands just below a threshold (e.g., grep-loop depth ≥3 in 9% of turns), the literal answer is No-Go even if the qualitative signal is borderline. The report can call out the borderline finding; the decision must still be the literal answer per the threshold.

---

## Decision 6: Phase D conditional — collapsed into this wave or split

**Context:** Wave 53's original Phase F (router backfill, ~340 lines) was conditional on the original Phase D's outcome. Should it ride with 53c, or be a separate Wave 53d if needed?

**Pick:** Ride with 53c, conditional on Phase C's answer to the router-evaluation question.

**Rationale:** Splitting created the original drift problem (Phase F deferred along with Phase D, both forgotten). Keeping the conditional within the same wave forces an explicit ship-or-retire decision in Phase E. If Phase C says router evaluation isn't needed, Phase D is retired in the wave's result brief and the next wave is freed of the dependency.

**Consequences:** If Phase C says Phase D is needed, the wave runs longer. If Phase C says Phase D isn't needed, the result brief documents that explicitly so the question doesn't resurface.

---

## Decision 7: Edit-failure regex — `/String to replace not found in file/i`

**Context:** ADR Decision 3 committed to "structural match on canonical phrase" but left the exact regex to be settled after looking at real corpus samples.

**Pick:** `/String to replace not found in file/i` (case-insensitive).

**Rationale:** Phase B's subagent inspected real session JSONLs (`29b99c29`, `2be858a5`) and confirmed this is the exact phrase Anthropic emits when the Edit tool's `old_string` doesn't match the file's actual content. Both example sessions matched cleanly. The phrase is specific enough that false positives are extremely unlikely; the case-insensitive flag is defensive against future capitalization drift.

**Consequences:** The regex is captured in `scripts/analyze-claude-corpus-types.ts` as the `EDIT_MISMATCH_RE` constant so it's greppable and updatable. If Anthropic varies the phrase across versions (e.g., adds `"in file"` punctuation, changes the verb), Edit failures will be undercounted silently. Mitigation: a future re-run of the analyzer should spot-check a sample of `tool_result` records with `is_error: true` whose parent was `Edit` to verify the regex still catches the actual rate.

---

## Decision 8: Wave 54 start gate — Conditional Go (A+B yes, D no, internal Phase C decides)

**Context:** The wave's deliverable was the explicit Wave 54 Go/No-Go answer per the thresholds in Decision 5. Phase C ran the analyzer over 369 sessions and produced concrete numbers.

**Findings against the three thresholds:**

- **T1 (≥10% of turns show grep-loop depth ≥3):** session-level rate is 15.2% (56 / 369). The analyzer measures session-max depth, not per-turn depth, so the literal per-turn rate is necessarily lower. **Conditionally met** — the signal exists but the granularity caveat keeps the read honest.
- **T2 (≥15% of Edits fail on first attempt):** corpus-wide rate is 0.18% (4 / 2,239 attempts). **Decisively not met.** The worst bucket (bug-fix, 0.38%) is 40× below threshold. The "Edit's `old_string` doesn't match" failure mode that Wave 54's mutations were designed to address occurs at approximately 1 in 560 attempts.
- **T3 (≥5% of turns have rename/refactor intent AND those turns show above-average failure rates):** refactor prevalence is 5.7% ✓ but refactor failure rate is 0.00% (0 / 61 attempts) — below the 0.18% corpus average. Compound condition fails on the second clause. **Not met.**

**Pick:** Conditional Go for Wave 54.
- **Phase A+B (read-only ops — `find_references`, `get_symbol_body`):** GO. T1 supports the plumbing.
- **Phase C (internal measurement gate):** GO as designed in the wave's plan.
- **Phase D (symbol mutations — `replaceSymbolBody`, `insertBeforeSymbol`/`After`):** NO-GO based on this analysis. Wave 54's own Phase C measurement, after Phase B ships, is the right place to revisit if uptake patterns warrant it.

**Rationale:** Wave 54's plan already stages Phase D behind an internal measurement gate (Phases B → C → D). The corpus data confirms that staging was the correct call. The deep-grep-loop pattern is real (top sessions hit depth 11 paired with 40+ Edits) but rare; read-only ops can address it without committing to the higher-risk mutation surface. Phase D's headline justification — Edit first-try failures — collapses on this corpus, so building it now would be infrastructure for behavior that doesn't happen.

**Consequences:**
- Wave 54 unblocks. Phase A+B can be planned and dispatched as the next wave (or a contiguous sub-wave).
- Wave 54's Phase D is not retired permanently — the wave's own Phase C re-evaluates after A+B ships and uptake telemetry accumulates.
- The corpus's high session-max grep-depth in `review` (38.7%) and bug-fix (15.6%) buckets is the operative signal Wave 54's read-only ops would address. Future per-turn measurement (out-of-wave follow-up) would tighten the read.

---

## Decision 9: Wave 53c Phase D (router backfill) — No-Go this wave

**Context:** ADR Decision 6 folded the conditional Phase D (router backfill, ~340 lines) into 53c so it couldn't drift again like the original Wave 53 Phase F drifted. Phase C's data-driven evaluation: does the corpus's intent distribution materially differ from what the router classifier was trained for, justifying offline backfill evaluation now?

**Pick:** No-Go for Phase D in Wave 53c.

**Rationale:** Two reasons, both load-bearing.

1. **Live telemetry is the more durable signal.** Wave 53 restored router-feature telemetry. Live capture as work happens beats synthetic backfill on a 369-session sample (60.7% of which are <60s trivial sessions). The live corpus will accumulate cleaner data without backfill machinery.
2. **Backfill output's value is downstream.** Synthetic `EnrichedRoutingLogEntry` rows are only useful if a router-retrain wave wants offline-eval material. No retrain wave is queued. Building the input artifact for a wave-not-yet-spec'd is premature scope.

The corpus's intent distribution (bug-fix 41.7% / feature 19.2% / refactor 5.7%) is one observation; whether it materially differs from the router's training assumption is a question best answered against ~1K live-telemetry turns, not 369 mostly-trivial sessions.

**Consequences:**
- Phase D scope is **retired from Wave 53c** — explicitly, not deferred.
- **Reopening criteria:** if a future router-retrain wave is planned, Phase D's scope (~340 lines + tests) folds into that wave's Phase A. The original Wave 53 plan brief (`roadmap/wave-53-plan.md` lines 348+) remains the spec.
- The "drift problem" that Decision 6 was designed to prevent is avoided: the deferral is documented as a retire-with-criteria, not an open-ended "spin out as another wave" hand-off.

---

## Decision 10: Wave-level methodology — session-max vs per-turn measurement

**Context:** Phase C's T1 reading (15.2% session-rate, ambiguous per-turn) surfaced a methodology question the wave didn't anticipate: the analyzer measures session-max grep-loop depth, but Wave 54's threshold is framed in terms of turns. Should we extend the analyzer to per-turn measurement before closing the wave?

**Pick:** No — accept the session-max reading as a conservative proxy and document the limitation. Per-turn measurement is an out-of-wave follow-up.

**Rationale:** Extending the analyzer to per-turn would require either (a) defining "turn" precisely (the JSONL doesn't preserve clean turn delimiters in all cases) or (b) using assistant-message boundaries as turn proxies. Both are valid; neither is a slam-dunk. Building it would expand Phase B's scope after Phase C has already delivered its verdict, and the per-turn rate is *necessarily lower* than the session-max rate, so refining the measurement only makes T1 harder to meet — it doesn't strengthen the case for Wave 54. Conservative session-max read is enough for a Conditional Go on A+B; tighter measurement can come if Wave 54's internal Phase C wants finer granularity.

**Consequences:** The corpus analyzer ships as built. The decision report flags the granularity caveat in its T1 section so future readers don't over-interpret the 15.2% number. If a future wave or re-run wants per-turn measurement, it's an additive change to `analyze-claude-corpus-metrics.ts`, not a redesign.

---

## Decision 11: Verdict reframe — graph-tool adoption gap supersedes Decision 8

**Context:** After Phase C's verdict (Decision 8: Conditional Go for Wave 54 A+B) was written, a user-driven challenge reframed the analysis. The challenge: agents may be measurably grep-heavy not because graph/symbol tools wouldn't help, but because the existing graph tools see ~zero adoption — so Wave 54's *new* tools would inherit the same adoption gap and ship as dead infrastructure.

**Verification:** Re-ran the corpus aggregation specifically on graph/symbol tool calls. Findings:

| Tool category | Calls in 369 sessions |
|---|---|
| `Grep` + `Glob` + `Read` (text-based navigation) | 4,601 |
| `search_graph`, `trace_call_path`, `query_graph`, `get_architecture`, `detect_changes`, `get_code_snippet` (graph) | **0** |
| Sessions using ANY graph/symbol tool | **0 / 369 (0.0%)** |

**Root-cause diagnostic** (separate from the corpus, but uncovered as part of the same investigation):

1. **Tool-name drift.** `~/.claude/rules/graph-tool-routing.md` references `search_graph`, `trace_call_path`, `query_graph`, `get_code_snippet` — none of these names are exposed by `src/main/internalMcp/internalMcpToolsGraph.ts`. The actual exposed names are `get_architecture`, `get_codebase_context`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes`. Only two names (`get_architecture`, `detect_changes`) overlap. The rule documents tools the agent cannot call.
2. **MCP server unreachable at audit time.** Port 57225 was dead; the project's `.claude/settings.json` has no `mcpServers` block. The auto-inject in `internalMcp/internalMcpAutoInject.ts` either removed itself or hasn't been re-applied. Even when the IDE is running, agents may not actually have the tools registered.
3. **Adoption is therefore not a behavior choice.** It's a wiring failure — agents would not have used these tools even if they wanted to, because the tools weren't reaching their tool list. Whether the agent would prefer them once they're reliably available is the open question.

**Pick:** Decision 8's "Conditional Go for Wave 54 A+B" is **superseded by Decision 11**. The new posture is:

- **Wave 54 (TS semantic operations) is paused, not greenlit.** Building new symbol-level tools when the existing graph-tool layer has 0% adoption due to wiring failure would compound the problem.
- **A new wave (53d — Graph Tool Adoption) becomes the prerequisite.** It must (a) align rule names to reality, (b) fix the auto-inject reliability, (c) verify external-terminal access via the existing stdio bridge, and (d) measure live adoption once the wiring is correct. Until live adoption ≥30% on eligible turns is observed, Wave 54's symbol-tool surface is unjustified.

**Rationale:** The corpus measurement was accurate — the agent IS grep-heavy. The interpretation in Decision 8 was wrong because it assumed grep-heaviness is *behavior* when the diagnostic shows it's *available-tool-shape*. Building Wave 54 without first confirming agents will use symbol tools when reliably available is shipping plumbing for behavior we have no evidence of.

**Consequences:**

- Decision 8 stays in this ADR (history is preserved); Decision 11 supersedes it. The corpus analysis report (`roadmap/wave-53c-corpus-analysis.md`) is updated to lead with the adoption-gap finding rather than the threshold tables.
- Wave 53d is opened to fix the adoption gap. Wave 54's plan stays in `roadmap/wave-54-plan.md` but its status remains BLOCKED — now blocked on Wave 53d's adoption-rate measurement, not on the original Wave 53 Phase D corpus analysis.
- Future debugging note: "build more tools" is the wrong response to "agent doesn't use the tools we have." Always check exposure/wiring before assuming behavior.
- The 0% adoption finding is itself a useful artifact — it's documented in MEMORY.md and the result brief so future waves don't repeat the misread.
