# Ouroboros Feature Plan — March 2026

## Overview

Combined recommendations from Opus and Sonnet analysis. Features organized into execution waves by dependency order and impact.

---

## Wave 1 — Critical Fixes (Must-Have, No Dependencies)

### 1A. `files:writeFile` IPC + InlineEditor Save
- **Problem**: InlineEditor tracks dirty state but no IPC handler exists to write files to disk
- **Scope**: Add `files:writeFile` handler in main process, expose via preload, wire Ctrl+S in InlineEditor
- **Files**: `src/main/ipc-handlers/files.ts` (or `ipc.ts`), `src/preload/preload.ts`, `src/renderer/types/electron.d.ts`, `src/renderer/components/FileViewer/InlineEditor.tsx`
- **Approach**:
  - Register `files:writeFile` IPC handler that takes `{ filePath: string, content: string }` → writes via `fs.promises.writeFile`
  - Add to preload bridge
  - Add type to `electron.d.ts`
  - Wire `Ctrl+S` / `Cmd+S` keybinding in InlineEditor to call it
  - Show save status in tab (clear dirty indicator on save)

### 1B. File Tree Auto-Refresh via `files:watchDir`
- **Problem**: `files:watchDir` IPC registered but never called. File tree doesn't update when agent edits files
- **Scope**: Subscribe FileTree component to directory watch events, refresh on changes
- **Files**: `src/renderer/components/FileTree/FileTree.tsx`, `src/main/ipc-handlers/files.ts` (verify handler), `src/preload/preload.ts`
- **Approach**:
  - Verify `files:watchDir` handler sends change events back to renderer
  - In FileTree, call `watchDir` on mount with project root
  - On file change events, debounce (300ms) and re-read directory
  - Clean up watcher on unmount
  - Throttle refreshes during heavy agent activity (batch changes)

### 1C. Fix `menu:settings` Event
- **Problem**: Native menu sends `menu:settings` but App.tsx listens for `agent-ide:open-settings`
- **Scope**: Bridge the event in App.tsx
- **Files**: `src/renderer/App.tsx`
- **Approach**: Add IPC listener for `menu:settings` that dispatches `agent-ide:open-settings` DOM event, or change menu.ts to use the correct channel

### 1D. Deduplicate Pricing Constants
- **Problem**: `costCalculator.ts` (renderer) and `usageReader.ts` (main) both define pricing tables
- **Scope**: Extract shared pricing to a common module importable by both processes
- **Files**: `src/shared/pricing.ts` (new), `src/renderer/**/costCalculator.ts`, `src/main/usageReader.ts`
- **Approach**: Create `src/shared/pricing.ts` with model pricing map, import from both locations

### 1E. Fix `usageReader.ts` File Filter
- **Problem**: `relevantFiles` filter is a no-op (`filter(async () => true)`)
- **Scope**: Implement actual date-based filtering of JSONL files
- **Files**: `src/main/usageReader.ts`
- **Approach**: Check file mtime against requested window, skip files older than the window

---

## Wave 2 — Core Integration (Enables Higher Features)

### 2A. LSP → CodeMirror Wiring
- **Problem**: LSP client runs in main process with completions/hover/diagnostics, but InlineEditor uses only CodeMirror built-in autocomplete
- **Scope**: Bridge LSP completions, hover, and diagnostics into CodeMirror extensions
- **Files**: `src/renderer/components/FileViewer/InlineEditor.tsx`, `src/preload/preload.ts`, `src/renderer/types/electron.d.ts`
- **Approach**:
  - On editor open, call `lsp:didOpen` with document content
  - On editor change, call `lsp:didChange` with incremental updates
  - Create CodeMirror completion source that calls `lsp:completions`
  - Create CodeMirror tooltip extension that calls `lsp:hover`
  - Create CodeMirror lint source that subscribes to `lsp:diagnostics` events
  - On editor close, call `lsp:didClose`

