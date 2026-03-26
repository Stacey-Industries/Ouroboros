Perform a bulk ESLint cleanup across the codebase using a cost-efficient approach:

1. Run `npx eslint src/ --format json` to get ALL current violations
2. Group violations by file
3. For each file with violations, spawn a Sonnet subagent (Agent tool with model: "sonnet") to fix them:
   - The subagent should read the file, understand the violations, and fix them
   - It must respect the existing code style and architecture
   - It should extract helper functions to meet max-lines-per-function (40)
   - It should reduce complexity with early returns and guard clauses
   - It must NOT change behavior — only restructure to pass lint
4. After all subagents complete, run `npx eslint src/ --quiet` to verify zero violations remain
5. Run `npm test` to verify no regressions
6. Report: files fixed, violations resolved, any remaining issues

$ARGUMENTS
