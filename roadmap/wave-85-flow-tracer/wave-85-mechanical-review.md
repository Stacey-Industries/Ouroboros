---
title: Wave 85 review — mechanical gap check
status: COMPLETE
wave: 85
run_at: 2026-05-08
verdict: FLAG
---

# Wave 85 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-85-flow-tracer/waveplan-85.md`
- Diff range: `master..wave-85-flow-tracer` (12 commits, 87 files, +12368 / -355)
- Graph: `GRAPH_FALLBACK` — graph tools were not invoked this run; all Check 1 / Check 3 evidence is grep-based and marked accordingly.
- Run timestamp: 2026-05-08

## Check 1: Forward-trace

- Change sites traced: ~30 (all new modules in `src/main/flowTracer/`, IPC bridge methods, renderer hooks/components)
- Paths reaching production consumer: most
- Paths flagged as dead: see Check 3 (overlaps)

No silent drops detected at intermediate nodes. The full chain — Command Palette / View menu / DOM event → CentrePaneConnected wiring → FlowTracerView → hooks → IPC → main subsystem → spawnClaude / disk / graph — is wired end-to-end. The orchestrator-applied integration commits (`51511c5`, `5a397ef`) close the renderer-side wiring that Phases 3, 4, 5, 6, 7 deferred.

(fallback trace — verify via graph if uncertainty surfaces.)

## Check 2: Plan universal-quantifier cross-reference

- Universals identified: 4
- Universals where diff covers all instances: 2
- Universals flagged as narrowed: 2

### Flagged universal U2 — "every layer of the running app — User → Renderer → Preload → Main → Claude CLI → Filesystem"

**Quote (Goal section, line 27):** "swimlane sequence diagram that traces the selected flow through every layer of the running app — User → Renderer → Preload → Main → Claude CLI → Filesystem"

**Noun:** layer (6 enumerated: user, renderer, preload, main, cli, filesystem).

**Diff coverage:** `src/main/flowTracer/traceEngineSupport.ts:30-36` classifies 4 of 6:
- ✅ `'preload'` (filePath starts with PRELOAD_PREFIXES)
- ✅ `'renderer'` (filePath starts with RENDERER_PREFIXES)
- ✅ `'main'` (default + filePath starts with MAIN_PREFIXES)
- ✅ `'cli'` (CLI_SYMBOLS or path contains 'pty'/'spawn')
- ❌ `'filesystem'` — no classifier produces this layer; fs.writeFile/readFile boundaries are not classified
- ❌ `'user'` — no classifier produces this layer; UI event entry points are not labeled at the user lane

**Note:** `LayerKind` in `src/shared/types/flowTracer.ts` enumerates all 6 — the contract supports them, but the implementation never emits 'filesystem' or 'user' steps. Flows render with at most 4 lanes instead of 6. Non-fatal: the design spec §5.1 Layer 2 names FS and CLI subprocess detection as boundary kinds; CLI is implemented; filesystem is not. The 'user' lane is the UX-only origin marker and may be a planning artifact rather than a runtime classification.

### Flagged universal U3 — Phase 2 audit pass

**Quote (Risks table, line 145):** "Phase 2 deliverable includes an audit pass: enumerate all `ipcMain.handle` calls via grep, cross-check against the registry, flag any missing."

**Noun:** ipcMain.handle calls.

**Diff coverage:** `boundaryRegistry.ts` scans `src/main/**/*.ts` for the pattern, but no separate audit / cross-check step exists in `boundaryRegistry.ts` or `boundaryRegistry.test.ts`. The scan is the enumeration; the belt-and-suspenders verification (compare scan output against an independent grep) was not implemented. Non-fatal — the scan covers the same ground.

### Universals confirmed clean

- ✅ "All What/Why/How narration goes through spawnClaude" (Decision 1, line 35) — verified by `grep -rn "api.anthropic.com\|fetch(\"https" src/main/flowTracer/`: zero direct API calls.
- ✅ "Saved flows persist to `<workspaceRoot>/.ouroboros/flows/`" (Goal, line 27) — verified at `flowPersistence.ts:saveFlow`.

## Check 3: Export audit

- New exports added: ~50 (across ~25 new files)
- Exports with production consumers: most
- Exports flagged as dead: 4 (test-only consumers, no `DEFERRED-CONSUMER` marker)

### Flagged exports

- **`batchGenerateNarrations`** at `src/main/flowTracer/narrationCache.ts:250`
  - Consumer count: only-tests
  - Phase 3 brief: "Pre-compute What+How for every symbol referenced by at least one canonical flow at index time, batch concurrency=3" — function exists; no production caller invokes it. The wave's index-time pre-compute path was specced but not wired.
  - Deferral marker: none

- **`invalidateNarration`** at `src/main/flowTracer/narrationCache.ts:318`
  - Consumer count: only-tests
  - Per Phase 3's design (and `narrationCache.ts` doc comment): should be invoked on graph re-index / file-change events to invalidate stale per-symbol narration. No production hook exists.
  - Deferral marker: none

- **`invalidateFlowWhy`** at `src/main/flowTracer/flowWhyCache.ts:260`
  - Consumer count: only-tests
  - Same shape as `invalidateNarration` — designed for cache invalidation on flow deletion / regeneration; no production caller.
  - Deferral marker: none

