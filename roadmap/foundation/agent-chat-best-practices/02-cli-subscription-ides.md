# CLI-Subscription IDEs — Agent-Chat UX Survey

**Document role:** Foundation doc 02 of 3 for the agent-chat gap analysis.
**Scope:** Tools that wrap a subscription CLI rather than billing API tokens directly.
This is the commercially closest peer category to Ouroboros.

**Companion doc:** `02b-claude-code-terminal-deepdive.md` covers Claude Code's terminal UX in full depth. This doc gives Claude Code a survey-level treatment consistent with the other entries.

**Last updated:** 2026-05-07

---

## The defining axis for this category

These tools share a billing model: the user pays a flat monthly subscription to an LLM provider (Anthropic, OpenAI, Google, etc.) and the tool wraps that subscription's CLI or OAuth token. The user does not see a per-token invoice. This is architecturally distinct from tools like Cursor or Cline that call provider APIs and pass the bill to the user on consumption.

**Critical ecosystem event (2026-01-09):** Anthropic revoked third-party OAuth access to Claude subscriptions. After this date, tools other than Claude Code's own surfaces can no longer use a Claude Pro/Max subscription to authenticate — they must use an API key and pay per-token. This reshaped the economics of the entire category. Sources: [Thomas Wiegold Blog](https://thomas-wiegold.com/blog/i-switched-from-claude-code-to-opencode/), [Product Compass](https://www.productcompass.pm/p/claude-code-pricing). Goose and Piebald have partially worked around this via ACP/Agent Client Protocol (passing through the official CLI binary rather than direct OAuth), but the pass-through situation remains fragile.

---

## 1. Claude Code

