---
status: OPEN
created: 2026-05-08
updated: 2026-05-08
source_wave: 85
target_wave: 86
---

# Flow Tracer trace-engine output quality

## What

Smoke run after Wave 85 ship surfaced three related issues with the trace engine's output. Phase 2 ships a working trace engine, but the FlowSteps it produces aren't pedagogically usable yet:

- Bridge call expressions appear as step symbols instead of being resolved to their main-side handlers.
- JS keywords (`delete`, etc.) appear as step symbols.
- Every flow truncates at exactly 3 steps, suggesting either premature depth-cap or a registry-resolution gap.

User feedback: *"All start with a 1 in renderer, and then a line to 2 in main, and then another line to 3 in main also."* Combined with smoke logs showing `get-narration ΓÇö symbol: window.electronAPI.attachGraphSummary` and `get-narration ΓÇö symbol: delete` firing repeatedly.

## Where in the code

- `src/main/flowTracer/traceEngine.ts` and `traceEngineSupport.ts` — the trace builder.
- `src/main/flowTracer/boundaryRegistry.ts` — supplies bridge → channel → handler mappings; trace engine consumes.

## Sub-problems

### A. Bridge call expressions surface as step symbols

When a renderer step calls `window.electronAPI.attachGraphSummary(...)`, the trace engine produces a FlowStep whose `symbol` field is the literal string `"window.electronAPI.attachGraphSummary"` rather than the main-side handler symbol the bridge resolves to.

Per design spec §5.1 Layer 3 (boundary resolution): "When a trace hits a `window.electronAPI.X()` call: look up the bridge → get the channel → look up the main handler → continue trace from there."

Phase 2's `boundaryRegistry.ts` builds the bridge → channel mapping (314 bridge entries logged at runtime), but the trace engine's step generator either:
- Emits the bridge expression as its own step instead of resolving it, OR
- Resolves but emits the call-expression form as the step's display symbol instead of the handler's qualified name.

Either way: narration calls fire for the bridge expression, which Haiku can't generate meaningful narration for (it's a call site, not a function definition).

### B. JS keywords as step symbols

Smoke logs show `get-narration ΓÇö symbol: delete` firing many times. `delete` is a JavaScript operator (`delete obj.prop`), not a function symbol. The trace engine's call-graph walk is matching against tokens that include keywords.

Fix: maintain a small denylist of language keywords / operators that never represent traceable symbols (`delete`, `typeof`, `void`, `await`, `yield`, `new`, etc.) and skip emitting steps for them. The codebase-memory graph indexer probably has the same denylist somewhere — reuse it.

### C. Flows truncate at exactly 3 steps

Every traced flow in the smoke session ended at 3 steps. The trace-flow handler's logs:
```
[flowTracer] trace-flow entry: registerTagHandlers
[flowTracer] get-flow-why ΓÇö flow: trace-registerTagHandlers-... ( 3 steps)
```

Three steps repeated across `attachGraphSummary`, `handleUpdateMemory`, `registerTagHandlers`, `makeForkHandler`, `makeListBranchesHandler`, `makeRenameBranchHandler`, `handleImportThread`, `registerReRunHandler`, `handleCreateMemory`. All have `(3 steps)`.

Possible causes:
- Depth cap at 6 hops is fine, but the trace dead-ends earlier because the call graph's outbound edges from main-side handlers aren't being walked. The codebase-memory graph indexer might not capture every `await someAsyncCall()` as an outbound edge from the handler symbol.
- Or: the boundary resolution isn't continuing past the IPC boundary — once we resolve renderer→preload→main, we land on the main handler but don't recurse INTO the handler's body.
- Or: traceEngineFallback is being hit for every trace because the real engine's primary path errors silently.

Investigation path: instrument `traceEngine.traceFlow` with `log.info('[trace:phase2]', { entry, hopCount, edgesAvailable })` per hop and reproduce. Should be a 30-min diagnostic.

## Why this didn't surface earlier

Phase 2's unit tests (boundaryRegistry.test.ts + traceEngine.test.ts + traceEngineSupport.test.ts) verified the components in isolation against synthetic graphs. The acceptance test (`walkingSkeleton.acceptance.test.ts`) only asserts STRUCTURAL shape (≥2 steps, layer/kind enums valid, edges reference existing steps) — it doesn't assert that real flows produce >3 steps or that bridge expressions get resolved. Real-graph behavior was first observed at smoke.

## Suggested home

Wave 86 — Flow Tracer Polish. All three sub-problems fit there. Estimated effort:

- A (bridge resolution): 2-4 hours. Read boundaryRegistry.ts + the call-walker in traceEngineSupport, identify the resolution gap, fix.
- B (keyword filter): 30 min. Add a denylist constant, filter at step-emission.
- C (3-step truncation): 2-6 hours depending on root cause. Instrument first; the fix depends on what runtime data shows.

Together: 1 day if the diagnostics for C are quick.

## Acceptance criteria for the fix

- Tracing `registerMessageHandlers` (the canonical "send a chat message" entry) produces ≥6 steps spanning at least renderer, preload, main, and one fs OR cli boundary.
- No FlowStep has `symbol` containing `window.electronAPI.` or matching JS keyword denylist.
- The 12 walking-skeleton acceptance assertions still pass.