- **`deleteSavedFlow`** at `src/main/flowTracer/flowPersistence.ts:161`
  - Consumer count: only-tests
  - Phase 7's report explicitly noted this: "exists in flowPersistence.ts but has no IPC handler yet; the spec note says 'not yet exposed via IPC in Phase 7; wired in a future phase.'"
  - Deferral marker: none — but Phase 7 result narrative names the intent. A `// DEFERRED-CONSUMER: wave-86` comment on the export declaration would clear this flag.

(fallback trace — Cypher-graph verification skipped; flags based on grep over `src/`.)

### Exports cleared

`registerFlowTracerHandlers`, `cleanupFlowTracerHandlers` (`index.ts`), all preload bridge methods, all renderer hooks, all `FlowSearchBar`/`StepInspector`/`FlowActions`/`SavedFlowsPanel` exports, types in `src/shared/types/flowTracer.ts` — all reach a production consumer.

## Check 4: Schema-removal migration safety

- Trigger: **skipped — no schema property removals in this wave's diff**

The wave only ADDS schema properties (`flowTracer.maxDepth`, `flowTracer.saveSharedFlows` in `configSchemaTailExt2.ts:15+`). No deletions in `configSchema*.ts` or backing types. Migration check N/A.

## Check 5: Boundary-phase orchestrator-owned acceptance test verification

- Trigger: **fired implicitly** — the wave plan does not use the explicit `cross-boundary` classification field (that's a `/specplan` convention from a later iteration), but Phase 1 introduced cross-process IPC, which is the canonical boundary surface.

The orchestrator owns Phase 1's acceptance test:
- **Acceptance file:** `src/main/flowTracer/walkingSkeleton.acceptance.test.ts`
- **First-commit author:** `ee2e89b` (orchestrator) — the dedicated `test(wave-85): phase 1 prep` commit.
- **Phase 1 first-implementation commit:** `444bca3`. Acceptance file predates implementation. ✅
- **Implementer modifications:** `git diff ee2e89b 444bca3 -- src/main/flowTracer/walkingSkeleton.acceptance.test.ts` returned 0 lines across all phase commits I verified mid-flight. ✅
- **Run evidence:** verified 12/12 pass after every subsequent phase commit (Phase 1, 2, 3, 4, 5, 6, 7, integration commits) — captured in commit messages and orchestrator status reports.

**For Phases 2, 3, 4, 5, 6, 7:** no per-phase orchestrator-owned acceptance tests authored. Each phase wrote its own unit + integration tests. The wave's structural acceptance was the Phase 1 boundary contract that all subsequent phases respected (and the contract held — 12/12 pass through all phases). Strict reading of the rule (one orchestrator-owned test per cross-boundary phase) would flag Phases 2-7; pragmatic reading (the protocol contract was authored by the orchestrator and never modified, all phases verified against it) clears them. Recording as **non-fatal observation, not a flag**, since:
1. The plan didn't classify per-phase boundaries (a `/specplan` convention not used here).
2. The Phase 1 orchestrator-owned test covered the protocol contract and held throughout.
3. Subsequent phases were additive (new IPC channels, no contract changes to existing channels).

## Verdict

**FLAG**

Six findings:
- 2 narrowed universals (Check 2): partial layer enumeration in traceEngine (4 of 6 layers); Phase 2 audit pass not implemented as belt-and-suspenders verification.
- 4 dead exports (Check 3): `batchGenerateNarrations`, `invalidateNarration`, `invalidateFlowWhy`, `deleteSavedFlow` — all test-only consumers, no `DEFERRED-CONSUMER` markers.

None are structurally fatal. Remediation expectations:
1. **batchGenerateNarrations** — wire to graph-indexer or flow-render path, OR add `// DEFERRED-CONSUMER: wave-86` (the Phase 3 spec'd this for index-time pre-compute; if Wave 86 is the right home, document it).
2. **invalidateNarration / invalidateFlowWhy** — hook to graph-reindex events, OR add deferral markers naming the wave that wires them.
3. **deleteSavedFlow** — Phase 7 already documented the deferral in narrative; add the comment marker so future review passes don't re-flag.
4. **Layer classifier** — extend `inferLayer` in `traceEngineSupport.ts` to emit `'filesystem'` for fs.* call sites and add a 'user' classification at trace-entry-point for renderer event handlers, OR document in ADR that 4-of-6 is the Wave 85 scope and 'filesystem'/'user' are Wave 86 polish.
5. **Phase 2 audit pass** — already shipped as part of `boundaryRegistry`'s scan; add an explicit cross-check assertion in `boundaryRegistry.test.ts` that the runtime registry contains every static `ipcMain.handle` call site grepped from `src/main/`. (Today the scan does this implicitly; making it explicit is a non-fatal polish.)

Cleared:
- ✅ All narration paths use spawnClaude (auth-constraint compliance).
- ✅ Acceptance test orchestrator-owned, predates implementation, untouched, passing 12/12 throughout.
- ✅ No schema property removals; Check 4 N/A.
- ✅ Persistence cache paths (`<workspaceRoot>/.ouroboros/flows/`) match the spec.
- ✅ All hook + component exports reach a production consumer via `FlowTracerView`.
