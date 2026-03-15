# File Viewer & Editor Modernization Plan

> **Goal**: Bring the file viewer and inline editor to VS Code/Zed-level quality with Monaco as the primary editor engine, while keeping CodeMirror for lightweight scenarios.
> **Current state**: Shiki-based read-only viewer with CodeMirror 6 inline editor. Features: syntax highlighting (30+ languages), code folding, minimap, semantic scrollbar, search with regex, git blame/diff, symbol outline, conflict resolver, CLAUDE.md editor, image viewer, markdown preview, LSP integration (completions, hover, diagnostics).
> **Target state**: Monaco-based primary editor with full LSP, sticky scroll, inline completions (AI ghost text), built-in diff editor with accept/reject, multi-cursor, vim/emacs keybindings. CodeMirror retained for CLAUDE.md editor and lightweight embedded editors.

---

## Architecture Decisions

### Engine Choice: Monaco for Primary Editor
**Rationale** (from research):
- Built-in diff editor eliminates custom diff implementation
- Built-in minimap with proportional/fill/fit modes
- Built-in sticky scroll
- InlineCompletionsProvider API for AI ghost text (battle-tested by Copilot)
- Bundle size penalty (~5-10MB) is irrelevant in Electron
- TypeScript/JavaScript language services built-in
- Reference implementation exists for Cursor-style accept/reject inline diffs

**Trade-off**: Monaco uses JS-based theming (hex codes), not CSS variables. Solution: create a theme bridge that reads CSS vars and generates Monaco theme objects.

### Dual Engine Architecture
```
Primary editor (Monaco):
  - All code editing
  - Diff viewing
  - AI inline completions
  - Full LSP integration

Lightweight editors (CodeMirror 6, kept as-is):
  - CLAUDE.md editor (domain-specific toolbar)
  - Settings editors
  - Embedded editors (chat code blocks, config files)
  - Prompt editor in terminal (Phase 4 of terminal plan)
```

### Viewer Mode Strategy
Current: Shiki-based custom viewer for read-only, CodeMirror for edit mode.
New: Monaco in read-only mode for viewing (same component, `readOnly: true`), Monaco in edit mode for editing. This eliminates the Shiki→CodeMirror transition and makes the editing experience seamless.

---

## Phases

### Phase 1: Monaco Integration (Core)
**Parallelizable**: 1A and 1B are independent; 1C depends on both.

#### 1A. Monaco Setup and Configuration
- **Files**: `package.json`, new `src/renderer/components/FileViewer/MonacoEditor.tsx`, new `src/renderer/components/FileViewer/monacoSetup.ts`
- **Steps**:
  1. `npm install monaco-editor`
  2. Configure electron-vite to bundle Monaco workers:
     ```ts
     // electron.vite.config.ts
     import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
     // OR for vite: @aspect-build/rules_esbuild monaco-vite-plugin
     ```
     **Note**: electron-vite uses vite under the hood. Use `vite-plugin-monaco-editor` or `monaco-editor/esm/vs/editor/editor.api` with manual worker setup.
  3. Create `monacoSetup.ts`:
     - Configure worker URLs (JSON, CSS, HTML, TypeScript workers)
     - Set global Monaco options (wordWrap, minimap, sticky scroll)
     - Register custom theme (bridge from CSS vars)
  4. Create `MonacoEditor.tsx`:
     - Props: `filePath`, `content`, `language`, `readOnly`, `onSave`, `onDirtyChange`
     - Create editor instance with `monaco.editor.create()`
     - Handle lifecycle: mount, update content, dispose
     - Save keybinding: `Mod-S`
     - Forward dirty state changes
  5. Language detection: map file extensions to Monaco language IDs
- **Edge cases**:
  - Monaco worker loading in Electron — workers must be served from the renderer process, not file:// protocol. Use `MonacoEnvironment.getWorkerUrl` or `getWorker` to configure.
  - Multiple editor instances — Monaco supports this but each has its own model. Use `monaco.editor.getModel(uri)` to reuse models for the same file.
  - Memory: dispose models when files are closed, not just when components unmount
  - Very large files (>5MB) — Monaco handles 100K+ lines but may lag on initial tokenization. Show loading spinner for first render.
  - Binary files — detect before creating Monaco instance; show hex viewer or image viewer instead

