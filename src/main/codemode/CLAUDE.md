<!-- claude-md-auto:start -->

The CLAUDE.md has been written. Key things it documents that weren't in the malformed previous version:

- **Lifecycle diagram** showing the exact sequence of settings mutations during enable/disable
- **Module-level state** — the six `let` variables in `codemodeManager.ts` that encode all active-session state
- **Why typeGenerator is prompt engineering** — the `declare namespace` is never compiled, it's embedded in the tool description string for the LLM to read
- **The two-layer 30s timeout** — VM timeout only guards synchronous execution, not the awaited upstream calls; mcpClient has its own independent timeout
- **SSE transport is a no-op** — `McpServerConfig.url` is read but never connected
- **Crash recovery gap** — settings left in mutated state if Electron dies while Code Mode is active
<!-- claude-md-auto:end -->
