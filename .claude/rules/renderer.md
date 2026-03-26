# Renderer Rules (src/renderer/**)

- Browser environment — no Node.js APIs, no `require`, no `fs`, no `path`
- Always use `window.electronAPI` bridge (defined in preload) for IPC
- Styling: Tailwind utilities + CSS custom properties only, never hardcode hex colors
- Two event systems: Electron IPC (via preload) vs DOM CustomEvents (renderer-only) — never mix
- Use semantic design tokens: `surface-*`, `text-semantic-*`, `interactive-*`, `status-*`
