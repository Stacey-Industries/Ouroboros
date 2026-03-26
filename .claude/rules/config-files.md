# Config File Rules (*.config.*)

- Changes to build config affect ALL three targets (main, preload, renderer)
- After editing: run `npm run build` to verify, then `npm test`
- Monaco plugin CJS/ESM interop: `vite-plugin-monaco-editor` uses `.default ?? module` — do not simplify
- `optimizeDeps.force: true` prevents stale hash mismatches — do not change in dev
- File watcher exclusions in electron.vite.config.ts prevent agent file changes from triggering HMR
