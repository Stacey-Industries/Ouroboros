Run impact analysis on current uncommitted changes.

## Process

1. Use `detect_changes` from codebase-memory-mcp to find affected symbols with risk levels
2. For any CRITICAL or HIGH risk symbols, run `trace_call_path` to show the full dependency chain
3. **Verify graph claims with parallel reads.** The graph can lag on recent edits.

   **Judgment override.** If you've already read the changed files and their callers in this session, skip the fan-out and proceed to Step 4. Default to fan-out for cold contexts; skipping is for clear cases.

   Otherwise, dispatch `haiku-explorer` workers in parallel — one per CRITICAL/HIGH symbol — to confirm the call sites the graph reported actually exist in the current code (file:line). Honor agent tier locks — do NOT pass `model:` overrides.

4. Check if test files exist for each affected symbol
5. Summarize: files affected, risk levels, test coverage gaps, and recommended actions

$ARGUMENTS
