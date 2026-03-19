<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
The `FileViewerManager` follows a classic context-provider split: the `.tsx` file is just 21 lines — a context creator + `useContext` hook. All the real logic (781 lines) lives in `.internal.ts`. This pattern keeps the public API surface tiny while allowing the internal state machine to grow without touching consumers.

`ContentRouter.tsx` uses a priority chain (array of renderer functions, first truthy result wins) instead of nested `if/else`. This makes the dispatch order explicit and easy to insert/reorder.
`─────────────────────────────────────────────────`

Here is the generated CLAUDE.md content:

---

<!-- claude-md-auto:start -->

# FileViewer — Multi-format file viewer and editor system

## Architecture

```
FileViewerManager (Context provider — tab state, open/close/save/dirty/split logic)
  └─ FileViewer (entry — binary dispatch OR FileViewerChrome)
       ├─ ImageViewer / PdfViewer / HexViewer  (binary formats, no editor)
       └─ FileViewerChrome (layout shell: toolbar + content + status bar)
            ├─ FileViewerToolbar, ViewModeBar, DirtyBanner, GoToLine
            ├─ ContentRouter  ← priority chain; first truthy branch wins
            │    ├─ MonacoEditor (primary editor, USE_MONACO=true)
            │    ├─ MonacoDiffEditor (side-by-side diff)
            │    ├─ ClaudeMdEditor (always CodeMirror — bypasses USE_MONACO)
            │    ├─ InlineEditor (legacy CodeMirror fallback)
            │    ├─ CommitHistory / MarkdownPreview / ConflictResolver
            │    └─ CodeView (legacy Shiki read-only)
            ├─ SymbolOutline (collapsible side panel)
            ├─ SearchBar, BlameGutter, Minimap, SemanticScrollbar
            └─ StatusBar
```

## Key Files

