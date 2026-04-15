# Context Injection Overhaul

## 1. Research & Analysis

### Summary

The current context injection is a well-structured heuristic system with hard-coded weights and no feedback loop. It's comparable to Aider + Continue in architectural sophistication, but makes one assumption that's wrong for this workflow — it treats "recently edited" and "git diff" as high-signal, which they aren't when the agent does all the editing. The existing ML router pattern (JSONL decisions + quality signals + periodic Python retrain + hot-reload) is a near-perfect template to make context selection learned. No major IDE has shipped true LTR for context yet — real edge available.

### Current System Audit

**Entry point:** `src/main/orchestration/contextPacketBuilder.ts:335` `buildContextPacket()` → `selectContextFiles()` → `buildPacketFiles()` → `enrichPacket()` → serialized by `claudeCodeContextBuilder.ts:134`.

**Scoring** (`contextSelector.ts:61-76`, additive, uncapped):

| Signal | Weight |
|---|---|
| user_selected | 100 |
| pinned | 95 |
| included | 85 |
| dirty_buffer | 68 |
| **git_diff** | **56** |
| diagnostic | 52 |
| semantic_match | 45 (**declared but no active code path — dead weight**) |
| test_companion | 38 |
| **recent_edit** | **32** |
| keyword_match | 26+ |
| import_adjacency | 22+ |
| dependency | 12 |
| active_file / open_file | 0 (logged, zero weight) |

Confidence bucketing is arbitrary: high if score ≥80 OR has git_diff/diagnostic; medium if ≥35 or ≥2 reasons; low otherwise. Not calibrated against any outcome.

**Hotspots bug:** `graphQueryArchitecture.ts:63-75` filters with `isWorktreePath` regex `/(^|\/)(worktrees|\.worktrees)\//`. Stale nodes persist in `.ouroboros/graph.json` from an earlier index when `.claude` wasn't in `SKIP_DIRS`. Incremental reindex only clears nodes on `fs.access` failure — never on "path now matches skip rule." Stale nodes are immortal.

**No feedback loop** exists for context ranking. Weights are constants.

**Existing router** (`src/main/router/`): 19 features → logistic regression → HAIKU/SONNET/OPUS, quality signals (regeneration via Jaccard, correction prefixes, abort, post-session commit at 2/5min), JSONL logs joined by `traceId`, Python retrain at ≥50 new samples, hot-swap via `reloadWeights()`. Production-grade learned pipeline.

### Gap Analysis vs SOTA

| Axis | This IDE | SOTA |
|---|---|---|
| Retrieval signals | Heuristic weights, static imports | Cursor: trained embeddings; Aider: weighted PageRank over symbol graph; Windsurf: M-Query + RL-trained SWE-grep subagent |
| Re-ranking | None | Continue: cross-encoder; Cody: pointwise ranker (arXiv 2408.05344); Windsurf: RL |
| Learned selection | **None** | Cursor (trained embeddings on session traces), Windsurf SWE-grep (RL, F1 reward), Cody (pointwise) — nobody ships true accept/reject LTR |
| Recent-edit weighting when agent edits | Weighted 32 + git_diff 56 = **double-counts agent's own churn** | **Nobody handles this well.** Cursor Blame tracks provenance for attribution only, not retrieval. Open industry gap. |
| Stale index GC | Missing | Cursor: Merkle tree + 10min poll; Continue: content-hash keyed |
| Embeddings | None (semantic_match weight is dead code) | Nearly everyone |
| Symbol graph retrieval | Exists but only used for hotspots display | Aider's PageRank, Cody's RSG — retrieval primary |

**Biggest miss**: `semantic_match` weighted 45 but unwired, and the graph is used for a display widget instead of relevance scoring. Aider's entire value prop is PageRank over the same kind of graph.

### Key Sources

- Aider repo map algorithm (PageRank details): https://aider.chat/docs/repomap.html
- Cursor indexing: https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast
- Windsurf SWE-grep (RL for retrieval): https://cognition.ai/blog/swe-grep
- Cody context paper (pointwise ranker): https://arxiv.org/html/2408.05344v1
- Anthropic on context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- LTRR academic framework: arXiv:2506.13743