#### 1B. Monaco Theme Bridge
- **Files**: New `src/renderer/components/FileViewer/monacoThemeBridge.ts`
- **Implementation**:
  1. Read CSS variables from `document.documentElement.style`:
     - `--bg`, `--text`, `--accent`, `--border`
     - `--editor-bg` (if different from `--bg`)
     - Syntax colors from current theme
  2. Generate a Monaco `IStandaloneThemeData` object:
     ```ts
     monaco.editor.defineTheme('ouroboros', {
       base: 'vs-dark',
       inherit: true,
       rules: [
         { token: 'comment', foreground: cssVar('--syntax-comment') },
         { token: 'keyword', foreground: cssVar('--syntax-keyword') },
         // ... map all token types
       ],
       colors: {
         'editor.background': cssVar('--bg'),
         'editor.foreground': cssVar('--text'),
         'editor.selectionBackground': cssVar('--selection'),
         // ... map all editor colors
       }
     })
     ```
  3. Re-generate and apply on theme change (listen for `agent-ide:set-theme` event)
  4. Map each IDE theme (retro, modern, warp, cursor, kiro) to a Monaco base theme + token rules
- **Edge cases**:
  - CSS variables may not be available at Monaco init time — defer theme setup until vars are computed
  - Monaco requires hex colors, not CSS var references — must resolve vars to computed values
  - Custom themes created by user — generate bridge dynamically from whatever vars are set
  - High contrast mode — map to Monaco's `hc-black` or `hc-light` base

#### 1C. Replace Shiki Viewer with Monaco Read-Only
- **Files**: `FileViewer.tsx`, `ContentRouter.tsx`, `FileViewerChrome.tsx`, `CodeView.tsx`
- **Steps**:
  1. In `ContentRouter.tsx`, replace the Shiki-based `CodeView` with `MonacoEditor` in read-only mode
  2. Migrate features from custom CodeView to Monaco equivalents:
     | Custom Feature | Monaco Equivalent |
     |---|---|
     | Line numbers | Built-in (`lineNumbers: 'on'`) |
     | Code folding | Built-in (`folding: true`) |
     | Minimap | Built-in (`minimap: { enabled: true }`) |
     | Search (Ctrl+F) | Built-in (`find` action) |
     | Go-to-line | Built-in (`Ctrl+G`) |
     | Word wrap | Built-in (`wordWrap: 'on'`) |
     | Bracket matching | Built-in |
  3. Remove: `CodeView.tsx`, `useFoldRanges.ts`, custom `SearchBar.tsx` (for code), `GoToLine.tsx`, `Minimap.tsx`, `SemanticScrollbar.tsx`, `LineNumberGutter.tsx`, `FoldGutter.tsx`
  4. Keep: `DiffGutter.tsx` → migrate to Monaco decorations, `BlameGutter.tsx` → migrate to Monaco margin decorations
  5. Keep: `SymbolOutline.tsx` — but feed it from Monaco's `DocumentSymbolProvider` instead of custom parsing
  6. Transition the edit mode toggle: `readOnly: true` → `readOnly: false` (no component swap needed)
- **Edge cases**:
  - Scroll position preservation when switching read-only ↔ edit mode — Monaco handles this natively (same editor instance)
  - File changes on disk while editor is open — update model content, preserve cursor/scroll
  - Unsaved changes indicator — Monaco's `model.getAlternativeVersionId()` vs saved version
  - Multiple tabs with the same file — share Monaco model, multiple editor instances

---

### Phase 2: Advanced Editor Features
**Depends on**: Phase 1
**Parallelizable within phase**: All tasks independent.

#### 2A. Sticky Scroll
- **Files**: `MonacoEditor.tsx` configuration
- **Implementation**:
  1. Enable: `stickyScroll: { enabled: true, maxLineCount: 5 }`
  2. Works automatically with language services — shows class/function/block scope headers
  3. For languages without full LSP, falls back to indentation-based detection
