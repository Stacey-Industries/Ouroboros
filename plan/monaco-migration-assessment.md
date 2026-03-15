# Monaco Migration Assessment (Phase 1C)

> Assessment produced after completing Phase 1A (Monaco setup) and Phase 1B (theme bridge).

## Current Viewer Architecture

The read-only code viewer is **Shiki-based** with custom React components for each feature:

- `FileViewer.tsx` — top-level orchestrator; parses Shiki HTML output, computes fold state, builds row array
- `CodeView.tsx` — layout shell; renders gutters, overlays (minimap, scrollbar), and code content side-by-side
- `ContentRouter.tsx` — routes between code/diff/preview/edit/history/conflict views

### Custom components that would be replaced:

| Component | Lines (est.) | Monaco Equivalent |
|---|---|---|
| `CodeView.tsx` | ~190 | Monaco editor in read-only mode |
| `CodeContent.tsx` | unknown | Monaco's built-in text rendering |
| `LineNumberGutter.tsx` | ~60 | Built-in (`lineNumbers: 'on'`) |
| `FoldGutter.tsx` | ~80 | Built-in (`folding: true`) |
| `Minimap.tsx` | ~120 | Built-in (`minimap: { enabled: true }`) |
| `SearchBar.tsx` + parts | ~200 | Built-in Find widget (`Ctrl+F`) |
| `GoToLine.tsx` | ~50 | Built-in (`Ctrl+G`) |
| `SemanticScrollbar.tsx` + shared | ~150 | Built-in overview ruler |
| `useHighlighting.ts` | ~80 | Monaco's built-in tokenization |
| `useFoldRanges.ts` | ~60 | Monaco's built-in folding provider |
| `fileViewerUtils.ts` (Shiki parts) | ~100 | `detectLanguage()` in monacoSetup.ts |

**Total custom code eliminated: ~1,000+ lines**

## Features That Map Directly to Monaco Built-ins

These require zero custom implementation — just configuration options:

1. **Line numbers** — `lineNumbers: 'on'`
2. **Code folding** — `folding: true`, `foldingStrategy: 'indentation'` (or language-aware with LSP)
3. **Minimap** — `minimap: { enabled: true }` with proportional/fill/fit modes
4. **Search (Ctrl+F)** — built-in Find widget with regex, case-sensitive, whole-word support
5. **Go-to-line (Ctrl+G)** — built-in action
6. **Word wrap** — `wordWrap: 'on' | 'off'`
7. **Bracket matching** — built-in with colorization
8. **Syntax highlighting** — built-in tokenization for 50+ languages (superset of current Shiki coverage)
9. **Scroll position management** — built-in state management
10. **Read-only / edit toggle** — `editor.updateOptions({ readOnly })` — no component swap needed

## Features Requiring Custom Implementation

### 1. Blame Gutter (`BlameGutter.tsx`)
- **Approach**: Use Monaco's `editor.deltaDecorations()` or margin widgets to render blame info
- **Effort**: Medium — the data source stays the same, only the rendering changes
- **Note**: Monaco has no built-in blame support; need custom decoration provider

### 2. Diff Gutter (`DiffGutter.tsx`)
- **Approach**: Use Monaco's gutter decorations (`glyphMarginClassName`, `linesDecorationsClassName`)
- **Effort**: Low — Monaco has built-in gutter coloring for modified/added/deleted lines
- **Note**: Can use `editorGutter.modifiedBackground` etc. for basic coloring; custom decorations for richer UI

### 3. Semantic Scrollbar annotations
- **Approach**: Use Monaco's overview ruler (`overviewRuler` in decoration options) to mark search matches, diff lines, errors
- **Effort**: Low — Monaco's overview ruler supports custom colored markers

### 4. Edit mode transition
- **Current**: Switches from Shiki `CodeView` to CodeMirror `InlineEditor` — different components entirely
- **With Monaco**: Same component, just toggle `readOnly`. Cursor position, scroll, and fold state are preserved.
- **Effort**: Very low — biggest win of the migration

### 5. Toolbar integration
- **Current**: `FileViewerToolbar.tsx` controls search visibility, blame toggle, fold all, etc.
- **With Monaco**: Wire toolbar buttons to Monaco editor actions/commands
- **Effort**: Low — straightforward command invocation

## Blockers and Concerns

### 1. Worker loading in Electron (RESOLVED)
The `vite-plugin-monaco-editor` had a path issue with electron-vite's renderer root configuration. Fixed using `customDistPath` option. Workers build and output correctly to `out/renderer/monacoeditorwork/`.

### 2. Bundle size increase
Monaco adds ~4MB to the renderer bundle (compressed). This is acceptable for an Electron app but worth noting. The Shiki bundle and all custom viewer code can be removed afterward, partially offsetting this.

### 3. CSS variable to hex conversion
Monaco requires hex color values, not CSS `var()` references. The theme bridge (`monacoThemeBridge.ts`) handles this by reading computed styles at runtime and uses a canvas-based resolver for `rgba()` values. This works but means theme changes require a re-generation step (handled by the `useMonacoTheme` hook listening to `agent-ide:theme-applied`).

### 4. Font handling
Monaco doesn't support CSS `var()` in font family. The `fontFamily: 'var(--font-mono)'` config *does* work because Monaco passes it through to CSS, but it may not resolve correctly in all contexts. May need to resolve the computed font family value instead. Worth testing.

### 5. Model lifecycle management
Monaco models persist independently of editor instances. Need explicit disposal when tabs close to avoid memory leaks. The `disposeMonacoModel()` function is provided for this. `FileViewerManager.internal.ts` will need updates to call it.

## Recommended Approach for Migration

1. **Feature flag**: Add config `useMonacoViewer` (default `true`) so the migration can be rolled back.
2. **ContentRouter change**: When `useMonacoViewer` is true and viewMode is `'code'` (non-edit), render `MonacoEditor` with `readOnly={true}` instead of `CodeView`.
3. **Edit mode**: When `useMonacoViewer` is true and editMode is on, render `MonacoEditor` with `readOnly={false}` instead of `InlineEditor` (except for CLAUDE.md files, which keep the specialized CodeMirror editor).
4. **Toolbar wiring**: Update `FileViewerToolbar` to dispatch Monaco editor commands instead of controlling custom component state.
5. **Blame/Diff gutters**: Port as Monaco decoration providers (can be Phase 2 scope).
6. **Cleanup**: After validation, remove `CodeView.tsx`, `CodeContent.tsx`, `LineNumberGutter.tsx`, `FoldGutter.tsx`, `Minimap.tsx`, `SemanticScrollbar.tsx`, `SearchBar.tsx`, `GoToLine.tsx`, `useHighlighting.ts`, `useFoldRanges.ts`, and Shiki-related code from `fileViewerUtils.ts`.

### Migration order within 1C:
1. Wire `MonacoEditor` into `ContentRouter` for read-only code view (behind feature flag)
2. Wire `MonacoEditor` for edit mode (non-CLAUDE.md files)
3. Update toolbar to use Monaco commands
4. Port blame gutter to Monaco decorations
5. Port diff gutter to Monaco decorations
6. Remove replaced components
