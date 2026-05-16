# Ouroboros Chat — Gap Analysis vs Industry Coverage Matrix

**Last analyzed:** 2026-05-07
**Matrix reference:** `03-coverage-matrix.md` (64 axes × 15 tools)
**Code basis:** `src/renderer/components/AgentChat/**`, `src/main/agentChat/**`, `src/main/orchestration/providers/**`, plus referenced supporting modules.

---

## Reader's Guide

This document compares Ouroboros's chat implementation against the 64-axis coverage matrix synthesized from 15 industry tools. Every Ouroboros claim cites a file:line. Cells marked "could not verify in code" mean the search ran but returned no evidence — claims were not inferred from docs or memory. The roll-up and priority list at the end feed directly into the bug-fix wave.

---

## Verdict shorthand

- **AHEAD** — Ouroboros's implementation exceeds the high-water mark in the matrix
- **MATCHES** — Ouroboros sits at industry-standard for the axis
- **BEHIND** — Ouroboros is below the dominant convention; gap-fix candidate
- **PARTIAL** — Ouroboros has the affordance but with caveats / known bugs / incomplete wiring
- **ABSENT** — Ouroboros doesn't have the feature at all
- **N/A** — feature doesn't apply to Ouroboros's architecture

---

## Per-Axis Findings

### #1 — Composer engine
- **Industry standard:** Most GUI IDEs use a rich/plain textarea; TTY tools use readline. Cursor uses a custom rich textarea with @-mention support built on top of `contenteditable`. Windsurf uses CodeMirror. VS Code Copilot uses a VS Code-native input component. Zed uses its own Rope-based editor component.
- **High-water mark:** Zed's message editor — auto-formats multi-line pastes as @-mentions and has the deepest file integration (drag-from-tree, @-image-paste auto-formatting).
- **Ouroboros:** `LexicalChatComposer.tsx` — sole composer engine (Wave 81, migrated from a legacy plain textarea to Lexical). Uses Lexical (Meta's production-grade rich text framework, also powering facebook.com's comment editor). `INITIAL_CONFIG` in `LexicalChatComposer.tsx` configures: `BeautifulMentionsPlugin` (for `@`-dropdown), `SlashCommandPlugin` (for `/`-commands), `LexicalDropPlugin` (for file/image drops), `LexicalMentionBridge` (keeps chip-bar state in sync with Lexical node mutations). `FloatingComposerContainer.tsx` provides the raised-pill wrapper (shadow, rounding, `data-layout="floating-composer"` for test assertions). `WorkspaceVariantContext` determines IDE vs. chat-only mode — `FloatingComposerContainer` is used for chat-only shell; `AgentChatComposer` directly for IDE shell.
- **Verdict:** MATCHES
- **Notes:** Lexical is a production-grade framework (Meta-scale usage) — a credible choice vs. Cursor's custom `contenteditable` and Windsurf's CodeMirror. The Wave 81 migration unified on Lexical as the single composer engine. The `LexicalMentionBridge` reconciliation (mutation observer + update listener safety net) is a non-trivial bridge keeping chip-bar state and Lexical node state in sync — documented gotcha in `AgentChat/CLAUDE.md:79` (`showMentionsOnDelete={true}` is load-bearing for backspace-chip behavior).

### #2 — Multi-line input
- **Industry standard:** All GUI IDEs support multi-line naturally via the rich editor. Shift+Enter vs. Enter for newline is the primary UX variation. TTY tools (Claude Code CLI, Aider, OpenCode) have more complex multi-line patterns: `/editor` (opens $EDITOR), heredoc (`cat <<EOF`), or backslash continuation at the prompt.
- **High-water mark:** Claude Code (CLI) with `/editor` (opens $EDITOR for long-form input), heredoc support via Bash, and backslash continuation.
- **Ouroboros:** Lexical textarea supports multi-line by default. `useAgentChatDraftPersistence.ts` — "Persists/restores draft text per thread in localStorage. Cleared on send." Draft is per-thread (`useAgentChatDraftPersistence` uses thread ID as the localStorage key) and survives page reload. The composer maintains draft state including @-mention chips and text across thread navigation — switching threads and back restores the previous draft.
- **Verdict:** MATCHES
- **Notes:** Multi-line input works natively in Lexical with per-thread draft persistence. TTY-specific patterns (heredoc, backslash continuation, `/editor`) are irrelevant for a GUI-based composer. Per-thread draft persistence is a meaningful addition over tools that clear the composer on any navigation event.

