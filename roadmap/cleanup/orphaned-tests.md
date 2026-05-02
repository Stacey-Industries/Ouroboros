# Orphaned Tests — Audit Result

**Generated:** 2026-05-01.
**Method:** Glob every `*.test.{ts,tsx}` under `src/`. For each, check whether the sibling implementation (`foo.test.ts` → `foo.ts`) exists. For orphans, grep imported symbols across the rest of `src/` to detect "moved-not-deleted" cases.

---

## Result

**No orphaned tests found.** All test files have either a sibling implementation or are explicitly structural / contract / integration tests with no expected sibling.

## Notes

- **Worktree tests** under `.claude/worktrees/` were excluded — those are feature-branch checkouts, not part of the main tree.
- **Integration / contract tests without siblings** — e.g., `src/web/preloadParity.test.ts` (currently untracked per `git status`) — exist by design to validate cross-module parity. They are not orphans.
- **Test colocation hygiene** is consistent across the codebase (every `foo.ts` has its `foo.test.ts` next to it, where tests exist). This makes future orphan audits trivial.

## Caveat

This audit does not cover:
- **Tests testing the wrong thing** — a test file whose sibling exists but no longer exercises the right behavior. Detecting that requires reading both files.
- **Always-skipped tests** — `it.skip` / `describe.skip` blocks indicating temporarily-disabled coverage. Grep for `\.skip\(` would enumerate these if needed.
- **Unwired test files** — files matching `*.test.ts` but excluded by `vitest.config.ts` from actual runs. The vitest config would need inspection to verify.

If any of those become a concern, file a follow-up audit; otherwise the test surface is clean by the orphan-by-missing-sibling definition.