### 2B. Terminal → File Viewer Bridge (Clickable Paths)
- **Problem**: File paths in terminal output are plain text. No way to click through to the file viewer
- **Scope**: Custom xterm link provider that detects file paths and opens them in the viewer
- **Files**: `src/renderer/components/Terminal/TerminalInstance.tsx`, `src/renderer/components/Terminal/terminalLinkProvider.ts` (new)
- **Approach**:
  - Create custom `ILinkProvider` for xterm that regex-matches file paths (absolute and relative to project root)
  - Also match `file:line` and `file:line:col` patterns (error stacks)
  - On click, dispatch event to open file in FileViewer at the specified line
  - Register provider via `term.registerLinkProvider()`
  - Match common patterns: `src/foo/bar.ts`, `./foo.ts`, `/absolute/path.ts`, `foo.ts:42`, `foo.ts:42:10`

### 2C. Wire `CompletionOverlay` to Terminal
- **Problem**: Component exists but not connected to TerminalInstance
- **Scope**: Show completion suggestions from shell history when user types
- **Files**: `src/renderer/components/Terminal/TerminalInstance.tsx`, `src/renderer/components/Terminal/CompletionOverlay.tsx`
- **Approach**:
  - Track current input line in TerminalInstance
  - On input change, fuzzy-match against shell history (already loaded via `shellHistory:read`)
  - Show CompletionOverlay positioned at cursor
  - Tab to accept, Escape to dismiss
  - Filter to top 5-8 matches

### 2D. Add `electron-updater` for Auto-Updates
- **Problem**: Auto-update silently no-ops because electron-updater not in dependencies
- **Scope**: Add dependency, configure update checking
- **Files**: `package.json`, `src/main/main.ts` or `src/main/updater.ts` (new)
- **Approach**:
  - `npm install electron-updater`
  - Create `updater.ts` that checks for updates on app start and periodically
  - Wire existing `updater:check` / `updater:install` IPC handlers to real updater
  - Show update-available notification in status bar

---

## Wave 3 — Differentiating Features (Agent-First Value)

### 3A. Pre-Execution Approval UI
- **Problem**: `pre_tool_use` hook events are observed passively. No way to approve/reject before execution
- **Scope**: Interactive approval dialog when Claude Code wants to perform destructive operations
- **Files**: `src/renderer/components/AgentMonitor/ApprovalDialog.tsx` (new), `src/main/hooks.ts`, `src/renderer/contexts/AgentEventsContext.tsx`
- **Approach**:
  - Extend hooks server to support bidirectional communication (response channel)
  - On `pre_tool_use` event for Write/Bash tools, show modal with:
    - Tool name and arguments
    - Diff preview for file writes
    - Approve / Reject / Edit buttons
  - Configurable: which tools require approval (default: Write, Bash with destructive commands)
  - Timeout with auto-approve option for non-destructive tools
  - This is the biggest architectural addition — needs careful design of the response protocol

### 3B. MCP Server Manager UI
- **Problem**: MCP server configuration requires manual JSON editing
- **Scope**: GUI for managing MCP servers in Claude Code's config
- **Files**: `src/renderer/components/Settings/McpSection.tsx` (new), `src/main/ipc-handlers/mcp.ts` (new)
- **Approach**:
  - Read/write `~/.claude/settings.json` and project `.claude/settings.json`
  - List installed MCP servers with status indicators
  - Add/edit/remove server configurations (command, args, env)
  - Show available tools per server (parse from server manifest or runtime query)
  - Toggle enable/disable per server
  - Add as new Settings section

### 3C. CLAUDE.md Editor with Intelligence
- **Problem**: CLAUDE.md is the most important file for Claude Code but has no special handling
- **Scope**: Dedicated editor mode with structure awareness and helpers
- **Files**: `src/renderer/components/FileViewer/ClaudeMdEditor.tsx` (new)
- **Approach**:
  - Detect when CLAUDE.md is opened, offer enhanced editor mode
  - Section navigation sidebar (Key Files, Conventions, Commands, etc.)
  - Token count estimate display (helps users manage context budget)
  - Templates for common sections (insertable snippets)
  - Validation: warn on broken file paths, duplicate sections
  - Auto-generate Key Files section from codebase analysis

