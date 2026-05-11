# Claude Code (terminal CLI) — Deep-Dive UX Reference

**Last verified:** 2026-05-07
**Version researched:** v2.1.121+ (native install auto-updates; Homebrew/WinGet require manual upgrade)
**Pricing model:** Requires Claude Pro, Max, Team, or Enterprise subscription OR Anthropic Console account (API key with credits). Also supports Amazon Bedrock, Google Vertex AI, and Microsoft Foundry as third-party providers. No API key required for Max/Pro subscription path.

---

## Executive Summary

Claude Code is a terminal-first, agentic coding CLI that works against a full context window per session. Its gravitational center is the **context system**: CLAUDE.md files (layered by scope), auto-memory, path-scoped rules, skills, hooks, slash commands, MCP servers, and subagents all compose into the system prompt / context window that drives every response. The tool dispatch model is fully agentic — Claude plans and executes multi-step sequences without per-step approval unless permission mode requires it. The session is a linear conversation stored to disk; `/resume` and `/compact` are the primary session-lifecycle controls.

Sources: `code.claude.com/docs` pages fetched 2026-05-07 via `code.claude.com/docs/en/*`.

---

## 1. Chat Surface Model

### Conversation rendering

Claude Code runs as an interactive REPL in the terminal. On launch, a welcome screen shows session information, recent conversations, and latest update notes. The prompt accepts natural-language input; Claude responds inline in the terminal with streamed text.

There is no "thread" concept per se — each session is a linear conversation stored as a `.jsonl` transcript under `~/.claude/projects/{project}/{sessionId}/`. The welcome screen offers `/resume` to continue a previous conversation in the current directory.

### Streaming and screen lifecycle

Responses stream to stdout in real time. During tool use, Claude displays a spinner with a customizable status message (`statusMessage` field in hooks) and optional spinner tips (`spinnerTipsEnabled` / `spinnerTipsOverride` settings). A `terminalProgressBarEnabled` setting shows a progress bar in terminals that support it. `showTurnDuration` controls whether response time is shown after each turn.

A `viewMode` setting controls the transcript view: `"default"`, `"verbose"` (shows all tool calls), or `"focus"`. `tui` can be set to `"fullscreen"` for an alternate-screen renderer (also togglable with `/tui`). `prefersReducedMotion` reduces animations.

### Prompt shape

Each user message goes as a turn in the conversation. CLAUDE.md content is delivered as a user message **after** the system prompt — it is context, not enforced configuration. The system prompt is Claude Code's base prompt; CLAUDE.md stacks on top of it. `--append-system-prompt` can inject text at the system-prompt level, but must be re-passed every invocation (suits scripts, not interactive sessions).

Source: `code.claude.com/docs/en/overview`, `code.claude.com/docs/en/memory` (fetched 2026-05-07).

---

## 2. Composer / Input

### Input modes

- **Interactive REPL**: `claude` starts a session; prompt is a single-line composer that supports multi-line input (paste or Shift+Enter behavior — not explicitly documented, but standard TTY).
- **One-shot / headless**: `claude "task"` or `claude -p "query"` runs a single task and exits. `-p` is the print flag for scripting.
- **Continue most-recent**: `claude -c` resumes the most recent conversation in the current directory without launching the interactive welcome.
- **Resume by ID**: `claude -r` opens a conversation picker.

### Keyboard shortcuts

- `?` — show all keyboard shortcuts
- Tab — command completion
- `↑` — command history
- `/` — open slash command / skill menu
- `@` — open @-mention typeahead (files, subagents)
- `Ctrl+D` or `exit` — quit

### Slash command input

Typing `/` opens an autocomplete menu of all available slash commands and skills. The description text for each skill is truncated at 1,536 characters per entry; the combined budget scales at ~1% of the context window (fallback: 8,000 characters). `argument-hint` frontmatter shows expected argument format in autocomplete.

### @-mentions

`@` opens a typeahead for:
- Files in the project (for context injection)
- Subagents (e.g., `@"code-reviewer (agent)"`) — guarantees that subagent runs for that task
- Plugin-namespaced agents: `@agent-<plugin-name>:<agent-name>`
- Named running background subagents (show status next to name)

### Image / file paste

Not explicitly documented in the pages reviewed. Claude Code is described as multimodal in its overview but TTY paste handling for images is not detailed in the CLI docs. Claude Code's VS Code extension supports inline diffs and @-mentions natively; parity in TTY is not documented.

### Pipe / scripting

Claude Code follows Unix philosophy and is composable:

```bash
tail -200 app.log | claude -p "Slack me if you see any anomalies"
git diff main --name-only | claude -p "review these changed files for security issues"
```

Source: `code.claude.com/docs/en/overview`, `code.claude.com/docs/en/quickstart` (fetched 2026-05-07).

---

## 3. Context System

This is the most strategically important section. Claude Code's context window at session start is a composition of multiple layers, each with its own scope and load timing.

### 3.1 System prompt construction

The base system prompt is Claude Code's internal prompt (not user-configurable except via `--append-system-prompt`). On top of it, at session start, the following load in order:

1. **Managed policy CLAUDE.md** (org-wide, cannot be excluded)
2. **CLAUDE.md files** from directory tree walk (root → cwd)
3. **User CLAUDE.md** (`~/.claude/CLAUDE.md`)
4. **Project CLAUDE.md** (`./CLAUDE.md` or `./.claude/CLAUDE.md`)
5. **CLAUDE.local.md** (personal, gitignored, same cwd)
6. **`.claude/rules/*.md`** (unconditional rules load at launch; path-scoped rules load on demand)
7. **Auto memory** (first 200 lines / 25KB of `MEMORY.md`)
8. **Skill descriptions** (always-in-context listing; full skill content loads on invocation)

All CLAUDE.md files are concatenated into context (not overriding each other). Directory tree walk goes from filesystem root down to cwd — so ancestor files appear before closer ones, meaning more-specific files are read last.

CLAUDE.md content is injected as a **user message** after the system prompt, not as the system prompt itself. This is documented as the reason adherence is probabilistic, not guaranteed.

HTML block comments (`<!-- ... -->`) in CLAUDE.md are stripped before injection (token savings for maintainer notes); comments inside code blocks are preserved.

### 3.2 CLAUDE.md files — full scope table

| Scope | Location | Who writes | Shared via |
|---|---|---|---|
| Managed policy | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux/WSL: `/etc/claude-code/CLAUDE.md`; Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | IT/DevOps | MDM / Group Policy |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team | Version control |
| User | `~/.claude/CLAUDE.md` | Individual | Not shared |
| Local project | `./CLAUDE.local.md` | Individual | Not shared (gitignore) |

**Load order detail:** Files in the directory hierarchy above cwd load at launch in full. Files in *subdirectories below* cwd load on demand when Claude reads files in those subdirectories.

**Import syntax:** `@path/to/file` inside any CLAUDE.md expands and inlines the referenced file at launch. Relative paths resolve relative to the containing file. Max import depth: 5 hops. External imports trigger a one-time approval dialog on first encounter.

**`/init` command:** Analyzes the codebase and generates a starter CLAUDE.md. With `CLAUDE_CODE_NEW_INIT=1`, enters a multi-phase interactive flow (subagent explores codebase, asks follow-up questions, presents a reviewable proposal before writing).

**Size guidance:** Target under 200 lines per file. Longer files reduce adherence and consume context. Use path-scoped rules to load instructions only when relevant files are touched.

**`claudeMdExcludes` setting:** Glob patterns of CLAUDE.md paths to skip. Useful in monorepos to filter other teams' files. Managed policy files cannot be excluded. Arrays merge across settings layers.

**Compaction behavior:** Project-root CLAUDE.md survives `/compact` — it is re-read from disk and re-injected. Nested CLAUDE.md files in subdirectories are not re-injected automatically; they reload the next time Claude reads a file in that subdirectory.

### 3.3 Rules — `.claude/rules/`

Rules are markdown files in `.claude/rules/` (project) or `~/.claude/rules/` (user). Each file covers one topic. User-level rules load before project rules (project takes higher priority).

**Path-specific rules** use YAML frontmatter with a `paths` field:

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
...
```

Rules without a `paths` field load unconditionally at launch. Path-scoped rules trigger when Claude reads a file matching the pattern — not on every tool use.

Glob patterns supported: `**/*.ts`, `src/**/*`, `*.md`, `src/components/*.tsx`, and brace expansion `**/*.{ts,tsx}`.

Symlinks in `.claude/rules/` are resolved normally; circular symlinks are handled gracefully.

Distinction from skills: Rules are always in context (or path-gated but auto-loaded). Skills load only when invoked.

### 3.4 Auto memory

Auto memory is Claude writing notes to itself as it works. It accumulates build commands, debugging insights, architecture notes, code style preferences discovered through corrections.

- **Storage:** `~/.claude/projects/<project>/memory/MEMORY.md` (index) + optional topic files like `debugging.md`, `api-conventions.md`.
- **`<project>` key:** Derived from the git repository root. All worktrees and subdirectories within the same repo share one auto memory directory. Outside a git repo, the project root is used.
- **What loads at session start:** First 200 lines OR first 25KB of `MEMORY.md`, whichever comes first. Topic files are NOT loaded at startup — Claude reads them on demand via file tools.
- **Enable/disable:** `autoMemoryEnabled` in settings (default: `true`). Also controllable via `/memory` toggle or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- **Custom location:** `autoMemoryDirectory` in user settings (absolute path or `~/`). Accepted from policy and user settings only — not project/local settings (to prevent cloned repos redirecting memory writes).
- **Requires:** v2.1.59 or later.
- **`/memory` command:** Lists all CLAUDE.md, CLAUDE.local.md, and rules files loaded in the current session; lets you toggle auto memory; links to the auto memory folder.

Subagents can maintain their own auto memory. See Section 10.

### 3.5 Skills

Skills are the primary reusable workflow mechanism. A skill is a directory with a `SKILL.md` entrypoint. Skills extend what Claude can do and are invoked via `/skill-name` or automatically when Claude determines they're relevant.

**Locations (priority order — enterprise overrides personal overrides project):**

| Scope | Path |
|---|---|
| Enterprise | Managed settings |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` |
| Project | `.claude/skills/<skill-name>/SKILL.md` |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` |

**Note:** `.claude/commands/` files still work identically. Skills and commands share the same system; skills take precedence over same-name commands.

**Frontmatter fields (all optional except description is recommended):**

| Field | Purpose |
|---|---|
| `name` | Display name (lowercase, hyphens, max 64 chars) |
| `description` | When Claude should use the skill (key for auto-invocation) |
| `when_to_use` | Additional trigger context; appended to description |
| `argument-hint` | Autocomplete hint (e.g., `[issue-number]`) |
| `arguments` | Named positional args for `$name` substitution |
| `disable-model-invocation` | `true` = only user can invoke; hidden from Claude's context |
| `user-invocable` | `false` = hidden from `/` menu but Claude can still invoke |
| `allowed-tools` | Tools auto-approved while skill is active (no prompt needed) |
| `model` | Model override for this skill's turn only (reverts after) |
| `effort` | Effort level override |
| `context` | `"fork"` = run in isolated subagent context |
| `agent` | Which subagent to use when `context: fork` |
| `hooks` | Lifecycle hooks scoped to this skill |
| `paths` | Glob patterns — skill only auto-activates for matching files |
| `shell` | Shell for inline `!` commands: `"bash"` (default) or `"powershell"` |

**String substitutions in skill content:**

| Variable | Meaning |
|---|---|
| `$ARGUMENTS` | All arguments as typed |
| `$ARGUMENTS[N]` | Argument by 0-based index |
| `$N` | Shorthand for `$ARGUMENTS[N]` |
| `$name` | Named argument from `arguments` frontmatter |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_EFFORT}` | Current effort level |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill's SKILL.md |

