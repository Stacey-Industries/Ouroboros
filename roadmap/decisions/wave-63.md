# Wave 63 — ADR: Popover Tab Coverage

**Status:** LOCKED 2026-04-30 by orchestrator + user.
**Plan:** `roadmap/wave-63-popover-tab-coverage.md`

---

## Decision 1: Read-only display for Tools and Memory in v1

**Context:** The Mentions / Tools / Memory tabs are currently stubs or stale. We could ship them as read-only displays now, or hold the wave until toggling/editing is also designed. Toggling tools requires either Claude Code CLI `--allowedTools`/`--disallowedTools` integration or per-spawn settings shadowing; editing memory requires write paths into `MEMORY.md` and per-entry files.

**Pick:** Read-only v1 — show, don't toggle.

**Rationale:** The popover's claim is "what gets sent with the next prompt." Today that claim is false for three tabs. Honesty (display-first) closes the gap immediately; toggling is a meaningful but separable surface that benefits from independent design (allowed/disallowed semantics, per-session vs per-thread scope, persistence model). Bundling them blocks the visibility win on a much larger design problem.

**Consequences:** No new write IPC for memory; no `--allowedTools` plumbing in Wave 63. Out-of-wave follow-ups list both. Tools tab shows everything that *would* fire; Memory tab shows everything that *could* be retrieved — neither is mutable from the popover yet.

---

## Decision 2: Memory source — project-scoped only, no User sub-tab

**Context:** Three plausible memory sources to surface:

- **(a) Project-scoped:** `~/.claude/projects/<sanitized-cwd>/memory/MEMORY.md` and the entry files it links to. The auto-memory system the assistant uses today.
- **(b) Global:** a hypothetical `~/.claude/memory/MEMORY.md` paralleling the project one.
- **(c) `~/.claude/CLAUDE.md`** — the user's global instructions file, which acts as durable global "memory" in spirit.

**Pick:** (a) only. No User/Project sub-tab.

**Rationale:** Verified at orchestration time that `~/.claude/memory/` does not exist — the global memory dir is hypothetical, not real. (c) is already surfaced in the Rules tab as a managed entry; duplicating it under Memory would muddle the source-of-truth model (one entry, two tabs, two places to "manage" it). Single flat list of project-scoped entries matches the actual data model.

**Consequences:** Memory tab uses a single list, no sub-tab scaffolding. Path resolution: replace `:` and `\` (Windows) or `/` (Unix) and spaces with `-` in `process.cwd()`, prefix with `~/.claude/projects/`, append `/memory/MEMORY.md`. Verified against the real directory `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\` (drive colon, two backslashes, all → `-`). If a global memory dir is ever introduced, a User/Project sub-tab is a clean follow-up.

---

## Decision 3: Mentions data path — reuse `useAgentChatContext`, no new IPC

**Context:** The `mentionLabels: []` hardcode in `ComposerContextPreview.tsx:169` is the visible bug. Two ways to fix it:

- **(a)** Add a new IPC that the popover queries on open, returning the current mention selections.
- **(b)** Thread the existing `useAgentChatContext` mention list through `AgentChatComposer` → `ComposerContextPreview` → `useContextPreview`.

**Pick:** (b).

**Rationale:** The data already exists in renderer state — `useAgentChatContext` is the source of truth for active composer mentions. A new IPC would duplicate state across the main/renderer boundary and risk drift. Plumbing through props is mechanical and matches how `loadedRules` flows in Wave 62.

**Consequences:** No new IPC channel. One additional prop on `ComposerContextPreview`. `useContextPreview` gains a `buildMentionItems` helper. Removing a mention chip causes the popover to update on the next render — no manual refresh.

---

## Decision 4: Tools enumeration — live init event preferred, MCP config as fallback

**Context:** The Tools tab currently uses a static `BUILT_IN_TOOLS` const that is stale (missing `Agent`, `ExitPlanMode`, `AskUserQuestion`, `NotebookEdit`, `Skill`, `ToolSearch`, MCP namespaces). Two enumeration paths:

- **(a) Live:** Subscribe to the `system { subtype: 'init' }` event, which Claude Code emits with `tools: string[]` and `mcp_servers: [{name, status}]` payloads. Already flows through `claudeStreamJsonRunner` → `onEvent` (used by post-spawn restore at `claudeCodeHelpers.ts:138`); the payload is typed as `[key: string]: unknown` in `streamJsonTypes.ts:42` — present, not consumed.
- **(b) Static:** Read `.mcp.json` (project + user scope) at popover open time and merge with a hand-curated built-in list.

**Pick:** Both — live when a session is active, static otherwise.

**Rationale:** Live is authoritative — it reports exactly what Claude Code resolved for the running session, including any `--strict-mcp-config` scoping. But a chat may not have a live session yet (cold open, between turns) and the user still needs to see what *would* be available. Static is the cold-start fallback; it's not redundant because static can't reflect runtime overrides while live can't reflect "next session."

**Consequences:** Wave 63 must wire both. Live path: extend `StreamJsonSystemEvent` typing to declare `tools` and `mcp_servers`, surface them through the agent-events stream (parallel to `loadedRules`), consume in renderer. Static path: build `buildMcpToolItems(mcpServers)` helper that reads merged MCP config via existing helpers in `src/main/internalMcp/` and `src/main/codemode/`. The renderer prefers live data when present (last-seen init event for the current session), falls back to static otherwise. Built-in list still hand-curated, with an inline comment citing the Claude Code minor it was last verified against.

---

## Decision 5: Memory IPC — read-only barrel, two channels

**Context:** The memory backend needs a read path from main → renderer. Options:

- **(a) Single `memory:get` channel** — returns the full directory contents in one shot.
- **(b) Two channels:** `memory:list` (parsed `MEMORY.md` index) + `memory:read` (single entry by id).
- **(c) Watch-based stream** — push updates on file changes.

**Pick:** (b) plus a filesystem watcher that triggers re-list on change.

**Rationale:** `memory:list` is the popover's primary need; `memory:read` is for the deferred drill-down (see follow-ups in plan). Splitting them means the popover doesn't load entry bodies it never displays. Watcher is the same pattern Wave 62 uses for `useFilesystemDisabledRuleIds` — no polling, debounced refresh.

**Consequences:** Two new IPC channels in `src/main/ipc-handlers/`. New main-process module `src/main/memory/memoryReader.ts` owns the parser and path resolution. Renderer hook `useMemoryEntries(projectRoot)` subscribes to watcher events and re-lists on change. Malformed entries log a warn and are skipped — bad input never corrupts state.

---

## Decision 6: Disabled MCP servers — show with badge, don't hide

**Context:** `.mcp.json` entries can carry `enabled: false`. Two display options:

- **(a)** Hide disabled servers from Tools.
- **(b)** Show them with a "disabled" badge.

**Pick:** (b).

**Rationale:** The user expecting a tool that doesn't appear has no signal *why*. A badge teaches the model — disabled in config, not missing — without requiring a separate inspection trip. Mirrors the "managed" badge pattern from Wave 62 (Rules tab) for the same UX reason: visibility over silence.

**Consequences:** Tools tab supports a per-row badge variant. Disabled servers' tools are listed but greyed out; clicking does nothing in v1 (read-only). When toggling lands in a future wave, the badge becomes interactive.
