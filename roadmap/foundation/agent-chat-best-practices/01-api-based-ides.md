# Agent-Chat UX Patterns — API-Based IDEs and Coding Assistants

**Purpose:** Raw, sourced observations of agent-chat UX across 11 tools. Feeds a gap analysis for Ouroboros. No recommendations, no comparisons, no speculation about Ouroboros.

**Scope:** UX surface only — input model, context surfacing, tool dispatch, diff/approval, threading, streaming. Not performance, model quality, or accuracy.

**Last compiled:** 2026-05-07

---

## Table of Contents

**Deep coverage (~200–400 lines each)**
1. [Cursor (Anysphere)](#1-cursor-anysphere)
2. [Windsurf (Codeium)](#2-windsurf-codeium)
3. [VS Code Copilot Chat with Agent Mode (Microsoft)](#3-vs-code-copilot-chat-with-agent-mode-microsoft)
4. [Kiro (AWS, 2025)](#4-kiro-aws-2025)
5. [Cline (open-source VS Code extension)](#5-cline-open-source-vs-code-extension)
6. [Continue.dev (open-source)](#6-continuedev-open-source)
7. [Zed AI (Zed editor agent panel)](#7-zed-ai-zed-editor-agent-panel)
8. [Aider (terminal, chat-centric)](#8-aider-terminal-chat-centric)

**Lighter coverage (~80–150 lines each)**
9. [v0 (Vercel)](#9-v0-vercel)
10. [Bolt.new (StackBlitz)](#10-boltnew-stackblitz)
11. [Replit Agent](#11-replit-agent)

---

## 1. Cursor (Anysphere)

**URL:** https://cursor.com
**Last verified:** 2026-05-07
**Pricing model:** Freemium subscription (Hobby free tier; Pro $20/mo; Business $40/user/mo; Enterprise custom). SDK available in public beta on token-based consumption pricing.
**License / openness:** Closed source (fork of VS Code)

### Chat surface model

Two primary chat surfaces:

- **Chat / Agent panel** — opened with `Cmd/Ctrl+L`; lives as a right-side panel. Described as the primary multi-turn, multi-file interaction surface. Can also be detached as a floating window.
- **Inline Edit (Cmd/Ctrl+K)** — in-place, single-block edit. Does not receive User Rules (see Context surfacing below).

As of v3.0 (early 2026), a third surface was added: **Background Agents** and **Cloud Agents** that execute autonomously without requiring the editor to be in the foreground.

Sources: cursor.com/docs (2026-05-07); blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/ (2026-05-07)

### Composer

- **Text input model:** Rich text area within the Chat panel. Supports drag-and-drop of files/folders from the file explorer into the chat input.
- **Mentions / @:** The `@` symbol opens a context picker. Documented mentionable entities:
  - `@file` — pins a specific file
  - `@folder` — pins an entire folder
  - `@codebase` — semantic search across the full project
  - `@docs` — pulls indexed external documentation (framework/library docs can be added to the index)
  - `@web` — live web search for real-time context
  - `@notepad/<name>` — on-demand reusable prompt documents (stored in the Cursor sidebar Notepads feature; unlike `.cursorrules`, only included when explicitly mentioned)
  - File and folder drag-and-drop also accepted

- **Slash commands:** Available via `/` in the chat input. Documented commands include:
  - `/summarize` — condenses long chat histories (introduced v1.6)
  - `/models` — list available models and switch
  - `/rules` — create/edit rules from CLI
  - `/mcp enable` / `/mcp disable` — manage MCP servers
  - `/commands` — create/edit saved commands
  - Custom slash commands — user-authored, saved as `.cursor/commands/*.md` files; introduced v1.6. Reusable prompts invoked via `/` in chat.
  - **Agent Skills** (nightly channel, early 2026 preview) — dynamic procedural "how-to" instructions stored in `SKILL.md` files; invoked via slash command on demand rather than loaded into every interaction.

- **Attachments:** Images accepted (`.png`, `.jpg`, `.gif`, `.webp`, `.svg`) in addition to file references. Drag-and-drop supported.

- **Context preview:** A **Plan Mode** workflow lets users select "plan" instead of "agent" in the chat window. Cursor then crawls the project, generates an editable Markdown plan with file paths and a to-do list that the user can review and refine before execution. This serves as a pre-execution context preview. As of v1.6 (changelog), a `/summarize` command addresses context-limit situations.

Sources: tech-insider.org/cursor-tutorial-ai-code-editor-2026/ (2026-05-07); cursor.com/changelog (2026-05-07); cursor.com/docs/context/rules (2026-05-07)

### Context surfacing

- **System prompt visibility:** Rules contents are included "at the start of the model context" but there is no documented UI surface that shows users the raw assembled system prompt. The **Chat Debug view** is not documented for Cursor (that is a VS Code Copilot feature). Rules define what goes into the model context, but the user cannot inspect the final assembled prompt through a UI panel per current docs.

- **Rules / persona / project context:**
  - **Project Rules** — stored in `.cursor/rules/` as Markdown files. Version-controlled, scoped to the codebase. Use YAML frontmatter to control application:
    - `alwaysApply: true` — included in every session
    - "Apply Intelligently" — agent determines relevance from description
    - Glob-pattern match — auto-attached when matching files are open
    - Manual — only via `@`-mention in chat
  - **User Rules** — global across all projects; defined in Cursor settings. Applied only to Agent (Chat), not to Inline Edit.
  - **Team Rules** — organization-wide; managed via the Cursor dashboard (Team and Enterprise plans). Admins can enforce rules.
  - **AGENTS.md** — simpler alternative: plain Markdown at project root or subdirectory, no frontmatter required.
  - "When applied, rule contents are included at the start of the model context." (cursor.com/docs/context/rules, 2026-05-07)

- **Memories:** Not documented as a named feature (unlike Windsurf). Notepads serve a similar "persistent reusable context" role but are explicit pull (user must `@`-mention), not auto-persisted memories.

- **Skills / sub-agents:**
  - **Background Agents** (v3.0, early 2026) — run autonomously without the editor in foreground.
  - **Agent Skills** (nightly, early 2026 preview) — `SKILL.md` files with dynamic procedural instructions; invoked via slash command. Not yet in stable builds.
  - Linear integration (v1.5) — launch agents from Linear issue tickets.
  - **Hooks (beta, v1.7)** — custom scripts that observe and control agent behavior at runtime.

- **Files — how open files / pinned files are included:** Explicit via `@file`, `@folder`, drag-and-drop, or glob-matched rules. `@codebase` performs semantic search. No documented "always include open tabs" behavior (contrast with Windsurf's auto-include of open files).

Sources: cursor.com/docs/context/rules (2026-05-07); tech-insider.org/cursor-tutorial-ai-code-editor-2026/ (2026-05-07)

### Tool / agent dispatch UX

- **Triggering agent mode:** Select "agent" (vs. "plan" or "ask") in the chat panel's mode picker. Keyboard: `Cmd+I` opens the agent sidepane per docs. Agent processes tasks sequentially; users can queue follow-up messages while work is in progress — "Agent processes them sequentially after finishing." (cursor.com/docs/agent, 2026-05-07)

- **In-progress rendering:** The agent can execute terminal commands and monitor output, apply file edits automatically, and read images. Tool calls are not described as individually surfaced UI cards per current docs (contrast with Cline's per-action approval cards). "There is no limit on the number of tool calls Agent can make during a task." (cursor.com/docs/agent, 2026-05-07)

- **Pause / approve / reject mid-flow:** Not explicitly documented for the standard agent mode. Checkpoints provide post-hoc rollback (see below). The Plan Mode variant provides a pre-execution approval gate.

- **Multi-step plans:** Plan Mode generates an editable Markdown plan with file paths, code references, and a to-do list. The user refines the plan, saves it, and then executes. This is the documented "plan-then-execute" pattern.

- **Background/Cloud Agents (v3.0):** Execute multi-step tasks across an entire codebase without requiring the user to be at the keyboard. UX details for these agents are not fully documented in public docs as of 2026-05-07.

Sources: cursor.com/docs/agent (2026-05-07); tech-insider.org/cursor-tutorial-ai-code-editor-2026/ (2026-05-07)

### File / diff integration

- **File tree behavior:** Not explicitly documented. Changes are tracked via checkpoints (see below) rather than file tree decorations per current docs.

- **Diff view:** "Suggest edits to files and apply them automatically." (cursor.com/docs/agent, 2026-05-07). Diff presentation is implied (users can preview and restore from checkpoints) but the specific diff UI (inline vs. side-by-side) is not described in detail in current public docs.

- **Accept / reject UX:** Checkpoint-based rollback is the documented mechanism. Per-hunk or per-file granular accept/reject is not described in current public docs.

- **Checkpoints / undo:** "Agent automatically creates them before making significant changes, capturing the state of all modified files." Users can "preview and restore from any checkpoint to revert changes." (cursor.com/docs/agent, 2026-05-07). Checkpoints are automatic, not user-triggered.

Sources: cursor.com/docs/agent (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** As of v3.0, Background Agents and Cloud Agents allow parallel tasks. The standard chat panel appears to support one active conversation at a time, with message queuing for sequential follow-ups, but explicit multi-tab chat threading is not documented.

- **Branching from prior message:** Not documented.

- **Search / history:** Not documented in current public docs.

Sources: blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/ (2026-05-07)

### Streaming / progress UX

- **Streaming text:** Not described in detail in public docs.

- **Thinking / reasoning blocks:** Not documented as a surfaced UI element.

- **Token usage / cost:** Not documented as a visible UI element in the chat panel (contrast with Aider's `/tokens` command and Cline's cost tracker).

- **Latency UX:** A "Context usage breakdown visualization" was added in the May 6, 2026 changelog entry, suggesting some context/token visualization exists. Details not expanded in docs.

Sources: cursor.com/changelog (2026-05-07)

### Approval / safety

- **Per-tool approval:** Not documented for standard mode. Background/Cloud Agents may have separate approval mechanisms not yet in public docs.

- **Approval modes:** Not named/tiered in public docs. Plan Mode functions as a pre-execution approval gate. Checkpoints provide post-hoc rollback.

- **Sandboxing / read-only mode:** Not documented in current public docs.

Sources: cursor.com/docs/agent (2026-05-07)

### Distinctive choices

1. **Notepads as on-demand context documents** — unlike `.cursorrules` (always-on), Notepads are only included when explicitly `@`-mentioned. This gives users fine-grained control over when reusable prompt templates enter context, preventing context pollution from always-on rules.

2. **Checkpoint system as the primary safety mechanism** — rather than per-action approval dialogs (Cline's model) or per-hunk accept/reject (VS Code Copilot's model), Cursor auto-creates checkpoints before significant changes and exposes a restore UI. This is a "trust-then-rollback" pattern rather than "approve-before-execute."

3. **Agent Skills (nightly, 2026) — dynamic procedural slash commands** — instead of static rules always loaded into context, Skills encode "how-to" workflows invoked on demand. The agent discovers and applies Skills when the slash command is triggered. This separates declarative context (rules) from procedural instructions (skills), which is a distinct architectural choice from rivals.

### Sources

- https://cursor.com/docs (2026-05-07) — top-level docs structure
- https://cursor.com/docs/agent (2026-05-07) — agent mode: tool calls, checkpoints, terminal, file edits
- https://cursor.com/docs/context/rules (2026-05-07) — rules types, scoping, AGENTS.md, frontmatter
- https://cursor.com/changelog (2026-05-07) — v1.5–v3.0 feature history, Plan Mode, Background Agents
- https://tech-insider.org/cursor-tutorial-ai-code-editor-2026/ (2026-05-07) — @ mentions, slash commands, Notepads, Plan Mode
- https://blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/ (2026-05-07) — v3.0 Background/Cloud Agents

---

## 2. Windsurf (Codeium)

**URL:** https://windsurf.com
**Last verified:** 2026-05-07
**Pricing model:** Freemium (Free tier; Pro $15/mo; Teams $35/user/mo; Enterprise custom)
**License / openness:** Closed source

### Chat surface model

- **Cascade panel** — the primary chat and agent surface. Opened with `Cmd/Ctrl+L` or by clicking the Cascade icon in the top-right of the Windsurf window. Lives as a right-side panel. "A new panel called 'Cascade' on the right side of the IDE." (docs.windsurf.com/windsurf/getting-started, 2026-05-07)

- Two operating modes within Cascade:
  - **Chat mode** — optimized for questions about the codebase; can "accept and insert" proposed code modifications.
  - **Code (Write) mode** — agentic; creates and makes modifications to the codebase autonomously.

Sources: docs.windsurf.com/windsurf/getting-started (2026-05-07); docs.windsurf.com/windsurf/cascade (2026-05-07)

### Composer

- **Text input model:** Plain text input below the Cascade conversation. "Select your desired model from the selection menu below the Cascade conversation input box." (docs.windsurf.com/windsurf/cascade, 2026-05-07)

- **Mentions / @:** The `@` symbol is the primary context injection mechanism. Documented entities:
  - `@codebase` — semantic search across the full project; described as "the most underused" provider; preferred when unsure which files are relevant.
  - `@docs` — indexed external documentation (frameworks/libraries)
  - `@file` — specific file reference
  - `@folder` — folder-level reference
  - Previous conversations — can be `@`-referenced; "Cascade will retrieve the most relevant and useful information like the conversation summaries and checkpoints."
  - A **Problems Tab** button sends file problems to Cascade as an `@`-mention.
  - "Any selected text in the editor or terminal will automatically be included" when Cascade opens (auto-context from selection).

- **Slash commands:** Not documented as a named feature (contrast with Cursor, Aider). Not mentioned in public docs as of 2026-05-07.

- **Attachments:** Not documented separately from `@`-mention file references.

- **Context preview:** Not documented as a named "what will the model see" surface. The context assembly pipeline is described conceptually in third-party guides (see Sources), but there is no documented UI panel exposing the assembled prompt.

Sources: docs.windsurf.com/windsurf/cascade (2026-05-07); iceberglakehouse.com/posts/2026-03-context-windsurf/ (2026-05-07); markaicode.com/windsurf-flow-context-engine/ (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented. Global and workspace rules are loaded into context but there is no documented UI surface showing the assembled system prompt.

- **Rules / persona / project context:**
  - **Global rules** — apply to all workspaces. Configured in Windsurf Quick Settings (`Windsurf Settings` on the status bar).
  - **Workspace rules** — apply only to the current workspace/project. Can use glob patterns (e.g., Java best practices for `*.java`).
  - **`.windsurfrules` file** — Markdown file at project root. Loaded first in the context assembly pipeline.
  - Context assembly order (per third-party documentation, not official docs): Load global `.windsurfrules` → load workspace rules → load relevant Memories → read open files (active file weighted highest) → run codebase retrieval → read recent actions (file edits, terminal commands, navigation history from current session) → assemble final prompt.
  - "All Rules files and project documentation should be Markdown — it is the native format for Windsurf's context system." (iceberglakehouse.com/posts/2026-03-context-windsurf/, 2026-05-07)

- **Memories:**
  - Cascade autonomously generates memories to retain context between conversations. "Cascade will autonomously generate memories to remember important context between conversations." (docs.windsurf.com/plugins/cascade/memories, 2026-05-07)
  - Users can prompt Cascade to create a memory at any time.
  - Memories are visible in the **Memories Panel** (accessible when Cascade makes a memory, or via command palette).
  - Scoped to workspace — preferences for one project don't bleed into another.
  - Important limitation: "Memories can become outdated if your project evolves, so you must review and update them regularly." (docs.windsurf.com/plugins/cascade/memories, 2026-05-07)
  - "Memories are for evolving knowledge; Rules are for stable conventions." (docs.windsurf.com/plugins/cascade/memories, 2026-05-07)

- **Skills / sub-agents:** MCP servers extend the agent's capabilities (documented at docs.windsurf.com). **Workflows** are documented as a feature allowing users to "automate repetitive trajectories" but workflow UX details are not expanded in public docs as of 2026-05-07.

- **Files — open files / pinned files:** "Any selected text in the editor or terminal will automatically be included" when Cascade opens. Active file gets highest weight in the context assembly pipeline. Other open tabs are included. This is an auto-include-on-open model (contrast with Cursor's explicit-only model).

Sources: docs.windsurf.com/windsurf/getting-started (2026-05-07); docs.windsurf.com/plugins/cascade/memories (2026-05-07); iceberglakehouse.com/posts/2026-03-context-windsurf/ (2026-05-07); markaicode.com/windsurf-flow-context-engine/ (2026-05-07); windsurf.com/university/general-education/intro-rules-memories (2026-05-07)

### Tool / agent dispatch UX

- **Triggering agent mode:** Switch Cascade to "Code mode" (Write mode). Code mode is described as allowing Cascade to "create and make modifications to your codebase." Chat mode does not autonomously edit files.

- **In-progress rendering:** "Cascade has a variety of tools at its disposal, such as Search, Analyze, Web Search, MCP, and the terminal." Tool call count is limited: "Cascade can make up to 20 tool calls per prompt." A **Continue** button is available when the limit is reached. (docs.windsurf.com/windsurf/cascade, 2026-05-07)

- **Pause / approve / reject mid-flow:** In Chat mode, users "can accept and insert" proposed code. In Code mode (Write), the autonomous editing model is described but explicit per-action approval UI is not documented in public docs as of 2026-05-07.

- **Multi-step plans:** Not documented as a named "plan mode" (contrast with Cursor and Kiro). Cascade autonomously determines steps in Code mode.

Sources: docs.windsurf.com/windsurf/cascade (2026-05-07)

### File / diff integration

- **File tree behavior:** Not documented.

- **Diff view:** Not documented in detail in current public docs.

- **Accept / reject UX:** In Chat mode: accept and insert code proposals. In Code mode: not described with granular per-hunk or per-file controls in public docs.

- **Checkpoints / undo:** Referenced conversations can include "conversation summaries and checkpoints" but checkpoints as a file-state rollback mechanism are not described in detail in public docs (contrast with Cursor's file-state checkpoints).

Sources: docs.windsurf.com/windsurf/cascade (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** Not documented.

- **Branching:** Previous conversations can be `@`-referenced in new sessions to retrieve summaries and checkpoints.

- **Search / history:** Not documented.

Sources: docs.windsurf.com/windsurf/cascade (2026-05-07)

### Streaming / progress UX

- **Streaming text:** Not described in detail in public docs.

- **Thinking / reasoning blocks:** Not documented as a surfaced UI element.

- **Token usage / cost:** Not documented as a visible UI element.

- **Latency UX:** Not documented.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Approval / safety

- **Per-tool approval:** Not documented. The 20-tool-call cap per prompt is the only documented constraint.

- **Approval modes:** Not named/tiered in public docs.

- **Sandboxing / read-only mode:** Not documented.

Sources: docs.windsurf.com/windsurf/cascade (2026-05-07)

### Distinctive choices

1. **Autonomous memory generation** — Cascade proactively creates and stores memories from corrections and preferences without user action. Other tools (Cursor, Continue) require explicit user authoring of persistent context. Windsurf's model is closer to a persistent learning loop.

2. **Context assembly pipeline is runtime-dynamic** — Windsurf reads recent IDE actions (file edits, terminal commands, navigation history) from the current session and weights them into context. This "flow awareness" (tracking how the user works, not just what files are open) is presented as a differentiator from static context models.

3. **20-tool-call cap per prompt with a Continue button** — an explicit ceiling on agent autonomy per turn, with a user-visible continuation affordance. This is a distinct pacing/safety mechanism not documented in other tools.

### Sources

- https://docs.windsurf.com/windsurf/getting-started (2026-05-07) — Cascade panel location, modes
- https://docs.windsurf.com/windsurf/cascade (2026-05-07) — Cascade features, tool cap, @ mentions, modes
- https://docs.windsurf.com/plugins/cascade/memories (2026-05-07) — Memories: auto-generation, Memories Panel, scoping
- https://windsurf.com/university/general-education/intro-rules-memories (2026-05-07) — Rules vs. Memories distinction
- https://iceberglakehouse.com/posts/2026-03-context-windsurf/ (2026-05-07) — context assembly pipeline (third-party guide)
- https://markaicode.com/windsurf-flow-context-engine/ (2026-05-07) — Flow context engine, session action tracking

---

## 3. VS Code Copilot Chat with Agent Mode (Microsoft)

**URL:** https://code.visualstudio.com/docs/copilot
**Last verified:** 2026-05-07
**Pricing model:** GitHub Copilot subscription (Free tier with limits; Pro $10/mo; Business $19/user/mo; Enterprise $39/user/mo)
**License / openness:** Closed (Copilot service); VS Code editor is open source (MIT)

### Chat surface model

Three distinct chat surfaces:

1. **Chat view** (`⌃⌘I` / `Ctrl+Alt+I`) — Multi-turn conversations, agentic workflows, multi-file edits. Primary panel. Also available as an editor tab or separate window.
2. **Inline Chat** (`⌘I` / `Ctrl+I`) — In-place code edits and terminal command suggestions. Ephemeral, tied to cursor position.
3. **Quick Chat** (`⇧⌥⌘L`) — Lightweight chat panel at the top of the editor for quick questions without leaving the current view.

Sources: code.visualstudio.com/docs/copilot/chat/copilot-chat (2026-05-07)

### Composer

- **Text input model:** Standard text area within each chat surface. The Chat view supports multi-turn history; Quick Chat is single-turn-oriented.

- **Mentions / @:** Two distinct mention systems:
  - `@` invokes **chat participants** — specialized agents:
    - `@vscode` — VS Code commands and settings
    - `@terminal` — terminal integration
    - `@workspace` — workspace-scoped operations (similar to `@codebase`)
  - `#` invokes **context references** — explicit file/resource attachment:
    - `#file` — specific file
    - `#folder` — folder
    - `#codebase` — full codebase semantic search
    - `#terminalSelection` — terminal output
    - `#fetch` — web URL fetch tool
    - Symbols, Git diff, and others also supported

- **Slash commands:** `/` commands are documented as available ("use `/` commands for common tasks") but specific commands are not enumerated in the main docs page fetched. The `/plan` agent is accessible via the agent picker.

- **Attachments:** Images supported (vision capability for enhanced prompts). Files referenced via `#file`. Drag-and-drop not explicitly documented.

- **Context preview:** The **Chat Debug view** shows "the raw system prompt, user prompt, context, and tool payloads for each interaction." This is the only tool in the survey with a documented UI surface exposing the raw assembled prompt, context, and tool payloads.

Sources: code.visualstudio.com/docs/copilot/chat/copilot-chat (2026-05-07); code.visualstudio.com/docs/copilot/agents/overview (2026-05-07)

### Context surfacing

- **System prompt visibility:** The Chat Debug view provides full visibility: "raw system prompt, user prompt, context, and tool payloads for each interaction." (code.visualstudio.com/docs/copilot/chat/copilot-chat, 2026-05-07)

- **Rules / persona / project context:**
  - `.github/copilot-instructions.md` — project-level instructions (equivalent to `.cursorrules`). Not explicitly named in the fetched docs but referenced in VS Code Copilot settings documentation.
  - Custom instructions can be configured in settings (`github.copilot.chat.codeGeneration.instructions`, etc.).
  - File-level and workspace-level scoping is configurable.

- **Memories:** Not documented as an automatic persistence feature. Instructions files serve a similar role but are user-authored.

- **Skills / sub-agents:**
  - **Agents** — selected from the agent picker in the Chat view. Options include built-in agents (`Agent`, `Plan`) and custom MCP-backed agents.
  - Permission levels control agent autonomy:
    - **Default Approvals** — prompts for confirmation
    - **Bypass Approvals** — auto-approves all tool calls
    - **Autopilot** — (workspace isolation only) maximum autonomy
  - Three execution environments: local (interactive, workspace access), background, cloud.

- **Files:** Open files can be referenced via `#file`. The agent "decides autonomously if additional context is needed" in agent mode — it may read additional files without explicit user direction.

Sources: code.visualstudio.com/docs/copilot/chat/copilot-chat (2026-05-07); code.visualstudio.com/docs/copilot/agents/overview (2026-05-07); code.visualstudio.com/docs/copilot/chat/review-code-edits (2026-05-07)

### Tool / agent dispatch UX

- **Triggering agent mode:** Select "Agent" from the agent picker in the Chat view. Agents operate in a loop: analyze codebase → read files → propose edits → run terminal commands → monitor output → self-correct.

- **In-progress rendering:** "Every tool invocation is transparently displayed in the UI." Terminal tool calls require approval before execution. The system is described as: "To easily intervene and undo, every tool invocation is transparently displayed in the UI, terminal tools require approval, and rich undo capabilities are supported." (code.visualstudio.com/docs/copilot/chat/review-code-edits, 2026-05-07)

- **Pause / approve / reject mid-flow:**
  - Terminal tool calls: require explicit user confirmation before running. The **Allow** dropdown offers options: allow for this session, allow for this solution, allow always.
  - File edits: prompted to approve before application to sensitive files. `chat.tools.edits.autoApprove` setting uses glob patterns to configure which files require approval.
  - "Use the **Undo Last Edit** control in the view title bar to revert to the state before the last edit was applied." (code.visualstudio.com/docs/copilot/chat/review-code-edits, 2026-05-07)

- **Multi-step plans:** The **Plan** agent generates multi-step plans. Agents "decide autonomously if additional context is needed." Plan agent available from the agent picker.

Sources: code.visualstudio.com/docs/copilot/agents/overview (2026-05-07); code.visualstudio.com/docs/copilot/chat/review-code-edits (2026-05-07); gist.github.com/ichim-david/8c2ad537068137a658d938b229d3adef (2026-05-07)

### File / diff integration

- **File tree behavior:** Not documented.

- **Diff view:** Inline diffs shown in the editor after agent applies changes. "Open a changed file to see inline diffs of the applied changes." Per-change navigation with editor overlay controls.

- **Accept / reject UX:** Three granularities:
  - **Per-hunk** — "Hover over an inline change to accept or reject that specific change without affecting other edits in the file."
  - **Per-file** — review individual file diffs and apply selectively.
  - **All files** — "Accept or reject all changes across all files at once from the Chat view" via the *Total Changes* control.
  - "When you keep or undo an edit in a file, the editor automatically navigates to the next edit with pending changes, which might be in a different file." Setting `chat.editing.revealNextChangeOnResolve: false` disables auto-navigation.
  - `chat.editing.autoAccept` — auto-accepts AI-generated edits after a configurable delay.

- **Checkpoints / undo:** "VS Code can automatically create snapshots of your files at key points during chat interactions, enabling you to roll back to a previous state." Undo Last Edit control in view title bar.

Sources: code.visualstudio.com/docs/copilot/chat/review-code-edits (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** The Chat view can be opened as an editor tab or separate window, implying multiple views could coexist. Explicit multi-session tabs or concurrency are not documented.

- **Branching:** Not documented.

- **Search / history:** Multi-turn history within a session. History search not documented.

Sources: code.visualstudio.com/docs/copilot/chat/copilot-chat (2026-05-07)

### Streaming / progress UX

- **Streaming text:** Not described in detail in public docs.

- **Thinking / reasoning blocks:** Not documented as a surfaced UI element.

- **Token usage / cost:** Not documented as a visible UI element in the chat panel.

- **Latency UX:** Not documented.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Approval / safety

- **Per-tool approval:** Terminal commands require explicit confirmation before running. File edits to sensitive paths require approval (configurable via glob patterns).

- **Approval modes:**
  - **Default Approvals** — prompts for each terminal tool call; file edits to matched paths require approval
  - **Bypass Approvals** — all tool calls auto-approved (Worktree isolation automatically sets this)
  - **Autopilot** — maximum autonomy (Workspace isolation only)
  - `chat.tools.terminal.autoApprove` — allow/deny terminal commands by regex pattern
  - `chat.tools.edits.autoApprove` — glob-based file approval rules. Example: `"**/*": true, "**/.vscode/*.json": false, "**/.env": false`

- **Sandboxing / read-only mode:**
  - **Worktree isolation** — agent runs in an isolated Git worktree; automatically sets Bypass Approvals.
  - **Workspace isolation** — all three permission levels available; selectable from a permissions picker in the chat input area.

Sources: code.visualstudio.com/docs/copilot/chat/review-code-edits (2026-05-07); gist.github.com/ichim-david/8c2ad537068137a658d938b229d3adef (2026-05-07); code.visualstudio.com/docs/copilot/agents/overview (2026-05-07)

### Distinctive choices

1. **Chat Debug view** — the only tool in this survey with a documented UI surface exposing the raw system prompt, user prompt, context, and tool payloads per interaction. This is a power-user transparency surface with no documented equivalent in Cursor, Windsurf, or Kiro.

2. **Three-level approval granularity on file edits** — per-hunk hover accept/reject, per-file selective apply, and all-files bulk apply in a single coherent review flow. The auto-navigate-to-next-change behavior ("automatically navigates to the next edit with pending changes in a different file") is a distinct UX pattern for multi-file review.

3. **Glob-based file protection via `chat.tools.edits.autoApprove`** — declarative, config-file-driven rules for which file paths require approval vs. auto-apply. No other tool in this survey documents an equivalent configuration surface.

### Sources

- https://code.visualstudio.com/docs/copilot/chat/copilot-chat (2026-05-07) — chat surfaces, @ mentions, # mentions, debug view
- https://code.visualstudio.com/docs/copilot/agents/overview (2026-05-07) — agent types, permission levels, execution environments
- https://code.visualstudio.com/docs/copilot/chat/review-code-edits (2026-05-07) — diff view, per-hunk/per-file/all-files accept/reject, checkpoints, auto-approve settings
- https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode (2026-05-07) — agent mode trigger, file edits, undo, Plan agent
- https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode (2025-02-24) — agent mode announcement
- https://gist.github.com/ichim-david/8c2ad537068137a658d938b229d3adef (2026-05-07) — YOLO mode / auto-approve terminal settings

---

## 4. Kiro (AWS, 2025)

**URL:** https://kiro.dev
**Last verified:** 2026-05-07
**Pricing model:** Not publicly documented on the site at time of verification (AWS product; likely AWS account billing). Listed as available with a "try Kiro" CTA.
**License / openness:** Closed source (AWS product)

### Chat surface model

- **Kiro pane** — the primary AI interaction surface. Location in the IDE window not explicitly described in docs, but it appears as a dedicated sidebar pane.
- Two distinct modes of AI work:
  - **Agentic Chat (Vibe mode)** — natural language chat for quick exploratory coding and prototyping
  - **Specs** — structured artifact-driven development for complex features requiring planning
- **Hooks** — automation layer that fires predefined agent prompts on IDE events

Sources: kiro.dev/docs/ (2026-05-07); kiro.dev/docs/specs/ (2026-05-07)

### Composer

- **Text input model:** Not documented in detail for the chat surface.

- **Mentions / @:** Not documented in public docs as of 2026-05-07.

- **Slash commands:** Not documented in public docs as of 2026-05-07.

- **Attachments:** Not documented.

- **Context preview:** Not documented.

Sources: kiro.dev/docs/ (2026-05-07) — these axes are not covered in current public docs.

### Context surfacing

- **System prompt visibility:** Not documented.

- **Rules / persona / project context (Steering):**
  - Kiro uses **Steering** as its named mechanism for persistent project knowledge. "Steering provides persistent knowledge about your workspace through markdown files." (kiro.dev/docs/steering/, 2026-05-07)
  - Rules are written in standard Markdown using natural language. Live workspace files can be referenced with `#[[file:<relative_file_name>]]` syntax to keep guidance current.
  - Three scope tiers:
    - **Workspace** — `.kiro/steering/` — applies only to the current project
    - **Global** — `~/.kiro/steering/` — applies across all workspaces
    - **Team** — global steering files pushed to user machines via MDM/Group Policy
  - Workspace takes precedence: "In case of conflicting instructions between global and workspace steering, Kiro will prioritize the workspace steering instructions." (kiro.dev/docs/steering/, 2026-05-07)
  - Loading mechanisms via YAML frontmatter:
    - **Always** — loaded into every Kiro interaction automatically
    - **Conditional** — loaded only when working with files matching a glob pattern
    - **Manual** — available on-demand via `#steering-file-name` reference
    - **Auto** — automatically included when the request matches the description
  - Three **foundational files** auto-generated and always included: `product.md` (product overview), `tech.md` (technology stack), `structure.md` (project structure).

- **Memories:** Not documented as a separate feature (distinct from Steering). Steering serves the persistent-knowledge role.

- **Skills / sub-agents — Hooks:**
  - "Agent hooks are automated triggers that execute predefined agent prompts or shell commands when specific events occur in your IDE." (kiro.dev/docs/hooks/, 2026-05-07)
  - Triggering events: file save, file create, file delete, prompt submission, agent turn completion, tool invocations (before/after), spec task execution (before/after), manual on-demand.
  - Users can ask Kiro to create a hook using natural language, or configure manually.
  - Hooks enable: consistent code quality enforcement, proactive security vulnerability prevention, repetitive task automation.

- **Files:** Steering files can reference live workspace files. Beyond that, file context surfacing in agentic chat is not documented.

Sources: kiro.dev/docs/steering/ (2026-05-07); kiro.dev/docs/hooks/ (2026-05-07)

### Tool / agent dispatch UX

**Agentic Chat (Vibe mode):**
- Natural language interaction. "Build features through natural conversation with AI." (kiro.dev/docs/, 2026-05-07)
- Recommended for "quick exploratory coding" or "prototyping without clear goals."
- Tool call rendering, approve/reject UI, and streaming details are not documented in public docs as of 2026-05-07.

**Specs mode:**
- Users initiate by clicking `+` under Specs in the Kiro pane, then choosing between feature development or bug fix, and selecting a workflow variant: Requirements-First, Design-First, or Quick Plan.
- Specs generate three structured files:
  1. `requirements.md` or `bugfix.md` — user stories, acceptance criteria, or bug analysis
  2. `design.md` — technical architecture, sequence diagrams, implementation approach
  3. `tasks.md` — discrete, trackable implementation tasks
- Three-phase progression: Requirements/Bug Analysis → Design → Tasks.
- Task execution: Kiro displays "real-time status updates" as tasks execute. "Analyzes dependencies and runs independent tasks concurrently through 'waves' where independent tasks execute together while dependent tasks follow sequentially." (kiro.dev/docs/specs/, 2026-05-07)
- Use Specs for "complex features requiring structured planning" or "bugs where regressions are costly."

**Hooks:**
- Two-step: event detected → action executed. No additional user interaction documented.

Sources: kiro.dev/docs/specs/ (2026-05-07); kiro.dev/docs/hooks/ (2026-05-07); kiro.dev/docs/agentic-chat (404 as of 2026-05-07)

### File / diff integration

- Not documented in current public docs.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Multi-session / threading

- Not documented.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Streaming / progress UX

- Specs mode provides "real-time status updates" during task execution. Other streaming UX details are not documented.

Sources: kiro.dev/docs/specs/ (2026-05-07)

### Approval / safety

- Specs mode provides an explicit approval gate: each of the three phases (requirements → design → tasks) is a structured artifact the user reviews before proceeding to the next phase. This is a plan-level, not action-level, approval model.
- Per-tool or per-file approval is not documented.
- Sandboxing not documented.

Sources: kiro.dev/docs/specs/ (2026-05-07)

### Distinctive choices

1. **Specs as a first-class structured planning artifact** — rather than a chat-generated plan (Cursor's Plan Mode) or a Markdown TODO list, Kiro's Specs produce three distinct structured documents (`requirements.md`, `design.md`, `tasks.md`) stored in the project. This makes the planning artifact version-controllable and persistent, not ephemeral.

2. **Concurrent task execution via waves** — Kiro's Specs task executor analyzes dependencies and runs independent tasks concurrently ("waves") while sequencing dependent ones. This is a documented parallel execution model for agent tasks, not described in other tools' public docs.

3. **Event-driven hooks as a first-class automation primitive** — IDE-event-triggered agent prompts (file save, agent turn completion, etc.) are a named, configured feature. Other tools (Cursor) have beta-stage hooks, but Kiro ships them as a documented core feature.

### Sources

- https://kiro.dev/docs/ (2026-05-07) — overview of Kiro features, Specs vs. Vibe distinction
- https://kiro.dev/docs/specs/ (2026-05-07) — Specs structure, three files, three phases, task waves, concurrent execution
- https://kiro.dev/docs/steering/ (2026-05-07) — Steering: scopes, loading mechanisms, foundational files, live file references
- https://kiro.dev/docs/hooks/ (2026-05-07) — Hooks: triggering events, agent prompt execution, use cases

---

## 5. Cline (open-source VS Code extension)

**URL:** https://github.com/cline/cline
**Last verified:** 2026-05-07
**Pricing model:** Free (open source); bring-your-own API key. Supports OpenRouter, Anthropic, OpenAI, Google Gemini, AWS Bedrock, Azure, and local models.
**License / openness:** Open source (Apache 2.0)

### Chat surface model

- **VS Code sidebar extension panel** — "open Cline on the right side of your editor" for side-by-side workspace visibility. (github.com/cline/cline README, 2026-05-07)
- Single chat surface; no inline edit or quick chat variants documented.

Sources: github.com/cline/cline README (2026-05-07)

### Composer

- **Text input model:** Standard textarea. Image input supported: "Enter your task and add images to convert mockups into functional apps or fix bugs with screenshots."

- **Mentions / @:** Four documented `@` context shortcuts:
  - `@url` — fetch and convert a URL to Markdown for context
  - `@problems` — add workspace errors from the Problems panel
  - `@file` — add a file's contents ("so you don't have to waste API requests")
  - `@folder` — add all files in a folder at once

- **Slash commands:** Not documented as a named feature in the README.

- **Attachments:** Images accepted in the task input. Files referenced via `@file`/`@folder`.

- **Context preview:** Not documented.

Sources: github.com/cline/cline README (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented as a user-facing UI element.

- **Rules / persona / project context:** Not documented as a named feature (no `.clinerules` or equivalent mentioned in the README). MCP tools can extend capabilities.

- **Memories:** Not documented.

- **Skills / sub-agents:**
  - **MCP integration** — "Cline can extend his capabilities through custom tools" via Model Context Protocol. (github.com/cline/cline README, 2026-05-07)
  - **Browser automation** — uses Claude's Computer Use capability for browser-based testing.

- **Files:** Analyzed by "analyzing your file structure & source code ASTs, running regex searches, and reading relevant files." Files can be pinned via `@file`/`@folder`. "All changes made by Cline are recorded in your file's Timeline." (VS Code built-in Timeline feature)

Sources: github.com/cline/cline README (2026-05-07)

### Tool / agent dispatch UX

- **Triggering:** Type a task description in the input. Cline immediately begins autonomous analysis without a separate "start agent" toggle.

- **In-progress rendering:** The central design principle is human-in-the-loop approval for every action. "The extension provides a human-in-the-loop GUI to approve every file change and terminal command." (github.com/cline/cline README, 2026-05-07). Each tool call surfaces as an approval card before execution.

- **Pause / approve / reject mid-flow:** Per-action approval is the default. Users approve each file change and each terminal command individually. Users can "edit or revert Cline's changes directly in the diff view editor."

- **Multi-step plans:** No explicit plan-display-then-execute model documented. Cline analyzes the project and proceeds action by action with per-action approval.

- **Browser testing flow:** "Launch dev servers, interact with UI, capture screenshots." Cline can use a browser as a tool during the task.

- **"Proceed While Running" button:** For terminal commands, a button enables background execution while the agent continues other tasks, with notifications when new terminal output arrives.

Sources: github.com/cline/cline README (2026-05-07)

### File / diff integration

- **File tree behavior:** Not documented.

- **Diff view:** "Cline can create and edit files directly in your editor, presenting you a diff view of the changes." Linter/compiler errors are monitored after file changes. (github.com/cline/cline README, 2026-05-07)

- **Accept / reject UX:** Users approve each file change in the diff view. "Edit or revert Cline's changes directly in the diff view editor." Per-action (whole change), not per-hunk granularity documented.

- **Checkpoints / undo:**
  - "Extension takes a snapshot of your workspace at each step." Snapshot includes workspace file state.
  - Compare / Restore functionality: users can compare current state against any checkpoint and restore to it.
  - This is a step-level snapshot model (every agent step), not just "before significant changes" (Cursor's model).

Sources: github.com/cline/cline README (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** Not documented.

- **Branching:** Not documented. Checkpoints provide a restore-to-point mechanism.

- **Search / history:** Not documented.

Sources: github.com/cline/cline README (2026-05-07)

### Streaming / progress UX

- **Streaming text:** Not described in detail in the README.

- **Thinking / reasoning blocks:** Not documented as a surfaced UI element.

- **Token usage / cost:** "Keeps track of total tokens and API usage cost." (github.com/cline/cline README, 2026-05-07) — cost tracking is a documented feature visible to the user.

- **Latency UX:** Not documented.

Sources: github.com/cline/cline README (2026-05-07)

### Approval / safety

- **Per-tool approval:** Every file change and every terminal command requires individual approval. "Human-in-the-loop GUI to approve every file change and terminal command." (github.com/cline/cline README, 2026-05-07)

- **Approval modes:** Default is per-action approval. Auto-approval modes are not documented in the README (may exist in settings).

- **Sandboxing / read-only mode:** "While autonomous AI scripts traditionally run in sandboxed environments, this extension provides a human-in-the-loop GUI" — local execution without sandboxing, with human approval as the safety mechanism. Explicitly positioned as an alternative to sandboxing.

Sources: github.com/cline/cline README (2026-05-07)

### Distinctive choices

1. **Per-action approval as the default safety model** — unlike Cursor (checkpoint rollback), VS Code Copilot (configurable auto-approve), or Windsurf (undocumented), Cline makes human approval of every file change and terminal command the baseline UX, not an opt-in. This maximizes transparency at the cost of friction.

2. **Step-level workspace snapshots** — Cline snapshots the entire workspace at every agent step, not just before "significant" operations. This gives a full rewind history of the agent's progress, not just pre-change saves.

3. **Multi-model support with per-request cost display** — Cline tracks total tokens and API cost across providers, surfacing this in the UI. For bring-your-own-API-key users managing spend, this is a documented design choice that other tools (especially subscription-model IDEs) do not surface.

### Sources

- https://github.com/cline/cline/blob/main/README.md (2026-05-07) — full feature description: chat UI, @ mentions, tool rendering, approval model, diff view, checkpoints, cost tracking, browser automation

---

## 6. Continue.dev (open-source)

**URL:** https://continue.dev
**Last verified:** 2026-05-07
**Pricing model:** Free (open source); bring-your-own API key or local model. Optional Continue Hub for sharing configs.
**License / openness:** Open source (Apache 2.0)

### Chat surface model

- **VS Code sidebar panel** (primary) and **JetBrains plugin** — Continue lives as an IDE extension. The chat panel sits in the IDE sidebar.
- Two interaction modes:
  - **Chat mode** — multi-turn conversation with context references
  - **Agent mode** — chat + tool use; autonomous file editing and command execution

Sources: docs.continue.dev (2026-05-07)

### Composer

- **Text input model:** Standard text area. Context is added via `@` mentions from a dropdown.

- **Mentions / @:** Typing `@` opens a dropdown of context providers. Built-in providers (as of 2026-05-07):
  - `@File` — reference a specific file
  - `@Folder` — all files in a folder (same retrieval as `@Codebase` but folder-scoped)
  - `@Search` — codebase search results (VS Code search equivalent)
  - `@Codebase` — **deprecated** in favor of native agent mode codebase awareness; previously provided embeddings-based retrieval
  - `@Docs` — **deprecated** in favor of Context7 MCP; previously fetched documentation site content
  - `@Terminal` — last terminal command and output
  - `@Open` — contents of all open files (set `onlyPinned: true` to limit to pinned files)
  - `@Problems` — Problems panel errors from the current file
  - `@Debugger` — local variables from the debugger's call stack (VS Code only; top `n` levels, default 3)
  - `@Repo-Map` — outline of the codebase with top-level class/function signatures; inspired by Aider's repo map
  - `@Git Diff` — all changes made to the current branch
  - `@Web` — web search results (up to `n` results, default 6)
  - `@OS` — architecture and platform of current OS
  - `@Google` — Google search via Serper API (requires API key)
  - `@GitLab MR` — open MR for current branch (requires personal access token)
  - `@Jira` — Jira issue context
  - `@HTTP` — custom HTTP context provider (POST to a configured URL)
  - MCP context provider — any MCP server

- **Slash commands:**
  - Custom slash commands defined in `config.yaml`. "When `invokable` is set to `true`, a slash command becomes available in the IDE extensions and CLI." (docs.continue.dev, 2026-05-07)
  - Examples: `/doc`, `/optimize`, `/test`
  - Built-in commands not enumerated in fetched docs; the system is primarily user-defined.

- **Attachments:** Via `@` mentions (file, image not explicitly documented in fetched pages).

- **Context preview:** Not documented.

Sources: docs.continue.dev/customize/custom-providers (2026-05-07); docs.continue.dev/ide-extensions/chat/context-selection (2026-05-07); docs.continue.dev/reference (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented as a UI surface.

- **Rules / persona / project context:**
  - `config.yaml` (current) or `config.json` (legacy) — single file at user profile or workspace level defining models, commands, context providers, and routing.
  - Workspace-level config overrides user-level config.
  - "With Continue you lean on custom commands, context providers, and model routing that you define." (sureprompts.com/blog/continue-dev-prompting-guide, 2026-05-07)

- **Memories:** Not documented as automatic persistence. Config file serves the persistent-instructions role.

- **Skills / sub-agents:**
  - Agent mode tools: file exploration, read files, search for patterns, create new files, make changes to existing files, run commands from workspace root.
  - MCP servers — "add custom tools to your agent using MCP Servers." (docs.continue.dev, 2026-05-07)
  - `capabilities: [tool_use]` in config enables agent mode for a model.

- **Files:** `@Open` includes all open files (or pinned-only). `@File` for individual files. Agent mode autonomously reads additional files as needed.

Sources: docs.continue.dev/customize/context-providers (2026-05-07 search result); docs.continue.dev/ide-extensions/agent/how-it-works (2026-05-07)

### Tool / agent dispatch UX

- **Triggering:** Agent mode is the same Chat panel with `capabilities: [tool_use]` enabled for the selected model. No separate "agent mode" toggle documented; it's a model capability configuration.

- **In-progress rendering:** Tool call → user permission prompt (skipped if `Automatic`) → Continue executes → result returned to model → model continues. A 6-step tool handshake cycle is documented. (docs.continue.dev/ide-extensions/agent/how-it-works, 2026-05-07)

- **Pause / approve / reject mid-flow:** "User gives permission" step in the tool cycle. "This step is skipped if the policy for that tool is set to `Automatic`." (docs.continue.dev/ide-extensions/agent/how-it-works, 2026-05-07) — configurable per-tool approval, not documented in detail.

- **Multi-step plans:** Not documented as a distinct planning artifact.

Sources: docs.continue.dev/ide-extensions/agent/how-it-works (2026-05-07)

### File / diff integration

- Not documented in fetched pages. Diffs may appear via VS Code's native diff tooling.

Sources: Public docs do not cover this axis in detail as of 2026-05-07.

### Multi-session / threading

- Not documented.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Streaming / progress UX

- Not documented.

Sources: Public docs do not cover this axis as of 2026-05-07.

### Approval / safety

- **Per-tool approval:** Per-tool policy: default requires user permission; `Automatic` policy skips permission for that tool. Configuration surface not described in detail.

- **Approval modes:** `Automatic` vs. manual (per-tool). Global mode not documented.

- **Sandboxing:** Not documented.

Sources: docs.continue.dev/ide-extensions/agent/how-it-works (2026-05-07)

### Distinctive choices

1. **The most extensive built-in context provider library in the survey** — 15+ named providers covering debugger variables (`@Debugger`), repo map (`@Repo-Map`), git diff (`@Git Diff`), OS info, Google search, GitLab MRs, and Jira issues. No other tool documents this breadth of `@`-mention targets.

2. **Config-file-first architecture** — the entire system (models, slash commands, context providers, routing) is defined in a single `config.yaml`. This makes Continue highly composable for power users but requires more setup than curated-UX tools. The extensibility is the product.

3. **`@Repo-Map` — explicitly inspired by Aider** — Continue documents that `@Repo-Map` "is inspired by Aider's repository map" (docs.continue.dev, 2026-05-07). This cross-tool acknowledgment is notable; it gives users Aider's codebase orientation approach within an IDE chat panel.

### Sources

- https://docs.continue.dev (2026-05-07) — overview, agent mode, config reference
- https://docs.continue.dev/customize/deep-dives/custom-providers (2026-05-07) — context providers list
- https://docs.continue.dev/ide-extensions/agent/how-it-works (2026-05-07) — agent mode tool cycle, approval mechanism
- https://docs.continue.dev/ide-extensions/chat/context-selection (2026-05-07) — chat context selection
- https://docs.continue.dev/guides/codebase-documentation-awareness (2026-05-07) — codebase + docs awareness in agent mode
- https://sureprompts.com/blog/continue-dev-prompting-guide (2026-05-07) — config-file-first architecture, slash commands

---

## 7. Zed AI (Zed editor agent panel)

**URL:** https://zed.dev
**Last verified:** 2026-05-07
**Pricing model:** Zed Pro subscription for hosted LLM access; bring-your-own API key (Anthropic, OpenRouter, etc.) for free use. Pro plan required for hosted models.
**License / openness:** Open source (GPL-3.0 for the editor; agent panel code in public repo)

### Chat surface model

- **Agent Panel** — the primary multi-turn AI surface. Opened via `agent: new thread` in the Command Palette or the ✨ (sparkles) icon in the status bar. "Expand the editor with shift-alt-escape if you need more room." (zed.dev/docs/ai/agent-panel, 2026-05-07)
- **Inline Assistant** — in-editor, in-place edits. Can reference the same context via `@`-mentions and even `@`-mention agent threads for continuity.
- **External Agents** — Claude Agent (claude-code CLI), Gemini CLI, and Codex integrated via the Agent Client Protocol (ACP). These third-party agents use the same Agent Panel but may have feature gaps (checkpoints, token usage display, thread history restoration may not work for external agents).
- Two thread types:
  - **Agent Threads** (default) — autonomous AI code writing; the primary mode.
  - **Text Threads** — the original assistant panel; loved for control; no autonomous code writing. Zed does not plan to deprecate text threads.

Sources: zed.dev/docs/ai/agent-panel (2026-05-07); zed.dev/docs/ai/external-agents (2026-05-07)

### Composer

- **Text input model:** Message editor within the Agent Panel. Press `Enter` to submit. Configurable modifier requirement to prevent accidental sends. Minimum message editor lines configurable.

- **Mentions / @:** "Add context by typing `@` in the message editor." Documented mentionable entities:
  - Files — by file path
  - Directories — by folder path
  - Symbols — functions, classes, variables
  - Previous threads — `@thread` to reference a past conversation (also usable in Inline Assistant)
  - Rules files — project rules
  - Diagnostics — error/warning information
  - Images — paste clipboard images, drag from file system, or `@`-mention project image files
  - "When you paste multi-line code selections copied from a buffer, Zed automatically formats them as `@`-mentions with the file context." (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Slash commands:** Slash commands are surfaced via available_commands from the agent server. Claude Agent's custom slash commands are supported and merged into skills. "Not all of Claude Code's default slash commands work inside Zed's Agent window yet." (builder.io/blog/zed-ai-2026, 2026-05-07). The set of available commands depends on the configured agent.

- **Attachments:** Images fully supported — paste from clipboard, drag from file system, or `@`-mention. Multi-line pastes auto-formatted as `@`-mentions with file context.

- **Context preview:** Not documented as a named UI surface. Token usage is surfaced near the profile selector in the message editor (see Streaming section).

Sources: zed.dev/docs/ai/agent-panel (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented as a user-facing UI surface.

- **Rules / persona / project context:**
  - Rules files can be `@`-mentioned directly in the Agent Panel.
  - Claude Agent automatically uses `CLAUDE.md` files found in the project root, project subdirectories, or root `.claude` directory.
  - Gemini CLI: project-level config files used per Gemini CLI conventions.
  - Zed's own rules file format not described in detail in fetched docs.

- **Memories:** Not documented as automatic persistence (contrast with Windsurf). Thread history is navigable via Threads Sidebar.

- **Skills / sub-agents:**
  - **External Agents (ACP)** — Claude Agent, Gemini CLI, Codex run as structured external agents via the Agent Client Protocol. "As of 1.0, ACP is treated as a stable surface rather than a moving target." (zed.dev/docs/ai/external-agents, 2026-05-07)
  - Multiple threads can run concurrently (see Threading).

- **Files:** `@`-mention files or directories. Selected text in a buffer or terminal can be added as context via keybindings. Active buffer context is implicit. Inline Assistant can reference agent threads via `@thread`.

Sources: zed.dev/docs/ai/agent-panel (2026-05-07); zed.dev/docs/ai/external-agents (2026-05-07)

### Tool / agent dispatch UX

- **Triggering:** Type in the message editor and submit. Agent autonomously determines tool use.

- **In-progress rendering:** "Responses stream in with indicators showing which tools the model is using." After edits: panel displays which files and how many lines were edited. (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Pause / approve / reject mid-flow:** Tool permissions use the configured approval mode (confirm/allow/deny). In `confirm` mode (default), each tool action prompts for approval. "You can accept or reject each individual change hunk, or the whole set of changes made by the agent." (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Multi-step plans:** Not documented as a distinct planning artifact. Agent proceeds autonomously.

Sources: zed.dev/docs/ai/agent-panel (2026-05-07)

### File / diff integration

- **File tree behavior:** Not documented.

- **Diff view:** A **Review Changes** button (`Shift+Ctrl+R`) opens a "special multi-buffer tab with all changes." "Edit diffs also appear in singleton buffers." (zed.dev/docs/ai/agent-panel, 2026-05-07). The multi-buffer review tab collects all pending changes across files in one view.

- **Accept / reject UX:** "You can accept or reject each individual change hunk, or the whole set of changes made by the agent." Per-hunk and all-changes granularity documented. (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Checkpoints / undo:** "Every time the model performs an edit, you should see a 'Restore Checkpoint' button" allowing rollback to prior states. (zed.dev/docs/ai/agent-panel, 2026-05-07). Worktree isolation available: "If two threads might edit the same files, you can isolate one in a new Git worktree."

Sources: zed.dev/docs/ai/agent-panel (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** "You can run multiple agent threads at once, each working independently with its own agent, context window, and conversation history." (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Threads Sidebar** (`Cmd+Alt+J`) — displays all threads grouped by project. The `+` icon in the panel toolbar opens a new thread. `Cmd+Alt+T` / `Ctrl+Alt+T` — keyboard shortcut for new thread.

- **Branching:** **New From Summary** — starts a fresh thread seeded with a summary of the current conversation. Used for context compaction: "useful for compacting long threads as you approach the context window limit." (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Context window management:** Token count surfaced near the profile selector. "Once you approach the model's context window, a banner appears above the message editor suggesting to start a new thread with the current one summarized and added as context." (zed.dev/docs/ai/agent-panel, 2026-05-07)

Sources: zed.dev/docs/ai/agent-panel (2026-05-07)

### Streaming / progress UX

- **Streaming text:** "Responses stream in with indicators showing which tools the model is using." (zed.dev/docs/ai/agent-panel, 2026-05-07)

- **Thinking / reasoning blocks:** Not documented as a surfaced UI element.

- **Token usage / cost:** Token count surfaced near the profile selector in the message editor for the active thread. Context window approach triggers a banner.

- **Latency UX:** Tool use indicators stream live during response generation.

- **Sound notifications:** Configurable — "never", "when_hidden", "always". (zed.dev/docs/ai/agent-settings, 2026-05-07)

Sources: zed.dev/docs/ai/agent-panel (2026-05-07); zed.dev/docs/ai/agent-settings (2026-05-07)

### Approval / safety

- **Per-tool approval:** Three modes configured via `agent.tool_permissions.default`:
  - `"confirm"` (default) — "Prompts for approval before running any tool action" (zed.dev/docs/ai/agent-settings, 2026-05-07)
  - `"allow"` — "Auto-approves tool actions without prompting"
  - `"deny"` — "Blocks all tool actions"

- **Granular tool permission rules:** Regex-pattern-based with a precedence hierarchy:
  1. Built-in security rules (hardcoded, non-overridable)
  2. `always_deny` patterns
  3. `always_confirm` patterns
  4. `always_allow` patterns
  5. Tool-specific defaults
  6. Global default
  Patterns are case-insensitive by default; `case_sensitive: true` option available.

- **Sandboxing / read-only mode:** Worktree isolation — run a thread in an isolated Git worktree if concurrent edits to the same files could conflict. Not a sandboxed container; isolation is at the Git worktree level.

Sources: zed.dev/docs/ai/agent-settings (2026-05-07)

### Distinctive choices

1. **Concurrent independent agent threads** — running multiple threads simultaneously, each with its own agent, context window, and history, is a first-class feature with a dedicated sidebar. Worktree isolation prevents conflicting edits across threads. This is the most explicit multi-agent concurrency model in the survey.

2. **"New From Summary" thread continuation** — rather than `/compact` or a generic "clear history" action, Zed's context-limit UX summarizes the current thread and seeds a new thread with that summary. The summary is injected as explicit context, not silently discarded. A banner proactively alerts when the limit approaches.

3. **Multi-buffer review tab for all changes** — a dedicated tab (`Shift+Ctrl+R`) aggregates all pending agent changes across files in one review surface. Per-hunk and all-changes accept/reject in that single view. This is a distinct pattern from VS Code Copilot's in-editor inline diffs with auto-navigate, and from Cursor's checkpoint restore.

### Sources

- https://zed.dev/docs/ai/agent-panel (2026-05-07) — full Agent Panel docs: @mentions, threads, diff view, approve/reject, checkpoints, streaming
- https://zed.dev/docs/ai/agent-settings (2026-05-07) — tool permission modes, regex rules, model config, sound notifications
- https://zed.dev/docs/ai/external-agents (2026-05-07) — Claude Agent, Gemini CLI, Codex via ACP
- https://zed.dev/docs/ai/inline-assistant (2026-05-07) — Inline Assistant, @thread cross-referencing
- https://builder.io/blog/zed-ai-2026 (2026-05-07) — slash command availability gaps, text threads vs. agent threads

---

## 8. Aider (terminal, chat-centric)

**URL:** https://aider.chat
**Last verified:** 2026-05-07
**Pricing model:** Free (open source); bring-your-own API key (OpenAI, Anthropic, Google Gemini, DeepSeek, xAI, Ollama, and dozens of others)
**License / openness:** Open source (Apache 2.0)

### Chat surface model

- **Terminal REPL** — Aider runs in the terminal as an interactive read-eval-print loop. No IDE panel or graphical window. Users type prompts at the command line; Aider responds with streaming text and applies file edits inline.
- Chat-centric: the terminal conversation is the primary interface for all operations.
- Aider can be integrated into VS Code and other editors via the Aider extension, which provides a graphical wrapper, but the core tool is terminal-native.

Sources: aider.chat (2026-05-07); aider.chat/docs/ (2026-05-07)

### Composer

- **Text input model:** Terminal readline input. Supports multi-line input via the `/editor` command (opens the user's configured editor to write a longer prompt). `/paste` — paste text or image from clipboard. `/voice` — record and transcribe voice input.

- **Mentions / @:** No `@`-mention system. Context is managed via explicit file addition with `/add` and `/drop` commands. Files in the chat are the context. "Just add the files you think need to be edited." (aider.chat/docs/usage/tips.html, 2026-05-07)

- **Slash commands:** Aider has a comprehensive built-in slash command system. Full documented command set (aider.chat/docs/usage/commands.html, 2026-05-07):

  | Command | Purpose |
  |---|---|
  | `/add` | Add files to the chat for editing or review |
  | `/architect` | Enter architect/editor mode using 2 different models |
  | `/ask` | Ask questions about the code without editing files |
  | `/chat-mode` | Switch to a new chat mode |
  | `/clear` | Clear the chat history |
  | `/code` | Ask for changes to your code (default mode) |
  | `/commit` | Commit edits made outside the chat |
  | `/context` | Show surrounding code context |
  | `/copy` | Copy the last assistant message to clipboard |
  | `/copy-context` | Copy current chat context as Markdown (for pasting into web UIs) |
  | `/diff` | Display the diff of changes since the last message |
  | `/drop` | Remove files from chat to free context space |
  | `/editor` | Open an editor to write a prompt |
  | `/editor-model` | Switch the editor model |
  | `/exit` | Exit the application |
  | `/git` | Run a git command (output excluded from chat) |
  | `/help` | Ask questions about Aider |
  | `/lint` | Lint and fix in-chat files |
  | `/load` | Load and execute commands from a file |
  | `/ls` | List all known files and indicate which are in the chat |
  | `/map` | Print the current repository map |
  | `/map-refresh` | Force refresh of the repository map |
  | `/model` | Switch the main model |
  | `/models` | Search the list of available models |
  | `/ok` | Quick approval of code changes |
  | `/paste` | Paste image/text from clipboard |
  | `/read-only` | Add files for reference only (not for editing) |
  | `/reasoning-effort` | Set the reasoning effort level |
  | `/report` | Report a problem by opening a GitHub Issue |
  | `/reset` | Drop all files and clear chat history |
  | `/run` | Run a shell command and optionally add output to chat |
  | `/save` | Save commands to a file to reconstruct the current session |
  | `/settings` | Print current settings |
  | `/test` | Run a shell command and add output to chat on non-zero exit |
  | `/think-tokens` | Set the thinking token budget |
  | `/tokens` | Report token count for current chat context |
  | `/undo` | Undo the last git commit if made by Aider |
  | `/voice` | Record and transcribe voice input |
  | `/weak-model` | Switch the weak model |
  | `/web` | Scrape a webpage, convert to Markdown, send in a message |

- **Attachments:** Images via `/paste` from clipboard or by adding image files with `/add`. `/web` fetches URLs as Markdown context.

- **Context preview:** `/tokens` — reports token count for current chat context. `/map` — shows the repository map (what the model knows about the codebase structure). `/ls` — lists all known files and which are in the chat. Together these approximate a context preview.

Sources: aider.chat/docs/usage/commands.html (2026-05-07)

### Context surfacing

- **System prompt visibility:** `/settings` prints current settings. No UI surface for viewing the assembled system prompt, but settings (including system prompt configuration) are inspectable via the command.

- **Rules / persona / project context:**
  - `.aider.conf.yml` — project-level configuration file (model selection, settings).
  - `/read-only` — add reference files that the model can read but not edit.
  - No equivalent to `.cursorrules` or Steering files for injecting always-on instructions. Conventions are typically added as `/read-only` files or included in the initial prompt.

- **Memories:** No automatic memory persistence. Chat history (`/save` / `/load`) can save and restore sessions. `/clear` clears history.

- **Skills / sub-agents:**
  - **Architect mode** — uses two models: a reasoning model proposes changes; an editor model applies the diff. "An architect model will propose changes and an editor model will translate that proposal into specific file edits." (aider.chat/docs/usage/modes.html, 2026-05-07). Recommended pairing (2026): GPT-5 as architect, cheaper model as editor; or Claude Opus as architect, Sonnet as editor.
  - **Watch mode (2026)** — run Aider in the background; place an `AI!` comment in code; Aider detects the marker, makes the change, commits, and clears the marker. No interactive prompting required.
  - No MCP integration documented in current public docs.

- **Files:** Managed explicitly with `/add` and `/drop`. `/read-only` for reference-only. "Adjust the files added to the chat as you go: `/drop` files that don't need any more changes, `/add` files that need changes for the next step." (aider.chat/docs/usage/tips.html, 2026-05-07). The **repository map** (auto-generated) gives the model awareness of the broader codebase structure beyond added files.

Sources: aider.chat/docs/usage/commands.html (2026-05-07); aider.chat/docs/usage/modes.html (2026-05-07); aider.chat/docs/usage/tips.html (2026-05-07)

### Tool / agent dispatch UX

- **Triggering:** Type a prompt at the terminal REPL. Select the mode with `/code`, `/ask`, `/architect`, or `/chat-mode`.

- **In-progress rendering:** Streaming text response in the terminal. File edits are applied immediately and confirmed with a summary. Git commits happen automatically after each edit (see Git integration).

- **Pause / approve / reject mid-flow:** No interactive approval UI during generation. `/undo` reverses the last git commit after the fact. Architect mode shows the proposal from the architect model before the editor model applies it, providing a review point.

- **Multi-step plans:** The recommended workflow: use `/ask` mode to discuss and plan, then switch to `/code` or `/architect` for execution. "All the conversation and decision making from ask mode will help ensure that the correct code changes are performed." (aider.chat/docs/usage/modes.html, 2026-05-07). Plans live in the conversation, not as a structured artifact.

Sources: aider.chat/docs/usage/modes.html (2026-05-07); aider.chat/docs/usage/tips.html (2026-05-07)

### File / diff integration

- **File tree behavior:** `/ls` lists all known files and which are in the chat. No graphical file tree.

- **Diff view:** `/diff` — "Display the diff of changes since the last message." (aider.chat/docs/usage/commands.html, 2026-05-07). Shown as a terminal diff. No graphical diff panel.

- **Accept / reject UX:** No per-hunk or per-file approval UI. Changes are applied to disk immediately. `/undo` reverses the last commit. Aider applies "chat-driven edits directly to your files, showing Git diffs and automatically generating commit messages so changes are easy to review, branch, and roll back." (deployhq.com/guides/aider, 2026-05-07)

- **Checkpoints / undo:**
  - Every AI edit is automatically committed to Git with a descriptive message.
  - `/undo` — "Undo the last git commit if it was done by Aider." (aider.chat/docs/usage/commands.html, 2026-05-07)
  - Git history is the checkpoint system — every AI edit is a reversible commit.

Sources: aider.chat/docs/usage/commands.html (2026-05-07); aider.chat/docs/git.html (2026-05-07)

### Multi-session / threading

- **Concurrent sessions:** Not supported natively (terminal REPL). Multiple terminal sessions can be run independently.

- **Branching:** Via Git branching — standard Git workflow. Aider commits to the current branch.

- **Search / history:** `/save` saves the current session's commands to a file. `/load` replays them. `/clear` clears history within the session.

Sources: aider.chat/docs/usage/commands.html (2026-05-07)

### Streaming / progress UX

- **Streaming text:** Responses stream to the terminal in real time.

- **Thinking / reasoning blocks:** Not documented as a distinct UI element, but `/think-tokens` sets the thinking token budget for models that support extended reasoning. `/reasoning-effort` sets the reasoning effort level.

- **Token usage / cost:** `/tokens` — "Report on the number of tokens used by the current chat context." (aider.chat/docs/usage/commands.html, 2026-05-07). "Enhanced token usage and cost reporting, and it now works when streaming too." (aider.chat/HISTORY.html via deployhq.com/guides/aider, 2026-05-07) — cost tracking during streaming is a documented feature.

- **Latency UX:** Pure terminal streaming; no skeleton or "thinking…" indicator beyond the streaming text itself.

Sources: aider.chat/docs/usage/commands.html (2026-05-07)

### Approval / safety

- **Per-tool approval:** No interactive per-action approval. Changes applied immediately. Git commits are the audit trail.

- **Approval modes:**
  - `--no-auto-commits` — disables automatic git commits.
  - `--no-dirty-commits` — disables committing pre-existing dirty files before edits.
  - `--no-git` — disables git entirely.
  - `--git-commit-verify` — enables pre-commit hooks (disabled by default: "Aider skips pre-commit hooks by using the `--no-verify` flag." — aider.chat/docs/git.html, 2026-05-07)
  - These are startup flags, not in-session toggles.

- **Sandboxing:** None. Aider runs with full local filesystem access. Safety via Git history and `/undo`.

Sources: aider.chat/docs/git.html (2026-05-07)

### Distinctive choices

1. **Git as the entire safety and undo model** — Aider auto-commits every AI edit with a descriptive Conventional Commits message, making Git history the checkpoint system. `/undo` reverses the last commit. There is no proprietary checkpoint or snapshot system — the safety model is the developer's existing Git workflow. This is the only tool in the survey that fully delegates the undo mechanism to Git rather than a custom layer.

2. **Architect/Editor dual-model pipeline** — a strong reasoning model plans the change; a cheaper, faster editor model emits the actual file diff. This split is documented as the solution to "frontier models reason brilliantly but sometimes mangle structured diff output." The 2026 recommended pairing is GPT-5 (architect) + a cheap editor model. No other tool in the survey documents this specific two-model task split as a core chat UX pattern.

3. **Watch mode (2026) — `AI!` comment as an async task trigger** — placing `AI!` in source code triggers Aider to detect the marker, apply the change, commit, and clear the marker while running in the background. This is a code-annotation-driven async invocation model, unlike all other tools' chat-driven or event-driven dispatch.

### Sources

- https://aider.chat (2026-05-07) — overview
- https://aider.chat/docs/ (2026-05-07) — documentation index
- https://aider.chat/docs/usage/commands.html (2026-05-07) — full slash command list
- https://aider.chat/docs/usage/modes.html (2026-05-07) — chat modes (code, ask, architect, help)
- https://aider.chat/docs/usage/tips.html (2026-05-07) — file management, /add, /drop, phased workflow
- https://aider.chat/docs/git.html (2026-05-07) — git integration: auto-commits, dirty commits, /undo, pre-commit hooks
- https://deployhq.com/guides/aider (2026-05-07) — architect mode, watch mode, cost reporting during streaming

---

## 9. v0 (Vercel)

**URL:** https://v0.app (formerly v0.dev)
**Last verified:** 2026-05-07
**Pricing model:** Freemium (Free tier; Pro $20/mo; Team plan available). Token-based usage within subscription tiers.
**License / openness:** Closed source (Vercel product)

### Chat surface model

- **Web-based chat interface** — not an IDE extension. Runs entirely in the browser at v0.app. Three-panel layout: chat/prompt input on the left, code editor in the center, live preview on the right.
- Conversational iteration: users follow up with refinements across multiple turns. "v0 isn't a one-shot generator." (nxcode.io/resources/news/v0-by-vercel-complete-guide-2026, 2026-05-07)

Sources: v0.app/docs (2026-05-07); nxcode.io/resources/news/v0-by-vercel-complete-guide-2026 (2026-05-07)

### Composer

- **Text input model:** Chat input box in the left panel.
- **Mentions / @:** Not documented in fetched pages.
- **Slash commands:** Not documented.
- **Attachments:** Screenshots and image files (for visual reference). Figma file import: "Clone pages with screenshots or Figma files." (v0.app/docs, 2026-05-07). File attachments for context.
- **Context preview:** Not documented.

Sources: v0.app/docs (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented.
- **Rules:** Not documented as a named feature.
- **Memories:** Not documented.
- **Skills / agents:** "Intelligent Agent: Autonomous capabilities including web search, site inspection, error fixing, and external tool integration." (v0.app/docs, 2026-05-07). Agent capabilities added as of February 2026 update (Git integration, VS Code-style editor, database connectivity, agentic workflows).

Sources: v0.app/docs (2026-05-07); vercel.com/blog/introducing-the-new-v0 (2026-05-07)

### Tool / agent dispatch UX

- Not documented in detail. Agent autonomously iterates on the app in response to prompts.
- Real-time preview updates as code is generated.

### File / diff integration

- **Diff view:** A dedicated diff view was introduced to review code changes file by file with line-level detail. (nxcode.io/resources/news/v0-by-vercel-complete-guide-2026, 2026-05-07)
- **Accept / reject:** Not documented in detail.
- **Checkpoints:** Not documented.

### Multi-session / threading

- Conversational history within a session. Multiple chat threads/projects supported via the project system. Details not documented in fetched pages.

### Streaming / progress UX

- "Real-time preview of your app, with visual progress indicators." (v0.app/docs, 2026-05-07)
- Token usage / cost: not documented as a visible UI element.

### Approval / safety

- Not documented.

### Distinctive choices

1. **Live preview as a first-class, always-visible panel** — the right panel shows a running preview of the generated app in real time, not just code. Changes are immediately observable without a deploy step. This is a distinct UX for a UI-generation tool.
2. **Figma import** — drop Figma designs directly into chat to use as visual reference for code generation. No other tool in this survey documents Figma as a first-class context input.

### Sources

- https://v0.app/docs (2026-05-07) — features overview, agent capabilities, Figma import, screenshot attachments
- https://vercel.com/blog/introducing-the-new-v0 (2026-05-07) — February 2026 update: Git integration, VS Code-style editor, agentic workflows
- https://nxcode.io/resources/news/v0-by-vercel-complete-guide-2026 (2026-05-07) — diff view, conversational iteration, live preview

---

## 10. Bolt.new (StackBlitz)

**URL:** https://bolt.new
**Last verified:** 2026-05-07
**Pricing model:** Freemium (Free tier; Pro $20/mo; Teams plan). Credit-based consumption within tiers.
**License / openness:** Closed (bolt.new service); open-source self-hostable variant: bolt.diy (19+ LLM providers)

### Chat surface model

- **Web-based, three-panel interface** — chat left, code editor center, live preview right. No IDE extension required; runs entirely in the browser.
- "You can edit the code manually or ask Bolt to make changes through follow-up chat messages." (banani.co/blog/bolt-new-review, 2026-05-07)

Sources: github.com/stackblitz/bolt.new (2026-05-07); banani.co/blog/bolt-new-review (2026-05-07)

### Composer

- **Text input model:** Chat input for follow-up prompts and refinements.
- **Mentions / @:** Not documented.
- **Slash commands:** Not documented.
- **Attachments:** Figma designs can be dragged directly into chat. Image generation (AI images with transparent background, WebP) added in early 2026. (agent-finder.co/reviews/bolt-new, 2026-05-07)
- **Context preview:** Not documented.

Sources: github.com/stackblitz/bolt.new (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented.
- **Rules:** Not documented.
- **Memories:** Not documented.
- **Skills / agents:** "Unlike traditional dev environments where the AI can only assist in code generation, Bolt.new gives AI models complete control over the entire environment, including the filesystem, node server, package manager, terminal, and browser console." (skywork.ai/blog/what-is-bolt-new/, 2026-05-07)
- MCP server support added early 2026: Notion, Linear, GitHub, and others.

Sources: skywork.ai/blog/what-is-bolt-new/ (2026-05-07)

### Tool / agent dispatch UX

- Agent "reads and writes files, runs commands, and iteratively modifies a project in response to your instructions." (github.com/stackblitz/bolt.new, 2026-05-07)
- Approve/reject: not documented in detail.
- "Autonomous debugging that reduces error loops by 98%." (agent-finder.co/reviews/bolt-new — Bolt v2 release notes, 2026-05-07)

### File / diff integration

- Direct file editing in the center panel. Diffs not documented as a distinct review surface.
- Checkpoints / undo: not explicitly documented in fetched pages.

### Multi-session / threading

- Projects are the session unit. Shared workspaces and team templates added in 2025. Collaborative editing documented. (agent-finder.co/reviews/bolt-new, 2026-05-07)

### Streaming / progress UX

- Live preview updates in real time as code is generated.
- Token usage / cost: not documented as a visible UI element.

### Approval / safety

- **Sandboxing:** WebContainers — Node.js runs entirely in the browser via WebAssembly. "Because all code execution happens within the browser's security sandbox, there is no risk of generated code affecting the user's local machine or accessing sensitive files." (skywork.ai/blog/what-is-bolt-new/, 2026-05-07). Full isolation from the local filesystem.
- Limitations: "Can't run native binaries or access your local file system outside the browser sandbox. Most npm packages work fine, but some (like those requiring native modules) won't run."

Sources: skywork.ai/blog/what-is-bolt-new/ (2026-05-07)

### Distinctive choices

1. **WebContainers (WebAssembly in-browser Node.js)** — the only tool in this survey that runs the full Node.js runtime entirely in the browser sandbox. This provides true sandboxing (no local machine access), offline operation, and eliminates local setup — at the cost of native binary support.
2. **AI model has complete environment control** — Bolt's design gives the AI "complete control over the entire environment, including the filesystem, node server, package manager, terminal, and browser console." This is the broadest documented agent permission scope in the survey.

### Sources

- https://github.com/stackblitz/bolt.new (2026-05-07) — README, agent capabilities, WebContainers
- https://skywork.ai/blog/what-is-bolt-new/ (2026-05-07) — WebContainers sandboxing, environment control
- https://agent-finder.co/reviews/bolt-new (2026-05-07) — v2 autonomous debugging, Figma import, MCP support, collaborative editing
- https://banani.co/blog/bolt-new-review (2026-05-07) — three-panel UI, iterative chat, framework support

---

## 11. Replit Agent

**URL:** https://replit.com/products/agent
**Last verified:** 2026-05-07
**Pricing model:** Free ($0, limited); Core ($25/mo or $20/mo annual); Pro ($100/mo or $95/mo annual, includes Turbo mode). Pricing overhauled February 2026.
**License / openness:** Closed source (Replit platform)

### Chat surface model

- **Project Editor chat** — Agent operates within the Replit Project Editor. "In the Project Editor, just start chatting." (docs.replit.com/core-concepts/agent, 2026-05-07)
- Web-based; runs in the browser. No local IDE required.
- Three effort modes: **Economy**, **Power**, **Turbo** — affect capability and credit consumption.

Sources: docs.replit.com/core-concepts/agent (2026-05-07)

### Composer

- **Text input model:** Natural language textarea. "Describe what you want in everyday language. No code or technical knowledge required." (docs.replit.com/core-concepts/agent, 2026-05-07). `defaultPrompt` and `showTypewriter` parameters mentioned in component architecture — indicating a typewriter animation for demo purposes.
- **Mentions / @:** Not documented.
- **Slash commands:** Not documented.
- **Attachments:** Not documented.
- **Context preview:** Not documented.

Sources: docs.replit.com/core-concepts/agent (2026-05-07)

### Context surfacing

- **System prompt visibility:** Not documented.
- **Rules:** Not documented as a named feature.
- **Memories:** Not documented.
- **Skills / sub-agents:** Agent 3 (released September 2025) can "spawn subagents for specialized tasks." (blog.replit.com/2025-replit-in-review, 2026-05-07). Extended Thinking, High Power, and Web Search as advanced options within the chat.

Sources: blog.replit.com/2025-replit-in-review (2026-05-07); docs.replit.com/core-concepts/agent (2026-05-07)

### Tool / agent dispatch UX

- **Triggering:** Describe what you want; Agent plans and executes. "If you already described what you want in step 1, Agent figures out the right setup automatically." (docs.replit.com/core-concepts/agent, 2026-05-07)

- **In-progress rendering:** Agent creates a plan with an ordered task list before executing. "Agent also creates checkpoints as it works, so you can roll back to any previous state." (docs.replit.com/core-concepts/agent, 2026-05-07)

- **Pause / approve / reject mid-flow:**
  - **Plan Mode** — non-destructive ideation: "When you're happy with the plan, approve it and Agent starts building." (docs.replit.com/core-concepts/agent, 2026-05-07). Creates ordered task lists for review and refinement before any edits.
  - **Build Mode** — Agent makes file changes. Users switch from Plan to Build after approving.

- **Autonomous operation duration:** Agent 3 can "work autonomously for up to 200 minutes per session" (compared to 2 minutes for Agent 1, 20 minutes for Agent 2). (hackceleration.com/replit-review/, 2026-05-07)

Sources: docs.replit.com/core-concepts/agent (2026-05-07); hackceleration.com/replit-review/ (2026-05-07)

### File / diff integration

- Not documented in detail in fetched pages.

### Multi-session / threading

- Not documented.

### Streaming / progress UX

- Not documented in detail. Agent 3 runs for up to 200 minutes autonomously; streaming/progress display during long runs is not described in fetched docs.

### Approval / safety

- **Plan Mode vs. Build Mode** — the primary approval mechanism: review the plan, approve, then execute. Not per-action approval.
- **Sandboxing:** Replit runs in a cloud container environment. Code execution is sandboxed from the user's local machine by default. Semgrep-powered security scanning before deployment documented. (skywork.ai/blog/replit-agent-definition-2/, 2026-05-07)
- **Checkpoints / rollback:** "Checkpoints and rollbacks give you a safety net to experiment and undo changes." Automatic snapshots include code and database state. (hackceleration.com/replit-review/, 2026-05-07)

Sources: docs.replit.com/core-concepts/agent (2026-05-07); hackceleration.com/replit-review/ (2026-05-07); skywork.ai/blog/replit-agent-definition-2/ (2026-05-07)

### Distinctive choices

1. **Plan Mode as a mandatory pre-execution gate** — Replit's Plan Mode creates an ordered task list for user review before any file is touched. The approval is at the plan level (not per-action), and it's the primary safety mechanism rather than an optional feature.

2. **200-minute autonomous operation sessions** — Agent 3's documented ability to operate without user interaction for up to 200 minutes is the longest autonomous run documented in this survey. Combined with cloud execution and Semgrep scanning, Replit positions Agent as an autonomous builder rather than a co-pilot.

3. **Checkpoint rollback includes database state** — "Automatic snapshots include code and database state." (hackceleration.com/replit-review/, 2026-05-07). Rolling back code and the associated database together is a capability not documented in any other tool in this survey.

### Sources

- https://docs.replit.com/core-concepts/agent (2026-05-07) — Agent: Project Editor location, Plan Mode, Build Mode, task lists, checkpoints
- https://blog.replit.com/2025-replit-in-review (2026-05-07) — Agent 2, Agent 3, Design Mode timeline; subagent spawning
- https://hackceleration.com/replit-review/ (2026-05-07) — Agent 3: 200-min sessions, effort modes, rollback with DB state
- https://skywork.ai/blog/replit-agent-definition-2/ (2026-05-07) — sandboxing, Semgrep scanning, safe vibe coding

---

## Coverage Matrix — Axes by Tool

The following table summarizes which axes are documented for each tool. "Yes" = documented. "No" = not documented in public sources reviewed.

| Axis | Cursor | Windsurf | VS Code Copilot | Kiro | Cline | Continue | Zed | Aider | v0 | Bolt | Replit |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Chat panel location | Yes | Yes | Yes | Partial | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| @ mentions / context picker | Yes | Yes | Yes | No | Yes | Yes | Yes | No | No | No | No |
| Slash commands | Yes | No | Partial | No | No | Yes | Partial | Yes | No | No | No |
| Image attachments | Yes | No | Yes | No | Yes | No | Yes | Yes | Yes | Yes | No |
| Context preview UI | Partial | No | Yes | No | No | No | Partial | Partial | No | No | No |
| System prompt visible | No | No | Yes | No | No | No | No | Partial | No | No | No |
| Persistent rules | Yes | Yes | Partial | Yes | No | Yes | Partial | No | No | No | No |
| Auto memories | No | Yes | No | No | No | No | No | No | No | No | No |
| Per-action approval | No | No | Yes | No | Yes | Yes | Yes | No | No | No | No |
| Configurable approval modes | No | No | Yes | No | No | Partial | Yes | Partial | No | No | No |
| Glob/regex-based file protection | No | No | Yes | No | No | No | Yes | No | No | No | No |
| Per-hunk accept/reject | No | No | Yes | No | No | No | Yes | No | No | No | No |
| Checkpoint / undo | Yes | No | Yes | No | Yes | No | Yes | Yes | No | No | Yes |
| Concurrent threads/sessions | Partial | No | No | No | No | No | Yes | No | No | No | No |
| Thread summary continuation | No | No | No | No | No | No | Yes | No | No | No | No |
| Token/cost display | No | No | No | No | Yes | No | Yes | Yes | No | No | No |
| Git-native commit per edit | No | No | No | No | No | No | No | Yes | No | No | No |
| Sandboxing | No | No | Yes (worktree) | No | No | No | Yes (worktree) | No | No | Yes (WebAssembly) | Yes (cloud) |
| Live preview panel | No | No | No | No | No | No | No | No | Yes | Yes | No |
| Structured plan artifacts | Partial | No | No | Yes | No | No | No | No | No | No | Yes |
| Event-driven hooks | Partial | No | No | Yes | No | No | No | No | No | No | No |
| Dual-model pipeline | No | No | No | No | No | No | No | Yes | No | No | No |
| DB-state checkpoint rollback | No | No | No | No | No | No | No | No | No | No | Yes |

---

*End of document. Feeds gap analysis in a subsequent foundation doc.*
