# Wave 53b Phase A — Context Ranker Hit-Rate Analysis

**Status:** Provisional. Analysis based on small biased corpus (n=24); re-run quarterly.
**Run date:** 2026-04-28
**Script:** `scripts/analyze-ranker-hit-rate.ts`
**Archive:** `roadmap/wave-53b-data.json`
**Decision:** **REDESIGN** (mean hit rate = 6.3%, well below the 40% threshold)

---

## Methodology

The analyzer walks every top-level `*.jsonl` file under `~/.claude/projects/C--Web-App-Agent-IDE/`. For each session it:

1. Parses each line as JSON (skips malformed lines with a warning, none observed in this run).
2. Locates the first `type: "user"` entry and extracts its string content (handles both string and array-of-blocks shapes; tool_result inner string also probed).
3. Splits the turn-0 string at `<ide_context>` — text before the tag is the goal text, the block contains `<relevant_code>...</relevant_code>` with `<file path="..." score="..." confidence="..." reasons="...">` entries (the canonical format emitted by `src/main/orchestration/providers/claudeCodeContextBuilder.ts:74`).
4. Walks subsequent `type: "assistant"` entries, accumulating every `tool_use` block named `Read` and harvesting `input.file_path`. Reads are stored as a deduplicated Set after lower-cased forward-slash normalization.
5. Filters out sessions with `preLoadedCount < 3` OR `totalReads < 1` (denominator-too-small noise).
6. Buckets each surviving session by `classifyGoal(turn0_user_message)` from `src/main/orchestration/providers/goalClassifier.ts`.

### Metrics (per Decision 3 of `roadmap/decisions/wave-53b.md`)

- `hitRate = uniquePreLoadedReads / preLoadedCount` — fraction of files in `<relevant_code>` that the agent later Read.
- `recallAtK[k]` for k ∈ {1, 3, 5, 10} — among the first k entries of `<relevant_code>` (which are score-ordered), fraction that were Read.
- `anyHit` — boolean: did any pre-loaded file appear in the agent's Read calls?

NDCG was deferred per Decision 3 (no graded relevance signal available today).

---

## Corpus bias caveat

**This analysis is directionally correct, not definitive.** It must be re-run as the unified corpus grows.

The corpus today is the historical session JSONL set under `~/.claude/projects/C--Web-App-Agent-IDE/`. Per Wave 53a's findings, only ~40% of sessions are IDE-orchestrated (i.e. spawned by Ouroboros with the `<relevant_code>` block in the turn-0 prompt). The remaining ~60% are direct `claude -p` or terminal sessions with no IDE-injected ranker output, and Wave 53a's parity infrastructure does **not** retroactively augment historical sessions.

This run scanned 378 top-level JSONLs and found **51 with a `<relevant_code>` block** (≈13.5% of the corpus). After filtering for the noise floor (preLoaded < 3 or totalReads < 1), **24 sessions remained for analysis**. That sample size is small enough that any single outlier session moves the mean by ~4 percentage points. The bucket breakdown — 18 code / 5 casual / 1 unknown — has even smaller per-bucket cells.

Per Decision 1, the resolution is to ship the analyzer + report now, treat this run's decision as provisional, and schedule re-runs as Wave 53a's parity infrastructure populates the unified corpus going forward (every new IDE-orchestrated spawn after the Wave 53a auto-install is captured with full hook coverage). The "Re-run protocol" section below details cadence and triggers.

A side note on bias direction: the historical IDE-orchestrated sessions skew toward heavily-edited workflows (where the user has the IDE open for a substantive code task). One-shot casual chats from the terminal — a class where the ranker would be most useless — are under-represented. So the historical-corpus mean hit rate may be an **over-estimate** of what we'd see in a fully unified corpus. Reading the 6.3% number through that lens makes the picture worse, not better.

---

## Findings

### Corpus stats

| Metric | Value |
|---|---|
| Total JSONLs scanned | 378 |
| Sessions with `<relevant_code>` (IDE-orchestrated) | 51 |
| Sessions filtered as noise (preLoaded<3 OR reads<1) | 27 |
| Sessions analyzed | **24** |
| Skipped malformed JSON lines | 0 |

### Goal bucket breakdown

| Bucket | Count |
|---|---|
| `code` | 18 |
| `casual` | 5 |
| `unknown` | 1 |

### Overall hit rate

