<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
This directory has a clean MVVM split enforced at the file level — not just the function level. `commandPaletteState.ts` owns raw React state, `commandPaletteActions.ts` owns event handlers, `commandPaletteViewModel.ts` is a pure function assembling the view model, and `useCommandPaletteModel.ts` is the single orchestrating hook. This means you can unit-test each layer in isolation without touching the component tree.
`─────────────────────────────────────────────────`

Here is the generated CLAUDE.md content:

---

# CommandPalette — VS Code-style command palette, file picker, and symbol search

## Architecture

Three independent picker UIs share overlay primitives but have separate state/data pipelines:

| Feature         | Entry point                                    | State                         | Search                                                     |
| --------------- | ---------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Command palette | `CommandPalette.tsx`                           | `commandPaletteState.ts`      | `commandSearch.ts` (Fuse.js on `label`+`category`)         |
| File picker     | `FilePicker.tsx`                               | Internal `useState`           | Fuse.js on `name`+`relativePath` via `useProjectFileIndex` |
| Symbol search   | `SymbolSearch.tsx` → `SymbolSearchContent.tsx` | `symbolSearchModelHelpers.ts` | Fuse.js on `name`+`relativePath` of `SymbolEntry`          |

## Key Files

| File                          | Role                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                    | `Command`, `CommandMatch`, `CommandCategory` — core types                                                                              |
| `useCommandRegistry.ts`       | Builds command list, manages recent persistence in `localStorage`, exposes `registerCommand`/`unregisterCommand` for external callers   |
| `useCommandPalette.ts`        | Open/close/toggle state + `Ctrl+Shift+P` keyboard shortcut + `agent-ide:command-palette` DOM event listener                            |
| `commandPaletteState.ts`      | React state (query, selectedIndex, navStack) + `useCommandPaletteData` for Fuse matching                                               |
| `commandPaletteActions.ts`    | Keyboard nav, execute, navigate-into-submenu, navigate-back — all as composable hooks                                                  |
| `commandPaletteViewModel.ts`  | Pure function `buildCommandPaletteModel` — assembles state+actions into a single view model                                            |
| `useCommandPaletteModel.ts`   | Orchestrator hook: wires state → data → actions → lifecycle → view model                                                               |
| `commandSearch.ts`            | Fuse.js config, tree flattening (`flattenLeaves`/`flattenAll`), match building, category grouping                                      |
| `commandGroups.ts`            | Simple single-dispatch commands (view, git, app, file). Actions call `dispatchIdeEvent` only.                                          |
| `commandRegistry.builders.ts` | Commands with `children` (submenus) — themes, terminal options, orchestration. Uses `EMPTY_ACTION` for parent nodes.                   |
| `PaletteOverlay.tsx`          | Shared overlay/card shell (fixed position, backdrop, animations) + `CategoryHeader` + `PaletteFooter`                                  |
| `PickerOverlay.tsx`           | File/symbol picker overlay variant — different card dimensions, input styling, animation timings                                       |
| `symbolSearchLifecycle.ts`    | Loads symbols from `window.electronAPI.lsp.getDocumentSymbols`, manages loading/error states, per-root `symbolCache`                   |

## Patterns

- **MVVM decomposition**: State (`commandPaletteState`) → Actions (`commandPaletteActions`) → ViewModel (`commandPaletteViewModel`) → View (`CommandPalettePanel`). Each layer is a separate file. `useCommandPaletteModel` orchestrates the pipeline.
- **Navigation stack**: Commands with `children` push onto `navStack` instead of executing. Backspace on empty query or Escape pops. Enables nested submenus (e.g., Theme → Retro/Modern/Warp). Search at depth > 0 only searches the current level's children.
- **Recent commands**: Stored in `localStorage` under `agent-ide:command-recent` (max 5). Shown when query is empty at root. `flattenLeaves` (not `flattenAll`) is used so parent nodes never appear in recents.
- **External command registration**: `useCommandRegistryBridge` in `useCommandRegistry.ts` listens for `agent-ide:register-command` and `agent-ide:unregister-command` DOM events. Extensions can register commands without importing the registry directly.
- **Conditional commands**: `Command.when` callback hides commands that don't apply in the current context. Checked at match-build time and during direct listing (empty query at submenu depth).
- **Execution telemetry**: `execute` calls `window.electronAPI.extensions.commandExecuted(command.id)` after running the action — allows the extension system to observe palette usage.

## Gotchas

- **Two flatten functions** in `commandSearch.ts`: `flattenLeaves` skips parent nodes (for recent commands and root-level Fuse search), `flattenAll` includes parents (for submenu search). Using the wrong one silently hides or duplicates results.
- **`commandGroups.ts` vs `commandRegistry.builders.ts`**: Groups = flat commands that dispatch a single DOM event. Builders = commands with `children` submenus or complex action logic. Don't add submenu commands to groups.
- **Inline `<style>` tag** in `CommandPalette.tsx` injects keyframe CSS — not Tailwind. Intentional to avoid global CSS pollution.
- **`PaletteOverlay` vs `PickerOverlay`** — command palette uses `PaletteOverlay.tsx`; file/symbol pickers use `PickerOverlay.tsx`. Card dimensions and animation timings differ. Don't swap them.
- **Symbol cache** in `symbolSearchLifecycle.ts` is a module-level `Map<string, SymbolEntry[]>` keyed by `projectRoot`. Cache is invalidated when the project root changes. Symbols are not re-fetched on every open.
- **`showHeaders`** in the view model is `true` only when: query is non-empty AND there are ≥2 categories AND we're at root (not in a submenu). Category headers are never shown in submenu views.

## Dependencies

- **Fuse.js** — fuzzy search for all three pickers
- `../../hooks/appEventNames` — event name constants (`OPEN_SETTINGS_PANEL_EVENT`, `SPLIT_EDITOR_EVENT`, etc.)
- `../../hooks/useProjectFileIndex` — flat file list for `FilePicker`
- `../../types/electron` — `SymbolEntry` type (from LSP via preload bridge)
- `../FileTree/FileListItem` — `FileEntry` type reused by `FilePicker`
- `window.electronAPI.lsp.getDocumentSymbols` — symbol data source for symbol search
- `window.electronAPI.extensions.commandExecuted` — execution telemetry
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
