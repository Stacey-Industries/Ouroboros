# Agent IDE — decisions/

Cross-wave / durable architectural decision records (ADRs). Distinct from wave-scoped ADRs (which live in `wave-{N}-{slug}/wave-{N}-decisions.md`).

## Convention

- One file per decision: `{topic}.md` (e.g., `codebase-graph-architecture.md`, `mcp-runtime-shape.md`)
- Frontmatter: `status: ADOPTED` (or `SUPERSEDED` if replaced); `decided: <YYYY-MM-DD>`
- Body: Context, options considered, decision, rationale, consequences (per `~/.claude/rules/best-practice-spectrum.md` ADR shape)

## When to write a durable ADR vs wave-scoped

- **Durable** — decision applies beyond one wave (codebase-graph architecture, MCP runtime shape, IPC contract conventions, framework picks)
- **Wave-scoped** — decision is specific to a single wave's implementation

If unsure, start wave-scoped. Promote to durable when a second wave references it.
