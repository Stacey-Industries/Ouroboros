<!-- claude-md-auto:start -->
# FileBrowser — Web-Mode Folder Selection Modal

Web-only replacement for the native OS folder picker (`files.selectFolder()`). Renders a modal directory browser backed by `window.electronAPI.files.readDir`.

## Key Files

| File | Role |
|---|---|
| `WebFolderBrowser.tsx` | Modal component — directory listing, breadcrumb nav, keyboard shortcuts |
| `WebFolderBrowserSupport.ts` | Promise bridge — DOM event ↔ `async/await` adapter for callers |
| `index.ts` | Barrel export |

## How It Works

Callers `await requestFolderSelection()` — they never touch the modal directly. The support module dispatches a DOM `CustomEvent` (`agent-ide:request-folder-selection`) which `WebFolderBrowser` listens for to open itself. When the user confirms or cancels, `resolveFolderSelection()` settles the pending promise.

```
caller: await requestFolderSelection()
  → dispatches agent-ide:request-folder-selection
  → WebFolderBrowser opens
  → user navigates + clicks "Select This Folder"
  → resolveFolderSelection({ cancelled: false, path })
  → promise resolves back to caller
```

## Gotchas

- **Single pending promise**: `WebFolderBrowserSupport.ts` holds one module-level `pendingResolve`. Concurrent calls chain onto the same resolve — both callers get the same result. This is intentional but means only one dialog can logically be open at a time.
- **Only directories shown**: `DirList` filters `entries` to `isDirectory === true`. Files are intentionally hidden — this is a folder picker, not a file picker.
- **Path normalization is always forward-slash**: `buildBreadcrumbs` and `parentPath` replace `\` with `/` before processing. Windows paths are handled but the display and storage format is Unix-style.
- **`window.electronAPI.files.readDir` is still used in web mode** — this works because `webPreload.ts` provides a WebSocket-backed shim of `electronAPI` for the web deployment target. The component is web-mode-specific but still goes through the same IPC surface.
- **`z-index: 9999`** — renders above all other overlays including command palette and settings modal.
- **Escape/Enter keyboard shortcuts** are wired only while `isOpen` — listeners are added/removed in a `useEffect` keyed on `state.isOpen`.

## Relationships

- Consumed by: wherever `requestFolderSelection()` is called (search `import.*FileBrowser` or `requestFolderSelection` usages)
- IPC dependency: `window.electronAPI.files.readDir` (defined in `src/renderer/types/electron.d.ts`)
- Uses DOM `CustomEvent` system — not Electron IPC (renderer-only coordination)
<!-- claude-md-auto:end -->