### 3D. File Change Heat Map
- **Problem**: No visual indicator of which files the agent touches most
- **Scope**: Color overlay on file tree nodes based on edit frequency
- **Files**: `src/renderer/components/FileTree/FileTree.tsx`, `src/renderer/hooks/useFileHeatMap.ts` (new)
- **Approach**:
  - Track file edit events from agent sessions (already in AgentEventsContext)
  - Compute heat score per file (edits in last N minutes, weighted by recency)
  - Apply background color gradient to file tree items (cool blue → warm orange → hot red)
  - Toggle on/off in file tree header
  - Reset per session or accumulate across sessions (user preference)

---

## Wave 4 — Analytics & Intelligence

### 4A. Agent Performance Analytics Dashboard
- **Problem**: Cost is tracked but session quality/efficiency is not
- **Scope**: Analytics panel showing agent behavior patterns
- **Files**: `src/renderer/components/Analytics/AnalyticsDashboard.tsx` (new), `src/renderer/hooks/useSessionAnalytics.ts` (new)
- **Approach**:
  - Parse hook events from AgentEventsContext for:
    - Token efficiency (tokens per file edit)
    - Retry rate (same file edited multiple times in one session)
    - Tool distribution (pie chart: Read/Write/Bash/Search/etc.)
    - Error patterns (failed tool calls, common error types)
    - Session duration distribution
  - Compare sessions: prompt A vs prompt B efficiency
  - Trend charts: are sessions getting more efficient over time?
  - Add as a tab in the right sidebar or as a modal

### 4B. Smart Context Builder
- **Problem**: Claude Code wastes tokens orienting in new projects
- **Scope**: Auto-generate project context for Claude Code sessions
- **Files**: `src/renderer/components/ContextBuilder/ContextBuilder.tsx` (new), `src/main/ipc-handlers/context.ts` (new)
- **Approach**:
  - Scan project: package.json, language files, framework markers, entry points
  - Pull from codebase-memory graph if available (1.4K nodes already indexed)
  - Generate structured context: tech stack, key files, conventions, architecture
  - Present in editable panel before launching Claude Code session
  - Option to inject as system prompt or auto-generate/update CLAUDE.md
  - Save generated contexts per project for reuse

### 4C. Workspace Time-Travel
- **Problem**: `useDiffSnapshots` captures git state at session boundaries but no UI to navigate/restore
- **Scope**: Timeline UI for browsing workspace states across sessions
- **Files**: `src/renderer/components/TimeTravel/TimeTravelPanel.tsx` (new), `src/renderer/hooks/useDiffSnapshots.ts` (enhance)
- **Approach**:
  - Persist snapshots to config (commit hash + session ID + timestamp)
  - Timeline UI showing sessions as segments with snapshot points
  - Click any snapshot to view full diff from that point to current
  - "Restore to this point" button (git stash + git checkout)
  - Compare any two snapshots side-by-side
  - Warning before destructive restore operations

---

## Wave 5 — Vision Features (Long-term)

### 5A. IDE-Native Tool Channel (Reverse Pipe)
- The big vision feature: Claude Code queries the IDE for context
- Needs protocol design, security model, tool registration
- Deferred until Waves 1-4 are solid

### 5B. Command Blocks (Warp-style)
- Parse terminal output into discrete command+output units
- Needs custom xterm parser layer
- Significant terminal architecture change

### 5C. Rich Multi-line Input
- Replace terminal prompt with CodeMirror-based input
- Syntax highlighting, multi-line editing at the prompt
- Depends on command block architecture

### 5D. Extension Activation Events
- Wire IDE lifecycle events to extension activation
- Lower priority until extension ecosystem grows

---

## Execution Notes

- Each wave is a batch of independent features that can be built in parallel
- Wave N+1 may depend on Wave N completion (especially Wave 2 depends on Wave 1 fixes)
- Each feature should be built, tested, and committed independently
- Use spawned agents for parallelism within each wave
- Human review between waves
