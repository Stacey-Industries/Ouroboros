Run impact analysis on current uncommitted changes:

1. Use `detect_changes` from codebase-memory-mcp to find affected symbols with risk levels
2. For any CRITICAL or HIGH risk symbols, run `trace_call_path` to show the full dependency chain
3. Check if test files exist for each affected symbol
4. Summarize: files affected, risk levels, test coverage gaps, and recommended actions

$ARGUMENTS
