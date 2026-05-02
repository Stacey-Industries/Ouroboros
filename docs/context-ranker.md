# Context Ranker — Architecture, Modes, Telemetry, and Measurement

The Ouroboros IDE pre-loads a ranked set of files into the `<relevant_code>` block
on turn 0 of every IDE-orchestrated agent spawn. This document covers how the ranker
works, the weight modes introduced in Wave 53b, how the online telemetry is collected,
and how to measure and interpret hit rates.

**Cross-references:**
- `roadmap/archive/wave-53b/waveplan-53b-analysis.md` — Phase A offline analysis (provisional numbers)
- `roadmap/archive/wave-53b/wave-53b-decisions.md` — ADR for Wave 53b architectural choices
- `docs/telemetry-parity.md` — telemetry parity infrastructure and queue lifecycle

---

## Overview

At every IDE-orchestrated spawn, `contextPacketBuilder.ts` calls
`selectContextFiles()` (in `contextSelectorWorkflow.ts`), which scores all
candidate files against 10 weighted reasons and returns an ordered
`RankedContextFile[]`. The top N files (subject to token/byte budget) are
serialized by `providers/claudeCodeContextBuilder.ts:74` into:

```xml
<relevant_code>
  <file path="src/main/foo.ts" score="124" confidence="high" reasons="dirty_buffer,git_diff">
    …file snippet content…
  </file>
  …
</relevant_code>
```

This block is injected into the first user turn before the agent's goal text.
**The snippet content is included inline.** This is the most important structural
fact for interpreting hit-rate metrics — see "Hit-rate metrics and their limits"
below.

After `rerankRankedFiles` further orders the list (the Haiku reranker, Wave 24),
the online telemetry hook records the final post-rerank ordering. That is what the
agent actually sees.

### Base weight table (current mode)

| Reason | Weight | Notes |
|---|---|---|
| `user_selected` | 100 | Explicitly chosen for this task |
| `pinned` | 95 | Persistent context pin |
| `included` | 85 | Request-level inclusion |
| `dirty_buffer` | 68 | Unsaved changes |
| `git_diff` | 56 | In the current diff |
| `diagnostic` | 52 | Has errors/warnings |
| `test_companion` | 38 | Sibling `*.test.ts` file |
| `recent_edit` | 32 | Recently modified |
| `keyword_match` | 26+ | Goal-text matches (additive per match) |
| `import_adjacency` | 22+ | Imports or imported-by a seed file |

Confidence is derived from score + reasons: `high` if user-selected, pinned,
dirty, score ≥ 80, or has diagnostics/diff; `medium` if score ≥ 35 or ≥ 2
reasons; `low` otherwise.

---

## Modes (Wave 53b)

The `contextRanker.mode` config flag selects the weight scheme used for ranking.
Change it in Settings or directly in the electron-store config.

```
contextRanker.mode  (string, default: "current")
  "current"       — pre-Wave-53b weights (the table above)
  "tuned"         — exploratory variant; shifts weight toward file-state signals
  "experimental"  — more aggressive variant; adds diagnostic boost
```

The flag is read at the call site in `contextSelectorWorkflow.ts:resolveRankerMode()`.
The `current` path is unchanged from pre-Wave-53b behavior.

### Variant weight tables

**Tuned mode** (`contextSelectorRankerVariant.ts` — `TUNED_WEIGHTS`):

| Reason | Current | Tuned | Delta | Rationale |
|---|---|---|---|---|
| `git_diff` | 56 | **70** | +14 | Sessions that Read pre-loaded files often involved git-diff-touched files |
| `dirty_buffer` | 68 | **78** | +10 | Open dirty buffers have a non-zero (if weak) correlation with subsequent Reads |
| `recent_edit` | 32 | **42** | +10 | Mirror dirty-buffer logic at lower magnitude |
| `recent_user_edit` | — | **42** | — | Match `recent_edit` adjustment |
| `keyword_match` | 26+ | **16+** | −10 | Keyword matches dominate the zero-hit long tail; de-emphasize the noisiest signal |

**Experimental mode** (`EXPERIMENTAL_WEIGHTS`):

| Reason | Current | Experimental | Delta | Rationale |
|---|---|---|---|---|
| `git_diff` | 56 | **75** | +19 | Lean harder into the strongest file-state signal |
| `dirty_buffer` | 68 | **78** | +10 | Same as tuned |
| `recent_edit` | 32 | **42** | +10 | Same as tuned |
| `recent_user_edit` | — | **42** | — | Same as tuned |
| `diagnostic` | 52 | **70** | +18 | Diagnostic presence is a strong editorial signal: agent will inspect this file |
| `keyword_match` | 26+ | **12+** | −14 | More aggressive downgrade than tuned |

Reasons absent from the override maps retain their original stored weights.

### Important: variants are exploratory, not validated

Phase A's offline analysis found a mean hit rate of 6.3% — well into the redesign
threshold. The recall curve barely rose with k (from 4.2% at k=1 to 6.3% at k=10),
indicating the structural problem is that the right files are not in the top 10 at
all, not that their ordering within the top 10 is wrong. Weight adjustments alone
cannot fix a structural deficit.

