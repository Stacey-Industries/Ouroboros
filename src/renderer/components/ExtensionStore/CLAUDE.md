<!-- claude-md-auto:start -->
Now I have enough to write a useful CLAUDE.md.

# ExtensionStore — Extension browsing, installation, and management UI

Two parallel extension systems in one page: VSX registry extensions (Open VSX / VS Code Marketplace) and locally-installed native extensions. Rendered as a centre-pane `SpecialView` via `ExtensionStorePage`.

## Key Files

| File | Role |
|---|---|
| `ExtensionStorePage.tsx` | Entry point — tabbed shell (Browse / Installed). Deep-links via `OPEN_EXTENSION_STORE_EVENT` CustomEvent with `{ tab }` detail. |
| `extensionStoreModel.ts` | State hook for the VSX Browse tab — search, pagination, install/uninstall, enable/disable against Open VSX or VS Code Marketplace via `window.electronAPI.extensionStore`. |
| `ExtensionStoreSection.tsx` | Browse tab UI — source toggle, category filters, search input, card list, detail panel. Consumes `useExtensionStoreModel`. |
| `ExtensionStoreSectionDetail.tsx` | Detail panel for a selected VSX extension — README (via `react-markdown`), stats, install/uninstall/toggle actions. |
| `ExtensionStoreCard.tsx` | Single search result row — shows install status badge. |
| `useExtensionsSection.ts` | State model for the Installed tab — locally-installed native extensions via `window.electronAPI.extensions`. |
| `useExtensionsSectionSupport.ts` | Decomposed helpers and sub-hooks for `useExtensionsSection` — status actions, utility actions, side effects, shared interfaces. |
| `ExtensionsInstalledSection.tsx` | Installed tab UI — list with enable/disable/uninstall per native extension. |
| `VsxInstalledSection.tsx` | Standalone section (used in Settings, not the store page) — shows installed VSX extensions with theme activation controls. Listens for `VSX_EXTENSIONS_CHANGED_EVENT` to auto-refresh. |
| `VsxInstalledSection.parts.tsx` | Stateless render components for `VsxInstalledSection` — body, rows, theme action areas. |
| `VsxInstalledSection.actions.tsx` | `ThemeActionCollections` — apply colour theme / file icon theme / product icon theme controls. |
| `ExtensionsBuildGuide.tsx` | Static developer guide UI — explains activation events, permissions, and manifest format for authoring native extensions. |
| `ExtensionsSectionActions.tsx` | Action bar for native extensions — install from folder, open folder, force activate. |

## Two Extension Systems — Don't Confuse Them

| System | API bridge | Extension type | ID format |
|---|---|---|---|
| **VSX** (Open VSX / Marketplace) | `window.electronAPI.extensionStore` | Themes, grammars, snippets | `namespace.name` (e.g. `ms-python.python`) |
| **Native/local** | `window.electronAPI.extensions` | JS extensions installed from folder | `name` only |

The Browse tab talks to the VSX API; the Installed tab talks to the native API. `VsxInstalledSection` is a third view that shows installed VSX extensions and is mounted in Settings, not this page.

## State Architecture

`useExtensionStoreModel` (VSX) decomposes into three sub-hooks sharing a `sourceRef`:

- `useExtensionStoreSearchState` — query, results, pagination, debounce (300ms), category filter
- `useExtensionStoreSelectionState` — selected extension detail (fetched on select)
- `useExtensionStoreInventoryState` — `installedMap`, `disabledIds`, install/uninstall/toggle

`sourceRef` is a `MutableRefObject` passed down so source-switch callbacks read the latest value without going stale in `useCallback` closures.

`useExtensionsSection` (native) similarly decomposes: state → loaders → status actions → utility actions, all assembled in `useExtensionsSectionModel`.

## Post-Mutation Events

After any install, uninstall, or enable/disable on VSX extensions, four DOM CustomEvents are dispatched to propagate theme changes globally:

```ts
EXTENSION_THEMES_CHANGED_EVENT
FILE_ICON_THEMES_CHANGED_EVENT
PRODUCT_ICON_THEMES_CHANGED_EVENT
VSX_EXTENSIONS_CHANGED_EVENT
```

`VsxInstalledSection` and `useFileIconThemes` / `useProductIconThemes` hooks listen for these to re-render with updated data.

## Style Files

Styles are split across four files added incrementally — not a clean separation:

| File | Covers |
|---|---|
| `extensionStoreSectionStyles.ts` | Browse tab (VSX store) |
| `extensionsSectionStyles.ts` | Installed tab (native), part 1 |
| `extensionsSectionStyles2.ts` | Installed tab (native), part 2 (overflow from 300-line limit) |
| `vsxInstalledSectionStyles.ts` | VsxInstalledSection (Settings embed) |

All use inline `React.CSSProperties` objects. Colour values use `var(--token-name)` CSS variables — do not hardcode hex.

## Deep-Link Tab

`ExtensionStorePage` listens for `OPEN_EXTENSION_STORE_EVENT` on `window`. Any code can switch to a specific tab by dispatching:

```ts
window.dispatchEvent(new CustomEvent(OPEN_EXTENSION_STORE_EVENT, { detail: { tab: 'installed' } }));
```

## Gotchas

- **VSX extension IDs** are `${namespace}.${name}` — the `installedMap` key and `disabledIds` set both use this format. Check consistency when comparing against `InstalledVsxExtension.id`.
- **`extensionStore` API may be absent** — `getExtensionStoreApi()` returns `undefined` in older builds. All async operations guard with `if (!api) return`. The model also sets an error message if absent on mount.
- **Pagination**: `PAGE_SIZE = 20` in both `extensionStoreModel.ts` and `ExtensionStoreSection.tsx` — they are separate constants. The model's offset tracks the last fetched page; "load more" appends to the list.
- **`useExtensionsSectionSupport.ts`** is a support module only — do not import `ExtensionsState` or `ExtensionLoaders` in UI components. Those interfaces are internal to the model layer.
- **`VsxInstalledSection`** is not rendered by `ExtensionStorePage` — it lives in Settings. Don't move it here without checking the Settings integration.
<!-- claude-md-auto:end -->
