# IPC Contract Rules (src/renderer/types/electron*.d.ts)

- This file is the single source of truth for all IPC shapes
- Changes here cascade to: preload bridge, main handlers, renderer consumers
- Channel naming convention: `domain:action` (e.g., `pty:spawn`, `files:readDir`)
- After editing, run `npx tsc --noEmit` to verify type consistency across all three processes
- All handlers return `{ success: boolean; error?: string }` pattern
