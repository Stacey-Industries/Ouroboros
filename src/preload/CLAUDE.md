<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The preload layer has a deliberate split across three files driven by the 300-line ESLint limit. `preload.ts` assembles core domains (pty, config, files, hooks, app, shell, theme, git, providers, auth, codex), while `preloadSupplementalApis.ts` carries newer/heavier domains and uses a shared `onChannel<T>` helper that abstracts away the `IpcRendererEvent` stripping pattern. Both files converge into a single `contextBridge.exposeInMainWorld` call — there is only one exposure point.
`─────────────────────────────────────────────────`

# Preload — contextBridge IPC Surface

Single entry point that assembles typed `window.electronAPI` from domain slices and exposes it to the renderer via `contextBridge.exposeInMainWorld`.

## Key Files

| File | Role |
|---|---|
| `preload.ts` | Entry point. Assembles core API slices (`pty`, `config`, `files`, `hooks`, `app`, `shell`, `theme`, `git`, `providers`, `auth`, `codex`), merges `supplementalApis`, and calls `contextBridge.exposeInMainWorld('electronAPI', ...)`. The single exposure point. |
| `preloadSupplementalApis.ts` | All newer/heavier domain APIs (`approval`, `sessions`, `cost`, `usage`, `lsp`, `mcp`, `mcpStore`, `agentChat`, `orchestration`, `claudeMd`, `router`, `ai`, etc.). Exported as `supplementalApis` and spread into the root object in `preload.ts`. |
| `preloadSupplementalRulesSkills.ts` | Rules, commands, hooks config, and Claude settings CRUD — exported as `rulesAndSkillsApi` and wired in via `supplementalApis.rulesAndSkills`. |

## Patterns

**`onChannel<T>` helper** — both supplemental files define a local `onChannel<T>(channel, callback)` that strips the `IpcRendererEvent` argument and returns a cleanup `() => void`. Use this for any push-event subscription rather than inlining the `handler` boilerplate.

**All subscriptions return cleanup functions** — event listeners are registered with `ipcRenderer.on` and the cleanup calls `ipcRenderer.removeListener`. The renderer consumes these in `useEffect` returns. Never skip the cleanup.

**`orchestration.cancelTask` routes to `agentChat:cancelTask`** — the orchestration API's cancel method intentionally invokes the `agentChat` handler (see inline comment at line 283). The old `orchestration:cancelTask` handler was removed because it created a fresh adapter with empty process Maps.

**Split driven by the 300-line limit** — `preload.ts` and `preloadSupplementalApis.ts` are near-identical in structure; the split is an ESLint max-lines constraint, not an architectural boundary.

## Gotchas

- **Never add a second `contextBridge.exposeInMainWorld` call.** There is exactly one, at the bottom of `preload.ts`. New API domains go in `preloadSupplementalApis.ts` and are merged via spread.
- **`orchestration` is typed `as any`** — its ElectronAPI type includes routes handled by `agentChat`. This is intentional and documented in the inline comment; do not try to fix the type without resolving the dual-handler situation.
- **No business logic here.** Every function is a one-liner IPC relay. If you find yourself writing conditionals or state, it belongs in `src/main/` instead.
- **Type source of truth is `src/renderer/types/electron.d.ts`** — all `ElectronAPI` subtypes (e.g., `ElectronAPI['agentChat']`) are imported from there. Keep method signatures in sync with that file after any change.

## Dependencies

- Imports types from `../renderer/types/electron` (shared IPC contract)
- Imports channel name constants from `@shared/ipc/agentChatChannels` and `@shared/ipc/orchestrationChannels`
- No imports from `@main/*` — preload cannot import main-process modules
- Consumed exclusively by the renderer via `window.electronAPI`
<!-- claude-md-auto:end -->
