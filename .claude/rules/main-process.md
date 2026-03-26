# Main Process Rules (src/main/**)

- Node.js only — never import from `@renderer/*`
- Use `ipcMain.handle` for request/response, `webContents.send` for push events
- All native dependencies must be externalized in electron.vite.config.ts
- Security rules apply: `eslint-plugin-security` is enforced at error level
- Never use `eval()`, `new Function()`, or dynamic `require()` in main process
