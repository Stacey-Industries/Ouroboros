# Chat-Only Shell

Wave 42 introduced a second renderer shell — `ChatOnlyShell` — that replaces the full five-panel IDE when immersive chat mode is active. The backend is unchanged; same session store, same threads, same PTY, same hooks pipe.

## Trigger condition

Computed in `InnerApp`:

```ts
const isImmersive = isChatWindow || immersiveFlag;
```

- `isChatWindow` — window opened as `?mode=chat` (pop-out chat window, Wave 20).
- `immersiveFlag` — `config.layout.immersiveChat === true` (toggled via Settings, `Ctrl+Alt+I`, or View menu).

## Shell layout (Wave 44 parity pass)

`ChatOnlyTitleBar` + horizontal `ChatOnlyBody` (persistent `ChatHistorySidebar` + `AgentChatWorkspace` with `ChatStatusChipRow` beneath the composer) + `ChatOnlyStatusBar` + overlays (`ChatOnlyDiffOverlay`, `ChatOnlySettingsOverlay`, `KeyboardShortcutCheatSheet`, `CommandPalette`). Sidebar cycles pinned (280px) → collapsed (48px rail) → hidden (off-canvas `ChatOnlySessionDrawer` fallback); mode persists in `config.layout.chatSidebarMode`.

## Chat workbench variant (Wave 46)

Gated by `layout.chatWorkbench`. Replaces the history-first body with a session-first `WorkbenchRail`, keeps `AgentChatWorkspace` central, and adds three selective IDE reuses around it:

- `ChatWorkbenchArtifactPane` — file/diff preview
- `ChatWorkbenchUtilityDrawer` — approvals, review, activity, subagents
- `ChatWorkbenchTerminalDock` — shared terminal manager in a bottom dock

The utility drawer auto-opens on new approvals, new diff review, and `agent-ide:open-subagent-panel`.

## Keyboard shortcuts

- `Ctrl+,` — Settings
- `Ctrl+K` — command palette
- `Ctrl+/` — shortcut cheat-sheet
- Sidebar toggle cycles mode

## IdeToolBridge behavior

`IdeToolBridge` is intentionally NOT mounted in chat-only mode. IDE-context tool queries (`getOpenFiles`, `getActiveFile`, `getSelection`, `getUnsavedContent`, `getTerminalOutput`) return empty — matching Claude desktop behaviour. Cross-window IDE-tool delegation is a Wave 45+ candidate.

## Provider layout

Providers (`DiffReviewProvider`, `FileViewerManager`, `MultiBufferManager`) live above the branch in `ChatOnlyShellWrapper`; the `AgentChatStoreContext` store is lifted at the shell level so the sidebar + user menu (outside `AgentChatWorkspace`) share state with the workspace.

## Theme / Material (Wave 45)

Shell root uses `h-screen w-screen`. The app ships a **material baseline** — `MATERIAL_VARIANTS = { vapor, prism, warp }` in `src/renderer/themes/material.ts`. The user picks the variant via `config.materialVariant` (Settings → Appearance → Material, or the `Material:` submenu in the command palette).

Themes paint the accent/text channel on top of whichever material is active; they no longer carry their own `backgroundGradient`. Shell roots stack three background layers (`var(--glass-dim), var(--bg-glows), var(--bg-wash)`) and `--surface-chat` now points at `var(--material-panel)` so glass themes don't bleed through to window chrome.

Composer is a `FloatingComposerContainer` reading `--composer-wash / --radius-md / --shadow-bubble`; model + permission chips live in `ChatStatusChipRow` below the composer (NOT the title bar — avoids drag-region / popover conflicts). Streaming is rAF-batched via `useRafBatchedChunks`.
