# Cross-IDE Frontend/UI Architecture Research

**Date**: 2026-03-19
**Scope**: VS Code, Cursor, Windsurf, Zed, JetBrains vs. Agent IDE (`src/renderer/`)
**Areas**: Chat streaming, Monaco editor, layout panels, themes, command palette, extension store, component decomposition
**Execution plan**: [`plan/renderer-modernization/`](../plan/renderer-modernization/00-overview.md) — 10 phases, 50+ tasks

---

## Executive Summary

| Area | Industry Best-in-Class | Our Status | Gap | Priority |
|---|---|---|---|---|
| **Chat streaming** | RAF-batched buffer, Streamdown markdown, one-component lifecycle | Per-chunk setState (typewriter-smoothed), react-markdown, dual render path | **High** (markdown) / **Medium** (batching) | P1 |
| **Monaco editor** | One editor instance per pane, `setModel()` swaps, `getAlternativeVersionId()` dirty tracking | `key={filePath}` recreates editor per tab, string-comparison dirty check | **High** | P1 |
| **Layout panels** | Proportional weights, real-time resize, serializable grid, context-key focus | Absolute pixels, preview-line resize, CSS flexbox, simple focus context | **Medium** | P2 |
| **Themes** | 50-120 semantic tokens, ANSI 16 in theme contract, editor-specific tokens | 25 tokens, 4 terminal tokens, no editor tokens | **Medium** | P2 |
| **Command palette** | Prefix-routed unified input, serializable when-clauses, frequency tracking | MVVM pipeline (solid), separate pickers, callback when-clauses | **Low-Medium** | P3 |
| **Extension store** | Virtualized list, parallel installs, client-side cache, icon support | Functional but single-install, no cache, emoji icons | **Low** | P3 |
| **Thread branching** | No IDE has shipped this | Full tree-based branching with SQLite persistence | **Ahead** | — |

---

## 1. Chat / AI Message Streaming

### Industry Patterns

**Streaming protocol**: Vercel AI SDK standardized on Server-Sent Events (SSE). VS Code Copilot Chat uses internal extension host communication. Cursor/Windsurf use proprietary backend relays. All converge on the same UI-level pattern: buffer tokens outside React state, flush on RAF cadence.

**Message lifecycle**: Universal consensus — **one component per message, never unmounted**. Vercel AI SDK's `UIMessage` has a `parts` array that grows during streaming; each part has `state: 'streaming' | 'done'`. The same component renders throughout. VS Code pre-allocates reference containers and uses `diff()` to preserve DOM nodes.

**Markdown**: Vercel's **Streamdown** library (2025-2026) is purpose-built for streaming markdown. It auto-closes unterminated blocks, memoizes rendered blocks independently, and handles syntax highlighting via Shiki. Traditional `react-markdown` re-parses the entire document on every update — O(n²) as responses grow.