**Dynamic context injection:** `` !`command` `` syntax runs a shell command before the skill content is sent to Claude, replacing the placeholder with output. Multi-line: fenced code block opened with `` ```! ``. Can be disabled with `disableSkillShellExecution` in settings.

**Skill content lifecycle:** Skill content enters conversation as a single message and stays for the rest of the session. Auto-compaction carries skills forward with a combined budget of 25,000 tokens across all invoked skills, keeping the first 5,000 tokens of each. Most-recently invoked skills are prioritized; older ones can be dropped after compaction.

**Live change detection:** Adding, editing, or removing skills under `~/.claude/skills/` or `.claude/skills/` takes effect in the current session without restart. Creating a new top-level skills directory requires a restart.

**Invocation control:** `disable-model-invocation: true` removes the skill from Claude's context entirely and blocks Claude from invoking it programmatically. `user-invocable: false` hides it from the `/` menu but keeps it in Claude's context.

**Bundled skills** (always available): `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`. These are prompt-based skills, not fixed-logic commands.

### 3.6 Slash commands

Custom slash commands are markdown files in `.claude/commands/` (project) or `~/.claude/commands/` (user). They behave identically to skills with the same `SKILL.md` format but as flat files rather than directories. If a command and a skill share the same name, the skill takes precedence.

**Built-in slash commands** (selected; not exhaustive): `/help`, `/clear`, `/compact`, `/resume`, `/init`, `/memory`, `/hooks`, `/mcp`, `/agents`, `/model`, `/effort`, `/fork`, `/btw`, `/desktop`, `/config`, `/status`, `/login`, `/logout`, `/permissions`, `/skills`, `/plugin`, `/review`, `/security-review`, `/schedule`, `/loop`, `/statusline`.

Type `/` to browse all available commands and skills. The menu is the canonical source — not documented as an exhaustive list in the pages reviewed.

### 3.7 Hooks

Hooks are shell commands (or HTTP calls, MCP tool calls, prompt invocations, or subagent dispatches) that run at lifecycle events. They provide deterministic enforcement that CLAUDE.md cannot.

**Hook types:**

| Type | Behavior |
|---|---|
| `command` | Execute shell command; receives JSON on stdin |
| `http` | POST JSON to a URL; response uses same format |
| `mcp_tool` | Call a tool on a connected MCP server |
| `prompt` | Send a prompt to Claude for yes/no decision |
| `agent` | Spawn a subagent for verification |

**Hook events (selected):**

| Event | Can block? | Notes |
|---|---|---|
| `SessionStart` | No | Matcher: `startup`, `resume`, `clear`, `compact` |
| `UserPromptSubmit` | Yes | No matcher support |
| `UserPromptExpansion` | Yes | Fires when a slash command expands |
| `PreToolUse` | Yes | Matcher: tool name; most commonly used |
| `PermissionRequest` | Yes | Fires when permission dialog would show |
| `PostToolUse` | No | Tool already executed |
| `PostToolUseFailure` | No | Tool failed |
| `Stop` | Yes | Prevent Claude from finishing a response |
| `SessionEnd` | No | Matcher: `clear`, `resume`, `logout`, etc. |
| `Notification` | No | Various notification types |
| `SubagentStart` / `SubagentStop` | No (Stop only) | Matcher: agent type name |
| `FileChanged` | No | Matcher: filename patterns |
| `CwdChanged` | No | No matcher |
| `InstructionsLoaded` | Not documented | Useful for debugging which CLAUDE.md files loaded |

**Configuration location (precedence):** Managed policy > local project (`.claude/settings.local.json`) > shared project (`.claude/settings.json`) > user (`~/.claude/settings.json`) > skill/agent frontmatter > built-in.

**Basic structure in settings.json:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/validate.sh"
          }
        ]
      }
    ]
  }
}
```

**Matcher patterns:**

| Matcher value | Evaluated as |
|---|---|
| `"*"` or omitted | Match all |
| Letters, digits, `_`, `\|` only | Exact string or pipe-separated list (e.g., `"Edit\|Write"`) |
| Contains other characters | JavaScript regex (e.g., `"^Notebook"`, `"mcp__memory__.*"`) |

**Exit code semantics (command hooks):**

| Exit code | Meaning |
|---|---|
| 0 | Success; parse stdout for JSON output |
| 2 | Blocking error; feeds stderr to Claude/UI; ignores stdout |
| Other (e.g., 1) | Non-blocking error; shows first line of stderr in transcript |

**Exit code 2 effects by event:**

- `PreToolUse` → blocks the tool call
- `PermissionRequest` → denies the permission
- `UserPromptSubmit` → blocks and erases the prompt
- `Stop` → prevents Claude from stopping; continues conversation
- `PostToolUse` / `PostToolUseFailure` → cannot block (already executed)

**JSON output format (stdout on exit 0):**

```json
{
  "continue": false,
  "stopReason": "Build failed",
  "suppressOutput": false,
  "decision": "block",
  "reason": "Explanation",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny|allow|ask|defer",
    "additionalContext": "Context injected into Claude's next turn",
    "updatedInput": {}
  }
}
```

**`additionalContext` mechanism:** Injects a string into Claude's context at the point the hook fires. For `PreToolUse`/`PostToolUse`, appears next to the tool result. Capped at 10,000 characters (longer content saved to file; path shown). For resumed sessions, saved context replays rather than re-running hooks (except `SessionStart`, which runs again).

**Environment variables passed to all hooks:**

- `CLAUDE_PROJECT_DIR` — project root
- `CLAUDE_PLUGIN_ROOT` — plugin install directory (if applicable)
- `CLAUDE_PLUGIN_DATA` — plugin persistent data directory
- `CLAUDE_CODE_REMOTE` — `"true"` in remote environments

**`SessionStart`, `Setup`, `CwdChanged`, `FileChanged` additionally receive:**

- `CLAUDE_ENV_FILE` — path to a file for persisting environment variables into subsequent Bash calls for the session

**Hook input (all hooks):**

```json
{
  "session_id": "...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "EventName",
  "agent_id": "...",
  "agent_type": "..."
}
```

**`/hooks` command:** Read-only browser inside Claude Code showing all configured hooks by event, with matcher, source (`[User]`, `[Project]`, `[Local]`, `[Plugin]`, `[Session]`, `[Built-in]`), and full command/URL.

**`disableAllHooks: true`** in settings disables all hooks. Managed hooks can only be disabled by managed-level settings.

**Hooks in skill/agent frontmatter:** Hooks defined in frontmatter are scoped to that component's lifetime and cleaned up when it finishes. `once: true` supported (runs once per session). When a subagent's `Stop` hook fires, it is converted to `SubagentStop` at runtime.

### 3.8 MCP servers

MCP (Model Context Protocol) is an open standard for connecting AI tools to external data sources and services. Claude Code supports stdio, HTTP (streamable-HTTP), and SSE transports. SSE is deprecated; HTTP is recommended.

**Configuration scopes:**

| Scope | Storage | Shared |
|---|---|---|
| Local (default) | `~/.claude.json` under project path | No |
| Project | `.mcp.json` in project root | Yes (version control) |
| User | `~/.claude.json` globally | No |
| Managed | Managed settings | Yes (org-wide) |

**Scope precedence (highest to lowest):** local > project > user > plugin-provided > claude.ai connectors.

**CLI installation:**

```bash
# HTTP (recommended)
claude mcp add --transport http <name> <url>

# Stdio (local process)
claude mcp add --transport stdio --env KEY=value <name> -- <command> [args...]

# SSE (deprecated)
claude mcp add --transport sse <name> <url>

# Scope flags
--scope local    # default; stored in ~/.claude.json for current project
--scope project  # stored in .mcp.json
--scope user     # stored in ~/.claude.json globally
```

**Management commands:**

```bash
claude mcp list
claude mcp get <name>
claude mcp remove <name>
claude mcp reset-project-choices  # reset .mcp.json approval choices
```

**`/mcp` in-session command:** Shows tool count per connected server, flags servers that advertise the tools capability but expose no tools. Used to authenticate with OAuth 2.0 remote servers.

**Tool naming convention:** MCP tools surface as `mcp__<server>__<tool>`. Hook matchers can use regex: `"mcp__memory__.*"` matches all tools from the `memory` server.

**Project-scoped security:** Claude Code prompts for approval before using project-scoped servers from `.mcp.json`. Reset approvals with `claude mcp reset-project-choices`.

**Environment variable expansion in `.mcp.json`:** Supports `${VAR}` and `${VAR:-default}` syntax in `command`, `args`, `env`, `url`, and `headers` fields.

**Dynamic tool updates:** Claude Code supports MCP `list_changed` notifications — servers can update their exposed tools, prompts, and resources mid-session without disconnect/reconnect.

**Automatic reconnection:** HTTP/SSE servers reconnect with exponential backoff (up to 5 attempts, starting 1s, doubling each time). Stdio servers are not reconnected automatically.

**Timeouts and limits:**

- `MCP_TIMEOUT` env var sets startup timeout (e.g., `MCP_TIMEOUT=10000` for 10 seconds)
- `MAX_MCP_OUTPUT_TOKENS` env var raises the 10,000-token warning threshold

