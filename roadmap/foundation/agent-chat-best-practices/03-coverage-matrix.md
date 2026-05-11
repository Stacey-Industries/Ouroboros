# Agent Chat — Coverage Matrix

**Last synthesized:** 2026-05-07
**Inputs:** 01-api-based-ides.md, 02-cli-subscription-ides.md, 02b-claude-code-terminal-deepdive.md

---

## Reader's Guide

Each row is a UX feature axis; each column is a tool. Read across a row to see which tools implement a given feature and how well. Read down a column for a quick profile of a single tool.

Cell shorthand: `✓` = present and documented; `✓✓` = present and notably advanced (high-water mark for the axis); `~` = partially present or limited; `✗` = absent; `?` = not documented in the source research; `n/a` = feature doesn't apply to the tool's surface type.

Citation superscripts follow the format `[doc:section]` where doc is `01`, `02`, or `02b` and section is a recognizable heading. Example: `✓[01:cursor-composer]`. When a cell spans multiple docs it uses `+` to separate.

✓✓ ratings are reserved for implementations that meaningfully raise the bar above peers. The goal is roughly 0–2 per row.

---

## Cell Legend

| Symbol | Meaning |
|---|---|
| ✓ | Feature present and documented |
| ✓✓ | Feature present and notably advanced (high-water mark for the axis) |
| ~ | Feature partially present or limited |
| ✗ | Feature absent |
| ? | Not documented in source research / could not verify |
| n/a | Feature doesn't apply to this tool's surface |

---

## The Matrix

Columns: Axis · Cursor · Windsurf · Copilot · Kiro · Cline · Continue · Zed · Aider · v0 · Bolt · Replit · Claude Code (CLI) · Piebald · Goose · OpenCode

---