The variants shift weight from text-match heuristics toward concrete file-state
signals based on Phase A's bucket findings. They are a useful exploratory starting
point for the `contextRanker.mode` flag, and they ship as a testing surface for the
online telemetry (Phase B) to accumulate comparison data. They are **not** a
validated improvement. Default is `current`. Users opt in to `tuned` or
`experimental` explicitly.

---

## Telemetry

### What is collected

The online telemetry module (`contextRankerTelemetry.ts`) records two event kinds to
`~/.ouroboros/telemetry/ranker-hits.jsonl`. The telemetry runs entirely in the
Electron main process — no hook scripts, no queue.

**`ranker.selection.v1` — emitted per IDE-orchestrated context build:**

Captured immediately after `rerankRankedFiles` returns, at `contextPacketBuilder.ts:300`.
Records the post-rerank ordered file list the agent will see in `<relevant_code>`.

```jsonc
{
  "schemaVersion": 1,        // rankerHitsSchema.RANKER_SELECTION_SCHEMA_VERSION
  "sessionId": "abc123",     // Claude Code session ID
  "workspaceRoot": "C:/...", // absolute workspace root
  "ts": 1714300000000,       // Unix ms
  "files": [                 // post-rerank order; rank 0 = top file
    {
      "path": "src/main/foo.ts",  // relative to workspaceRoot
      "score": 124,
      "confidence": "high",
      "reasons": ["dirty_buffer", "git_diff"]
    }
  ],
  "totalFiles": 47           // files that entered the ranker (before budget pruning)
}
```

**`ranker.hit.v1` — emitted per session-end flush:**

Correlates pre-loaded files against Read tool calls observed during the session.
Emitted when `flushSession(sessionId)` is called from `hooksSessionHandlers.ts` on
session end.

```jsonc
{
  "schemaVersion": 1,      // rankerHitsSchema.RANKER_HIT_SCHEMA_VERSION
  "sessionId": "abc123",
  "ts": 1714300000000,
  "preLoadedCount": 10,    // files in the selection record
  "uniqueReadHits": 1,     // distinct pre-loaded paths that were Read
  "totalReads": 18,        // all Read tool calls in the session (including non-hits)
  "hitsByRank": [0,0,1,0,0,0,0,0,0,0], // 1=hit, 0=miss; index 0 = rank 1
  "sessionDurationMs": 84000
}
```

### Privacy

- File paths are stored relative to `workspaceRoot` only. Never absolute.
- No file contents are stored.
- Schema types are in `rankerHitsSchema.ts`. Dedup key: `sessionId` per record kind.

### Disabling telemetry

Set `contextRanker.telemetryEnabled` to `false` in config (default: `true`). When
disabled, `recordRankerSelection` and `noteReadDuringSession` and `flushSession` are
all no-ops — no file I/O occurs.

---

## Hit-rate metrics and their limits

### The metric ambiguity

The `<relevant_code>` block includes the **content** of each ranked file as a
snippet, not just the path. This means: if the agent needed the file's content and
the snippet was adequate, it will NOT issue a Read tool call. A "miss" in the
re-fetch sense may simply be a hit in the satisfaction sense.

The re-fetch rate (`uniqueReadHits / preLoadedCount`) answers a narrow question:
"did the agent re-fetch this file after seeing its snippet?" Low values could mean:

- The snippet was sufficient — the agent got what it needed without a full Read.
- The ranker chose unhelpful files — the agent went elsewhere for every lookup.

Both produce a re-fetch rate of 0%. They are not distinguishable from this metric
alone. This is why Phase A's 6.3% mean hit rate reads as "ranker is broken" under
one interpretation and "snippets are satisfying needs" under another. The truth is
that the 45.8% any-hit rate and the recall@k family are arguably more meaningful
baselines.

### The three primary metrics

**Re-fetch rate** (`uniqueReadHits / preLoadedCount`, per session):
- What it measures: snippet failure rate — did the snippet fail to satisfy the
  agent's need for this file?
- Narrow signal. Low values are ambiguous (see above). Treat as exploratory.

**Any-hit rate** (`anyHit ? 1 : 0`, per session, then averaged):
- What it measures: did the ranker surface at least one useful file?
- Less sensitive to snippet satisfaction ambiguity — a session where the agent Reads
  even one pre-loaded file likely means the ranker found a relevant file.
- Phase A: **45.8% any-hit rate** across n=24 sessions. The code bucket was 55.6%.
- The sanity-check baseline for ranker quality.

**Recall@k** (`fraction of top-k pre-loaded files that were Read`, per session):
- What it measures: among the first k ranks, how many did the agent re-Read?
- More discriminating than any-hit: tests whether the highest-ranked files are the
  relevant ones, not just whether any pre-loaded file was useful.
- Phase A recall@k (overall): @1 = 4.2%, @3 = 4.2%, @5 = 5.0%, @10 = 6.3%.
- The flat recall curve (barely rises from @1 to @10) indicates the right files are
  mostly not in the top 10 at all.
- **Recall@k is the primary metric for evaluating ranker quality.** Any-hit is the
  sanity check. Re-fetch rate is exploratory context.

