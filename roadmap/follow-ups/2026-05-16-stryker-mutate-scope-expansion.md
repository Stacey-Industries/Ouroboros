---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
source: wave-92 Decision 5 (Cole's explicit follow-up request)
---

# Expand Stryker `mutate` globs beyond `src/shared/**`

## Context

Wave 92 (Cross-Platform Lockfile + Stryker, planned 2026-05-16) installs Stryker with `mutate` globs scoped tightly to `src/shared/**/*.ts` — pure types/helpers, zero Electron imports, zero React, zero native bindings. This was a deliberate v1 choice: Stryker's sandbox cannot rebuild native modules ([stryker-js#1621](https://github.com/stryker-mutator/stryker-js/issues/1621)), and Agent IDE has 4 native deps (`better-sqlite3`, `node-pty`, `@parcel/watcher`, `@node-rs/xxhash`) any of which would break the baseline if reached transitively from a mutated file.

Cole approved the tight v1 scope and asked to capture expansion candidates as a follow-up so they're not lost.

## Expansion candidates (ranked by risk)

### Updated by Phase 2 audit (2026-05-16)

The native-module audit (`roadmap/wave-92-cross-platform-lockfile-stryker/phase-2-audit.md`) found `better-sqlite3` is imported across 15 production files (split by subsystem due to 300-line ESLint limit), and `node-pty` across 5+3 type-only files. The expansion path is **subsystem-boundary exclusion**, not "exclude N specific files":

```js
mutate: [
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/**/*.d.ts',
  // Native-module boundaries
  '!src/main/storage/**',         // better-sqlite3
  '!src/main/codebaseGraph/**',   // better-sqlite3 + xxhash
  '!src/main/telemetry/**',       // better-sqlite3
  '!src/main/agentChat/threadStoreSqlite*.ts',
  '!src/main/pty*.ts',            // node-pty
  '!src/main/ptyHost/**',         // node-pty
  '!src/main/claudeUsagePoller.ts', // node-pty
  '!src/main/watchers/**',        // @parcel/watcher
  '!src/standalone/**',           // better-sqlite3 (standalone MCP)
]
```

This widens mutate-surface from `src/shared/**` only to `src/**` minus the 9 boundary patterns above — a major surface expansion. Validation in the expansion wave: `npx stryker run --dry-run` after each glob addition.

### Original low-risk candidates (superseded by audit)

- `src/main/codebaseGraph/**` is **OUT** — graph DB transitively imports `better-sqlite3` AND directly imports `xxhash`. Cannot mutate.
- `src/main/**/*.helpers.ts` and `src/main/**/*.utils.ts` (pattern-based) — typically pure functions by naming convention. Audit each for transitive native imports before adding.

### Medium risk — requires per-file review

- `src/main/orchestration/**/*.ts` excluding files that spawn processes. Logic-heavy with rich state machines; mutation would expose untested branches but needs careful exclusion of any file that imports `child_process` or `node-pty` indirectly.
- `src/shared/` is already in v1 scope — confirm coverage of any new shared modules added between Wave 92 and the expansion wave.

### High risk — DO NOT add without architectural change

- `src/main/ipc-handlers/**` — most handlers transitively pull `better-sqlite3` via storage helpers.
- `src/renderer/**` — React + DOM, Stryker's vitest runner can mutate but the jsdom setup may not produce useful results for component behavior; needs evaluation.
- Anything in `src/main/storage/**`, `src/main/pty.ts`, `src/main/watchers/**` — direct native importers.

## Approach for the expansion wave

1. Read Wave 92's `wave-92-result.md` and the first baseline score; that's the comparison point.
2. Use `npx stryker run --dry-run` to validate each candidate glob doesn't break sandbox import resolution BEFORE committing it to config.
3. Add candidates in tiers: low-risk batch first; measure; medium-risk; measure. Don't add high-risk without a transitive-import audit.
4. Each tier raises `break:` to floor(new score)-1 only after the tier ships.
5. The expansion is not about hitting a target score — it's about widening the surface Stryker watches for backslide. Score may go down as more code is covered.

## Not in this follow-up

- Coverage investment (writing tests to raise the score). That's a separate initiative — this follow-up is about widening Stryker's *gaze*, not improving the score itself.
- Migrating off vitest runner. Out of scope.
