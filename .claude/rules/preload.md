# Preload Bridge Rules (src/preload/**)

- Minimal surface area — only `contextBridge.exposeInMainWorld`
- No business logic — just relay calls between renderer and main
- Type definitions must match `src/renderer/types/electron.d.ts` exactly
- Never expose raw `ipcRenderer` — always wrap in typed functions