**Tool calls**: Collapsible groups with progress indicators are universal. Vercel AI SDK 5 adds **tool input streaming** (showing partial arguments as they're generated) and a richer state machine: `input-streaming → input-available → approval-requested → output-available`.

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Streaming delivery | `agentChat:onStreamChunk` IPC → per-chunk `setStateMap()` | No RAF batching — each chunk triggers React state update |
| Message lifecycle | Partially unified — `_streaming` flag on synthetic message, but `AgentChatStreamingMessage` exists as separate component with duplicated tool grouping | Dual render path is tech debt |
| Markdown | `react-markdown` + `remark-gfm`, full re-parse per update | **Largest gap** — no memoized blocks, no incomplete syntax handling, no syntax highlighting |
| Tool rendering | Collapsible groups, category summaries, progress indicators | Strong — minor gap: no tool input streaming |
| State management | Custom hooks + explicit props (~30 props in workspace model) | Defensible but approaching scale threshold for Zustand |
| Virtualization | None (full DOM rendering) | Low priority — fine for typical 5-30 message conversations |
| Thread branching | Full tree-based with persistence, branch indicators, per-message actions | **Ahead of all competitors** — no other IDE has this |

### Recommended Actions

1. **Replace `react-markdown` with Streamdown** — drop-in replacement in `MessageMarkdown.tsx`. Handles incomplete markdown, per-block memoization, syntax highlighting.
2. **Eliminate dual render path** — merge typewriter/cursor from `AgentChatStreamingMessage` into `AssistantBlocksContent` as conditional behaviors triggered by `_streaming` flag. Remove duplicated tool grouping logic.
3. **Add RAF-based chunk batching** — buffer chunks in a ref in `useAgentChatStreaming`, flush to state via `requestAnimationFrame`.

---

## 2. Monaco Editor Tab Management & Model Lifecycle

### Industry Patterns

**VS Code's 4-layer separation**:
| Layer | Responsibility |
|---|---|
| `ITextModel` (ModelService) | Text content, undo stack, language, URI identity |
| `TextFileEditorModel` | Dirty state, disk sync, conflict detection |
| `CodeEditorWidget` / `ViewModel` | Cursor, scroll, viewport, decorations |
| `IEditorGroup` / `IEditorService` | Tab ordering, split panes, editor input resolution |

**Critical pattern**: One `CodeEditorWidget` per pane, swap models via `setModel()`. Multiple widgets can share one `ITextModel` (split views). Models are deduplicated by URI. View state (`saveViewState()` / `restoreViewState()`) is saved before model swap and restored after.

**Dirty tracking**: VS Code uses `getAlternativeVersionId()` — an integer comparison (O(1)) that correctly handles "undo back to clean" without string comparison.

**Conflict resolution**: Three modes — conflict (external modification), error (save failed), orphan (file deleted). Auto-reload for clean files on window focus.

**Zed**: Rust entity system with RAII lifecycle — buffers auto-dispose when no editors reference them. `WeakEntity<Buffer>` prevents circular references.

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Editor instances | `key={filePath}` on `MonacoEditor` — **recreates entire editor widget per tab switch** | **Largest gap** — should reuse one editor, swap via `setModel()` |
| View state | `editorStateStore.ts` serializes to localStorage (LRU 100 entries) | Slow and lossy — should use in-memory `editor.saveViewState()` Map |
| Model dedup | `getOrCreateModel()` correctly uses URI-based dedup | Good |
| Dirty tracking | `model.getValue() !== savedContentRef` — O(n) string comparison | Should use `getAlternativeVersionId()` — O(1) |
| Conflict resolution | `isDirtyOnDisk` flag + `DirtyBanner` exists | No merge/conflict UI wired up |
| Undo on reopen | Models fully disposed on tab close | VS Code caches undo stacks (20MB budget) with SHA1 matching |
| Split view | Separate `MonacoEditor` per split pane | Should share model across two editor widgets |
| Editor registry | Only tracks CodeMirror editors, not Monaco | Monaco editors invisible to IDE tool responders |

### Recommended Actions

1. **Remove `key={filePath}`** — create ONE `monaco.editor.create()` per pane, swap models via `editor.setModel()` on tab switch.
2. **In-memory view state Map** — `editor.saveViewState()` before swap, `restoreViewState()` after. Replace localStorage serialization.
3. **Switch to `getAlternativeVersionId()`** for dirty tracking — O(1) vs O(n).
4. **Register Monaco editors** in the global editor registry so IDE tools can access them.

---

## 3. Layout Panel System

### Industry Patterns

**VS Code**: Custom `SerializableGrid` + `SplitView` — NOT CSS flexbox. Absolute positioning with manual pixel math. `Sash` elements for resize dividers. Supports snap-to-hide. Real-time resize during drag. Proportional sizing (panels maintain ratios on window resize). Persistence via `IStorageService` (workspace-scoped). Focus via context keys with conditional `when` clauses on keybindings.

**Zed**: `Workspace` struct with `left_dock`, `right_dock`, `bottom_dock`, `center_group`. Panels declare valid `DockPosition`s. SQLite persistence. GPUI `FocusHandle` system.

**JetBrains**: `ToolWindow` system with anchor (LEFT/RIGHT/BOTTOM/TOP), weight (0.0-1.0 proportion), 4 view modes (dock pinned/unpinned, float, windowed). Named layouts saved/restored. XML persistence in `.idea/workspace.xml`.

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Layout engine | CSS flexbox + fixed pixel widths | Works but less precise than programmatic layout |
| Resize | Pointer capture → preview line → snap-on-release | Less responsive than real-time resize (VS Code) |
| Sizing model | Absolute pixels per panel | **Breaks on window/monitor resize** — should use proportional weights |
| Persistence | localStorage + electron-store, named presets | Reasonable — main gap is absolute vs proportional |
| Focus | `FocusContext` with Ctrl+1-4, visual outline | No conditional keybinding dispatch based on focus |
| Panel positions | Hardcoded (left sidebar, right sidebar, bottom terminal) | All reference IDEs allow repositioning |
| Snap-to-hide | Not implemented | VS Code auto-collapses when dragged small enough |
| Right sidebar `display:none` | Preserves streaming state when hidden | **Correct** — matches Zed and VS Code pattern |

### Recommended Actions

1. **Proportional sizing** — store sizes as weights (0.0-1.0) rather than absolute pixels. Convert to pixels during layout, recompute on window resize.
2. **Real-time resize** — replace preview-line approach with throttled RAF resize (~16ms intervals).
3. **Snap-to-hide threshold** — if `newSize < MIN * 0.5`, trigger collapse.
4. **Context-aware focus** — add simple `{ key, context, command }` dispatch so the same key does different things based on focused panel.

---

## 4. Theme / Design Token Architecture

### Industry Comparison

| System | UI Tokens | Terminal Tokens | Total | Extension Themes |
|---|---|---|---|---|
| **VS Code** | ~560+ | ~60 (ANSI + chrome) | 600+ | JSON in extension |
| **Zed** | ~78 | ~27 (ANSI palette) | ~120 | Theme family JSON |
| **JetBrains** | ~600+ (component keys) | ~20 | 600+ | Plugin with JSON + XML |
| **Shadcn/ui** | 28 | N/A | 28 | CSS variable overrides |
| **Ours** | 21 | 4 | **25** | `registerExtensionTheme()` |

**Sweet spot**: 50-120 tokens (Zed's range). Below 50, unrelated UI areas share colors. Above 150, theme authoring becomes burdensome.

**Universal pattern**: CSS custom properties on `:root` for runtime switching. Every system converges here — Tailwind v4 adopted this exact approach with `@theme`.

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Token count | 25 (3 surface, 4 text, 2 border, 3 accent, 5 semantic, 2 interactive, 4 terminal, 2 font) | Low end — functional but forces color sharing |
| Terminal ANSI | 4 tokens (bg, fg, cursor, selection) | **Every other IDE includes 16 ANSI colors** in theme contract |
| Editor tokens | None | Missing `editorBg`, `editorLineHighlight`, `editorLineNumber`, `editorSelection`, `editorFindMatch` |
| Architecture | TypeScript Theme interface → `setProperty()` on `:root` → Tailwind utilities | **Correct** — validated by every system studied |
| Extension themes | `registerExtensionTheme()` with full 25-token contract | Works well |
| Theme switching | Batch `setProperty()` calls | Correct — matches industry (no re-renders needed) |

### Recommended Expansion: 25 → ~53 tokens

**New token groups to add** (all additive, no breaking changes):

| Group | Current | Add | New Total |
|---|---|---|---|
| Surfaces | 3 | `bgInput`, `bgOverlay`, `bgCanvas` | 6 |
| Text | 4 | — | 4 |
| Borders | 2 | `borderFocused` | 3 |
| Accent | 3 | `accentForeground` | 4 |
| Semantic | 5 | `info` | 6 |
| Interactive | 2 | `hoverOverlay`, `activeOverlay` | 4 |
| Terminal | 4 | 16 ANSI colors (normal + bright) | 20 |
| Editor | 0 | `editorBg`, `editorLineHighlight`, `editorLineNumber`, `editorLineNumberActive`, `editorSelection`, `editorFindMatch` | 6 |
| **Total** | **25** | **+28** | **~53** |

---

## 5. Command Palette & Keyboard Shortcuts

### Industry Patterns

**VS Code**: Prefix-routed unified input (`>` commands, no prefix = files, `@` symbols, `:` go-to-line, `#` workspace symbols). `QuickAccessController` with provider registration. Full boolean expression DSL for `when` clauses (16 expression types). Multi-chord keybinding support. LRU command history with monotonic counter.

**Zed**: Commands from `window.available_actions()`, fuzzy matching via parallel segment-based scoring across CPU cores. SQLite-backed hit count persistence.

**JetBrains**: `AnAction` system — stateless action objects with `update()` for context-sensitive enable/disable. Multiple keymaps (Default, Eclipse, VS Code, Emacs).

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Architecture | MVVM pipeline (types → state → search → UI) | **Solid** — well-decomposed |
| Prefix routing | Separate components (CommandPalette, FilePicker, SymbolSearch) | Should unify with prefix dispatcher |
| Fuzzy search | Fuse.js with tree flattening and grouping | Adequate — Zed's parallel scoring is fancier but unnecessary at our scale |
| When clauses | `when?: () => boolean` callbacks | Not serializable — blocks extension-contributed conditional commands |
| MRU tracking | localStorage, 5-item list | Works — adding frequency counter would improve ranking |
| Keybinding conflicts | Hardcoded shortcut strings on commands | No context-aware conflict resolution |
| Extension commands | `agent-ide:register-command` CustomEvent bridge | Correct pattern — needs documentation |

### Recommended Actions

1. **Unified prefix routing** — add a `QuickAccessController` that dispatches to providers by prefix. Connect existing pickers as providers.
2. **Serializable when clauses** — replace callbacks with `{ key: string, op: '==' | '!=' | 'in', value: string }` objects that evaluate against a context map.
3. **Frequency-weighted MRU** — replace 5-item list with hit counter per command.

---

## 6. Extension Store UI

### Industry Patterns

**VS Code**: `ExtensionsListView` with virtualized `WorkbenchPagedList` (72px fixed row height). Sophisticated query prefix routing (`@installed`, `@recommended`, category filters). Three-array install state machine (`installing[]`, `installed[]`, `uninstalling[]`). 12-hour update check cycle. Full detail page with README webview, features, changelog, dependencies tabs.

**Zed**: Debounced search (250ms), `id:` syntax for exact match, separate remote vs dev extension lists. Feature upsell banners triggered by keywords. Theme auto-activation on install.

### Our Implementation vs. Gaps

| Aspect | Our Implementation | Gap |
|---|---|---|
| Card metadata | Name, publisher, description, downloads, rating, version, install state | Missing: **real icons** (emoji placeholders), publisher verification badges |
| List rendering | Full DOM render | No virtualization — acceptable for current scale |
| Search | 300ms debounce, 20 items + "Load More" | Appropriate |
| Install state | `installInProgress: string | null` — single install at a time | Should allow **parallel installs** via `installingSet: Set<string>` |
| Caching | None — every search hits IPC bridge | Add TTL-based `Map<string, { data, timestamp }>` |
| Update checking | None | VS Code checks every 12 hours with badge indicator |
| Detail view | Inline expansion with back button | Appropriate for side-panel (simpler than VS Code's full-tab approach) |

---

## 7. Component Decomposition Analysis

### Patterns Where We Align With Industry

- **Feature folders with barrel exports** — matches VS Code, Zed structure
- **Hook decomposition** (`useX.ts` / `useX.effects.ts` / `useX.handlers.ts`) — keeps files under 300 lines, mirrors VS Code's service decomposition
- **Slot-based layout** — `AppLayout` > `InnerAppLayout` with named slots matches VS Code's Part system
- **Two event systems** (IPC + DOM CustomEvents) — well-documented, correctly separated
- **Workspace model pattern** (explicit props, no context for high-frequency state) — better than context for chat streaming

### Anti-Patterns / Concerns

1. **~30 props in `AgentChatConversationProps`** — approaching threshold where a dedicated store would help
2. **Dual tool rendering paths** — duplicated grouping logic in `AgentChatStreamingMessage` vs `AgentChatToolGroup`
3. **`key={filePath}` on Monaco editor** — forces widget recreation per tab switch (most expensive anti-pattern found)
4. **FileTree store migration in progress** — hybrid Zustand + legacy useState creates two sources of truth during transition
5. **Double terminal tab bar** — documented tech debt (TerminalPane + TerminalManager both render headers)

### Where We're Ahead

- **Thread branching** — no competitor has shipped this
- **Message queuing** — full queue-while-busy with edit/delete/send-now
- **Per-thread streaming isolation** — `Map<threadId, StreamingState>` handles concurrent streams correctly
- **HMR safety guards** — necessary for meta-development (building IDE inside itself)
- **Passive graph context injection** — structural awareness in context packets

---

## Priority Roadmap

### P1 — High Impact, Clear Path

| # | Action | Files | Impact |
|---|---|---|---|
| 1 | **Replace `react-markdown` with Streamdown** | `MessageMarkdown.tsx` | Fixes O(n²) streaming markdown, adds syntax highlighting |
| 2 | **Reuse Monaco editor instance** — `setModel()` instead of `key={filePath}` | `MonacoEditor.tsx`, `FileViewerChrome.tsx` | Eliminates most expensive anti-pattern |
| 3 | **Switch to `getAlternativeVersionId()`** for dirty tracking | `MonacoEditor.tsx` | O(1) vs O(n) on every keystroke |

### P2 — Medium Impact, Moderate Effort

| # | Action | Files | Impact |
|---|---|---|---|
| 4 | Eliminate dual chat render path | `AgentChatStreamingMessage.tsx`, `AgentChatBlockRenderer.tsx` | Removes duplicated tool grouping, simplifies maintenance |
| 5 | Proportional panel sizing (weights not pixels) | `useResizable.ts`, `AppLayout.tsx` | Panels survive window/monitor resize |
| 6 | Expand theme tokens 25→53 | `themes/*.ts`, `tailwind.config.ts` | ANSI terminal colors, editor tokens |
| 7 | RAF-batched streaming chunks | `useAgentChatStreaming.ts` | Prevents per-token re-renders under burst |

### P3 — Lower Impact, Good Polish

| # | Action | Files | Impact |
|---|---|---|---|
| 8 | Unified command palette prefix routing | `CommandPalette/`, `FilePicker`, `SymbolSearch` | Single input for all navigation |
| 9 | Parallel extension installs | `extensionStoreModel.ts` | UX improvement |
| 10 | Register Monaco in editor registry | `editorRegistry.ts` | IDE tools can access Monaco content |
| 11 | Client-side extension store cache | `extensionStoreModel.ts` | Reduces redundant IPC |
| 12 | Serializable `when` clauses | `types.ts`, `useCommandRegistry.ts` | Enables extension-contributed conditional commands |

---

## Sources

### Chat/Streaming
- [Vercel AI SDK 5/6 Blog](https://vercel.com/blog/ai-sdk-5)
- [Streamdown by Vercel](https://github.com/vercel/streamdown)
- [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)
- [Cline Architecture (DeepWiki)](https://deepwiki.com/cline/cline/1.3-architecture-overview)
- [From O(n²) to O(n): Streaming Markdown Renderer](https://dev.to/kingshuaishuai/from-on2-to-on-building-a-streaming-markdown-renderer-for-the-ai-era-3k0f)

### Monaco Editor
- [VS Code ModelService Source](https://github.com/microsoft/vscode)
- [@monaco-editor/react Patterns](https://github.com/suren-atoyan/monaco-react)
- [Zed BufferStore (DeepWiki)](https://deepwiki.com/zed-industries/zed)

### Layout
- [VS Code SerializableGrid / SplitView Source](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/splitview/splitview.ts)
- [Zed Panel System Blog](https://zed.dev/blog/new-panel-system)
- [JetBrains Tool Windows SDK](https://plugins.jetbrains.com/docs/intellij/tool-windows.html)

### Themes
- [VS Code Theme Color Reference](https://code.visualstudio.com/api/references/theme-color)
- [Zed schema.rs](https://github.com/zed-industries/zed/blob/main/crates/theme/src/schema.rs)
- [Shadcn Theming Docs](https://ui.shadcn.com/docs/theming)
- [Tailwind v4 @theme Directive](https://tailwindcss.com/docs/theme)
- [Martin Fowler: Design Token-Based UI Architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html)

### Command Palette
- [VS Code CommandsRegistry / KeybindingResolver Source](https://github.com/microsoft/vscode)
- [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Zed Command Palette (DeepWiki)](https://deepwiki.com/zed-industries/zed)
- [JetBrains Action System SDK](https://plugins.jetbrains.com/docs/intellij/basic-action-system.html)

### Extension Store
- [VS Code Extensions API Source](https://github.com/microsoft/vscode)
- [JetBrains Plugin SDK](https://plugins.jetbrains.com/docs/intellij/plugins-quick-start.html)