---

## 2. Spec Plan

### Architectural questions to answer first

1. **Edit provenance source of truth**: tag edits in `chatOrchestrationBridgeSend.ts` (agent writes) vs fs-watcher (user writes), or derive from post-hoc diff analysis? Recommend: tag at write-time in the agent pipeline; fs-watcher fallback for user edits outside IDE.
2. **Pre-inject vs tool-driven balance**: keep the large packet, or trim and let the agent pull via tools? Recommend: hybrid — keep pinned + PageRank repo map (~1-2k tokens), drop recent_edit noise.
3. **Reward signal timing**: join context decisions to tool-use outcomes synchronously (per-turn end) or async like router (2/5min post-session)? Recommend: per-turn — the agent's tool calls during the turn are the signal.

### Phase 0 — Scaffolding (shared contracts)

Define types and storage paths every later phase depends on.

**Build:**
- `src/main/orchestration/contextTypes.ts` (new): `ContextDecision`, `ContextFeatures` (graph centrality, pagerank score, keyword hits, symbol ref count, diagnostic proximity, file size, depth-from-seed, user_edit_recency_days, agent_edit_recency_days, is_test, is_generated, etc.), `ContextOutcome` (`used | unused | missed`), `EditProvenance = 'agent' | 'user' | 'unknown'`.
- Extend `SelectionReason` in `contextSelector.ts` with `provenance?: EditProvenance` and `pagerank_score?: number`.
- Storage paths constant: `{userData}/context-decisions.jsonl`, `{userData}/context-outcomes.jsonl`, `{userData}/context-retrained-weights.json`.
- `traceId` plumbing: thread the router's existing `traceId` into `buildContextPacket()` so context and routing decisions correlate.

**Modified vs new**: new types file; small additions to `contextSelector.ts`, `contextPacketBuilder.ts` signature.
**Acceptance**: `npx tsc --noEmit` clean; `traceId` present on every context packet; no behavior change.
**Risk**: none substantive.
**Size**: S.

### Phase 1 — Graph GC + stale node purge

Kill stale worktree hotspots at startup and on reindex.

**Build:**
- Modify `src/main/codebaseGraph/graphParserShared.ts`: export `isPathSkipped(path)` combining `SKIP_DIRS` + `isWorktreePath`.
- Modify `graphController` load path: on `loadFromDisk`, iterate nodes, drop any whose `filePath` matches `isPathSkipped` — log count purged.
- Modify `reindexSingleFile` to delete nodes when path now matches skip rule (currently only deletes on `fs.access` fail).
- One-time migration flag in `.ouroboros/graph.json` meta (`schema: 2`) so purge runs once per upgrade.

**Modified**: `graphParserShared.ts`, `graphController.ts`, `graphParser.ts`.
**Acceptance**: after upgrade + one session, `buildHotspots()` returns zero `.claude/worktrees/*` entries; unit test with synthetic worktree node verifies eviction.
**Risk**: overzealous purge deletes live nodes — mitigate with explicit allowlist-first approach + log diff of purged paths.
**Size**: S.

### Phase 2 — Edit provenance tagging

Know which edits the agent made vs the user, so recency signals stop double-counting.

**Build:**
- New `src/main/orchestration/editProvenance.ts`: in-memory ring buffer keyed by absolute path → `{ lastAgentEditAt, lastUserEditAt }`, persisted to `{userData}/edit-provenance.jsonl` (append-only, compacted on load).
- Hook agent writes: in the chat orchestration tool-call dispatch (where `Write`/`Edit`/`NotebookEdit` results come back), call `markAgentEdit(path)`.
- Hook user writes: extend existing `nativeWatcher.ts` to call `markUserEdit(path)` when no recent agent edit sits within a 2s window for that path.
- Expose `getEditProvenance(path)` to `contextSelector`.

