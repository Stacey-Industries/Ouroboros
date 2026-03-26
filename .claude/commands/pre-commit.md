Run pre-commit quality checks:

1. TypeScript: `npx tsc --noEmit` — verify no type errors across all three processes
2. ESLint: `npx eslint src/ --quiet` — verify no lint violations
3. Tests: Run tests for any files changed in this session
4. Process boundaries: Verify no cross-process imports (main ↔ renderer)
5. Design tokens: Verify no hardcoded hex colors in renderer code

Report pass/fail for each check. If all pass, proceed with commit.
$ARGUMENTS