| Metric | Value |
|---|---|
| Mean hit rate | **6.3%** |
| Median hit rate | **0.0%** |
| Any-hit rate (≥1 pre-loaded file Read) | 45.8% |

The **median is 0%** — more than half of analyzed sessions had zero overlap between pre-loaded files and Read files. The "any-hit rate" is a softer signal: ~46% of sessions Read at least one of the ranker's 10 pre-loaded files, but on average only 0.6 of 10 pre-loaded files per session.

### Recall@k (overall)

| k | Recall@k |
|---|---|
| 1 | 4.2% |
| 3 | 4.2% |
| 5 | 5.0% |
| 10 | 6.3% |

Recall@1 of 4.2% means the top-ranked file was Read in only 1 of every 24 sessions. The recall curve barely rises with k, indicating the issue isn't ordering within the top 10 — it's that the right files mostly aren't in the top 10 at all.

### Per-bucket hit rate

| Bucket | n | Mean | Median | Any-hit |
|---|---|---|---|---|
| `code` | 18 | 7.8% | 10.0% | 55.6% |
| `casual` | 5 | 2.0% | 0.0% | 20.0% |
| `unknown` | 1 | 0.0% | 0.0% | 0.0% |

The `code` bucket — where the ranker matters most — averages 7.8% hit rate (≈0.78 of 10 pre-loaded files Read per session). `casual` is ≈2%, which is expected: a "Hi, is auto routing?" turn doesn't generate Read calls regardless of what the ranker returned.

### Recall@k per bucket

| Bucket | @1 | @3 | @5 | @10 |
|---|---|---|---|---|
| `code` | 5.6% | 3.7% | 5.6% | 7.8% |
| `casual` | 0.0% | 6.7% | 4.0% | 2.0% |
| `unknown` | 0.0% | 0.0% | 0.0% | 0.0% |

In the `code` bucket, recall@1 = 5.6% (≈1 of 18 sessions had the rank-1 file Read). The numbers for `casual` are dominated by a single outlier in the n=5 sample.

### Hit-rate distribution

| Bucket | Sessions |
|---|---|
| 0–20% | 20 |
| 20–40% | 4 |
| 40–60% | 0 |
| 60–80% | 0 |
| 80–100% | 0 |

**No session in the analyzed set scored above 40% hit rate.** This is the most striking finding: the ranker is not just imperfect on average, it is *uniformly* imperfect — there is no subset of sessions where it shines.

### Sample zero-hit sessions

| Session | preLoaded | Reads | Bucket | Goal text snippet |
|---|---|---|---|---|
| `15a14311` | 10 | 1 | casual | "Hi, is auto routing?" |
| `38220ca8` | 10 | 18 | code | "Right now, both codex a..." |
| `439565f2` | 10 | 12 | unknown | "When using the material product icons theme I have installed..." |
| `44622d4f` | 10 | 20 | code | "A couple of issues identified. First - Maximum update depth..." |
| `6eb59190` | 10 | 15 | code | "<button class=\"flex w-f..." |

The middle three sessions are particularly notable: 12–20 Read calls each, but **zero overlap** with the 10 pre-loaded files. The ranker emitted 10 candidates and the agent went elsewhere for every single one of its file lookups.

---

## Decision

Per the threshold rule documented in `roadmap/wave-53b-plan.md` Phase A:
- ≥70% mean hit rate → **no change recommended**
- 40–70% → **tune** (Phase C ships variant tuned to bucket findings)
- <40% → **redesign recommended** (variant ships anyway as a starting point)

**Mean hit rate = 6.3%. Decision: REDESIGN.**

Caveats on this decision (which is why it's "provisional"):

1. **Sample size.** n=24 analyzed sessions is small. A binomial 95% confidence interval on 6.3% with n=24 is very wide. A more honest read is "the mean is plausibly in the 1%–17% band," all of which are still well inside the redesign threshold.
2. **Corpus bias direction.** As noted above, the historical corpus likely *over-states* hit rate vs. a unified corpus — sessions where the ranker is most-useless (one-shot terminal chats) are under-represented. So the unified-corpus number is unlikely to surprise upward.
3. **Per-bucket consistency.** Even in the most-favorable `code` bucket (n=18), the mean is 7.8%. The signal is consistent across buckets, not concentrated in a small subset of weird sessions.

The conservative read: even after factoring in the small-sample uncertainty, this is unambiguously well below 40%. Redesign is the right framing.

That said, per Decision 1 + the Phase C standing direction "variant ships regardless," Phase C still ships a hand-tuned variant rather than a full redesign. Phase C's variant is an exploratory delta against current weights — a starting point for the redesign conversation, not the redesign itself. The full redesign (e.g. embedding-augmented ranker, learning-to-rank with graded relevance signals from Wave 53a's online telemetry) is a separate downstream wave.