**Modified**: `chatOrchestrationBridgeSend.ts`, `nativeWatcher.ts`, `repoIndexer.ts` (consumes provenance).
**Acceptance**: integration test simulates 1 agent edit + 1 user edit on same file, then queries provenance → both timestamps present. Manual: after a full agent-driven turn, no file has a `lastUserEditAt` within the last minute.
**Risk**: race between watcher and tool-call callback — the 2s debounce handles it but needs real-world validation.
**Size**: M.

### Phase 3 — Weight rebalance using provenance

Stop rewarding the agent's own churn.

**Build:**
- `contextSelector.ts`: split `recent_edit` into `recent_user_edit` (weight 32) and `recent_agent_edit` (weight 4). Split `git_diff` similarly — if all diff commits are agent-authored (detect via commit trailer `Co-Authored-By: Claude` or hook metadata), weight 12 instead of 56.
- Remove dead `semantic_match` weight (45) until Phase 5 wires it.
- Add unit tests for `scoreFile` covering pure-agent-edit, pure-user-edit, and mixed cases.

**Modified**: `contextSelector.ts`, `contextSelectorHelpers.ts`, new tests.
**Acceptance**: in a recorded all-agent session, `<relevant_code>` no longer promotes files the agent just touched unless they have other signals; golden-file test captures new ranking for 3 synthetic scenarios.
**Risk**: weights still hand-tuned — Phase 7 replaces them. Interim win.
**Size**: S.

### Phase 4 — PageRank repo map

Use the symbol graph for actual retrieval, Aider-style.

**Build:**
- New `src/main/codebaseGraph/graphPageRank.ts`: weighted personalized PageRank over existing node/edge store. Personalization vector = pinned files + symbol matches from user goal + diagnostic files. Cache results per (seed-set hash, graph-version) with 60s TTL sharing the same cache as `contextFingerprint`.
- Wire into `contextSelector.ts` as new reason `pagerank` (weight dynamic — normalized rank × 40). Returns top-N files not already in the set.
- Optional: expose `pagerank_score` in XML `<file>` attributes for observability.

**Modified**: `contextSelector.ts`, `graphController.ts` (version counter for cache invalidation).
**Acceptance**: on a target file rename, PageRank surfaces its top callers in `<relevant_code>` within one turn; benchmark test on repo's own graph completes <200ms.
**Risk**: performance on large graphs — mitigate with cache + early termination; deprioritize isolated-node self-loops (weight 0.1 like Aider).
**Size**: M.

### Phase 5 — Decision + outcome logging

Record what we chose and whether the agent actually used it.

