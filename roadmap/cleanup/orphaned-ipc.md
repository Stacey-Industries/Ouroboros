# Orphaned IPC Channels — Audit Result

**Generated:** 2026-05-01.
**Method:** Enumerated every `ipcMain.handle()` and `ipcMain.on()` registration in `src/main/`, every `ipcRenderer.invoke|send|on()` in `src/preload/`, and the renderer-side calls via `window.electronAPI.*` plus type definitions in `src/renderer/types/electron.d.ts`. Cross-referenced for mismatches.

---

## Result

**No definitively orphaned IPC channels found.**

- **130+ `ipcMain.handle()` registrations** across handler files — all have corresponding entries in the preload bridge (`preload.ts` + `preloadSupplementalApis.ts`).
- **All `ipcRenderer.invoke()` calls in preload** have matching main-side handlers.
- **All `ipcRenderer.on()` event subscriptions** have push-event infrastructure in main (`webContents.send()` or `broadcastToWebClients()`).
- **Channel naming** follows `domain:action` convention throughout (e.g., `pty:spawn`, `files:readFile`, `git:status`).
- **Dynamic channels** (`pty:data:${id}`, `pty:exit:${id}`, `approval:request`, `sessionDispatch:status`) are correctly handled with template-literal prefixes.

## Caveat — renderer-caller side incomplete

Whether every channel is actually *called* from the renderer could not be definitively determined. The renderer accesses IPC primarily through hooks (`useConfig`, `usePty`, `useTerminalSessions`, etc.) that abstract channel names behind helper APIs. A naive grep for `electronAPI.<method>` underestimates usage because methods are often destructured or accessed dynamically.

This means there could be channels with handlers + bridge entries but no real runtime caller. Detecting those reliably requires either:
1. A runtime-instrumentation pass (log every IPC invocation over a soak period and diff against the registered set), or
2. A static-analysis pass that resolves `electronAPI.X.Y(...)` chains through the type-system (e.g., via the TS compiler API or `ts-morph`).

Neither was in scope for this audit.

## Notes

- Architecture is healthy: 3-process boundary (main / preload / renderer) is consistently respected; preload is the sole bridge surface; channel-naming convention is followed; template-literal channels are handled correctly.
- If a future audit needs to find truly-unused channels, instrument the IPC layer with a counter and observe over normal usage — that's the only reliable signal.
