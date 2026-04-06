<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
Three non-obvious things captured in this CLAUDE.md that would otherwise cause bugs:
1. The duplicate `FileGroup`/`FileGroupHeader` — two implementations exist side-by-side in the same file. The non-virtual `FileGroup` is exported but not used by the main panel (only the internal `FileGroupHeader` is). Easy to accidentally use the wrong one.
2. The `line + 1` adjustment at the `open-file` dispatch boundary — search IPC is 0-indexed, the open-file event is 1-indexed. The adjustment lives only in `SearchPanel.tsx`, not in the hook or results component.
3. The dual glob state pattern — single-state implementations would introduce a subtle UX regression where the input lags visually by 300ms (the debounce interval).
`─────────────────────────────────────────────────`

The CLAUDE.md has been written to `src/renderer/components/Search/CLAUDE.md`. Key things captured:

- The **request-ID race guard** pattern (`requestIdRef` counter) — the lightweight alternative to `AbortController` for superseded async search requests
- The **dual glob state** in `SearchPanel.tsx` — why the local mirror state exists separately from the hook's setter
- The **hand-rolled virtual list** architecture — `FlatSearchItem` union interleaving headers and rows, fixed `ROW_HEIGHT = 22`, collapse state as `Set<string>`
- The **duplicate FileGroup/FileGroupHeader** gotcha — two implementations in the same file, the exported `FileGroup` is not used by the virtual path
- The **line indexing boundary** — search IPC returns 0-indexed lines; the `agent-ide:open-file` event sends `line + 1`
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Search — Project-Wide File Search Panel

VS Code-style search sidebar. Ripgrep-backed search via IPC, with 300ms debounce, request-ID race-condition guard, and a hand-rolled virtual list.

## Key Files

| File | Role |
|---|---|
| `SearchPanel.tsx` | Root component — composes hook + sub-components, owns local UI state (collapse set, filter expansion, glob input mirror) |
| `useSearchPanel.ts` | Search state + IPC — debounce, request-ID guard, grouped results map |
| `SearchPanel.parts.tsx` | Stateless UI atoms — `SearchInput`, `SearchToggle`, `SearchToggleBar`, `FilterInputs`, `SearchStatus`, `TruncatedWarning` |
| `SearchPanel.results.tsx` | Virtualized result list — `FlatSearchItem` union, `flattenSearchResults`, `VirtualResultsArea`, `FileGroup`, `ResultLine` |

## Architecture

```
SearchPanel
  ├── useSearchPanel(projectRoot)     ← IPC, debounce, request-ID guard
  ├── useSearchPanelLocalState(...)   ← filter expansion, collapsed files, glob mirrors
  └── renders:
       ├── SearchInput + SearchToggleBar  (SearchPanel.parts)
       ├── FilterInputs                   (SearchPanel.parts, collapsible)
       ├── SearchStatus                   (SearchPanel.parts)
       └── VirtualResultsArea             (SearchPanel.results)
```

## Key Patterns

### Request-ID race-condition guard
`useSearchPanel` increments `requestIdRef.current` before every IPC call and captures the value. The `.then()` callback silently discards any response where the captured ID no longer matches the ref. This handles rapid typing without `AbortController`.

### Dual glob state in SearchPanel.tsx
`useSearchPanelLocalState` maintains *two* parallel states per glob field — a local string for the controlled input (updates synchronously) and a call to `setIncludeGlob` / `setExcludeGlob` from the hook (triggers debounced search). Never merge these into one; the input must not wait for the debounce.

### Hand-rolled virtual list (no react-virtual)
`flattenSearchResults` converts `Map<string, SearchResultItem[]>` into a `FlatSearchItem[]` union (`'header' | 'result'`). `VirtualResultsArea` uses this flat array with fixed `ROW_HEIGHT = 22` and absolute positioning. Collapse state lives in `SearchPanel.tsx` as a `Set<string>` of file paths — toggling a file re-runs `flattenSearchResults` via `useMemo`.

### File-open via DOM CustomEvent
Clicking a result dispatches `agent-ide:open-file` on `window` (not IPC). Line is adjusted: IPC search returns 0-indexed lines; the event detail sends `line + 1`.

```ts
window.dispatchEvent(new CustomEvent('agent-ide:open-file', {
  detail: { filePath, line: item.line + 1, col: item.column },
}));
```

### Display path normalization
`toDisplayPath` strips the project root prefix and normalizes backslashes. Applied per-item inside the `flattenSearchResults` call via the `toDisplay` callback — not in the hook or IPC layer.

## IPC Dependency

- `window.electronAPI.files.search(projectRoot, query, options)` → `{ success, results, truncated, error? }`
- Types from `../../types/electron-runtime-apis`: `SearchOptions`, `SearchResultItem`
- Min query length: **2 characters** — shorter queries return nothing and reset state
- Max results: **500** — backend caps at this; `truncated: true` triggers `TruncatedWarning`

## Gotchas

- `ResultLine` trims leading whitespace before rendering and adjusts `column` by the trim offset — match highlight column would be wrong on indented lines otherwise.
- `FileGroup` in `SearchPanel.results.tsx` is not the same as `FileGroupHeader` inside `VirtualResultsArea` — there are two implementations. `FileGroup` is the non-virtual version (not used in the main panel); `FileGroupHeader` is the virtualized variant with `height: ROW_HEIGHT` enforced.
- `V_OVERSCAN = 10` rows above/below the viewport are rendered to reduce flicker during fast scroll. Increasing this improves scroll smoothness at the cost of more DOM nodes.
- Glob inputs send `undefined` (not empty string) to the hook when cleared — `setIncludeGlob` checks `glob || undefined` before updating options.