**Build:**
- New `src/main/orchestration/contextSignalCollector.ts`: on packet build, emit `ContextDecision` lines (traceId, fileId, features, final score, included: bool).
- Per-turn outcome aggregator: subscribe to tool-call stream for the turn. When turn ends, emit `ContextOutcome` per file: `used` (Read/Edit target), `missed` (agent Read'd a file not in packet), `unused` (in packet, not touched).
- Append to `{userData}/context-decisions.jsonl` and `context-outcomes.jsonl`. Reuse `traceId` from Phase 0.
- Rotation: truncate at 10MB per file, matching router's pattern.

**Modified**: `chatOrchestrationBridgeSend.ts` (tool-call observation hook).
**Acceptance**: after a 5-turn conversation, JSONL files exist, line counts match turn count × candidate count for decisions, outcome types sum correctly; manual inspection of one traceId shows full round-trip.
**Risk**: tool-call observation in the bridge is the fragile bit — leverage existing logging hooks rather than re-instrumenting.
**Size**: M.

### Phase 6 — Haiku reranker

Cheap LLM rerank over top 30 → top 10 while learned model trains.

**Build:**
- New `src/main/orchestration/contextReranker.ts`: after `selectContextFiles`, if >15 candidates, call Haiku with file paths + 200-char snippet previews + user goal → JSON array of ranked paths. 500ms timeout, silent fallback to heuristic order.
- Gate behind config flag `contextRerankerEnabled` (default on).
- Feature-flag into `buildPacketFiles` before byte-budget enforcement.

**Modified**: `contextPacketBuilder.ts`, `config.ts` schema.
**Acceptance**: with flag on, top 10 `<relevant_code>` order changes vs flag off on same query; p95 added latency <800ms; flag-off path unchanged.
**Risk**: auth model — Max subscription, no API key. Must use the CLI `spawnClaude` pattern. Spike first.
**Size**: M, **spike required**.

### Phase 7 — Learned pointwise ranker

Replace hand-tuned weights with a logistic model trained on agent tool-use outcomes, reusing router infrastructure verbatim.

**Build:**
- New `tools/train-context.py`: mirrors `tools/train-router.py`. Joins `context-decisions.jsonl` ↔ `context-outcomes.jsonl` on `(traceId, fileId)`. Labels: `used`=1, `unused`=0, `missed`=synthetic negative for the included candidates that turn (or upweight recall). Trains pointwise logistic, outputs `context-retrained-weights.json`.
- New `src/main/orchestration/contextClassifier.ts`: mirrors `classifier.ts` — feature vector → sigmoid → relevance probability. Weights loaded at startup from `context-retrained-weights.json`, fallback to bundled defaults.
- New `src/main/orchestration/contextRetrainTrigger.ts`: mirrors `retrainTrigger.ts` — ≥200 new outcome lines → spawn Python → hot-swap via `reloadContextWeights()`.
- `contextSelector.ts` switches from additive weights to `contextClassifier.score(features)`. Old reasons kept as features, not scalars. Rerank (Phase 6) still runs on top-N.

**Modified**: `contextSelector.ts` (major), new scripts and modules.
**Acceptance**: with ≥1000 labeled samples, held-out AUC >0.75; hot-swap works without restart (verify via weight-version log line); old weight path still works when retrained file absent.
**Risk**: label noise (tool-use ≠ true relevance — agent may read irrelevant files to verify). Mitigate by weighting `Edit` > `Read` in reward.
**Size**: L.

### Phase 8 — Packet shape tuning

Shrink the packet toward tool-driven retrieval now that ranking is learned.

**Build:**
- A/B config: `contextPacketMode: 'full' | 'lean'`. Lean mode drops `<project_structure>`, caps `<relevant_code>` to top 6 files, keeps `<workspace_state>`, `<current_focus>`, PageRank repo map (~500 tokens), `<system_instructions>`.
- Default `lean` for new sessions after 2 weeks of observation.

**Modified**: `claudeCodeContextBuilder.ts`.
**Acceptance**: side-by-side comparison on 20 recorded sessions — `missed` rate (agent Reads something we cut) <5% in lean mode.
**Risk**: regression on complex multi-file tasks — keep `full` available as override.
**Size**: S.

### Phase 9 — Migration / cleanup

Retire dead code and document the new system.

**Build:**
- Remove `semantic_match` reason entirely (replaced by PageRank + classifier).
- Remove `active_file` / `open_file` zero-weight reasons.
- Delete old `REASON_WEIGHTS` constant once classifier is default-on for 1 release.
- Add `docs/context-injection.md` covering the full pipeline.
- Update `CLAUDE.md` "Known Issues" section.

**Acceptance**: knip reports no dead exports in `orchestration/`; docs reviewed; one full release cycle has passed since Phase 7 cutover.
**Size**: S.

### Suggested ordering

- **Sprint 1**: Phase 0 → Phase 1 → Phase 2 (sequential; Phase 2 blocks 3).
- **Sprint 2**: Phase 3 + Phase 4 in parallel (independent).
- **Sprint 3**: Phase 5 + Phase 6 in parallel (6 needs spike first).
- **Sprint 4+**: Phase 7 after ≥1000 samples accumulate from Phase 5.
- **Sprint 5**: Phase 8, then Phase 9.

Total: ~2 S + 4 M + 1 L + cleanup. Realistic solo-agent pace: 3–4 weeks to Phase 6 shipped, Phase 7 gated on data volume.

---

## 3. Scope Split — Parallel Work Packages

### Phase 0 (sequential) — Shared contracts

Owner: one agent, must complete before any parallel work.

**Files created:**
- `src/main/orchestration/contextTypes.ts` (new) — `ContextDecision`, `ContextFeatures`, `ContextOutcome`, `EditProvenance` types; storage path constants.

**Files modified (minimal signature changes only):**
- `src/main/orchestration/contextSelector.ts` — extend `SelectionReason` with optional `provenance` + `pagerank_score` fields. Do not change logic.
- `src/main/orchestration/contextPacketBuilder.ts` — add `traceId` parameter to `buildContextPacket()`, thread from caller.
- `src/main/agentChat/chatOrchestrationBridgeSend.ts` — pass existing router `traceId` into context builder.

**Acceptance:** `tsc --noEmit` clean, no behavior change. Every downstream package imports from `contextTypes.ts`.

### Parallel batch 1 (can start after Phase 0)

**Package A — Graph GC (Phase 1)**
- Files owned:
  - `src/main/codebaseGraph/graphParserShared.ts` (modify — export `isPathSkipped`)
  - `src/main/codebaseGraph/graphController.ts` (modify — add startup purge)
  - `src/main/codebaseGraph/graphParser.ts` (modify — reindex eviction)
  - `src/main/codebaseGraph/graphController.test.ts` (new)
- Inputs: none beyond Phase 0.
- Outputs: clean graph store; no API surface change.
- Scope: S.

**Package B — Edit provenance tracking (Phase 2)**
- Files owned:
  - `src/main/orchestration/editProvenance.ts` (new)
  - `src/main/orchestration/editProvenance.test.ts` (new)
  - `src/main/nativeWatcher.ts` (modify — user-edit callback)
  - `src/main/agentChat/chatOrchestrationBridgeSend.ts` (modify — agent-edit hook)
- Inputs: `EditProvenance` type from Phase 0.
- Outputs: `getEditProvenance(path)` consumed by Package E.
- Scope: M.
- Coordination: Phase 0 already touches `chatOrchestrationBridgeSend.ts` for `traceId`. Batch Package B after Phase 0 merges to avoid conflict on that file.

**Package C — Haiku reranker spike + impl (Phase 6)**
- Files owned:
  - `src/main/orchestration/contextReranker.ts` (new)
  - `src/main/orchestration/contextReranker.test.ts` (new)
  - `src/main/config.ts` (modify — add `contextRerankerEnabled` flag)
  - `src/renderer/types/electron.d.ts` (modify — expose flag if user-configurable)
- Inputs: Phase 0 types; existing `spawnClaude` CLI pattern (no new shared files).
- Outputs: `rerankCandidates(candidates, goal) → candidates` function, unused until Package F wires it.
- Scope: M, **spike auth first** (Max subscription, no API key).
- Isolation: does not modify `contextPacketBuilder.ts` or `contextSelector.ts`.

**Package D — PageRank engine (Phase 4, compute only)**
- Files owned:
  - `src/main/codebaseGraph/graphPageRank.ts` (new)
  - `src/main/codebaseGraph/graphPageRank.test.ts` (new)
- Inputs: reads `graphController` API (no modifications).
- Outputs: `computePageRank(seedFiles) → Map<path, score>` consumed by Package E.
- Scope: M.
- Conflict risk: Package A touches `graphController.ts`. D only reads — no file overlap. D must rebase after A if A changes `getNodesByType` signature (unlikely).

### Parallel batch 2 (after batch 1)

**Package E — Scoring integration (Phases 3 + 4 wiring)**
- Files owned:
  - `src/main/orchestration/contextSelector.ts` (modify — split `recent_edit`, drop `semantic_match`, consume PageRank + provenance)
  - `src/main/orchestration/contextSelectorHelpers.ts` (modify — scoring)
  - `src/main/orchestration/contextSelector.test.ts` (new/extend)
- Depends on: Packages B (provenance) + D (PageRank).
- Scope: M.

**Package F — Packet builder integration (Phase 6 wiring)**
- Files owned:
  - `src/main/orchestration/contextPacketBuilder.ts` (modify — invoke reranker between select and byte-budget)
- Depends on: Package C (reranker function).
- Scope: S.
- Conflict risk: `contextPacketBuilder.ts` was touched in Phase 0. F runs after Phase 0 merges; no other batch-2 package touches this file.

### Parallel batch 3 (after batch 2 — data must flow first)

**Package G — Decision + outcome logging (Phase 5)**
- Files owned:
  - `src/main/orchestration/contextSignalCollector.ts` (new)
  - `src/main/orchestration/contextSignalCollector.test.ts` (new)
  - `src/main/orchestration/contextPacketBuilder.ts` (modify — emit decisions)
  - `src/main/agentChat/chatOrchestrationBridgeSend.ts` (modify — tool-call outcome observer)
- Scope: M.
- Conflict note: touches two files earlier packages modified. Run **after F merges** to serialize `contextPacketBuilder.ts` edits. `chatOrchestrationBridgeSend.ts` collisions with Package B resolved by then.

**Package H — Lean packet mode (Phase 8)**
- Files owned:
  - `src/main/orchestration/providers/claudeCodeContextBuilder.ts` (modify)
  - `src/main/config.ts` (modify — `contextPacketMode` flag; run after C merges)
- Scope: S.
- Can run in parallel with G — no file overlap with G.

### Batch 4 (data-gated, not time-gated)

**Package I — Learned ranker (Phase 7)**
- Gate: requires ≥1000 outcome samples from Package G in production. Do not schedule until telemetry shows threshold.
- Files owned:
  - `tools/train-context.py` (new)
  - `src/main/orchestration/contextClassifier.ts` (new)
  - `src/main/orchestration/contextRetrainTrigger.ts` (new)
  - `src/main/orchestration/contextSelector.ts` (modify — swap additive weights for classifier)
  - tests colocated
- Scope: L.
- Sequential — no parallel partner; modifies `contextSelector.ts` which Package E also owns (must land after E).

### Integration (sequential, at end)

**Package J — Cleanup (Phase 9)**
- Files owned:
  - Remove dead reasons in `contextSelector.ts` (after I soaks)
  - `docs/context-injection.md` (new)
  - `CLAUDE.md` (modify — Known Issues update)
- Scope: S.

### Conflict matrix (files touched by >1 package)

| File | Packages | Resolution |
|---|---|---|
| `contextSelector.ts` | Phase 0 (signature only), E, I | Strictly serial: 0 → E → I |
| `contextPacketBuilder.ts` | Phase 0 (signature), F, G | Serial: 0 → F → G |
| `chatOrchestrationBridgeSend.ts` | Phase 0, B, G | Serial: 0 → B → G |
| `config.ts` | C, H | Serial within batch 3: C → H |
| `graphController.ts` | A only | clean |

No two packages in the same batch touch the same file.

### Summary

```
Phase 0 (sequential): contextTypes.ts + traceId plumbing + reason field extensions

Parallel batch 1:
  A (graph GC)       — graphParser*, graphController
  B (provenance)     — editProvenance + nativeWatcher + bridge hook
  C (reranker)       — contextReranker + config flag
  D (pagerank)       — graphPageRank (pure compute)

Parallel batch 2:
  E (scoring)        — contextSelector (consumes B + D)
  F (packet wiring)  — contextPacketBuilder (consumes C)

Parallel batch 3:
  G (logging)        — contextSignalCollector (after F)
  H (lean mode)      — claudeCodeContextBuilder + config (after C)

Data gate (≥1000 samples from G):
  I (learned ranker) — train-context.py + contextClassifier (sequential, modifies E's file)

Integration:
  J (cleanup + docs)
```

**Caveat:** The ranker (I) is inherently sequential with E because both rewrite `contextSelector.ts` scoring logic. Don't force parallelism there — merge hell guaranteed. Everything else splits cleanly.