**Subagent-scoped MCP:** Subagents can define their own `mcpServers` in frontmatter — inline definitions connect when the subagent starts and disconnect when it finishes. This scopes expensive or credential-sensitive servers to specific subagents without exposing them in the parent conversation.

**Plugin-provided MCP:** Plugins can bundle MCP servers in `.mcp.json` at the plugin root or inline in `plugin.json`. Plugin servers start automatically when the plugin is enabled. Use `/reload-plugins` to connect/disconnect servers when enabling/disabling plugins mid-session.

The `workspace` server name is reserved. Defining a server with that name causes it to be skipped with a warning.

Source: `code.claude.com/docs/en/mcp` (fetched 2026-05-07).

### 3.9 Project context — how cwd becomes "the project"

The **current working directory** when `claude` is launched is the project root. Claude Code reads CLAUDE.md files by walking up the directory tree from cwd. Files in subdirectories load on demand when Claude reads files there.

The project key for auto-memory is derived from the git repository root — not cwd — so all worktrees and subdirectories of the same repo share one memory directory.

`--add-dir` grants Claude file access to additional directories but does NOT load CLAUDE.md, subagents, or other `.claude/` config from those directories — exception: `.claude/skills/` from added directories IS loaded. Skills from `--add-dir` directories get live-change detection within the session.

Multi-project handling: each `--add-dir` directory gets file access. To also load CLAUDE.md from added directories, set `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.

Source: `code.claude.com/docs/en/memory` (fetched 2026-05-07).

---

## 4. Tool Dispatch UX

### Default tool list

Claude Code's built-in (internal) tools include: `Read`, `Write`, `Edit`, `MultiEdit`, `Bash`, `Glob`, `Grep`, `LS`, `WebFetch`, `WebSearch`, `Agent` (formerly `Task`), `Skill`, `AskUserQuestion`, `ExitPlanMode`, and Notebook tools. MCP tools surface alongside these as `mcp__<server>__<tool>`.

The `Agent` tool (renamed from `Task` in v2.1.63; `Task(...)` still works as an alias) dispatches subagents. The `Skill` tool invokes skills programmatically.

### Tool approval modes (permission modes)

| Mode | Behavior |
|---|---|
| `default` | Standard permission checking with prompts per tool call |
| `plan` | Read-only exploration; Claude presents a plan before any edits |
| `acceptEdits` | Auto-accept file edits and common filesystem commands for working dir and additional dirs |
| `auto` | Background classifier reviews commands and protected-directory writes; fewer prompts |
| `dontAsk` | Auto-deny permission prompts (explicitly allowed tools still work) |
| `bypassPermissions` | Skip all permission prompts (root/home `rm -rf` still prompts as circuit breaker) |

Set via `--permission-mode <mode>` CLI flag, `permissions.defaultMode` in settings, or `permissionMode` in subagent frontmatter.

**`auto` mode detail:** A background classifier evaluates each command. If the parent uses auto mode, subagents inherit it and their frontmatter `permissionMode` is ignored. `disableAutoMode: "disable"` in managed settings prevents auto mode activation.

### Permission persistence

Permissions can be approved for the session, for a directory, or permanently:

- `permissions.allow` / `permissions.deny` / `permissions.ask` arrays in `settings.json`
- `permissions.additionalDirectories` — additional dirs with file access
- `Bash(npm run *)` syntax for pattern-matched allows
- `Read(./.env)` syntax for file-specific denies

Subagents receive the parent's permission context and can override the mode downward (stricter) but not upward past the parent's level (if parent is `bypassPermissions` or `acceptEdits`, subagent inherits that and cannot override).

### The Agent tool

When Claude dispatches a subagent via the `Agent` tool:
- Each subagent gets its own context window
- The Agent tool passes a task prompt and optionally a `model` parameter and `isolation: "worktree"` flag
- Subagents cannot spawn further subagents (prevents nesting)
- Exception: agents running as the main thread via `--agent` CAN spawn subagents via Agent tool — controllable with `Agent(type)` allowlist in `tools` field

### Model selection

Model set via `--model` flag, `model` setting, or `ANTHROPIC_MODEL` env var. Inside a session, `/model` opens a model picker. Subagents can override model via their `model` frontmatter field. Resolution order for subagent model:

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var
2. Per-invocation `model` parameter from the Agent tool
3. Subagent definition's `model` frontmatter
4. Main conversation's model

Model aliases: `sonnet`, `opus`, `haiku`. Full model IDs (e.g., `claude-opus-4-7`) also accepted.

**Effort level:** Controlled via `effortLevel` setting, `--effort` flag, `/effort` command, or `CLAUDE_CODE_EFFORT_LEVEL` env var. Options: `low`, `medium`, `high`, `xhigh`, `max` (availability depends on model). Skills and subagents can override effort level independently.

Source: `code.claude.com/docs/en/sub-agents`, `code.claude.com/docs/en/settings` (fetched 2026-05-07).

---

## 5. File / Diff Handling

### Edit surfacing in TTY

Claude Code shows proposed file changes in the terminal before applying them (in `default` permission mode). The user approves or rejects. In `acceptEdits` mode, file edits are auto-approved. The `ExitPlanMode` tool is used when leaving plan mode after presenting a plan.

Diff rendering is not described in detail in the docs reviewed — specific diff format (unified diff, side-by-side, etc.) is not documented for the TTY surface. VS Code and Desktop app surfaces support visual diff review; TTY is implied to use inline text diffs.

### Large file handling

The `Read` tool supports `offset` and `limit` parameters for reading slices of large files. The docs explicitly call out using `offset`/`limit` rather than reading entire large files to avoid wasting context.

### Bash output rendering

Bash tool output is shown in the transcript. Verbose vs. condensed display is controlled by `viewMode`. In `"verbose"` mode, all tool calls and results are visible. In `"focus"` mode (not fully documented in reviewed pages), the view is condensed.

### File access and gitignore

`respeitGitignore` setting (default: `true`) respects `.gitignore` in the file picker. File access is controlled by trusted directories; the working directory is trusted by default. `permissions.additionalDirectories` grants access to directories outside cwd.

Source: `code.claude.com/docs/en/quickstart`, `code.claude.com/docs/en/settings` (fetched 2026-05-07).

---

## 6. Multi-Session / Threading

### Session storage

Transcripts are stored as `.jsonl` files at `~/.claude/projects/{project}/{sessionId}/`. Subagent transcripts are stored separately at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`. Transcripts are cleaned up per `cleanupPeriodDays` setting (default: 30 days).

### `/resume` — continue a previous session

`claude -r` or `/resume` opens a session picker showing recent conversations in the current directory. The session ID is derived from the project path. When resumed, the saved `additionalContext` from hooks replays rather than re-running hooks (except `SessionStart`, which runs again).

### `/compact` — compress context

`/compact` compacts the conversation to free context. After compaction:
- Project-root CLAUDE.md is re-read from disk and re-injected
- Nested CLAUDE.md files in subdirectories are NOT re-injected (they reload when Claude next reads files in those subdirectories)
- Invoked skills are re-attached with a combined budget of 25,000 tokens (up to 5,000 tokens per skill, most-recent-first)
- Conversation history is summarized

`/compact` is distinct from `--no-session-persistence` (which disables transcript saving entirely).

**Auto-compaction:** Triggers automatically at approximately 95% context capacity. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var sets a lower threshold (e.g., `50` for 50%). Compaction events are logged in transcript files with a `compact_boundary` entry showing `preTokens`.

### `/clear` — start fresh

`/clear` clears conversation history and starts a new session. CLAUDE.md files reload from disk on the next turn.

### `/btw` — side question

`/btw <question>` sends a quick question that sees the full conversation context but has no tool access. The answer is discarded and not added to conversation history. Use for lightweight context-aware questions that don't need tools.

Source: `code.claude.com/docs/en/memory`, `code.claude.com/docs/en/sub-agents` (fetched 2026-05-07).

---

## 7. Streaming / Progress UX

### Thinking blocks

Extended thinking is supported. `alwaysThinkingEnabled` setting enables it by default. `showThinkingSummaries` controls whether thinking summaries are shown. Skill content can include `ultrathink` anywhere to request deeper reasoning for that invocation. `/effort` and the `effortLevel` setting tune reasoning depth; `/fast` is a quick toggle. `CLAUDE_CODE_DISABLE_THINKING=1` forces thinking off.

### Tool calls during streaming

During agentic execution, Claude issues tool calls sequentially. Each tool call shows a spinner with the operation name. Status messages can be customized via the `statusMessage` hook field. `terminalProgressBarEnabled` shows a progress bar in supported terminals.

The `background` field on subagents (`true`) allows concurrent subagent execution while the main conversation continues. Pressing `Ctrl+B` backgrounds a running task.

### Token / cost display

`showTurnDuration` setting shows how long each turn took. Token and cost display specifics are not detailed in the docs reviewed — not documented as explicit UI elements in the TTY surface for Max subscription users (cost is bundled into subscription).

### Awaiting spinner tips

`spinnerTipsEnabled` (default: not specified, implied on) shows tips during spinner. `spinnerTipsOverride` customizes tips. `spinnerVerbs` can append custom action verbs to the spinner display.

### `awaySummaryEnabled`

When returning to a session after being away for several minutes, Claude shows a recap. Controlled by `awaySummaryEnabled` setting (default: `true`).

Source: `code.claude.com/docs/en/settings`, `code.claude.com/docs/en/skills` (fetched 2026-05-07).

---

## 8. Approval / Safety

### Permission modes

See Section 4 for the full mode table. Default mode is `default` (prompts per tool call).

`permissions.defaultMode` in settings sets the session default. `--permission-mode` flag overrides per launch. `--dangerously-skip-permissions` is an alias for `bypassPermissions` (with a warning).

### Trusted directories

The working directory is trusted by default. `permissions.additionalDirectories` adds more. `bypassPermissions` mode still prompts on root and home directory destructive operations as a circuit breaker.

**Directories with elevated caution in `bypassPermissions`:** `.git`, `.claude`, `.vscode`, `.idea`, `.husky` — writes to these still execute without prompts in `bypassPermissions` mode (documented as a caution, not a block).

