# ESLint Awareness (src/**/*.{ts,tsx})

MUST follow these ESLint constraints when writing or editing code:

- `max-lines-per-function: 40` (skipBlankLines, skipComments) — extract helpers if a function exceeds this
- `complexity: 10` — max cyclomatic complexity; use early returns and guard clauses to reduce branching
- `max-lines: 300` per file (skipBlankLines, skipComments) — split into separate modules if approaching limit
- `max-depth: 3` — max nesting levels; flatten with early returns or extract nested logic
- `max-params: 4` — use an options object if more parameters are needed
- `no-console: warn` — only `console.warn` and `console.error` are allowed; remove `console.log` before finishing
- `simple-import-sort/imports: error` — imports must be sorted
- `simple-import-sort/exports: error` — exports must be sorted
- Security rules (main/preload only): `security/detect-object-injection`, `security/detect-non-literal-regexp`, `security/detect-non-literal-require`, `security/detect-non-literal-fs-filename`, `security/detect-eval-with-expression`, `security/detect-child-process` — all at error level
- Test files (`*.test.ts`) are exempt from `max-lines-per-function` and `max-lines`

This rule is proactive — it reduces edit→lint→fix cycles. The PostToolUse ESLint hook is reactive — it catches what this misses.