- **Edge cases**:
  - Very deeply nested code — cap at 5 lines to avoid eating viewport
  - Read-only mode — sticky scroll still works (it's a viewport feature)

#### 2B. AI Inline Completions (Ghost Text)
- **Files**: New `src/renderer/components/FileViewer/monacoInlineCompletions.ts`
- **Implementation**:
  1. Register an `InlineCompletionsProvider`:
     ```ts
     monaco.languages.registerInlineCompletionsProvider('*', {
       provideInlineCompletions(model, position, context, token) {
         // Send context to Claude API via IPC
         // Return ghost text suggestions
       },
       freeInlineCompletions(completions) { /* cleanup */ }
     })
     ```
  2. Context construction:
     - Current file content (up to cursor)
     - Open file tabs (names + first 50 lines each)
     - Recent edits in other files
     - Project context from context layer
  3. Display modes: `displayMode: 'subwordSmart'` (shows completions as gray ghost text)
  4. Accept: Tab to accept full completion
  5. Debounce: 500ms after last keystroke before requesting completion
  6. Cancel: any keystroke cancels pending request
  7. Settings: enable/disable toggle, debounce interval, max tokens
- **Edge cases**:
  - Large files — send only surrounding context (500 lines before, 100 lines after cursor)
  - Rate limiting — queue requests, cancel stale ones
  - Network failure — silently fail, no error UI
  - Multiple cursors — provide completions only for primary cursor
  - Completion conflicts with LSP autocomplete — ghost text should not appear when autocomplete dropdown is visible

#### 2C. Built-in Diff Editor
- **Files**: New `MonacoDiffEditor.tsx`, update `ContentRouter.tsx`
- **Implementation**:
  1. Create `MonacoDiffEditor.tsx`:
     ```ts
     const diffEditor = monaco.editor.createDiffEditor(container, {
       renderSideBySide: true,
       useInlineViewWhenSpaceIsLimited: true,
       ignoreTrimWhitespace: true,
       renderIndicators: true,
     })
     diffEditor.setModel({
       original: monaco.editor.createModel(originalContent, language),
       modified: monaco.editor.createModel(modifiedContent, language),
     })
     ```
  2. Replace custom `DiffView.tsx` with Monaco diff editor
  3. Add view mode toggle: side-by-side ↔ inline (auto-switches based on width)
  4. Add per-hunk navigation: previous/next change buttons
  5. For agent changes: add accept/reject buttons per hunk (using Monaco decorations + widgets):
     - Margin widgets with accept (checkmark) and reject (X) icons
     - Accept applies the hunk, reject reverts it
     - After all hunks reviewed, show "N accepted, M rejected" summary
- **Edge cases**:
  - Three-way merge — Monaco doesn't support this natively; for conflict resolution, show two diff editors (base↔ours, base↔theirs) side by side
  - Diff of very large files — Monaco handles this but may be slow for 50K+ line diffs
  - Diff of new files — original model is empty, modified is full content
  - Diff of deleted files — modified model is empty, original is full content
  - Theme sync — diff editor uses same theme as main editor

#### 2D. Vim and Emacs Keybindings
- **Files**: New `monacoVimMode.ts`, update settings
- **Implementation**:
  1. Use `monaco-vim` package for vim bindings
  2. Use `monaco-emacs` package for emacs bindings
  3. Settings: keybinding mode selector (default / vim / emacs)
  4. Vim: show mode indicator in status bar (NORMAL / INSERT / VISUAL / COMMAND)
  5. Vim: command line at bottom of editor (`:w`, `:q`, etc.)
- **Edge cases**:
  - Vim `:w` should trigger save via onSave callback, not try to write to filesystem
  - Vim `:q` should close the tab, not quit the app
  - Vim `/` search should use Monaco's built-in search, not a separate overlay
  - Emacs `C-x C-s` should map to save

#### 2E. Multi-Cursor and Selection
- **Files**: Monaco configuration
- **Implementation**: Largely built-in:
  1. `Ctrl+D` — select next occurrence
  2. `Ctrl+Shift+L` — select all occurrences
  3. `Alt+Click` — add cursor
  4. Column selection (`Shift+Alt+drag`)
  5. All of these work out of the box with Monaco — just ensure keybindings don't conflict with IDE shortcuts
- **Edge cases**:
  - Multi-cursor with vim mode — vim has its own multi-cursor system; may conflict
  - Multi-cursor with AI completions — disable ghost text during multi-cursor editing

---

### Phase 3: LSP Integration
**Depends on**: Phase 1
**Can run in parallel with Phase 2.**

#### 3A. Language Server Protocol Client
- **Files**: New `src/main/lsp/`, new `src/renderer/components/FileViewer/monacoLspBridge.ts`
- **Implementation**:
  1. Main process: install `vscode-languageserver-protocol` and `vscode-ws-jsonrpc`
  2. Create `LspManager` in main process:
     - Spawn language servers as child processes
     - Manage lifecycle (start, restart, shutdown per language)
     - Support multiple languages simultaneously
  3. Initial language servers:
     - TypeScript: `typescript-language-server` (uses `tsserver` under the hood)
     - Python: `pylsp` or `pyright`
     - Rust: `rust-analyzer`
     - Go: `gopls`
     - HTML/CSS: `vscode-html-languageserver` + `vscode-css-languageserver`
  4. Renderer: use `monaco-languageclient` to bridge Monaco ↔ language server over IPC:
     - `textDocument/didOpen`, `didChange`, `didClose`
     - `textDocument/completion` → Monaco completions
     - `textDocument/hover` → Monaco hover provider
     - `textDocument/definition` → Go to Definition (Ctrl+Click)
     - `textDocument/references` → Find All References
     - `textDocument/rename` → Rename Symbol
     - `textDocument/publishDiagnostics` → Monaco markers (errors, warnings)
     - `textDocument/documentSymbol` → Symbol outline + breadcrumbs
     - `textDocument/formatting` → Format Document
     - `textDocument/inlayHint` → Inline type annotations
  5. Settings: configurable language server paths, enable/disable per language
- **Edge cases**:
  - Language server crash — auto-restart with backoff (max 5 retries in 60 seconds)
  - Language server not installed — show "Install [server] for full language support" banner
  - Large project indexing — language servers may take seconds to initialize; show loading indicator
  - Multiple projects open — each project root gets its own language server instance
  - File rename — notify language server of file renames to update references

#### 3B. Diagnostics Panel
- **Files**: New `DiagnosticsPanel.tsx`
- **Implementation**:
  1. Bottom panel (or sidebar tab) showing all diagnostics across open files
  2. Group by file, sort by severity (Error > Warning > Info > Hint)
  3. Click to jump to the diagnostic location
  4. Filter by severity
  5. Show count in status bar: "2 errors, 5 warnings"
  6. Auto-update as diagnostics change
- **Edge cases**:
  - Hundreds of diagnostics — virtualize the list
  - Diagnostic in a closed file — still show, open file on click
  - Diagnostics from multiple language servers — merge and deduplicate

#### 3C. Breadcrumb Navigation with Symbols
- **Files**: Update `Breadcrumb.tsx`
- **Implementation**:
  1. Current: shows file path segments
  2. Add: symbol hierarchy at the end (from `textDocument/documentSymbol`)
     - e.g., `src / main / config.ts > ConfigSchema > defaults > theme`
  3. Each segment is a dropdown:
     - Path segments: show sibling files/folders
     - Symbol segments: show sibling symbols
  4. Click a dropdown item to navigate to that file/symbol
- **Edge cases**:
  - Very long paths — truncate middle segments with "..."
  - Files without symbol support — show only path segments
  - Deeply nested symbols — cap at 4 levels

---

### Phase 4: File Type Viewers
**Parallelizable with all other phases. No dependencies.**

#### 4A. Enhanced Image Viewer
- **Files**: Update `ImageViewer.tsx`
- **Additions**:
  1. Checkerboard background for transparency
  2. Pan/zoom with mouse drag and scroll wheel
  3. Actual pixel dimensions and file size in toolbar
  4. Side-by-side comparison (for before/after)
  5. SVG: render both as image and show source code (toggle)
- **Edge cases**:
  - Very large images (100MP+) — downsample for display, show warning
  - Animated GIFs — play/pause control
  - Broken images — show error placeholder

#### 4B. PDF Viewer
- **Files**: New `PdfViewer.tsx`
- **Implementation**:
  1. Use `pdfjs-dist` (Mozilla's pdf.js)
  2. Render pages in a scrollable container
  3. Page navigation, zoom, search
  4. Open in external app button
- **Edge cases**:
  - Large PDFs — render pages lazily (only visible pages)
  - Password-protected PDFs — prompt for password
  - PDFs with forms — read-only display

#### 4C. Hex Viewer for Binary Files
- **Files**: New `HexViewer.tsx`
- **Implementation**:
  1. Detect binary files (null byte in first 8192 bytes)
  2. Show hex dump: offset | hex bytes | ASCII representation
  3. Virtual scrolling (binary files can be huge)
  4. Search by hex pattern or ASCII string
- **Edge cases**:
  - Files > 100MB — warn before loading, stream in chunks
  - Files that look binary but aren't (e.g., UTF-16) — detect encoding

---

### Phase 5: Polish
**Parallelizable with all phases.**

#### 5A. Editor State Persistence
- **Files**: New `editorStateStore.ts`
- **Persist per file**:
  - Scroll position
  - Cursor position
  - Fold state
  - Selection
  - Undo history (optional, can be large)
- **Storage**: `electron-store` or `.context/editor-state/`
- **Restore**: When reopening a file, restore all state

#### 5B. Editor Tabs Improvements
- **Files**: `FileViewerTabItem.tsx`
- **Additions**:
  1. Dirty indicator (dot on tab)
  2. Preview tabs (single-click opens in preview, double-click pins)
  3. Tab groups (drag to split editor horizontally/vertically)
  4. Close others / close to the right
  5. Tab overflow: scrollable tab bar + dropdown for hidden tabs
- **Edge cases**:
  - Many tabs open (20+) — scrollable bar with arrows
  - Drag tab to terminal pane — ignore (different component types)
  - Close dirty tab — trigger dirty close dialog

#### 5C. Format on Save
- **Files**: Monaco configuration, settings
- **Implementation**:
  1. On save, if LSP supports formatting, run `textDocument/formatting` before writing
  2. Configurable: on/off per language
  3. Respect `.editorconfig` and `.prettierrc` if present
- **Edge cases**:
  - Formatter fails — save anyway, show warning
  - Formatter changes file significantly — user might be surprised; add "formatted on save" indicator

---

## Parallel Execution Map

```
Phase 1:
  [1A: Monaco setup] ──────┐
  [1B: Theme bridge]       ├─→ [1C: Replace Shiki viewer] ─→ Phases 2 & 3
                           │
Phase 2 (all parallel, after Phase 1):
  [2A: Sticky scroll]
  [2B: AI ghost text]
  [2C: Diff editor]
  [2D: Vim/Emacs]
  [2E: Multi-cursor]

Phase 3 (parallel with Phase 2, after Phase 1):
  [3A: LSP client]
  [3B: Diagnostics panel]
  [3C: Breadcrumbs]

Phase 4 (parallel with everything):
  [4A: Image viewer]
  [4B: PDF viewer]
  [4C: Hex viewer]

Phase 5 (parallel with everything):
  [5A: State persistence]
  [5B: Tab improvements]
  [5C: Format on save]
```

## Migration Strategy: Shiki/CodeMirror → Monaco

This is the highest-risk transition. Strategy:

1. **Phase 1A-1B**: Monaco exists alongside Shiki/CodeMirror. Both render paths available.
2. **Phase 1C**: Feature flag `useMonacoEditor` (default: `true`). Allows rollback.
3. **Phase 1C complete**: Remove Shiki viewer code, keep CodeMirror for CLAUDE.md editor only.
4. **Phase 2**: Build new features exclusively on Monaco. No CodeMirror additions.

### Files to Remove After Migration
- `CodeView.tsx`, `useFoldRanges.ts`, `Minimap.tsx`, `SemanticScrollbar.tsx`
- `GoToLine.tsx`, `SearchBar.tsx` (code search — keep terminal search)
- `LineNumberGutter.tsx`, `FoldGutter.tsx`, `DiffGutter.tsx`
- `DiffView.tsx` (replaced by Monaco diff editor)
- `useHighlighting.ts` (Shiki integration)
- `fileViewerUtils.ts` language/theme mapping (replaced by Monaco language detection)

### Files to Keep
- `InlineEditor.tsx` + `InlineEditor.cm.ts` → rename to `ClaudeMdInlineEditor.*` to clarify scope
- `ClaudeMdEditor.*` → keep as-is
- `ImageViewer.tsx`, `MarkdownPreview.tsx`, `CommitHistory.tsx` → keep as-is
- `ConflictResolver.tsx` → refactor to use Monaco diff editor
- `FileViewerManager.internal.ts` → keep, update to manage Monaco models

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Monaco worker loading fails in Electron | HIGH | Test early; multiple worker config approaches available |
| Monaco bundle bloats app significantly | MEDIUM | Tree-shake unused languages; lazy-load language services |
| Theme bridge produces ugly results | MEDIUM | Manual tuning per IDE theme; use `inherit: true` to get Monaco defaults for unmapped tokens |
| LSP server management complexity | HIGH | Start with TypeScript only; add languages incrementally |
| Breaking existing CodeMirror keybindings | MEDIUM | Feature flag for rollback; keep CodeMirror path available |
| Memory leak from undisposed Monaco models | HIGH | Strict model lifecycle management; dispose on tab close, use WeakRef where possible |
