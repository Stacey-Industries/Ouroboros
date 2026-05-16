# Wave 19 — Context Scoring: PageRank & Provenance-Aware Weights
## Implementation Plan

**Version target:** v1.5.0 (minor — context quality improvement)
**Feature flags:** `context.provenanceWeights` (default `true`) + `context.pagerank` (default `true`)
**Upstream dependencies:** Wave 18 (EditProvenanceStore interface + `getEditProvenance(path)`)
**Unblocks:** Wave 24 (decision logging consumes `pagerank_score` from `ContextFeatures`)

---

## 1. Architecture Overview

### Part 1 — Weight Rebalance (provenance-aware)

`contextSelector.ts` currently has a single `recent_edit` (weight 32) and `git_diff` (weight
56). Wave 18 delivered `getEditProvenanceStore()?.getEditProvenance(path)` returning
`{ lastAgentEditAt, lastUserEditAt } | null`.

**Split `recent_edit`:**
- `recent_user_edit` → weight 32 (promotes files the user touched)
- `recent_agent_edit` → weight 4 (deprioritizes agent churn)

Detection: if `lastUserEditAt > lastAgentEditAt && lastUserEditAt > 0` → user edit.
If `lastAgentEditAt > 0` and no more-recent user edit → agent edit.
If provenance unavailable → fall back to existing `recent_edit` weight (32) for safety.

**Split `git_diff`:**
- Agent-authored diff (all commits carry `Co-Authored-By: Claude` trailer, or the file
  has `lastAgentEditAt > 0` with no more-recent user edit) → weight 12
- Otherwise → weight 56 (unchanged)

Commit-trailer detection reads `repoFacts.gitDiff.changedFiles[].hunks` or commit messages
if available. Provenance store is the fast path (no git I/O).

**Remove `semantic_match`:**
Set weight to 0. No active call site uses it (confirmed by grep — only the weight map
and the shared `ContextReasonKind` type reference it). Add comment: `// removed — no
active code path; see Wave 40 for planned replacement`.

**Seed vector for PageRank (Q10 rec):**
`0.5 × pinned + 0.3 × symbol-match (keyword_match) + 0.2 × recent-user-edit`.
Weights exposed via `PageRankOptions.seedWeights` (tunable at runtime / A/B).

### Part 2 — PageRank Repo Map

New `src/main/codebaseGraph/graphPageRank.ts`:
- `computePageRank(db, options): Map<symbolId, number>` — iterative weighted personalized
  PageRank over the System 2 graph DB.
- Personalization seed vector built from `options.seedNodeIds` (pinned + keyword + user-edit).
- Isolated self-loops deprioritized: weight 0.1 (Aider convention).
- Cache keyed by `hash(seedSet + graphVersion)` with 60 s TTL.
- Exported `PageRankOptions` type with tunable `seedWeights` and `dampingFactor`.

Wire into `contextSelector.ts`:
- After `addRepoFactCandidates`, call `computePageRank` if feature flag is on.
- New reason `pagerank` with `weight = normalizedRank × 40`.
- Returns top-N files not already in candidate set.
- File-level PR score is max of per-symbol scores for files matching that candidate.

---

## 2. File-by-File Breakdown

### New files

| File | Approx lines | Notes |
|------|-------------|-------|
| `src/main/codebaseGraph/graphPageRank.ts` | ~195 | PageRank engine, cache, types |
| `src/main/codebaseGraph/graphPageRank.test.ts` | ~150 | Convergence, seed ablation, cache, isolated-node, benchmark |

### Modified files

| File | Delta | Change |
|------|-------|--------|
| `src/main/orchestration/contextSelector.ts` | +35 / -3 | Weight split + pagerank integration |
| `src/main/orchestration/contextSelectorProvenance.ts` | +60 (new helper) | Provenance weight resolution extracted here |
| `src/main/orchestration/contextSelector.test.ts` | +80 | Provenance + diff-trailer + pagerank cases |
| `src/main/configSchemaTail.ts` | +22 | `context.provenanceWeights`, `context.pagerank`, `context.pagerankSeeds` |
| `src/main/config.ts` | +8 | `AppConfig.context` interface + `ContextScoringSettings` type |
| `src/shared/types/orchestrationDomain.ts` | +3 | Add `recent_user_edit`, `recent_agent_edit`, `pagerank` to `ContextReasonKind` |

---

## 3. Phase Sequencing

### Phase A — Type extensions

1. Extend `ContextReasonKind` in `src/shared/types/orchestrationDomain.ts`.
2. Add `ContextScoringSettings` + `AppConfig.context` in `config.ts`.
3. Add schema entries to `configSchemaTail.ts`.

### Phase B — PageRank engine

4. Create `graphPageRank.ts` with `computePageRank`, `PageRankOptions`, cache.
5. Create `graphPageRank.test.ts`.

### Phase C — Provenance helper + selector integration

6. Create `contextSelectorProvenance.ts` — `resolveEditReasonKind` + `isDiffAgentAuthored`.
7. Update `contextSelector.ts` — wire weight split + `pagerank` reason.
8. Update `contextSelector.test.ts` — new cases.

---

## 4. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| PageRank diverges on cyclic graphs | Damping factor 0.85 + max 50 iterations with convergence threshold |
| DB read on hot path | Cache with 60 s TTL keyed by graph version + seed hash |
| Isolated nodes get over-promoted | Self-loop weight 0.1 per Aider convention |
| Provenance unavailable (pre-Wave 18) | Fall back to `recent_edit` weight (32) — no regression |
| `semantic_match` still in `ContextReasonKind` | Weight set to 0; union type preserved for Wave 40 |

---

## 5. Testing Strategy

- **PageRank**: 5-node DAG with known rank order; assert convergence < 50 iterations.
- **Seed ablation**: vary `seedWeights` and assert direction of rank changes.
- **Cache**: same inputs → cache hit; different graph version → cache miss.
- **Isolated node**: node with only a self-loop gets score ≈ 0.1 × damping.
- **Benchmark**: 100-node synthetic graph completes < 200 ms.
- **Provenance weights**: pure-agent-edit path → score 4; pure-user-edit → 32; mixed →
  highest-priority (user) wins.
- **Diff-trailer detection**: commit with `Co-Authored-By: Claude` → weight 12; without → 56.

---

## 6. Cross-Wave Stability Commitments

| Artifact | Consumed by |
|----------|-------------|
| `ContextReasonKind` + `recent_user_edit` / `recent_agent_edit` / `pagerank` | Wave 24 decision logging |
| `PageRankOptions.seedWeights` | Wave 31 (learned ranker replaces hand-tuned seeds) |
| `context.pagerank` / `context.provenanceWeights` flags | Wave 31 (flag removal after learned ranker ships) |
| `pagerank_score` in `ContextFeatures` (already typed in `contextTypes.ts`) | Wave 24 `context_decisions` table |

---

## 7. Rollback Plan

- Both feature flags default on but are independently switchable.
- Setting `context.provenanceWeights = false` restores the pre-Wave-19 `recent_edit` /
  `git_diff` weights exactly.
- Setting `context.pagerank = false` skips the PageRank call entirely — zero performance
  impact and no score change for existing candidates.
