<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
This directory uses a **"workspace model" pattern** — a single hook (`useAgentChatWorkspace`) aggregates all state into one typed `AgentChatWorkspaceModel` object and passes it down as explicit props rather than using React context. This is intentional: it makes data flow traceable via TypeScript (grep for `AgentChatWorkspaceModel` to find all consumers) and avoids the re-render surface area problems that context creates for high-frequency state like streaming deltas.
`─────────────────────────────────────────────────`

Done. The file was cleaned up — the leaking `<!-- claude-md-auto:start -->` block and surrounding generation artifacts (lines 1–13) have been removed. The actual CLAUDE.md content (architecture diagram, key files table, patterns, gotchas, and types reference) is preserved unchanged.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# AgentChat — Multi-threaded chat UI for Claude Code agent conversations

## Architecture

Three-layer decomposition: **Workspace** (state owner) → **Conversation** (layout shell) → **Block renderers** (leaf UI).

```
AgentChatWorkspace          ← mounts hooks, builds model
  ├─ useAgentChatWorkspace  ← thread CRUD, send/stop, details drawer
  ├─ useAgentChatContext    ← pinned files, @mentions, autocomplete
  └─ AgentChatConversation  ← scrollable message list + composer
       ├─ AgentChatStreamingMessage  ← live streaming turn (blocks accumulate)
       ├─ AgentChatBlockRenderer     ← switch on block.kind → leaf component
       ├─ AgentChatComposer          ← textarea + mentions + slash commands + controls
       └─ AgentChatDetailsDrawer     ← linked orchestration session details
```

## Key Files

