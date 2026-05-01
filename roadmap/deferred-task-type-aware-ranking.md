# Deferred — Task-Type-Aware Repo-Map Ranking

**Status:** DEFERRED · proposed during Wave 69 planning · awaiting future investigation.
**Owner:** unassigned. Pick up when an agent has time for original research; not blocking other work.

---

## What this is

A speculative improvement to the contextLayer's repo-map ranking: condition module-importance ranking on the inferred *type* of the user's current task (refactor / bug-fix / navigation / new-feature / explainer) rather than using the same ranking signals for all tasks.

Concretely, the idea is:

| Task type | Ranking weight should favor |
|---|---|
| Refactor | High-cohesion modules, modules with strong boundaries (Option B/C signals) |
| Bug fix | Recently-changed modules, modules with high diagnostic count, blast-radius-adjacent modules |
| Navigation / explain | High PageRank (load-bearing) modules, entry-point modules |
| New feature | Modules in the import-adjacency frontier of touched files |
| Onboarding | Architecture-overview modules; suppress noisy implementation-detail modules |

The existing `contextInjector.selectRelevantModules` is already half of this (file-overlap + keyword + dependency + recently-changed). What's missing is a *task classifier* upstream that produces a task-type label, and a ranking-weight switch downstream that uses the label.

## Why this is deferred (per Wave 69 ADR)

1. **No published precedent.** Aider's PageRank is static. Cursor's RAG is semantic-only. Continue.dev follows Aider. No major agentic coding tool publishes adaptive ranking by task type as of 2026-04. Being first means we'd be researching, not consuming.
2. **Marginal value uncertain.** The existing goal-conditioned selection already covers the bulk of what task-type ranking would add — file-overlap and keyword matching naturally surface the right modules for most tasks.
3. **Adds a classifier component.** A task-type classifier is its own engineering surface (LLM-based? rule-based? confidence threshold? failure mode?). That's a separate non-trivial design.
4. **Wave 69 already substantial.** Wave 69 covers items 1+2+3+5 from the original 6-item improvement list. Adding item 6 inflates scope past the wave's natural boundary.

## What a future investigation should do

A proper investigation needs more than just "implement it" — it needs evidence that the approach actually beats the simpler baseline. Recommended phases:

**Phase A — Literature + competitive review.**
- Has anyone published task-type-aware ranking by 2026? Re-search Aider, Continue, Cursor, Cline release notes; arXiv code-LLM papers; engineering blog posts. State of the art may have moved.
- If precedent exists, document the classifier + weighting scheme(s).

**Phase B — Telemetry-driven baseline.**
- Before changing ranking, instrument the current `contextInjector` to log: which modules were selected, which were ranked but cut, and (post-task) which files the agent actually edited or read.
- Compute hit-rate: fraction of edited files that came from the top-K selected modules. This is the baseline to beat.
- Without this baseline, "task-type ranking improves things" is unfalsifiable.

**Phase C — Classifier design.**
- Rule-based starting point: keyword match on the user's prompt (`refactor`, `fix`, `bug`, `navigate`, `explain`, `add feature`). Cheap, predictable, no LLM call.
- LLM-based fallback only if rule-based misses meaningfully often.
- Confidence threshold: when the classifier is unsure, fall back to current static weights — don't roll the dice.

**Phase D — A/B comparison.**
- Run task-type ranking against the current baseline on a corpus of real task transcripts (telemetry/JSONLs).
- Metric: hit-rate improvement, plus a regression check (no task type should be *worse* than baseline).
- If improvement is < 5% absolute, conclude "not worth the complexity" and document negative result.

**Phase E — Implement only if Phase D is positive.**
- Add classifier as an optional preprocessor in `contextInjector`.
- Per-task-type weight tables for `selectByFileOverlap`, `selectByKeyword`, `selectByDependencyAdjacency`, `backfillRecentlyChanged`.
- Feature-flag the whole thing; default off until telemetry confirms it's not a regression in the wild.

## Where the relevant code lives

- `src/main/contextLayer/contextInjector.ts` — current goal-conditioned selection. The natural extension point.
- `src/main/contextLayer/contextLayerController.ts` — owns the per-task `enrichPacket` call where a classifier would slot in.
- Telemetry: `src/main/telemetry/` — existing telemetry framework for hit-rate logging.

## What to bring back when picking this up

- Whether the literature has moved (someone may have published this between now and the future date).
- Whether telemetry exists or needs to be added first (Phase B precondition).
- Current state of `contextInjector` — the surface may have evolved post-Wave-69.
- An honest answer to "is the simpler baseline already good enough?" — if hit-rate is already 80%+, the headroom for adaptive ranking is small.

## Success criteria for any future implementation

- Hit-rate improves on at least 3 out of 5 task types vs. baseline, in a corpus of ≥100 real task transcripts.
- No task type regresses by more than 2 percentage points vs. baseline.
- Classifier latency is < 50 ms median (rule-based) or behind a feature flag (LLM-based).
- Failure mode for ambiguous classification is "fall back to baseline" — never "best guess and hope".

If any of those bars aren't met, conclude as a negative result and close the deferred entry rather than ship the worse approach.
