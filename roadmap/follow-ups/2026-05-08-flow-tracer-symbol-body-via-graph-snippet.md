---
status: OPEN
created: 2026-05-08
updated: 2026-05-08
source_wave: 85
target_wave: 86
---

# Flow Tracer narration body fetch should use the graph's `get_code_snippet`

## What

`narrationCache.fetchSymbolBody` reads symbol bodies via raw file slice (`fs.readFile + lines.slice(ref.line - 1, ref.line + 60)`). Wave 85 smoke surfaced that the codebase-memory graph's recorded line for some symbols is stale or wrong, and the line slice misses the actual function body. Cole's smoke run hit this on `attachGraphSummary` — Haiku replied *"the symbol was not found in the provided code excerpt; the file contains buildGraphSumma..."*

A rescue fallback (`rescueBodyByName`) shipped in `cf7104b` that scans the file for the symbol name when the line slice misses it. That works, but it's a workaround — the principled fix is to read the body via the graph's `get_code_snippet` API, which returns the symbol's actual body regardless of the recorded line.

## Where in the code

`src/main/flowTracer/narrationCache.ts:fetchSymbolBody` (lines 134-147 + the rescue fallback at `rescueBodyByName`).

## What the design spec called for

Per `docs/superpowers/specs/2026-05-08-flow-tracer-design.md` §5.2 (narration generation): the spec is silent on the body source. Per §10 (References), the codebase-memory graph provides `get_code_snippet`. The Phase 3 implementer chose file-slice with the comment *"// Try reading directly from source (no graph dependency for Phase 3)."* The choice was scope-discipline: don't add graph dependency in Phase 3 because the graph wasn't yet ready in the test environment.

## What "fixed" looks like

`fetchSymbolBody` calls `getGraphController().getCodeSnippet(symbolId)` (or the equivalent method on the compat surface) first. On miss / error, falls back to the current file-slice + `rescueBodyByName` chain. Order of preference:

1. Graph snippet (best — returns the actual function body the indexer captured).
2. File slice from `ref.line` (current default — fast, but stale-line-prone).
3. `rescueBodyByName` (current fallback — name-search the file).
4. `// {symbol} — body unavailable` (last resort).

## Effort estimate

~2 hours. The graph controller is already available in main process via `getGraphController()`. The API name to call needs verification against the graph's IPC surface (`graph:getCodeSnippet` is registered per the wave-85 channel catalog smoke logs). One change to `fetchSymbolBody` + extend `narrationCache.test.ts` to mock the graph controller's snippet method.

## Why this didn't ship in Wave 85

Phase 3 deliberately scoped out graph dependencies to keep the cache testable in isolation. The rescue fallback handles the wrong-line case good enough for smoke; the cleaner architecture is the deferred upgrade.

## Acceptance criteria for the fix

- `fetchSymbolBody` for a known indexed symbol returns the graph's `get_code_snippet` output when available.
- Smoke run on `attachGraphSummary` and other previously-broken symbols returns Haiku narration on first attempt (no `[narrationCache] batch returned valid empty array` log line).
- Existing `narrationCache.test.ts` still passes; new test covers graph-hit and graph-miss-fallback paths.
