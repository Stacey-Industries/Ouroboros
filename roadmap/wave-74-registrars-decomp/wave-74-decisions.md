# Wave 74 — Architecture Decision Record

## Decision 1: Approach (A) — delete `miscRegistrars.ts`, no barrel

**Context:** The plan offered two approaches: (A) delete `miscRegistrars.ts` and
have `misc.ts` import named registrars directly; (B) keep `miscRegistrars.ts` as a
thin barrel re-exporting the new registrars.

**Pick:** Approach (A) — delete `miscRegistrars.ts`.

**Rationale:** The indirection is the problem. A barrel preserves the smell — future
agents would still see a 10-domain catch-all as the conceptual home for new handlers,
recreating the problem. Direct imports in `misc.ts` make the domain split obvious and
permanent. The plan source explicitly recommends (A).

**Consequences:** `misc.ts` gains 9 named imports. No other callers of
`miscRegistrars.ts` exist (confirmed: only `misc.ts` imports from it).

## Decision 2: Duplicate local utility helpers per extracted file

**Context:** `miscRegistrars.ts` defines shared utilities — `ok`, `fail`,
`runAction`, `runQuery`, `registerChannel` — used by all domain functions.
`miscRegistrarsHelpers.ts` independently defines the same set (parallel evolution).

**Options considered:**
- *Extract to shared utility module:* create `ipcHandlerUtils.ts`, import from all
  domain files.
- *Duplicate per file:* each extracted file carries its own copy of the 5 helpers.
- *Import from `miscRegistrarsHelpers.ts`:* reuse the existing copies there.

**Pick:** Duplicate per file.

**Rationale:** The `CLAUDE.md` for this directory explicitly states "each file
defines local type aliases — don't import them across files." The helpers are
8–15 lines total and entirely mechanical. A shared utility module would be a new
abstraction not present in any other domain registrar file in this directory — all
existing domain files define their own local helpers. Consistency beats DRY here.
`miscRegistrarsHelpers.ts` is not a public utility module; importing from it would
couple the new files to an implementation detail.

**Consequences:** ~30 lines of utility code duplicated across 8 new files (after
the existing 2 that already carry them). Acceptable cost for clean file isolation.

## Decision 3: One commit per domain extraction

**Context:** Could batch all extractions into a single commit or one per domain.

**Pick:** One commit per domain extraction.

**Rationale:** Per source plan and wave instructions. Each domain extraction is
independently reviewable and bisectable. A single commit would make the diff
unreadable.

**Consequences:** ~9–10 commits for the wave. Each commit message follows the
`chore(wave-74): extract <domain>Handlers from miscRegistrars` convention.
