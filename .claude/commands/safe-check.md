Run safety checks specific to this Electron IDE:

1. Process boundaries: grep for `@renderer` imports in src/main/ and `require` in src/renderer/
2. Legacy xterm: grep for imports from `xterm` (should be `@xterm/xterm`)
3. Hardcoded colors: grep for hex color values (#xxx, #xxxxxx, rgb()) in src/renderer/
4. Raw IPC: grep for `ipcRenderer` usage outside of src/preload/
5. Electron kill: grep for `taskkill` or `kill.*electron` in any file

Report any violations found with file:line references.
$ARGUMENTS