### Computing metrics from the telemetry

The `ranker.hit.v1` records in `ranker-hits.jsonl` are descriptive, not
metric-specific. Any of the three metrics above can be computed from the raw fields:

```
re-fetch rate  = uniqueReadHits / preLoadedCount
any-hit        = uniqueReadHits > 0
recall@k       = sum(hitsByRank[0..k-1]) / k
```

Future analyses can apply different metrics over the same records. The record shape
does not bake in a particular metric choice.

---

## Auto-retrain (Wave 70 Phase A2)

The shadow-mode classifier (`contextClassifier.ts`) ships with hand-tuned bundled defaults
(`BUNDLED_CONTEXT_WEIGHTS`). At startup the IDE wires `startContextRetrainTrigger` —
which watches `<userData>` for `context-outcomes-*.jsonl` row growth and spawns
`tools/train-context.py` once 200 new outcomes accumulate (with a 5-minute cooldown).
Successful retrains hot-swap weights via `reloadContextWeights()` and log:

```
[context-ranker] retrain succeeded samples=N auc=0.xx version=<ISO>
```

**Config flag:** `contextRanker.autoRetrainEnabled` (default `true`). Toggle off as a
kill switch if the trainer misbehaves on a user's machine.

**Why this matters for the soak gate.** Without auto-retrain, the shadow-mode classifier
scores every chat session against `BUNDLED_CONTEXT_WEIGHTS` forever — Wave 31's soak
conditions (≥1000 outcomes + AUC > 0.75 + shadow-mode A/B overlap ≥80%) are unreachable
because no fresh AUC is ever produced. Phase A2 is the missing leg of that soak.

**Multi-file aware.** Both `countRows` (TS) and `load_jsonl` (Python) glob across all
date-rotated `context-{outcomes,decisions}-YYYY-MM-DD[.N].jsonl` files in the userData
directory. Pre-Wave-70 the trigger only saw a single canonical file that doesn't
exist post-Wave-29.5 (writers became date-rotated).

---

## Offline analysis (removed 2026-05)

The `analyze-ranker-hit-rate.ts` script set was deleted in 2026-05. Live
router signals (Wave 53 telemetry restoration, merged 2026-04-26) now drive
ranker tuning decisions instead of periodic corpus runs. Historical analysis
remains at `roadmap/archive/wave-53b-analysis.md` and `wave-53b-data.json`.

The interpretation thresholds below are preserved for context — if a future
analyzer is built, it should use the same rubric:

- Mean hit rate ≥ 70% → no change recommended.
- 40–70% → tune weight scheme; Phase C's variant is the right starting point.
- < 40% → redesign recommended; structural problem requires a new ranker architecture.

### Graduation path

**Hand-tuned → Bayesian weight optimization:**
When the unified corpus reaches ≥ 500 IDE-orchestrated sessions with hook-side Read
coverage AND an 80/20 train/holdout split is feasible without sample-starving either
side. The public interface (`contextRanker.mode`) stays the same; only the variant
module's internals change.

**Bayesian → Learning-to-rank:**
After Bayesian optimization plateaus AND graded relevance signals are instrumented
(Phase B's `hitsByRank` data is the natural seed — "agent dwelt on file" vs. "agent
moved on immediately" becomes the graded signal). Substantial implementation cost;
defer until signal warrants.

---

## Caveats

### Corpus bias at Wave 53b close

Phase A analyzed **24 sessions** (from 378 total JSONLs scanned; 51 had a
`<relevant_code>` block; 27 filtered as noise). That sample size is small enough
that a single outlier session moves the mean by ~4 percentage points.

The historical corpus is ~40% IDE-orchestrated. Wave 53a's parity infrastructure
does not retroactively augment historical sessions — the corpus bias is permanent
for the historical set. The bias direction is conservative: historical sessions
over-represent heavy editing workflows (where the ranker has a chance to shine) and
under-represent one-shot terminal chats (where the ranker is most useless). So the
6.3% mean is likely an over-estimate of what a fully unified corpus would show.

**The first authoritative re-run** is after a quarter of unified-corpus accumulation.
Until then, treat the Phase A decision ("REDESIGN") as directionally correct and
provisionally binding.

### Sample-size effect on per-bucket numbers

The code bucket (n=18) is small. The casual bucket (n=5) is dominated by individual
sessions — the 6.7% recall@3 for casual is a single outlier. Per-bucket numbers are
included for completeness; they should not be used to make bucket-specific weight
decisions until the corpus grows.

### Variant weights are exploratory

The tuned and experimental weight overrides are based on Phase A's directional
finding ("shift weight from text-match toward file-state signals") rather than on
validated A/B measurements. They may not improve recall@k in practice. The online
telemetry (Phase B) will accumulate mode-tagged data over time, enabling an honest
comparison.

### Snippet satisfaction vs. re-fetch rate

As described above, low re-fetch rate is ambiguous. The 6.3% re-fetch rate and the
45.8% any-hit rate are not contradictory — they measure different things. Future
redesign decisions should weight any-hit and recall@k more heavily than re-fetch rate.
