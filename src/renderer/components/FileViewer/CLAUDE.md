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
            │    ├─ CommitHistory / MarkdownPreview / HtmlPreview / DiffView / ConflictResolver
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

## Preview Safety

### Supported preview types

| Extension | Preview component | Notes |
|-----------|-------------------|-------|
| `.md`, `.markdown` | `MarkdownPreview` | DOMPurify-sanitized, rendered inline |
| `.html`, `.htm` | `HtmlPreview` | Sandboxed `<iframe srcDoc>` — see below |

### HTML preview sandbox policy (`HtmlPreview.tsx`)

- Content is delivered via `<iframe srcDoc>` — **not** `src`, **not** `dangerouslySetInnerHTML`. The content runs in an isolated browsing context.
- `sandbox=""` — the strictest possible sandbox. No permissions are granted. Specifically excluded:
  - `allow-scripts` — untrusted agent-generated HTML must not execute JavaScript.
  - `allow-same-origin` — removing this means the iframe cannot access parent-origin storage, cookies, or DOM. Relative assets (images, CSS) will not resolve as a result; a banner informs the user.
  - `allow-top-navigation` — prevents the iframe from navigating the parent window.
  - `allow-popups` — no browser-chrome spawning from agent content.
  - `allow-forms` — no form submission from sandboxed content.
  - `allow-modals` — no `alert()`/`confirm()` from agent content.
- **Local-asset limitation**: relative `src=`/`href=` URLs do not resolve because `allow-same-origin` is withheld. A non-blocking banner is shown; the HTML still renders.
- **Precedence rule**: `ContentRouter` checks `isHtml` before `isMarkdown`. Files with both extensions (unusual) get HTML preview. This is intentional — `.html` files should not be rendered as Markdown.
