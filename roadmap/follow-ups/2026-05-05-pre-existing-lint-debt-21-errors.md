---
status: OPEN
created: 2026-05-05
updated: 2026-05-05
severity: low
---

# Pre-existing lint debt (21 errors, 4 warnings) at pristine master

## Context

During Wave 83 wrap (`npm run lint` gate), 21 errors and 4 warnings surfaced across `src/`, `e2e/`, and `scripts/`. Investigation: stashing all uncommitted work and linting pristine HEAD reproduces the same 21/4 count — these are pre-existing rule violations, not introduced by Wave 83.

Wave 83's net contribution to lint state was **negative** (improved by 142 errors): Phase 2's addition of a Node-globals config block for `scripts/**/*.mjs` resolved widespread `no-undef` errors across the existing scripts.

The Wave 82.1 result brief reported "npm run lint — 0 errors, 3 pre-existing warnings" — but that snapshot was taken on a different working-tree state, and either lint rules or file inclusion has shifted since. The deferral here is to reconcile current state.

## Files affected

### `src/` (3)
- `src/renderer/components/FileViewer/FileViewerChrome.tsx:271` — `react-hooks/exhaustive-deps` warning (missing `p` dep on useCallback)
- `src/renderer/components/FileViewer/HtmlPreview.tsx:47` — unused eslint-disable directive
- `src/main/delegationCoach/patterns.test.ts` — error (specifics in lint output)

### `e2e/` (2)
- `e2e/electron.fixture.ts` — became lintable after Wave 83 narrowed `e2e/` ignore from blanket to `e2e/**/*.spec.ts` only
- `e2e/fixtures/project.fixture.ts` — same exposure

### `scripts/` (9)
- `scripts/audit-snapshot-safety.mjs`
- `scripts/benchmark-indexer.mjs`
- `scripts/build-coach-hook.mjs`
- `scripts/check-docs-schema.ts`
- `scripts/check-marketplace-key.ts`
- `scripts/install-sqlite-fresh.mjs`
- `scripts/test-coach-hook.mjs` (and `-d.mjs`, `-e.mjs` variants)

Common patterns: `simple-import-sort/imports`, `@typescript-eslint/no-unused-vars`, `max-lines`, occasional unused `__dirname`.

## Why deferred from Wave 83

Wave 83's scope was the Playwright-electron repro harness (Path C). Fixing 21 unrelated lint errors across pre-existing files is scope expansion. Per `~/.claude/CLAUDE.md`: "A bug fix doesn't justify unrelated refactors."

The Wave 83 auto-brief (`roadmap/wave-83-electron-renderer-browser-mcp-wiring/wave-83-auto-brief.md`) marks the "full lint clean" acceptance criterion as PARTIAL with this follow-up cited. Wave 83's own surface (`e2e/reproArtifacts.{ts,test.ts}`, `scripts/repro-electron.{mjs,test.mjs}`, `playwright.config.ts`, `package.json` script entry, `e2e/CLAUDE.md`, the wave-83 roadmap files) is clean.

## Suggested next steps

A small fix-sweep wave covering this, sized at ~1-2 hours:

1. **Auto-fixable subset (8 errors)**: `npx eslint --fix src/ e2e/ scripts/` resolves the import-sort and similar mechanical violations. Inspect the diff before committing.
2. **Manual fixes (13 errors)**: split the over-large `scripts/test-coach-hook.mjs` (439 lines, max 300), remove unused vars, address the `react-hooks/exhaustive-deps` warning in `FileViewerChrome.tsx` (likely needs a real understanding — may not be a no-op fix).
3. **Decide on `e2e/` fixtures**: keep them lint-exempt (re-broaden the ignore to `e2e/electron.fixture.ts` + `e2e/fixtures/**`) or fix the violations and lint them. Either is fine; pick one.
4. **Re-run** `npm run lint` and confirm green at HEAD.

Could be a single-commit fix-sweep wave (no `/wave-plan` overhead) or rolled into the next planned wave's wrap.