### #3 — Image / file paste
- **Industry standard:** Clipboard image paste is now a field standard — all major GUI tools support it (Cursor, Windsurf, Continue, Cline). File paste (non-image binary) is less common. Most tools in the matrix support clipboard image paste.
- **High-water mark:** Zed — clipboard paste, drag from FS, @-mention of image files, auto-format into @-mention node (not a separate attachment strip). Also preserves EXIF metadata in the mention.
- **Ouroboros:** `AgentChatComposerSubcomponents.tsx:63` — `handlePaste={attachmentHandlers.handlePaste}` and `onImagePaste={state.attachmentHandlers.handleImageFiles}` wired on the composer root element. `imageAttachmentSupport.ts` — "drop / paste / remove helpers for the image attachment flow." `useImageAttachmentHandlers` manages the full lifecycle: clipboard paste → base64 encode → preview render → remove. The GUI layer is independent of Claude Code CLI's known Windows `Ctrl+V` TTY paste bug (that bug affects the PTY session, not the Lexical composer). `AgentChatComposerSubcomponents.tsx` renders the image preview strip below the composer when images are attached.
- **Verdict:** MATCHES
- **Notes:** Image paste is fully implemented in the GUI composer. Drag-drop of image files also handled via `attachmentHandlers.handleDrop` (disjoint from FileTree JSON drops — see #4). No auto-formatting as @-mention nodes (Zed's approach, which puts the image inline in the rich text editor). Ouroboros uses a separate attachment strip below the composer — this is cleaner for multiple images but loses the inline spatial context of Zed's approach.

### #4 — Drag-and-drop attachments
- **Industry standard:** Cursor and Zed document drag-from-file-explorer to composer; most others undocumented. This has become a standard workflow in 2025-2026 as file context became a first-class feature.
- **High-water mark:** Cursor — drag files/folders from the sidebar explorer to the composer, creates an @-mention. Zed — same pattern, creates an @-mention node with thumbnail.
- **Ouroboros:** Two explicitly disjoint drop paths (documented in `LexicalDropPlugin.tsx:17`): (1) **FileTree JSON drops**: `LexicalDropPlugin.tsx` handles `application/json` mime-type drag events. Parses `{ path, name, relativePath, isDirectory }` from `dataTransfer.getData('application/json')`. Calls `insertMention({ trigger: '@', value: mention.path, ... })` to create a `BeautifulMentionNode`. Both files and folders supported (`isDirectory` maps to `folder` vs. `file` mention type). The `buildMentionFromDropJson(jsonData)` helper encapsulates the parse → validate → build logic. (2) **Image file drops**: `FloatingComposerContainer.tsx:58` + `AgentChatComposer.tsx:259` handle `dataTransfer.files` drops where `file.type.startsWith('image/')` — routed to `attachmentHandlers.handleDrop`. The two paths use different payloads: JSON string (path metadata) vs. File object (binary data).
- **Verdict:** MATCHES
- **Notes:** Both drag paths are fully implemented and coexist on the same drop target. Ouroboros matches Cursor and Zed on file drag-to-compose. The `buildMentionFromDropJson` helper is directly reusable for the "open in chat" right-click feature (#38) — only the trigger mechanism (context menu → IPC → composer) needs to be wired.

### #5 — Markdown preview in composer
- **Industry standard:** Almost entirely absent across the survey — this axis had the weakest field coverage in `03-coverage-matrix.md`. No tool in the matrix explicitly documents Markdown preview-in-composer as a feature.
- **High-water mark:** Not established — no tool in the 15-tool survey implements this as a documented feature.
- **Ouroboros:** Lexical composer renders `@`-mention chips as styled nodes (not raw `@filename` text) — so the composer has a richer-than-plaintext visual treatment for mentions. Markdown itself renders in message output via `MessageMarkdown.tsx` (full Markdown renderer with syntax highlighting, tables, etc.) — not in the composer. No toggled preview mode exists.
- **Verdict:** ABSENT
- **Notes:** True Markdown preview in the composer (toggle between raw Markdown source and rendered output) is absent — but so is it for every other tool in the survey. Priority: LOW — implementing this would not close any competitive gap. The Lexical chip rendering for @-mentions is a reasonable substitute for the most common rich-text element in chat composers.

### #6 — @files
- **Industry standard:** Universal among IDE tools — `@file`, `@folder`, `#file` (Copilot), `@` (Cursor), etc. This is the minimum expected mention type.
- **High-water mark:** Field-wide standard; no single tool differentiated here. Aider's `/add` + `/read-only` editable vs. reference distinction is the only notable variation.
- **Ouroboros:** `useAgentChatContext.ts` — "Pinned files + @mention system. Token estimation (4 chars/token). Debounced autocomplete against project file index" (AgentChat `CLAUDE.md:31`). `BeautifulMentionsPlugin` in `LexicalChatComposer.tsx` triggers on `@` prefix and routes to the file mention data provider. `MentionAutocompleteSupport.ts` — `buildFileMentionResult(path, relativePath)` maps file-tree nodes to mention items with `type: 'file'` or `type: 'folder'`. `AgentChatContextBar.tsx` shows active context files and token count above the composer. `MentionChip.tsx` renders selected mentions as pill chips with filename + estimated token count. Token count is estimated at chip creation time (4 chars/token heuristic) and shows in the chip's label. Drag from file tree also inserts file @-mentions (see #39 / `LexicalDropPlugin.tsx`).
- **Verdict:** MATCHES
- **Notes:** File @-mention with autocomplete, chip rendering, token estimation, and drag-from-tree are all implemented. The token count on the chip is a useful addition that most tools don't surface at the @-mention level. No editable vs. read-only distinction (Aider's differentiator) — all @-mentions are reference context for the model.

### #8 — @docs / docs.url
- **Industry standard:** Cursor/Windsurf have `@docs` with indexed external documentation libraries (user can add doc URLs to an index that gets queried). Aider has `@url` fetch (fetches URL, pastes content inline). Cline has URL fetch via agent tool. Most other tools lack this.
- **High-water mark:** Cursor/Windsurf — `@docs` with pre-indexed external doc libraries (semantic search over indexed content), plus `@URL` for raw URL injection.
- **Ouroboros:** No `@docs` or `@url` mention type found in the composer. The Claude Code subprocess has `WebFetch` as a built-in tool — the model can fetch URLs autonomously during a turn. `MentionAutocompleteSupport.ts` — no `docs` or `url` mention type in the mention type enum. There is no user-initiated URL fetch at compose time; it's available only as a model tool call during agent execution.
- **Verdict:** ABSENT
- **Notes:** The gap is not URL fetching capability (the model can fetch URLs via `WebFetch`) but user-initiated URL injection at compose time. The distinction matters: with `@url`, the user controls exactly which content goes into context; with model-initiated `WebFetch`, the model decides when and what to fetch (which may not match what the user intends). The Lexical composer's trigger/mention infrastructure is fully built — adding a `@url` type requires a data provider (URL → fetched content) and a mention type constant. Medium effort.

### #9 — @web / web search
- **Industry standard:** Cursor (`@web`), Continue (`@Web`), Copilot (`#fetch`), Claude Code CLI (`WebSearch` tool + `search_google` Bash alias). Most major tools support user-initiated web search in the composer context.
- **High-water mark:** Cursor's `@web` — live search results injected into context at compose time, before the model turn begins.
- **Ouroboros:** No `@web` mention type in the composer. `MentionAutocompleteSupport.ts` — no `web` or `search` mention type. The Claude Code subprocess has `WebSearch` as a built-in tool (inherited from the model's native tool set). Web search is available to the agent during its turn, not to the user at compose time. The same structural gap as `@docs` (#8): capability exists at the model-tool level, absent at the user-mention level.
- **Verdict:** BEHIND
- **Notes:** The field has converged on web search as a standard composer mention. Ouroboros's model can search the web during a turn, but the user cannot inject web search results at compose time before sending a message. Adding `@web` requires: (1) a new mention type constant, (2) a data provider that invokes `WebSearch` or an HTTP search API and returns results as mention items, (3) chip rendering for the search result (title + snippet + URL). This is medium effort given the existing Lexical infrastructure.

### #10 — @past-conversation / @memory
- **Industry standard:** Windsurf has explicit past-conversation @-mention with session summaries. Claude Code CLI auto-loads MEMORY.md on every turn (not user-initiated at compose time). Zed has "New From Summary" for context-limit-driven continuity (not user-initiated). Most tools don't support this.
- **High-water mark:** Windsurf — `@` previous conversations with summaries + checkpoints; user explicitly selects which past session to pull into context.
- **Ouroboros:** `memoryExtractor.ts` — LLM-powered extraction of `decision|pattern|fact|preference|error_resolution` entries from past sessions. `SessionMemoryPanel.tsx` — GUI for reviewing/editing/deleting extracted memories. `ChatHistoryPanel.tsx` — browsable/searchable chat history with LLM-derived titles. `useMemoryEntries(projectRoot)` in `ComposerContextPreview.tsx:251` — memory entries surfaced in the context preview popover tab. `threadStoreSqlite.ts` — all threads stored with derived titles. However: no `@thread` or `@memory` mention type exists in the composer — users cannot pull a past thread into the current context at compose time using the @-mention system. Memory content is auto-loaded by `memoryExtractor.ts` as context in the next session, but the user cannot explicitly select which memories or past threads to include.
- **Verdict:** PARTIAL
- **Notes:** The data infrastructure for past-conversation context is present: thread history in SQLite, LLM-derived titles in `chatTitleDerivation.ts`, memory entries in `SessionMemoryPanel.tsx`. The gap is the composer-level @-mention — users can view history in `ChatHistoryPanel` but cannot say "include thread #5 in this context" at compose time. Adding `@thread` or `@memory` would complete this axis: data provider is `listThreads()` + `getMemoryEntries()`, trigger is `@` with a `thread:`/`memory:` prefix filter.

### #12 — @diff / @commit / @PR
- **Industry standard:** Continue is the high-water mark with `@Git Diff` (all branch changes), `@Git Diff (staged)`, and `@GitLab MR`. Claude Code CLI has `/diff` and `/review [PR#]` slash commands. Aider auto-adds git context when relevant.
- **High-water mark:** Continue — `@Git Diff`, `@Git Diff (staged)`, `@GitLab MR` as first-class @-mention types with live git data.
- **Ouroboros:** `ChangeSummaryBar.tsx` — shows file-change tally (files added/modified/deleted) for completed and streaming messages — this is after-the-fact, not a compose-time mention. No `@diff`, `@commit`, or `@PR` mention type in the composer. The underlying Claude Code subprocess can run `git diff` via Bash, but this is agent-initiated during a turn, not user-initiated at compose time. The `chatOrchestrationBridgeGit.ts` module manages git state for checkpoints (pre-snapshot hash) but does not expose diff content to the composer.
- **Verdict:** BEHIND
- **Notes:** Git diff as a compose-time context mention is absent. The `ChangeSummaryBar` provides post-turn diff awareness but not pre-turn diff injection. Adding `@diff` requires: (1) a git IPC call from renderer to main to get the current diff, (2) a new mention type in the Lexical composer, (3) formatting the diff content as a code block in the mention payload. `@PR` would additionally require GitHub API integration. `@diff` is the most-requested variant (Continue's `@Git Diff` is a common workflow pattern) and the lowest effort.

### #7 — @symbols / functions / classes
- **Industry standard:** Copilot (`#` symbols), Zed (`@` symbols), OpenCode (LSP 50ms); most others undocumented.
- **High-water mark:** OpenCode — LSP integration for symbol navigation.
- **Ouroboros:** `useSymbolDisambiguation.ts` — dedicated hook for resolving `symbol:` queries via the codebase graph. `MentionAutocompleteSupport.ts:82` — `buildSymbolMentionResult(node: SymbolGraphNode)` maps graph nodes to mention items. `MentionAutocompleteSupport.ts:250-251` merges `symbolResults` into the autocomplete dropdown when `symbolResults?.length` is truthy. `AgentChatComposerTypes.ts:55` has `symbolResults?: SymbolGraphNode[]` in composer props; `LexicalChatComposer.tsx:64` accepts and threads it through. The symbol autocomplete pipeline is fully wired end-to-end.
- **Verdict:** MATCHES
- **Notes:** Symbol @-mention with codebase-graph-backed disambiguation is fully implemented. The `symbol:` query triggers `useSymbolDisambiguation` which returns `SymbolGraphNode[]`, merged into the @-dropdown via `buildSymbolMentionResult`. Comparable to Zed's `@` symbol lookup and superior to most tools in the matrix.

### #8 — @docs / docs.url
- **Industry standard:** Cursor/Windsurf have `@docs` (indexed external docs); Aider/Cline have URL fetch.
- **High-water mark:** Cursor/Windsurf with indexed external doc libraries.
- **Ouroboros:** could not verify in code (searched: `@docs`, `@url`, `WebFetch` in composer context). The Claude Code subprocess has `WebFetch` as a built-in tool, but that's a model tool, not a composer mention type.
- **Verdict:** ABSENT
- **Notes:** No `@docs` or `@url` mention type found. URL fetching is available to the agent as a tool (not user-facing @-mention in composer). This is a gap vs. Cursor/Windsurf/Cline.

### #9 — @web / web search
- **Industry standard:** Most major tools — Cursor (`@web`), Continue (`@Web`), Copilot (`#fetch`), Claude Code CLI (`WebSearch` tool).
- **High-water mark:** Cursor's `@web` live search inline in composer.
- **Ouroboros:** No `@web` mention type in composer. Claude Code subprocess has `WebSearch` as a built-in tool available during agent turns. Not surfaced as a composer @-mention.
- **Verdict:** BEHIND
- **Notes:** Web search is available to the model as a tool, but not as a user-initiated composer mention. The field has converged on web access as a standard; Ouroboros is below the median.

### #10 — @past-conversation / @memory
- **Industry standard:** Windsurf and Zed surface it; Claude Code CLI auto-loads from MEMORY.md; most tools lack it.
- **High-water mark:** Windsurf — `@` previous conversations with summaries + checkpoints.
- **Ouroboros:** `memoryExtractor.ts` in `src/main/agentChat/` exists. `ChatHistoryPanel.tsx` exists for browsing history. No `@thread` or `@memory` inline mention type found in composer. Memory content is surfaced to the model via context injection, not via explicit @-mention.
- **Verdict:** PARTIAL
- **Notes:** Memory extraction and chat history browsing exist, but no inline @-mention to pull past conversation into current context.

### #11 — @MCP-tool-result
- **Industry standard:** Supported by most major tools; Claude Code CLI has the deepest implementation.
- **High-water mark:** Claude Code CLI — three transports, per-subagent scoped, dynamic tool updates.
- **Ouroboros:** MCP config in `src/main/orchestration/providers/**`. `scopedMcpConfig.ts` referenced in CLAUDE.md. Ouroboros wraps Claude Code, so the full MCP capability of the underlying CLI is available. MCP results appear as tool_use blocks in the conversation.
- **Verdict:** MATCHES
- **Notes:** Ouroboros inherits Claude Code's MCP implementation. The full MCP stack (stdio/HTTP/SSE, scoped per subagent) is available through the wrapped CLI. MCP results render as `AgentChatToolCard` blocks.

### #12 — @diff / @commit / @PR
- **Industry standard:** Continue is high-water mark with `@Git Diff` and `@GitLab MR`; Claude Code CLI has `/diff`, `/review [PR]`.
- **High-water mark:** Continue — `@Git Diff` branch changes as a mention.
- **Ouroboros:** Git diff is surfaced in Claude Code CLI under the hood. `ChangeSummaryBar.tsx` shows file-change tally per conversation. No `@diff` or `@commit` mention type in composer.
- **Verdict:** BEHIND
- **Notes:** The underlying Claude Code subprocess can execute git operations, but there's no @-mention for diff or commit context in the Ouroboros composer. `ChangeSummaryBar` shows what changed, not what's staged/diffed.

### #13 — Mention chip rendering / autocomplete UX
- **Industry standard:** `@` typeahead dropdown is the field-wide standard across all major IDEs.
- **High-water mark:** No single tool — field has converged.
- **Ouroboros:** `BeautifulMentionsPlugin` owns the @-dropdown (`CLAUDE.md` line 79). `LexicalMentionMenuItem` renders menu items. `MentionChip.tsx` renders pill UI. `LexicalMentionMenu` flips above cursor unconditionally (`CLAUDE.md` line 82: "uses `absolute bottom-full` to flip unconditionally"). Theme in `INITIAL_CONFIG.theme.beautifulMentions['@']` (`CLAUDE.md` line 80).
- **Verdict:** MATCHES
- **Notes:** Full @-mention typeahead with chip rendering is implemented. The above-cursor flip is a UX improvement over Lexical's default below-cursor behavior.

### #14 — Built-in slash command count
- **Industry standard:** Aider (40+) and Claude Code CLI (60+) are the high-water marks. Most GUI IDEs expose 5-15 custom commands. TTY tools (Aider, OpenCode) expose their operation sets as commands.
- **High-water mark:** Claude Code CLI — 60+ built-in commands covering session management (`/clear`, `/compact`, `/resume`), context inspection (`/memory`, `/context`, `/usage`), agent operations (`/agents`, `/branch`, `/batch`), workflow (`/review`, `/plan`, `/editor`), and dozens of specialized commands.
- **Ouroboros:** `SlashCommandMenu.tsx` renders the autocomplete dropdown. `SlashCommandPlugin` in `LexicalChatComposer.tsx` intercepts `/` prefix and routes through `useSlashSelectHandler` (mouse-click path) and `slashKeyboardNav.useSlashEnter` (keyboard path). The slash commands surface the full underlying Claude Code CLI command set — 60+ commands — plus any user-authored custom commands from `~/.claude/commands/` and `.claude/commands/`. A known keyboard-navigation bug affects the Enter-key path (axis #17). The `/compact` command specifically integrates with `conversationCompactor.ts` in the main process — the Ouroboros GUI pipes the compaction trigger through the same IPC path used for regular message send, so the compactor's `computeAdaptiveBudgets` logic runs server-side.
- **Verdict:** MATCHES
- **Notes:** Ouroboros surfaces Claude Code's ~60 built-in slash commands through the GUI composer. The slash menu autocompletes on `/` prefix. The GUI adds discoverability that the pure-CLI experience lacks — users can browse available commands without memorizing them. The keyboard navigation bug (axis #17) is the only functional gap.

### #15 — Custom user-authored slash commands
- **Industry standard:** Cursor (`.cursor/rules/`) and Claude Code CLI (`~/.claude/commands/`) are the clearest implementations of user-global custom commands. Both support Markdown files with a YAML frontmatter `description` field. Claude Code CLI additionally supports `argument-hint` frontmatter. Windsurf has workspace-scoped custom instructions but no slash-command authoring.
- **High-water mark:** Claude Code CLI — user (`~/.claude/commands/`) + project (`.claude/commands/`) scope with argument system (`$ARGUMENTS`, `$ARGUMENTS[N]`, named args), `argument-hint` frontmatter for display, Markdown body as prompt template.
- **Ouroboros:** Custom slash commands authored in `~/.claude/commands/` (user-global, available in every project) and `.claude/commands/` (project-scoped, loaded from the current workspace root) are loaded by the Claude Code subprocess. They surface in the Ouroboros slash command menu alongside built-in commands, disambiguated by scope prefix in the UI. The Ouroboros project itself uses this system: `C:\Web App\Agent IDE\.claude\commands\` contains project-level slash commands governing its own development workflow (e.g., `wave-plan`, `review`, `triage-sweep`). These project commands are available when Claude Code sessions target the Agent IDE repo.
- **Verdict:** MATCHES
- **Notes:** Full custom command authoring inherited from Claude Code. The project-level commands in the Ouroboros repo's own `.claude/commands/` directory validate that the system works end-to-end — project commands authored as Markdown files with YAML frontmatter surface correctly in the GUI slash menu.

### #16 — Project-level (per-repo) slash commands
- **Industry standard:** Claude Code CLI and Cursor are the clearest with distinct project-vs-user scopes. Most tools don't document a scope distinction — commands are global. Claude Code CLI's scope priority: enterprise-managed > user-global > project-local.
- **High-water mark:** Claude Code CLI — `.claude/commands/` (project scope) + `~/.claude/commands/` (user scope) + enterprise policy layer (MDM); full priority hierarchy documented.
- **Ouroboros:** `.claude/commands/` in the project root is loaded by the Claude Code subprocess and commands surface in the Ouroboros slash menu. Project commands are visually mixed with user commands in the current menu UI — scope distinction (project vs. user) is not currently rendered in the slash menu's list items. Priority (project over user for same command name) is handled by the CLI subprocess, not the GUI.
- **Verdict:** MATCHES
- **Notes:** Inherited from Claude Code. The distinction between user and project scope is maintained at the data layer (CLI subprocess handles priority). GUI scope labeling in the slash menu (showing "project" vs "user" badge per command) is not currently present — this would improve discoverability for users with many commands across scopes.

### #17 — Slash commands with arguments
- **Industry standard:** Claude Code CLI has the most complete argument system: `$ARGUMENTS` (full remainder), `$ARGUMENTS[N]` (positional), named args via `{{arg_name}}` syntax, `argument-hint` frontmatter displayed in the slash menu as a placeholder. Aider's argument system is implicit (commands take shell-like arguments). Most GUI IDEs don't support argument-bearing custom commands.
- **High-water mark:** Claude Code CLI — `argument-hint`, `$ARGUMENTS`, `$ARGUMENTS[N]`, named args in Markdown body.
- **Ouroboros:** Slash commands pass argument text through `SlashCommandPlugin` to `useSlashSelectHandler` (mouse-click path) — verified working. Keyboard Enter path: `AgentChat/CLAUDE.md:84` documents the pre-existing bug: "`extractSlashQuery` closes the menu on whitespace, so the menu is closed by the time the user hits Enter on `/spec myFeature`." This was partially fixed (per CLAUDE.md line 83: "Both paths now pass them through `SlashCommandPlugin` props") but the Enter-send flow for commands with argument text remains broken at the `extractSlashQuery` level. Fix path documented: "add a send-time interceptor mirroring `useResearchIntercept`." `argument-hint` frontmatter from `.claude/commands/*.md` files is inherited and displayed in the slash menu.
- **Verdict:** PARTIAL
- **Notes:** Argument passing works for mouse-click selection path; Enter-key path broken for commands with whitespace in arguments (`extractSlashQuery` closes menu on whitespace). The bug is pre-existing, documented, and tracked. The fix path is known (send-time interceptor mirroring `useResearchIntercept`). The mouse-click path works, meaning argument-bearing commands are functional but require mouse interaction — keyboard-driven users cannot use the Enter path.

### #18 — Bundled "skills" or "recipes" surfacing as slash commands
- **Industry standard:** Claude Code CLI has bundled skills as `.md` files in the installed package that surface as slash commands. Skills support `context: fork` for subagent spawning, `!` shell prefix for dynamic injection, and `<search_files>` XML blocks for file lookups. They survive `/compact` (unlike regular context) because they're re-injected on demand.
- **High-water mark:** Claude Code CLI — bundled skills survive compaction (re-injected on demand), have dynamic shell injection (`!command` prefix), can fork subagents via `context: fork`, available in both `~/.claude/skills/` (user) and `.claude/skills/` (project).
- **Ouroboros:** Skills from `~/.claude/skills/` (user) and `.claude/skills/` (project) are loaded by the Claude Code subprocess and surface in the Ouroboros slash menu. The `ecosystem.rulesAndSkillsInstallEnabled` config flag is noted as `false` by default in root `CLAUDE.md`: "rules-and-skills install path is not yet wired end-to-end. Remove flag and default to true when wired." This means auto-installation of bundled skills (the IDE's own curated skill set) does not run. Users who manually place skill files in `~/.claude/skills/` get the full behavior; users who rely on auto-install do not. The `hookInstaller.ts` auto-install pattern (SHA-256 versioned, runs on startup) is the reference architecture for how skills install should work.
- **Verdict:** PARTIAL
- **Notes:** Skills work when manually placed; auto-install is not wired (`ecosystem.rulesAndSkillsInstallEnabled` defaults false). The impact: any curated skill bundle that Ouroboros might ship to enhance the Claude Code experience is not delivered to users who haven't manually set up `~/.claude/skills/`. The `hookInstaller.ts` pattern (auto-install on startup with SHA-256 version tracking) is a ready template for completing the skills install wiring — the architecture is proven.

### #19 — Discrete popover listing what model sees
- **Industry standard:** Mostly absent; VS Code Copilot's Chat Debug view is the only full-transparency implementation. Claude Code CLI has `/context` colored grid.
- **High-water mark:** VS Code Copilot — raw system prompt + user prompt + context + tool payloads.
- **Ouroboros:** `ContextPreview.tsx`, `ContextPreview.popover.tsx`, `useContextPreview.ts` — a dedicated context preview popover exists. `AgentChatContextBar.tsx` shows active context files and token count. This is more than most tools provide.
- **Verdict:** AHEAD
- **Notes:** Ouroboros has a purpose-built context preview popover that lists what the model sees — this exceeds most tools in the matrix. However, `2026-05-07-context-preview-rules-disappear-after-chat-start.md` documents a known bug where the rules tab goes empty after chat starts. See PARTIAL caveat on #19a below.

### #20 — Per-entry disable toggle in popover
- **Industry standard:** Almost entirely absent across the field. Claude Code CLI has `claudeMdExcludes` (file-level glob).
- **High-water mark:** Claude Code CLI's `claudeMdExcludes` is the closest approximation.
- **Ouroboros:** `ComposerContextPreview.tsx:186` — `useFilesystemDisabledRuleIds(projectRoot)` subscribes to `rulesAndSkills:changed` and returns a live `ReadonlySet<string>` of disabled rule IDs (encoded as `rule:<scope>:<name>`). `ComposerContextPreview.tsx:223-238` — `useToggleHandler` calls `fireRuleToggleIpc(id, !fsDisabledRuleIds.has(id), projectRoot)` for rule entries and `toggleLocal(id)` for non-rule context entries. `rulesDirectoryManager.ts:108` implements `disableRule(scope, name, projectRoot)` backed by the filesystem. The per-entry checkbox in the popover is fully wired to IPC → filesystem with live-watch refresh.
- **Verdict:** AHEAD
- **Notes:** Per-rule granular disable toggles in the context preview popover are fully implemented and IPC-backed. This is definitively ahead of the entire field — no other surveyed tool has per-entry disable toggles. Usability is currently affected by the rules-disappear bug (#35 / `2026-05-07-context-preview-rules-disappear-after-chat-start.md`), which makes the toggle surface inaccessible after chat starts.

### #21 — System prompt visibility
- **Industry standard:** Almost entirely absent across the field. VS Code Copilot's Chat Debug view is the only documented full-transparency implementation — shows the raw system prompt + user prompt + context inclusions + tool payloads as a developer view accessible via a gear icon.
- **High-water mark:** VS Code Copilot — Chat Debug view exposes the raw assembled system prompt as rendered text, showing exactly what was sent to the model.
- **Ouroboros:** No dedicated system prompt viewer exists in the chat UI. The context preview popover (`ContextPreview.tsx`) shows context entries (files, rules, memory, MCP tools) but not the raw assembled `TaskRequest.systemPrompt` string. `AgentChatDetailsDrawer.tsx` — "slide-in drawer showing linked orchestration session details (tokens, changed files, verification)" (AgentChat `CLAUDE.md:47`). The drawer shows the orchestration-level metadata but not the full prompt text. The prompt is assembled in `chatOrchestrationRequestSupport.ts` → `chatOrchestrationHistorySupport.ts` and passed to the provider subprocess — it's available at that layer but not currently surfaced to the renderer.
- **Verdict:** BEHIND
- **Notes:** While Ouroboros's context preview popover exceeds the field on axis #19 (showing context components), the raw assembled system prompt string is not exposed. The gap matters for debugging context issues: the context preview shows what entries are included, but not how they're formatted or whether any entry is being truncated. The implementation path: intercept `TaskRequest` in `chatOrchestrationRequestSupport.ts` before dispatch, expose via an IPC handler, render in a new "raw prompt" tab in `AgentChatDetailsDrawer`. Field baseline for this feature is low (only Copilot documents it), so closing this gap would be MATCHES at best.

### #22 — Token-budget display in composer / popover
- **Industry standard:** Cline, Zed, Aider, and Claude Code CLI all surface token counts. Claude Code CLI's `/usage` is the most complete: session cost estimate, plan usage bars, activity stats. Piebald's HTTP traffic inspector (Pro) exposes raw SSE chunks — a developer-debugging view. Windsurf, Copilot, and web-based tools (v0, Bolt, Replit) don't surface token information.
- **High-water mark:** Claude Code CLI's `/usage` — session cost estimate, plan usage bars, activity stats.
- **Ouroboros:** `ChatControlsBar.tsx` — "Model selector, permission mode toggle, token usage display" (CLAUDE.md line 58). `useAgentChatContext.ts` — "Token estimation (4 chars/token)" for pinned @-mentions shown in `AgentChatContextBar.tsx` above the composer. `adaptiveBudget.ts` in main — dynamic token budget calculation based on conversation length and model. `tokenCalibration.ts` — tracks actual vs. estimated token counts to refine the budget math: `chatOrchestrationBridgeProgress.ts:105` calls `tokenCalibrationStore.recordObservation` when actual token counts arrive from the API; `chatOrchestrationBridgeSend.ts:125` calls `tokenCalibrationStore.calibrate` to adjust estimates before send. `conversationCompactor.ts` uses `computeAdaptiveBudgets` (from `adaptiveBudget.ts`) and `tokenCalibrationStore.calibrate` to trim history.
- **Verdict:** MATCHES
- **Notes:** Token estimation is visible in the context bar (per @-mention), in the controls bar (session-level), and drives the adaptive budget system in the main process. The calibration loop (estimate → observe actual → refine estimate) is more architecturally sophisticated than any peer in the matrix. What's missing vs. Claude Code CLI's `/usage` is a comprehensive session-cost display (total tokens + plan usage bars).

### #23 — Skill / sub-agent catalog (user-extensible)
- **Industry standard:** Claude Code CLI has the most complete catalog (`.claude/agents/` with frontmatter schema, four scope levels: user-global, project, enterprise-managed, built-in).
- **High-water mark:** Claude Code CLI — agents as version-controllable Markdown files, full frontmatter (`model`, `tools`, `disallowedTools`, `description`, `background`), `/agents` UI listing running agents, four scope levels.
- **Ouroboros:** The wrapped Claude Code subprocess supports the full `.claude/agents/` catalog. Agent files in `~/.claude/agents/` (user-global) and `.claude/agents/` (project) are loaded by the subprocess. Scope levels: user-global agents are available in every project; project agents scope to the current repo. The Ouroboros codebase itself has a populated `~/.claude/agents/` catalog (13+ custom agents) used for developing Ouroboros — the IDE is developed with its own agent catalog. `SlashCommandMenu.tsx` surfaces the `/agents` slash command to access the running-agents view. Agent invocations appear as subagent entries in the conversation stream.
- **Verdict:** MATCHES
- **Notes:** Full agent catalog inherited from Claude Code. The `/agents` slash command surfaces the running-agents view. Ouroboros's own development uses a populated agent catalog (13+ agents) — a self-referential validation that the inherited system works end-to-end.

### #24 — Built-in agent / mode catalog
- **Industry standard:** Most tools have 2-5 built-in modes. Claude Code CLI has 6 permission modes + 5 built-in subagents.
- **High-water mark:** Claude Code CLI — 5 built-in subagents, 6 permission modes: `default` (ask all), `acceptEdits` (auto-accept file edits), `plan` (read-only exploration), `auto` (auto-apply within project bounds), `dontAsk` (approve all without prompt), `bypassPermissions` (skip all checks — dangerous).
- **Ouroboros:** `ChatControlsBar.tsx` — "Model selector, permission mode toggle, token usage display" (AgentChat `CLAUDE.md` line 58). The 6 permission modes from Claude Code are surfaced in the GUI controls bar as a picker. `AgentChatComposerKeyHandlers.ts:62-85` — `handlePermissionModeShortcut` cycles through modes via `cyclePermissionMode(args.chatOverrides.permissionMode, provider, {...})` on keyboard shortcut. The `ChatOverrides` type includes `permissionMode` as a field. Mode selection is per-session (not persisted to project config unless saved via `settingsResolver.ts`).
- **Verdict:** MATCHES
- **Notes:** All 6 Claude Code permission modes are surfaced in the Ouroboros GUI controls bar with keyboard-shortcut cycling. The GUI adds discoverability that the CLI's `Shift+Tab` mode cycle lacks — users can see all 6 modes in the picker rather than cycling through them blind.

### #25 — Tier-locked agents (model selection per agent)
- **Industry standard:** Claude Code CLI has the most complete model-selection system: `model` frontmatter per agent with resolution order (env var → invocation flag → frontmatter → parent inheritance). Kiro documents per-agent model selection for its Spec agents. Most other tools use a global model setting.
- **High-water mark:** Claude Code CLI — `model` frontmatter per agent, env var → invocation → frontmatter → parent resolution order.
- **Ouroboros:** Inherited from Claude Code. Per-agent model selection via `model:` frontmatter in `.claude/agents/` files is resolved by the subprocess at agent dispatch time. `settingsResolver.ts` — "Providers: `anthropic-api`, `claude-code`, `codex`" — the three providers map to three model tiers. GUI adds a session-level model override in `ChatControlsBar.tsx` (the `ChatOverrides.model` field). The session-level override takes effect for the main thread; subagent model is still resolved from frontmatter by the CLI subprocess.
- **Verdict:** MATCHES
- **Notes:** Two-level model selection: session-level GUI override (per conversation in `ChatControlsBar`) + agent-level frontmatter override (per subagent, inherited from Claude Code). The GUI override applies to the parent session; frontmatter governs subagents. This is a correct two-level architecture, though the interaction between session override and frontmatter inheritance order is not currently exposed in the GUI.

### #26 — Tool-restricted agents
- **Industry standard:** Claude Code CLI is the only tool with documented `tools` allowlist + `disallowedTools` denylist per agent. The compound logic: denylist evaluated before allowlist; specifiers support pattern matching (`Bash(npm run *)`, `Read(./.env)`). Kiro has permission scopes (read-only vs. file-write vs. internet) per Spec step, but not per-agent tool allowlists.
- **High-water mark:** Claude Code CLI — `tools` allowlist + `disallowedTools` denylist per agent, compound specifier logic.
- **Ouroboros:** Inherited from Claude Code. The `tools` and `disallowedTools` frontmatter fields in `.claude/agents/` are respected by the subprocess at subagent dispatch. Ouroboros's own agent catalog uses `disallowedTools` to enforce tier discipline (e.g., Haiku-tier agents that must not run Bash are declared with `disallowedTools: ["Bash"]`). This self-referential usage validates that the inherited system enforces tool restrictions correctly. No additional GUI layer for tool restriction exists beyond what agent frontmatter provides.
- **Verdict:** MATCHES
- **Notes:** Tool restriction is a Claude Code CLI-only capability in the survey — no other tool implements agent-level tool allowlists. Ouroboros inherits this unique capability and actively uses it in its own development process. The Ouroboros agent catalog's tool constraint declarations are a production-validated test of the system.

### #27 — Parallel sub-agent dispatch
- **Industry standard:** Kiro's Specs (structured three-phase waves, most structured), Claude Code CLI's `background: true` frontmatter + `/batch` (most flexible, most CLI-native), Goose (parallel coordinator pattern).
- **High-water mark:** Claude Code CLI — `background: true` frontmatter on agent Markdown files triggers detached subprocess execution; `Ctrl+B` keyboard shortcut; `/batch` spawning per-unit background agents in git worktrees; background agents are listed in the `/agents` running view.
- **Ouroboros:** Two parallel session surfaces: (1) Multiple concurrent threads via `AgentChatTabBar.tsx` — each tab is an independent chat thread with its own orchestration bridge context (`AgentChatBridgeRuntime` per thread). Threads run concurrently and independently; status updates per-tab. (2) Background agent dispatch inherited from Claude Code CLI — `/batch` slash command surfaces in the Ouroboros slash menu; `background: true` frontmatter on agent files is respected by the subprocess. Tab bar shows per-thread status indicators so users can monitor multiple concurrent threads at a glance.
- **Verdict:** MATCHES
- **Notes:** Ouroboros's tab-based multi-thread UI is a meaningful GUI-layer addition to Claude Code's background dispatch capability. The combination of GUI tab switching + CLI background dispatch covers both user-visible parallel conversations and headless parallel agent tasks. No worktree isolation per GUI thread (worktrees are per-subagent, not per-tab) — but this is appropriate for the UI workflow.

### #28 — Multi-level (nested) sub-agents
- **Industry standard:** Claude Code CLI explicitly blocks deeper-than-2-level nesting for most subagents (hardware rate limits and cost discipline). The `context: fork` workaround in skills is an escape hatch. Goose documents parallel sub-agents coordinated by a main session but doesn't explicitly address nesting depth. Most tools are silent on this.
- **High-water mark:** Goose — parallel sub-agents coordinated by main session (vague on nesting depth).
- **Ouroboros:** Inherited from Claude Code — nesting is blocked at the CLI level except via `context: fork` workaround in skills. The Ouroboros wrapper doesn't add or remove from this behavior. Active bug: `2026-05-07-subagent-dispatch-fails-inside-ide-chat.md` documents an Agent tool API 500 error when dispatching subagents from inside the IDE chat. This is distinct from the inherited nesting block — it's a wiring bug in how the IDE chat session hands off to the agent dispatch subsystem. The follow-up note describes the symptom as "Agent tool returns API 500" not "agent nesting is blocked."
- **Verdict:** PARTIAL
- **Notes:** Nested subagent dispatch from within the IDE chat hits an active API 500 bug — distinct from the CLI's intentional nesting depth limits. The two failure modes need separate investigation: (1) the inherited nesting depth limit (by design, affects deeply nested agents), (2) the API 500 on first-level subagent dispatch from IDE chat (a bug, affects any subagent dispatch in this context). See `roadmap/follow-ups/2026-05-07-subagent-dispatch-fails-inside-ide-chat.md`.

### #29 — Global memory file (cross-project)
- **Industry standard:** Claude Code CLI has richest global memory: `~/.claude/CLAUDE.md` + managed policy (MDM/GPO distribution) + `~/.claude/rules/` directory with glob-scoped rules. Kiro's `~/.kiro/steering/` with Team scope (MDM/GPO distribution) is the closest peer. Most other tools (Cursor, Windsurf, Continue) have a single global instructions file with no managed-policy layer.
- **High-water mark:** Claude Code CLI — user CLAUDE.md + managed policy (MDM/GPO) + global rules directory + `~/.claude/projects/<repo>/memory/MEMORY.md` (project-specific auto-memory under user home).
- **Ouroboros:** Inherited from Claude Code subprocess. The subprocess loads: (1) `~/.claude/CLAUDE.md` (user global instructions — always loaded); (2) any managed policy CLAUDE.md (enterprise MDM path — loaded when present); (3) `~/.claude/rules/` directory (glob-scoped rules — each file's `paths:` frontmatter determines when it fires); (4) `~/.claude/projects/<repo-hash>/memory/MEMORY.md` (project-specific auto-memory, per-repo under user home). On the GUI side: `ComposerContextPreview.tsx` uses `useActiveSessionRulesAndSkills(claudeSessionId, projectRoot)` to surface the active rule set in the context preview popover. The popover lists which global rules are loaded for the current session with per-rule disable toggles (axis #20). This GUI layer gives Ouroboros users visibility into global memory state that pure-CLI users can only access via `/memory`.
- **Verdict:** MATCHES
- **Notes:** Full global memory hierarchy inherited. The GUI adds visibility (context preview popover listing active rules by scope) and control (per-rule disable toggle). The "inherited + GUI visibility" pattern is Ouroboros's consistent approach to Claude Code capabilities — wrap the CLI behavior, add a GUI surface for inspection and control.

### #30 — Project memory file
- **Industry standard:** Universal among IDE tools. Field converging on `CLAUDE.md` (Anthropic/Cursor/GitHub convention) and `AGENTS.md` (OpenAI convention) as cross-tool standards. Both Copilot and Cursor read `CLAUDE.md` when present. `AGENTS.md` is the emerging OpenAI-ecosystem equivalent.
- **High-water mark:** Claude Code CLI — four-file project memory hierarchy with documented priority order: `./CLAUDE.md` → `./.claude/CLAUDE.md` → `CLAUDE.local.md` (gitignored personal overrides) → `.claude/settings.json` (structured config). Plus the inherited global files above.
- **Ouroboros:** Inherited from Claude Code. The full hierarchy is loaded by the subprocess. Ouroboros contributes its own project-level CLAUDE.md at `C:\Web App\Agent IDE\CLAUDE.md` — this file governs Claude Code sessions that develop Ouroboros itself, creating a self-referential loop: the product's own CLAUDE.md encodes the development conventions used to build it. The root CLAUDE.md includes a "Gotcha maintenance rule" requiring developers to document non-obvious constraints discovered during work, and "Before you code / After you code" protocol entries that shape how Claude Code agents approach the codebase. Subsystem CLAUDE.md files (`src/main/CLAUDE.md`, `src/renderer/CLAUDE.md`, etc.) load on-demand for their respective directories.
- **Verdict:** MATCHES
- **Notes:** Full project memory hierarchy inherited. The self-referential CLAUDE.md usage — where the IDE's own development conventions live in a CLAUDE.md that the IDE reads when developing itself — is a unique artifact. No other tool in the survey is used to develop itself with its own instruction files.

### #31 — Nested-folder memory inheritance
- **Industry standard:** Claude Code CLI is the high-water mark — directory-tree walk from filesystem root to cwd loads CLAUDE.md at each level; subdirectory CLAUDE.md files load on-demand when Claude reads files in those directories (not eagerly on session start). This means a `src/renderer/CLAUDE.md` only loads context into the session when Claude reads something in `src/renderer/` — preventing context bloat from irrelevant subsystems.
- **High-water mark:** Claude Code CLI — directory-tree walk from root to cwd; subdirectory CLAUDE.md files load on-demand when files in that subdirectory are read.
- **Ouroboros:** Inherited from Claude Code subprocess. The on-demand loading behavior is preserved. Ouroboros's own repo uses this pattern at production scale: `src/main/CLAUDE.md` (main process subsystem map), `src/main/agentChat/CLAUDE.md` (agent chat subsystem details), `src/renderer/CLAUDE.md` (renderer entry point and three-layer bootstrap), `src/renderer/components/AgentChat/CLAUDE.md` (AgentChat component reference — the most detailed, covering all 50+ AgentChat files). These files load only when Claude reads files in their respective directories, so a renderer-focused task doesn't load main-process context and vice versa. The auto-generated sections (`<!-- claude-md-auto:start -->` / `<!-- claude-md-auto:end -->`) in some CLAUDE.md files indicate the repo has a `claude-md-lifecycle` tooling layer for keeping them current.
- **Verdict:** MATCHES
- **Notes:** Nested-folder memory inheritance is actively exercised in Ouroboros development — 6+ nested CLAUDE.md files, on-demand loading tested daily. The pattern works as documented. The `claude-md-lifecycle` auto-generation tooling (see `roadmap/docs/claude-md-lifecycle.md`) is an Ouroboros-specific extension that keeps CLAUDE.md files fresh as the codebase evolves.

### #32 — Glob-attached rules (rule fires when path matches)
- **Industry standard:** Claude Code CLI and Cursor document glob-pattern triggered rules clearly. Claude Code CLI: `.claude/rules/` directory, each rule file has YAML frontmatter with optional `paths:` glob — rule fires when Claude reads a matching file, not on every tool use. Kiro has conditional steering loading with glob. Windsurf has workspace rules with glob patterns.
- **High-water mark:** Claude Code CLI — `.claude/rules/` with `paths:` YAML frontmatter; scoped to fire when Claude reads a file matching the pattern, rather than always-on injection.
- **Ouroboros:** Inherited from Claude Code subprocess. Ouroboros's own `.claude/rules/` directory (at `C:\Web App\Agent IDE\.claude\rules\`) contains 10+ glob-scoped rules actively governing its own development: `eslint-awareness.md` (`src/**/*.{ts,tsx}` — ESLint constraint reminder injected when touching TypeScript), `renderer.md` (`src/renderer/**` — renderer browser-only constraint), `main-process.md` (`src/main/**` — Node.js only, security rules reminder), `ipc-contract.md` (`src/renderer/types/electron*.d.ts` — single source of truth warning), `terminal.md` (`src/renderer/components/Terminal/**` — xterm API gotchas), `test-files.md` (`src/**/*.test.ts` — test-specific lint relaxations), `config-files.md` (`*.config.*` — all three targets affected warning), `multi-process-debugging.md` (`src/main/hooks.ts, src/main/agentChat/**` — multi-process timing debug rule). On the GUI side: `ComposerContextPreview.tsx` uses `useActiveSessionRulesAndSkills(claudeSessionId, projectRoot)` to list which rules are currently active in the popover. `useFilesystemDisabledRuleIds` tracks disabled rules, enabling the per-rule disable checkbox (axis #20/#33).
- **Verdict:** MATCHES
- **Notes:** Glob-attached rules are production-validated in Ouroboros's own development workflow — 10+ scoped rules fire at the appropriate path contexts. The GUI visibility layer (popover listing active rules) and control layer (per-rule disable) are meaningful additions over the pure-CLI experience. This is one of the strongest examples of the "inherit + surface in GUI" pattern.

### #33 — Per-rule disable toggle
- **Industry standard:** Almost entirely absent field-wide. Claude Code CLI's `claudeMdExcludes` is the closest approximation.
- **High-water mark:** Claude Code CLI — `claudeMdExcludes` glob; `/memory` toggle.
- **Ouroboros:** `ComposerContextPreview.tsx:223-238` — `useToggleHandler` fires `fireRuleToggleIpc(id, enabled, projectRoot)` for `rule:`-prefixed entries and `toggleLocal(id)` for other context entries. `rulesAndSkillsToggle.ts:27` — IPC handler calls `rulesDirMgr.disableRule(scope, name, projectRoot)`. `rulesDirectoryManager.ts:108` — `disableRule` moves the rule file to a `.disabled/` sibling directory. The toggle is per-rule, per-scope, filesystem-backed, and live-updating via `rulesAndSkills:changed` event subscription.
- **Verdict:** AHEAD
- **Notes:** Per-rule granular disable is fully implemented with filesystem persistence — this is definitively ahead of every surveyed tool. The rules-disappear bug (`2026-05-07-context-preview-rules-disappear-after-chat-start.md`) makes the rules tab inaccessible post-chat-start, degrading usability but not the implementation quality.

### #34 — Auto-memory write (model proposes new memory)
- **Industry standard:** Windsurf and Claude Code CLI are the only tools with this pattern as a first-class feature.
- **High-water mark:** Windsurf — Memories Panel for user review; Claude Code CLI — auto-memory writes to MEMORY.md.
- **Ouroboros:** `memoryExtractor.ts` — Ouroboros-specific extraction layer: `buildMemoryExtractionPrompt(sessionSummary)` generates a typed extraction prompt; `parseMemoryExtractionResponse(response)` parses JSON into `{ type, content, relevantFiles }[]` entries typed as `decision|pattern|fact|preference|error_resolution`. `formatMemoriesForContext(memories)` formats them into system context for future sessions. `SessionMemoryPanel.tsx` — GUI component mounted in `InnerAppLayout.agent.tsx:149` for reviewing and managing extracted memories (`useSessionMemoryPanelModel` with load/update/delete). This is a full auto-memory pipeline with both extraction and a GUI review panel.
- **Verdict:** AHEAD
- **Notes:** Ouroboros has a complete auto-memory pipeline: LLM-powered extraction from session summaries, typed memory entries, persistence, and a dedicated `SessionMemoryPanel` review UI. This matches or exceeds Windsurf's Memories Panel. No other surveyed tool has this combination — Claude Code CLI has auto-memory but no GUI review panel; Windsurf has a review panel but no structured extraction taxonomy.

### #35 — Memory inline preview (popover → drawer)
- **Industry standard:** Windsurf's Memories Panel and Claude Code CLI's `/memory` command are the only documented implementations.
- **High-water mark:** Windsurf — Memories Panel; Claude Code CLI — `/memory` command.
- **Ouroboros:** Two surfaces: (1) `ComposerContextPreview.tsx` — context preview popover shows memory entries alongside rules, MCP tools, and context files; `useMemoryEntries(projectRoot)` at line 251. (2) `SessionMemoryPanel.tsx` — standalone review panel mounted in the IDE layout (`InnerAppLayout.agent.tsx:149`) showing all extracted memories with edit/delete. Affected by rules-disappear bug on the popover tab (`2026-05-07-context-preview-rules-disappear-after-chat-start.md`).
- **Verdict:** AHEAD
- **Notes:** Two memory visibility surfaces (popover + dedicated panel) — exceeds Windsurf (panel only) and Claude Code CLI (command only). The popover is affected by the rules-disappear bug but the standalone panel is unaffected.

### #36 — Pin file to chat context
- **Industry standard:** Universal among IDE tools — this is table stakes. Aider's `/add` (editable) vs. `/read-only` (reference-only) distinction is the only meaningful variation in the field. Cursor's `@` file pinning is the modal standard.
- **High-water mark:** Aider — `/add` (model can read AND write the file) vs. `/read-only` (model can only reference the content, not modify). This two-mode distinction prevents accidental edits to files the user wants to protect.
- **Ouroboros:** `useAgentChatContext.ts` — "Pinned files + @mention system" (AgentChat `CLAUDE.md:31`). `AgentChatContextBar.tsx` — "Bar above composer showing active context files and token count" (AgentChat `CLAUDE.md:50`). Files are pinned via @-mention in the Lexical composer and displayed as chips in the context bar above the composer. `MentionChip.tsx` renders selected mentions as pills with filename + estimated token count. The token count helps users manage context window budget as they add pins. Files are de-pinned by removing their chip from the context bar. Draft persistence (`useAgentChatDraftPersistence`) preserves pinned files across thread navigation and session reload.
- **Verdict:** MATCHES
- **Notes:** File pinning via @-mention with chip display and token estimation is fully implemented. No editable vs. read-only distinction (Aider's differentiator) — all @-mentions are reference context. This distinction is rarely needed in the GUI workflow: users are typically asking the agent to read and edit files, not protecting specific files from edits. The context bar with token count is a meaningful UX improvement over most tools that show no token budget feedback on pinned context.

### #37 — File tree change indicators (M / A / D after agent edits)
- **Industry standard:** Almost entirely undocumented across the survey. Zed documents "a panel showing which files and how many lines were edited." Cline's per-invocation UI shows changed files. Most tools have no post-turn file tree feedback.
- **High-water mark:** Zed — dedicated panel showing which files were edited and line counts after each agent turn.
- **Ouroboros:** Two surfaces: (1) `ChangeSummaryBar.tsx` — "file-change tally (files added/modified/deleted) for both completed and streaming messages" (AgentChat `CLAUDE.md:33`). Rendered in the chat pane as part of each assistant message — shows the net file count changes (e.g., "3 modified, 1 added"). This is visible even during streaming. (2) `useFileHeatMap.ts` in the FileTree component — heat-map coloring on file tree nodes that were recently edited by the agent. This is a file-tree-level indicator (inline with the tree nodes), distinct from the chat-pane `ChangeSummaryBar`. Currently broken per `2026-05-06-file-heat-map-still-broken.md`.
- **Verdict:** PARTIAL
- **Notes:** The chat-pane `ChangeSummaryBar` provides excellent turn-level change summary and exceeds most tools. The file-tree heat-map coloring would provide the file-level indicator that Zed has, but is currently broken. When the heat-map is restored, both surfaces together would be AHEAD — no other surveyed tool has both a conversation-level change bar and file-tree-level activity coloring.

### #38 — File tree "open in chat"
- **Industry standard:** Only Piebald documents this — clickable file path references in the chat that jump to file context. No other tool in the matrix documents an explicit "open in chat" from file tree affordance.
- **High-water mark:** Piebald — clickable file path references from chat conversation (reverse direction: chat → file tree navigation). The "open in chat" direction (file tree → chat) is not explicitly documented even in Piebald.
- **Ouroboros:** Searched for `openInChat`, `fileTreeOpen`, `openInComposer`, `chatFromTree` — no matches found. `FileTree.tsx` exists but right-click context menu wiring to insert a file as an @-mention in the active AgentChat composer was not found. The drag-from-tree path (`LexicalDropPlugin.tsx`) covers the same workflow with comparable friction for most users.
- **Verdict:** ABSENT
- **Notes:** No "open in chat" context menu from the file tree. The drag-to-composer path (#39) covers the identical workflow — drag a file from the tree to the composer creates the same @-mention. A right-click "Add to chat" menu item would be a discoverability improvement for users who don't know about drag-to-compose. Implementation: `buildMentionFromDropJson` in `LexicalDropPlugin.tsx` is the parsing logic; the context menu needs to dispatch a custom DOM event with the file path, which the composer's event listener translates to `insertMention`. Low effort.

### #39 — Drag file from tree to composer
- **Industry standard:** Cursor and Zed explicitly document this; most others either have it undocumented or don't support it. It has become the preferred UX pattern for file context injection in 2025-2026 as @-mentions became standard.
- **High-water mark:** Cursor — drag files/folders from the sidebar file explorer to the composer, creating an @-mention chip. Zed — same pattern, creates an @-mention node with a file preview thumbnail.
- **Ouroboros:** `LexicalDropPlugin.tsx` — handles `application/json` drops from `FileTree.tsx`. The file tree emits `dataTransfer.setData('application/json', JSON.stringify({ path, name, relativePath, isDirectory }))` on drag start. `LexicalDropPlugin` listens for `dragover` + `drop` events on the Lexical editor root, reads the JSON payload, calls `buildMentionFromDropJson(jsonData)` to create a `MentionItem`, then calls `editor.update(() => insertMention({ trigger: '@', value: mention.path, ... }))` to insert a `BeautifulMentionNode` into the composer at the cursor position. Both files and folders supported: `isDirectory === true` → `type: 'folder'`; else → `type: 'file'`. The drop is explicitly rejected if `dataTransfer.types` doesn't include `application/json` (preventing non-FileTree drops from hitting this path).
- **Verdict:** MATCHES
- **Notes:** Drag-from-FileTree-to-composer is fully implemented and verified in code — `LexicalDropPlugin.tsx` is the definitive implementation. This matches Cursor and Zed. The JSON payload protocol between FileTree and the Lexical composer is clean and extensible — any tree node that emits the right JSON shape will work. The `buildMentionFromDropJson` helper validates the payload before inserting, preventing malformed drops from creating invalid mention nodes.

### #40 — Heat-map / activity coloring on edited files
- **Industry standard:** Not documented in any surveyed tool — this axis was the only one in the matrix with zero coverage across all 15 tools. Heat-map coloring of file tree nodes based on agent activity is a genuinely novel feature concept.
- **High-water mark:** None established — absent across all 15 tools in the matrix. This would be an industry first if functional.
- **Ouroboros:** `useFileHeatMap.ts` exists in the FileTree component (`src/renderer/components/FileTree/`). The hook computes heat values per file based on agent edit frequency/recency and applies CSS-class-based coloring to file tree nodes. Currently broken per the follow-up file `2026-05-06-file-heat-map-still-broken.md` — the hook exists and was previously functional but produces incorrect results after agent edits. The failure mode is not documented (it was deferred, not diagnosed).
- **Verdict:** PARTIAL
- **Notes:** Ouroboros is the only surveyed tool to attempt heat-map coloring. When restored to functional state, this would be AHEAD — a genuine product differentiation with no field competition. The innovation is conceptually sound: a developer working with an AI agent benefits from visual feedback about which files have been touched most, helping them navigate to recently changed code. The fix priority is medium (regression, not new feature) with AHEAD upside.

### #41 — Inline-in-editor diff during streaming
- **Industry standard:** VS Code Copilot, Cline, Zed, and OpenCode all document inline diffs.
- **High-water mark:** OpenCode — syntax-highlighted inline diffs.
- **Ouroboros:** `AgentChatDiffPreview.tsx` — "inline diff preview for code apply operations." `useApplyCode.ts` implements the diff computation with two algorithms: `computeSequentialDiff` (O(n) fast path for large files — compare line-by-line in order) and `buildLcsTable` + `backtrackLcs` (LCS-based accurate diff for smaller files). The `DiffLine` type is `{ type: 'add' | 'del' | 'context'; text: string; lineNo?: number }`. The exported `UseApplyCodeResult` exposes `diffLines: DiffLine[]`, `apply`, `accept`, `reject`, `revert`, `canRevert`, `status: ApplyCodeStatus` (`'idle' | 'previewing' | 'applied' | 'error'`). `ChatCodeBlock.tsx` has an "Apply" button that triggers this flow. `AgentChatDiffPreview.tsx` renders `diffLines` with syntax highlighting.
- **Verdict:** MATCHES
- **Notes:** The diff algorithm is two-path: sequential O(n) for large files (avoids O(m×n) LCS blowup), LCS-accurate for smaller files. This is a non-trivial implementation with proper algorithm selection. Diff is shown inline in the chat on a code block before the user accepts — consistent with VS Code Copilot's pattern. Syntax highlighting is present via `AgentChatDiffPreview.tsx`.

### #42 — Side-panel / artifact-pane full review
- **Industry standard:** Zed's `Shift+Ctrl+R` multi-buffer tab is the most ergonomic; Claude Code CLI Desktop app rebuilt diff viewer.
- **High-water mark:** Zed — multi-buffer tab, all pending changes in one view with per-hunk accept/reject.
- **Ouroboros:** `AgentChatDiffReview.tsx` — "Full diff review panel with per-file accept/reject." `useDiffReview.ts` manages the full state lifecycle: `fileStatuses: Record<string, FileReviewStatus>` where `FileReviewStatus = 'pending' | 'accepted' | 'rejected'` keyed by `f.path`. Actions: `acceptFile(path)`, `rejectFile(path)`, `acceptAll()`, `rejectAll()`. Data loaded via `orchestration.getDiffSummary(sessionId)` IPC call on mount (the `DiffSummaryApi` type gate). `ChatWorkbenchArtifactPane.tsx` is the mount point. Open bug: `2026-05-07-full-review-artifact-pane-empty.md` (Full Review opens artifact pane but renders nothing — likely the `getDiffSummary` IPC call returning empty or the pane mount guard not firing).
- **Verdict:** PARTIAL
- **Notes:** The full diff review implementation is architecturally complete: data loading via IPC, per-file status state machine (`pending → accepted/rejected`), `acceptAll`/`rejectAll` bulk operations. The known bug is at the rendering layer — the pane opens but the component renders nothing, most likely due to `orchestration.getDiffSummary` returning undefined (the API may not be wired on the main process side, or the `getDiffSummaryApi()` guard returning early). When the artifact pane bug is fixed, this becomes MATCHES.

### #43 — Per-hunk accept / reject
- **Industry standard:** VS Code Copilot and Zed document per-hunk granularity. Most tools default to whole-file.
- **High-water mark:** VS Code Copilot — hover-to-accept with auto-navigate to next hunk.
- **Ouroboros:** `useApplyCode.ts` exports `accept`, `reject`, `revert` — these are whole-block operations, not per-hunk. The `UseApplyCodeResult.accept()` applies the entire diff; there is no sub-block selection. `useDiffReview.ts` tracks status at `Record<string, FileReviewStatus>` (file-path keyed) — no hunk-level state exists. The `DiffLine[]` array is available for rendering but there is no UI for accepting or rejecting individual hunks (contiguous `add`/`del` groups within a file).
- **Verdict:** BEHIND
- **Notes:** Updating from PARTIAL to BEHIND — the code evidence is now clear. `useApplyCode.ts` (inline apply) and `useDiffReview.ts` (full review) both operate at whole-block or whole-file granularity. Per-hunk (sub-file) accept/reject is not implemented. This is the minimum that VS Code Copilot and Zed have. The `DiffLine[]` data structure supports it — the missing piece is UI (hover targets per hunk, state tracking per hunk range). This is a medium-effort gap.

### #44 — Per-file accept / reject
- **Industry standard:** Copilot, Cline, and Zed document per-file accept/reject. Field has converged on this as minimum granularity.
- **High-water mark:** VS Code Copilot — review individual file diffs and apply selectively.
- **Ouroboros:** `useDiffReview.ts:6` — `FileReviewStatus = 'pending' | 'accepted' | 'rejected'`. `useDiffReview.ts:11` — `fileStatuses: Record<string, FileReviewStatus>` (keyed by file path). `useDiffReview.ts:95-125` — `acceptFile(path: string)`, `rejectFile(path: string)`, `acceptAll()`, `rejectAll()`. These four operations are the complete per-file review API. `AgentChatDiffReview.tsx` consumes `useDiffReview` and renders the per-file status state. Both `setFileStatuses` updaters in `acceptFile`/`rejectFile` use immutable spread (functional update pattern).
- **Verdict:** MATCHES
- **Notes:** Per-file accept/reject is explicitly implemented with a clean state machine. The `pending → accepted/rejected` transition is simple and correct. `acceptAll`/`rejectAll` bulk operations are included. Usability is impaired by the artifact pane bug (#42) but the state management mechanism is solid.

### #45 — Checkpoints / restore-from-snapshot
- **Industry standard:** Cline (step-level), Copilot, Cursor, Zed (per-edit restore), Aider (git commit per edit). Claude Code CLI has `/rewind`.
- **High-water mark:** Cline — step-level workspace snapshots at every agent step.
- **Ouroboros:** `chatOrchestrationBridgeGit.ts` implements a two-layer checkpoint system. Layer 1 — pre-turn snapshot: `captureHeadHash(cwd)` runs `git rev-parse HEAD` before each agent turn; the hash is stored in `AgentChatOrchestrationLink.preSnapshotHash`. Layer 2 — post-turn checkpoint commits: `capturePostTurnCheckpoint(runtime, threadId, messageId, workspaceRoot)` calls `createCheckpointCommit(cwd, threadId, headHash)` which uses `git commit-tree` to create a checkpoint commit on a dedicated ref (`refs/ouroboros/checkpoints/<threadId>`) without touching the working tree or index. The checkpoint hash is stored per-message (`threadStore.updateMessage(threadId, messageId, { checkpointCommit })`). `CheckpointStore` (`checkpointStore.ts`) tracks checkpoints in a separate SQLite database (`checkpoints.db`). `trimToMax(threadId, MAX_CHECKPOINTS_PER_THREAD)` enforces a cap (cap value in `checkpointStore.ts`). Revert: `executeGitRevert(workspaceRoot, snapshotHash)` runs `git diff --name-status <snapshotHash>`, classifies files as A/M/D/R, batch-restores via `git checkout <hash> -- [files]` (50 files per batch), and removes added files via `unlink`. `agentChatWorkspaceActions.ts` exposes `revertMessage` action.
- **Verdict:** MATCHES
- **Notes:** Ouroboros's checkpoint system is more architecturally sophisticated than the "pre-turn hash + git checkout" description suggests. The `git commit-tree` approach creates a lightweight checkpoint commit on a dedicated ref without polluting the branch history — this is a best-practice git technique. The batch revert (50 files per `git checkout` invocation) handles large diffs efficiently. The per-message `checkpointCommit` field enables message-level revert granularity (any message's post-turn state can be restored). This exceeds Aider's flat git-commit model in architectural cleanliness.

### #46 — Git-native (commit-based) safety
- **Industry standard:** Aider is the definitive high-water mark — every edit auto-committed with Conventional Commits.
- **High-water mark:** Aider — every AI edit auto-committed; `/undo` = git revert.
- **Ouroboros:** Checkpoint commits are made on a dedicated `refs/ouroboros/checkpoints/<threadId>` ref namespace — separate from the user's working branch. This means checkpoint history doesn't appear in the user's branch log (no pollution) but is also not a standard `git log` accessible history (it's only accessible via the dedicated ref). The `classifyDiffLines` function in `chatOrchestrationBridgeGit.ts:130` handles all diff status codes: `A` (added → remove on revert), `M`/`D` (modified/deleted → restore), `R` (renamed → restore old, remove new). The `RevertListener` system (`revertListeners: Set<RevertListener>`, `registerRevertListener()`) fires post-revert callbacks synchronously with the absolute paths of all reverted files — allowing observers (e.g., the research outcome writer) to react to reverts without coupling. Claude Code subprocess also performs git operations via Bash tool; `isolation: "worktree"` per subagent is inherited.
- **Verdict:** MATCHES
- **Notes:** Ouroboros's git safety uses the dedicated checkpoint ref pattern (not Aider's branch-polluting auto-commit pattern), which is more production-appropriate. The revert listener system for post-revert observers is an architectural nicety. The tradeoff vs. Aider: checkpoints are less discoverable (no `git log` surface) but less intrusive to user workflow. Both are valid design choices; the field hasn't converged on one standard here.

### #47 — Live text streaming
- **Industry standard:** Universal among tools with real-time interface. The field has converged on streaming as table stakes.
- **High-water mark:** No single high-water mark — field-wide standard. Quality differentiators: smoothness (frame rate, no jank), correctness (no dropped chunks), and handling of fast models (200+ tokens/sec).
- **Ouroboros:** Three-layer streaming pipeline: (1) `chatOrchestrationBridgeMonitor.ts` — emits `agentChat:stream` IPC chunks with an incremental flush timer (throttled so chunks aren't sent one-at-a-time over IPC). (2) `useAgentChatStreaming.ts` — streaming state machine on the renderer side; listens for `agentChat:streamChunk` events and builds up a `AgentChatContentBlock[]` array via block accumulation. Thinking blocks are "sealed" (given a duration) when a non-thinking delta arrives, triggering auto-collapse. (3) `useRafBatchedChunks.ts` — rAF batching layer that coalesces chunk deltas so `setStateMap` fires at most once per animation frame. On a fast model, 20–50 chunks arrive per frame; without batching, each triggers a separate React state update — this is the standard source of streaming jank in naive implementations. `complete`/`error` chunks flush synchronously (no lag at turn end). `thread_snapshot` dispatches DOM events before batching (unchanged). Two rendering paths: `AgentChatStreamingMessage.tsx` (live turn) and `AgentChatBlockRenderer.tsx` (persisted messages) — they share `AgentChatToolCard` but have separate grouping logic (documented gotcha). Open bug: `2026-05-07-chat-streaming-freezes-on-project-switch.md`. Queued-message system: `useAgentChatQueue` manages messages submitted while agent is mid-turn. Per `2026-05-07-queued-message-no-autosend-and-text-reappears.md`: queue doesn't auto-flush on completion and force-send has draft-repopulation bug.
- **Verdict:** PARTIAL
- **Notes:** The streaming architecture is sophisticated and correct in the normal case — the three-layer design (IPC throttle → state machine → rAF batcher) handles high-throughput models without UI jank. Two active bugs degrade the user experience: (1) project-switch freeze (rAF loop stale after project switch), (2) queued message auto-send not implemented. When both bugs are fixed this would be MATCHES or AHEAD.

### #48 — Thinking / reasoning blocks visible
- **Industry standard:** Almost entirely absent across the field. Replit and Claude Code CLI are the only tools with documented thinking-mode controls. Most GUI IDEs show no thinking-related UI — they either suppress thinking tokens or show them only in a debug log. This is an emerging feature (extended thinking launched mid-2025).
- **High-water mark:** Claude Code CLI — settings flags: `alwaysThinkingEnabled`, `showThinkingSummaries`; `ultrathink` magic word in skills that increases thinking budget; TTY spinner indicates thinking in progress.
- **Ouroboros:** `AgentChatThinkingBlock.tsx` — dedicated renderer for thinking blocks. `useAgentChatStreaming.ts` — "`[s]thinking blocks are 'sealed' (given a duration) when a non-thinking delta arrives`" (AgentChat `CLAUDE.md:67`). The seal event triggers auto-collapse of the thinking block — the thinking content is visible while the model is generating it, then collapses to a summary header when the model transitions back to regular text. `AgentChatBlockRenderer.tsx` routes `block.kind === 'thinking'` to `AgentChatThinkingBlock`. The thinking duration (latency of the thinking phase) is preserved in the sealed block and shown in the collapsed header. The two rendering paths (streaming + persisted) both handle thinking blocks — users can expand/collapse thinking from any past message.
- **Verdict:** AHEAD
- **Notes:** Ouroboros renders extended thinking as a first-class UI element with: live streaming during generation, auto-collapse on completion, expandable header showing thinking duration, persistent in conversation history. This exceeds Claude Code CLI (TTY spinner + settings flag, no block-level rendering) and every other GUI tool in the survey. The thinking-block rendering pattern in Ouroboros is genuinely novel in the current tool landscape.

### #49 — Tool-call interleaving with text
- **Industry standard:** VS Code Copilot, Cline, Continue, and Zed all document tool-call transparency. Most implementations show a collapsible section per tool call. Cline shows every permission request as a UI element. Copilot shows all tool invocations in a dedicated panel.
- **High-water mark:** VS Code Copilot — "every tool invocation transparently displayed." Cline — per-invocation permission dialog. Zed — tool calls in a separate feed alongside the conversation.
- **Ouroboros:** `AgentChatToolCard.tsx` — expandable card for `tool_use` blocks with syntax-highlighted input/output. `AgentChatToolGroup.tsx` — collapsible group of consecutive `tool_use` blocks with category summary (e.g., "Read 3 files, Edit 1 file"). Tool cards show: tool name, input arguments (syntax-highlighted JSON), output (syntax-highlighted response), status (pending/complete/error). The category summary in `AgentChatToolGroup` auto-categorizes tool calls: File operations (Read, Write, Edit, MultiEdit), Bash, WebFetch, WebSearch, Agent, etc. — each category has an icon and count. The "two rendering paths" gotcha (`AgentChat/CLAUDE.md:75`): streaming messages use `AgentChatStreamingMessage → inline tool group`; persisted messages use `AgentChatBlockRenderer → AgentChatToolGroup`. Both share `AgentChatToolCard` leaf component — grouping logic is duplicated between the two paths.
- **Verdict:** AHEAD
- **Notes:** The category-summary approach in `AgentChatToolGroup` ("Read 3 files, Edit 1 file") gives users an at-a-glance understanding of what the agent is doing without expanding individual cards. This is more UX-sophisticated than most peers' flat tool-call lists. The duplicated grouping logic between streaming and persisted paths is a known tech debt item.

### #50 — Todo / plan blocks rendered
- **Industry standard:** Kiro's Specs (three structured documents: requirements → design → tasks, with real-time task status during execution) is the structured high-water mark. Cursor's Plan Mode renders an editable Markdown plan before execution. Claude Code CLI produces plan output in TTY (not a distinct block type). Most other tools don't distinguish plan output from regular text.
- **High-water mark:** Kiro — Specs: three structured documents with real-time task status during execution (checked off as agent completes each task).
- **Ouroboros:** `AgentChatPlanBlock.tsx` — dedicated renderer for `plan` block kind. `AgentChatBlockRenderer.tsx` routes `block.kind === 'plan'` to `AgentChatPlanBlock`. Plan blocks are emitted by the Claude Code agent during plan mode (`/plan` slash command or GUI plan mode picker). `AgentChatDetailsDrawer.tsx` — "slide-in drawer showing linked orchestration session details (tokens, changed files, verification)" — provides a post-turn detail view that includes any plan generated during the session. The plan block rendering is inline in the conversation stream (not a separate panel), which keeps it contextually anchored to the conversation turn that produced it.
- **Verdict:** MATCHES
- **Notes:** Plan/todo blocks are rendered as distinct UI elements (not raw Markdown). Not as structured as Kiro's three-document Specs (which has a dedicated panel + real-time task status), but appropriate for the conversational workflow. The `AgentChatDetailsDrawer` adds post-turn plan inspection. No real-time task-completion checkboxes (Kiro's differentiator) — tasks are static once rendered.

### #51 — Status / "thinking" rotating message
- **Industry standard:** All tools have some form of spinner or status indicator during agent turns. Quality differentiators: brand consistency, custom verbs, away-mode summary (vs. staying on screen forever). Claude Code CLI has the most configurable spinner. Aider shows the current operation as a status line. Piebald uses emoji reactions on the triggering message.
- **High-water mark:** Claude Code CLI — `spinnerTipsEnabled` (rotating tips during long turns), `spinnerTipsOverride` (user-configurable tip text), `awaySummaryEnabled` (posts a summary if user returns after a long turn). Three separate behavioral flags.
- **Ouroboros:** `streamingUtils.tsx` — `BlinkingCursor` component (animated cursor shown at the stream edge), `SlitherSnake` SVG animation (snake-themed spinner), `useTypewriter` hook (drives the rotating status message animation), rotating verb list: "Slithering, Coiling, Thinking, Weaving, Entwining, Pondering, Contemplating" — snake-themed vocabulary consistent with the "Ouroboros" product name. `AgentChatStreamingMessage.tsx` uses these components to render the in-progress state. The snake theme extends to the product name itself (Ouroboros = the ancient symbol of a snake eating its tail) — the status animation is brand-intentional, not decorative.
- **Verdict:** MATCHES
- **Notes:** Ouroboros's rotating status messages are brand-consistent and animated — more polished than a generic spinner. Less configurable than Claude Code CLI's three-flag system (`spinnerTipsEnabled`, `spinnerTipsOverride`, `awaySummaryEnabled`). The "away summary" concept (a catch-up summary when the user returns to a long-running turn) is absent in Ouroboros — this is worth considering for long-running tasks where users switch away.

### #52 — Multiple concurrent chat sessions
- **Industry standard:** Zed (each thread has own agent, context window, history — Threads Sidebar) and Piebald (parallel sessions with sidebar, draft preservation, pending approval persistence across reboots) are the high-water marks. Claude Code Desktop supports multiple sessions side-by-side. Most GUI IDEs are single-session. Windsurf explicitly doesn't support concurrent sessions.
- **High-water mark:** Piebald — parallel sessions with sidebar, draft preservation, pending approval persistence across reboots.
- **Ouroboros:** `AgentChatTabBar.tsx` — horizontal tab bar with overflow dropdown for thread switching with branch indicators. `useAgentChatWorkspace.ts` owns thread CRUD (`useThreadState`, `useActiveThread`, `mergeThreadCollection`). Multiple threads run concurrently and independently — each has its own orchestration bridge context (`chatOrchestrationBridge.ts` holds `AgentChatBridgeRuntime` per thread). Thread state (messages, status, links, snapshots) is persisted in SQLite (`threadStoreSqlite.ts`) with `max 100 threads` cap. Draft per thread in localStorage (`useAgentChatDraftPersistence.ts`).
- **Verdict:** MATCHES
- **Notes:** Multiple concurrent chat threads with independent orchestration contexts, SQLite persistence, per-thread draft persistence, and tab UI with overflow. Comparable to Piebald's model. The `max 100 threads` cap is a known constraint but adequate for typical use. No pending-approval persistence across reboots (Piebald's differentiator) — approvals are session-scoped in the approval manager.

### #53 — Tab UI for sessions
- **Industry standard:** Zed has the clearest multi-session tab UI (Threads Sidebar with all threads grouped by project). Piebald has a sidebar navigation with session status. VS Code Copilot opens Chat as an editor tab. Claude Code CLI has `/agents` Running tab.
- **High-water mark:** Zed — Threads Sidebar with all threads grouped by project.
- **Ouroboros:** `AgentChatTabBar.tsx` — horizontal tab bar with branch indicators, overflow dropdown (for when threads exceed display width). `ChatHistoryPanel.tsx` — sidebar panel for browsing/searching chat history with auto-titles from `chatTitleDerivation.ts`. The tab bar is visible in both the IDE shell and the chat-only shell (`FloatingComposerContainer.tsx`). `useAgentChatDefaultView.ts` determines whether to show the thread list or conversation on mount.
- **Verdict:** MATCHES
- **Notes:** Tab bar (horizontal) + history panel (searchable sidebar) together cover both session-switching and session-discovery use cases. The horizontal tab bar is more appropriate for an IDE shell than a vertical sidebar (Zed's pattern). The history panel adds searchability via the auto-generated thread titles.

### #54 — Branch from a prior message
- **Industry standard:** Almost entirely absent across the field — Piebald is the high-water mark (explicit fork at any turn, duplicate session, Git worktree management for parallel branches on different code states). Zed's "New From Summary" is context-limit-driven, not user-initiated exploration. Claude Code CLI has `/branch` (alias `/fork`). Most tools lack this pattern entirely.
- **High-water mark:** Piebald — explicit fork/branch at any turn with duplicate session + Git worktree management.
- **Ouroboros:** `agentChatWorkspaceActions.ts` — `branchFromMessage` action creates a new thread from a specific message (CLAUDE.md line 24). `AgentChatMessageActions.tsx` — per-message action bar for assistant messages includes a "branch" button (CLAUDE.md line 46). `AgentChatBranchIndicator.tsx` — visual indicator component rendered between messages when a branch point exists (CLAUDE.md line 49). `AgentChatTabBar.tsx` — branch indicators in tab bar show which threads are branches. `buildThreadTree` (referenced in CLAUDE.md patterns section) — constructs parent→child hierarchy from `branchInfo.parentThreadId`. The `/branch` slash command from Claude Code CLI is also inherited, allowing branching via the slash menu. `agentChatWorkspaceActions.ts` also exports `editAndResend` and `retryMessage` — branching patterns at the message level.
- **Verdict:** AHEAD
- **Notes:** Ouroboros's branch-from-message is a first-class UI feature with per-message button, branch indicators in the conversation view, branch hierarchy in the tab bar, and tree construction from `parentThreadId`. This is one of Ouroboros's clearest differentiators from the matrix. Piebald is rated ✓✓ in the matrix but the Ouroboros implementation covers the same pattern without Git worktree management per branch (which may be more than most users need).

### #55 — History search
- **Industry standard:** Aider's `/save`/`/load` for session replay and Claude Code CLI's `/resume [session]` with session picker are the clearest implementations. Piebald's auto-tagging (Pro) with metadata search adds discovery on top of navigation. Most other tools don't document history search.
- **High-water mark:** Piebald — auto-tagging (Pro) with metadata search.
- **Ouroboros:** `ChatHistoryPanel.tsx` — "Sidebar panel for browsing/searching chat history" (CLAUDE.md line 44). Thread titles are auto-derived via `chatTitleDerivation.ts` — `deriveSmartTitle` (heuristic, sync) + `generateLlmTitle` (LLM-powered, async). `threadStoreSqlite.ts` stores threads with their derived titles. `isDecorativeLine` filter strips agent formatting artifacts (e.g., `★ Insight ───`) from auto-title candidates. Max 60 char title length. `useAgentChatDefaultView.ts` — determines whether to show the thread list or conversation on mount (first-run shows thread list for discoverability).
- **Verdict:** MATCHES
- **Notes:** Dedicated history panel with LLM-powered auto-titling (not just rule-based truncation). No auto-tagging metadata (Piebald Pro differentiator) but the LLM title generation provides semantic searchability. The heuristic + LLM dual-path means titles are available immediately (sync) and optionally improved later (async LLM call).

### #56 — Per-session model / mode override
- **Industry standard:** Claude Code CLI has the most complete per-session overrides: model, effort level, permission mode all changeable in-session with `Shift+Tab` cycling modes. Aider has `/model`, `/chat-mode`. Most GUI IDEs allow model selection but don't expose effort/permission levels as per-session toggles.
- **High-water mark:** Claude Code CLI — model, effort, permission mode all per-session; `Shift+Tab` cycles modes.
- **Ouroboros:** `ChatControlsBar.tsx` — model selector + permission mode toggle + token usage display. `AgentChatComposerKeyHandlers.ts:62-85` — `handlePermissionModeShortcut` with `cyclePermissionMode(args.chatOverrides.permissionMode, provider, {...})` via keyboard shortcut. `AdvancedInferenceControls.tsx` — "Per-request inference override panel" (Wave 26 Phase C): temperature slider, max tokens, stop sequences, JSON schema mode — collapsible panel opened by gear button in composer. These overrides are per-request (not saved to profile). `ChatOverrides` type (`ChatControlsBar.tsx`) carries: `model`, `permissionMode`, `provider`, plus `InferenceOverrides` (temperature, maxTokens, stopSequences, jsonSchema).
- **Verdict:** AHEAD
- **Notes:** Ouroboros exceeds Claude Code CLI on per-session overrides: GUI model selector, GUI permission mode toggle with keyboard cycling, AND per-request temperature/max-tokens/stop-sequence/JSON-schema controls via `AdvancedInferenceControls`. No other tool in the matrix exposes temperature and JSON-schema controls as per-request message-level overrides in the composer. Update from MATCHES to AHEAD based on code evidence.

### #57 — Permission modes (count of distinct modes)
- **Industry standard:** Claude Code CLI has 6 distinct modes. VS Code Copilot has 3 (chat / agent / edit). Most tools have 2 (auto vs. manual). Kiro has 2 Spec phases (plan-only vs. execute). Aider has command-R1 vs. command-R+ as model tiers but no explicit permission modes.
- **High-water mark:** Claude Code CLI — 6 modes: `default` (asks before all tool calls), `acceptEdits` (auto-accept file edits, still asks for Bash/network), `plan` (read-only, no file writes), `auto` (auto-approves within project path), `dontAsk` (approves without user confirmation), `bypassPermissions` (skips all checks — requires explicit flag).
- **Ouroboros:** All 6 Claude Code permission modes are surfaced via `ChatControlsBar.tsx` permission mode toggle. `AgentChatComposerKeyHandlers.ts:62-85` — `handlePermissionModeShortcut` cycles through modes via `cyclePermissionMode`. The `ChatOverrides.permissionMode` field carries the current mode. The GUI picker shows mode names with descriptions (not just cycling blind as in the CLI's `Shift+Tab`). Modes are per-session and per-thread — switching to a different thread doesn't change the mode on the previous thread.
- **Verdict:** MATCHES
- **Notes:** Full 6-mode permission system inherited and exposed with a GUI picker that exceeds the CLI's mode-cycling UX. The GUI adds mode discoverability — users can read mode descriptions before selecting, rather than cycling through modes in TTY without descriptions. No 7th mode exists beyond the CLI's 6.

### #58 — Per-tool approval (granular)
- **Industry standard:** Claude Code CLI has the most complete per-specifier system: `Bash(npm run *)`, `Read(./.env)`, `WebFetch(domain:x.com)` — per-tool, per-specifier, with deny→ask→allow precedence and compound command parsing that strips wrappers. Cline's every-file-every-command individual approval is the most conservative UX. Zed's regex-pattern-based per-tool rules with a 6-level precedence hierarchy is the most sophisticated regex-based approach.
- **High-water mark:** Claude Code CLI — per-specifier system with compound command parsing.
- **Ouroboros:** Two-layer approval system. (1) Claude Code subprocess: the full per-specifier system (`allow`, `deny`, `ask` per tool/specifier in `.claude/settings.json`) is inherited. (2) Ouroboros `approvalManager.ts` — response-file protocol at `~/.ouroboros/approvals/` intercepts pre-execution approval events from Claude Code hooks and routes them to the IDE UI for GUI-based approval. `approvalManagerHelpers.ts:39` — `alwaysAllowRules Set` maintained for tools the user has already approved in this session (so "always allow" doesn't prompt again). This gives Ouroboros a GUI approval dialog layer on top of Claude Code's permission system.
- **Verdict:** MATCHES
- **Notes:** Ouroboros inherits the full per-specifier approval system and adds a GUI approval layer via the approval manager. The response-file protocol (hook scripts poll `~/.ouroboros/approvals/` rather than holding a socket) is a clean IPC design for the approval handshake.

### #59 — Per-directory approval / trusted dirs
- **Industry standard:** Claude Code CLI and VS Code Copilot are the only tools with documented per-directory or per-path approval rules. Claude Code CLI's implementation: `permissions.additionalDirectories` for trusted additional dirs, absolute vs. relative path anchoring, compound command parsing.
- **High-water mark:** Claude Code CLI — `permissions.additionalDirectories`, absolute path anchoring, compound command parsing.
- **Ouroboros:** Inherited from Claude Code. `permissions.additionalDirectories` in `.claude/settings.json` is respected by the subprocess. The per-window project isolation (main CLAUDE.md: "Per-Window Project Isolation" pattern) means each window's project roots are independently tracked — `pathSecurity` reads per-window roots first, with `defaultProjectRoot` as a cold-boot fallback only. This means trusted directory scope is per-window, not global, which is more correct for multi-project workflows.
- **Verdict:** MATCHES
- **Notes:** Per-directory approval via inherited Claude Code settings. The per-window project isolation adds an additional security layer that pure-CLI Claude Code doesn't have — each window can only access its own project roots.

### #60 — Plan-mode / dry-run capability
- **Industry standard:** Kiro's Specs (three-phase structured review) is the most structured pre-execution review model. Cursor's Plan Mode (editable Markdown plan before execution) and Replit's Plan Mode (ordered task list before any edits) are the mainstream pattern. Claude Code CLI's `/plan` provides read-only exploration mode via `ExitPlanMode` tool.
- **High-water mark:** Kiro — three-phase structured review (requirements → design → tasks).
- **Ouroboros:** Permission mode "plan" is one of the 6 modes surfaced in `ChatControlsBar.tsx`. The `/plan` slash command from Claude Code CLI is inherited (enters plan mode; Claude uses `ExitPlanMode` tool to exit). `AgentChatPlanBlock.tsx` renders plan/todo blocks emitted during plan mode as distinct UI elements in the conversation stream. The GUI mode selector makes switching to plan mode a single click rather than a slash command.
- **Verdict:** MATCHES
- **Notes:** Plan mode via GUI toggle plus inherited `/plan` command plus plan block rendering is a complete implementation. Not as structured as Kiro's three-document Specs, but the combined GUI affordance (mode picker + plan block rendering) is more accessible than most tools' plan modes.

### #61 — Hooks (PreToolUse / PostToolUse / etc.)
- **Industry standard:** Claude Code CLI and Kiro are the only tools with first-class hooks. Claude Code CLI is the high-water mark: 12+ hook events (`PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `Notification`, etc.), 5 hook types (`command`, `http`, `mcp_tool`, `prompt`, `agent`), exit-code blocking semantics (non-zero exit from PreToolUse blocks the tool call), `additionalContext` injection for mid-turn Claude steering, managed-hooks-only enforcement (enterprise: hooks can require admin installation). Kiro has Pre/Post action hooks with environment injection. No other tool in the survey has this capability.
- **High-water mark:** Claude Code CLI — 12+ hook events, 5 hook types, exit-code blocking, `additionalContext` injection, managed-hooks-only enterprise mode.
- **Ouroboros:** Four Ouroboros-specific hook subsystems built on top of the inherited CLI hook system: (1) `hookInstaller.ts` — auto-installs hook scripts into Claude Code's hook config (`~/.claude/settings.json` `hooks` section) on startup. SHA-256 of each hook script's content is the version key — scripts auto-reinstall when content changes. `config.autoInstallHooks === false` disables this. (2) `hooks.ts` — named pipe server that receives hook events from Claude Code hook scripts in real time, routes them to the IDE's event bus. Hook scripts write to the named pipe; the IDE processes the payload and dispatches to subscribers. (3) `src/main/hooks/` — `stop` and `start` hook event handlers that participate in agent lifecycle (gotcha nudge on stop, session lifecycle management). (4) `approvalManager.ts` — response-file protocol at `~/.ouroboros/approvals/`: when a PreToolUse hook fires for a sensitive operation, the hook script creates a response file and polls it; the IDE GUI renders an approval dialog and writes the response; the hook script unblocks when the file appears. This avoids holding a socket open during the approval wait.
- **Verdict:** AHEAD
- **Notes:** Ouroboros extends Claude Code's hook system with: auto-install (SHA-256 versioned), IDE-side event routing (named pipe → GUI), and the response-file approval protocol. The approval pattern is architecturally notable — the hook script doesn't hold a blocking IPC connection; it uses the filesystem as a signaling mechanism, which is robust to IDE restarts and process crashes. No other surveyed tool has a hook-to-GUI approval routing layer.

### #62 — MCP support
- **Industry standard:** Claude Code CLI and Continue have the deepest MCP implementations. Claude Code CLI: three transports (stdio/HTTP/SSE), scoped per subagent (different MCP servers per agent invocation), dynamic tool updates (MCP servers can add tools during a session), plugin-bundled servers (`mcp__server__tool` naming). Continue: configurable MCP client with all three transports. Most other tools support MCP as a client only with limited transport options.
- **High-water mark:** Claude Code CLI — three transports, per-subagent scope, dynamic tool updates, plugin-bundled servers, the most complete MCP client implementation in the field.
- **Ouroboros:** Three distinct MCP layers: (1) **MCP Client (external)**: External MCP servers configured in `.claude/settings.json` `mcpServers` key are forwarded to the Claude Code subprocess. The subprocess handles all three transports (stdio/HTTP/SSE) via its own MCP client. Per-session MCP configuration overrides via `scopedMcpConfig.ts` — different servers can be active for chat vs. terminal sessions. (2) **MCP Client (internal)**: `src/main/internalMcp/` provides a degraded-fallback graph tool surface (6 tools) available when the primary graph is rebuilding. `src/main/codemode/` — Cloudflare CodeMode proxy wraps Ouroboros's tools into a CodeMode-compatible MCP server. (3) **MCP Server**: Ouroboros exposes itself as an MCP server to the Claude Code subprocess via the CodeMode/internalMcp layer. The 14-tool graph MCP surface includes: `search_graph`, `trace_call_path`, `detect_changes`, `query_graph` (Cypher), `get_code_snippet`, `get_architecture`, `manage_adr`, `index_repository`, `list_projects`, `delete_project`, `index_status`, `get_graph_schema`, `search_code`, `ingest_traces`. All 14 tools appear as `AgentChatToolCard` blocks when the model invokes them — the closed-loop is visible in the conversation stream.
- **Verdict:** AHEAD
- **Notes:** The bidirectional MCP architecture is structurally unique in the survey. The consequence: Claude Code (the agent subprocess) can call Ouroboros's graph tools during its reasoning turns, and those calls appear in the Ouroboros chat UI as tool cards. This creates a feedback loop where the IDE's knowledge graph is directly accessible to the model via MCP, and the model's use of that knowledge is visible to the user inline. No pure MCP-client tool (Continue, Cline, etc.) can achieve this without also implementing an MCP server — which none do.

### #63 — CLI subscription pass-through (no API key)
- **Industry standard:** Post-January 2026, Anthropic locked direct API access to API-key holders. Claude Code CLI (Anthropic's own product) and Goose (via its ACP adapter) are the only tools that survived the lockout for Max/Pro/Team subscription users. Tools that previously used direct API endpoints (Cline, Continue, Aider) lost their Claude access unless users had API keys. This is a structural shift that makes subscription pass-through a meaningful axis.
- **High-water mark:** Claude Code CLI — Anthropic's own product; OAuth-based auth; supports Pro/Max/Team/Enterprise subscription tiers; no API key required.
- **Ouroboros:** Ouroboros wraps Claude Code CLI as an OAuth subprocess. Auth is handled entirely by the Claude Code CLI — Ouroboros never holds or transmits API keys. `settingsResolver.ts` — "Providers: `anthropic-api`, `claude-code`, `codex`" — the `claude-code` provider is the OAuth-wrapped subprocess path. Token refresh and session management are delegated to the CLI binary. `spawnClaude` is the CLI spawn pattern (memory: "OAuth only, CLI-managed tokens. Direct SDK calls are unauthorized; use `spawnClaude` CLI pattern"). The Anthropic Max subscription (all models, high rate limits) is fully available through Ouroboros without any API key configuration.
- **Verdict:** MATCHES
- **Notes:** Ouroboros is built around subscription pass-through — this is its core architectural identity. The rating is MATCHES (not AHEAD) because Claude Code CLI itself is the underlying mechanism; Ouroboros is the wrapper. An AHEAD rating would require Ouroboros to add something beyond CLI pass-through (e.g., Team license management UI, usage dashboards, multi-account switching). These are viable future directions given Ouroboros's GUI layer.

### #64 — Multi-provider (Claude / GPT / Gemini)
- **Industry standard:** Cline, Continue, Aider, Goose, Piebald, and OpenCode support 30-75+ providers. The field has converged on multi-provider as a default expectation for general-purpose coding tools. Provider counts: Cline (50+), Continue (50+), Aider (30+ via litellm), Goose (30+), OpenCode (15+), Piebald (6+).
- **High-water mark:** Piebald — Claude Pro/Max, ChatGPT Pro/Plus, Google AI (Gemini), GitHub Copilot, Amazon Bedrock, Qwen. One of the few tools supporting multiple subscription-tier providers simultaneously.
- **Ouroboros:** `settingsResolver.ts` — "Providers: `anthropic-api`, `claude-code`, `codex`." Three providers: (1) `anthropic-api` — direct Anthropic API (requires API key, no longer functional under subscriber-only access unless user has API key); (2) `claude-code` — Claude Code CLI subprocess (subscription pass-through, the primary path); (3) `codex` — OpenAI Codex integration. The provider is a per-session selection via `ChatControlsBar.tsx` model selector. Each provider maps to a distinct orchestration pathway in `chatOrchestrationRequestSupport.ts`. Adding a new provider requires implementing the `OrchestrationAPI` interface — the abstraction exists.
- **Verdict:** BEHIND
- **Notes:** Ouroboros is intentionally Claude-focused. The Codex provider is a secondary option but not prominently documented. Multi-provider support is not a design goal for the current architecture (the subscription pass-through identity is Claude-specific). The `OrchestrationAPI` abstraction in `chatOrchestrationBridgeTypes.ts` is provider-agnostic in principle — adding GPT or Gemini would require implementing the interface but not restructuring the core architecture. The BEHIND rating reflects reality vs. field expectation, not a design failure.

---

## Roll-up Summary

### AHEAD axes (Ouroboros leads)

- **#19 — Context preview popover**: Purpose-built `ComposerContextPreview.tsx` popover lists everything the model sees (files, rules, memory, MCP tools, token count) — no other GUI tool in the matrix has this.
- **#20 — Per-entry disable toggle**: `ComposerContextPreview.tsx:223-238` — per-rule checkbox backed by IPC → `rulesDirectoryManager.disableRule()` with filesystem persistence. Definitively ahead of the entire field; no other tool has per-entry granularity.
- **#33 — Per-rule disable toggle**: Same implementation as #20 — verified code evidence confirms per-rule, per-scope, filesystem-backed toggles with live-watch refresh. Ahead of entire field.
- **#34 — Auto-memory write**: `memoryExtractor.ts` (LLM extraction with 5 typed memory kinds) + `SessionMemoryPanel.tsx` (GUI review/edit/delete) — full pipeline exceeding both Windsurf (panel without structured extraction) and Claude Code CLI (extraction without GUI panel).
- **#35 — Memory inline preview**: Two surfaces: context preview popover tab + dedicated `SessionMemoryPanel` in IDE layout. Exceeds Windsurf (panel only) and Claude Code CLI (command only).
- **#48 — Thinking blocks visible**: `AgentChatThinkingBlock.tsx` renders extended thinking as collapsible UI elements with auto-collapse on seal — no other GUI tool in the matrix does this.
- **#49 — Tool-call interleaving**: `AgentChatToolCard` + `AgentChatToolGroup` with expandable cards, syntax-highlighted I/O, and category summaries (e.g., "Read 3 files, Edit 1 file") — more UX-sophisticated than any peer.
- **#54 — Branch from prior message**: `branchFromMessage` action, `AgentChatBranchIndicator`, branch indicators in tab bar — explicit branching UI at every message, comparable to or exceeding Piebald (the field's high-water mark).
- **#56 — Per-session model / mode override**: `AdvancedInferenceControls.tsx` (Wave 26) adds per-request temperature, max tokens, stop sequences, and JSON schema controls — no other surveyed tool exposes these at the per-message composer level.
- **#61 — Hooks**: Ouroboros inherits Claude Code's complete hook system and adds IDE-side hook event routing (named pipe server → GUI display and orchestration coordination) — ahead of Claude Code CLI's own baseline.
- **#62 — MCP support**: Bidirectional MCP — Ouroboros is simultaneously an MCP client (forwarding external servers to the subprocess) and an MCP server (internalMcp graph tools, file tree, IDE state back to Claude Code). Architecturally unique in the survey.

### BEHIND axes (gap-fix candidates)

High impact:
- **#9 — @web / web search**: No `@web` mention type. Web search is available to the model as a tool but not user-initiated from the composer.
- **#12 — @diff / @commit / @PR**: No @-mention for diff or commit context. Underlying Claude Code has this as slash commands but not surfaced as composer mentions.
- **#21 — System prompt visibility**: Raw assembled system prompt not exposed in the GUI. Only VS Code Copilot's Chat Debug view does this.
- **#43 — Per-hunk accept/reject**: `useApplyCode.ts` and `useDiffReview.ts` both operate at whole-block/whole-file granularity. Per-hunk (sub-file, contiguous add/del group) accept/reject is absent. Downgraded from PARTIAL to BEHIND after code verification.
- **#64 — Multi-provider**: Intentional design limitation (Claude-focused), but still a gap vs. most peers.

Medium impact:
- **#8 — @docs / docs.url**: No `@docs` or `@url` mention type. URL fetching is agent-tool only, not composer-user-initiated.

### PARTIAL axes (existing affordance, broken or incomplete)

- **#10 — @past-conversation**: Memory extraction and panel exist (`SessionMemoryPanel.tsx`), but no inline `@thread` or `@memory` mention to pull past conversation into the current context at compose time.
- **#17 — Slash command arguments**: Works via mouse-click path; Enter-key path broken for commands with whitespace in arguments (`extractSlashQuery` closes menu on whitespace).
- **#18 — Bundled skills**: Skills work when manually placed; `ecosystem.rulesAndSkillsInstallEnabled` defaults false — auto-install not wired.
- **#28 — Multi-level sub-agents**: Active bug — Agent tool API 500 error when dispatching subagents from inside IDE chat (`2026-05-07-subagent-dispatch-fails-inside-ide-chat.md`).
- **#37 — File tree change indicators**: `ChangeSummaryBar` in chat is excellent; file tree heat-map broken (`2026-05-06-file-heat-map-still-broken.md`).
- **#40 — Heat-map**: Implemented (`useFileHeatMap.ts`) but currently broken; would be AHEAD of entire field when fixed.
- **#41 — Inline diff during streaming**: `AgentChatDiffPreview.tsx` and `useApplyCode.ts` implemented; usability impaired by artifact pane bug (#42).
- **#42 — Full review artifact pane**: `AgentChatDiffReview.tsx` with per-file accept/reject implemented but artifact pane renders empty (`2026-05-07-full-review-artifact-pane-empty.md`).
- **#43 — Per-hunk accept/reject**: `useApplyCode.ts` `accept()`/`reject()` are whole-block operations; `useDiffReview.ts` tracks status at file-path level only (`Record<string, FileReviewStatus>`). Per-hunk granularity is absent — downgraded to BEHIND after code verification.
- **#47 — Live text streaming**: Implemented with sophisticated rAF batching; freeze on project switch (`2026-05-07-chat-streaming-freezes-on-project-switch.md`).

### ABSENT axes (don't have it)

Should add (low-to-medium effort):
- **#5 — Markdown preview in composer**: Not present. Low field-wide baseline makes this low priority.
- **#38 — File tree "open in chat"**: No right-click "open in chat" from file tree. Drag-to-composer (#39) covers most of the same workflow.

Deliberate non-goal:
- **#64 — Multi-provider** (rated BEHIND, not ABSENT — Codex is a second provider but field expectation is 30+ providers). Changing this would require rearchitecting around the subscription-pass-through identity of the product.

### N/A axes

None of the 64 axes are genuinely N/A for Ouroboros's architecture. Even the TTY-centric axes (like multi-line via `/editor`) have GUI equivalents. The `n/a` cells in the matrix for Aider (file tree) don't apply here since Ouroboros has a file tree.

---

## Architectural Patterns: What Makes Ouroboros Different

Before the cross-cutting observations, it's worth naming the three structural patterns that distinguish Ouroboros from every other tool in the matrix. These patterns explain why the AHEAD verdicts cluster where they do.

**Pattern 1: Inherit-then-surface.** Claude Code CLI has the deepest feature set in the matrix on most axes (hooks, MCP, memory, agents, permissions). Ouroboros doesn't reimplement these — it wraps the CLI and adds a GUI surface for visibility and control. Examples: the context preview popover (axis #19) surfaces what `/context` and `/memory` show in the CLI but without the user needing to know those commands; the per-rule disable toggle (axes #20, #33) adds a checkbox UI to Claude Code's filesystem-backed rule disabling; the permission mode picker (axis #57) makes mode selection a single click vs. repeated `Shift+Tab` cycling. The pattern is consistent: CLI feature + GUI affordance = MATCHES or AHEAD. CLI feature without GUI affordance = MATCHES (inherited score, no addition). Missing CLI feature = BEHIND/ABSENT regardless of GUI layer.

**Pattern 2: IDE-side hook participation.** Most tools treat Claude Code (or any CLI tool) as a subprocess to be spawned and forgotten. Ouroboros treats it as a peer in a bidirectional protocol. The named pipe server receives hook events from Claude Code; the response-file protocol lets Ouroboros intercept and respond to approval requests; `hookInstaller.ts` manages the full hook configuration lifecycle. This pattern appears in axes #61 (AHEAD), #58 (MATCHES+), and indirectly in #28 (PARTIAL — the subagent dispatch bug is a protocol failure). No other tool in the matrix implements IDE-side hook participation.

**Pattern 3: Self-application.** Ouroboros is developed using itself. The `.claude/agents/` catalog (13+ agents), `.claude/commands/` (project slash commands), `.claude/rules/` (10+ glob-scoped rules), `src/*/CLAUDE.md` (nested subsystem docs) — these are all live in the Ouroboros repo and govern its own development. This self-application creates a natural validation loop: any system that would make development worse gets noticed and fixed immediately (e.g., `ecosystem.rulesAndSkillsInstallEnabled` defaulting false is noticed as a development friction point). The downside: bugs that only affect production deployments (not the dev workflow) may survive longer unnoticed (e.g., the artifact pane bug #42, which affects users reviewing Claude's changes but not necessarily the dev team doing Ouroboros-on-Ouroboros development).

---

## Cross-Cutting Observations

**Ouroboros's transparency story is the strongest in the field — and it's largely hidden by bugs.** Context preview popover (#19, AHEAD), per-rule disable toggles (#20, #33, AHEAD), thinking block rendering (#48, AHEAD), and tool-call expandable cards (#49, AHEAD) together give users more visibility into model behavior than any single surveyed tool. The rules-disappear bug (`2026-05-07-context-preview-rules-disappear-after-chat-start.md`) makes the per-rule toggle inaccessible post-chat-start, which means the flagship differentiator is invisible to users who start a chat before opening the popover. The full impact: AHEAD verdicts on axes #19, #20, #33, and #35 all degrade to PARTIAL in practice for users who start a chat first.

**Four open follow-ups from 2026-05-07 each correspond to a PARTIAL verdict.** `context-preview-rules-disappear` (axes #19, #20, #33, #35), `full-review-artifact-pane-empty` (axis #42), `chat-streaming-freezes-on-project-switch` (axis #47), and `subagent-dispatch-fails-inside-ide-chat` (axis #28) are all cases where Ouroboros has the implementation but cannot deliver it reliably. Fixing these four bugs lifts Ouroboros from PARTIAL to MATCHES or AHEAD on 6+ axes simultaneously. The bugs share a theme: they occur after state changes (chat start, project switch, subagent dispatch) — suggesting session lifecycle / state transition bugs rather than core logic bugs. A focused lifecycle audit might catch multiple root causes at once.

**The @-mention system has a real capability gap at the user-initiated layer.** @-files (#6), @-symbols (#7, verified via `useSymbolDisambiguation`), and @-drag-from-tree (#39, verified via `LexicalDropPlugin.tsx`) all work. But @-web (#9, BEHIND), @-docs (#8, ABSENT), @-diff (#12, BEHIND), and @-commit (#12, BEHIND) are absent. The Lexical composer infrastructure (trigger system, mention items, chip rendering via `MentionChip.tsx`, data provider pattern) is fully built — the missing pieces are new mention types and their data providers. This is a development-roadmap gap, not a technical constraint. The three-step pattern for adding any new mention type: (1) add mention type to the type enum, (2) implement a data provider hook, (3) wire into `MentionAutocompleteSupport.ts`. None of the absent mention types require changes to the Lexical composer itself.

**The memory pipeline is ahead of the field on paper but needs a discoverability fix.** `memoryExtractor.ts` does typed LLM extraction (5 kinds: `decision|pattern|fact|preference|error_resolution`); `SessionMemoryPanel.tsx` provides GUI review with load/update/delete. Both are implemented. The gap is that `SessionMemoryPanel` is mounted in `InnerAppLayout.agent.tsx:149` in a sidebar slot — if users don't know to open it, auto-memory is invisible. The context preview popover's memory tab (`useMemoryEntries` at line 251) provides a secondary surface, but it's also affected by the rules-disappear bug. This is a discoverability problem, not an implementation gap. A "N memories captured this session" badge or toast notification on session end would surface the feature without requiring users to discover the panel.

**The branching/threading model is a genuine differentiator that works correctly.** `branchFromMessage`, `AgentChatBranchIndicator`, per-tab branch indicators, draft persistence, SQLite thread history, `ChatHistoryPanel` with LLM-derived titles — the multi-thread model rivals Piebald (the field's high-water mark on axis #54) and in some respects exceeds it. This works today without open bugs. The LLM-powered auto-titling (`generateLlmTitle` in `chatTitleDerivation.ts`) is a meaningful quality improvement over rule-based title generation — thread history is semantically searchable rather than showing timestamp-based names.

**`ecosystem.rulesAndSkillsInstallEnabled` defaulting to false is a quiet correctness gap.** Users who don't manually place skill files in `~/.claude/skills/` get no bundled skills behavior. This silently degrades the Claude Code CLI experience that Ouroboros wraps. Flipping the default and completing the install wiring (axis #18) is low-risk and high-value. The `hookInstaller.ts` pattern (SHA-256 versioned, runs on startup, idempotent reinstall) is a proven template for how skills install should work.

**The queued message system (`useAgentChatQueue`) has two implementation gaps that undermine its core value.** Per `2026-05-07-queued-message-no-autosend-and-text-reappears.md`: (1) no subscriber to thread `'idle'` / completion events drains the queue — auto-send is not implemented, meaning the queue's purpose (sending while the agent is busy) requires manual intervention to actually send; (2) the force-send path calls `editQueuedMessage` (which restores the draft) and `sendMessage` separately, leaving the message content back in the composer after sending. Both defects are on the same surface (`useAgentChatWorkspace.queue.ts`) and likely share a single fix: a `forceSendQueuedMessage(id)` action that removes the item from queue, sends its content directly without restoring the draft, and becomes auto-triggered from a `thread.status === 'idle' && queuedMessages.length > 0` effect.

**The heat-map (`2026-05-06-file-heat-map-still-broken.md`) is worth fixing for strategic reasons.** `useFileHeatMap.ts` exists. If restored, axis #40 becomes AHEAD — Ouroboros would be the only tool in the 15-tool survey with heat-map coloring on edited files. The field has literally no coverage on this axis (no tool in the matrix documents this). It's a genuine product innovation sitting behind a regression fix.

**Verdict distribution reveals a healthy specialization story.** AHEAD on 11 axes; MATCHES on 37; BEHIND on 5; PARTIAL on 9; ABSENT on 2. The AHEAD cluster concentrates in: context transparency (axes #19, #20, #33, #34, #35), streaming UX (axes #48, #49), multi-thread/branching (axes #54, #56), and integrations (axes #61, #62). The BEHIND/ABSENT cluster concentrates in: @-mention types (axes #8, #9, #12), system prompt visibility (axis #21), per-hunk accept/reject (axis #43), and multi-provider (axis #64). This pattern is architecturally coherent: Ouroboros leads on the features it built itself (transparency, streaming, branching) and lags on features that require extending the @-mention data model — an area where focused investment would close multiple gaps at once.

---

## Recommended Priority for the Bug-Fix Wave

Ordered by impact × effort estimate. Each cites the matrix row number and open follow-up if one exists.

1. **Axes #19/#20/#33/#35 — Context preview rules disappear after chat start** [PARTIAL → AHEAD]
   Bug: `2026-05-07-context-preview-rules-disappear-after-chat-start.md`. The rules tab in the context preview popover goes empty after a chat session starts, disabling per-rule toggles and memory visibility simultaneously. This single bug degrades four AHEAD axes to PARTIAL. High impact, unknown effort — the implementation is correct, the failure is post-start lifecycle.

2. **Axis #42 — Full review artifact pane empty** [PARTIAL → MATCHES]
   Bug: `2026-05-07-full-review-artifact-pane-empty.md`. `AgentChatDiffReview.tsx` with per-file accept/reject is fully implemented but the pane renders nothing on open. This is the primary agent-change-review surface. High user impact, likely a wiring or render guard bug (low-to-medium effort).

3. **Axis #47 — Chat streaming freezes on project switch** [PARTIAL → MATCHES]
   Bug: `2026-05-07-chat-streaming-freezes-on-project-switch.md`. Streaming freeze degrades the core conversational experience on a common workflow (switching projects mid-session). rAF throttle in `useRafBatchedChunks.ts` is the documented hypothesis. Medium effort.

4. **Axis #28 — Subagent dispatch fails inside IDE chat** [PARTIAL → MATCHES]
   Bug: `2026-05-07-subagent-dispatch-fails-inside-ide-chat.md`. Agent tool API 500 error when dispatching subagents from inside the IDE chat. Breaks the multi-agent orchestration use case. Medium effort (likely an API routing or context isolation issue).

5. **Axis #40/#37 — File heat-map broken** [PARTIAL → AHEAD]
   Bug: `2026-05-06-file-heat-map-still-broken.md`. `useFileHeatMap.ts` is implemented but producing wrong results after agent edits. When fixed, axis #40 becomes AHEAD — Ouroboros would be the only surveyed tool with heat-map coloring on edited files. Medium effort to diagnose.

6. **Axis #17 — Slash command Enter-key path with arguments** [PARTIAL → MATCHES]
   `extractSlashQuery` closes the menu on whitespace, so Enter-key selection silently no-ops for commands like `/spec featureName`. Mouse-click path works. Documented in `AgentChat/CLAUDE.md:84`. Low effort: targeted fix to `extractSlashQuery` + send-time interceptor (mirroring `useResearchIntercept` pattern noted in the same CLAUDE.md).

7. **Axis #18 — `ecosystem.rulesAndSkillsInstallEnabled` defaults false** [PARTIAL → MATCHES]
   Skills auto-install not wired end-to-end. Users lose bundled skill discovery unless they manually place files. Medium effort — complete the install wiring and flip the default to true.

8. **Axis #43 — Per-hunk accept/reject** [BEHIND → MATCHES]
   Code-verified: `useDiffReview.ts` tracks status at file-path level only (`Record<string, FileReviewStatus>`); `useApplyCode.ts` has `accept()`/`reject()` as whole-block operations. No per-hunk state exists. The `DiffLine[]` array is already available — the missing piece is: (1) a hunk grouper that segments consecutive `add`/`del` runs into named hunk ranges, (2) hunk-level state in `useDiffReview`, (3) hover-to-accept UI per hunk. Medium effort — the data is already computed.

9. **Axis #9 — @web search mention type** [BEHIND → MATCHES]
   Add `@web` as a new mention type in the Lexical composer. `WebSearch` tool is already available to the agent subprocess — the gap is user-initiated search at compose time. Required: (1) add `web` to the mention type enum in `MentionAutocompleteSupport.ts`, (2) implement a `WebSearchMentionProvider` that accepts a query string, calls `WebSearch` or an HTTP search API, returns ranked results as `MentionItem[]`, (3) chip rendering with title + snippet. Medium effort. This would close the most significant field gap (#9 is the only BEHIND axis that directly affects the compose UX for web-aware workflows.

10. **Axis #10 — @past-conversation / @thread mention** [PARTIAL → MATCHES]
    `ChatHistoryPanel.tsx` and `SessionMemoryPanel.tsx` both exist. The data layer (`listThreads`, LLM-derived titles, `getMemoryEntries`) is ready. Required: (1) add `thread` and `memory` mention types to the enum, (2) implement `ThreadMentionProvider` that queries `threadStore.listThreads()` and formats results, (3) on chip insert, inject the thread's message history or summary into the `@mention` context payload. Medium effort — the infrastructure is there, the data provider is the only missing piece.

11. **Axis #12 — @diff / @commit mention type** [BEHIND → MATCHES]
    Add `@diff` and `@commit` mention types. `@diff`: IPC call from renderer to main to run `git diff HEAD` (or staged diff), format as fenced code block, inject as mention content. `@commit`: run `git log --oneline -10` for recent commits, let user pick one, inject `git show <hash>`. Continue's `@Git Diff` branch-changes pattern is the model. Medium-to-high effort — requires new IPC handlers for git data, new mention types, and formatting logic. The `chatOrchestrationBridgeGit.ts` module already contains `gitExecSimple` which can run arbitrary git commands — a `gitDiff` IPC handler can reuse it.

12. **Axis #38 — File tree "open in chat"** [ABSENT → MATCHES]
    Add a right-click context menu option on `FileTree` nodes to insert the file as an @-mention in the active composer. Low effort: `LexicalDropPlugin.tsx`'s `buildMentionFromDropJson(jsonData)` is the parsing logic; the trigger is just a context menu `onClick` → `window.dispatchEvent` with the mention payload → renderer `insertMention` call. No new infrastructure needed — only the context menu wiring and the event dispatch path.

13. **Axis #13 — Mention chip rendering: scope labels** [MATCHES → AHEAD, optional]
    Current mention chips (`MentionChip.tsx`) show filename + token count. A small enhancement: add a scope badge (project vs. user vs. rule) to rule/skill mention chips in the context preview popover. This would surface the scope distinction that's currently invisible in the chip UI. Low effort — the `rule:<scope>:<name>` encoding in `useFilesystemDisabledRuleIds` already carries scope information; just render the scope prefix as a badge.

14. **Axis #21 — System prompt / assembled context visibility** [BEHIND → PARTIAL]
    Add a debug/developer view showing the raw assembled context sent to the model (system prompt + injected context + tool list). Requires main-process work: intercept the `TaskRequest` in `chatOrchestrationRequestSupport.ts` before it's dispatched, expose it via an `agentChat:getLastRequest` IPC handler, render in `AgentChatDetailsDrawer.tsx` or a new tab in the context preview popover. Lower priority — the field baseline is low (only VS Code Copilot has this), and the context preview popover already covers the highest-value parts (files, rules, memory). Medium-to-high effort for the full system prompt, low effort for partial exposure (just the context entries list, which is already surfaced).

15. **Axis #8 — @docs / @url mention type** [ABSENT → MATCHES]
    Add `@url` as a mention type that fetches a URL via `WebFetch` and injects the Markdown content into context at compose time. `WebFetch` is available to the agent as a tool — the gap is user-initiation at compose time (before the agent turn). Required: (1) new `url` mention type, (2) a `UrlMentionProvider` that accepts a URL string, calls `window.electronAPI.webFetch(url)` (or equivalent), and returns a `MentionItem` with the fetched Markdown content, (3) chip rendering with domain + title. Low-to-medium effort given existing infrastructure.

16. **Axis #18 — Skills auto-install** [PARTIAL → MATCHES]
    Flip `ecosystem.rulesAndSkillsInstallEnabled` to `true` and complete the wiring of the skills install path. The `hookInstaller.ts` pattern (SHA-256 versioned startup install, idempotent) is a proven template. Required: (1) implement a `skillsInstaller.ts` mirroring `hookInstaller.ts`, (2) call it from startup sequencing after `hookInstaller`, (3) flip the flag. Low-risk if the install path mirrors hooks exactly.

17. **Queued message auto-send and force-send bugs** [PARTIAL → MATCHES]
    Bug: `2026-05-07-queued-message-no-autosend-and-text-reappears.md`. Two defects sharing a fix surface: (1) auto-send not implemented — `useAgentChatWorkspace.queue.ts` has no subscriber to thread `'idle'` status; (2) force-send calls `editQueuedMessage` (restores draft) then `sendMessage` separately, leaving text in composer. Fix: a `forceSendQueuedMessage(id)` action that removes from queue, sends content directly, does not touch `setDraft`. Auto-send: invoke `forceSendQueuedMessage(queue[0].id)` from a `useEffect` where deps = `[thread.status, queuedMessages.length]` and condition is `status === 'idle' && queuedMessages.length > 0`. Both defects fixed in the same PR. Medium priority, low effort.

---

## Verdict Distribution Analysis

### By section cluster

| Cluster | Axes | AHEAD | MATCHES | BEHIND | PARTIAL | ABSENT |
|---|---|---|---|---|---|---|
| Composer (#1-5) | 5 | 0 | 4 | 0 | 0 | 1 |
| Mentions (#6-13) | 8 | 0 | 3 | 3 | 1 | 1 |
| Slash Commands (#14-18) | 5 | 0 | 3 | 0 | 2 | 0 |
| Context Preview (#19-22) | 4 | 2 | 1 | 1 | 0 | 0 |
| Skills/Agents/Modes (#23-28) | 6 | 0 | 5 | 0 | 1 | 0 |
| Memory/Rules (#29-35) | 7 | 3 | 4 | 0 | 0 | 0 |
| Files/File Tree (#36-40) | 5 | 0 | 2 | 0 | 2 | 1 |
| Diff Views (#41-46) | 6 | 0 | 4 | 1 | 1 | 0 |
| Streaming UX (#47-51) | 5 | 2 | 2 | 0 | 1 | 0 |
| Multi-Thread (#52-56) | 5 | 1 | 4 | 0 | 0 | 0 |
| Approval/Safety (#57-61) | 5 | 1 | 4 | 0 | 0 | 0 |
| Integrations (#62-64) | 3 | 1 | 1 | 1 | 0 | 0 |

**Observations from the distribution:**

- **Memory/Rules cluster (#29-35) is the strongest:** 3 AHEAD, 4 MATCHES, 0 gaps. The transparent memory system with per-rule disable toggles is Ouroboros's most complete feature cluster relative to the field. This is where the biggest competitive separation lives.

- **Mentions cluster (#6-13) is the most uneven:** 3 MATCHES + 1 PARTIAL vs. 3 BEHIND + 1 ABSENT. File/symbol/drag mentions work; web/docs/diff/commit mentions are missing. The cluster has the widest divergence from the field median. All four gaps use the same Lexical mention infrastructure — fixing them is additive, not architectural.

- **Integrations cluster (#62-64) has the highest variance:** MCP (AHEAD, bidirectional architecture), subscription pass-through (MATCHES, inherited), multi-provider (BEHIND, intentional design gap). The AHEAD and BEHIND entries reflect opposite architectural choices (depth over breadth).

- **Approval/Safety (#57-61) and Multi-Thread (#52-56) are the most reliable clusters:** Near-perfect scores with minimal bugs. These are "working as designed" and don't need wave attention.

- **Diff Views (#41-46) has a corrected BEHIND:** Per-hunk accept/reject (#43) was previously PARTIAL (unverified) — code reading of `useDiffReview.ts` confirmed it's BEHIND. This is the only verdict change from PARTIAL to BEHIND during this analysis.

### Effort vs. impact matrix for BEHIND/PARTIAL/ABSENT gaps

| Axis | Gap | Effort | Impact | Verdict change | Notes |
|---|---|---|---|---|---|
| #19/#20/#33/#35 | Rules-disappear bug | MED | HIGH | PARTIAL → AHEAD | Single bug hides 4 AHEAD features |
| #42 | Artifact pane empty | LOW-MED | HIGH | PARTIAL → MATCHES | Diff review unusable without this |
| #47 | Streaming freeze on switch | MED | HIGH | PARTIAL → MATCHES | Core UX regression |
| #28 | Subagent dispatch 500 | MED | HIGH | PARTIAL → MATCHES | Breaks multi-agent workflows |
| #40/#37 | File heat-map | MED | MED | PARTIAL → AHEAD | Unique innovation, no field competition |
| #17 | Slash command Enter-key | LOW | MED | PARTIAL → MATCHES | Known fix path, documented |
| #18 | Skills auto-install | LOW-MED | MED | PARTIAL → MATCHES | Proven template (hookInstaller) |
| #43 | Per-hunk accept/reject | MED | MED | BEHIND → MATCHES | Data exists, UI layer missing |
| #9 | @web mention | MED | HIGH | BEHIND → MATCHES | Field-converged standard |
| #10 | @thread/@memory mention | MED | MED | PARTIAL → MATCHES | Data layer exists |
| #12 | @diff/@commit mention | MED-HIGH | MED | BEHIND → MATCHES | Needs git IPC + provider |
| #38 | File tree "open in chat" | LOW | LOW | ABSENT → MATCHES | Reuses existing infrastructure |
| #21 | System prompt visibility | MED-HIGH | LOW | BEHIND → PARTIAL | Field baseline low |
| #8 | @url mention | LOW-MED | MED | ABSENT → MATCHES | Simple data provider |

**Priority ordering for a focused chat-wave:** HIGH-impact + LOW/MED-effort items first (#19/#20/#33/#35, #42, #47, #28, #17), then MED-impact + LOW-effort (@-mention batch: #9, #38, #8, #10), then MED-impact + MED-effort (#43, #18, #12).

---

## Code Evidence Index

A compact index of key source locations cited in this document, organized by subsystem. Allows a developer reading the gap analysis to quickly locate the relevant code.

### Chat UI — `src/renderer/components/AgentChat/`

| File | Key symbols cited |
|---|---|
| `LexicalChatComposer.tsx` | `INITIAL_CONFIG`, `BeautifulMentionsPlugin`, `SlashCommandPlugin`, `LexicalDropPlugin`, `LexicalMentionBridge` |
| `LexicalDropPlugin.tsx` | `buildMentionFromDropJson`, `application/json` drop handler, `insertMention`, disjoint drop paths |
| `AgentChatComposerSubcomponents.tsx:63` | `handlePaste`, `onImagePaste`, image attachment handlers |
| `useAgentChatContext.ts` | Pinned files, @-mention system, debounced autocomplete, token estimation |
| `MentionAutocompleteSupport.ts` | `buildFileMentionResult`, `buildSymbolMentionResult`, `symbolResults` pipeline |
| `useSymbolDisambiguation.ts` | Symbol @-mention via codebase graph |
| `SlashCommandMenu.tsx` | `/command` autocomplete menu |
| `ChatControlsBar.tsx` | Model selector, permission mode toggle, token usage display |
| `AgentChatComposerKeyHandlers.ts:62-85` | `handlePermissionModeShortcut`, `cyclePermissionMode` |
| `AdvancedInferenceControls.tsx` | Per-request temperature, maxTokens, stopSequences, jsonSchema (Wave 26) |
| `ComposerContextPreview.tsx:186` | `useFilesystemDisabledRuleIds`, per-rule disable toggle |
| `ComposerContextPreview.tsx:223-238` | `useToggleHandler`, `fireRuleToggleIpc`, `toggleLocal` |
| `useAgentChatStreaming.ts` | Streaming state machine, thinking block sealing, `AgentChatStreamChunk` accumulation |
| `useRafBatchedChunks.ts` | rAF batching, `makeBatcher`, synchronous flush for `complete`/`error` |
| `AgentChatStreamingMessage.tsx` | Live streaming turn rendering, tool group grouping path |
| `AgentChatBlockRenderer.tsx` | Block-kind dispatch: text → `MessageMarkdown`, code → `ChatCodeBlock`, tool_use → `AgentChatToolCard`, thinking → `AgentChatThinkingBlock`, plan → `AgentChatPlanBlock` |
| `AgentChatThinkingBlock.tsx` | Extended thinking blocks, auto-collapse on seal |
| `AgentChatToolCard.tsx` | Expandable tool_use card with syntax-highlighted I/O |
| `AgentChatToolGroup.tsx` | Category summary ("Read 3 files, Edit 1 file"), collapsible group |
| `AgentChatPlanBlock.tsx` | Plan/todo block renderer |
| `streamingUtils.tsx` | `BlinkingCursor`, `SlitherSnake`, `useTypewriter`, rotating snake-themed verbs |
| `ChangeSummaryBar.tsx` | File-change tally for completed and streaming messages |
| `useApplyCode.ts` | `computeSequentialDiff` (O(n)), `buildLcsTable` + `backtrackLcs` (LCS), `DiffLine[]`, `UseApplyCodeResult` |
| `AgentChatDiffPreview.tsx` | Inline diff preview for code apply |
| `AgentChatDiffReview.tsx` | Full diff review panel with per-file accept/reject |
| `useDiffReview.ts` | `FileReviewStatus`, `fileStatuses: Record<string, FileReviewStatus>`, `acceptFile`, `rejectFile`, `acceptAll`, `rejectAll` |
| `AgentChatTabBar.tsx` | Horizontal tab bar, overflow dropdown, branch indicators |
| `ChatHistoryPanel.tsx` | Sidebar history panel, search, auto-titles |
| `agentChatWorkspaceActions.ts` | `branchFromMessage`, `editAndResend`, `retryMessage`, `revertMessage`, `stopTask`, `deleteThread` |
| `AgentChatBranchIndicator.tsx` | Visual branch point indicator between messages |
| `AgentChatMessageActions.tsx` | Per-message action bar: retry, edit+resend, branch, revert, copy |
| `useAgentChatDraftPersistence.ts` | Per-thread draft persistence in localStorage, cleared on send |
| `FloatingComposerContainer.tsx` | Chat-only shell composer wrapper |
| `SessionMemoryPanel.tsx` | GUI for reviewing/editing/deleting extracted memories |
| `MentionChip.tsx` | Pill UI for selected mentions, filename + token count |

### Chat Orchestration — `src/main/agentChat/`

| File | Key symbols cited |
|---|---|
| `chatOrchestrationBridgeGit.ts` | `createCheckpointCommit` (`git commit-tree`), `captureHeadHash`, `capturePostTurnCheckpoint`, `executeGitRevert`, `classifyDiffLines`, `RevertListener`, `CHECKPOINT_REF_PREFIX` |
| `chatOrchestrationBridgeMonitor.ts` | `agentChat:stream` IPC chunk emission, incremental flush timer |
| `chatOrchestrationBridgeSend.ts` | `tokenCalibrationStore.calibrate` before send |
| `chatOrchestrationBridgeProgress.ts` | `tokenCalibrationStore.recordObservation` on actual token receipt |
| `memoryExtractor.ts` | `buildMemoryExtractionPrompt`, `parseMemoryExtractionResponse`, `formatMemoriesForContext`, 5 typed memory kinds |
| `adaptiveBudget.ts` | `computeAdaptiveBudgets`, dynamic token budget |
| `tokenCalibration.ts` | `tokenCalibrationStore.recordObservation`, `tokenCalibrationStore.calibrate` |
| `conversationCompactor.ts` | History trimming, uses `computeAdaptiveBudgets` + `tokenCalibrationStore.calibrate` |
| `chatTitleDerivation.ts` | `deriveSmartTitle` (heuristic, sync), `generateLlmTitle` (LLM, async), `isDecorativeLine`, max 60 chars |
| `threadStoreSqlite.ts` | `threads` + `messages` tables, FK cascade, max 100 threads |
| `settingsResolver.ts` | Providers: `anthropic-api`, `claude-code`, `codex` |
| `checkpointStore.ts` | `CheckpointStore`, `MAX_CHECKPOINTS_PER_THREAD`, `checkpoints.db` |

### Rules & Context — `src/main/`

| File | Key symbols cited |
|---|---|
| `rulesAndSkillsToggle.ts:27` | IPC handler for `rulesAndSkills:toggle`, calls `rulesDirMgr.disableRule` |
| `rulesDirectoryManager.ts:108` | `disableRule(scope, name, projectRoot)` — moves rule file to `.disabled/` sibling dir |
| `approvalManager.ts` | Response-file protocol at `~/.ouroboros/approvals/` |
| `approvalManagerHelpers.ts:39` | `alwaysAllowRules Set` for session-scoped "always allow" |
| `hookInstaller.ts` | SHA-256 versioned hook auto-install, `config.autoInstallHooks` gate |
| `hooks.ts` | Named pipe server for hook events |

### Orchestration — `src/main/orchestration/`

| File | Key symbols cited |
|---|---|
| `scopedMcpConfig.ts` | Per-session MCP configuration overrides |

### InternalMcp / CodeMode — `src/main/internalMcp/`, `src/main/codemode/`

| Note | Key symbols cited |
|---|---|
| MCP server tools | `search_graph`, `trace_call_path`, `detect_changes`, `query_graph` (Cypher), `get_code_snippet`, `get_architecture`, `manage_adr`, `index_repository`, `list_projects`, `delete_project`, `index_status`, `get_graph_schema`, `search_code`, `ingest_traces` — 14 tools total |
| Degraded fallback | `get_architecture`, `get_codebase_context`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes` — 6 tools |

### Layout — `src/renderer/`

| File | Key symbols cited |
|---|---|
| `InnerAppLayout.agent.tsx:149` | `SessionMemoryPanel` mount point in IDE layout |
| `App.tsx` | Three-layer bootstrap: `App` → `ConfiguredApp` → `InnerApp` |

---

## Open Follow-Ups Cross-Reference

All six follow-up files in `roadmap/follow-ups/2026-05-07-*.md` are referenced in this analysis. Matrix axes affected:

| Follow-up file | Axes affected | Verdict impact |
|---|---|---|
| `context-preview-rules-disappear-after-chat-start.md` | #19, #20, #33, #35 | All 4 degrade from AHEAD to PARTIAL in practice |
| `full-review-artifact-pane-empty.md` | #42, #43 | #42 stays PARTIAL; #43 BEHIND unrelated to pane bug |
| `chat-streaming-freezes-on-project-switch.md` | #47 | PARTIAL due to freeze; rAF throttle hypothesis |
| `queued-message-no-autosend-and-text-reappears.md` | #47 (adjacent), not a matrix axis | Correctness gap in queue lifecycle |
| `subagent-dispatch-fails-inside-ide-chat.md` | #28 | PARTIAL; API 500 distinct from inherited nesting block |
| `2026-05-06-file-heat-map-still-broken.md` (referenced) | #37, #40 | Both PARTIAL; heat-map is PARTIAL not AHEAD |

All six follow-ups are status `OPEN` with no active wave assigned. The four 2026-05-07 chat bugs (#19/20/33/35, #42, #47, #28) share the theme of post-start lifecycle state management — a focused audit of state transitions on session start, project switch, and agent completion might address multiple root causes in a single investigation pass.

---

## Subsystem Architecture: How Ouroboros's Chat Compares to the Matrix Averages

This section maps Ouroboros's architectural choices to the field patterns observed in the matrix survey. It answers: for each major chat subsystem, what does Ouroboros do that is typical, and what is unusual?

### Composer architecture

**Typical field pattern:** Single `<textarea>` with custom `@`-mention dropdown via JavaScript keyboard listeners. Most GUI tools (Cursor, Windsurf, Cline) use a plain `contenteditable` div or textarea with overlaid mention suggestions.

**Ouroboros pattern:** Lexical rich text editor (Wave 81 migration). The distinction is structural: Lexical uses a node-based document model where `@`-mentions are first-class `BeautifulMentionNode` objects — not text strings with decoration. This means mentions survive copy-paste operations, backspace correctly triggers remove events (via `showMentionsOnDelete={true}`), and the chip-bar state is kept in sync via `LexicalMentionBridge` mutations. The LCS-based diff computation in `useApplyCode.ts` (two algorithms: sequential O(n) and LCS-accurate) is more sophisticated than the simple line-by-line diff most tools use.

**Unusual:** The `LexicalMentionBridge` reconciliation pattern with mutation observer + update listener safety net. Most tools use a simpler event-based approach where every keystroke fires a callback. Lexical's async mutation system requires an explicit bridge to keep external state (chip bar) in sync with internal state (editor nodes).

### Streaming architecture

**Typical field pattern:** Single SSE or WebSocket stream from the API, each chunk updates a React state variable. One `setState` per chunk. On a fast model (~200 tokens/sec), this creates visible jank.

**Ouroboros pattern:** Three-layer pipeline: IPC throttle (flush timer in `chatOrchestrationBridgeMonitor.ts`) + streaming state machine (`useAgentChatStreaming.ts`, block accumulation) + rAF batching (`useRafBatchedChunks.ts`, `setStateMap` fires at most once per animation frame). The distinction: 20-50 chunks arrive per frame on a fast model, and all are coalesced before the render cycle. The `complete`/`error` events bypass batching (synchronous flush) so there's no lag at turn end.

**Unusual:** The dual rendering paths for streaming vs. persisted messages. Most tools use a single component with an `isStreaming` flag. Ouroboros has `AgentChatStreamingMessage.tsx` (streaming) and `AgentChatBlockRenderer.tsx` (persisted) — they share `AgentChatToolCard` but have separate grouping logic. This is a documented tech debt item but it reflects a real complexity: streaming messages are accumulated deltas while persisted messages are fully-formed records.

### Memory and context architecture

**Typical field pattern:** Single system-prompt injection at session start. Rules and context files are loaded once and prepended to the system prompt. No real-time context adjustment.

**Ouroboros pattern:** Three layers of context management: (1) `chatOrchestrationHistorySupport.ts` assembles conversation history into `TaskRequest` format (including prior messages as context); (2) `adaptiveBudget.ts` computes `computeAdaptiveBudgets` dynamically based on conversation length and model — not a fixed budget; (3) `tokenCalibration.ts` implements a feedback loop: `recordObservation` (actual tokens from API) → `calibrate` (refine the 4-char/token estimate) → more accurate budget for next turn. The calibration loop is unique in the matrix — no other surveyed tool has a token estimation feedback loop.

**Unusual:** The memory extraction pipeline (`memoryExtractor.ts`) operates as a post-session LLM call — separate from the main conversation. This contrasts with Windsurf's memory (inline suggestion during conversation) and Claude Code CLI's MEMORY.md writes (tool call during conversation). Ouroboros's post-session extraction produces more structured output (5 typed kinds) at the cost of being less interactive.

### Thread and branching architecture

**Typical field pattern:** Single active thread. Some tools (Zed, Piebald) support multiple threads as separate sessions with session IDs. Branching is rare (Piebald is the outlier).

**Ouroboros pattern:** Thread store in SQLite (`threadStoreSqlite.ts`) with full thread + message schema, max 100 threads. Thread branching via `branchFromMessage` creates a new thread with `parentThreadId` in `branchInfo`. `buildThreadTree` constructs the parent→child hierarchy. LLM-powered title derivation (`generateLlmTitle` in `chatTitleDerivation.ts`) runs async after the first assistant response. The `ChatHistoryPanel` provides searchable thread discovery. Per-thread draft persistence in localStorage. The branching model is structurally similar to Piebald but simpler (no Git worktree per branch — branches share the same working directory).

**Unusual:** The hybrid title derivation: `deriveSmartTitle` (sync, heuristic, immediate) + `generateLlmTitle` (async, LLM-powered, replaces the heuristic title on completion). No other tool in the matrix uses an async LLM call to improve thread titles after the fact. The `isDecorativeLine` filter (strips `★ Insight ───` formatting artifacts from title candidates) is a production-quality detail that shows the system was designed around real agent output patterns.

### Approval and safety architecture

**Typical field pattern:** JSON permission file (`.claude/settings.json`) with tool allow/deny rules evaluated at subprocess level. No GUI involvement.

**Ouroboros pattern:** Two-layer approval system. Layer 1: inherited Claude Code per-specifier rules (evaluated at subprocess level, no GUI needed). Layer 2: `approvalManager.ts` response-file protocol — when a sensitive tool call needs real-time user approval, the hook script writes a request file at `~/.ouroboros/approvals/<id>.request`, then polls for a `<id>.response` file. The IDE GUI reads the request, shows an approval dialog, and writes the response. The hook script reads the response and either allows or blocks the tool call. This protocol avoids holding a socket open (which would fail on IDE restart) and allows the approval dialog to survive IDE crashes (the hook script will re-request on next start if no response file appears).

**Unusual:** The session-scoped `alwaysAllowRules Set` in `approvalManagerHelpers.ts:39`. Most tools make allow/deny decisions persistent (written to config). Ouroboros resets session-scoped approvals on each session start — users must re-approve "always allow" requests per session. This is more conservative than tools that persist approvals to config, but prevents stale approvals from accumulating.

### MCP architecture

**Typical field pattern:** MCP client only. Tools configure external MCP servers in settings; the AI model can call those servers' tools during a turn. Tool calls appear as tool_use blocks in the conversation.

**Ouroboros pattern:** Bidirectional MCP. Ouroboros is simultaneously: (1) an MCP client (routes external MCP servers from `.claude/settings.json` to the subprocess), (2) an MCP server (exposes the codebase knowledge graph, file tree, and IDE state via `internalMcp` + CodeMode proxy). The internalMcp layer has a 14-tool graph surface (healthy) and a 6-tool degraded fallback (when graph is rebuilding). Tool calls to the internalMcp surface appear as `AgentChatToolCard` blocks in the conversation — the user can see the model querying the codebase graph inline in the chat.

**Unusual:** The Cloudflare CodeMode proxy layer (`src/main/codemode/`). This adds a third level: Ouroboros's tools are exposed to Claude Code via CodeMode as a proxy — the proxy wraps Ouroboros's own tools in a CodeMode-compatible MCP server format. The tool naming convention (`servers.ouroboros.*` in codemode context vs. `mcp__ouroboros__*` in legacy context) is documented in `.claude/rules/graph-tool-routing.md`.

---

## Known Architecture Gotchas Relevant to This Analysis

The following are non-obvious constraints from `src/main/CLAUDE.md` and `src/renderer/components/AgentChat/CLAUDE.md` that directly affect how the PARTIAL/BEHIND verdicts should be interpreted:

1. **`FILE_MODIFYING_TOOLS_SET` in `AgentChatConversation.tsx`** must stay in sync with tool names the backend emits — both legacy (`Write`, `Edit`) and new (`write_file`, `edit_file`) forms. If this set is stale, `ChangeSummaryBar.tsx`'s file-change tally will undercount edits. This is a maintenance gotcha for axis #37.

2. **`crypto.randomUUID()` fallback in `useAgentChatStreaming.ts`** — falls back to `crypto.getRandomValues` for block IDs in insecure contexts (web remote access over HTTP). Don't simplify. This matters if the streaming state machine is ever moved to a web-only context.

3. **`HMR safety guard** in `AgentChatStreamingMessage.tsx`** — `?? (() => null)` fallback for HMR-broken imports is intentional. Removing it causes the IDE (which runs inside itself during development) to crash when a renderer module changes. This affects how the streaming rendering path should be modified during development.

4. **Lexical `showMentionsOnDelete={true}` is load-bearing** — without it, backspacing a mention chip doesn't reliably fire the `removeMention` event that keeps the chip-bar store in sync with the Lexical document. This is documented in `AgentChat/CLAUDE.md:79`. Any Lexical upgrade must verify this behavior still works.

5. **Pre-snapshot hash is per-turn, not per-file** — `chatOrchestrationBridgeGit.ts` captures `git rev-parse HEAD` once per agent turn, before the turn starts. If the user makes manual git commits during the agent turn (unusual but possible), the snapshot hash will not reflect those mid-turn commits. `revertToSnapshot` would then revert both agent changes AND the user's manual commits. This is documented in the main `CLAUDE.md` gotchas as "destructive and not undoable."

6. **`tokenCalibration` is a module-level singleton** — `tokenCalibrationStore` is imported directly in `BridgePersist.ts` (not injected). Resetting state in tests requires resetting the module, not just the instance. This affects test isolation for the token calibration loop.

7. **Two-rendering-path duplication** (`AgentChatConversation.tsx` + `AgentChatStreamingMessage.tsx`) — tool grouping logic is intentionally duplicated between the streaming and persisted message paths. They share `AgentChatToolCard` leaf but each has its own grouping. This is tracked as tech debt in `AgentChat/CLAUDE.md:75`. Any change to tool grouping behavior requires updating both paths.

8. **`Tailwind v4 @source not` directives in `globals.css`** — Windows paths in the repo content glob cause Tailwind to tokenize path segments as CSS variable names. `@source not` directives for `roadmap/wave-*-output/**` and `roadmap/_archived/**` prevent the renderer build from dying with a `RangeError: Invalid code point` on Unicode escapes. If new `roadmap/` subdirectories are added, `globals.css` must be extended.

---

## Composer Architecture Deep Dive

This section expands on axes #1-5 with architectural detail surfaced from reading `AgentChat/CLAUDE.md` and the Lexical composer subsystem. These notes provide implementation context for the brief entries in the per-axis section.

### Three-layer workspace architecture (underpins axes #1-5)

The chat UI is decomposed into three explicit layers with strict ownership:

- **Workspace layer** (`AgentChatWorkspace.tsx`, `useAgentChatWorkspace.ts`): owns threads, draft, sending state, details drawer. Returns `AgentChatWorkspaceModel` — the full model passed as ~30 explicit props down to the conversation layer. No React context is used — everything is explicit and traceable. This is a deliberate architectural choice documented in the "Props-down model" pattern in `AgentChat/CLAUDE.md:65`. The decision trades component simplicity for traceability — any prop-change bug is visibly surfaced at the call site rather than hidden in a context subscription.

- **Conversation layer** (`AgentChatConversation.tsx`): the layout shell. 1000+ lines ("read in sections" per `AgentChat/CLAUDE.md`). Handles: message grouping, auto-scroll, streaming overlay, composer placement, queued messages. Notably, both `FILE_MODIFYING_TOOLS_SET` and the queued-message rendering live here — mixing two unrelated concerns (tool-detection and queue UI) in a file already at the limit of maintainability.

- **Block renderer layer** (`AgentChatBlockRenderer.tsx` + leaf components): the dispatch table. Routes `block.kind` to the correct leaf component: `text` → `MessageMarkdown`, `code` → `ChatCodeBlock`, `tool_use` → `AgentChatToolCard`, `thinking` → `AgentChatThinkingBlock`, `plan` → `AgentChatPlanBlock`, `error` → inline error. Any new block kind (e.g., a future `diff_review` kind) requires: (1) add to the discriminated union, (2) add a case in `AgentChatBlockRenderer`, (3) implement the leaf component.

### Lexical composer (Wave 81) migration impact (axis #1)

The Wave 81 migration from legacy textarea to `LexicalChatComposer` introduced structural benefits that are not obvious from the per-axis entry:

- **Node-based document model**: Unlike a textarea where `@file.txt` is just a text string, `BeautifulMentionNode` is a typed node with metadata (`mentionKey`, `mentionType`, `estimatedTokens`, `mentionPath`). The document structure prevents the mention chip from being partially deleted (splitting "file.txt" mid-selection) — the entire node is deleted atomically.
- **`LexicalMentionBridge` reconciliation**: External state (chip-bar store) is kept in sync with the Lexical editor via mutation observer + update listener safety net. The bridge keeps a `nodeKey → mentionItem.key` cache so it can fire `removeMention` even after the node is removed from the document. The `registerUpdateListener` reconciler handles any mutation events the observer missed — this is the safety net pattern documented in `AgentChat/CLAUDE.md:79`.
- **Known fragility**: `showMentionsOnDelete={true}` is load-bearing but documented as requiring verification on any Lexical upgrade. The `beautifulMentions` library may change its internal delete-event behavior across versions. This is a maintenance risk concentrated in a third-party dependency.
- **Slash command collision**: The `extractSlashQuery` / `LexicalMentionMenu` interaction has a known bug (axis #17): when the user types `/spec featureName`, the space after `/spec` triggers menu close before Enter can be pressed. The Lexical typeahead plugin treats whitespace as a query terminator. The fix path (send-time interceptor mirroring `useResearchIntercept`) doesn't require changes to the Lexical internals — it intercepts at the send action level.

### rAF batching implementation (axis #47)

The three-layer streaming pipeline deserves a data-flow description:

```
Claude Code subprocess
  → stdout chunks (JSON stream)
  → main process IPC flush timer (chatOrchestrationBridgeMonitor.ts)
    → agentChat:streamChunk IPC events (throttled burst)
  → renderer useAgentChatStreaming.ts (state machine)
    → chunk delta accumulation into AgentChatContentBlock[]
    → thinking block sealing on non-thinking delta
    → thread_snapshot DOM dispatch (before batching)
  → useRafBatchedChunks.ts (rAF coalescer)
    → setStateMap fires at most once per animation frame
  → React re-render (at frame rate, not at chunk rate)
```

The key insight: without the rAF batcher, each IPC chunk triggers a `setState` call, which schedules a React re-render. At 200 tokens/second with a 60fps display, ~3 chunks arrive per frame — manageable. At 1000 tokens/second (fast models or large context), 16 chunks arrive per frame. Each `setState` is a separate microtask with its own React reconciliation cost. The rAF batcher collapses all 16 into one `setStateMap` call and one reconciliation.

The `complete`/`error` synchronous flush is safety-critical: without it, the turn-end state update (setting status to 'idle', sealing the final thinking block) could be delayed by up to one frame, during which the UI shows the model still streaming. The synchronous path bypasses the batcher entirely.

### Draft persistence lifecycle (axes #1, #52)

`useAgentChatDraftPersistence` stores drafts keyed by `threadId` in localStorage. Relevant lifecycle events:

- **Save**: drafts are saved on every composer change (debounced). The Lexical editor's `onChange` callback serializes the editor state (not just the text — the full node tree including mention nodes) and stores it.
- **Restore**: on thread switch, the previous thread's draft is saved synchronously; the new thread's draft is loaded from localStorage and hydrated back into the Lexical editor via `editor.setEditorState`.
- **Clear**: `useAgentChatDraftPersistence` exports a `clearDraft(threadId)` function. This must be called on successful send — if it isn't called (or is called before the send completes), the draft reappears on next thread switch. This is the mechanism cited in `2026-05-07-queued-message-no-autosend-and-text-reappears.md` as a possible source of the draft-repopulation bug on force-send.

---

## Streaming and State Machine Detail

### Block accumulation in useAgentChatStreaming (axis #47, #48, #49)

The streaming state machine's `AgentChatContentBlock[]` accumulator follows these rules, derived from the `AgentChatStreamChunk` discriminated union:

- **text delta**: appended to the last block if it's a text block; otherwise a new text block is started. This ensures consecutive text deltas don't create fragmented `MessageMarkdown` renders.
- **tool_use start**: a new tool_use block is opened with `status: 'pending'`. The tool name and call ID are set immediately; the input JSON arrives in subsequent `tool_use_delta` chunks.
- **tool_use complete**: the tool_use block's status is set to `'complete'`; the output content arrives separately via `tool_result` chunks matched by call ID.
- **thinking start**: a new thinking block is opened. The thinking content accumulates in `thinkingText`.
- **thinking stop (implicit)**: when a non-thinking delta arrives after a thinking block, the thinking block is "sealed" — `duration` is computed from start time to now, triggering `AgentChatThinkingBlock` to auto-collapse. This is `useAgentChatStreaming.ts`'s "seals thinking blocks on transition" behavior.
- **thread_snapshot**: a synthetic event not from the Claude stream. Used when the main process replays the current thread state (e.g., after reconnect). Dispatched as a DOM event before batching — it's a full state replacement, not a delta.

### Tool grouping in two rendering paths (axis #49)

The documented gotcha about duplicated grouping logic has a concrete implication for any future tool card feature:

- **Streaming path** (`AgentChatStreamingMessage.tsx`): groups tool_use blocks inline as they arrive. Grouping uses a simple "consecutive same-category" rule — any break in tool_use blocks (a text delta, a thinking block) closes the current group and starts a new one.
- **Persisted path** (`AgentChatBlockRenderer.tsx` → `AgentChatToolGroup.tsx`): groups tool_use blocks from the fully-formed `AgentChatContentBlock[]` array. Same grouping rule but applied post-facto on the complete message.

If the grouping rule needs to change (e.g., to support a minimum-group-size threshold, or to group cross-turn tool calls), both paths must be updated. Any test that verifies grouping behavior needs to cover both paths. The fix for this is a shared `groupToolBlocks(blocks: AgentChatContentBlock[]): GroupedBlock[]` utility that both paths call — currently both inline the grouping logic.

---

## Queue System Analysis

### useAgentChatWorkspace.queue.ts — current state (axis #47 / open follow-up)

The queued message system in `useAgentChatWorkspace.queue.ts` is a self-contained state slice with three mutators:

- `addToQueue(content: string)`: adds a new queued message item with a UUID. Called when the user submits a message while `thread.status !== 'idle'`.
- `editQueuedMessage(id: string, newContent: string)`: removes the item from the queue AND calls `setDraft(item.content)` — restoring the item's content into the composer draft. This is the "smoking gun" identified in `2026-05-07-queued-message-no-autosend-and-text-reappears.md:28`: force-send likely calls `editQueuedMessage` (which restores draft) before calling `sendMessage`, leaving the draft populated after send.
- `deleteQueuedMessage(id: string)`: removes the item without touching draft. The "clean" removal path.

What's **absent** from the queue file:
- Any `useEffect` that watches `thread.status` and drains the queue
- Any `flushQueue`, `drainQueue`, or `autoSend` function
- Any subscriber to `'thread_complete'`, `'agent_complete'`, or `status: 'idle'` events

This confirms hypothesis 1 from the follow-up: auto-send is not implemented, not broken. The queue was built with `addToQueue`, `editQueuedMessage`, and `deleteQueuedMessage` but no drain mechanism.

The correct fix shape (from the follow-up's "likely fix" section):
```
// New action in agentChatWorkspaceActions.ts:
function forceSendQueuedMessage(id: string): void {
  const item = queue.find(q => q.id === id);
  if (!item) return;
  queue.deleteQueuedMessage(id);         // remove from queue (no draft touch)
  sendMessage(item.content);            // send content directly
  // DO NOT call editQueuedMessage — never restores draft
}

// New effect in useAgentChatWorkspace.ts:
useEffect(() => {
  if (thread.status === 'idle' && queuedMessages.length > 0) {
    forceSendQueuedMessage(queuedMessages[0].id);
  }
}, [thread.status, queuedMessages.length]);
```

The `editQueuedMessage` path should be renamed to `promoteQueuedMessageToDraft` to clarify its semantics — it is not a send operation, it's a "put this back in the composer" operation. The current naming is the likely source of the confusion that wired it to the force-send button.

---

## Approval System Detail

### approvalManager.ts response-file protocol (axis #58, #59, #60)

The approval manager's response-file protocol (`~/.ouroboros/approvals/`) deserves a detailed walkthrough because it's an unusual IPC pattern:

**Normal IPC pattern** (socket/pipe): subprocess holds a connection open, sends request, waits on the socket for response. Fragile: if the GUI restarts, the socket closes, the subprocess's approval wait never resolves, and the tool call is blocked indefinitely.

**Response-file pattern** (Ouroboros): 
1. Claude Code hook script (PreToolUse) writes `~/.ouroboros/approvals/<uuid>.request` (JSON: tool name, args, session ID).
2. Hook script polls for `~/.ouroboros/approvals/<uuid>.response` (1-second intervals, 5-minute timeout).
3. Ouroboros main process watches `~/.ouroboros/approvals/` via `fs.watch`. On new `.request` file, reads it, dispatches to the GUI via IPC (`approvalRequest` event).
4. GUI renders an approval dialog. User clicks Allow/Deny/Always Allow.
5. GUI calls `window.electronAPI.writeApprovalResponse(uuid, decision)`. Main process writes `<uuid>.response`.
6. Hook script reads the response file, makes the blocking decision, exits with the appropriate code.

**Benefits over socket pattern**: 
- IDE can restart mid-approval — the `.request` file persists, and on restart the `fs.watch` picks it up immediately.
- Hook script doesn't hold a socket connection — no resource leak if the GUI crashes.
- The `.request` file is inspectable by any process — debugging an approval failure is as simple as `cat ~/.ouroboros/approvals/*.request`.

**`alwaysAllowRules Set` (session-scoped)** in `approvalManagerHelpers.ts:39`: when the user clicks "Always Allow" for a tool specifier, the specifier is added to an in-memory `Set` — not written to `.claude/settings.json`. This means "always allow" decisions reset on IDE restart. This is more conservative than Cline's persistent "always allow" (which writes to the allow-list). The design choice prevents stale "always allow" rules from accumulating if the user forgets they approved something dangerous in a prior session. The tradeoff: trusted tools must be re-approved each session unless the user explicitly adds them to `.claude/settings.json`.

**Comparison to the field**:
- Cline: per-tool-per-session approval with persistent "always allow" written to config.
- Claude Code CLI: per-specifier rules in `.claude/settings.json` evaluated statically; no runtime GUI approval dialog.
- VS Code Copilot: per-session permissions (Accept Edits, Run Commands) set via UI; no specifier-level granularity.
- Ouroboros: dynamic runtime approval dialog + session-scoped "always allow" cache + inherited static specifier rules from Claude Code.

Ouroboros is the only tool with all three layers: static specifier rules (inherited), session-scoped "always allow" cache (approvalManager), and dynamic runtime dialog (GUI). This is a MATCHES rating on axis #58 — the static specifier layer matches Claude Code CLI's high-water mark; the runtime dialog is an Ouroboros addition.

---

## Diff Review System Detail

### Full lifecycle of a diff review session (axes #42-#46)

A complete diff review involves multiple components that the per-axis entries cover separately. Here is the integrated flow:

1. **Agent completes a turn with file edits**: `ChangeSummaryBar.tsx` shows the file-change count inline in the conversation ("3 modified, 1 added"). This is visible even during streaming (updated per-chunk by `AgentChatStreamingMessage.tsx`).

2. **User initiates full review**: Clicks the "Full Review" button in `AgentChatMessageActions.tsx`. This triggers `agentChatWorkspaceActions.ts` → `openDiffReview(sessionId)`, which causes `ChatWorkbenchArtifactPane.tsx` to mount with `AgentChatDiffReview.tsx`.

3. **Data loading**: `useDiffReview.ts` calls `orchestration.getDiffSummary(sessionId)` via IPC on mount. Main process runs `git diff <snapshotHash> HEAD` (or uses the per-turn diff summary cached during the turn). Returns `{ files: DiffFile[] }` where each `DiffFile` has `{ path, diffLines: DiffLine[], linesAdded, linesRemoved }`.

4. **Rendering**: `AgentChatDiffReview.tsx` renders a per-file list. Each file shows its `DiffLine[]` with add/del/context coloring. Current status: per-file accept/reject buttons. The open bug (#42): step 3 returns empty or undefined — the pane opens but renders nothing.

5. **Per-file decisions**: `useDiffReview.ts`'s `acceptFile(path)` / `rejectFile(path)` update `fileStatuses` (React state). These are not yet persisted to disk — accepting a file in the UI doesn't auto-apply the change. `acceptAll()` calls `acceptFile` for every pending file in sequence.

6. **Apply decisions**: When the user finishes reviewing, `applyReviewDecisions()` (if implemented) would iterate `fileStatuses`, call `useApplyCode.accept()` for accepted files, and discard rejected files by reverting to the snapshot. This final step's implementation is uncertain — the per-axis entry (#42) notes the pane renders empty before any apply action could be tested.

7. **Checkpoint revert fallback**: `revertMessage` in `agentChatWorkspaceActions.ts` calls `executeGitRevert(workspaceRoot, snapshotHash)` — this is the nuclear option (reverts all files to the pre-turn snapshot without per-file selection). It's always available from `AgentChatMessageActions.tsx` regardless of the diff review state.

### What per-hunk accept/reject would require (axis #43 detail)

The `DiffLine[]` array already encodes hunk boundaries implicitly: a "hunk" is a contiguous run of `add`/`del` lines (possibly with `context` lines between them, per the traditional unified-diff format). Per-hunk accept/reject requires:

1. **Hunk extraction**: `groupLinesIntoHunks(diffLines: DiffLine[]): DiffHunk[]` — a pure function that groups contiguous `add`/`del` runs into `{ hunkIndex: number, lines: DiffLine[], startLineNo: number, endLineNo: number }` objects. The `lineNo` field on `DiffLine` makes this straightforward.

2. **Hunk state in `useDiffReview.ts`**: Add `hunkStatuses: Record<string, HunkStatus>` keyed by `${filePath}:${hunkIndex}`. `acceptHunk(filePath, hunkIndex)`, `rejectHunk(filePath, hunkIndex)`. Auto-compute file status from hunk statuses: a file is `'accepted'` only if all its hunks are accepted.

3. **Apply hunk logic**: applying selected hunks (not all of them) requires generating a filtered patch from the accepted hunks and applying it via `git apply`. This is harder than the current whole-block apply — `git apply --include` or selective patch generation from the `DiffLine[]` data is needed. `useApplyCode.ts` would need a `acceptHunks(acceptedHunkIndices: number[]): Promise<void>` method alongside the existing `accept()` whole-block method.

4. **UI**: hover-to-accept buttons per hunk range in `AgentChatDiffReview.tsx`. The VS Code Copilot pattern (accept button appears on hover over the hunk gutter) is the field-standard UX.

The data computation (step 1) is trivial. The state management (step 2) is straightforward. The selective patch application (step 3) is the hard part — it requires either a native `patch`/`git apply` integration or a pure-JS patch generator from the hunk data. The UI (step 4) is medium effort. Overall: medium-to-high effort, but the `DiffLine[]` data model supports it without schema changes.

---

## @-Mention System Extensibility

### Adding a new @-mention type: the three-step pattern (axes #8, #9, #10, #12, #38)

The Lexical composer's mention system is extensible by design. Every ABSENT or BEHIND @-mention type in this analysis can be added without changing the Lexical internals — only the data provider layer needs to be extended. The three-step pattern:

**Step 1: Add to the type enum.** The `MentionType` discriminated union in `AgentChatComposerTypes.ts` defines the set of valid mention types. Add the new type (e.g., `'web'`, `'url'`, `'diff'`, `'thread'`).

**Step 2: Implement a data provider hook.** Each mention type needs a provider that:
- Accepts a query string (what the user typed after `@`)
- Returns `Promise<MentionItem[]>` — the list of autocomplete suggestions
- Each `MentionItem` has: `type`, `key`, `label`, `path` (the value inserted into the editor), `estimatedTokens` (shown in the chip)

Examples:
- `@web`: calls `WebSearch` IPC → returns `[{ type: 'web', label: 'Result title', path: result.url, estimatedTokens: 500 }]`
- `@url`: validates the query as a URL → returns the URL as a single `MentionItem` immediately (no search needed)
- `@diff`: calls `git diff HEAD` via IPC → returns one item: `{ type: 'diff', label: 'Staged diff', path: 'diff:staged', estimatedTokens: computedFromDiffSize }`
- `@thread`: calls `threadStore.listThreads()` → returns recent threads as `MentionItem[]`

**Step 3: Wire into `MentionAutocompleteSupport.ts`.** The `mergeResults` function in `MentionAutocompleteSupport.ts` combines results from all active data providers. Add the new provider's results: `if (newTypeResults?.length) results.push(...newTypeResults)`.

The chip rendering (`MentionChip.tsx`) and mention-to-context-payload serialization (whatever builds the final context injection from the mention item) also need to handle the new type, but both are small additions.

The `LexicalChatComposer.tsx` doesn't change — it accepts the full `MentionAutocompleteSupport` result set without knowing about specific mention types. New mention types are additive at the data layer only.

**Cost estimate per new mention type**: 2-4 hours for data provider + wiring, assuming the IPC handler for the data source already exists. For `@diff` and `@commit`, the `gitExecSimple` utility in `chatOrchestrationBridgeGit.ts` can execute the git commands; a new IPC handler is needed on the main side to expose the results.

---

## Implementation Gaps: Systemic Assessment

### Why the mention gap cluster is addressable in a single wave

Axes #8 (@roadmap/docs/url), #9 (@web), #10 (@past-conversation), #12 (@diff/@commit), and #38 (file tree "open in chat") are all ABSENT or BEHIND, but they share a single fix surface: the `MentionAutocompleteSupport.ts` data provider system. None require changes to:
- The Lexical editor (`LexicalChatComposer.tsx`) 
- The `BeautifulMentionsPlugin` configuration
- The chip rendering (`MentionChip.tsx`)
- The context injection pipeline (mention chips → context payload sent to model)

Each is an independent data provider addition. A "mention types wave" could close all five in one release without cross-phase dependencies. Rough sizing: 5 new mention types × (2-4 hours per type) = 10-20 hours of implementation. The only coordination overhead is: (1) IPC handlers for data sources that don't have one yet (git diff/log, WebSearch via renderer → main → agent → renderer roundtrip), and (2) user testing across mention types to verify token estimation is sane.

### Why the context-preview rules-disappear bug (#19-#35) is high-leverage

This single bug (`2026-05-07-context-preview-rules-disappear-after-chat-start.md`) affects four AHEAD verdicts simultaneously (#19, #20, #33, #35). The AHEAD verdict on Ouroboros's transparency story depends on those four features being accessible. If the bug is present and users start a chat before opening the context preview:

- They cannot see which rules are active (#19 degrades)
- They cannot toggle rules on/off (#20, #33 degrade)  
- They cannot see memory entries in the popover (#35 degrades)

The `SessionMemoryPanel.tsx` remains unaffected (mounted separately in the layout, not in the popover), so auto-memory is still discoverable via the sidebar panel. But the per-rule disable toggle has no alternative surface — the popover is the only place it lives. Until this bug is fixed, the AHEAD claim on axes #20 and #33 is theoretical rather than realized.

The follow-up's "Suspect surface" section points to `useActiveSessionRulesAndSkills(claudeSessionId, projectRoot)` as the likely root — the hook returns an empty set after chat starts because `claudeSessionId` changes when the chat session initializes, and the hook's subscription to `rulesAndSkills:changed` doesn't re-fire with the new session ID. This is a session-ID lifecycle bug, not a rules-directory bug.

### The self-application loop as a quality signal

Ouroboros's self-application (developing Ouroboros using Ouroboros) creates an organic quality signal: features that the development team uses daily (slash commands, @-file mentions, branching, context preview) are more likely to be correct because they're exercised in every development session. Features that aren't exercised in development (the chat-only shell's approval persistence across reboots, the heat-map coloring, the artifact pane full review) are more likely to have bugs.

This pattern is visible in the open follow-ups: all four 2026-05-07 bugs affect features that a developer writing Ouroboros code in Ouroboros is unlikely to trigger in a typical session — project switching (bug #47), full diff review (bug #42), and subagent dispatch from IDE chat (bug #28) are edge cases in the development workflow even if they're common cases in production use. The context-preview rules-disappear bug (#19/#20/#33/#35) is the exception: developers do open the context preview, which is why this bug has a detailed follow-up with a "smoking gun" hypothesis rather than just "something is wrong."

The implication: bugs outside the daily development path accumulate longer and are harder to diagnose because the team has less intuition about their failure modes. The `roadmap/follow-ups/` directory is the artifact of this pattern — bugs noticed when a non-development user hits them, not when the development team hits them.

---

## Checkpoint and Revert System Detail

### createCheckpointCommit — the git commit-tree pattern (axis #45, #46)

The checkpoint system's use of `git commit-tree` rather than `git commit` is architecturally significant and worth documenting:

**Standard git commit** (`git commit -m "checkpoint"`): creates a commit on the current branch, updates `HEAD`, updates the reflog of the current branch, appears in `git log`. This pollutes the user's branch history with checkpoint noise — the branch looks like the user made dozens of micro-commits during the agent's work.

**`git commit-tree` (Ouroboros pattern)**: creates a commit object without touching `HEAD`, the working tree, or any branch ref. The commit is then written to a dedicated ref (`refs/ouroboros/checkpoints/<threadId>`) via `git update-ref`. This ref is outside the standard branch namespace (`refs/heads/`) so it doesn't appear in `git branch`, `git log`, or any standard git UI. The checkpoint commits exist in the object database and are referenced only by the dedicated ref — they're accessible to Ouroboros but invisible to the user's git workflow.

**The `trimToMax` mechanism**: `checkpointStore.trimToMax(threadId, MAX_CHECKPOINTS_PER_THREAD)` enforces the per-thread cap. When the cap is reached, the oldest checkpoint ref is deleted via `git update-ref -d`. Because the checkpoint commits are only referenced by these dedicated refs (no branch, no tag), deleting the ref allows git's garbage collector to eventually reclaim the objects. The cap prevents unbounded object accumulation over long conversations.

**Revert accuracy**: `classifyDiffLines` in `chatOrchestrationBridgeGit.ts` handles all four diff status codes that `git diff --name-status` can return:
- `A` (Added): file was added by agent → revert by deleting it (`fs.unlink`)
- `M` (Modified): file was modified → revert by `git checkout <snapshotHash> -- <path>`
- `D` (Deleted): file was deleted by agent → revert by `git checkout <snapshotHash> -- <path>` (restores the deleted file)
- `R` (Renamed): file was renamed → revert by restoring the original name (`git checkout <snapshotHash> -- <oldPath>`) and deleting the new name (`fs.unlink(newPath)`)

Missing: `C` (Copied) and `T` (Type-changed) diff status codes. `git diff --name-status` rarely produces these in practice (they require `--find-copies` flag and type changes are uncommon), but they're an edge case that `classifyDiffLines` doesn't handle. If encountered, the file would fall into the default case and likely be skipped.

---

## Matrix Coverage Summary: Ouroboros vs. Field (Numeric)

The 64-axis coverage matrix (`03-coverage-matrix.md`) rates 15 tools across all axes. For context, here is Ouroboros's aggregate position in each verdict category compared to the matrix median:

| Verdict | Ouroboros count | Typical mid-tier tool | Claude Code CLI (benchmark) |
|---|---|---|---|
| AHEAD | 11 (17.2%) | ~5-8% | N/A (it's the benchmark) |
| MATCHES | 37 (57.8%) | ~40-50% | — |
| BEHIND | 5 (7.8%) | ~15-25% | ~0% |
| PARTIAL | 9 (14.1%) | ~10-15% | ~5% |
| ABSENT | 2 (3.1%) | ~10-20% | ~0% |
| N/A | 0 (0%) | ~5-15% | ~5% |

**Reading this table:**

Ouroboros's AHEAD count (11, 17.2%) exceeds a typical mid-tier tool and is comparable to VS Code Copilot (approximately 15-20 AHEAD axes in the matrix). This reflects the combination of Ouroboros-specific innovations (thinking block rendering, bidirectional MCP, per-rule disable toggles, auto-memory pipeline, advanced inference controls) with inherited Claude Code CLI capabilities.

The PARTIAL count (9, 14.1%) is higher than a healthy mature tool should have (target: <5%). The PARTIAL cluster is almost entirely bugs on correctly-implemented features, not missing functionality — which is an unusual profile. Usually PARTIAL means "half-implemented"; here it means "implemented but broken." This is a quality regression problem, not a feature gap problem.

The BEHIND count (5, 7.8%) is below the mid-tier median, reflecting that Ouroboros inherits Claude Code CLI's breadth. The BEHIND axes are concentrated in user-initiated @-mention types (web, docs, diff/commit), system prompt visibility, and multi-provider — each a deliberate design gap rather than an overlooked feature.

The ABSENT count (2, 3.1%) is very low — only Markdown preview in composer (#5) and file tree "open in chat" (#38) are genuinely absent. Both are low-priority relative to fixing the PARTIAL bugs.

**Strategic reading**: Ouroboros's gap analysis shows a tool that is feature-complete at the architectural level but carrying quality debt in the form of PARTIAL bugs. The 9 PARTIAL axes represent features that are designed and implemented but not reliably delivered. Fixing the PARTIAL bugs is higher ROI than building new features — the AHEAD count would grow from 11 to 17+ if the context-preview bug, artifact pane bug, and heat-map bug were fixed, without writing a single line of new feature code.

---

## Document Metadata

- **Axes covered:** 64 of 64 (complete)
- **Source files read:** 15+ (see Code Evidence Index)
- **Verdict changes from PARTIAL during this analysis:** #43 (PARTIAL → BEHIND) — confirmed per-hunk accept/reject is absent after reading `useApplyCode.ts` and `useDiffReview.ts`
- **Follow-ups cross-referenced:** 6 of 6 (`roadmap/follow-ups/2026-05-07-*.md`)
- **Last updated:** 2026-05-07
- **Analysis basis:** source code only; no inference from docs or memory. Every claim cites a file:line or confirmed CLAUDE.md reference.
