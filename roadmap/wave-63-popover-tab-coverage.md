# Wave 63 — Popover Tab Coverage

## Status

DRAFT · target v2.10.0 · depends on Wave 62 (chat-only popover rule toggles).

## Why this wave exists

Wave 62 brought the chat-only context-preview popover's **Rules** tab to a fully-wired state — dedup, User/Project sub-tabs, ephemeral file-move toggles, "managed" badge for CLAUDE.md / AGENTS.md / settings.local.json. The remaining six tabs sit on a spectrum from working to stub:

| Tab      | State today          | Source / lack thereof                                             |
| -------- | -------------------- | ----------------------------------------------------------------- |
| Rules    | ✅ shipped (Wave 62) | live `loadedRules`                                                |
| Skills   | ⚠️ read-only OK      | live `skillExecutions`                                            |
| Memory   | ❌ stub              | empty-state hardcoded; no builder                                 |
| Files    | ⚠️ correct           | `pinnedFiles` prop, local-only toggle                             |
| Mentions | ❌ stub              | `mentionLabels: []` hardcoded in `ComposerContextPreview.tsx:169` |
| Tools    | ⚠️ hardcoded         | `BUILT_IN_TOOLS` const, no MCP awareness                          |
| System   | ✅ correct           | `chatOverrides` model + effort                                    |

The popover claims to show "what gets sent with the next prompt." For Memory, Mentions, and Tools that claim is currently false (Memory says nothing, Mentions is empty, Tools shows a stale subset). This wave makes the popover honest.

## Goal

Each tab shows accurate, current data:

1. **Mentions** — live `@mention` selections from the composer.
2. **Tools** — the real tool surface available to the next session: built-ins + active MCP tools.
3. **Memory** — project-scoped `MEMORY.md` index entries from `~/.claude/projects/<slug>/memory/`.
4. **Skills** — confirmed read-only (no change).
5. **Files** — confirmed correct (no change).
6. **System** — confirmed correct (no change).

Net UX: opening the popover for a session that has 3 pinned files, 2 @mentions of `~/repos/foo/bar.ts`, MCP tools registered, and 4 active memory entries shows all of that — no empty stubs, no fabricated lists.

## Locked decisions

1. **Read-only for Tools and Memory in v1.** Toggling tools requires either Claude Code CLI `--allowedTools`/`--disallowedTools` integration or per-spawn settings shadowing — meaningful surface, deferred. Toggling memory entries requires write paths into `MEMORY.md` and per-entry files — also deferred. Display first, toggle later.

2. **Memory source: project-scoped only.** `~/.claude/projects/<slug>/memory/MEMORY.md` and the entry files it links to. Global memory in the user's `~/.claude/CLAUDE.md` is already represented in the Rules tab (as a managed entry); duplicating it in Memory would confuse the source-of-truth model.

3. **Tools enumeration: built-ins + active MCP tools.** Read the session's actual tool surface, not a static const. Pull MCP tools from the spawned session's MCP config (`.mcp.json` + project / global registrations). Built-in list still hand-curated but expanded to match Claude Code 2.1.x (current hardcoded set is missing `Agent`, `ExitPlanMode`, `AskUserQuestion`, `NotebookEdit`, `Skill`, `ToolSearch`, `MCP*` namespaces).

4. **Mentions data path: existing `useAgentChatContext` hook.** No new hook, no new IPC. Just thread the existing mention list through `AgentChatComposer` → `ComposerContextPreview` → `useContextPreview`.