| File                            | Role                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileViewerManager.tsx`         | 21-line Context provider shell; exposes `useFileViewerManager()` hook                                                                                      |
| `FileViewerManager.internal.ts` | All tab state: `OpenFile[]`, `SplitState`, open/close/save/pin/preview logic. Exports `OpenFile` and `SplitState` types.                                   |
| `FileViewer.tsx`                | Entry component — type-detects file → routes binary to specialized viewer, text to `FileViewerChrome`                                                      |
| `ContentRouter.tsx`             | Priority-chain dispatch: edit > history > preview > diff > conflict > code (read-only). `USE_MONACO` flag at line 21.                                      |
| `useFileViewerState.ts`         | "Brain" hook — aggregates all UI state (view mode, edit mode, folds, blame, search, conflicts, keyboard). Single object passed through `FileViewerChrome`. |
| `useFileViewerState.helpers.ts` | Pure factory/derived-state helpers extracted from the state hook                                                                                           |
| `MonacoEditor.tsx`              | Monaco wrapper — lifecycle, dirty tracking, Ctrl+S keybinding, vim/emacs mode, scroll persistence                                                          |
| `monacoSetup.ts`                | `initMonaco()` (workers) + `detectLanguage()` (extension → language ID map)                                                                                |
| `monacoThemeBridge.ts`          | Reads CSS custom properties → hex via canvas 2d context → builds `IStandaloneThemeData` for Monaco                                                         |
| `monacoVimMode.ts`              | vim/emacs mode toggling via `monaco-vim`                                                                                                                   |
| `editorRegistry.ts`             | Global `Map<filePath, EditorView>` — lets `useIdeToolResponder` read CodeMirror content without ref threading                                              |
| `dirtyCloseFlow.ts`             | Save/discard/cancel logic when closing a dirty tab. Drives `DirtyCloseDialog`.                                                                             |
| `editorStateStore.ts`           | Persists Monaco scroll position + cursor per file path across navigations                                                                                  |
| `MultiBufferManager.tsx`        | Context provider for Zed-style multi-buffer views (multiple file excerpts in one scrollable tab)                                                           |
| `SearchBar.tsx`                 | Thin shell; logic split across `SearchBar.controller.ts`, `SearchBar.search.ts`, `SearchBar.panel.tsx`                                                     |

## File Naming Conventions

| Suffix           | Meaning                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `.view.tsx`      | Pure view layer — receives all props, no internal state (`ConflictResolver.view.tsx`, `CommitHistory.view.tsx`) |
| `.model.ts`      | Data/state model, no JSX (`CommitHistory.model.ts`, `ClaudeMdEditor.model.ts`)                                  |
| `.parts.tsx`     | Sub-components split out for size (`ImageViewer.parts.tsx`, `SearchBar.parts.tsx`)                              |
| `.shared.ts/tsx` | Shared between multiple consumers (`SymbolOutline.shared.ts`, `SemanticScrollbar.shared.tsx`)                   |
| `.chrome.tsx`    | Outer layout/shell of a feature (`ClaudeMdEditor.chrome.tsx`)                                                   |
| `.sidebar.tsx`   | Sidebar/panel variant (`ClaudeMdEditor.sidebar.tsx`)                                                            |
| `.cm.ts`         | CodeMirror extension modules (`InlineEditor.cm.ts`, `.cm.theme.ts`, `.cm.language.ts`)                          |

## Gotchas

- **`USE_MONACO` flag** (`ContentRouter.tsx:21`) — set to `false` to revert the entire editing stack to legacy Shiki/CodeMirror. Currently `true`. Affects both read-only and edit modes.
- **Monaco must not be statically imported in `FileViewerManager.internal.ts`** — it uses `require('monaco-editor')` for model disposal specifically to avoid loading ~40MB at startup. Don't convert to a static import.
- **Two editor systems coexist**: Monaco (primary) and CodeMirror (for `InlineEditor`, `ClaudeMdEditor`, and as fallback). `editorRegistry.ts` only tracks CodeMirror instances — not Monaco.
- **`ClaudeMdEditor` always uses CodeMirror** regardless of `USE_MONACO`. It has custom extensions and is never routed through `MonacoEditor`.
- **Theme bridging is renderer-process-only** — `monacoThemeBridge.ts` uses `getComputedStyle()` and a canvas 2d context for hex conversion. Cannot run in main process.
- **`useFileViewerState` resets on filePath change** — all per-file UI state (edit mode, go-to-line, search, blame, history) clears on navigation. Never use it for cross-file state.
- **Tab preview semantics**: single-click opens a preview tab (italic, auto-replaced on next open). Double-click or any edit pins it. Pinned tabs sort left.
- **`ContentRouter` priority**: edit mode always wins. The renderer array runs in order — inserting a new branch must respect this priority.
- **Conflict resolution uses a DOM CustomEvent** (`agent-ide:reload-file`), not Electron IPC, to trigger file refresh after merge.
- **Split view** state lives entirely in `FileViewerManager.internal.ts` (`SplitState` type: `isSplit`, `activeSplit`, `rightFilePath`, `splitRatio`).

## Dependencies

- **Monaco**: `monaco-editor` + `vite-plugin-monaco-editor` (worker bundling in `electron.vite.config.ts`)
- **CodeMirror**: `@codemirror/view`, `@codemirror/state`, `@codemirror/language`
- **Shiki**: legacy `CodeView` read-only syntax highlighting only
- **IPC**: `files:readFile`, `files:saveFile`, `files:watchDir` via `window.electronAPI`
- **Types**: `OpenFile`, `SplitState` from `FileViewerManager.internal.ts`; `DiffLineInfo`, `BufferExcerpt`, `MultiBufferConfig` from `src/renderer/types/electron.d.ts`
- **Hooks**: `useTheme`, `useGitDiff`, `useGitBlame`, `useSymbolOutline` from `src/renderer/hooks/`
  <!-- claude-md-auto:end -->
  <!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# FileViewer — Multi-format file viewer and editor system

## Architecture

```
FileViewerManager (Context provider — owns tab state, open/close/save logic)
  └─ FileViewer (entry point — routes to specialized viewer by file type)
       ├─ ImageViewer / PdfViewer / HexViewer (binary formats)
       └─ FileViewerChrome (layout shell: toolbar + content + status bar)
            ├─ FileViewerToolbar + ViewModeBar + DirtyBanner
            ├─ ContentRouter (dispatches to correct editor/viewer)
            │    ├─ MonacoEditor (primary — USE_MONACO flag, currently true)
            │    ├─ MonacoDiffEditor (side-by-side diff)
            │    ├─ InlineEditor (legacy CodeMirror fallback)
            │    ├─ ClaudeMdEditor (specialized CLAUDE.md editor)
            │    ├─ CommitHistory / MarkdownPreview / DiffView / ConflictResolver
            │    └─ CodeView (legacy Shiki read-only viewer)
            ├─ SymbolOutline (side panel)
            └─ StatusBar
