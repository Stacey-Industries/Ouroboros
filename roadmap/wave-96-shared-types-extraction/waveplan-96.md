---
status: PLANNED
created: 2026-05-18
updated: 2026-05-18
wave: 96
slug: shared-types-extraction
tag: v2.19.2
---

# Wave 96 — Renderer↔Main Type Coupling: Cut the tsconfig.web.json Bleed

## Status

PLANNED — unblocks the pre-push `tsc -p tsconfig.web.json` gate, which
is blocking the Wave 94 push (32 commits ahead of origin). All 616
TS6307 errors trace to two renderer files importing from main. Fix is
surgical: redirect both to already-correct shared/local sources.

## Context

`tsconfig.web.json` type-checks renderer + shared + web under DOM lib,
so any import that reaches into the main process tree fails with TS6307
("file not listed under 'files' or matched by 'include'"). Two renderer
files are the source of the entire bleed:

1. `src/renderer/hooks/useClaudeCliSettings.ts` imports `ClaudeCliSettings`
   from `../../main/configTypes`. `configTypes.ts` re-exports `AppConfig`
   from `configAppTypes.ts`, which imports from `agentChat/types`,
   `session/sessionDispatch`, `contextLayer/contextLayerTypes` — the whole
   main subsystem unspools transitively. Fix: the type already exists in
   `src/renderer/types/electron-foundation.d.ts`; it has just drifted 2
   fields behind (`useWarmProcess`, `enableTerminalDiffReview` added in
   waves 92 and 94).

2. `src/renderer/types/electron-orchestration.d.ts` imports 3 channel types
   from `../../main/orchestration/events`. That file re-exports from
   `@shared/ipc/orchestrationChannels` but ALSO has `satisfies` runtime
   expressions that reference `OrchestrationStatus` and
   `OrchestrationEvent['type']` — causing tsc to pull in `./types` for
   validation, which pulls in the orchestration domain type tree.
   Fix: import the 3 channel types directly from
   `@shared/ipc/orchestrationChannels`, bypassing `main/orchestration/events.ts`.

No preload files have main-process imports (verified). The
`FlowTracer/useStepNarration.test.ts` import of `main/flowTracer/...` is
excluded by `tsconfig.web.json`'s test-file exclude glob — not a
contributor to the 616 errors.

## Goal

After Wave 96:
- `tsc -p tsconfig.web.json` exits 0 with no TS6307 errors
- The pre-push hook unblocks; Wave 94 + Wave 96 push together
- `useClaudeCliSettings` uses the renderer's own canonical type definition
- `electron-orchestration.d.ts` channel imports route through shared, not main

## Bundled phases

| Phase | Scope | Files | Parallelisable |
|-------|-------|-------|----------------|
| A | Sync `ClaudeCliSettings` in `electron-foundation.d.ts` + redirect `useClaudeCliSettings.ts` | 2 | Yes |
| B | Redirect orchestration channel imports in `electron-orchestration.d.ts` | 1 | Yes |
| C | Verify `tsc -p tsconfig.web.json` clean + scoped vitest pass | 0 code | After A+B |

A and B are independent file-scopes — dispatch in parallel.

## ADR

**Decision: Sync renderer's `ClaudeCliSettings` in place vs delete the
local definition and always import from shared.**

The renderer's `electron-foundation.d.ts` already has a standalone
`ClaudeCliSettings` with ~28 fields. Main's `configTypes.ts` has 30 fields
(2 newer).

**Pick: Sync in place (Option 1). Defer full shared-types extraction to
Wave 97.** Rationale: this wave's sole goal is unblocking the push.
Wave 97 will move config slices to `src/shared/types/configSlices.ts`
to eliminate drift permanently — larger blast radius (touches
`main/configTypes.ts` and all consumers), doesn't fit on an unblock wave.

**Consequence:** `ClaudeCliSettings` exists in two places until Wave 97.
Gotcha entry added to `src/renderer/types/CLAUDE.md`.

## Phase specs

### Phase A — Sync `ClaudeCliSettings` in `electron-foundation.d.ts`

**Scope:** `src/renderer/types/electron-foundation.d.ts`,
`src/renderer/hooks/useClaudeCliSettings.ts`,
`src/renderer/types/CLAUDE.md` (gotcha entry)

**Work:**
1. Add `useWarmProcess: boolean` and `enableTerminalDiffReview: boolean`
   to `ClaudeCliSettings` in `electron-foundation.d.ts`.
2. In `useClaudeCliSettings.ts`, change line 1 from
   `import type { ClaudeCliSettings } from '../../main/configTypes';`
   to import from the renderer's electron type barrel (verify whether
   `electron.d.ts` re-exports it; if so use the barrel, else
   `'../types/electron-foundation'`).
3. Add gotcha to `src/renderer/types/CLAUDE.md`: `ClaudeCliSettings`
   exists in both `electron-foundation.d.ts` AND `main/configTypes.ts`
   until Wave 97 — new fields in main must be mirrored.

### Phase B — Redirect orchestration channel imports

**Scope:** `src/renderer/types/electron-orchestration.d.ts`

**Work:** Replace the 3-channel-type import block sourcing from
`'../../main/orchestration/events'` with the same types from
`'@shared/ipc/orchestrationChannels'`. The `@shared` alias is already
in `tsconfig.web.json`.

### Phase C — Verify

1. `npx tsc --noEmit -p tsconfig.web.json` — expect 0 errors (or only
   the small handful of pre-existing genuine errors NOT in the TS6307
   cascade).
2. `npx tsc --noEmit -p tsconfig.node.json` — expect unchanged (already clean).
3. `npx vitest run src/renderer/hooks` — regression sweep on touched area.

## Scope (out)

- Moving `ClaudeCliSettings` and other config slices to `src/shared/` — Wave 97
- Moving 40 orchestration domain types to `src/shared/` — Wave 97
- Pre-push hook incremental-check redesign — separate follow-up
- `FlowTracer/useStepNarration.test.ts` main-import (test-excluded)

## Wave wrap (Phase D)

Standard wrap. CHANGELOG entry `v2.19.2` (patch — pure type correctness,
no behavioral change). Push together with Wave 94's 32 commits.

## Risks

1. `electron.d.ts` barrel may or may not re-export `ClaudeCliSettings`.
   Per `src/renderer/types/CLAUDE.md`: "Import from `electron.d.ts` only."
   If barrel doesn't already re-export it, add the re-export rather than
   importing the sub-file directly.
2. The 4 explicit `src/main/orchestration/*.ts` includes in
   `tsconfig.web.json` should STAY — they're working and not the source
   of the 616 errors.
3. If Phase C reveals residual errors NOT in the TS6307 cascade, those
   are pre-existing real errors (TS2305, TS2322, TS6133, TS2345 per
   earlier scan) — file as separate follow-ups, do not block the push.

## Wave 97 follow-up (schedule after 96 ships)

Create `src/shared/types/configSlices.ts` housing `ClaudeCliSettings`,
`CodexCliSettings`, etc. — eliminating drift permanently.
