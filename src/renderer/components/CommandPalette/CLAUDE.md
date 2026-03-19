<!-- claude-md-auto:start -->

The CLAUDE.md already exists for this directory (shown as `AM` in git status — added/modified). The existing content is already comprehensive and complete. Here's a summary of what it covers:

The file documents the **CommandPalette** directory as a VS Code-style command palette, file picker, and symbol search with three independent picker UIs sharing overlay primitives.

Key documentation it includes:

- **Architecture table** — three pickers (command palette, file picker, symbol search), each with its own state pipeline and Fuse.js instance
- **Key files table** — 13 files from `types.ts` through `symbolSearchLifecycle.ts` with roles
- **MVVM decomposition pattern** — State → Actions → ViewModel → View pipeline across separate files
- **Navigation stack** — how `Command.children` enables nested submenus
- **Gotchas** — two flatten functions (`flattenLeaves` vs `flattenAll`), `PaletteOverlay` vs `PickerOverlay` distinction, inline `<style>` keyframes, centralized command registration, DOM events only

`★ Insight ─────────────────────────────────────`
**The CLAUDE.md already exists** (git status `AM` = Added in index, Modified in working tree). The file was auto-generated during the modernization initiative and already captures the key architectural patterns. The system-reminder confirms its full content — no action needed unless you want to revise specific sections.

**MVVM in hooks**: This codebase adapts the MVVM pattern to React — `commandPaletteState.ts` is the Model, `commandPaletteActions.ts` is the Controller, `commandPaletteViewModel.ts` is the ViewModel (a pure function), and `CommandPalettePanel.tsx` is the View. This strict separation means the panel component is only 45 lines — purely declarative.
`─────────────────────────────────────────────────`

The CLAUDE.md at `src/renderer/components/CommandPalette/CLAUDE.md` already exists and is complete. No file needs to be written — it's already checked into the working tree.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# CommandPalette — VS Code-style command palette, file picker, and symbol search

## Architecture

Three independent picker UIs share overlay primitives but have separate state/data pipelines:

| Feature         | Entry point                                    | State                         | Search                                                     |
| --------------- | ---------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Command palette | `CommandPalette.tsx`                           | `commandPaletteState.ts`      | `commandSearch.ts` (Fuse.js on `label`+`category`)         |
| File picker     | `FilePicker.tsx`                               | Internal `useState`           | Fuse.js on `name`+`relativePath` via `useProjectFileIndex` |
| Symbol search   | `SymbolSearch.tsx` → `SymbolSearchContent.tsx` | `symbolSearchModelHelpers.ts` | Fuse.js on `name`+`relativePath` of `SymbolEntry`          |

## Key Files

| File                          | Role                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`                    | `Command`, `CommandMatch`, `CommandCategory` — core types for the palette                                                            |
| `useCommandRegistry.ts`       | Builds the full command list (theme, terminal, git, view, extension commands). Manages recent-command persistence in `localStorage`. |
| `useCommandPalette.ts`        | Open/close/toggle state + keyboard shortcut (`Ctrl+Shift+P`) + `agent-ide:command-palette` DOM event listener                        |
| `commandPaletteState.ts`      | React state (query, selectedIndex, navStack) + `useCommandPaletteData` for Fuse matching                                             |
| `commandPaletteActions.ts`    | Keyboard nav, execute, navigate-into-submenu, navigate-back — all as composable hooks                                                |
| `commandPaletteViewModel.ts`  | Pure function `buildCommandPaletteModel` — assembles state+actions into a single view model for the panel                            |
| `useCommandPaletteModel.ts`   | Orchestrator hook: wires state → data → actions → lifecycle → view model                                                             |
| `commandSearch.ts`            | Fuse.js config, tree flattening (`flattenLeaves`/`flattenAll`), match building, category grouping                                    |
| `commandGroups.ts`            | Static command definitions — view, terminal, file, app, git commands. Uses `dispatchIdeEvent` for actions.                           |
| `PaletteOverlay.tsx`          | Shared overlay/card shell (fixed position, backdrop, animations) + `CategoryHeader` + `PaletteFooter`                                |
| `PickerOverlay.tsx`           | File/symbol picker overlay variant with its own input styling                                                                        |
| `FilePicker.tsx`              | Standalone file picker with Fuse search over project file index                                                                      |
| `symbolSearchModelHelpers.ts` | Symbol search state, Fuse config, keyboard/selection actions                                                                         |
| `symbolSearchLifecycle.ts`    | Loads symbols from `window.electronAPI.lsp.getDocumentSymbols`, manages loading/error states                                         |

## Patterns

- **MVVM decomposition**: State (`commandPaletteState`) → Actions (`commandPaletteActions`) → ViewModel (`commandPaletteViewModel`) → View (`CommandPalettePanel`). Each layer is a separate file. The `useCommandPaletteModel` hook orchestrates the pipeline.
- **Navigation stack**: Commands with `children` push onto `navStack` instead of executing. Backspace on empty query or Escape pops the stack. This enables nested submenus (e.g., Theme → Retro/Modern/Warp).
- **Recent commands**: Stored in `localStorage` under `agent-ide:command-recent` (max 5). Shown when query is empty at root level.
- **Conditional commands**: `Command.when` callback hides commands that don't apply in current context. Checked at match-build time and during direct listing.
- **All three pickers use Fuse.js** with similar configs but different key weights. Command palette weights `label: 0.7, category: 0.3`. File picker weights `name: 0.6, relativePath: 0.4`. Symbol search weights `name: 0.7, relativePath: 0.3`.

## Gotchas

- **Two flatten functions** in `commandSearch.ts`: `flattenLeaves` skips parent nodes (for recent commands), `flattenAll` includes parents (for search). Using the wrong one silently hides results.
- **Inline `<style>` tag** in `CommandPalette.tsx` injects keyframe animations — not Tailwind. This is intentional to avoid global CSS pollution since the palette animates independently.
- **PaletteOverlay vs PickerOverlay** — command palette uses `PaletteOverlay.tsx`, file/symbol pickers use `PickerOverlay.tsx`. They look similar but have different card dimensions, input styling, and animation timings.
- **Command registration is centralized** in `useCommandRegistry.ts`, not distributed. All built-in commands (theme, terminal, view, git) are defined there or in `commandGroups.ts`. Extensions register via `registerCommand`/`unregisterCommand`.
- **DOM events only** — commands dispatch `CustomEvent`s (`agent-ide:*`), never Electron IPC directly. The receiving component handles IPC if needed.

## Dependencies

- **Fuse.js** — fuzzy search for all three pickers
- `../../hooks/appEventNames` — event name constants (`OPEN_SETTINGS_PANEL_EVENT`, `SPLIT_EDITOR_EVENT`, etc.)
- `../../hooks/useProjectFileIndex` — provides flat file list for `FilePicker`
- `../../types/electron` — `SymbolEntry` type for symbol search (from LSP via preload bridge)
- `../FileTree/FileListItem` — `FileEntry` type reused by `FilePicker`