### Permission rules syntax

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Read(~/.zshrc)"],
    "deny": ["Read(./.env)", "Bash(curl *)"],
    "ask": ["Bash(git push *)"]
  }
}
```

Pattern: `Tool` (all) or `Tool(specifier)` where specifier is a glob-like pattern. Domain-specific: `WebFetch(domain:example.com)`.

### Managed settings enforcement

Managed settings cannot be overridden by user, project, or local settings. `allowManagedPermissionRulesOnly: true` enforces that only managed permission rules apply. `disableBypassPermissionsMode: "disable"` prevents bypass mode.

### Sandbox

`sandbox.enabled: true` activates OS-level sandboxing for Bash commands. Configurable filesystem allow/deny paths, network domain allow/deny lists, Unix socket controls. `failIfUnavailable: true` blocks operation if sandbox isn't available on the platform.

Source: `code.claude.com/docs/en/settings`, `code.claude.com/docs/en/sub-agents` (fetched 2026-05-07).

---

## 9. Configuration System

### Settings files

| Layer | File | Precedence |
|---|---|---|
| Managed (server) | Delivered via claude.ai admin console | Highest |
| Managed (MDM/OS) | macOS plist, Windows registry (HKLM/HKCU) | Highest |
| Managed (file) | `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS); `/etc/claude-code/` (Linux); `C:\Program Files\ClaudeCode\` (Windows) | Highest |
| Local project | `.claude/settings.local.json` | 3rd |
| Shared project | `.claude/settings.json` | 4th |
| User | `~/.claude/settings.json` | Lowest |

Command-line arguments override file settings for the session. `--settings /path/to/file` or `--settings '{"key": "value"}'` merges a settings source.

**Array merging:** Array-valued settings (e.g., `permissions.allow`, `sandbox.filesystem.allowWrite`) merge (concatenate and deduplicate) across layers rather than replacing. Scalar values from higher-priority layers win.

**Drop-in managed directory:** `managed-settings.d/` alongside `managed-settings.json`. Files sorted alphabetically and merged — later files override scalars, arrays concatenate, objects deep-merge. Naming convention: `10-telemetry.json`, `20-security.json`.

**`~/.claude.json`** stores MCP server configurations (local and user scope), IDE auto-connect settings, and per-project MCP entries. Separate from `~/.claude/settings.json`.

**Backups:** Claude Code creates timestamped backups of config files, retaining the 5 most recent.

### Selected top-level settings.json keys

| Key | Description |
|---|---|
| `model` | Override default model |
| `effortLevel` | Persist effort level: `low`, `medium`, `high`, `xhigh` |
| `agent` | Run main thread as named subagent |
| `env` | Environment variables for every session |
| `permissions` | Allow/deny/ask/additionalDirectories/defaultMode |
| `sandbox` | Sandboxing config (filesystem + network) |
| `hooks` | Lifecycle hook definitions |
| `autoMemoryEnabled` | Enable/disable auto memory (default: true) |
| `autoMemoryDirectory` | Custom memory storage path |
| `claudeMdExcludes` | CLAUDE.md paths to skip (glob) |
| `editorMode` | `"normal"` or `"vim"` key bindings |
| `language` | Preferred response language |
| `tui` | `"fullscreen"` or `"default"` renderer |
| `viewMode` | `"default"`, `"verbose"`, `"focus"` |
| `cleanupPeriodDays` | Session file retention (default: 30) |
| `forceLoginMethod` | Restrict login to `"claudeai"` or `"console"` |
| `disableSkillShellExecution` | Disable `!` inline shell in skills |
| `enabledMcpjsonServers` | Approve specific servers from `.mcp.json` |
| `disabledMcpjsonServers` | Reject specific servers from `.mcp.json` |
| `attribution` | Git commit and PR attribution strings |
| `availableModels` | Restrict which models users can select |
| `worktree.symlinkDirectories` | Symlink large dirs in git worktrees |
| `worktree.sparsePaths` | Git sparse-checkout paths for worktrees |

**`/config` command:** Opens a tabbed settings interface inside the REPL.
**`/status` command:** Shows which settings sources are active, their origin, and any configuration errors.

Source: `code.claude.com/docs/en/settings` (fetched 2026-05-07).

---

## 10. Subagent System (Deep)

Subagents are specialized AI assistants running in their own context windows with custom system prompts, tool restrictions, and independent permissions. They are the primary mechanism for context isolation and parallel work in Claude Code.

### Agent file shape

Subagent files are Markdown with YAML frontmatter. The markdown body becomes the system prompt. Subagents receive ONLY this system prompt (plus basic environment info like cwd) — not the full Claude Code system prompt.

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use after code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
color: blue
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

### Storage locations (priority order)

| Location | Scope | Priority |
|---|---|---|
| Managed settings | Organization-wide | 1 (highest) |
| `--agents` CLI flag | Current session only | 2 |
| `.claude/agents/` | Current project | 3 |
| `~/.claude/agents/` | All user projects | 4 |
| Plugin `agents/` directory | Where plugin is enabled | 5 (lowest) |

When subagents share the same name, the higher-priority location wins. To list all configured subagents: `claude agents` (CLI, no session) or `/agents` (in-session).

**Loading timing:** Subagents load at session start. File-based additions require session restart to take effect. Subagents created through the `/agents` interface are available immediately.

### Full frontmatter field reference

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Unique identifier; lowercase letters and hyphens |
| `description` | Yes | When Claude should delegate to this subagent |
| `tools` | No | Tool allowlist; inherits all tools if omitted |
| `disallowedTools` | No | Tool denylist; applied before `tools` allowlist |
| `model` | No | `sonnet`, `opus`, `haiku`, full model ID, or `inherit` (default) |
| `permissionMode` | No | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Maximum agentic turns before subagent stops |
| `skills` | No | Skills to preload into subagent context at startup (full content, not just descriptions) |
| `mcpServers` | No | Scoped MCP servers; inline definitions or string references to configured servers |
| `hooks` | No | Lifecycle hooks scoped to this subagent |
| `memory` | No | Persistent memory scope: `user`, `project`, or `local` |
| `background` | No | `true` = always run as background task |
| `effort` | No | Effort level override |
| `isolation` | No | `"worktree"` = run in a temporary git worktree (cleaned up if no changes) |
| `color` | No | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan` |
| `initialPrompt` | No | Auto-submitted first turn when agent runs as main session (via `--agent` or `agent` setting) |

### Built-in subagents

| Agent | Model | Tools | Purpose |
|---|---|---|---|
| `Explore` | Haiku | Read-only (Write/Edit denied) | File discovery, code search, codebase exploration |
| `Plan` | Inherits | Read-only | Codebase research during plan mode |
| `general-purpose` | Inherits | All tools | Complex multi-step tasks requiring exploration and action |
| `statusline-setup` | Sonnet | Not documented | Configures status line via `/statusline` |
| `claude-code-guide` | Haiku | Not documented | Answers questions about Claude Code features |

### Tool restrictions

`tools` = allowlist (only listed tools available). `disallowedTools` = denylist (listed tools removed from inherited set). If both are set, denylist applied first, then allowlist resolved against remainder. A tool in both is removed.

**Restricting which subagents an agent can spawn** (when running as main thread via `--agent`):

```yaml
tools: Agent(worker, researcher), Read, Bash
```

This is an allowlist — only `worker` and `researcher` can be spawned. Omitting `Agent` entirely prevents spawning any subagent. `Agent` without parentheses allows spawning any subagent. Subagents themselves cannot spawn other subagents (prevents nesting).

**In v2.1.63:** `Task` tool renamed to `Agent`. `Task(...)` still works as an alias.

### Model resolution order

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var (if set)
2. Per-invocation `model` parameter (from Agent tool call)
3. Subagent definition's `model` frontmatter
4. Main conversation's model

### Invocation patterns

**Natural language:** "Use the code-reviewer subagent to..." — Claude decides whether to delegate.

**@-mention:** `@"code-reviewer (agent)"` in the prompt — guarantees that specific subagent runs for the task. Claude still writes the actual task prompt. Typeahead available with `@`.

**Session-wide:** `claude --agent code-reviewer` — the main thread takes on that subagent's system prompt, tool restrictions, and model for the entire session. `CLAUDE.md` files and project memory still load normally. Can also be set in `.claude/settings.json` via `agent` key.

**`/agents` command:** Tabbed interface with Running tab (live subagents, open/stop controls) and Library tab (view all, create, edit, delete).

### Foreground vs. background

**Foreground:** Blocks main conversation; permission prompts and `AskUserQuestion` pass through.

**Background:** Runs concurrently. Claude Code prompts for all needed tool permissions before launch; subagent auto-denies anything not pre-approved. `AskUserQuestion` tool calls fail silently but the subagent continues.

`Ctrl+B` — background a running task. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables all background task functionality.

### Persistent memory for subagents

`memory` frontmatter field gives the subagent a persistent memory directory:

| Scope | Location |
|---|---|
| `user` | `~/.claude/agent-memory/<name-of-agent>/` |
| `project` | `.claude/agent-memory/<name-of-agent>/` |
| `local` | `.claude/agent-memory-local/<name-of-agent>/` |

When memory is enabled: the subagent's system prompt includes Read/Write/Edit tools (auto-enabled) and loads the first 200 lines / 25KB of its `MEMORY.md` at startup.

### Forked subagents (experimental)

**Requires:** `CLAUDE_CODE_FORK_SUBAGENT=1` env var; Claude Code v2.1.117 or later.

A fork inherits the **full conversation history** of the main session (context, system prompt, tools, model) rather than starting fresh. Fork's own tool calls stay out of the main conversation; only the final result returns.

`/fork <directive>` spawns a fork. When `CLAUDE_CODE_FORK_SUBAGENT=1`, the `general-purpose` subagent is replaced by forks, and all subagent spawns run in the background.

Forks appear in a panel below the prompt input. Key controls: `↑`/`↓` navigate rows; `Enter` opens transcript / sends follow-up; `x` dismisses or stops; `Esc` returns focus to prompt.

**Fork vs. named subagent:**

| Dimension | Fork | Named subagent |
|---|---|---|
| Context | Full conversation history | Fresh context with task prompt |
| System prompt / tools | Same as main session | From definition file |
| Model | Same as main session | From `model` field |
| Prompt cache | Shared with main session (cheaper) | Separate cache |
| Permissions | Prompts surface in terminal | Pre-approved before launch |

A fork cannot spawn further forks.

### Sync vs. async dispatch

