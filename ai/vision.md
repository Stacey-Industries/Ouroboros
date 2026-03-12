# Ouroboros — Vision

## What Is This App?

Ouroboros is an Electron desktop application for launching, monitoring, and interacting with Claude Code sessions. Think of it as a lightweight IDE built around AI agent workflows — you open a project, the agent works in the terminal and edits files, and you watch everything happen in real time.

The unique differentiator is the **Agent Monitor**: when Claude Code spawns subagents, their activity (tool calls, status, errors) streams live into a dedicated panel. You see the full tree of agent work as it happens.

## Developed by Agent, for Agent Workflows

Ouroboros is self-hosted: Claude Code builds this IDE from within a running instance of itself. This recursive development loop ("the snake eating its tail") is not a gimmick — it's a forcing function. Every feature is stress-tested by the agent that builds it, and every friction point is felt immediately.

This means:
- **The agent is the primary developer.** Human oversight steers direction; the agent makes implementation decisions, plans architecture, and writes code autonomously.
- **The IDE is the agent's workspace.** Features are designed to make agent-driven development faster, more observable, and more trustworthy — not to replace a general-purpose editor.
- **The development loop is the product.** If building Ouroboros inside Ouroboros is painful, the product is broken. Dogfooding is continuous and automatic.

Long-term, Ouroboros will expose IDE-native tools that Claude Code can interact with programmatically — blurring the line between "IDE the agent runs inside" and "tool the agent wields."

## Who Is It For?

Developers who use Claude Code as their primary coding tool and want to move toward increasingly autonomous agent workflows. Rather than switching between a terminal, an editor, and a file browser, Ouroboros puts all three in one window with the agent's activity front and center. The human role shifts from writing code to reviewing, steering, and approving agent work.

## Design North Stars

### 1. Warp-Level Terminal Experience
The terminal should feel like [Warp](https://warp.dev) — structured, modern, and fast. Key inspirations:
- **Command blocks**: Group each command + output as a discrete, navigable unit (not an undifferentiated text stream)
- **IDE-style input**: Rich editing at the prompt — cursor placement, multi-line, syntax highlighting
- **Smart completions**: Contextual suggestions for CLI tools, file paths, and history
- **Command history**: Full history navigation (up/down arrow), search (Ctrl+R), and persistence across sessions
- **Split panes**: Horizontal/vertical terminal splits with drag-and-drop rearrangement

### 2. Zed-Level Editor Polish
The file viewer should aspire to [Zed](https://zed.dev) quality — minimal, fast, information-dense. Key inspirations:
- **Semantic scrollbar indicators**: Git diffs, search results, diagnostics shown in the scrollbar
- **Breadcrumbs + symbol navigation**: Know where you are, jump where you need to go
- **Minimap**: Code overview at a glance
- **Code folding**: Collapse regions to focus
- **In-file search** (Ctrl+F): Find within the open file
- **Go-to-line**: Jump to a specific line number
- **Diff view**: See what the agent changed, inline or side-by-side

### 3. Visual Richness Without Clutter
Both Warp and Zed follow the "Tesla door handle" principle — features surface when needed and hide when not. The UI should feel:
- **Dark and warm**: Charcoal/navy backgrounds (not pure black), muted accent colors for editor, bolder accents for terminal highlights
- **Typographically intentional**: Separate UI font (proportional) and code font (monospace), both configurable
- **Animated functionally**: 100–300ms transitions that communicate state changes, no decorative motion
- **Information-dense**: Show more with less chrome — collapse what isn't needed, expand on hover/focus

### 4. Agent-First Workflow
This isn't a general-purpose IDE. The agent is the primary actor:
- The **terminal** is where the agent executes commands
- The **file viewer** is where you review the agent's work — transitioning from read-only observation to inline editing with full LSP support, so you can make quick corrections without leaving the IDE
- The **agent monitor** shows the full picture of what's happening across all spawned agents
- The **file tree** helps you navigate to what the agent touched
- **Agent templates** let you launch common workflows with one click
- **Diff review mode** surfaces everything the agent changed for human accept/reject
- **Session replay** lets you scrub through completed agent work to understand decisions
- The IDE itself becomes a **tool the agent can interact with** — not just a container it runs inside

## Architecture Reference

For implementation details, see:
- `docs/architecture.md` — Three-process model, component tree, state management, ownership rules, security
- `docs/api-contract.md` — Full IPC channel reference
- `docs/data-model.md` — Agent sessions, tool calls, config schema
- `CLAUDE.md` — Coding conventions, patterns, known issues

## Current State (March 2026)

The app is feature-rich and maturing. All core panels work — terminal (multi-tab, context menus, recording), file viewer (syntax highlighting, search, minimap, diff view, blame, symbol outline, markdown preview, image viewer, commit history, conflict resolver), file tree (hierarchical with git status), agent monitor (card/tree/feed/timeline/event-log views with cost calculation), command palette (fuzzy search, nested menus, recent commands), settings (10 sections including Claude Code config, themes, keybindings, hooks, profiles). Five themes ship plus a custom theme editor.

The architecture is clean, well-typed, and indexed in a codebase knowledge graph. Full git integration exists at the IPC level (status, diff, blame, log, branches, staging). The settings system supports Claude Code configuration (permission mode, model override, effort level, system prompts, tool allowlists, budget limits).

What's next is **agent workflow depth**: diff review mode for accept/reject of agent changes, agent templates for one-click common tasks, session replay, multi-session orchestration, cost dashboards, and eventually IDE-native tools that Claude Code can call programmatically.

## Design Language

### Color Philosophy
- **Backgrounds**: Warm charcoal (`#1e1e2e`) or deep navy (`#0a0e1a`), never pure black
- **Text**: Soft off-white (`#cdd6f4`), with muted (`#6c7086`) and faint (`#45475a`) variants
- **Accents**: Two registers — bold/saturated for terminal highlights and interactive elements, muted/semantic for editor syntax
- **Status**: Consistent semantic colors for success (green), warning (amber), error (red), info (blue)
- **Borders**: Subtle, low-contrast — define regions without dominating

### Typography
- **UI font**: Proportional sans-serif (Inter, Geist Sans) for labels, menus, status bars
- **Code font**: Monospace (JetBrains Mono, Geist Mono, Fira Code) for terminal, editor, file paths
- **Sizes independently configurable**: UI font size, terminal font size, editor font size

### Animation
- Transitions: 150ms ease-out for hover states, 200ms for panel open/close, 300ms for modals
- No bounce, no spring, no gratuitous motion
- Loading states: Subtle pulse or shimmer, not spinners

### Layout Principles
- Three-column with bottom terminal (current architecture is correct)
- All panels collapsible and resizable with persistence
- Command palette (Ctrl+K) as the fastest way to do anything
- Keyboard-first: every action reachable without a mouse

## What Success Looks Like

A developer opens Ouroboros, points it at a project, and starts a Claude Code session. The terminal feels as good as Warp. The file viewer updates as the agent edits, showing diffs inline. The agent monitor gives full visibility into what Claude is doing and why. The whole experience is smooth, dark, and fast — an app you'd choose to use over VS Code + a terminal.