### Composer

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1. Composer engine** | Rich textarea[01:cursor-composer] | Plain textarea[01:windsurf-composer] | Standard textarea[01:copilot-composer] | ?[01:kiro-composer] | Textarea[01:cline-composer] | Standard textarea[01:continue-composer] | Message editor[01:zed-composer] | TTY readline[01:aider-composer] | Chat input box[01:v0-composer] | Chat input[01:bolt-composer] | NL textarea[01:replit-composer] | TTY readline; VS Code extension richer[02:cc-composer] | Rich text input[02:piebald-composer] | NL chat; CLI readline[02:goose-composer] | TUI with syntax highlight[02:opencode] |
| **2. Multi-line input** | ~drag/drop; unclear composer shortcut[01:cursor-composer] | ?[01:windsurf-composer] | ✓ multi-turn history[01:copilot-composer] | ?[01:kiro-composer] | ✓ paste[01:cline-composer] | ✓[01:continue-composer] | ✓ shift-alt-escape expands[01:zed-composer] | ✓ `/editor` command opens $EDITOR[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓✓ `/editor`, heredoc, backslash continuation[02b:composer] | ✓ with history nav[02:piebald-composer] | ✓[02:goose-composer] | ✓[02:opencode] |
| **3. Image / file paste** | ✓ PNG/JPG/GIF/WebP/SVG; drag-drop[01:cursor-composer] | ✗[01:windsurf-composer] | ✓ images; #file references[01:copilot-composer] | ?[01:kiro-composer] | ✓ images for mockups/screenshots[01:cline-composer] | ? (not documented)[01:continue-composer] | ✓✓ paste clipboard, drag from FS, @-mention image files; auto-formats multi-line pastes as @-mentions[01:zed-composer] | ✓ `/paste` clipboard; `/add` image files; `/web` URL→Markdown[01:aider-composer] | ✓ screenshots + Figma files[01:v0-composer] | ✓ Figma drag-in; AI images[01:bolt-composer] | ?[01:replit-composer] | ~ Ctrl+V (macOS/Linux); Windows broken; file path method reliable[02b:A3] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **4. Drag-and-drop attachments** | ✓ files/folders from explorer[01:cursor-composer] | ? (not documented)[01:windsurf-composer] | ? (not documented)[01:copilot-composer] | ?[01:kiro-composer] | ✗[01:cline-composer] | ?[01:continue-composer] | ✓ drag from file system[01:zed-composer] | ✗ (file-path or `/add`)[01:aider-composer] | ?[01:v0-composer] | ✓ Figma drag-in[01:bolt-composer] | ?[01:replit-composer] | ~ drag into terminal (terminal-dependent)[02b:A3] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **5. Markdown preview in composer** | ?[01:cursor-composer] | ?[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ?[01:cline-composer] | ?[01:continue-composer] | ?[01:zed-composer] | ✗ terminal only[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✗ TTY[02b:composer] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |

---

### Mentions (@)

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **6. @files** | ✓ `@file`, `@folder`[01:cursor-composer] | ✓ `@file`, `@folder`[01:windsurf-composer] | ✓ `#file`, `#folder`[01:copilot-composer] | ?[01:kiro-composer] | ✓ `@file`, `@folder`[01:cline-composer] | ✓ `@File`, `@Folder`, `@Open`[01:continue-composer] | ✓ files + directories by path[01:zed-composer] | ~ `/add` and `/drop` (explicit, not inline @)[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `@` typeahead for files (VS Code ext + TTY)[02b:composer] | ✓ file @-mentions in composer[02:piebald-composer] | ?[02:goose-composer] | ✓ file @-mentions[02:opencode] |
| **7. @symbols / functions / classes** | ?[01:cursor-composer] | ?[01:windsurf-composer] | ✓ `#` for symbols[01:copilot-composer] | ?[01:kiro-composer] | ?[01:cline-composer] | ✓ implicit via agent-mode codebase awareness[01:continue-composer] | ✓ `@` symbols: functions, classes, variables[01:zed-composer] | ~ repository map gives model symbol-level awareness; no @-mention UX[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ?[02b:composer] | ?[02:piebald-composer] | ?[02:goose-composer] | ✓ LSP integration (~50ms symbol nav)[02:opencode] |
| **8. @docs / docs.url** | ✓ `@docs` (indexed external docs)[01:cursor-composer] | ✓ `@docs`[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ✓ `@url` fetches URL as Markdown[01:cline-composer] | ~ `@Docs` deprecated; replaced by Context7 MCP[01:continue-composer] | ?[01:zed-composer] | ✓ `/web` scrapes URL to Markdown[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `WebFetch` tool; `@path` imports in CLAUDE.md[02:cc-context] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **9. @web / web search** | ✓ `@web` live search[01:cursor-composer] | ✓ web search (documented as Cascade tool)[01:windsurf-dispatch] | ✓ `#fetch` URL tool[01:copilot-composer] | ?[01:kiro-composer] | ?[01:cline-composer] | ✓ `@Web` (up to 6 results, default); `@Google` via Serper API[01:continue-composer] | ?[01:zed-composer] | ✓ `/web` + web is a tool in architect mode[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ✓ Web Search as advanced option[01:replit-context] | ✓ `WebSearch` built-in tool[02b:dispatch] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **10. @past-conversation / @memory** | ~ `@notepad/<name>` (user-authored, explicit pull)[01:cursor-context] | ✓ `@` previous conversations (retrieves summaries + checkpoints)[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ?[01:cline-composer] | ?[01:continue-composer] | ✓ `@thread` reference past conversations; Inline Assistant can ref agent threads[01:zed-composer] | ✗[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `/memory` shows CLAUDE.md + auto-memory; auto-memory auto-loaded[02b:context] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **11. @MCP-tool-result** | ✓ MCP tools accessible in agent[01:cursor-context] | ✓ MCP as documented Cascade tool[01:windsurf-dispatch] | ✓ MCP-backed agents[01:copilot-context] | ?[01:kiro-composer] | ✓ MCP integration[01:cline-context] | ✓ MCP context provider[01:continue-composer] | ?[01:zed-composer] | ✗[01:aider-composer] | ?[01:v0-composer] | ✓ MCP (Notion, Linear, GitHub, etc.)[01:bolt-context] | ?[01:replit-composer] | ✓✓ full MCP: stdio/HTTP/SSE; scoped per subagent; dynamic tool updates[02b:mcp] | ✓[02:piebald-context] | ✓ 70+ extensions (MCP-based)[02:goose-context] | ✓[02:opencode] |
| **12. @diff / @commit / @PR** | ?[01:cursor-composer] | ?[01:windsurf-composer] | ✓ `#terminalSelection`, Git diff[01:copilot-composer] | ?[01:kiro-composer] | ?[01:cline-composer] | ✓ `@Git Diff` (branch changes); `@GitLab MR`[01:continue-composer] | ?[01:zed-composer] | ~ `/diff` shows diff since last message[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `/diff` interactive viewer; `/review [PR]`; `/security-review`[02b:A2] | ?[02:piebald-composer] | ?[02:goose-composer] | ✓ GitHub Actions support[02:opencode] |
| **13. Mention chip rendering / autocomplete UX** | ✓ `@` opens context picker[01:cursor-composer] | ✓ `@` opens dropdown[01:windsurf-composer] | ✓ `@` for participants, `#` for context refs[01:copilot-composer] | ?[01:kiro-composer] | ✓ `@` shortcuts documented[01:cline-composer] | ✓ `@` opens provider dropdown[01:continue-composer] | ✓ `@` typeahead[01:zed-composer] | ✗ (no @-mention system)[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `@` typeahead with plugin-namespaced agents[02b:composer] | ✓ @-mention in composer[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |

---

### Slash Commands (/)

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **14. Built-in slash command count** | ~6 documented; likely more[01:cursor-composer] | ✗ not documented[01:windsurf-composer] | ~ `/plan`; others not enumerated[01:copilot-composer] | ✗[01:kiro-composer] | ✗[01:cline-composer] | ~ user-defined focus; few built-ins[01:continue-composer] | ~ from agent server (variable)[01:zed-composer] | ✓✓ 40+ built-in commands fully enumerated[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ 60+ built-in commands enumerated[02b:A2] | ✓ slash commands available[02:piebald-composer] | ? (Recipes, not slash commands)[02:goose-composer] | ✓[02:opencode] |
| **15. Custom user-authored slash commands** | ✓✓ `.cursor/commands/*.md`; introduced v1.6[01:cursor-composer] | ✗[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ✗[01:cline-composer] | ✓ `config.yaml` custom slash commands[01:continue-composer] | ~ available via agent server[01:zed-composer] | ✗ (no custom slash system; use `/load` for scripting)[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `~/.claude/commands/` (user) + `.claude/commands/` (project); identical to skills format[02b:context] | ✓[02:piebald-composer] | ✓ Recipes (YAML)[02:goose-context] | ✓[02:opencode] |
| **16. Project-level (per-repo) slash commands** | ✓ `.cursor/commands/` scoped to repo[01:cursor-composer] | ✗[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ✗[01:cline-composer] | ✓ workspace-level `config.yaml`[01:continue-composer] | ?[01:zed-composer] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `.claude/commands/` + `.claude/skills/` both project-scoped; full priority hierarchy[02b:context] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **17. Slash commands with arguments** | ✓ text after command name is args[01:cursor-composer] | n/a | ?[01:copilot-composer] | n/a | n/a | ✓ invokable with args[01:continue-composer] | ?[01:zed-composer] | ✓ e.g. `/add <file>`, `/web <url>`[01:aider-composer] | n/a | n/a | n/a | ✓✓ `argument-hint` frontmatter; `$ARGUMENTS`, `$ARGUMENTS[N]`, named args[02b:context] | ✓[02:piebald-composer] | ✓ Recipes with parameters[02:goose-context] | ✓[02:opencode] |
| **18. Bundled "skills" or "recipes" surfacing as slash commands** | ✓ Agent Skills (nightly; SKILL.md files)[01:cursor-context] | ✗[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ✗[01:cline-composer] | ✗[01:continue-composer] | ?[01:zed-composer] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ bundled: `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`; lazy-loaded, survive compaction[02b:context] | ✓ Agent Skills (agentskills.io standard)[02:piebald-context] | ✓ Recipes (YAML); can launch by name[02:goose-context] | ?[02:opencode] |

---

### Context Preview / System Surfacing

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **19. Discrete popover listing what model sees** | ~ Plan Mode shows editable plan of files/TODOs[01:cursor-context] | ✗[01:windsurf-context] | ✓✓ Chat Debug view: raw system prompt + user prompt + context + tool payloads[01:copilot-context] | ✗[01:kiro-composer] | ✗[01:cline-composer] | ✗[01:continue-composer] | ~ token count near profile selector[01:zed-streaming] | ~ `/tokens` reports count; `/map` shows repo map; `/ls` lists files[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓ `/context` colored grid + optimization suggestions; `/memory` lists all CLAUDE.md files loaded[02b:A5] | ?[02:piebald-context] | ?[02:goose-composer] | ?[02:opencode] |
| **20. Per-entry disable toggle in popover** | ✗[01:cursor-context] | ✗[01:windsurf-context] | ?[01:copilot-context] | ✗[01:kiro-composer] | ✗[01:cline-composer] | ✗[01:continue-composer] | ✗[01:zed-composer] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ~ `claudeMdExcludes` setting (glob); `/memory` toggle auto-memory[02b:context] | ?[02:piebald-context] | ?[02:goose-composer] | ?[02:opencode] |
| **21. System prompt visibility** | ✗[01:cursor-context] | ✗[01:windsurf-context] | ✓✓ Chat Debug view shows raw system prompt[01:copilot-context] | ✗[01:kiro-composer] | ✗[01:cline-composer] | ✗[01:continue-composer] | ✗[01:zed-composer] | ~ `/settings` prints config; no full prompt view[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓ `/status` shows settings sources + origin; `--append-system-prompt` exposes injection point[02b:config] | ✓ full manual system prompt control[02:piebald-context] | ?[02:goose-composer] | ?[02:opencode] |
| **22. Token-budget display in composer / popover** | ~ "Context usage breakdown visualization" (changelog, May 2026; details sparse)[01:cursor-streaming] | ✗[01:windsurf-streaming] | ✗[01:copilot-streaming] | ✗[01:kiro-composer] | ✓ token + cost tracking visible[01:cline-streaming] | ✗[01:continue-composer] | ✓ token count near profile selector; banner at limit[01:zed-streaming] | ✓ `/tokens` reports count; cost tracking during streaming[01:aider-streaming] | ✗[01:v0-streaming] | ✗[01:bolt-streaming] | ✗[01:replit-streaming] | ✓ `/usage` (session cost, plan bars, activity stats); `/context` for context-pressure grid[02b:A5] | ✓ HTTP traffic inspector (Pro; SSE chunks + headers)[02:piebald-streaming] | ✗[02:goose-streaming] | ?[02:opencode] |

---

### Skills, Sub-Agents, Modes

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **23. Skill / sub-agent catalog (user-extensible)** | ~ Agent Skills (nightly; SKILL.md)[01:cursor-context] | ~ Workflows (limited docs)[01:windsurf-context] | ✓ custom MCP-backed agents[01:copilot-context] | ✗[01:kiro-composer] | ✗[01:cline-composer] | ✓ custom commands + MCP tools[01:continue-composer] | ~ via external agent ACP[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `.claude/agents/` + `~/.claude/agents/`; full frontmatter schema; priority hierarchy; `/agents` UI[02b:subagents] | ✓ Profiles + Agent Skills[02:piebald-context] | ✓✓ 70+ extensions; Recipes; full UI in Desktop; YAML-first[02:goose-context] | ✓ plugin system[02:opencode] |
| **24. Built-in agent / mode catalog** | ✓ Background Agents, Cloud Agents, Plan Mode[01:cursor-context] | ✓ Chat mode, Code (Write) mode[01:windsurf-surface] | ✓ `@workspace`, `@vscode`, `@terminal`, Plan agent, Agent mode[01:copilot-context] | ✓ Agentic Chat (Vibe), Specs, Hooks[01:kiro-surface] | ✗ (single mode)[01:cline-composer] | ✓ Chat + Agent mode[01:continue-context] | ✓ Agent Threads, Text Threads, External Agents[01:zed-surface] | ✓ `/code`, `/ask`, `/architect`, watch mode[01:aider-composer] | ✓ Intelligent Agent + web chat[01:v0-surface] | ✓ Autonomous agent[01:bolt-surface] | ✓ Economy / Power / Turbo; Plan vs. Build mode[01:replit-surface] | ✓✓ 5 built-in subagents; 6 permission modes; `--agent` whole-session mode[02b:subagents] | ✓ Plan Mode + per-chat profiles[02:piebald-dispatch] | ✓ Desktop + CLI; ACP provider mode[02:goose-surface] | ✓ multiple modes[02:opencode] |
| **25. Tier-locked agents (model selection per agent)** | ?[01:cursor-context] | ?[01:windsurf-context] | ?[01:copilot-context] | ?[01:kiro-composer] | ?[01:cline-composer] | ✓ `capabilities` per model in config[01:continue-context] | ✓ model selection per external agent[01:zed-context] | ✓ `/model`, `/weak-model`, `/editor-model` per session[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓✓ `model` frontmatter per agent; resolution order: env var → invocation param → frontmatter → parent[02b:subagents] | ✓ per-profile model selection[02:piebald-context] | ✓ model per ACP provider[02:goose-context] | ?[02:opencode] |
| **26. Tool-restricted agents (an agent can only use tools X, Y)** | ?[01:cursor-context] | ?[01:windsurf-context] | ?[01:copilot-context] | ?[01:kiro-composer] | ?[01:cline-composer] | ?[01:continue-composer] | ?[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `tools` allowlist + `disallowedTools` denylist per agent; compound logic; built-in `Explore` is read-only[02b:subagents] | ✓ per-chat + per-profile tool enable/disable[02:piebald-dispatch] | ✓ tool permission controls per extension[02:goose-dispatch] | ?[02:opencode] |
| **27. Parallel sub-agent dispatch** | ✓ Background Agents run in parallel (v3.0)[01:cursor-dispatch] | ✗[01:windsurf-dispatch] | ?[01:copilot-dispatch] | ✓✓ Specs waves: independent tasks concurrently; dependent tasks sequentially[01:kiro-dispatch] | ✗[01:cline-composer] | ✗[01:continue-composer] | ✓ multiple concurrent threads[01:zed-threading] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✓ sub-agents for specialized tasks (Agent 3)[01:replit-context] | ✓ `background: true` frontmatter; Ctrl+B; `/batch` spawns per-unit background agents in isolated worktrees[02b:subagents] | ✓ parallel sessions sidebar[02:piebald-threading] | ✓ sub-agents in parallel; ACP server mode[02:goose-dispatch] | ?[02:opencode] |
| **28. Multi-level (nested) sub-agents** | ?[01:cursor-context] | ?[01:windsurf-context] | ?[01:copilot-context] | ?[01:kiro-composer] | ?[01:cline-composer] | ?[01:continue-composer] | ?[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✓ Agent 3 spawns subagents[01:replit-context] | ~ explicitly blocked for normal subagents; workaround: skills with `context: fork`; `--agent` main-thread CAN spawn[02b:subagents] | ~ documented as supported; details sparse[02:piebald-dispatch] | ✓ sub-agents coordinated by main session[02:goose-dispatch] | ?[02:opencode] |

---

### Memory / Rules

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **29. Global memory file (cross-project)** | ✓ User Rules (global, applies all projects)[01:cursor-context] | ✓ Global rules (Quick Settings)[01:windsurf-context] | ✓ custom instructions in settings[01:copilot-context] | ✓ `~/.kiro/steering/`[01:kiro-context] | ✗[01:cline-context] | ✓ user-level `config.yaml`[01:continue-context] | ~ CLAUDE.md in project root when using Claude Agent[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `~/.claude/CLAUDE.md`; managed policy CLAUDE.md (MDM/GPO); `~/.claude/rules/` global rules[02b:context] | ?[02:piebald-context] | ✓ `~/.config/goose/.goosehints` global[02:goose-context] | ?[02:opencode] |
| **30. Project memory file** | ✓ `.cursor/rules/`; AGENTS.md[01:cursor-context] | ✓ `.windsurfrules`[01:windsurf-context] | ✓ `.github/copilot-instructions.md`[01:copilot-context] | ✓ `.kiro/steering/` (Workspace scope)[01:kiro-context] | ✗[01:cline-context] | ✓ workspace `config.yaml`[01:continue-context] | ~ CLAUDE.md (via Claude Agent)[01:zed-context] | ~ `.aider.conf.yml` (settings only, not instructions)[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `./CLAUDE.md` + `./.claude/CLAUDE.md`; `CLAUDE.local.md`; `.claude/settings.json`[02b:context] | ✓ AGENTS.md[02:piebald-context] | ✓ `.goosehints` + `AGENTS.md`[02:goose-context] | ?[02:opencode] |
| **31. Nested-folder memory inheritance** | ✓ AGENTS.md works in subdirectories[01:cursor-context] | ~ workspace rules with glob[01:windsurf-context] | ?[01:copilot-context] | ✓ `.kiro/steering/` with Always/Conditional/Auto loading[01:kiro-context] | ✗[01:cline-context] | ?[01:continue-composer] | ?[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ directory-tree walk from root to cwd; subdirectory CLAUDE.md files load on-demand when Claude reads files there[02b:context] | ?[02:piebald-context] | ✓ nested `.goosehints` in subdirectories[02:goose-context] | ?[02:opencode] |
| **32. Glob-attached rules (rule fires when path matches)** | ✓ YAML frontmatter glob in `.cursor/rules/`[01:cursor-context] | ✓ glob on workspace rules[01:windsurf-context] | ✓ `chat.tools.edits.autoApprove` glob patterns[01:copilot-approval] | ✓ Conditional loading via glob in `.kiro/steering/`[01:kiro-context] | ✗[01:cline-context] | ?[01:continue-composer] | ?[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ `.claude/rules/` with `paths:` YAML frontmatter; triggers when Claude reads matching file (not on every tool use)[02b:context] | ?[02:piebald-context] | ?[02:goose-context] | ?[02:opencode] |
| **33. Per-rule disable toggle** | ~ `alwaysApply: false` effectively disables[01:cursor-context] | ?[01:windsurf-context] | ?[01:copilot-context] | ? (frontmatter controls when a rule loads)[01:kiro-context] | n/a | ?[01:continue-composer] | ?[01:zed-context] | n/a | n/a | n/a | n/a | ✓ `claudeMdExcludes` glob; `/memory` toggle; `disableAllHooks`[02b:config] | ?[02:piebald-context] | ?[02:goose-context] | ?[02:opencode] |
| **34. Auto-memory write (model proposes new memory)** | ✗[01:cursor-context] | ✓✓ Cascade autonomously generates workspace-scoped memories; Memories Panel for review[01:windsurf-context] | ✗[01:copilot-context] | ✗[01:kiro-context] | ✗[01:cline-context] | ✗[01:continue-context] | ✗[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓✓ auto-memory writes to `~/.claude/projects/<repo>/memory/MEMORY.md`; default-on since v2.1.59; subagents can have own memory[02b:context] | ✗[02:piebald-context] | ~ community meta-pattern: ask Goose to write its own `.goosehints`; not a native feature[02:goose-context] | ✗[02:opencode] |
| **35. Memory inline preview (popover → drawer)** | ✗[01:cursor-context] | ✓ Memories Panel accessible when Cascade makes a memory[01:windsurf-context] | ✗[01:copilot-context] | ?[01:kiro-context] | ✗[01:cline-context] | ✗[01:continue-context] | ✗[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✗[01:bolt-composer] | ✗[01:replit-composer] | ✓ `/memory` command lists all loaded CLAUDE.md + rules + auto-memory entries[02b:context] | ?[02:piebald-context] | ?[02:goose-context] | ?[02:opencode] |

---

### Files / File Tree

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **36. Pin file to chat context** | ✓ `@file` explicit pin[01:cursor-composer] | ✓ `@file`[01:windsurf-composer] | ✓ `#file`[01:copilot-composer] | ?[01:kiro-composer] | ✓ `@file`[01:cline-composer] | ✓ `@File`; `@Open` with `onlyPinned: true`[01:continue-composer] | ✓ `@` files[01:zed-composer] | ✓ `/add`; `/read-only` for reference-only[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | ✓ `@` typeahead (TTY + VS Code ext); `--add-dir` for directories[02b:composer] | ✓ file @-mentions[02:piebald-composer] | ?[02:goose-context] | ✓[02:opencode] |
| **37. File tree change indicators (M / A / D after agent edits)** | ?[01:cursor-diff] | ?[01:windsurf-diff] | ?[01:copilot-diff] | ?[01:kiro-diff] | ?[01:cline-diff] | ?[01:continue-composer] | ~ panel shows "which files and how many lines were edited"[01:zed-dispatch] | n/a (no file tree)[01:aider-diff] | n/a[01:v0-composer] | ?[01:bolt-diff] | n/a | n/a (TTY)[02b:diff] | ?[02:piebald-context] | ?[02:goose-diff] | ?[02:opencode] |
| **38. File tree "open in chat"** | ?[01:cursor-diff] | ?[01:windsurf-diff] | ?[01:copilot-diff] | ?[01:kiro-diff] | ?[01:cline-diff] | ?[01:continue-composer] | ?[01:zed-composer] | n/a[01:aider-diff] | n/a[01:v0-composer] | ?[01:bolt-diff] | n/a | n/a (TTY)[02b:diff] | ✓ clickable file path references[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |
| **39. Drag file from tree to composer** | ✓ drag files/folders from explorer[01:cursor-composer] | ?[01:windsurf-composer] | ?[01:copilot-composer] | ?[01:kiro-composer] | ✗[01:cline-composer] | ?[01:continue-composer] | ✓ drag from file system into composer[01:zed-composer] | ✗[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ?[01:replit-composer] | n/a[02b:composer] | ?[02:piebald-composer] | ?[02:goose-composer] | ?[02:opencode] |
| **40. Heat-map / activity coloring on edited files** | ?[01:cursor-diff] | ?[01:windsurf-diff] | ?[01:copilot-diff] | ?[01:kiro-diff] | ?[01:cline-diff] | ?[01:continue-composer] | ?[01:zed-diff] | ✗[01:aider-diff] | n/a | n/a | n/a | ✗[02b:diff] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |

---

### Diff Views

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **41. Inline-in-editor diff during streaming** | ~ implied; edits suggested and auto-applied[01:cursor-diff] | ?[01:windsurf-diff] | ✓ inline diffs in editor after agent applies changes[01:copilot-diff] | ?[01:kiro-diff] | ✓ diff view shown per file change[01:cline-diff] | ? (likely via VS Code native diff)[01:continue-diff] | ✓ edit diffs appear in singleton buffers[01:zed-diff] | ~ terminal unified diff before apply[02b:A4] | ?[01:v0-diff] | ?[01:bolt-diff] | ?[01:replit-diff] | ✓ terminal unified diff shown before apply (default mode); side-by-side in VS Code ext[02b:diff] | ✓ integrated code editor (Pro)[02:piebald-diff] | ~ desktop app: visual tool confirmations + diff[02:goose-diff] | ✓✓ syntax-highlighted inline diffs[02:opencode] |
| **42. Side-panel / artifact-pane full review** | ?[01:cursor-diff] | ?[01:windsurf-diff] | ?[01:copilot-diff] | ?[01:kiro-diff] | ?[01:cline-diff] | ?[01:continue-diff] | ✓✓ `Shift+Ctrl+R` multi-buffer tab: all pending changes across files in one view[01:zed-diff] | ✗[01:aider-diff] | ✓ diff view file-by-file with line-level detail[01:v0-diff] | ?[01:bolt-diff] | ?[01:replit-diff] | ✓ Desktop app rebuilt diff viewer (April 2026); `/diff` interactive terminal viewer[02b:A4] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |
| **43. Per-hunk accept / reject** | ✗[01:cursor-diff] | ?[01:windsurf-diff] | ✓✓ hover to accept/reject that specific hunk; auto-navigate to next hunk[01:copilot-diff] | ?[01:kiro-diff] | ?[01:cline-diff] | ?[01:continue-diff] | ✓ "each individual change hunk"[01:zed-diff] | ✗[01:aider-diff] | ?[01:v0-diff] | ?[01:bolt-diff] | ?[01:replit-diff] | ? (not documented for TTY; VS Code ext implied)[02b:diff] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |
| **44. Per-file accept / reject** | ~ checkpoint restore is the mechanism[01:cursor-diff] | ?[01:windsurf-diff] | ✓ review individual file diffs and apply selectively[01:copilot-diff] | ?[01:kiro-diff] | ✓ approve each file change individually[01:cline-diff] | ?[01:continue-diff] | ✓ "whole set of changes made by the agent"[01:zed-diff] | ✗ (apply-all then `/undo`)[01:aider-diff] | ?[01:v0-diff] | ?[01:bolt-diff] | ?[01:replit-diff] | ? (implied in VS Code ext; TTY unclear)[02b:diff] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |
| **45. Checkpoints / restore-from-snapshot** | ✓ auto-checkpoints before significant changes; restore UI[01:cursor-diff] | ~ referenced but not described as file-state rollback[01:windsurf-diff] | ✓ auto-snapshots at key points; Undo Last Edit control[01:copilot-diff] | ✗[01:kiro-diff] | ✓✓ step-level workspace snapshots at every agent step; compare + restore[01:cline-diff] | ✗[01:continue-diff] | ✓ "Restore Checkpoint" button per agent edit; worktree isolation[01:zed-diff] | ✓ Git commit per edit; `/undo` reverts last commit[01:aider-diff] | ✗[01:v0-diff] | ?[01:bolt-diff] | ✓ checkpoints; rollback includes DB state[01:replit-diff] | ✓ `/rewind` command (alias `/checkpoint`); git checkpoints[02b:A2] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |
| **46. Git-native (commit-based) safety** | ✗[01:cursor-diff] | ✗[01:windsurf-diff] | ?[01:copilot-diff] | ✗[01:kiro-diff] | ✗[01:cline-diff] | ✗[01:continue-diff] | ✓ worktree isolation available[01:zed-diff] | ✓✓ every AI edit auto-committed with Conventional Commits message; `/undo` = git revert[01:aider-diff] | ✗[01:v0-diff] | ✗[01:bolt-diff] | ✗[01:replit-diff] | ✓ Claude performs git ops via Bash tool; `isolation: "worktree"` per subagent[02b:diff+subagents] | ?[02:piebald-diff] | ?[02:goose-diff] | ?[02:opencode] |

---

### Streaming UX

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **47. Live text streaming** | ?[01:cursor-streaming] | ?[01:windsurf-streaming] | ?[01:copilot-streaming] | ~real-time status updates in Specs[01:kiro-dispatch] | ?[01:cline-streaming] | ?[01:continue-streaming] | ✓ "responses stream in with indicators"[01:zed-streaming] | ✓ TTY streaming[01:aider-streaming] | ✓ real-time preview updates[01:v0-streaming] | ✓ live preview updates[01:bolt-streaming] | ?[01:replit-streaming] | ✓ stdout streaming with spinner + tool label[02b:streaming] | ✓ streamed tool calls with emoji reactions[02:piebald-streaming] | ✓ streaming in Desktop + CLI[02:goose-streaming] | ?[02:opencode] |
| **48. Thinking / reasoning blocks visible** | ✗[01:cursor-streaming] | ✗[01:windsurf-streaming] | ✗[01:copilot-streaming] | ?[01:kiro-streaming] | ✗[01:cline-streaming] | ?[01:continue-streaming] | ✗[01:zed-streaming] | ~ `/think-tokens` sets budget; `/reasoning-effort`; no distinct render[01:aider-streaming] | ✗[01:v0-streaming] | ✗[01:bolt-streaming] | ✓ Extended Thinking option[01:replit-context] | ~ `alwaysThinkingEnabled`; `showThinkingSummaries`; `ultrathink` in skills; not visually prominent in TTY[02b:streaming] | ?[02:piebald-streaming] | ~ "real-time thought processes" (desktop)[02:goose-streaming] | ?[02:opencode] |
| **49. Tool-call interleaving with text** | ?[01:cursor-streaming] | ✓ tool call count tracked; Continue button[01:windsurf-dispatch] | ✓ "every tool invocation transparently displayed"[01:copilot-dispatch] | ?[01:kiro-streaming] | ✓ per-action approval card per tool call[01:cline-dispatch] | ✓ 6-step tool handshake displayed[01:continue-dispatch] | ✓ "indicators showing which tools the model is using"[01:zed-streaming] | ✓ applied files + git commit summary shown[01:aider-streaming] | ?[01:v0-streaming] | ?[01:bolt-streaming] | ?[01:replit-streaming] | ✓ spinner + tool name; `viewMode: verbose` shows all[02b:streaming] | ✓ streamed tool calls[02:piebald-streaming] | ?[02:goose-streaming] | ?[02:opencode] |
| **50. Todo / plan blocks rendered** | ✓ Plan Mode renders editable Markdown plan[01:cursor-dispatch] | ✗[01:windsurf-dispatch] | ✓ Plan agent generates multi-step plan[01:copilot-dispatch] | ✓✓ Specs: three structured documents (requirements, design, tasks); real-time task status[01:kiro-dispatch] | ✗[01:cline-dispatch] | ✗[01:continue-dispatch] | ✗[01:zed-dispatch] | ✗[01:aider-dispatch] | ✗[01:v0-dispatch] | ✗[01:bolt-dispatch] | ✓ ordered task list in Plan Mode[01:replit-dispatch] | ~ `/plan` mode; `ExitPlanMode` tool; no distinct TODO block rendering[02b:streaming] | ✓ Plan Mode[02:piebald-dispatch] | ?[02:goose-dispatch] | ?[02:opencode] |
| **51. Status / "thinking" rotating message** | ?[01:cursor-streaming] | ?[01:windsurf-streaming] | ?[01:copilot-streaming] | ?[01:kiro-streaming] | ?[01:cline-streaming] | ?[01:continue-streaming] | ✓ tool use indicators stream live[01:zed-streaming] | ?[01:aider-streaming] | ✓ "visual progress indicators"[01:v0-streaming] | ✓ live preview updates[01:bolt-streaming] | ?[01:replit-streaming] | ✓ spinner with customizable verbs; `spinnerTipsEnabled`; `spinnerTipsOverride`; `awaySummaryEnabled`[02b:streaming] | ✓ emoji reactions on tool calls[02:piebald-streaming] | ?[02:goose-streaming] | ?[02:opencode] |

---

### Multi-Thread / Threading

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **52. Multiple concurrent chat sessions** | ~ Background/Cloud Agents (v3.0) parallel tasks[01:cursor-threading] | ✗[01:windsurf-threading] | ?[01:copilot-threading] | ?[01:kiro-threading] | ✗[01:cline-threading] | ✗[01:continue-threading] | ✓✓ each thread: own agent, context window, history; Threads Sidebar[01:zed-threading] | ✗ (multiple terminal sessions manual)[01:aider-threading] | ~ project system[01:v0-threading] | ✓ collaborative; team templates[01:bolt-threading] | ✗[01:replit-threading] | ✓ Desktop app shows multiple sessions side-by-side; subagent sessions independent[02:cc-threading] | ✓✓ parallel sessions with sidebar; draft preservation; pending approval persistence across reboots[02:piebald-threading] | ✓ sub-agents run independently in parallel[02:goose-dispatch] | ?[02:opencode] |
| **53. Tab UI for sessions** | ?[01:cursor-threading] | ?[01:windsurf-threading] | ~ Chat view as editor tab[01:copilot-threading] | ?[01:kiro-threading] | ?[01:cline-threading] | ?[01:continue-threading] | ✓ Threads Sidebar with all threads grouped by project[01:zed-threading] | n/a[01:aider-threading] | ?[01:v0-threading] | ?[01:bolt-threading] | ?[01:replit-threading] | ✓ Desktop app multi-session; `/agents` Running tab[02b:subagents] | ✓ sidebar navigation with session status[02:piebald-threading] | ✓ Desktop sidebar[02:goose-surface] | ?[02:opencode] |
| **54. Branch from a prior message** | ✗[01:cursor-threading] | ✗[01:windsurf-threading] | ✗[01:copilot-threading] | ✗[01:kiro-threading] | ✗[01:cline-threading] | ✗[01:continue-threading] | ✓ "New From Summary" seeds new thread from summary of current[01:zed-threading] | ✗[01:aider-threading] | ?[01:v0-threading] | ?[01:bolt-threading] | ✗[01:replit-threading] | ✓ `/branch` (alias `/fork`) creates branch of current conversation[02b:A2] | ✓✓ explicit fork/branch at any turn; duplicate session; Git worktree management[02:piebald-threading] | ✗[02:goose-threading] | ?[02:opencode] |
| **55. History search** | ✗[01:cursor-threading] | ✗[01:windsurf-threading] | ✗[01:copilot-threading] | ✗[01:kiro-threading] | ✗[01:cline-threading] | ✗[01:continue-threading] | ?[01:zed-threading] | ✓ `/save` saves session commands; `/load` replays[01:aider-threading] | ?[01:v0-threading] | ?[01:bolt-threading] | ✗[01:replit-threading] | ✓ `/resume [session]` session picker; `/rename` for naming; auto-generated session names[02b:threading] | ✓ auto-tagging (Pro) + history nav[02:piebald-streaming] | ?[02:goose-threading] | ?[02:opencode] |
| **56. Per-session model / mode override** | ✓ mode picker (agent/plan/ask) per session[01:cursor-dispatch] | ✓ Chat vs. Code mode per session[01:windsurf-surface] | ✓ agent picker per session[01:copilot-dispatch] | ?[01:kiro-surface] | ✗[01:cline-composer] | ✓ model capability in `config.yaml`[01:continue-context] | ✓ model per thread[01:zed-threading] | ✓ `/model`, `/chat-mode` per session[01:aider-composer] | ?[01:v0-composer] | ?[01:bolt-composer] | ✓ Economy/Power/Turbo per session[01:replit-surface] | ✓✓ `/model`, `/effort`, `/permission-mode` all per-session; `Shift+Tab` cycles modes[02b:dispatch] | ✓ per-chat profile (model + tools + system prompt)[02:piebald-context] | ✓ model per ACP provider[02:goose-context] | ?[02:opencode] |

---

### Approval / Safety

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **57. Permission modes (count of distinct modes)** | ~ 2: plan vs. agent[01:cursor-approval] | ~ 2: Chat vs. Code[01:windsurf-approval] | ✓ 3: Default Approvals, Bypass Approvals, Autopilot[01:copilot-approval] | ~ 1 plan-level gate (Specs phases)[01:kiro-approval] | ~ 1 default (per-action)[01:cline-approval] | ~ 2: Automatic vs. manual per-tool[01:continue-approval] | ✓ 3: confirm / allow / deny[01:zed-approval] | ~ 2: with/without auto-commits[01:aider-approval] | ✗[01:v0-approval] | n/a (WebContainer sandbox)[01:bolt-approval] | ~ 2: Plan Mode vs. Build Mode[01:replit-approval] | ✓✓ 6 distinct modes: default, acceptEdits, plan, auto, dontAsk, bypassPermissions[02b:dispatch] | ✓ Plan Mode + pause loop[02:piebald-approval] | ✓ tool permission controls + sandbox mode + adversary reviewer[02:goose-approval] | ?[02:opencode] |
| **58. Per-tool approval (granular)** | ✗[01:cursor-approval] | ✗[01:windsurf-approval] | ✓ terminal tools require confirmation; file edits configurable[01:copilot-approval] | ✗[01:kiro-approval] | ✓✓ every file change + terminal command requires individual approval by default[01:cline-approval] | ✓ per-tool policy (Automatic vs. manual)[01:continue-approval] | ✓ regex-pattern-based per-tool rules with precedence hierarchy[01:zed-approval] | ✗ (apply-all model)[01:aider-approval] | ✗[01:v0-approval] | ✗[01:bolt-approval] | ✗[01:replit-approval] | ✓✓ `Bash(npm run *)`, `Read(./.env)`, `WebFetch(domain:x.com)` — per-specifier allow/ask/deny; compound command parsing; deny→ask→allow precedence[02b:A6] | ✓ per-chat + per-profile tool enable/disable[02:piebald-dispatch] | ✓ tool permission controls[02:goose-dispatch] | ?[02:opencode] |
| **59. Per-directory approval / trusted dirs** | ✗[01:cursor-approval] | ✗[01:windsurf-approval] | ✓ `chat.tools.edits.autoApprove` glob patterns; `chat.tools.terminal.autoApprove` regex[01:copilot-approval] | ✗[01:kiro-approval] | ✗[01:cline-approval] | ✗[01:continue-approval] | ✓ worktree isolation[01:zed-approval] | ✗[01:aider-approval] | ✗[01:v0-approval] | ✗[01:bolt-approval] | ✗[01:replit-approval] | ✓✓ `permissions.additionalDirectories`; `Read(//path)` absolute path rules; compound command parsing strips wrappers[02b:A6] | ?[02:piebald-approval] | ?[02:goose-approval] | ?[02:opencode] |
| **60. Plan-mode / dry-run capability** | ✓ Plan Mode: editable plan before execution[01:cursor-dispatch] | ✗[01:windsurf-approval] | ✓ Plan agent[01:copilot-dispatch] | ✓ Specs: three-phase review (requirements → design → tasks)[01:kiro-dispatch] | ✗[01:cline-approval] | ✗[01:continue-approval] | ✗[01:zed-approval] | ~ `/ask` mode for discussion; `/architect` shows architect proposal before applying[01:aider-dispatch] | ✗[01:v0-approval] | ✗[01:bolt-approval] | ✓ Plan Mode (ordered task list before any edits)[01:replit-dispatch] | ✓ `/plan` read-only mode; `ExitPlanMode` tool; `Shift+Tab` cycles to plan[02b:dispatch] | ✓ Plan Mode[02:piebald-dispatch] | ?[02:goose-approval] | ?[02:opencode] |
| **61. Hooks (PreToolUse / PostToolUse / etc.)** | ~ Hooks (beta, v1.7): custom scripts observe/control agent[01:cursor-context] | ✓ event-driven Hooks: file save/create/delete, agent turn, spec task, tool invocations[01:kiro-context] | ✗[01:copilot-approval] | ✓✓ Kiro Hooks are first-class: documented event set, shell command or agent prompt execution[01:kiro-context] | ✗[01:cline-approval] | ✗[01:continue-approval] | ✗[01:zed-approval] | ✗[01:aider-approval] | ✗[01:v0-approval] | ✗[01:bolt-approval] | ✗[01:replit-approval] | ✓✓ 12+ hook events; 5 hook types (command/http/mcp_tool/prompt/agent); exit-code blocking; `additionalContext` injection; managed-hooks-only enforcement[02b:context] | ✗[02:piebald-approval] | ✗[02:goose-approval] | ✗[02:opencode] |

---

### Distinct Integrations

| Axis | Cursor | Windsurf | Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit | Claude Code | Piebald | Goose | OpenCode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **62. MCP support** | ✓ `/mcp enable/disable`[01:cursor-composer] | ✓ documented as Cascade tool type[01:windsurf-dispatch] | ✓ MCP-backed agents[01:copilot-context] | ?[01:kiro-composer] | ✓[01:cline-context] | ✓✓ MCP context provider; all MCP servers as `@`-mention[01:continue-composer] | ✓ external agents via ACP[01:zed-context] | ✗[01:aider-composer] | ✗[01:v0-composer] | ✓ Notion/Linear/GitHub MCP (early 2026)[01:bolt-context] | ✗[01:replit-composer] | ✓✓ stdio/HTTP/SSE; scoped MCP per subagent; dynamic tool updates; plugin-bundled servers; `mcp__server__tool` naming[02b:mcp] | ✓[02:piebald-context] | ✓ 70+ MCP-based extensions; ACP orchestrator[02:goose-context] | ✓[02:opencode] |
| **63. CLI subscription pass-through (no API key)** | ✗[02:cross-cutting] | ✗[02:cross-cutting] | ✗[02:cross-cutting] | n/a (AWS billing) | ✗[02:cross-cutting] | ✗[02:cross-cutting] | ✗[02:cross-cutting] | ✗[02:cross-cutting] | n/a | n/a | n/a (cloud) | ✓✓ Anthropic's own harness; survived Jan 2026 lockout; Pro/Max/Team/Enterprise[02:cc-billing] | ~ advertises Claude Pro/Max; post-lockout status unclear[02:piebald-billing] | ✓✓ ACP routes through official CLI binaries; survives lockout architecturally[02:goose-billing] | ~ ChatGPT Plus, GitHub Copilot, GitLab Duo; Claude requires API key[02:opencode] |
| **64. Multi-provider (Claude / GPT / Gemini)** | ~ uses own model routing; limited provider choice[01:cursor-surface] | ~ proprietary routing; limited[01:windsurf-surface] | ✓ multi-provider via GitHub Copilot backend[01:copilot-surface] | n/a (AWS/Bedrock) | ✓✓ OpenRouter, Anthropic, OpenAI, Gemini, Bedrock, Azure, Ollama, local models[01:cline-composer] | ✓✓ any model via config; `models.dev` supports 75+ providers[01:continue-context] | ✓ Anthropic, OpenRouter, bring-your-own key[01:zed-context] | ✓✓ OpenAI, Anthropic, Gemini, DeepSeek, xAI, Ollama + dozens more[01:aider-streaming] | n/a | n/a | ✗ (Replit proprietary)[01:replit-surface] | ~ Anthropic primary; Bedrock, Vertex, Foundry supported[02:cc-billing] | ✓✓ Claude Pro/Max, ChatGPT Pro/Plus, Google AI, GitHub Copilot, Amazon Bedrock, Qwen[02:piebald-billing] | ✓✓ 30+ providers; ACP routes to Claude Code/Codex/Gemini CLI[02:goose-billing] | ✓ 75+ providers via AI SDK[02:opencode] |

---

## Per-Axis Observations

### Composer

**1. Composer engine**
High-water mark: Zed's message editor auto-formats multi-line pastes as @-mentions with file context — a compositional input model that treats every paste as a potential context operation. Cursor and Continue use standard rich/plain text areas typical of the field. Aider and Claude Code are TTY readline tools — the terminal is the composer. v0, Bolt, and Replit are web-chat boxes without IDE depth. No dominant convention: IDE tools mostly use textarea-style inputs; the differentiation is in what the @-mention layer does, not the composer engine itself.

**2. Multi-line input**
Most GUI IDEs handle multi-line naturally via textarea behavior. Aider's `/editor` command (opens $EDITOR) is the canonical pattern for terminal tools needing long prompts. Claude Code matches this with `/editor` plus backslash continuation. The axis is largely solved across the board.

**3. Image / file paste**
Zed is the high-water mark: clipboard paste, drag from filesystem, and @-mention of image files all work with auto-formatting. Cursor, Cline, Copilot all support image paste with less elegance. Windsurf notably absent. Claude Code's TTY image paste has a documented Windows bug (open GitHub issue as of 2026-05-07). v0 and Bolt accept Figma files as a distinct context type. Most tools outside the IDE-extension category have partial or undocumented coverage.

**4. Drag-and-drop attachments**
Cursor and Zed explicitly document drag-and-drop. Most other tools are undocumented on this axis. This is a gap in the research rather than necessarily in the tools — drag-and-drop is a UX detail that rarely surfaces in documentation.

**5. Markdown preview in composer**
Almost entirely undocumented across the survey. Only the TTY tools (Aider, Claude Code) can be confirmed to lack it. For GUI tools, the research didn't cover this axis. May warrant a targeted follow-up research pass.

---

### Mentions (@)

**6. @files**
Universal across IDE tools (Cursor, Windsurf, Copilot, Cline, Continue, Zed). Aider uses `/add` instead of inline @-mention — functionally equivalent but a different UX pattern. Claude Code has @-mention in VS Code extension and TTY; Piebald and OpenCode both explicitly document it. The field has converged on `@filename` as the standard.

**7. @symbols / functions / classes**
VS Code Copilot (via `#` hashtag system) and Zed (via `@` symbols) are explicit. Continue documents this implicitly via agent-mode codebase awareness. OpenCode's LSP integration (50ms symbol navigation) is architecturally distinct — not a @-mention but semantic symbol-level context. Cursor, Windsurf, Cline are undocumented on this axis.

**8. @docs / docs.url**
Cursor and Windsurf have dedicated `@docs` with indexed external documentation. Aider's `/web` and Cline's `@url` cover URL fetch. Continue deprecated `@Docs` in favor of Context7 MCP, which is the emerging pattern. Claude Code uses `WebFetch` as a tool rather than a composer mention.

**9. @web / web search**
Most major tools support some form of live web search. Cursor (`@web`), Continue (`@Web`, `@Google`), Copilot (`#fetch`), Aider (`/web`), Claude Code (`WebSearch` tool) all cover it. Windsurf has web search as a Cascade tool but not as an @-mention. The field has converged on web access as a standard capability; the debate is whether it's a mention, a tool, or a toggle.

**10. @past-conversation / @memory**
Windsurf and Zed are the high-water marks: Windsurf lets you `@` reference past conversations; Zed's `@thread` even works cross-surface (Inline Assistant can reference agent threads). Claude Code auto-loads memory from MEMORY.md without requiring @-mention — a different model (always-on vs. explicit pull). Most tools lack this axis entirely.

**11. @MCP-tool-result**
Claude Code's MCP implementation is the most architecturally complete: three transports, per-subagent scoped servers, dynamic tool updates, plugin-bundled servers. Continue's MCP-as-context-provider is the most composable from the @-mention UX perspective. Goose (70+ extensions) has the largest ecosystem. Aider is the only major tool with no MCP support documented.

**12. @diff / @commit / @PR**
Continue is the high-water mark for @-mention specificity: `@Git Diff` (branch changes) and `@GitLab MR` (open MR for current branch). VS Code Copilot covers `#terminalSelection` and git diff. Claude Code's `/diff`, `/review [PR]`, and `/security-review` slash commands cover this axis, but as commands rather than mentions. Most tools are undocumented here.

**13. Mention chip rendering / autocomplete UX**
Cursor, Windsurf, Copilot, Cline, Continue, Zed all document a typeahead/dropdown triggered by `@`. Aider has no @-mention system. Claude Code has `@` typeahead in both TTY and VS Code extension. VS Code Copilot uniquely uses TWO mention sigils (`@` for participants, `#` for context) — the most expressive but potentially the most confusing.

---

### Slash Commands (/)

**14. Built-in slash command count**
Aider (40+ enumerated) and Claude Code (60+ enumerated) are the clear high-water marks and the only tools with fully documented exhaustive command lists. GUI IDEs tend not to enumerate commands explicitly — they surface contextually. Windsurf has no slash commands at all.

**15. Custom user-authored slash commands**
Cursor (`.cursor/commands/*.md`) and Claude Code (`~/.claude/commands/` + `.claude/commands/`) are the most developed. Continue offers this via `config.yaml`. Most web-based tools (v0, Bolt, Replit) don't have this concept. Goose's Recipes (YAML) serve a similar role. The field has not converged on a single format.

**16. Project-level (per-repo) slash commands**
Claude Code and Cursor are the clearest implementations with distinct project-vs-user scope. Continue offers workspace-level config. Most other tools either don't support this or conflate it with global commands.

**17. Slash commands with arguments**
Claude Code has the most complete argument system: `argument-hint` for autocomplete, positional `$ARGUMENTS[N]`, named args from frontmatter, and shell variable substitutions. Aider supports arguments naturally (e.g., `/add <file>`). Cursor supports text-after-command as args. Most other tools don't document this.

**18. Bundled "skills" or "recipes" as slash commands**
Claude Code's bundled skills (`/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`) are notably sophisticated: they survive compaction, have dynamic shell injection, and can fork subagents. Cursor's Agent Skills (nightly) are the closest peer. Goose's Recipes are YAML-first equivalents. Most tools in the survey lack this pattern entirely.

---

### Context Preview / System Surfacing

**19. Discrete popover listing what model sees**
VS Code Copilot's Chat Debug view is the only documented full-transparency surface in the entire survey: raw system prompt + user prompt + context + tool payloads. Claude Code's `/context` and `/memory` commands provide structured visibility but not the full assembled prompt. This axis is broadly unimplemented — most tools treat context assembly as internal.

**20. Per-entry disable toggle in popover**
Almost entirely absent across the survey. Claude Code's `claudeMdExcludes` and `/memory` toggle are the closest approximation but they operate at the file level, not per-context-entry. This represents a meaningful gap across the entire field.

**21. System prompt visibility**
VS Code Copilot (Chat Debug view) is the only documented tool exposing the raw assembled system prompt. Piebald allows full manual system prompt control (write what goes in) but not inspection of the assembled result. Claude Code's `/status` shows settings sources and origin. Most tools treat the system prompt as opaque.

**22. Token-budget display**
Cline, Zed, Aider, and Claude Code all surface token counts in the UI. Claude Code's `/usage` is the most complete: session cost estimate, plan usage bars, activity stats. Piebald's HTTP traffic inspector (Pro) is unique — it exposes raw SSE chunks and per-request metadata, a developer-debugging view rather than a user-facing cost display. Windsurf, Copilot, and the web-based tools (v0, Bolt, Replit) don't surface token information.

---

### Skills, Sub-Agents, Modes

**23. Skill / sub-agent catalog (user-extensible)**
Claude Code has the most complete catalog system: agents as version-controllable Markdown files with full frontmatter schema, four scope levels, priority hierarchy, and `/agents` UI. Goose has the largest ecosystem footprint (70+ extensions). Cursor's Agent Skills are nightly-only. Most tools have MCP as the extensibility primitive rather than native agent definitions.

**24. Built-in agent / mode catalog**
Kiro's Specs system is architecturally distinct: three structured documents, three phases, wave-based concurrent execution. Claude Code has 5 built-in subagents and 6 permission modes. VS Code Copilot has three execution environments (local/background/cloud). This axis is rich across the survey with no single dominant pattern.

**25. Tier-locked agents (model selection per agent)**
Claude Code is the clearest implementation: `model` frontmatter per agent with a documented resolution order. Aider supports per-session model switching (`/model`, `/weak-model`, `/editor-model`). Most GUI IDEs don't expose this at the agent level. Piebald supports this at the profile level.

**26. Tool-restricted agents**
Claude Code is the only tool with a documented `tools` allowlist + `disallowedTools` denylist combination at the per-agent level, with documented compound logic (denylist applied before allowlist). Piebald and Goose support tool enable/disable at the session/profile level. Most tools in the survey have no tool restriction mechanism.

**27. Parallel sub-agent dispatch**
Kiro's Specs waves (concurrent independent tasks, sequential dependent tasks) is the most structured parallel execution model. Claude Code's `background: true` + `/batch` (one background agent per unit in isolated worktrees) is the most flexible. Zed's concurrent threads are the most user-facing (sidebar with all threads visible). Web-based tools largely lack this.

**28. Multi-level (nested) sub-agents**
This axis is genuinely contested. Claude Code explicitly blocks nesting for most subagents (with documented workarounds). Goose documents parallel sub-agents coordinated by the main session. Replit Agent 3 spawns subagents. Most tools are undocumented here. True multi-level nesting (subagents spawning subagents) is rare.

---

### Memory / Rules

**29. Global memory file (cross-project)**
Claude Code has the richest global memory architecture: user CLAUDE.md (`~/.claude/CLAUDE.md`) + managed policy CLAUDE.md (MDM/GPO) + global rules directory. Kiro's `~/.kiro/steering/` with Team scope (MDM/GPO distribution) is the closest peer. Cursor and Windsurf have global rules. Aider and web-based tools have no global memory concept.

**30. Project memory file**
Universal among IDE-extension and CLI tools: `.cursorrules`, `.windsurfrules`, `.kiro/steering/`, `.github/copilot-instructions.md`, `config.yaml`, `CLAUDE.md`, `.goosehints`, `AGENTS.md`. The field has converged on a project-root Markdown file as the standard, with CLAUDE.md and AGENTS.md emerging as cross-tool standards. Web-based tools (v0, Bolt, Replit) don't have this concept.

**31. Nested-folder memory inheritance**
Claude Code is the high-water mark: directory-tree walk from filesystem root to cwd, subdirectory CLAUDE.md files loading on demand when Claude reads files in those subdirectories. Kiro has conditional loading with glob patterns. Cursor's AGENTS.md works in subdirectories. Goose supports nested `.goosehints` in subdirectories. Most tools apply rules globally without hierarchy.

**32. Glob-attached rules (rule fires when path matches)**
Claude Code and Cursor both document glob-pattern triggered rules clearly. Kiro's Conditional steering uses globs. Windsurf has workspace rules with glob patterns. VS Code Copilot's `chat.tools.edits.autoApprove` uses globs for file-level approval (a different application of the same concept). This is an emerging pattern — most tools have flat, always-on rules.

**33. Per-rule disable toggle**
Almost entirely absent. This is a gap across the entire field. Claude Code's `claudeMdExcludes` and `/memory` toggle are workarounds, not per-rule granularity. Cursor's `alwaysApply` frontmatter field is the closest — setting it false effectively disables a rule class.

**34. Auto-memory write (model proposes new memory)**
Windsurf and Claude Code are the only tools with this pattern documented as a first-class feature. Windsurf's Memories Panel is more UX-focused (visible, user-reviewable). Claude Code's auto-memory is more developer-oriented (JSONL files, topic files, `/memory` command management). This is a meaningful differentiator — all other tools require users to author memory manually.

**35. Memory inline preview (popover → drawer)**
Windsurf's Memories Panel and Claude Code's `/memory` command are the only documented implementations. Both are navigable lists of what the model will remember, not raw prompt text. Most tools lack any visibility into the memory/rules layer.

---

### Files / File Tree

**36. Pin file to chat context**
Universal among IDE-extension tools. Claude Code covers this in VS Code extension and TTY. Aider's `/add` + `/read-only` distinction (editable vs. reference-only) is uniquely granular. All tools with a composer support explicit file pinning in some form.

**37. File tree change indicators**
Almost entirely undocumented across the survey. Zed documents that the panel shows which files and how many lines were edited, but file tree decoration (M/A/D indicators like VS Code's SCM) is not described. This may be a gap in the research rather than the tools, but it's a consistently missing axis across all 15 tools.

**38. File tree "open in chat"**
Piebald is the only tool explicitly documenting clickable file path references from the chat. Most other tools are undocumented. This axis was poorly covered by source research.

**39. Drag file from tree to composer**
Cursor and Zed explicitly document drag-to-composer. Most other tools are undocumented. This is a common IDE affordance likely present in more tools than the research captured.

**40. Heat-map / activity coloring on edited files**
Not documented in any surveyed tool. This axis appears absent across the field — it may be a genuinely unimplemented pattern, or it's so implementation-specific that no tool has written it up.

---

### Diff Views

**41. Inline-in-editor diff during streaming**
VS Code Copilot, Cline, and Zed all document inline diffs with clear UX. Claude Code shows unified diffs in TTY before apply; VS Code extension provides side-by-side. OpenCode explicitly documents syntax-highlighted inline diffs. Cursor implies this but doesn't describe the format.

**42. Side-panel / artifact-pane full review**
Zed's `Shift+Ctrl+R` multi-buffer tab is the most ergonomic: all pending changes across files in one review surface with per-hunk accept/reject. Claude Code's Desktop app rebuilt diff viewer (April 2026) and `/diff` interactive terminal viewer cover this axis. v0 has a file-by-file diff view. Most tools rely on inline diffs rather than a dedicated review pane.

**43. Per-hunk accept / reject**
VS Code Copilot and Zed both document per-hunk granularity. Copilot's hover-to-accept with auto-navigate-to-next is the most polished. Claude Code's TTY doesn't clearly document this; VS Code extension implies it. Most tools default to whole-file accept/reject.

**44. Per-file accept / reject**
Copilot (selective apply per file), Cline (per-file approval card), and Zed ("whole set of changes") all document this. Cursor relies on checkpoints. Most other tools are undocumented. The field has converged on per-file as the minimum granularity for informed review.

**45. Checkpoints / restore-from-snapshot**
Cline's step-level snapshots (every agent step, not just before significant changes) is the most comprehensive. VS Code Copilot and Cursor both have automatic snapshots. Zed has restore-per-edit. Aider delegates to Git. Replit includes database state in rollback. Claude Code has `/rewind` + git checkpoints. The axis is well-covered across most tools except the web-based ones (v0, Bolt).

**46. Git-native (commit-based) safety**
Aider is the definitive high-water mark: every AI edit auto-committed with Conventional Commits messages; `/undo` = git revert. Zed supports worktree isolation. Claude Code uses `isolation: "worktree"` per subagent and performs Git operations via Bash tool. Most GUI IDEs use proprietary snapshot systems rather than delegating to Git. Aider's choice to make Git the safety layer is a distinct architectural decision no other tool fully matches.

---

### Streaming UX

**47. Live text streaming**
Universal among tools that have a real-time interface. TTY tools stream to stdout; GUI tools render progressively. Web-based tools (v0, Bolt) show live preview updates. Kiro's Specs provides real-time status updates but the streaming text model isn't described in detail.

**48. Thinking / reasoning blocks visible**
Almost entirely absent or undocumented. Replit (Extended Thinking option) and Claude Code (`alwaysThinkingEnabled`, `showThinkingSummaries`, `ultrathink` in skills) are the only tools with documented thinking-mode controls. Aider has `/think-tokens` and `/reasoning-effort` for models that support extended reasoning but no distinct visual rendering. The field has not converged on how to surface reasoning blocks.

**49. Tool-call interleaving with text**
VS Code Copilot ("every tool invocation transparently displayed"), Cline (per-action approval card), Continue (6-step handshake), and Zed (tool-use indicators) all document this clearly. Claude Code displays spinner + tool name with `viewMode: verbose` showing all. Windsurf shows tool count with a Continue button. This axis is well-covered across tools with per-action approval UX.

**50. Todo / plan blocks rendered**
Kiro's Specs is the high-water mark: three structured documents with real-time task status during execution. Cursor's Plan Mode renders an editable Markdown plan. Replit's Plan Mode shows an ordered task list. Claude Code's `/plan` mode is clean but doesn't render a distinct TODO block. Most tools proceed without a plan artifact.

**51. Status / "thinking" rotating message**
Claude Code has the most configurable spinner: custom verbs, custom tips, progress bar in supporting terminals, away-summary on return. Piebald uses emoji reactions on tool calls. Zed streams tool-use indicators live. Most tools have some spinner/indicator but don't expose customization.

---

### Multi-Thread / Threading

**52. Multiple concurrent chat sessions**
Zed (multiple threads with own agent + context + history, Threads Sidebar) and Piebald (parallel sessions with sidebar, draft preservation, pending approval persistence across reboots) are the high-water marks. Claude Code's Desktop app supports multiple sessions side-by-side. Most GUI IDEs are single-session. Goose runs sub-agents in parallel. The field is split between single-session tools and parallel-native tools.

**53. Tab UI for sessions**
Zed and Piebald have the clearest multi-session UIs. VS Code Copilot can open Chat as an editor tab. Claude Code has a Desktop multi-session view and `/agents` Running tab. Most tools don't have session tab UIs.

**54. Branch from a prior message**
Piebald is the high-water mark: explicit fork/branch at any turn, with duplicate session and Git worktree management for parallel branches on different code states. Zed's "New From Summary" is context-limit-driven rather than user-initiated exploration. Claude Code has `/branch` (alias `/fork`). Most tools lack this pattern entirely — it's an area where the field has not converged.

**55. History search**
Aider's `/save`/`/load` for session replay and Claude Code's `/resume [session]` with session picker are the clearest implementations. Piebald's auto-tagging (Pro) adds metadata for search. Most other tools don't document history search.

**56. Per-session model / mode override**
Claude Code has the most complete per-session overrides: model, effort level, permission mode all changeable in-session with `Shift+Tab` cycling modes. Aider has `/model`, `/chat-mode`. Most GUI IDEs allow model selection but don't expose effort/permission levels as per-session toggles.

---

### Approval / Safety

**57. Permission modes (count of distinct modes)**
Claude Code has the most modes (6): default, acceptEdits, plan, auto, dontAsk, bypassPermissions. VS Code Copilot has 3 clean named modes. Zed has 3 (confirm/allow/deny). Most tools have 2 effectively (on/off, or plan-mode vs. execute). Web-based tools mostly lack a permission model entirely (safety delegated to sandbox or cloud environment).

**58. Per-tool approval (granular)**
Claude Code's per-specifier system (`Bash(npm run *)`, `Read(./.env)`, `WebFetch(domain:x.com)`) with deny→ask→allow precedence and compound command parsing is the most complete documented implementation. Cline's default (every file change + every terminal command individually approved) is the most conservative UX. Zed's regex-pattern-based per-tool rules with a 6-level precedence hierarchy is the most sophisticated regex-based approach.

**59. Per-directory approval / trusted dirs**
Claude Code and VS Code Copilot are the only tools with documented per-directory or per-path approval rules. Claude Code's implementation is more complete (absolute vs. relative path anchoring, additional directories, compound command parsing). Most tools apply permissions globally without path specificity.

**60. Plan-mode / dry-run capability**
Kiro's Specs (three-phase structured review) is the most complete pre-execution review model. Cursor's Plan Mode and Replit's Plan Mode are explicit approval gates before execution. Claude Code's `/plan` provides read-only exploration with `ExitPlanMode` tool. Aider's architect/editor split provides a softer version (proposal before application). The field has converged on some form of plan-before-execute, but implementations vary widely.

**61. Hooks (PreToolUse / PostToolUse / etc.)**
Claude Code and Kiro are the only tools with hooks documented as first-class features. Claude Code's hook system is the most complete in the survey: 12+ events, 5 hook types, exit-code blocking semantics, `additionalContext` injection for mid-turn Claude steering, and managed-hooks enforcement. Kiro's Hooks are event-driven at the IDE level (file save, agent turn, spec task) and are shipped as a core documented feature (not beta). Cursor's hooks are beta (v1.7). No other surveyed tool documents hooks.

---

### Distinct Integrations

**62. MCP support**
Claude Code and Continue are the deepest MCP implementations. Claude Code's is the most complete architecturally (scoped per subagent, dynamic tool updates, plugin-bundled, three transports). Continue's MCP-as-context-provider is the most user-facing (appears as @-mention entity). Goose has the largest extension ecosystem built on MCP. Aider and the web-based tools (v0, Replit) are the notable absences.

**63. CLI subscription pass-through**
Claude Code (by virtue of being Anthropic's own tool) and Goose (via ACP routing through official CLI binaries) are the two tools that genuinely support subscription pass-through post-January 2026 lockout. Piebald's status is uncertain. OpenCode supports ChatGPT Plus, GitHub Copilot, and GitLab Duo but requires an API key for Claude. This axis matters to the cost model: subscription users don't need an API key and pay flat rates.

**64. Multi-provider (Claude / GPT / Gemini)**
Cline, Continue, Aider, Goose, Piebald, and OpenCode are the most permissive: 30–75+ providers. Claude Code and Kiro are the most locked (Anthropic primary; cloud provider alternatives). v0, Bolt, and Replit are fully closed/proprietary. The API-key-based tools (Cline, Continue, Aider) have the widest provider support because the model is "you pay the API, we don't care which one."

---

## Tools NOT Covered in the Matrix

**Clotilde, tweakcc, ccstatusline, splitrail, gemini-cli-desktop** — These are Piebald-AI ecosystem companion tools, not standalone IDEs. Described in `02-cli-subscription-ides.md` section 4.2 as context data, not primary tools. They are out of scope for the matrix.

**Codex CLI** — Covered briefly in `02-cli-subscription-ides.md` section 5 as a terminal-only tool with no GUI layer. No qualifying IDE wrapper found; excluded.

**Roo Code / Kilo Code** — Mentioned in `02-cli-subscription-ides.md` section 5 as VS Code extension variants using API keys (not subscription pass-through). Noted as belonging in the API-based survey (doc 01) rather than the CLI-subscription category. Not researched in depth; excluded.

**Piebald companion tools (clotilde, etc.)** — Explicitly categorized in the source research as tooling, not IDEs. Not included.

---

## Axes Where Source Research Was Sparse (mostly `?` cells)

These rows should be targeted for additional research before the gap-analysis phase:

| Row | Issue |
|---|---|
| 5 — Markdown preview in composer | Not covered by any source doc; unclear if absent or undocumented |
| 37 — File tree change indicators | Covered only partially; Zed is the only tool with specific documentation |
| 38 — File tree "open in chat" | Only Piebald documented; others unknown |
| 39 — Drag file from tree to composer | Only Cursor and Zed documented; likely present in others |
| 40 — Heat-map / activity coloring on edited files | Not documented in any tool; may be genuinely absent field-wide |
| 28 — Multi-level (nested) sub-agents | Goose and Replit partially covered; most tools undocumented |
| 48 — Thinking / reasoning blocks visible | Sparse documentation across all tools; an emerging area |
| 33 — Per-rule disable toggle | Undocumented in almost all tools; likely a genuine gap field-wide |

These represent either gaps in the source research (axes where the research docs didn't specifically seek data) or genuine gaps in the field (axes where most tools don't implement the feature at all). The two should be distinguished before using this matrix for gap analysis against Ouroboros.