As of the reviewed docs, background (async) subagents are supported via the `background: true` frontmatter field and `Ctrl+B`. A known upstream CLI bug (observed on v2.1.119) silently drops async subagent loops when the parent has concurrent activity — the child's last tool_use never gets its next-turn API call, but the harness still reports `completed` to the parent. Sync dispatch (foreground) is unaffected. Filed at [github.com/anthropics/claude-code/issues/54018](https://github.com/anthropics/claude-code/issues/54018). Status as of 2026-05-07: not yet fixed in stable.

### Preloading skills into subagents

`skills` frontmatter field injects the full content of named skills into the subagent's context at startup. Subagents do not inherit skills from the parent conversation — must be listed explicitly. Cannot preload skills with `disable-model-invocation: true`. Missing or disabled skills are skipped with a warning in the debug log.

### Subagent context management

**Resume:** Each subagent invocation creates a new instance by default. To continue an existing subagent's work: ask Claude to resume it (uses `SendMessage` tool with agent ID — requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Resumed subagents retain full conversation history. Agent IDs are available via transcript files or by asking Claude.

**Auto-compaction:** Triggers at ~95% context capacity (or earlier via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`). Compaction events logged in subagent transcript files.

**Plugin subagents:** Do not support `hooks`, `mcpServers`, or `permissionMode` frontmatter — these fields are ignored for plugin-sourced agents.

Source: `code.claude.com/docs/en/sub-agents` (fetched 2026-05-07).

---

## 11. Distinctive Design Choices

Three to five things Claude Code does that are not standard in the AI coding assistant space:

**1. Context delivered as user message, not system prompt.** CLAUDE.md content is injected as a user-turn message after the system prompt, not as part of the system prompt itself. This is documented explicitly and is why the docs describe CLAUDE.md adherence as probabilistic. Most tools (Cursor, Copilot) treat project instructions as system-prompt-level. Claude Code's choice enables richer context layering but means conflicting instructions degrade gracefully rather than failing deterministically.
Source: `code.claude.com/docs/en/memory` (2026-05-07).

**2. Auto-memory (Claude writes its own CLAUDE.md).** Claude accumulates learnings — build commands, debugging insights, code style preferences — across sessions by writing to `~/.claude/projects/<project>/memory/MEMORY.md`. No other major coding assistant has a documented first-class "model writes its own persistent instructions" mechanism as a default-on feature.
Source: `code.claude.com/docs/en/memory` (2026-05-07).

**3. Subagents as a first-class context-isolation primitive.** The ability to define custom subagents (with their own model, tool restrictions, permission mode, MCP servers, and persistent memory) as project-checkable markdown files is distinctive. The explicit design goal of keeping verbose output in a subagent's context window and returning only summaries to the main conversation is a documented pattern, not an emergent one.
Source: `code.claude.com/docs/en/sub-agents` (2026-05-07).

**4. Hooks as deterministic enforcement.** The hook system (PreToolUse / PostToolUse / etc.) with exit-code semantics for blocking, stdout JSON for decision injection, and `additionalContext` for mid-turn Claude steering is a deliberately engineered layer for "what CLAUDE.md cannot enforce." The `additionalContext` mechanism — injecting text into Claude's context mid-turn without the user having typed it — is architecturally unusual.
Source: `code.claude.com/docs/en/hooks` (2026-05-07).

**5. Skills with server-side dynamic context injection.** The `` !`command` `` syntax in `SKILL.md` executes shell commands before the skill content reaches Claude, replacing placeholders with live output. This means a skill can inline live git diffs, PR data, or environment state as part of its system prompt, not as a separate tool call. This is preprocessing at the context-assembly layer, not something Claude orchestrates.
Source: `code.claude.com/docs/en/skills` (2026-05-07).

---

## 12. Known Limitations / Friction Points

The following are documented as not-yet-supported, experimental, or known issues:

**Async subagent dispatch bug (v2.1.119):** Async subagent loops silently drop when the parent has concurrent activity. Child reports `completed` to the parent harness despite incomplete work. Filed at github.com/anthropics/claude-code/issues/54018. Workaround: use synchronous (foreground) dispatch.
Source: Observed behavior documented in project memory (2026-05-07).

**Subagents cannot spawn subagents.** Nesting is explicitly blocked. Workarounds: use skills with `context: fork`, or chain subagents from the main conversation.
Source: `code.claude.com/docs/en/sub-agents` (2026-05-07).

**Forked subagents are experimental.** Require `CLAUDE_CODE_FORK_SUBAGENT=1` and v2.1.117+. Behavior and configuration may change. A fork cannot spawn further forks.
Source: `code.claude.com/docs/en/sub-agents` (2026-05-07).

**CLAUDE.md adherence is probabilistic.** CLAUDE.md is context, not enforcement. "Claude reads it and tries to follow it, but there's no guarantee of strict compliance, especially for vague or conflicting instructions." Hooks are the deterministic alternative.
Source: `code.claude.com/docs/en/memory` (2026-05-07).

**Auto-memory loads only first 200 lines / 25KB of MEMORY.md.** Content beyond that threshold is not loaded at session start. Claude is responsible for keeping MEMORY.md concise by moving detail to topic files. Topic files are not loaded at startup — only on demand.
Source: `code.claude.com/docs/en/memory` (2026-05-07).

**Skill content budget after compaction.** After `/compact`, invoked skills share a 25,000-token budget (5,000 per skill, most-recent-first). Older skills can be dropped entirely if many were invoked.
Source: `code.claude.com/docs/en/skills` (2026-05-07).

**Plugin subagents cannot use hooks, mcpServers, or permissionMode.** These fields are silently ignored for plugin-sourced agents. Workaround: copy agent file into `.claude/agents/` or `~/.claude/agents/`.
Source: `code.claude.com/docs/en/sub-agents` (2026-05-07).

**Path-scoped rules trigger on file read, not on every tool use.** A rule scoped to `src/api/**/*.ts` only loads when Claude reads a file matching that pattern — not when Claude writes to those files or runs Bash commands that happen to touch them.
Source: `code.claude.com/docs/en/memory` (2026-05-07).

**SSE MCP transport is deprecated.** The Server-Sent Events transport is documented as deprecated; HTTP (streamable-HTTP) is the recommended replacement.
Source: `code.claude.com/docs/en/mcp` (2026-05-07).

**`workspace` MCP server name is reserved.** Defining an MCP server with the name `workspace` causes it to be skipped at load time with a warning.
Source: `code.claude.com/docs/en/mcp` (2026-05-07).

**Image / file paste in TTY.** Not documented in the reviewed CLI docs. Multimodal capability exists but TTY-specific paste handling is not described.

**Permissions page (IAM) not fetched.** The URL `code.claude.com/docs/en/iam` was listed as a target but not fetched in this research session. The permissions and trust-directory model was covered from the settings and subagents pages.

---

## 13. Sources

| # | URL | Date fetched | Content extracted |
|---|---|---|---|
| 1 | https://code.claude.com/docs/en/overview | 2026-05-07 | Product overview, surface model, pricing, installation, feature categories |
| 2 | https://code.claude.com/docs/en/quickstart | 2026-05-07 | Installation, auth, first session, input commands, essential command table, keyboard shortcuts |
| 3 | https://code.claude.com/docs/en/memory | 2026-05-07 | CLAUDE.md scope table, auto-memory, load order, path-scoped rules, `/init`, compaction behavior, `/memory` command |
| 4 | https://code.claude.com/docs/en/hooks | 2026-05-07 | All hook types, all hook events, matcher patterns, exit-code semantics, JSON output format, additionalContext, env vars, HTTP/MCP/prompt/agent hook types |
| 5 | https://code.claude.com/docs/en/skills | 2026-05-07 | Skill directory structure, frontmatter fields, string substitutions, dynamic context injection, invocation control, skill lifecycle, compaction budget, bundled skills |
| 6 | https://code.claude.com/docs/en/sub-agents | 2026-05-07 | Built-in subagents, frontmatter fields, tool restrictions, model resolution, invocation patterns, fork mode, persistent memory, background vs. foreground, subagent context management |
| 7 | https://code.claude.com/docs/en/settings | 2026-05-07 | Full settings.json schema, layering/precedence, array merging, managed settings deployment, .claude/ folder structure, env var overrides, CLI flags |
| 8 | https://code.claude.com/docs/en/mcp | 2026-05-07 | MCP scopes, CLI install commands, transport types, scope hierarchy, .mcp.json env var expansion, dynamic tool updates, auto-reconnect, plugin MCP, channel capability |

---

## Appendix A — Gap-fill from community / GitHub sources (added 2026-05-07)

Six gaps were identified in the prior research pass. This appendix fills them from the official `code.claude.com/docs` pages that were not yet fetched, plus community sources for topics the official docs do not cover. Sources are enumerated in A.7.

---

### A.1 Agentic loop internals

**Status: closed — primary source is official docs (`/en/how-claude-code-works`, `/en/agent-sdk/agent-loop`).**

#### The three-phase model

Anthropic documents the loop in three named phases that blend together in practice:

1. **Gather context** — Claude reads files, runs searches, fetches docs, explores the directory tree.
2. **Take action** — Claude edits files, runs commands, calls MCP tools, spawns subagents.
3. **Verify results** — Claude re-runs tests, re-reads changed files, checks outputs, course-corrects.

These phases do not run sequentially and then stop. They repeat in a cycle. A question about a codebase may only need phase 1. A refactor cycles through all three phases dozens of times.

Source: `code.claude.com/docs/en/how-claude-code-works` (fetched 2026-05-07).

#### The mechanics of a single turn

A **turn** is one full cycle: Claude produces output that includes tool calls → the runtime executes those tools → results feed back to Claude as the next input.

Detailed sequence for every turn:

1. Claude receives the full conversation (system prompt + CLAUDE.md + tool definitions + all prior turns with their tool results).
2. Claude evaluates and emits one of: text content blocks, tool call blocks, or both mixed together.
3. If there are tool call blocks, the runtime executes each tool and assembles a `tool_result` response (keyed by `tool_use_id`) which is posted back as a new user-turn message.
4. Claude receives the augmented conversation and decides again — more tool calls, or a text-only response that ends the loop.

Claude can emit multiple tool calls in a single response. Read-only tools (`Read`, `Glob`, `Grep`, MCP tools marked read-only) execute concurrently. State-modifying tools (`Edit`, `Write`, `Bash`) execute sequentially to prevent conflicts.

The loop is an async generator (in open source documentation of the SDK it corresponds to `queryLoop()` in `src/query.ts`) that runs `while(true)` and yields events — text deltas, tool results, error messages — in a stream rather than buffering the whole response.

Source: `code.claude.com/docs/en/agent-sdk/agent-loop` (fetched 2026-05-07); community analysis at `dev.to/kevinzy189` (2025).

#### Stop conditions (five documented)

| Stop condition | How it fires |
|---|---|
| **Natural end** | Model returns `stop_reason: "end_turn"` with no `tool_use` blocks — the model decided it is done |
| **Max turns** | `maxTurns` / `max_turns` limit hit; returns `ResultMessage` with subtype `error_max_turns` |
| **Budget cap** | `maxBudgetUsd` / `max_budget_usd` limit hit; returns `ResultMessage` with subtype `error_max_budget_usd` |
| **Hook intervention** | A `PreToolUse` or `Stop` hook exits with code 2, blocking forward progress |
| **Context overflow** | Auto-compaction fails (e.g., a single tool output is so large that context refills immediately after each summary); loop stops with an error after a few failed compaction attempts |

Additional `ResultMessage` subtypes: `error_during_execution` (API failure or cancelled request), `error_max_structured_output_retries` (structured output validation failed).

In the interactive CLI there is no hard default turn limit — bounds come from context window constraints, user interruption (Escape / Ctrl+C), and natural model termination. The `maxTurns` option is available in the Agent SDK and is recommended for production agents.

Source: `code.claude.com/docs/en/agent-sdk/agent-loop` (fetched 2026-05-07).

#### Error recovery and retry sites

The loop has several named recovery paths, documented in community analysis of the SDK (not all are in the official user-facing docs):

| Recovery mechanism | Description |
|---|---|
| **collapse_drain_retry** | Archives old messages locally without an API call — cheapest recovery |
| **reactive_compact_retry** | Calls a fast summarization model to compress history, then retries |
| **max_output_tokens_escalate** | If the model hits the output token ceiling, retries the same request with a higher ceiling (up to 3 times) |
| **multi-turn recovery** | After hitting output token limit, injects a "resume without recap" user message and continues the turn |
| **streaming fallback** | Falls back from streaming to non-streaming on network errors |
| **fallback model** | Uses a fallback model if the primary model is unavailable |

Transient API failures are handled in an inner retry loop around each API call. These retries are transparent to the conversation — the turn counter only increments on success.

When a custom tool handler throws an uncaught exception the loop **stops** (Claude never sees the error). When a tool returns `isError: true`, the loop **continues** — Claude sees the structured error as data and can retry, use a fallback, or surface the failure cleanly.

Source: community analysis at `dev.to/kevinzy189` (2025), `medium.com/@aiforhuman` (2025), `github.com/VILA-Lab/Dive-into-Claude-Code` (2025).

#### Context management within the loop

The context window does not reset between turns within a session. Everything accumulates: system prompt, tool definitions, CLAUDE.md, conversation history, tool inputs, tool outputs. Content that stays the same across turns (system prompt, tool definitions, CLAUDE.md) is automatically prompt-cached, reducing cost on repeated prefixes.

**Auto-compaction** fires when the context window approaches its limit. The compactor:
1. Summarizes older message history to free space.
2. Preserves recent exchanges and key decisions.
3. Emits a `SystemMessage` with `subtype: "compact_boundary"` in the stream at the compaction point.
4. Re-injects CLAUDE.md content after compaction (it is re-read from disk; see Section 3.2 of the main doc).

If a single file or tool output is so large that context refills immediately after each summary, auto-compaction stops after a few attempts and returns an error instead of looping. This is the "thrashing" failure mode.

`/compact [instructions]` triggers manual compaction with optional focus instructions. A "Compact Instructions" section in CLAUDE.md tells the compactor what to preserve.

Subagents are the primary tool for keeping the main context lean: each subagent starts with a fresh context window; only its final summary returns to the parent conversation.

Source: `code.claude.com/docs/en/how-claude-code-works` (fetched 2026-05-07), `code.claude.com/docs/en/agent-sdk/agent-loop` (fetched 2026-05-07).

#### Architecture note

Community reverse-engineering estimates that only ~1.6% of Claude Code's codebase is AI decision logic. The other ~98.4% is deterministic infrastructure: permission gates, context management, tool routing, and recovery logic. The agentic loop itself is a simple `while(true)` generator; the engineering complexity lives in the systems surrounding it.

Source: `github.com/VILA-Lab/Dive-into-Claude-Code` (2025) — not verified against Anthropic's closed-source codebase.

---

### A.2 Canonical slash command list

**Status: closed — primary source is official docs (`/en/commands`, fetched 2026-05-07).**

The following is the complete built-in command list as of v2.1.x. Commands marked **[Skill]** are prompt-based bundled skills; all others are fixed-logic CLI commands. Availability varies by platform, plan, and environment (e.g., `/desktop` is macOS/Windows only; `/upgrade` is Pro/Max only).

| Command | Type | Purpose |
|---|---|---|
| `/add-dir <path>` | Built-in | Add a working directory for file access this session |
| `/agents` | Built-in | Manage subagent configurations (Running + Library tabs) |
| `/autofix-pr [prompt]` | Built-in | Spawn a cloud session that watches the current branch's PR and pushes fixes when CI fails or reviewers comment |
| `/batch <instruction>` | **Skill** | Orchestrate large-scale changes in parallel across the codebase; spawns one background agent per work unit in an isolated git worktree |
| `/branch [name]` | Built-in | Create a branch (fork) of the current conversation; alias `/fork` |
| `/btw <question>` | Built-in | Ask a side question — sees full context, no tool access, not added to conversation history |
| `/chrome` | Built-in | Configure Claude in Chrome settings |
| `/claude-api [migrate\|managed-agents-onboard]` | **Skill** | Load Claude API reference for current project language; `/migrate` upgrades model IDs; `/managed-agents-onboard` walks through creating a new Managed Agent |
| `/clear` | Built-in | Start fresh conversation with empty context; aliases `/reset`, `/new` |
| `/color [color\|default]` | Built-in | Set prompt bar color for session (`red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`) |
| `/compact [instructions]` | Built-in | Summarize conversation to free context; optional focus instructions |
| `/config` | Built-in | Open Settings interface (theme, model, output style, etc.); alias `/settings` |
| `/context` | Built-in | Visualize context usage as a colored grid; shows optimization suggestions |
| `/copy [N]` | Built-in | Copy last (or Nth-latest) assistant response to clipboard; interactive picker for code blocks; `w` to write to file |
| `/cost` | Built-in | Alias for `/usage` |
| `/debug [description]` | **Skill** | Enable debug logging for the session; read and analyze session debug log |
| `/desktop` | Built-in | Continue session in Claude Code Desktop app (macOS/Windows only); alias `/app` |
| `/diff` | Built-in | Open interactive diff viewer showing uncommitted changes and per-turn diffs; left/right to switch between git diff and individual Claude turns |
| `/doctor` | Built-in | Diagnose Claude Code installation and settings; press `f` to have Claude fix issues |
| `/effort [level\|auto]` | Built-in | Set model effort level (`low`, `medium`, `high`, `xhigh`, `max`, `auto`); interactive slider without argument |
| `/exit` | Built-in | Exit the CLI; alias `/quit` |
| `/export [filename]` | Built-in | Export conversation as plain text to file or clipboard |
| `/extra-usage` | Built-in | Configure extra usage for when rate limits are hit |
| `/fast [on\|off]` | Built-in | Toggle fast mode |
| `/feedback [report]` | Built-in | Submit feedback about Claude Code; alias `/bug` |
| `/fewer-permission-prompts` | **Skill** | Scan transcripts for common read-only Bash/MCP calls and add allowlist to project settings |
| `/focus` | Built-in | Toggle focus view (shows only last prompt, one-line tool summary with diffstats, and final response); fullscreen mode only |
| `/heapdump` | Built-in | Write JavaScript heap snapshot for diagnosing high memory usage |
| `/help` | Built-in | Show help and available commands |
| `/hooks` | Built-in | View hook configurations for tool events |
| `/ide` | Built-in | Manage IDE integrations and show status |
| `/init` | Built-in | Initialize project with CLAUDE.md; `CLAUDE_CODE_NEW_INIT=1` for interactive multi-phase flow |
| `/insights` | Built-in | Generate report analyzing your Claude Code sessions, project areas, interaction patterns |
| `/install-github-app` | Built-in | Set up Claude GitHub Actions app for a repository |
| `/install-slack-app` | Built-in | Install Claude Slack app (opens browser OAuth flow) |
| `/keybindings` | Built-in | Open or create keybindings configuration file (`~/.claude/keybindings.json`) |
| `/login` | Built-in | Sign in to Anthropic account |
| `/logout` | Built-in | Sign out from Anthropic account |
| `/loop [interval] [prompt]` | **Skill** | Run a prompt repeatedly on a schedule; omit interval for self-paced; omit prompt for autonomous maintenance check or `.claude/loop.md`; alias `/proactive` |
| `/mcp` | Built-in | Manage MCP server connections and OAuth authentication |
| `/memory` | Built-in | Edit CLAUDE.md files, toggle auto-memory, view auto-memory entries |
| `/mobile` | Built-in | Show QR code to download Claude mobile app; aliases `/ios`, `/android` |
| `/model [model]` | Built-in | Select or change AI model; left/right to adjust effort level |
| `/passes` | Built-in | Share a free week of Claude Code with friends (eligible accounts only) |
| `/permissions` | Built-in | Manage allow/ask/deny permission rules; alias `/allowed-tools` |
| `/plan [description]` | Built-in | Enter plan mode; optional description starts immediately |
| `/plugin` | Built-in | Manage Claude Code plugins |
| `/powerup` | Built-in | Discover features through interactive lessons with animated demos |
| `/privacy-settings` | Built-in | View/update privacy settings (Pro/Max subscribers only) |
| `/recap` | Built-in | Generate one-line summary of current session on demand |
| `/release-notes` | Built-in | View changelog in interactive version picker |
| `/reload-plugins` | Built-in | Reload all active plugins without restarting |
| `/remote-control` | Built-in | Make session available for remote control from claude.ai; alias `/rc` |
| `/remote-env` | Built-in | Configure default remote environment for web sessions |
| `/rename [name]` | Built-in | Rename current session; auto-generates name from history without argument |
| `/resume [session]` | Built-in | Resume conversation by ID or name, or open session picker; alias `/continue` |
| `/review [PR]` | Built-in | Review a pull request locally in current session |
| `/rewind` | Built-in | Rewind conversation and/or code to a previous checkpoint; aliases `/checkpoint`, `/undo` |
| `/sandbox` | Built-in | Toggle sandbox mode (supported platforms only) |
| `/schedule [description]` | Built-in | Create, update, list, or run routines; alias `/routines` |
| `/security-review` | Built-in | Analyze pending changes on current branch for security vulnerabilities |
| `/setup-bedrock` | Built-in | Configure Amazon Bedrock authentication via interactive wizard (requires `CLAUDE_CODE_USE_BEDROCK=1`) |
| `/setup-vertex` | Built-in | Configure Google Vertex AI via interactive wizard (requires `CLAUDE_CODE_USE_VERTEX=1`) |
| `/simplify [focus]` | **Skill** | Review recently changed files for code quality/reuse issues; spawns three parallel review agents, aggregates findings, applies fixes |
| `/skills` | Built-in | List available skills; `t` to sort by token count; `Space` to adjust visibility |
| `/stats` | Built-in | Alias for `/usage` (opens Stats tab) |
| `/status` | Built-in | Open Settings interface on Status tab (version, model, account, connectivity); works while Claude is responding |
| `/statusline` | Built-in | Configure Claude Code's status line in the shell prompt |
| `/stickers` | Built-in | Order Claude Code stickers |
| `/tasks` | Built-in | List and manage background tasks; alias `/bashes` |
| `/team-onboarding` | Built-in | Generate team onboarding guide from last 30 days of usage history; returns share link for subscribers |
| `/teleport` | Built-in | Pull a Claude Code on the web session into this terminal; alias `/tp` |
| `/terminal-setup` | Built-in | Configure terminal keybindings for Shift+Enter etc. (shown only in terminals that need it) |
| `/theme` | Built-in | Change color theme; includes `auto`, light/dark, daltonized colorblind, ANSI, and custom themes |
| `/tui [default\|fullscreen]` | Built-in | Set terminal UI renderer; `fullscreen` enables flicker-free alt-screen renderer |
| `/ultraplan <prompt>` | Built-in | Draft plan in an ultraplan session, review in browser, then execute remotely or send back to terminal |
| `/ultrareview [PR]` | Built-in | Deep multi-agent code review in cloud sandbox |
| `/upgrade` | Built-in | Open upgrade page (Pro/Max plans only) |
| `/usage` | Built-in | Show session cost, plan usage limits, and activity stats; aliases `/cost`, `/stats` |
| `/voice [hold\|tap\|off]` | Built-in | Toggle voice dictation (requires Claude.ai account) |
| `/web-setup` | Built-in | Connect GitHub account to Claude Code on the web using local `gh` CLI credentials |

**Removed commands (recent):**
- `/pr-comments` — removed in v2.1.91; ask Claude directly instead
- `/vim` — removed in v2.1.92; use `/config` → Editor mode instead

**MCP prompts:** MCP servers can expose prompts that surface as `/mcp__<server>__<prompt>` commands dynamically.

**Key design facts:**
- Commands are only recognized at the start of a message.
- Text after the command name is passed as arguments.
- `/` opens the autocomplete menu with descriptions; keep typing to filter.
- The `/` menu is the canonical source — not all commands appear for every user (plan/platform gates apply).

Source: `code.claude.com/docs/en/commands` (fetched 2026-05-07).

---

### A.3 TTY multimodal input

**Status: partially closed — image paste is supported but platform-specific; behavior documented from community sources and GitHub issues.**

Claude Code is multimodal in the TTY. Supported image formats: JPEG, PNG, GIF, WebP. Max size: 5 MB per image.

**Method 1 — Clipboard paste (Ctrl+V)**

Copy an image to the clipboard and paste with Ctrl+V into the Claude Code prompt. The image appears inline in the conversation. This is the primary method on macOS and Linux.

Important: on macOS, use **Ctrl+V** (not Cmd+V). Cmd+V is captured by the terminal before Claude Code sees it.

**Method 2 — Drag and drop**

Drag an image file from the file system into the Claude Code terminal window. Supported where the terminal forwards file-drag events.

**Method 3 — File path reference**

Type the image file path directly in the prompt. Claude uses the `Read` tool to load it. This is the most reliable cross-platform method.

```
Analyze this screenshot: /Users/name/Desktop/login-bug.png
```

**Platform-specific notes:**

| Platform | Status |
|---|---|
| macOS | Ctrl+V clipboard paste works reliably in most terminals |
| Linux | Works in Konsole, Kitty, Alacritty; fails in some xterm/gnome-terminal configs; treat as opportunistic |
| Windows | Ctrl+V of bitmap screenshots does nothing (silently). Workaround: copy a saved image file in File Explorer with Ctrl+C then Ctrl+V — Claude reads the file reference. GitHub issue #26679 filed 2026-02, still open as of 2026-05. Alt+V was reportedly introduced as a workaround in v1.0.93. |
| SSH/remote | No clipboard bridge — the clipboard lives on the local machine while Claude Code runs on the server. Community tool `claude-ssh-image-skill` bridges this via a local daemon. |

**VS Code extension workaround (cross-platform):** A community VS Code extension auto-saves clipboard images to the project and inserts the file path, using Ctrl+Alt+V (Win/Linux) or Cmd+Alt+V (macOS).

**Official status:** The official docs describe Claude Code as multimodal but do not document TTY paste handling. GitHub issue anthropics/claude-code#32005 and #26679 track the Windows-specific limitation.

Sources: `amanhimself.dev/blog/using-images-in-claude-code` (2025), `felloai.com/claude-code-images` (2025), `github.com/anthropics/claude-code/issues/32005` (2026-02), `github.com/anthropics/claude-code/issues/26679` (2026-02).

---

### A.4 TTY diff rendering

**Status: partially closed — official docs confirm the `/diff` command; TTY-native format described from community sources.**

#### In the TTY (CLI)

When Claude Code edits a file in the terminal under `default` permission mode, it presents the proposed change for approval before writing. The rendering format is:
- **Unified diff** with syntax highlighting and dual line numbers (added/removed lines color-coded).
- Described by community sources as easier to read than raw `git diff` due to syntax coloring.
- The diff is shown inline in the terminal stream, not in an alternate screen.

The `/diff` command (added in a recent release) opens an **interactive diff viewer** inside the terminal showing:
- Uncommitted changes (git diff view)
- Per-turn diffs (what Claude changed in each specific turn)
- Navigation: left/right to switch between git diff and Claude turn diffs; up/down to browse files

This is a terminal-native viewer — no alt-screen required, though fullscreen TUI mode (`/tui fullscreen`) provides a flicker-free rendering option.

#### In VS Code

Side-by-side diff viewer — original on the left, proposed on the right. User can accept, reject, or edit the proposed content directly in the diff view before accepting. Editing the proposal causes Claude to be told the file was modified.

#### In the Desktop app

Rebuilt diff viewer (April 2026 redesign) — pairs Claude's explanatory notes alongside the code delta. Described as significantly faster on large changesets (3,000+ line PRs) than the previous implementation.

#### No `--diff-format` flag exists

No `--diff-format` CLI flag was found in the official docs, GitHub repo, or community sources. The diff format in TTY is unified (not configurable from the command line as of 2026-05-07).

Sources: `code.claude.com/docs/en/commands` (fetched 2026-05-07), `lotharschulz.info/2026/04/17/claude-code-desktop-diff-viewer-vs-claude-code-cli-vs-git-diff` (2026-04), `eesel.ai/blog/ide-diff-viewer-claude-code` (2025).

---

### A.5 Token / cost display

**Status: closed — primary source is official docs (`/en/costs`, fetched 2026-05-07).**

#### The `/usage` command (aliases: `/cost`, `/stats`)

`/usage` opens a tabbed UI inside the session showing session cost, plan usage limits, and activity stats.

**For API (pay-per-token) users:**

```
Total cost:            $0.55
Total duration (API):  6m 19.7s
Total duration (wall): 6h 33m 10.2s
Total code changes:    0 lines added, 0 lines removed
```

The dollar figure is a **local estimate** computed from token counts and published rates — not authoritative billing. For billing, check the Usage page in the Claude Console.

**For subscription users (Pro, Max, Team, Enterprise):**

The Session block in `/usage` shows API token usage but the session cost figure is not meaningful for billing (usage is included in the subscription). Subscribers see:
- **Plan usage bars** — progress against the current 5-hour usage window
- **Activity stats** — session counts, tool use patterns
- A message noting that cost tracking is for API users

Approximate plan windows (community-documented, approximate):
- Pro: ~44,000 tokens per 5-hour window
- Max5: ~88,000 tokens per 5-hour window
- Max20: ~220,000 tokens per 5-hour window

As of August 2025, weekly limits were added on top of the 5-hour windows. Both reset independently — weekly budget can be exhausted before the 5-hour window expires.

#### `/context` command

Shows context window fill percentage as a colored grid with optimization suggestions. Separate from `/usage`. Useful for tracking context pressure mid-session without full cost data.

#### Status line integration

`/statusline` can be configured to display token/context usage continuously in the shell prompt, providing ambient visibility without invoking `/usage`.

#### Background token usage

Claude Code uses a small amount of tokens for background operations (conversation summarization for `--resume`, some command processing). Typical background cost: under $0.04 per session.

#### Team cost tracking

For Console (API key) users, workspace spend limits are configurable in the Claude Console. A "Claude Code" workspace is auto-created on first Console auth — it is exclusively for Claude Code and cannot have API keys created for it.

Recommended TPM per user by org size (from official docs):

| Team size | TPM per user |
|---|---|
| 1–5 | 200k–300k |
| 5–20 | 100k–150k |
| 20–50 | 50k–75k |
| 50–100 | 25k–35k |
| 100–500 | 15k–20k |
| 500+ | 10k–15k |

Average enterprise cost is ~$13/developer/active day, ~$150–250/developer/month (per official docs).

#### Third-party tools (subscription users)

Because `/usage` shows limited data for subscribers, the community has built:
- **ccusage** — CLI tool reading local JSONL files for per-date/session/project breakdown.
- **Claude-Code-Usage-Monitor** — real-time terminal dashboard with burn-rate ML predictions.

These tools show "what it would cost at API rates" — useful for evaluating whether a subscription saves money vs. API key access.

Sources: `code.claude.com/docs/en/costs` (fetched 2026-05-07), `code.claude.com/docs/en/commands` (fetched 2026-05-07), community sources at `ccusage.com`, `claudefa.st/blog` (2026).

---

### A.6 IAM / permissions deep-dive

**Status: closed — primary source is official docs (`/en/permissions`, fetched 2026-05-07). Note: `code.claude.com/docs/en/iam` redirects to `/en/authentication`; the permissions model lives at `/en/permissions`.**

#### Permission system overview

Claude Code uses a tiered permission system:

| Tool type | Default behavior | "Yes, don't ask again" behavior |
|---|---|---|
| Read-only (`Read`, `Grep`, `Glob`) | No prompt | N/A |
| Bash commands | Prompt on first use | Saved permanently per project directory + command |
| File modification (`Edit`, `Write`) | Prompt on first use | Saved until session end |

Rule evaluation order: **deny → ask → allow** (first matching rule wins; deny always takes precedence).

#### Permission modes

| Mode | Description |
|---|---|
| `default` | Prompts on first use of each tool |
| `acceptEdits` | Auto-accepts file edits and common filesystem commands (`mkdir`, `touch`, `mv`, `cp`) for cwd and additional dirs; still prompts for other commands |
| `plan` | Read-only + read-only shell commands only; Claude explores and presents a plan before execution |
| `auto` | Background safety classifier evaluates each action; currently a research preview |
| `dontAsk` | Auto-denies unless pre-approved via `/permissions` or `permissions.allow` rules |
| `bypassPermissions` | Skips all permission prompts; root and home directory `rm -rf` still prompt as a circuit breaker |

`Shift+Tab` cycles through: default → auto-accept edits → plan mode → auto mode.

`bypassPermissions` mode warning: writes to `.git`, `.claude`, `.vscode`, `.idea`, `.husky` execute without prompts. Only safe in isolated environments (containers, VMs). Admins can prevent this mode with `permissions.disableBypassPermissionsMode: "disable"` in managed settings.

#### Rule syntax

Format: `Tool` (all uses) or `Tool(specifier)` (specific uses). Evaluated deny → ask → allow.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git commit *)",
      "Bash(* --version)",
      "Read(~/.zshrc)",
      "WebFetch(domain:github.com)"
    ],
    "deny": [
      "Bash(git push *)",
      "Read(./.env)"
    ],
    "ask": [
      "Bash(git push *)"
    ]
  }
}
```

Wildcard rules: `*` matches any sequence including spaces. `Bash(ls *)` enforces a word boundary (matches `ls -la` but not `lsof`). `Bash(ls*)` without the space matches both.

**Compound commands:** Claude Code parses shell operators (`&&`, `||`, `;`, `|`, `|&`, `&`, newlines) and checks each subcommand independently. A rule like `Bash(safe-cmd *)` does NOT grant permission for `safe-cmd && other-cmd`.

**Process wrappers stripped before matching:** `timeout`, `time`, `nice`, `nohup`, `stdbuf`, bare `xargs`. So `Bash(npm test *)` also matches `timeout 30 npm test`.

**Read-only commands that never prompt** (built-in set, not configurable): `ls`, `cat`, `head`, `tail`, `grep`, `find`, `wc`, `diff`, `stat`, `du`, `cd`, and read-only `git` forms.

#### Tool-specific rule syntax

| Tool | Specifier syntax | Example |
|---|---|---|
| `Bash` | Command string with glob | `Bash(npm run *)` |
| `PowerShell` | Cmdlet/alias with glob; case-insensitive; aliases canonicalized | `PowerShell(Get-ChildItem *)` |
| `Read` / `Edit` | gitignore-spec path pattern | `Read(~/.zshrc)`, `Edit(/src/**/*.ts)` |
| `WebFetch` | Domain specifier | `WebFetch(domain:example.com)` |
| `mcp__*` | Server name or tool name | `mcp__puppeteer`, `mcp__puppeteer__puppeteer_navigate` |
| `Agent` | Subagent name | `Agent(Explore)`, `Agent(my-custom-agent)` |
| `Skill` | Skill name with optional glob | `Skill(deploy *)` |

Path pattern anchoring for `Read`/`Edit`:

| Pattern form | Meaning |
|---|---|
| `//path` | Absolute path from filesystem root |
| `~/path` | From home directory |
| `/path` | Relative to project root |
| `path` or `./path` | Relative to cwd |

Note: `/Users/alice/file` is NOT absolute — it is relative to project root. Use `//Users/alice/file` for absolute.

#### Working directories

Default: cwd where `claude` was launched. Extensions:
- `--add-dir <path>` at startup (also available as `/add-dir` in-session)
- `permissions.additionalDirectories` in settings (persistent)

Important: `--add-dir` grants file access only — NOT full `.claude/` config discovery. Exception: `.claude/skills/` from added directories IS loaded with live-change detection. CLAUDE.md from added directories requires `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.

#### Managed settings (org/enterprise controls)

Managed settings cannot be overridden by user, project, or local settings, and cannot be overridden by command-line arguments. They are delivered via MDM/OS-level policies, managed settings files, or server-managed settings.

**Managed-only settings (settings placed here that cannot be set elsewhere):**

| Setting | Effect |
|---|---|
| `allowManagedHooksOnly` | Only managed hooks, SDK hooks, and force-enabled plugin hooks load; all user/project/plugin hooks blocked |
| `allowManagedMcpServersOnly` | Only `allowedMcpServers` from managed settings respected |
| `allowManagedPermissionRulesOnly` | User and project settings cannot define `allow`, `ask`, or `deny` rules |
| `blockedMarketplaces` | Blocklist of plugin marketplace sources |
| `channelsEnabled` | Enable/disable channels for the org |
| `forceRemoteSettingsRefresh` | Block CLI startup until managed settings are freshly fetched; exit on fetch failure |
| `sandbox.filesystem.allowManagedReadPathsOnly` | Only managed `filesystem.allowRead` paths respected |
| `sandbox.network.allowManagedDomainsOnly` | Only managed `allowedDomains` and `WebFetch(domain:...)` allow rules respected; non-allowed domains blocked without prompting |
| `strictKnownMarketplaces` | Controls which marketplace sources users can install plugins from |
| `wslInheritsWindowsSettings` | WSL reads managed settings from the Windows policy chain |

**Standard managed settings (also configurable at other scopes but effective at managed level):**
- `permissions.disableBypassPermissionsMode: "disable"` — prevents bypass mode
- `permissions.disableAutoMode: "disable"` — prevents auto mode

#### Settings precedence for permissions

1. Managed settings (cannot be overridden by anything)
2. Command-line arguments (session-only overrides)
3. Local project (`.claude/settings.local.json`)
4. Shared project (`.claude/settings.json`)
5. User (`~/.claude/settings.json`)

If a tool is denied at any level, no other level can allow it. If allowed in user settings but denied in project settings, project wins.

#### Permission interaction with hooks

`PreToolUse` hooks run before the permission prompt. Hook decisions do NOT bypass permission rules:
- A deny rule blocks the call even if the hook returned `"allow"`.
- An ask rule still prompts even if the hook returned `"allow"`.
- A hook exit code 2 (blocking) takes precedence over allow rules — the hook can block even what an allow rule would permit.

#### Authentication and IAM

Enterprise users: Claude for Enterprise adds SSO, domain capture, role-based permissions, compliance API, and managed policy settings for org-wide Claude Code configurations.

Console (API key) users: Two roles available when inviting users — "Claude Code" (can only create Claude Code API keys) and "Developer" (can create any API key).

Authentication precedence (highest to lowest): cloud provider credentials (Bedrock/Vertex/Foundry) → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` script → `CLAUDE_CODE_OAUTH_TOKEN` → subscription OAuth from `/login`.

On Team and Enterprise plans, an admin enables/disables Remote Control and web sessions org-wide in Claude Code admin settings at `claude.ai/admin-settings/claude-code`.

Sources: `code.claude.com/docs/en/permissions` (fetched 2026-05-07), `code.claude.com/docs/en/authentication` (fetched 2026-05-07).

---

### A.7 Sources (gap-fill specific)

| # | URL | Date fetched | What was extracted |
|---|---|---|---|
| A1 | https://code.claude.com/docs/en/how-claude-code-works | 2026-05-07 | Agentic loop three-phase model, context window management, auto-compaction behavior, session structure |
| A2 | https://code.claude.com/docs/en/agent-sdk/agent-loop | 2026-05-07 | Turn lifecycle, message types, stop conditions (5), ResultMessage subtypes, parallel tool execution, effort levels, compaction in SDK |
| A3 | https://code.claude.com/docs/en/commands | 2026-05-07 | Complete canonical slash command table (60+ entries), bundled skills list, removed commands |
| A4 | https://code.claude.com/docs/en/permissions | 2026-05-07 | Full permission system, all modes, rule syntax, compound command parsing, managed-only settings table, working directory rules |
| A5 | https://code.claude.com/docs/en/authentication | 2026-05-07 | Authentication precedence, credential storage, apiKeyHelper, team setup flows, enterprise role types |
| A6 | https://code.claude.com/docs/en/costs | 2026-05-07 | /usage command output (API vs subscription), team rate limits table, average enterprise costs, background token usage |
| A7 | https://github.com/anthropics/claude-code (README) | 2026-05-07 | Repository metadata; only `/bug` command documented in README; no slash command list or agentic loop description |
| A8 | github.com/anthropics/claude-code/issues/32005 | Community; cited via search result | Image paste feature request for terminal (open) |
| A9 | github.com/anthropics/claude-code/issues/26679 | Community; cited via search result | Windows clipboard image paste limitation (open as of 2026-05) |
| A10 | amanhimself.dev/blog/using-images-in-claude-code | 2025 | Image paste methods, platform notes, supported formats |
| A11 | felloai.com/claude-code-images | 2025 | Windows workarounds for image paste |
| A12 | lotharschulz.info/2026/04/17/claude-code-desktop-diff-viewer-vs-claude-code-cli-vs-git-diff | 2026-04 | CLI diff rendering format (unified, syntax-highlighted), Desktop app diff viewer comparison |
| A13 | dev.to/kevinzy189 (Claude Certified: Inside the Agentic Loop) | 2025 | Tool call decision mechanics, stop conditions enumeration, named retry sites in loop |
| A14 | github.com/VILA-Lab/Dive-into-Claude-Code | 2025 | Architecture proportion estimate (1.6% AI logic / 98.4% infrastructure); community analysis, not verified against closed-source codebase |
| A15 | ccusage.com, claudefa.st/blog | 2026 | Subscription usage window sizes (approximate), third-party monitoring tools |
