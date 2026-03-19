<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
The subsystem map in CLAUDE.md mirrors what `main.ts` actually imports — making it a living dependency graph. When `main.ts` gains a new import, that's a signal to update the map. The subdirectories (`agentChat/`, `web/`, `storage/`, etc.) each have their own CLAUDE.md, so this file deliberately stops at the boundary and just names them.
`─────────────────────────────────────────────────`

Key updates from the previous version:

1. **New subsystems added to the map**: `agentChat/`, `codebaseGraph/`, `contextLayer/`, `orchestration/`, `storage/`, `web/` — all visible in `main.ts` imports but missing before.

2. **Approval flow clarified**: The `approvalManager` uses a **response-file protocol** at `~/.ouroboros/approvals/` — hook scripts _poll_ this path rather than holding a socket open. Important for debugging approval timeouts.

3. **Hook version tracking**: `hookInstaller.ts` auto-computes its version from SHA-256 of script contents — no manual bumping ever needed.

4. **New gotcha added**: `storage/migrate.ts` runs _before_ `createWindow()` — a sequencing constraint that would be easy to violate when reorganizing startup code.

5. **Missing files added**: `lspTypes.ts`, `lsp.ts`, `usageReaderSupport.ts`, `extensions.ts`, `env.d.ts` now documented.
<!-- claude-md-auto:end -->
