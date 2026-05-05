# Agent IDE — bugs/

Pre-existing or user-reported bugs that aren't in any active wave. Distinct from `follow-ups/` — bugs here are user-reported defects, not noticed-during-work items.

## Convention

- One file per bug: `{YYYY-MM-DD}-{slug}.md`
- Frontmatter: `status: OPEN`; `severity: <low|medium|high|critical>`
- Body: reproduction steps, expected vs actual, environment

## Lifecycle

`OPEN` → `TRIAGED` (severity assigned) → `SCHEDULED` (in a fix wave or hot patch) → `IN-PROGRESS` → `RESOLVED`

Or: `OPEN` → `WONTFIX` (closed without fix; reason required)

Bugs that touch > 5 files OR require architectural decisions promote to a Lane A wave per `~/.claude/rules/development-pipeline.md` Lane B promotion threshold.

## Agent IDE-specific note

Lane B B0 (UI bug reproduction) requires the electron renderer wired into a browser MCP. See `roadmap/follow-ups/` for the electron-MCP-setup follow-up. Until that's done, B0 for UI bugs requires user-side reproduction (video, devtools logs).