```

## Key Files

| File                                           | Role                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileViewerManager.tsx`                        | React Context provider — thin wrapper around `FileViewerManager.internal.ts`                                                                             |
| `FileViewerManager.internal.ts`                | **781 lines** — all tab management state: open/close/save/pin/preview/split/dirty tracking. Exports `OpenFile` and `SplitState` types.                   |
| `FileViewer.tsx`                               | Entry component — dispatches to `ImageViewer`/`PdfViewer`/`HexViewer` for binary, or `FileViewerChrome` for text                                         |
| `ContentRouter.tsx`                            | Routes between editor/history/preview/diff/conflict/code views. Controls `USE_MONACO` feature flag.                                                      |
| `useFileViewerState.ts`                        | **"Brain" hook** — aggregates all viewer state (toggles, folds, diff, blame, search, conflicts, keyboard). Single source of truth for `FileViewerState`. |
| `useFileViewerState.helpers.ts`                | Pure helper functions extracted from the state hook (factory functions, type definitions)                                                                |
| `MonacoEditor.tsx`                             | Monaco wrapper — lifecycle, dirty tracking, save keybinding, vim/emacs mode                                                                              |
| `monacoSetup.ts`                               | Worker config + `detectLanguage()` extension→language mapping                                                                                            |
| `monacoThemeBridge.ts`                         | Reads CSS custom properties (`var(--bg)` etc.) → converts to hex → builds Monaco `IStandaloneThemeData`                                                  |
| `editorRegistry.ts`                            | Global `Map<filePath, EditorView>` — lets `useIdeToolResponder` read CodeMirror content without ref threading                                            |
| `FileViewerChrome.tsx`                         | Layout shell — composes toolbar, content router, outline panel, status bar                                                                               |
| `FileViewerTabs.tsx` / `FileViewerTabItem.tsx` | Tab bar — drag-to-reorder, preview/pin states, dirty indicators, context menu                                                                            |
| `MultiBufferManager.tsx`                       | Context provider for Zed-style multi-buffer views (multiple file excerpts in one tab)                                                                    |

## Naming Conventions

Files follow a consistent suffixing pattern:

- `.view.tsx` — pure view components (`ConflictResolver.view.tsx`, `CommitHistory.view.tsx`)
- `.model.ts` — state/logic models (`CommitHistory.model.ts`, `ConflictResolver.model.ts`, `ClaudeMdEditor.model.ts`)
- `.parts.tsx` — sub-components split out for size (`ImageViewer.parts.tsx`, `SearchBar.parts.tsx`)
- `.shared.ts/tsx` — utilities shared between related components (`SymbolOutline.shared.ts`, `SemanticScrollbar.shared.tsx`)
- `.controller.ts` / `.search.ts` / `.panel.tsx` — SearchBar is decomposed across four files by concern

## Gotchas

- **`USE_MONACO` flag** in `ContentRouter.tsx` (line 21) controls whether Monaco or legacy Shiki/CodeMirror is used. Currently `true`. Set to `false` to revert. Affects both read-only and edit modes.
- **Monaco is lazily imported** — `FileViewerManager.internal.ts` uses `require('monaco-editor')` to avoid eagerly loading ~40MB at startup. Don't convert to static import.
- **Two editor systems coexist**: Monaco (primary) and CodeMirror (for InlineEditor/ClaudeMdEditor and as legacy fallback). The `editorRegistry.ts` only tracks CodeMirror instances.
- **Theme bridging is runtime-only** — `monacoThemeBridge.ts` reads computed CSS vars from the DOM (using a canvas 2d context for color conversion), so it only works in the renderer process.
- **`useFileViewerState`** resets all UI state (search, go-to-line, view mode, edit mode, history) when `filePath` changes. Don't store cross-file UI state there.
- **Tab preview semantics**: A preview tab (italic title) is replaced when opening another file via single-click. Double-click or editing pins it. Pinned tabs sort left and show a pin icon.
- **Split state** lives in `FileViewerManager.internal.ts` (`SplitState` type) — tracks active pane, right pane file, and split ratio.
- **Conflict resolution** dispatches a `agent-ide:reload-file` DOM CustomEvent (not Electron IPC) to trigger file refresh.

## Dependencies

- **Monaco**: `monaco-editor` + `vite-plugin-monaco-editor` (worker bundling)
- **CodeMirror**: `@codemirror/view`, `@codemirror/state`, `@codemirror/language` — used by `InlineEditor.cm.ts` and `ClaudeMdEditor`
- **Shiki**: syntax highlighting for legacy `CodeView` read-only mode
- **Hooks from parent**: `useTheme`, `useGitDiff`, `useGitBlame`, `useSymbolOutline` (in `src/renderer/hooks/`)
- **IPC**: `files:readFile`, `files:saveFile`, `files:watchDir` via `window.electronAPI`
- **Types**: `OpenFile`, `SplitState` from `FileViewerManager.internal.ts`; `DiffLineInfo`, `BufferExcerpt`, `MultiBufferConfig` from `electron.d.ts`
