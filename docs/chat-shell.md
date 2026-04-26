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

## Chat workbench variant (Wave 46 + Wave 47 follow-through)

Gated by `layout.chatWorkbench`. Replaces the history-first body with a session-first workstation layout.

**Rail IA (Wave 47):** `WorkbenchRail` groups sessions into three sections — active, background (live but not focused), and recent chats. Background sessions show attention state (unseen completion, pending approval, failure). `useWorkbenchAttention` derives attention state; `useWorkbenchSessionActivation` owns the activation bridge through `sessionCrud.activate`. Distinct "New session" and "Launch agent" affordances in the rail header.

**Adaptive surface policy (Wave 47):** `useWorkbenchSurfacePolicy` is the single gatekeeper for when artifact/utility/terminal surfaces open. It keys every trigger and suppresses re-open loops after user dismissal until a materially new event arrives. Layout defaults: rail open, artifact + utility closed.

**Artifact history (Wave 47):** `useArtifactHistoryStack` tracks recently touched files/diffs per active session. `ChatWorkbenchArtifactPane` shows the history stack with selection affordances.

**Timeline inspector (Wave 47):** `useWorkbenchTimeline` (decomposed into `.entries.ts` + `.helpers.ts`) normalizes agent events, tool calls, approvals, and diff milestones into an inspectable feed. `WorkbenchTimelinePanel` renders it in the utility drawer activity tab.

**Subagent transcript drill-in (Wave 47):** `SubagentTranscriptPanel` resolves and displays the transcript for the selected subagent tool call. The "Clear selection" affordance resets the panel for re-use.

**Compare mode (Wave 47):** `ChatWorkbenchComparePane` mounts a secondary `AgentChatWorkspace` in inspect-only mode with an isolated store (`useScopedWorkbenchWorkspace`). The primary pane owns artifact/utility surfaces; the secondary is read-only. `useWorkbenchCompare` manages eligibility (active, non-primary, has a linked thread) and compare-target state.

**HTML preview (Wave 47):** `HtmlPreview.tsx` renders agent-generated HTML via `<iframe srcDoc>` with the strictest `sandbox=""` (no scripts, no same-origin, no navigation, no popups, no forms, no modals). Local relative assets do not resolve — a non-blocking banner informs the user. `ContentRouter` checks `isHtml` before `isMarkdown`; `.html`/`.htm` files always get the sandboxed preview.

**Surfaces:**
- `ChatWorkbenchArtifactPane` — file/diff preview + artifact history
- `ChatWorkbenchUtilityDrawer` — approvals, review, timeline activity, subagent transcript
- `ChatWorkbenchTerminalDock` — shared terminal manager in a bottom dock
- `ChatWorkbenchComparePane` — optional inspect-only secondary session pane

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