---

## Variant guidance for Phase C

Given Phase A's finding that the issue is structural (right files aren't in top-10 at all, ordering within top-10 is a secondary problem), single-weight tweaks will not move the needle dramatically. Phase C should ship a defensible exploratory variant so the `contextRanker.mode` flag has something concrete to test, and document explicitly that the variant is "rearranging deck chairs" while the redesign is sketched.

### Recommended variant weight adjustments

Compared to current weights (per `src/main/orchestration/CLAUDE.md`):

| Reason | Current | Variant | Rationale |
|---|---|---|---|
| `git_diff` | 56 | **70** (+14) | Sessions that did Read pre-loaded files often Read git-diff-touched files — bumping git_diff makes those land higher. Cheap, defensible. |
| `dirty_buffer` | 68 | **78** (+10) | Same reasoning: open buffers correlate weakly with Reads but the correlation is non-zero, and they're high-signal vs. keyword guesses. |
| `recent_edit` | 32 | **42** (+10) | Mirror the dirty-buffer logic at lower magnitude — recently edited files in a session are statistically more-likely Read targets than random keyword matches. |
| `keyword_match` | 26+ | **16+** (-10) | Keyword matches dominate the long tail and produce the most zero-hit sessions in the data. Lowering its base weight de-emphasizes the noisiest signal. |
| `import_adjacency` | 22+ | **22+** (no change) | Untouched — the data doesn't speak to its quality either way. |

The variant rationale is "shift weight away from string-matching heuristics (`keyword_match`) and toward concrete file-state signals (`git_diff`, `dirty_buffer`, `recent_edit`)." This does not address the structural problem — that the ranker is missing the right files entirely — but it nudges the existing weight scheme toward the signals that have at least some empirical support.

### Per-bucket regression risk

Within the n=24 analyzed set, casual sessions had one any-hit (1 of 5). Lowering keyword_match shouldn't worsen casual since those sessions barely Read anything anyway. The code bucket's any-hit rate (55.6%) is the relevant baseline; if the variant pushes it below 50% on the next re-run, that's the regression flag. Document this in the Phase C variant module header.

---

## Re-run protocol

### How to re-run

```bash
cd "C:/Web App/Agent IDE"
npx tsx scripts/analyze-ranker-hit-rate.ts
```

Outputs:
- stdout: human-readable report (preserved in this doc as a snapshot)
- `roadmap/wave-53b-data.json`: machine-readable archive (overwritten each run; commit historical snapshots if longitudinal comparison matters)

### When to re-run

- **Quarterly cadence.** First re-run target: 2026-07-28 (3 months from this analysis). Adjust based on corpus growth.
- **Post-Phase-C-soak.** After users have been using `contextRanker.mode = 'tuned'` for a meaningful sample (≈100+ sessions in `tuned`), re-run to compare.
- **After any ranker change.** Anytime weights change in `contextSelectorScoring.ts` or signals are added in `contextSelectorRanker.ts`, re-run before merging.

### Graduation triggers

The hand-tuned variant approach (Decision 2) is a stopgap. Graduate to Bayesian weight optimization when **both** are true:
- Unified corpus reaches **≥500 IDE-orchestrated sessions with hook-side Read coverage** (today: ~24 after filtering — well below).
- A holdout-corpus split (e.g. 80/20) is feasible without sample-starving either side.

Graduate further to learning-to-rank with graded relevance only after Bayesian plateaus AND graded relevance signals are instrumented (Wave 53a's online telemetry from Phase B is the natural source — it can flag "agent dwelt on file" vs. "agent moved on" as a graded signal).

### Re-design triggers (separate, more aggressive)

If the next quarterly re-run still shows mean hit rate <20% in the `code` bucket, escalate to a redesign wave: investigate alternate ranker architectures (embedding similarity over recent-edit corpus, structural code-graph adjacency, etc.) rather than continuing to tune existing weights.