**URL:** https://code.claude.com / https://claude.ai/code
**GitHub:** https://github.com/anthropics/claude-code
**Last verified:** 2026-05-07 (docs at https://code.claude.com/docs/en/overview)
**Pricing model:** Claude Pro ($20/mo) or Claude Max ($100+/mo) subscription required for all surfaces. Third-party API keys also accepted (for users without a subscription). No per-token billing within a subscription.
**License / openness:** Closed source (the harness); MCP standard is open.
**Critical — how does it bill?** Flat subscription. The user pays Anthropic a monthly fee; Claude Code consumes from that plan's usage pool. No separate per-token invoice is generated. Claude Code is Anthropic's own harness, so it retains access even after the Jan 2026 third-party subscription lockout.

### Chat surface model

Claude Code ships on five surfaces, all backed by the same engine:

- **Terminal CLI** — the canonical surface. Full-featured REPL started with `claude` in any project directory. Interactive multi-turn conversation with the agent.
- **VS Code / Cursor / JetBrains extensions** — inline diff view, @-mention context, plan review, and conversation history embedded in the editor panel.
- **Desktop app** — standalone Electron app for visual diff review, multiple sessions side-by-side, scheduled tasks, and cloud session kick-off.
- **Web (claude.ai/code)** — browser-based; useful for repos you don't have locally and for kicking off long-running tasks from mobile.
- **iOS app** — starts and monitors sessions; pairs with `--teleport` to hand off to terminal.

CLAUDE.md files, settings, and MCP servers are shared across all surfaces. Sources: [Claude Code overview](https://code.claude.com/docs/en/overview).

### Composer

Terminal: a readline-style prompt. No rich text, no @-mention autocomplete in the raw CLI. Input is plain text. Multi-line input supported via backslash continuation or heredoc patterns.

VS Code extension: richer composer with @-mention support for files and symbols, plan review UI before execution, and conversation history in a sidebar panel.

Desktop app: visual diff review alongside a chat composer; multiple sessions can be tiled side-by-side.

Skills (formerly "custom commands") are invoked with `/skill-name` from any surface. Built-in bundled skills include `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`. Skill arguments are passed as space-separated tokens after the skill name. Source: [Skills docs](https://code.claude.com/docs/en/skills).

The `/` menu autocompletes available skills with `argument-hint` shown during selection. Skill descriptions are loaded into context so the model can also auto-invoke them; `disable-model-invocation: true` restricts a skill to user-only invocation. Source: [Skills docs](https://code.claude.com/docs/en/skills).

### Context surfacing (rules, memories, skills, files)

**CLAUDE.md files** — the primary human-authored context mechanism. Markdown files loaded at session start from a hierarchy of scopes:

| Scope | Location | Who sees it |
|---|---|---|
| Managed policy | `/etc/claude-code/CLAUDE.md` (Linux) / `C:\Program Files\ClaudeCode\CLAUDE.md` (Win) | All users on machine |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team (via source control) |
| User | `~/.claude/CLAUDE.md` | You, all projects |
| Local | `./CLAUDE.local.md` | You, this project (gitignored) |

Files are concatenated (not overriding) from root down to working directory. Subdirectory CLAUDE.md files load on-demand when Claude reads files in those directories. The `/memory` command lists all loaded files. HTML comments in CLAUDE.md are stripped before injection — maintainer notes consume zero tokens. Source: [Memory docs](https://code.claude.com/docs/en/memory).

**Path-scoped rules** — `.claude/rules/*.md` files with YAML frontmatter `paths:` field. Only load when Claude works with matching glob patterns. Reduce noise and context consumption vs. always-on CLAUDE.md instructions. Source: [Memory docs](https://code.claude.com/docs/en/memory).

**Auto memory** — Claude writes its own learnings to `~/.claude/projects/<repo>/memory/MEMORY.md` and topic files. First 200 lines (or 25KB) of `MEMORY.md` load at session start; topic files load on-demand. Enabled by default since v2.1.59; toggle with `/memory` or `autoMemoryEnabled` setting. Source: [Memory docs](https://code.claude.com/docs/en/memory).

**Skills** — `SKILL.md` files in `~/.claude/skills/`, `.claude/skills/`, or plugin directories. Skill descriptions are always in context; full body loads only on invocation (lazy). Supports dynamic context injection via `` !`shell command` `` syntax executed before Claude sees the skill. Survives compaction: first 5,000 tokens per skill re-attached after `/compact`, shared 25,000-token budget across all invoked skills. Source: [Skills docs](https://code.claude.com/docs/en/skills).

**File @-mentions** — documented in VS Code extension; not available in raw terminal composer.

**`@path` imports in CLAUDE.md** — import additional files with `@path/to/file` syntax, up to 5 hops deep. All imports load at launch. Source: [Memory docs](https://code.claude.com/docs/en/memory).

### Tool / agent dispatch UX

Permission modes (configurable via `/config`, `--permission-mode` flag, or `permissions.defaultMode` setting):

| Mode | Behavior |
|---|---|
| `default` | Prompt user before each tool call |
| `acceptEdits` | Auto-approve file edits; prompt for everything else |
| `plan` | Show full plan; prompt for approval before any execution |
| `auto` | AI classifier auto-approves safe operations |
| `dontAsk` | Auto-approve all tools (interactive only) |
| `bypassPermissions` | Skip all checks (`--dangerously-skip-permissions`) |

`Shift+Tab` cycles permission modes mid-session. Source: [Settings docs](https://code.claude.com/docs/en/settings).

**Granular allow/ask/deny rules** — per-tool and per-specifier, e.g. `Bash(npm run *)`, `WebFetch(domain:example.com)`, `Read(./.env)`. Evaluated deny-first, then ask, then allow. First match wins. Source: [Settings docs](https://code.claude.com/docs/en/settings).

**Sub-agents** — Claude Code can spawn multiple parallel Claude Code agents via the `Task` tool. A lead agent coordinates, assigns subtasks, and merges results. Each subagent can have its own memory and skill preloads. Source: [Claude Code overview](https://code.claude.com/docs/en/overview).

**Sandbox** — optional bash sandboxing with filesystem allow/deny lists and network domain restrictions. Source: [Settings docs](https://code.claude.com/docs/en/settings).

**Enterprise enforcement** — managed settings layer (MDM/Group Policy) can lock permission rules, deny bypass mode, restrict available models and MCP servers. `allowManagedPermissionRulesOnly: true` ignores user/project permission rules entirely. Source: [Settings docs](https://code.claude.com/docs/en/settings).

### File / diff integration

- **Terminal**: Claude reads and edits files directly via filesystem tools. No inline diff UI — edits are applied and the user sees the result in their editor.
- **VS Code / Cursor / JetBrains**: inline diff view with accept/reject per change. Changes proposed before being applied. Plan review UI shows the sequence of planned edits.
- **Desktop app**: visual diff review as a dedicated panel; supports reviewing diffs from multiple sessions side-by-side.
- **Web**: browser-based diff review for repos not available locally.

Git operations (stage, commit, branch, PR) performed directly by the agent via Bash tool. Source: [Claude Code overview](https://code.claude.com/docs/en/overview).

### Multi-session / threading

- Each `claude` invocation starts a fresh session with an empty context window.
- `--resume <session-id>` resumes a previous session (context window restored).
- **Remote Control**: continue a local terminal session from a phone or another device.
- **Teleport**: `claude --teleport` pulls a web/iOS session into the terminal; `/desktop` hands off a terminal session to the Desktop app.
- **Dispatch**: message a task from the iOS app; the Desktop app creates and manages the session.
- Sessions are not threaded/branched — each is a linear conversation.
- Routines (scheduled tasks) run on Anthropic infrastructure independent of any active session.
- Desktop app shows multiple sessions side-by-side but they are independent, not forked.

Source: [Claude Code overview](https://code.claude.com/docs/en/overview).

### Streaming / progress UX

- Terminal: live streaming of model output to stdout. Tool calls display as they execute (e.g., `Reading file...`, `Running bash...`).
- A spinner and tool-call label appear during execution; results stream inline.
- `/compact` compresses the conversation history to free context, with a brief summary of what was removed. CLAUDE.md and invoked skills are re-injected after compaction.
- Context window visualization available (not documented in detail in overview).
- No documented "thinking" / extended reasoning display in the terminal surface.

Source: [Claude Code overview](https://code.claude.com/docs/en/overview), [Memory docs — compaction behavior](https://code.claude.com/docs/en/memory).

### Approval / safety

- Permission mode system (described above under Tool dispatch).
- Managed policy layer for enterprise enforcement.
- Bash sandboxing with network + filesystem restrictions.
- Hooks — shell commands that fire at lifecycle events (pre-tool-use, post-tool-use, etc.) for deterministic enforcement. Source: [Claude Code overview](https://code.claude.com/docs/en/overview).
- `--dangerously-skip-permissions` available but can be disabled by enterprise policy via `disableBypassPermissionsMode`.
- No documented prompt injection detection (unlike Goose).

### Distinctive choices

1. **CLAUDE.md as the primary memory primitive** — human-authored, version-controllable, hierarchical by directory scope, imported with `@path` syntax. The standard has spread to competitors (AGENTS.md, .goosehints, etc.).
2. **Skills with lazy loading** — skill bodies don't load until invoked; only descriptions are always in context. Survives compaction with a per-skill token budget.
3. **Cross-surface continuity** — the same CLAUDE.md, settings, and MCP servers work across terminal, VS Code, JetBrains, Desktop, Web, and iOS.
4. **Subscription authority** — as Anthropic's own harness, Claude Code retained subscription access after the Jan 2026 lockout that cut off third-party tools.
5. **Routines** — scheduled recurring tasks running on Anthropic infrastructure (not the user's machine).
6. **Agent SDK** — public SDK for building custom agents powered by Claude Code's tools, with full control over orchestration, tool access, and permissions.

### Sources

- [Claude Code overview](https://code.claude.com/docs/en/overview) — 2026-05-07
- [Memory / CLAUDE.md docs](https://code.claude.com/docs/en/memory) — 2026-05-07
- [Skills docs](https://code.claude.com/docs/en/skills) — 2026-05-07
- [Settings / permissions docs](https://code.claude.com/docs/en/settings) — 2026-05-07
- [Claude Code pricing](https://www.productcompass.pm/p/claude-code-pricing) — 2026
- Deep-dive: see companion doc `02b-claude-code-terminal-deepdive.md`

---

## 2. Piebald

**URL:** https://piebald.ai/
**Downloads:** https://piebald.ai/downloads
**GitHub org:** https://github.com/Piebald-AI
**Last verified:** 2026-05-07
**Pricing model:** Free (Basic) + $20/month (Pro). The tool is itself the product; LLM access uses the user's existing subscriptions or API keys — no separate per-token billing from Piebald. Claude Pro/Max, ChatGPT Pro/Plus, Google AI Free/Pro/Ultra, and API keys all accepted.
**License / openness:** Closed source (the IDE binary). Several companion tools (tweakcc, claude-code-system-prompts, gemini-cli-desktop, splitrail) are open source under the Piebald-AI GitHub org.
**Critical — how does it bill?** Piebald itself charges a flat $20/mo for Pro features. LLM usage bills through whichever provider the user configures — subscription pass-through (where allowed), API key, or OAuth. Piebald's billing is entirely separate from the LLM cost. After Anthropic's Jan 2026 lockout, Claude subscription pass-through may be affected; the product page still advertises "Claude Pro/Max" as a supported subscription as of v0.2.7 (2026-04-15).

### Chat surface model

Piebald is a cross-platform desktop IDE (macOS, Windows x64, Linux x64/ARM64) focused on agentic developer workflows. It presents a multi-session sidebar with parallel agent sessions running simultaneously.

Key UI elements:
- **Sidebar navigation** — all active sessions visible with real-time status (working / pending / completed).
- **Multi-chat interface** — multiple agent conversations can run in parallel; each has its own context and tool state.
- **Session status visibility** — pending tool calls, draft prompts, and working agents all surfaced at a glance.
- **Draft preservation** — prompts are auto-saved as you type; not lost across app restarts.
- **Pending tool call persistence** — tool calls awaiting manual approval remain pending across app restarts and machine reboots.

Sources: [piebald.ai](https://piebald.ai/), [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Composer

- **Rich text input** — file @-mentioning directly in the compose box.
- **Slash commands** — available from composer.
- **Shell-style prompt history search** — Pro: retrieve previous prompts with history navigation.
- **Message queuing** — Pro: queue messages to be sent when the agent is ready, without waiting.
- **Draft auto-save** — all in-progress prompts are persisted automatically.

Source: [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Context surfacing (rules, memories, skills, files)

- **AGENTS.md** — Piebald reads `AGENTS.md` for project-level agent instructions (the cross-tool standard, also used by OpenAI Codex, Gemini CLI). Position relative to other context files: not documented in detail.
- **Agent Skills** — integrated with [agentskills.io](https://agentskills.io) open standard. Same standard as Claude Code's skills; skills loaded from that registry can be used inside Piebald sessions.
- **Profiles** — reusable configuration collections. Each profile can specify: which provider/model to use, which MCP servers are enabled, which individual tools are enabled, system prompt content, and inference hyperparameters. Profiles are switchable per-chat.
- **System prompt customization** — full manual control over system instructions, per-chat or per-profile.
- **File @-mentions** — inline in the composer.
- **Chat compaction** — with custom instructions (not just automatic); user can influence what the summary preserves.

Source: [piebald.ai](https://piebald.ai/) — 2026-05-07.

### Tool / agent dispatch UX

- **Plan Mode** — model proposes a solution; user approves before any execution begins. Equivalent to Claude Code's `plan` permission mode.
- **Persistent pending tool calls** — tool calls requiring manual approval persist across restarts and reboots. The agent does not lose state waiting for the user.
- **Per-chat and per-profile tool control** — MCP servers and individual tools can be enabled/disabled at the chat level or profile level.
- **Tool call re-execution** (Pro) — re-run a specific tool call from history without re-running the entire conversation.
- **Inference hyperparameter overrides** — temperature, stop sequences, max tokens, provider-specific JSON override fields. The agent loop is a series of HTTP requests; Piebald exposes the full configuration surface.
- **Sub-agents** — documented as supported; orchestration details not documented beyond the feature mention.

Source: [piebald.ai](https://piebald.ai/), [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### File / diff integration

**Pro tier only:**
- **Integrated file browser** — browse project files without leaving Piebald.
- **Integrated code editor** — edit files directly inside the IDE.
- **Integrated terminal** — run shell commands inside the IDE.
- **Clickable file path references** — file paths mentioned in responses are clickable, opening the file directly.

Free tier: not documented. The tool is oriented toward controlling agent sessions rather than providing a full editor experience in the free tier.

Source: [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Multi-session / threading

- **Parallel sessions** — multiple agents can run simultaneously; the sidebar shows all.
- **Branching / forking chats** (Pro) — fork a conversation at any point, creating a branch with the same history up to that moment. Explore alternative approaches without losing the original thread.
- **Chat continuation / duplication** (Pro) — duplicate an existing session or continue a past session.
- **Git worktree management** (Pro) — manage git worktrees directly from within Piebald, enabling different agent sessions to work on different branches simultaneously.

This is one of Piebald's strongest differentiators: explicit session branching is not offered by Claude Code or Goose.

Source: [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Streaming / progress UX

- **Streamed tool calls with emoji reactions** — tool execution results are streamed with visual feedback (emoji reactions on tool calls). Free tier feature.
- **HTTP traffic inspector** (Pro) — real-time visibility into all HTTP requests powering the agentic loop: request/response bodies, headers, status codes, durations, and individual SSE chunks. This is unique in the category — no other surveyed tool exposes raw inference traffic to the user.
- **Desktop notifications** — alerts when a session is waiting for user input (e.g., pending tool approval).
- **Automatic chat tagging** (Pro) — sessions are auto-tagged for easy retrieval later.

Source: [piebald.ai](https://piebald.ai/), [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Approval / safety

- **Plan Mode** — approve the plan before execution (equivalent to Claude Code's plan mode).
- **Persistent pending tool calls** — approval requests survive reboots; the agent waits indefinitely.
- **Pausing the agentic loop** (Pro) — pause a running agent mid-execution without cancelling it. Resume when ready.
- Granular tool enable/disable per chat and per profile.
- No documented sandbox or network restriction layer.
- No documented prompt injection detection.

Source: [piebald.ai](https://piebald.ai/), [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07.

### Distinctive choices

1. **HTTP traffic inspector** — exposes raw SSE chunks and inference HTTP traffic in real time. No other tool in this survey does this. Targeted at developers who want to understand exactly what's happening under the hood.
2. **Session branching / forking** — Pro tier allows forking a conversation at any turn. No other surveyed tool offers this.
3. **Persistent pending approvals across reboots** — tool calls that need user approval are not dropped when the machine restarts. The session recovers exactly where it was.
4. **Inference hyperparameter exposure** — temperature, stop sequences, max tokens, per-chat and per-profile, not just per-session. Most tools hide these entirely.
5. **Pausing the agentic loop** — freeze execution without cancelling, then resume. Distinct from rejecting a tool call.
6. **Cross-provider subscription support** — advertises Claude Pro/Max, ChatGPT Pro/Plus, Google AI Free/Pro/Ultra, GitHub Copilot, Amazon Bedrock, and Qwen.ai in one tool. Piebald positions itself as the provider-agnostic IDE layer.
7. **Windows-native without WSL** — explicitly called out; no Git Bash or WSL required.

### Sources

- [piebald.ai](https://piebald.ai/) — 2026-05-07
- [piebald.ai/pricing](https://piebald.ai/pricing) — 2026-05-07
- [piebald.ai/downloads](https://piebald.ai/downloads) — v0.2.7, 2026-04-15
- [github.com/Piebald-AI](https://github.com/Piebald-AI) — 2026-05-07
- [tweakcc repo](https://github.com/Piebald-AI/tweakcc) — 2026-05-07

---

## 3. Goose (Block / AAIF)

**URL:** https://goose-docs.ai/
**GitHub:** https://github.com/aaif-goose/goose (AAIF governance) / original: https://github.com/block/goose
**Last verified:** 2026-05-07
**Pricing model:** Free. Apache 2.0 open source. The user pays only for the LLM provider they connect (API key or subscription pass-through where available via ACP). Goose itself costs nothing.
**License / openness:** Fully open source, Apache 2.0. In December 2025, Block donated Goose to the Linux Foundation's Agentic AI Foundation (AAIF), putting it under neutral governance alongside Anthropic's MCP and OpenAI's AGENTS.md standards.
**Critical — how does it bill?** Goose is free. LLM costs go directly to whichever provider the user configures. For subscriptions (Claude, ChatGPT, Gemini), Goose uses the **Agent Client Protocol (ACP)** to route through the official CLI binaries (Claude Code CLI, Codex CLI, Gemini CLI, Cursor Agent) — meaning the user's existing subscription is consumed rather than API tokens. This is a genuine subscription pass-through model that survives the Jan 2026 lockout by passing through the official CLI rather than using direct OAuth. For API-based providers (Anthropic, OpenAI, Google, Mistral, xAI, etc.), users supply API keys. 30+ providers supported total. Sources: [goose-docs.ai](https://goose-docs.ai/), [Block announcement](https://block.xyz/inside/block-open-source-introduces-codename-goose), [tooldirectory.ai/tools/goose](https://tooldirectory.ai/tools/goose).

### Chat surface model

Goose ships in two primary forms:

**Desktop app** — native GUI for macOS, Linux, and Windows. Chat-like interface described as "perfect for visual thinkers and those who prefer a chat-like experience." Extensions can render interactive UIs directly inside the Desktop app — buttons, forms, visualizations — beyond plain text responses. 38,000+ GitHub stars and 400+ contributors as of April 2026.

**CLI** — terminal-based. `goose session` starts an interactive session. "For developers who live in the terminal, offering speed, scripting capabilities, and deep integration."

Both surfaces share the same extension/MCP ecosystem and context configuration.

Source: [goose-docs.ai](https://goose-docs.ai/), [vibecodinghub.org/tools/goose](https://vibecodinghub.org/tools/goose) — 2026-05-07.

### Composer

- Natural language input; the user "describes tasks naturally."
- Desktop app: chat-style input area. No detailed composer documentation available (goose-docs.ai sub-pages return 404 as of 2026-05-07).
- CLI: readline-style prompt within the `goose session` REPL.
- Interactive UI elements from extensions can appear inline in the Desktop app — forms and buttons rendered by extension code, not just text.
- Recipes can be invoked as automations (YAML-defined workflows launched by name).

Source: [goose-docs.ai](https://goose-docs.ai/) — 2026-05-07.

### Context surfacing (rules, memories, skills, files)

**`.goosehints` files** — Goose's primary context mechanism, analogous to CLAUDE.md. Key characteristics:

- Plain text (any format — markdown common in practice).
- **Project-level**: lives in the project root directory; loaded when Goose starts a session in that directory. Can be nested in subdirectories for granular instructions.
- **Global-level**: `~/.config/goose/.goosehints` — applies to all sessions on the machine.
- **Loading behavior**: contents are appended to the system prompt on every request. Every line is sent with every request — no lazy loading, no token budget management.
- Multiple `.goosehints` files can coexist (root + subdirectories), with subdirectory files providing more specific context.
- Community use: project structure, tech stack choices, coding conventions, style preferences, build/run tips.
- Meta-pattern: community members ask Goose to write its own `.goosehints` after exploring a new project, then keep it updated.

Sources: [block.github.io/goose/blog/2025/06/05/whats-in-my-goosehints-file/](https://block.github.io/goose/blog/2025/06/05/whats-in-my-goosehints-file/), [dev.to/lymah/using-goosehints-files-with-goose-304m](https://dev.to/lymah/using-goosehints-files-with-goose-304m), [dev.to/nickytonline/advent-of-ai-2025-day-16-planning-with-goosehints-875](https://dev.to/nickytonline/advent-of-ai-2025-day-16-planning-with-goosehints-875).

**Memory Extension (MCP-based)** — dynamic storage using MCP. Stores and retrieves context on-demand using tags or keywords. Lives in `~/.goose/memory` (local) or `~/.config/goose/memory` (global). Unlike `.goosehints` (always-loaded), Memory Extension is queried as needed. Updated dynamically as the agent works.

**`AGENTS.md`** — Goose also reads `AGENTS.md` for cross-tool compatibility (same standard used by Codex, Claude Code, Cursor). Scope: repository-wide. Goose-specific preferences go in `.goosehints`; multi-tool conventions go in `AGENTS.md`.

**Extensions (MCP)** — 70+ documented extensions for file systems, databases, APIs, code repositories, web browsing, and more. Extensions are configured via `goose configure`. Extension configuration is per-session.

Source: search results dated 2025-2026; [goose-docs.ai](https://goose-docs.ai/).

### Tool / agent dispatch UX

- **Safety features**: prompt injection detection, tool permission controls, sandbox mode, adversary reviewer (watches for unsafe actions).
- **Sub-agents**: Goose can spawn independent subagents to handle tasks in parallel — code review, research, file processing — keeping the main conversation clean.
- Tool permission controls: not documented in detail beyond the feature mention (goose-docs.ai sub-pages return 404).
- **ACP as provider protocol**: when using Claude Code, Codex CLI, Cursor Agent, or Gemini CLI as providers, Goose acts as an ACP orchestrator. The underlying CLI handles its own tool execution; Goose routes the conversation through it. Tool dispatch UX in this mode depends on the underlying CLI.
- **Recipes** — portable YAML workflow automations. Can launch multi-step sequences with parameters, include subrecipes, and be shared across teams or run in CI/CD pipelines. This is Goose's closest analog to Claude Code's skills, but YAML-first rather than Markdown-first.

Source: [goose-docs.ai](https://goose-docs.ai/), [vibecodinghub.org/tools/goose](https://vibecodinghub.org/tools/goose).

### File / diff integration

Desktop app: described as supporting visual tool confirmations, real-time thought processes, and code diff viewing. The `gemini-cli-desktop` companion repo (also from Piebald-AI, serving as a reference for Goose's Desktop UX approach) explicitly lists "code diff viewing" and "file tree browser."

Goose's Desktop app includes interactive UI components rendered by extensions — file browsing, forms, and visualizations can appear inline. This is more flexible than a fixed diff viewer: extension authors control the UI surface.

CLI: plain text output; diff display depends on the underlying tool or extension.

File/diff detail not fully documented in current public docs (sub-pages 404 as of 2026-05-07).

Source: [goose-docs.ai](https://goose-docs.ai/).

### Multi-session / threading

- `goose session` starts an interactive session; session naming and resumption supported via CLI flags (exact flags not documented in current accessible docs).
- No session branching/forking documented.
- Sub-agents run independently in parallel, coordinated by the main session.
- ACP server mode: Goose works as an ACP server, allowing connection from Zed, JetBrains, or VS Code. This means an IDE can dispatch to Goose as a backend agent while the user interacts through the IDE's own UI.
- Routines / scheduled sessions: not documented.

Source: [goose-docs.ai](https://goose-docs.ai/).

### Streaming / progress UX

- Desktop app: streaming responses displayed in the chat-like interface. Interactive UI components from extensions can render progressively.
- "Real-time thought processes" — documented in the gemini-cli-desktop companion as a Desktop UX feature; likely applies to Goose Desktop as well.
- CLI: output streams to terminal as the model generates.
- No dedicated "thinking" or extended reasoning visualization documented.

Source: [goose-docs.ai](https://goose-docs.ai/), implied from companion repo descriptions.

### Approval / safety

- **Prompt injection detection** — documented as a built-in safety feature; implementation details not public.
- **Tool permission controls** — users can configure which tools/extensions are available per session.
- **Sandbox mode** — isolates execution from the broader filesystem/network; details not documented.
- **Adversary reviewer** — a secondary model or rule layer that watches for unsafe actions. Unique in this category — neither Claude Code nor Piebald documents an equivalent.
- No equivalent to Claude Code's enterprise managed settings layer.

Source: [goose-docs.ai](https://goose-docs.ai/).

### Distinctive choices

1. **ACP subscription pass-through** — routes conversations through official CLI binaries (Claude Code, Codex, Gemini CLI) via Agent Client Protocol. The user's existing CLI subscription is consumed, not API tokens. This is the most complete and principled solution to the subscription pass-through problem in the category.
2. **Adversary reviewer** — a built-in safety watcher that observes the agent's actions and flags unsafe behavior. No equivalent in Claude Code or Piebald.
3. **Prompt injection detection** — built-in defense against adversarial inputs in tool output. Not documented by other surveyed tools.
4. **Interactive extension UIs** — extensions can render buttons, forms, and visualizations directly inside the Desktop chat surface. Extensions are full UI citizens, not just tool-call responders.
5. **Recipes (YAML workflows)** — shareable, parameterized, CI/CD-compatible workflow automations. YAML-first vs. Claude Code's Markdown-first skills.
6. **Open governance** — donated to Linux Foundation AAIF in Dec 2025. Provider-agnostic by design; not strategically locked to any one LLM vendor.
7. **`.goosehints` always-loaded** — simpler mental model than Claude Code's lazy/eager distinction, but less token-efficient. Every hint line sends on every request.

### Sources

- [goose-docs.ai](https://goose-docs.ai/) — 2026-05-07
- [Block announcement](https://block.xyz/inside/block-open-source-introduces-codename-goose) — 2025-01
- [AAIF governance](https://github.com/aaif-goose/goose) — 2025-12
- [tooldirectory.ai/tools/goose](https://tooldirectory.ai/tools/goose) — 2026
- [vibecodinghub.org/tools/goose](https://vibecodinghub.org/tools/goose) — 2026
- [.goosehints blog post](https://block.github.io/goose/blog/2025/06/05/whats-in-my-goosehints-file/) — 2025-06-05
- [DEV: Using .goosehints files](https://dev.to/lymah/using-goosehints-files-with-goose-304m) — 2025
- [DEV: Advent of AI Day 16](https://dev.to/nickytonline/advent-of-ai-2025-day-16-planning-with-goosehints-875) — 2025-12

---

## 4. Additional tools investigated

### 4.1 OpenCode

**URL:** https://opencode.ai (SST team)
**GitHub:** 112,000+ stars as of 2026
**Coverage level:** Partial — included because it is the closest functional peer to Claude Code and the top community alternative.

**Billing:** API keys for most providers. Officially supports ChatGPT Plus, GitHub Copilot, and GitLab Duo subscription pass-through. Claude subscription pass-through: Anthropic blocked it in Jan 2026; API key required for Claude with OpenCode.

**Architecture:** Client/server — a local agent server with a TUI (TypeScript/Zig) on top. IDE integrations connect to the same server. This enables a planned "Workspaces" feature where context persists even when the laptop is closed — not yet shipped.

**UX highlights:**
- TUI with proper buffer system, scrolling, resize handling.
- Syntax-highlighted inline diffs.
- LSP integration loads language servers automatically (~50ms file navigation vs. 45 seconds text-search on large codebases).
- Slash commands, subagents, MCP integration, GitHub Actions support, plugin system — feature parity with Claude Code on most axes.
- "Air-gapped Mode" via Ollama for regulated environments (healthcare, defence, fintech).
- 75+ LLM providers via AI SDK and models.dev.

**Why noted:** Largest open-source community in the category; architecturally interesting (client/server separates UI from agent). Not a subscription-wrapping IDE in the primary sense — requires API keys for most providers — but the Workspaces architecture and subscription pass-through patterns are relevant peer data.

Sources: [builder.io/blog/opencode-vs-claude-code](https://www.builder.io/blog/opencode-vs-claude-code), [datacamp.com/blog/opencode-vs-claude-code](https://www.datacamp.com/blog/opencode-vs-claude-code), [thomas-wiegold.com blog](https://thomas-wiegold.com/blog/i-switched-from-claude-code-to-opencode/) — 2026.

### 4.2 Piebald companion tools (not IDEs)

The Piebald-AI GitHub org maintains several open-source tools around Claude Code that are worth noting as ecosystem data:

- **tweakcc** — CLI that customizes Claude Code's system prompts, themes, toolsets, thinking verbs, and spinners. Not an IDE; a Claude Code enhancer. v4.0.0 introduced an API (`npm i tweakcc`) and remote-URL config patching. [github.com/Piebald-AI/tweakcc](https://github.com/Piebald-AI/tweakcc).
- **clotilde** — Wrapper adding manual session naming, resuming, forking, and incognito (ephemeral) sessions to Claude Code CLI. Not documented on the Piebald main site; GitHub only.
- **ccstatusline** — Customizable status line formatter showing model, git branch, token usage in the terminal.
- **splitrail** — Cross-provider token usage and cost monitor (Claude Code, Gemini CLI, Codex CLI, Cline, Roo Code, Kilo Code, Copilot, OpenCode, Pi Agent, Piebald, Qwen Code).
- **claude-code-system-prompts** — Public archive of Claude Code's system prompts, updated within minutes of each Claude Code release. Changelog across 171 versions since v2.0.14. [github.com/Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts).
- **gemini-cli-desktop** — Desktop/web UI for Gemini CLI and Qwen Code, built in Rust + React. Features: visual tool confirmation, real-time thought processes, code diff viewing, chat history search, file tree browser, file @-mentions.

These tools are not in scope for deep coverage but establish that Piebald is building a Claude Code ecosystem layer, not just a standalone IDE.

Source: [github.com/Piebald-AI](https://github.com/Piebald-AI) — 2026-05-07.

---

## 5. Searched but not found

The following queries were run; no matching tools in the CLI-subscription-wrapping category were identified beyond those covered above.

| Query | Result |
|---|---|
| "Codex CLI IDE wrapper subscription" desktop app | Codex CLI is a terminal tool only; no GUI wrapper found that passes through Codex CLI subscriptions |
| "Aider with Claude Max subscription" IDE | Aider requires API keys; no subscription pass-through; no GUI IDE wrapper found |
| "headless Claude Code IDE" 2026 | No distinct product found; this describes how Piebald and Goose use Claude Code as a backend |
| "subscription LLM IDE" (beyond Claude/ChatGPT/Google) | No additional qualifying tools found beyond those already covered |
| Piebald as "IDE" vs. "tooling org" | Confirmed Piebald.ai is a standalone IDE product; Piebald-AI GitHub org also maintains open-source Claude Code tooling |

**Note on Aider:** Aider is a well-known CLI coding assistant but requires API keys (no subscription pass-through) and has no GUI IDE layer. It is covered in the API-based survey (doc 01), not here.

**Note on Cline / Roo Code / Kilo Code:** These are VS Code extension-based tools that use API keys. After the Jan 2026 lockout they no longer support Claude subscription pass-through. They belong in the API-based survey, not this category.

---

## Cross-cutting observations

These patterns appear across multiple tools in this category and are likely relevant to the gap analysis:

**1. Context file convergence** — CLAUDE.md (Anthropic), AGENTS.md (OpenAI Codex, multi-tool), .goosehints (Goose) all solve the same problem: injecting project context into the agent at session start. CLAUDE.md has the richest feature set (scope hierarchy, lazy subdirectory loading, path-scoped rules, @-imports, HTML comment stripping). .goosehints is the simplest (always-loaded, no hierarchy).

**2. Subscription pass-through is fragile** — Anthropic's Jan 2026 lockout demonstrated that any tool relying on subscription OAuth can have that capability revoked. Goose's ACP approach (routing through the official CLI binary) is the most architecturally durable workaround. Piebald's status post-lockout is unclear from public docs.

**3. Session branching is rare** — only Piebald offers explicit conversation branching/forking. Claude Code and Goose treat sessions as linear. This is a meaningful UX gap for users who want to explore multiple approaches from a common starting point.

**4. Approval granularity varies widely** — from Claude Code's per-specifier allow/ask/deny rules (fine-grained, enterprise-enforceable) to Goose's tool permission controls (documented but not detailed) to Piebald's plan-mode + pause-loop approach. No tool offers all three axes simultaneously: granularity, persistence across reboots, and pause-without-cancel.

**5. The adversary reviewer pattern** — Goose's built-in watcher for unsafe actions has no equivalent in the other tools. As agentic loops become longer and more autonomous, this pattern is likely to spread.

**6. Inference transparency** — Piebald's HTTP traffic inspector is the only tool in this category that exposes raw inference traffic (SSE chunks, headers, durations) to the user. This is a distinctive choice targeted at developers who want full observability into what the model is actually being sent.