| File                              | Role                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentChatWorkspace.tsx`          | Top-level mount. Wires workspace model + context model into `AgentChatConversation`.                                                                                                                     |
| `useAgentChatWorkspace.ts`        | Core state hook. Owns threads, draft, sending state, details drawer. Returns `AgentChatWorkspaceModel`.                                                                                                  |
| `agentChatWorkspaceActions.ts`    | Action implementations: `sendMessage`, `branchFromMessage`, `editAndResend`, `retryMessage`, `revertMessage`, `stopTask`, `deleteThread`.                                                                |
| `agentChatWorkspaceSupport.ts`    | Thread state management: `useThreadState`, `useActiveThread`, `useAgentChatEventSubscriptions`, `mergeThreadCollection`.                                                                                 |
| `AgentChatConversation.tsx`       | Message list renderer. Handles message grouping, auto-scroll, streaming overlay, composer placement, queued messages. 1000+ lines — read in sections.                                                    |
| `useAgentChatStreaming.ts`        | Streaming state machine. Accumulates `AgentChatStreamChunk` deltas into `AgentChatContentBlock[]`. Seals thinking blocks on transition.                                                                  |
| `AgentChatStreamingMessage.tsx`   | Renders live streaming turn. Groups consecutive tool_use blocks, shows change summary bar, status messages.                                                                                              |
| `AgentChatBlockRenderer.tsx`      | Block-kind switch: `text` → `MessageMarkdown`, `code` → `ChatCodeBlock`, `tool_use` → `AgentChatToolCard`, `thinking` → `AgentChatThinkingBlock`, `plan` → `AgentChatPlanBlock`, `error` → inline error. |
| `AgentChatComposer.tsx`           | Rich input: textarea with @mention autocomplete, slash commands, image attachments, chat overrides (model/permission mode), context bar.                                                                 |
| `useAgentChatContext.ts`          | Pinned files + @mention system. Token estimation (4 chars/token). Debounced autocomplete against project file index.                                                                                     |
| `streamingUtils.tsx`              | Rotating "Ouroboros" status messages (Slithering, Coiling, etc.), `BlinkingCursor`, `SlitherSnake` SVG animation, `useTypewriter` hook.                                                                  |
| `ChangeSummaryBar.tsx`            | File-change tally (files added/modified/deleted) for both completed and streaming messages.                                                                                                              |
| `AgentChatToolCard.tsx`           | Expandable card for tool_use blocks (Read, Edit, Bash, etc.) with syntax-highlighted input/output.                                                                                                       |
| `AgentChatToolGroup.tsx`          | Collapsible group of consecutive tool_use blocks with category summary.                                                                                                                                  |
| `AgentChatThinkingBlock.tsx`      | Renders extended thinking blocks. Auto-collapses when sealed (duration is set).                                                                                                                          |
| `AgentChatPlanBlock.tsx`          | Renders plan/todo blocks emitted by the agent.                                                                                                                                                           |
| `MessageMarkdown.tsx`             | Markdown renderer for assistant text blocks.                                                                                                                                                             |
| `ChatCodeBlock.tsx`               | Fenced code block with copy button and "Apply" action (delegates to `useApplyCode`).                                                                                                                     |
| `useApplyCode.ts`                 | Apply-code flow: preview diff → apply → accept/reject/revert. Line-based diff computation.                                                                                                               |
| `AgentChatDiffReview.tsx`         | Full diff review panel with per-file accept/reject.                                                                                                                                                      |
| `AgentChatDiffPreview.tsx`        | Inline diff preview for code apply operations.                                                                                                                                                           |
| `useDiffReview.ts`                | State hook for diff review lifecycle (open/close, file accept/reject).                                                                                                                                   |
| `AgentChatTabBar.tsx`             | Horizontal tab bar for thread switching with branch indicators, overflow dropdown.                                                                                                                       |
| `AgentChatThreadList.tsx`         | Vertical thread list (history panel) with tree-structured branch hierarchy.                                                                                                                              |
| `buildThreadTree.ts`              | Builds tree of threads from `branchInfo.parentThreadId` relationships.                                                                                                                                   |
| `ChatHistoryPanel.tsx`            | Sidebar panel for browsing/searching chat history.                                                                                                                                                       |
| `AgentChatMessageActions.tsx`     | Per-message action bar: retry, edit + resend, branch, revert, copy. Separate components for user vs assistant messages.                                                                                  |
| `AgentChatDetailsDrawer.tsx`      | Slide-in drawer showing linked orchestration session details (tokens, changed files, verification).                                                                                                      |
| `AgentChatDetailsSummary.tsx`     | Collapsed summary row for orchestration details (shown inline in conversation).                                                                                                                          |
| `AgentChatBranchIndicator.tsx`    | Visual indicator shown between messages when a branch point exists.                                                                                                                                      |
| `AgentChatContextBar.tsx`         | Bar above composer showing active context files and token count.                                                                                                                                         |
| `agentChatFormatters.ts`          | Timestamp formatting, thread preview text, status labels/tones.                                                                                                                                          |
| `agentChatDetailsSupport.ts`      | Extracts summary data from linked orchestration details (context tokens, changed files, verification).                                                                                                   |
| `useAgentChatLinkedDetails.ts`    | Fetches orchestration session details linked to a thread.                                                                                                                                                |
| `useAgentChatDraftPersistence.ts` | Persists/restores draft text per thread in localStorage. Cleared on send.                                                                                                                                |
| `useAgentChatDefaultView.ts`      | Determines whether to show thread list or conversation on mount.                                                                                                                                         |
| `MentionAutocomplete.tsx`         | @mention dropdown with file/symbol results.                                                                                                                                                              |
| `MentionChip.tsx`                 | Pill UI for selected mentions in composer.                                                                                                                                                               |
| `SlashCommandMenu.tsx`            | `/command` autocomplete menu (clear, compact, new, etc.).                                                                                                                                                |
| `ChatControlsBar.tsx`             | Model selector, permission mode toggle, token usage display.                                                                                                                                             |

## Patterns

- **Props-down model**: `AgentChatWorkspace` builds the full model, passes it as ~30 props to `AgentChatConversation`. No React context — everything is explicit and traceable.
- **Block-based rendering**: Messages are arrays of `AgentChatContentBlock` (text, code, tool_use, thinking, plan, error). `AgentChatBlockRenderer` dispatches by `block.kind`.
- **Streaming accumulation**: `useAgentChatStreaming` listens for `agentChat:streamChunk` events and builds up blocks array. Thinking blocks are "sealed" (given a duration) when a non-thinking delta arrives, triggering auto-collapse.
- **Thread branching**: Threads can branch from any message. `buildThreadTree` constructs parent→child hierarchy from `branchInfo.parentThreadId`.
- **Tool grouping**: Consecutive `tool_use` blocks are auto-grouped into collapsible sections with category summaries (e.g., "Read 3 files, Edit 1 file").
- **HMR safety**: `AgentChatStreamingMessage` guards against HMR-broken imports with `?? (() => null)` fallback. Intentional — don't remove. This app runs inside itself during development.

## Gotchas

- **Two tool rendering paths**: Persisted messages use `AgentChatBlockRenderer` → `AgentChatToolGroup`; streaming messages use `AgentChatStreamingMessage` → inline tool group. They share `AgentChatToolCard` but grouping logic is duplicated. This is tracked in the unified chat rendering plan.
- **`crypto.randomUUID()` fallback** in `useAgentChatStreaming.ts`: Falls back to `crypto.getRandomValues` for block IDs in insecure contexts (web remote access over HTTP). Don't simplify to just `randomUUID()`.
- **`FILE_MODIFYING_TOOLS_SET`** in `AgentChatConversation.tsx` must stay in sync with tool names the backend emits — both legacy (`Write`, `Edit`) and new (`write_file`, `edit_file`) forms.
- **Draft persistence is per-thread**: `useAgentChatDraftPersistence` stores drafts keyed by thread ID in localStorage.

## Types

All chat types from `../../types/electron.d.ts` and `../../types/electron-agent-chat.d.ts`:

- `AgentChatThreadRecord` — thread with messages, branchInfo, status
- `AgentChatMessageRecord` — single message with role, content blocks
- `AgentChatContentBlock` — discriminated union on `kind` field
- `AgentChatStreamChunk` — streaming delta events
- `AgentChatOrchestrationLink` — link to orchestration session details