5. **Memory IPC: read-only barrel.** New channels `memory:list` (returns the parsed `MEMORY.md` index) and `memory:read` (returns a single entry's content). Memory mutation (write/delete) is out of scope; user keeps editing via their normal text-editor flow.

### Open questions for next agent

- Tools enumeration — is there an existing tool-surface emitter on the agent-events stream we can subscribe to (the way Rules uses `loadedRules`)? Check `AgentEventsContext` and the `system { subtype: 'init' }` event payload before adding a new IPC. If yes, reuse; if no, build a minimal IPC.
- Memory entry expansion — clicking a Memory item could open it for inline preview. Decide whether to scope that into Wave 63 or punt to a follow-up (recommend punt — keeps the wave tight).
- Should disabled MCP servers (`enabled: false` in `.mcp.json`) be hidden from Tools, or shown with a "disabled" badge? Recommend show-with-badge so the user understands why a tool they expect isn't there.

## Scope

**In scope:**

- Wire `mentionLabels` from `useAgentChatContext` into `ComposerContextPreview`.
- Expand the built-in tool list in `useContextPreview.ts` to match Claude Code 2.1.x reality.
- Read MCP tools from the session's effective MCP config; merge with built-ins for the Tools tab.
- New IPC channels `memory:list` and `memory:read` in `src/main/ipc-handlers/`.
- New main-process module `src/main/memory/memoryReader.ts` (parser for `MEMORY.md` + index entries).
- New renderer hook `useMemoryEntries(projectRoot)` that subscribes to changes.
- New builder `buildMemoryItems` in `useContextPreview.ts`.
- Empty-state messaging update for tabs that legitimately have nothing (no MCP tools registered, no MEMORY.md present, etc.).
- Manual smoke checklist for the popover (covers all six newly-touched tabs).

**Out of scope:**

- Toggling Tools or Memory entries.
- Writing/editing memory entries from the popover.
- Memory drill-down inline preview.
- Search/filter within any tab.
- Wiring this popover into the IDE-shell variant — chat-only only, same as today.
- Telemetry on tab usage.

## Phases

| Phase | Topic                       | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | ADR                         | Write `roadmap/decisions/wave-63.md` capturing the read-only-v1, project-scoped-memory, mention data path, and tools-from-MCP decisions.                                                                                                                                                                                                                     |
| A     | Mentions wiring             | Pass `mentionLabels` from `AgentChatComposer` (which already has `useAgentChatContext` data) through to `ComposerContextPreview`. Update tests to assert mentions render.                                                                                                                                                                                    |
| B     | Built-in tools refresh      | Update `BUILT_IN_TOOLS` in `useContextPreview.ts` to match Claude Code 2.1.x. Add inline comment with the version this list was last verified against so future drift is visible.                                                                                                                                                                            |
| C     | MCP tools enumeration       | Read effective MCP config (project + global merge per Claude Code resolution rules). Build a `buildMcpToolItems(mcpServers)` helper. Merge with built-ins in the Tools tab. Disabled servers render with a "disabled" badge.                                                                                                                                 |
| D     | Memory backend              | New `src/main/memory/memoryReader.ts` — parses `MEMORY.md` index entries (markdown sections + bullet links). New IPC channels `memory:list` and `memory:read`. Path resolution: `~/.claude/projects/<sanitized-cwd>/memory/MEMORY.md`. Use the same path-sanitization Claude Code itself uses (replace `:` and `\` with `-`). Unit tests against a temp dir. |
| E     | Memory frontend             | New hook `useMemoryEntries(projectRoot)`. New `buildMemoryItems` in `useContextPreview.ts`. Wire into `ComposerContextPreview`. Tests for the hook + builder.                                                                                                                                                                                                |
| F     | Empty-state polish          | Update `EMPTY_TAB_MESSAGES` so each "empty" tab gives an honest reason — "No MCP servers configured" vs "No memory entries for this project" vs "No @mentions in this prompt" vs the existing "Memory not yet wired" placeholder (which goes away).                                                                                                          |
| G     | Manual smoke + result brief | Smoke checklist covers: popover Mentions populates after typing `@`, Tools shows real surface (including any MCP server you have registered), Memory lists entries from your project memory dir, Skills/Files/System unchanged. Sign in `roadmap/auto-briefs/wave-63-result.md`.                                                                             |

## Risks

| Risk                                                                      | Mitigation                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP config resolution diverges from Claude Code's actual resolution rules | Read the same files Claude Code reads (`.mcp.json` at project root, plus user-scoped MCP registrations), in the same precedence order. Match by reverse-engineering, not by reinventing — the existing `src/main/internalMcp/` and `src/main/codemode/` already do this for other purposes; reuse helpers. |
| `MEMORY.md` parser brittleness on user-edited files                       | Treat malformed entries as warnings, not errors. Skip unparseable bullet lines, log a warn, continue. The parser is read-only — bad input never corrupts state.                                                                                                                                            |
| The popover gets visually crowded with many MCP tools                     | Optional: collapse MCP tools by server (one row per server with a count, expand on click). Defer if complexity cost > benefit; v1 can show flat list.                                                                                                                                                      |
| Memory tab fires for every project root change                            | The `useMemoryEntries` hook should debounce reads via the same watcher pattern as `useFilesystemDisabledRuleIds`. No polling.                                                                                                                                                                              |
| Built-in tool list drifts again (the current static list is stale)        | Add a CLAUDE.md note on the file to cite the version it was verified against. Bump on each Claude Code minor.                                                                                                                                                                                              |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-63.md`.
- [ ] `npm test` passes; new unit tests for `memoryReader`, IPC handlers, and the new builders.
- [ ] In chat-only mode, with at least one `@mention` typed, the Mentions tab populates within ~200ms of selection.
- [ ] With at least one MCP server registered (project or user scope), the Tools tab shows the server's tools.
- [ ] With `~/.claude/projects/<this-project>/memory/MEMORY.md` present, the Memory tab lists its index entries; with the file absent, the tab shows "No memory entries for this project."
- [ ] All six previously-broken / hardcoded tabs reflect real session state.
- [ ] No regressions in the Rules tab (Wave 62 functionality).
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-63-result.md`.

## Out-of-wave follow-ups

- Tool toggling via `--allowedTools` / `--disallowedTools` CLI flags (likely Wave 64).
- Memory entry inline preview (click → drawer with the file's content).
- Memory entry write/delete from popover (would need a parallel of Wave 62's filesystem-toggle pattern).
- Search/filter input above each tab's item list (universal, not tab-specific).
- Wiring the popover into the IDE-shell variant for parity (currently chat-only only).
- Resurrecting the upstream Claude Code subagent-truncation investigation ([anthropics/claude-code#54018](https://github.com/anthropics/claude-code/issues/54018)) — orthogonal to this wave but the user reported the issue still bites sonnet-implementer specifically; tracking outside the wave system.

## Files the next agent should read first

1. `src/renderer/hooks/useContextPreview.ts` — the model builder; new `buildMemoryItems` and updated `BUILT_IN_TOOLS` go here.
2. `src/renderer/components/AgentChat/ComposerContextPreview.tsx` — the wiring point; mentions + memory plumbing land here.
3. `src/renderer/components/AgentChat/useAgentChatContext.ts` — source of truth for active mentions; thread to popover.
4. `src/main/internalMcp/` and `src/main/codemode/` — existing MCP-config readers; reuse helpers for Tools enumeration.
5. `~/.claude/projects/<slug>/memory/MEMORY.md` (a real one in this project) — sample shape for the parser.
6. `roadmap/wave-62-rule-toggles.md` and `roadmap/decisions/wave-62.md` — recent wave shape and tone.
7. `src/main/ipc-handlers/CLAUDE.md` — IPC handler conventions (response shape, path-security, channel naming).

## Verification (end-to-end)

1. `npm run dev`. Open chat-only workbench.
2. **Mentions:** type `@somefile.ts` in the composer, select the autocomplete result. Open popover → Mentions tab populates the selection. Remove the mention chip → popover updates.
3. **Tools:** with at least one MCP server registered (`.mcp.json` or user-scoped), open popover → Tools tab. Built-ins should match the current Claude Code reality. MCP tools should appear under their server name. A disabled server should show a "disabled" badge.
4. **Memory:** create `~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md` with sample bullet entries (or use the real one already there). Open popover → Memory tab lists each entry's name + description. Delete a memory file referenced in the index → tab updates within watcher debounce.
5. **Skills/Files/System:** confirm they still render correctly (no regressions).
6. **Rules:** confirm Wave 62 toggles still work (regression check).
7. `npx vitest run src/renderer/hooks src/renderer/components/AgentChat src/main/memory` for the new + touched tests.
8. Full `npm test` + `npm run build` once before push.

## A note to the next agent on tone

This wave is a coverage wave, not a vision wave. Resist the urge to add toggling, search, drill-down, or telemetry — those are listed as out-of-wave follow-ups specifically so they don't leak in. The user's framing was "what works and what doesn't" — fix what doesn't, in order of size: Mentions (5 min) → Tools (1-2 hrs) → Memory (a few hrs).

Default to read-only displays. Default to reusing existing data sources before adding new IPC. Default to the same patterns Wave 62 used (filesystem watcher + debounced refresh, encoded ids if you need scope, fail-soft parsing).

The Memory parser is the only piece with real design surface — treat it like a small subsystem of its own (parser + tests + IPC). Everything else is plumbing.
