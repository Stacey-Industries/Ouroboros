<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
This directory implements a dual-surface pattern: `McpSection` manages **locally configured** servers (CRUD via IPC), while `McpStoreSection` manages **registry/npm discovery** (search + install). Both surfaces share a common `McpStorePage` shell but use completely separate model hooks — there's no shared state between them. The `MCP_SERVERS_CHANGED_EVENT` DOM CustomEvent is the coupling point: the store install flow fires it, and the section model listens for it to auto-refresh.
`─────────────────────────────────────────────────`

# McpStore — MCP Server Management UI

Two-surface UI for MCP server management: **Browse** (discover and install from Official MCP Registry or npm) and **Installed** (CRUD for locally configured servers). Rendered as a centre-pane `SpecialView` via `McpStorePage`.

## Key Files

| File | Role |
|---|---|
| `McpStorePage.tsx` | Tab shell — `StorePageShell` with Browse/Installed tabs; deep-link tab via `OPEN_MCP_STORE_EVENT` |
| `McpSection.tsx` | Installed tab — renders list of configured servers; delegates to `useMcpSectionModel` |
| `McpStoreSection.tsx` | Browse tab — search UI, source toggle (Registry / npm), server cards; delegates to `useMcpStoreModel` |
| `mcpSectionModel.ts` | State hook for Installed tab — CRUD (add/edit/delete/toggle), form state, auto-refresh on `MCP_SERVERS_CHANGED_EVENT` |
| `mcpStoreModel.ts` | State hook for Browse tab — search, pagination (cursor for Registry, offset for npm), install flow |
| `McpServerForm.tsx` | Shared add/edit form — command, args, URL, env rows, scope (global/project) |
| `McpServerRow.tsx` | Single row in the Installed list — inline edit, confirm-delete pattern |
| `McpStoreSectionDetail.tsx` | Detail panel for a selected registry server — env var inputs, install button |
| `McpStoreServerCard.tsx` | Card in the Browse grid — name, description, install status |
| `mcpHelpers.ts` | `ServerFormState` type, `formToConfig`/`configToForm` converters, shared inline style constants |
| `mcpStoreSectionDetailStyles.ts` | All `CSSProperties` objects for the detail panel — keeps the component file under the 300-line limit |
| `mcpStoreSectionDetailHelpers.ts` | Detail panel pure helpers — `buildEnvOverrides`, `isSensitiveKey`, `installButtonStyle` |
| `McpStoreSectionDetail.parts.tsx` | Sub-components for the detail panel (`RuntimeInfo`, `ServerMetadataSection`) — split to stay under line limits |

## Architecture: Model Hook Pattern

Both surfaces follow the same pattern: a `use*Model()` hook owns all state and async actions, returning a typed `*Model` interface. Components receive the model object and call methods on it — no local state, no direct IPC calls in components.

```
McpStoreSection → useMcpStoreModel() → McpStoreModel interface
McpSection      → useMcpSectionModel() → McpSectionModel interface
```

`useMcpSectionModel` itself composes two private hooks:
- `useMcpServerData` — IPC calls + loading/error state
- `useMcpEditorState` — form/edit/delete UI state

## Cross-Surface Event Coupling

The only link between the two surfaces is a DOM CustomEvent:

```
McpStoreSection install → window.dispatchEvent(MCP_SERVERS_CHANGED_EVENT)
McpSection (useMcpServerData) → window.addEventListener(MCP_SERVERS_CHANGED_EVENT) → refresh()
```

After a store install, the Installed tab auto-refreshes without prop drilling or shared state.

## IPC Bridges

- **`window.electronAPI.mcp.*`** — used by `mcpSectionModel.ts`: `getServers`, `addServer`, `updateServer`, `removeServer`, `toggleServer`
- **`window.electronAPI.mcpStore.*`** — used by `mcpStoreModel.ts`: `search`, `searchNpm`, `getInstalled`, `install`, `uninstall`

These are separate IPC namespaces — do not mix them.

## Pagination

Registry search uses cursor-based pagination (`nextCursor` from response). npm search uses offset-based (`npmOffset` / `npmTotal`). Both are handled in `mcpStoreModel.ts`; `loadMore` appends to the existing list rather than replacing it.

## Server Name Resolution

Registry server names are namespaced (e.g. `@scope/mcp-server-name`). `extractShortName` (in `mcpStoreModel.ts`) and `mcpExtractShortName` (in `mcpStoreSectionDetailHelpers.ts`) strip the scope prefix for matching against locally installed names. Both exist because the detail panel re-exports the helpers from a different entry point — do not deduplicate them without tracing all import paths.

## Form Conventions

- `ServerFormState` (`mcpHelpers.ts`) is the canonical form shape — args stored as space-separated string, deserialized to `string[]` in `formToConfig`
- `scope: 'global' | 'project'` maps to Claude Code's `--global` flag at install time
- Env rows are an array of `{ key, value }` objects, not a plain `Record` — the form renders dynamic rows and needs stable indices for remove operations

## Gotchas

- **`extractShortName` exists twice**: once exported from `mcpStoreModel.ts`, once as `mcpExtractShortName` from `mcpStoreSectionDetailHelpers.ts`. `McpStoreSectionDetail.tsx` re-exports `mcpExtractShortName` for `McpStoreSection` to use. The duplication is intentional — the detail file's helpers are co-located with the component that needs them.
- **`onRegisterRefresh` callback**: `McpStorePage` passes this to both tabs so the shell's refresh button can call the active tab's own refresh. It's a ref-based callback registered via `useEffect` — safe to call without triggering re-renders.
- **Style co-location split**: `McpStoreSectionDetail` hit the 300-line ESLint limit, so styles were extracted to `mcpStoreSectionDetailStyles.ts` and sub-components to `McpStoreSectionDetail.parts.tsx`. If you add features, watch the line count.
- **Search debounce**: `mcpStoreModel.ts` debounces search by `SEARCH_DEBOUNCE_MS = 300ms` using a `useRef` timer — changing `query` triggers a delayed `search()` call, not an immediate one.
<!-- claude-md-auto:end -->
