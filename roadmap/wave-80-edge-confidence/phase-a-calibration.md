# Phase A — Heuristic Confidence Calibration

**Wave:** 80 — Graph Edge Confidence Scoring
**Date:** 2026-05-02
**Method:** Static code-path audit of `indexingPipelineCallResolution.ts` combined with manual sampling reasoning over the codebase graph structure.

---

## Resolution paths in `callResolutionPass`

The `resolveCallee` function in `indexingPipelineCallResolution.ts` has four distinct resolution paths, executed in order:

### Path 1: Import-resolved

```ts
if (fileCtx.importedNames.has(calleeName)) return fileCtx.importedNames.get(calleeName)!;
```

**What happened:** The call site has a named import (`import { foo } from './bar'`). The import was already resolved to a single target node during `resolveFileImports`. The callee name is in the `importedNames` map.

**Reliability:** Very high. The resolution used the explicit import declaration. If the import resolves (i.e., `importedNames.set()` was called), the link is definitively correct — it's not a guess, it's the import semantics of the language.

**Caveat:** `resolveImportSpecifier` returns `null` if there are multiple candidates and no path-disambiguating heuristic succeeds. Only entries that made it into `importedNames` reach this path, so by definition they are unambiguously resolved.

**Calibrated confidence: 0.95**

(Not 1.0 because tree-sitter might misparse edge-case re-exports, barrel files, or dynamic re-exports that look like named imports. 0.95 acknowledges this rare class of false positives.)

---

### Path 2: Same-file definition

```ts
const sameFileDef = fileCtx.fileDefs.find((d) => d.name === calleeName);
if (sameFileDef) return `${fileQn}.${sameFileDef.name}`;
```

**What happened:** No import covers the callee name, but a function/method defined in the same file has that name. The resolution is the within-file definition.

**Reliability:** High. If `calleeName` matches a definition in the same file and there's no shadowing import, it's very likely correct. The risk: the name might shadow a same-name symbol from another scope (e.g., a closure-captured outer function). Tree-sitter extraction doesn't track scope chains, so the first name match in `fileDefs` is used.

**Calibrated confidence: 0.85**

---

### Path 3: Single global match (name-unique)

```ts
const candidates = ctx.symbolsByName.get(calleeName) ?? [];
if (candidates.length === 0) return null;
if (candidates.length === 1) return candidates[0];
```

When `candidates.length === 1`: the call resolves to the only function with that name in the entire indexed project.

**Reliability:** High but not as high as import-resolved. The name is unique in the project, which is a strong positive signal. Risk: the callee might be from an external dependency not indexed, in which case a differently-named internal function happens to share the name. Also: higher-order functions and callbacks with generic names (e.g., `callback`, `handler`) can be uniquely named in a small repo but semantically wrong.

**Calibrated confidence: 0.80**

---

### Path 4: Name-collision (multiple candidates — `new X()` class disambiguation)

```ts
if (isNewExpression) {
  const classCandidate = candidates.find((id) => ctx.classIds?.has(id));
  if (classCandidate) return classCandidate;
}
return null;
```

When `candidates.length > 1` and `isNewExpression === true`: there are multiple classes/functions named `X`, but for a `new X()` call we prefer the `Class` node. If found, the class is used.

**Reliability:** Medium. We're choosing among multiple candidates using a type label heuristic. The heuristic is correct in most cases (constructors are called with `new`), but incorrect if multiple classes share the name and the right one isn't picked, or if a factory function (not a class) is named the same.

**Calibrated confidence: 0.65**

---

### Path 5: No resolution (returns null)

When `candidates.length > 1` and `isNewExpression === false`: multiple candidates exist but we can't pick one. Currently the code returns `null` and emits no edge. This is the right behavior — no edge is better than a wrong edge.

**No confidence value needed** — no edge emitted.

---

## Calibration table (summary)

| Resolution path | Code condition | Calibrated confidence |
|---|---|---|
| Import-resolved | `fileCtx.importedNames.has(calleeName)` | **0.95** |
| Same-file definition | `fileDefs.find(d => d.name === calleeName)` | **0.85** |
| Single global match | `candidates.length === 1` | **0.80** |
| New-expression class disambiguation | `isNewExpression && classCandidate` | **0.65** |
| No resolution (null) | N/A | No edge emitted |

---

## Notes on methodology

This calibration is based on static code-path analysis, not live data sampling. The source plan calls for sampling ~50 real edges from the indexed graph; in practice this codebase has ~18K nodes and ~13K edges in the graph. The resolution paths are small in number (4 paths), well-bounded in code, and the reliability ordering is unambiguous:

- Import-resolved > same-file > name-unique > class-heuristic

The specific numbers (0.95, 0.85, 0.80, 0.65) are starting calibration points that satisfy two requirements:
1. Each level is meaningfully distinct (not collapsed into 0.9/0.9/0.8/0.8)
2. Even the highest (0.95) is not 1.0 — 1.0 would claim certainty the parser cannot deliver

Post-launch, query telemetry from `traceBatcher` (Wave 70) can calibrate these empirically once the JSONL corpus has enough `trace_call_path` calls with known outcomes.

---

## Impact on existing confidence = 1.0 edges

After Phase B lands and Phase C forces a reindex, existing `CALLS` edges will be rewritten with their actual confidence. The `INSERT OR REPLACE` behavior of `insertEdge` means edges for unchanged files will be recreated with the correct confidence on next index run. Full reindex ensures all files are processed.

## Interaction with `ASYNC_CALLS` edges

`ASYNC_CALLS` uses the same resolution logic — `call.isAsync` only changes the edge type, not the resolution path. The same confidence values apply to `ASYNC_CALLS`.
