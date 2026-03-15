# Chat Pane Modernization Plan

> **Goal**: Bring the agent chat to Claude.ai/Cursor-level quality with best-in-class streaming, tool visualization, diff review, and context management.
> **Current state**: Custom React chat with streaming (typewriter animation), tool cards, diff preview, @mention autocomplete, thread management, details drawer, draft persistence, orchestration bridge.
> **Target state**: Production-grade streaming with Streamdown, collapsible thinking blocks, Apply button with inline diff preview, conversation branching UI, plan/todo mode, checkpoint system, @assistant-ui/react integration (or equivalent patterns).

---

## Architecture Decisions

### Streaming: Streamdown + Custom Block Renderer
Current streaming uses a typewriter animation (~15 chars/frame). This is a workaround for chunked delivery, not true token-by-token streaming. Replace with **Streamdown** (Vercel's streaming markdown renderer) which:
- Handles incomplete/unterminated markdown gracefully during streaming
- Uses Shiki for syntax highlighting (matches the file viewer's engine)
- Memoizes rendering — only re-renders changed portions
- Purpose-built for AI streaming, not general markdown

### Message Architecture: Content Blocks
Move from flat `content: string` messages to structured content blocks:
```ts
type ContentBlock =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string; duration?: number; collapsed?: boolean }
  | { kind: 'tool_use'; tool: string; input: unknown; status: 'running' | 'complete' | 'error'; output?: string }
  | { kind: 'tool_result'; toolUseId: string; content: string }
  | { kind: 'code'; language: string; content: string; filePath?: string; applied?: boolean }
  | { kind: 'diff'; filePath: string; hunks: DiffHunk[]; status: 'pending' | 'accepted' | 'rejected' }
  | { kind: 'plan'; steps: PlanStep[]; completedCount: number }
  | { kind: 'error'; code: string; message: string; recoverable: boolean }
```

### Chat Framework: Build on Current Foundation (Not @assistant-ui)
After analysis, replacing the entire chat with @assistant-ui/react would require rewriting the orchestration bridge, thread store, and streaming layer. The current architecture is sound. Instead, adopt **specific patterns** from @assistant-ui and Cursor:
- Structured content blocks (above)
- Apply button workflow
- Thinking block collapse
- Conversation branching UI

---

## Phases

### Phase 1: Streaming and Rendering Upgrade
**Parallelizable**: 1A and 1B are independent; 1C depends on both.

#### 1A. Integrate Streamdown for Markdown Rendering
- **Files**: `package.json`, new `src/renderer/components/AgentChat/MessageMarkdown.tsx`
- **Steps**:
  1. `npm install streamdown`
  2. Create `MessageMarkdown.tsx` that wraps Streamdown with:
     - Shiki highlighter instance (reuse from file viewer's singleton)
     - Custom code block renderer with copy button, language label, line numbers
     - LaTeX rendering via KaTeX (if needed)
     - Link handling (open in external browser via Electron shell)
  3. Replace current inline markdown parsing in `AgentChatConversation.tsx`
  4. Pass `isStreaming` prop — Streamdown handles incomplete blocks automatically
- **Edge cases**:
  - Streamdown expects a string that grows over time — ensure the streaming layer appends rather than replaces
  - Shiki highlighter must be initialized before first render — handle loading state
  - Very long code blocks (1000+ lines) — add virtual scrolling or "show more" truncation
  - Mermaid diagrams — add `mermaid` as an optional renderer for fenced `mermaid` blocks
  - HTML in markdown — sanitize with DOMPurify (already in project for MarkdownPreview)

#### 1B. Structured Content Block Model
- **Files**: `src/renderer/types/electron-agent-chat.d.ts`, `useAgentChatStreaming.ts`, `agentChatWorkspaceSupport.ts`
- **Steps**:
  1. Define `ContentBlock` union type (as above)
  2. Update `AgentChatMessageRecord` to include `blocks?: ContentBlock[]` alongside existing `content: string`
  3. Update streaming hook to parse incoming chunks into typed blocks:
     - `text_delta` → append to last `text` block
     - `thinking_delta` → append to `thinking` block
     - `tool_activity` (running) → create `tool_use` block
     - `tool_activity` (complete) → update existing `tool_use` block status
     - `content_block_stop` → seal current block
  4. Update thread store serialization to persist blocks
  5. Backward compatibility: if `blocks` is absent, render `content` as single text block
- **Edge cases**:
  - Interleaved thinking between tool calls (Claude 4 models) — thinking blocks can appear between tool_use blocks
  - Tool use with no tool_result — show as "pending" until result arrives
  - Empty text blocks between tool calls — filter out
  - Block ordering must match emission order — use array index, not timestamps

#### 1C. Content Block Renderers
- **Files**: New `AgentChatBlockRenderer.tsx`, update `AgentChatConversation.tsx`
- **Implementation**:
  1. Dispatch on `block.kind`:
     - `text` → `<MessageMarkdown content={block.content} isStreaming={...} />`
     - `thinking` → `<ThinkingBlock>` (see 1D)
     - `tool_use` → `<ToolCard>` (existing, enhanced)
     - `code` → `<CodeBlock>` with Apply button (see Phase 2)
     - `diff` → `<DiffBlock>` with accept/reject (see Phase 2)
     - `plan` → `<PlanBlock>` with checklist (see Phase 3)
     - `error` → `<ErrorBlock>` with retry action
  2. Each renderer is a standalone component — can be developed/tested independently
- **Edge cases**:
  - Unknown block kinds (future-proofing) — render as raw JSON in a collapsed "debug" view
  - Very many blocks in one message — virtualize if > 50 blocks

#### 1D. Thinking Block Component
- **Files**: New `AgentChatThinkingBlock.tsx`
- **Implementation**:
  1. During streaming: auto-expanded, showing thinking text with a subtle pulsing border
  2. On completion: auto-collapse to single line showing "Thought for Xs" with chevron toggle
  3. Collapsed: show duration badge, click to expand
  4. Expanded: show full thinking text in a muted, distinct style (lighter text, different background)
  5. Never show thinking in "copy message" — only copy visible text blocks
- **Edge cases**:
  - Very long thinking (10K+ tokens) — truncate with "show full thinking" button
  - Thinking with no follow-up text — still collapse, but don't hide (user needs to see the model thought)
  - Multiple thinking blocks in one message — each independently collapsible

---

### Phase 2: Code Actions and Diff Review
**Depends on**: Phase 1 (content blocks)
**Parallelizable within phase**: 2A, 2B, 2C are independent.

#### 2A. Apply Button on Code Blocks
- **Files**: Update code block renderer in `MessageMarkdown.tsx`, new `useApplyCode.ts`
- **Implementation**:
  1. Parse code blocks for file path hints:
     - Fenced blocks with filename: ` ```ts src/main/config.ts `
     - Preceding text like "in `src/main/config.ts`:"
     - If no path detected, show "Apply to..." file picker
  2. "Apply" button in code block header:
     - Click → compute diff between current file content and code block content
     - Show inline diff preview (green/red) in a slide-down panel below the code block
     - "Accept" applies the change (writes to file via IPC)
     - "Reject" dismisses the diff preview
     - "Edit" opens the file in the inline editor with the diff highlighted
  3. Track applied state per code block — show "Applied" badge, disable re-apply
  4. Undo: keep the original content, offer "Revert" within 30 seconds
- **Edge cases**:
  - Code block is a partial file (function, not full file) — use fuzzy matching to find insertion point
  - File doesn't exist — "Apply" creates it (with confirmation)
  - File has been modified since the code was generated — show three-way diff
  - Multiple code blocks for the same file — apply sequentially, each seeing the result of the previous
  - Binary files — disable Apply button

#### 2B. Inline Diff Review for Agent Changes
- **Files**: New `AgentChatDiffReview.tsx`, `useDiffReview.ts`
- **Implementation**:
  1. When an agent task completes, collect all file changes (from orchestration diff summary)
  2. Show a "Review Changes" panel at the bottom of the conversation:
     - File list with change counts (+N/-M per file)
     - Click file → show side-by-side or inline diff
     - Per-hunk accept/reject buttons
     - "Accept All" / "Reject All" bulk actions
  3. Diff rendering options:
     - **Inline**: additions/deletions interleaved (default for small changes)
     - **Side-by-side**: old on left, new on right (for larger changes)
     - Toggle between modes
  4. After review: "Commit Changes" button that stages accepted files and opens commit dialog
- **Edge cases**:
  - Agent modified a file that was already dirty in the editor — merge with editor state
  - Agent deleted a file — show "File deleted" with undo option
  - Agent created a new file — show full content as "added"
  - Large diffs (1000+ lines) — paginate or virtualize
  - Binary file changes — show "Binary file changed" placeholder

#### 2C. Enhanced Tool Cards
- **Files**: `AgentChatToolCard.tsx`, `AgentChatDiffPreview.tsx`
- **Enhancements**:
  1. **Grouped tool calls**: Consecutive tools of the same type collapse into a summary
     - "Read 5 files" with expandable list
     - "Edited 3 files" with per-file diff previews
  2. **Execution timing**: Show duration for each tool call
  3. **Input preview**: Truncated view of tool input (e.g., bash command, file path)
  4. **Error detail**: Expandable error output with syntax highlighting
  5. **Cancel running tool**: Stop button on in-progress tools
  6. **Retry failed tool**: Re-execute with same inputs
- **Edge cases**:
  - Tool call timeout — show "Timed out after Xs" with retry option
  - Tool output very large — truncate with "show full output" (max 500 lines default)
  - Nested tool calls (subagent tools) — indent or show parent context

---

### Phase 3: Context and Conversation Features
**Depends on**: Phase 1 (block model)
**Parallelizable within phase**: All tasks independent.

#### 3A. @-Mention System Upgrade
- **Files**: `AgentChatComposer.tsx`, new `MentionAutocomplete.tsx`
- **Current**: Basic @-mention with 150ms debounce, 8 results max
- **Upgrade**:
  1. **Multiple mention types** with prefix indicators:
     - `@file` — files (current behavior, enhanced)
     - `@symbol` — functions, classes, types (from symbol extractor)
     - `@folder` — directories
     - `@terminal` — paste terminal output as context
     - `@diff` — include current git diff
     - `@commit` — reference a git commit
  2. **Visual chips**: Each mention renders as a removable tag in the input area
     - Show icon + truncated path
     - Click to preview content
     - X button to remove
  3. **Token budget indicator**: Show estimated token count of all mentions
  4. **Drag-and-drop from file tree**: Drop a file onto the composer to add as mention
- **Edge cases**:
  - Mention a file that gets deleted before send — detect and warn
  - Mention a very large file — warn about token budget impact
  - Escape characters in file paths — properly encode
  - Multiple mentions of the same file — deduplicate

#### 3B. Conversation Branching UI
- **Files**: `AgentChatConversation.tsx`, `AgentChatMessageActions.tsx`, `AgentChatTabBar.tsx`
- **Current**: Branch exists in backend but UI is minimal (button in message actions)
- **Upgrade**:
  1. **Fork icon on every assistant message**: "Branch from here" visible on hover
  2. **Branch indicator in tab bar**: Show branch relationship (parent → child)
  3. **Branch tree visualization**: In thread list, show branching structure
     - Root thread at top
     - Child branches indented with connecting lines
     - Click any branch to switch
  4. **Compare branches**: Side-by-side view of two conversation branches
  5. **Merge insight**: After branching, show "This branch diverges from [parent] at message N"
- **Edge cases**:
  - Deep branching (branch of branch of branch) — cap at 5 levels, warn user
  - Branch from a message that has tool calls — include tool results in branch context
  - Deleting a parent thread — orphan branches become root threads

#### 3C. Plan Mode and Todo Lists
- **Files**: New `AgentChatPlanBlock.tsx`, update orchestration bridge
- **Implementation**:
  1. When mode is "plan", the agent outputs a structured plan:
     ```ts
     { kind: 'plan', steps: [
       { id: string, title: string, status: 'pending' | 'running' | 'complete' | 'failed', detail?: string }
     ]}
     ```
  2. Render as an interactive checklist:
     - Pending: empty checkbox, gray text
     - Running: spinner, highlighted text
     - Complete: green checkmark, muted text
     - Failed: red X, error message
  3. User can:
     - Reorder steps (drag-and-drop)
     - Edit step titles
     - Add/remove steps
     - Click "Execute Plan" to run all steps sequentially
  4. During execution, the plan block live-updates as each step completes
- **Edge cases**:
  - Plan step that takes very long — show elapsed time, offer cancel
  - Step that modifies files needed by later steps — sequential execution enforced
  - User modifies plan during execution — queue changes, apply after current step

#### 3D. Checkpoint System
- **Files**: New `useCheckpoints.ts`, `CheckpointIndicator.tsx`
- **Implementation**:
  1. Before each agent task, auto-create a git checkpoint:
     - `git stash push -m "ouroboros-checkpoint-{timestamp}"` OR
     - Create a lightweight tag `ouroboros/checkpoint/{id}`
  2. Show checkpoint markers in the conversation timeline
  3. "Revert to checkpoint" button on each marker
  4. Revert flow:
     - Show what will change (diff from checkpoint to current)
     - Confirm dialog
     - Apply revert (git checkout or stash pop)
     - Update conversation status
  5. Auto-cleanup: remove checkpoints older than 24 hours (configurable)
- **Edge cases**:
  - Dirty working tree at checkpoint time — stash uncommitted changes separately
  - Revert when files have been created/deleted since checkpoint — handle untracked files
  - Revert to checkpoint of a different branch — warn and prevent
  - Multiple checkpoints close together — batch into one if < 5 seconds apart

---

### Phase 4: Visual Polish
**Parallelizable with all phases. No dependencies.**

#### 4A. Message Animations and Transitions
- **Files**: CSS/Tailwind updates, component animation props
- **Implementation**:
  1. New message slide-in: 200ms ease-out from bottom
  2. Streaming cursor: blinking pipe at end of streaming text (replace current bounce dots)
  3. Tool card expand/collapse: 150ms height transition
  4. Thinking block collapse: 200ms with content fade
  5. Status transitions: subtle color pulse on status badge changes
  6. Auto-scroll behavior: smooth scroll during streaming, snap when user is at bottom

#### 4B. Code Block Chrome
- **Files**: Update code block renderer
- **Implementation**:
  1. Language label (top-left)
  2. File path (if detected, as breadcrumb)
  3. Line numbers (toggleable)
  4. Word wrap toggle
  5. Copy button (top-right) with "Copied!" feedback
  6. Apply button (if file path detected)
  7. "Open in editor" button
  8. Diff indicator (if this is a modification of existing code)

#### 4C. Empty States and Onboarding
- **Files**: `AgentChatConversation.tsx`
- **Implementation**:
  1. Empty conversation: Show suggested prompts relevant to current project
     - "Explain the architecture of this project"
     - "Find and fix bugs in [recently changed file]"
     - "Write tests for [current file]"
  2. No project open: Show "Open a project folder to get started"
  3. First-time use: Brief tour overlay explaining chat features

---

## Parallel Execution Map

```
Phase 1:
  [1A: Streamdown] ──────┐
  [1B: Content blocks]   ├─→ [1C: Block renderers] ──→ Phase 2 & 3
  [1D: Thinking blocks]  ─┘   (1D can start with 1B)

Phase 2 (parallel, after Phase 1):
  [2A: Apply button]
  [2B: Diff review panel]
  [2C: Enhanced tool cards]

Phase 3 (parallel, after Phase 1):
  [3A: @-mention upgrade]
  [3B: Branching UI]
  [3C: Plan mode]
  [3D: Checkpoint system]

Phase 4 (parallel with everything):
  [4A: Animations]
  [4B: Code block chrome]
  [4C: Empty states]
```

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Streamdown bundle size or compatibility | LOW | It's lightweight and Vercel-maintained; fallback to react-markdown |
| Content block migration breaks existing threads | MEDIUM | Backward-compatible: render `content` string if no `blocks` array |
| Apply button file-matching heuristic fails | MEDIUM | Always offer manual file picker as fallback |
| Checkpoint system conflicts with user's git workflow | HIGH | Use lightweight tags (not branches), auto-cleanup, configurable |
| Diff review for large changesets slow | MEDIUM | Virtualize diff rendering, paginate file list |
| Thinking blocks expose private reasoning | LOW | Allow users to hide thinking blocks globally in settings |
