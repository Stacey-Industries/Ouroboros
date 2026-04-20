# Wave 44 — Chat-Only Shell Parity Pass (Claude App / Piebald targets)
## Implementation Plan

**Version target:** v2.2.0 (minor — significant UX rework of chat-only shell)
**Feature flag:** none (Wave 42's `layout.immersiveChat` stays; fixes apply directly)
**Dependencies:** Wave 42 (`ChatOnlyShell`), Wave 43 (chrome strip + header controls + rAF batching + hotfix)
**References:** Claude desktop app (post-April-2026 redesign), Piebald, new Claude coding UI

---

## Overview

Wave 43 stripped IDE chrome from the chat-only shell. Dogfood revealed the shell is now *too* stripped and *still* drifted from the references:

1. **No way back to IDE mode** — "Exit chat mode" was moved to a View menu that doesn't exist in this shell.
2. **Window is half-empty with glass-blur bleeding through** — `--surface-chat` resolves to `--palette-bg` (transparent in glass theme); chat content fills only top ~50% of the viewport because the flex chain from `ChatOnlyShell` → `main` → max-w-4xl column doesn't stretch `AgentChatWorkspace` to full height.
3. **Sidebar is the IDE `SessionSidebar`** — full project/worktree filter + folder tree. Claude / Piebald use a flat chat-thread list with status indicators. It's also overlay-only with no pin mode.
4. **Model picker + permission chip don't respond.** Classic Electron gotcha: `<header>` has `WebkitAppRegion: 'drag'`; dropdown popovers render in a portal outside the title-bar `no-drag` zone and get swallowed by the drag surface.
5. **No settings access.** IDE mode has `Ctrl+,` / File menu; chat-only has neither.
6. **No command palette, no shortcut overlay, no user menu.** Users have no way to reach any non-chat function.
7. **Theme drift from IDE.** Title bar uses `bg-surface-chat` (transparent in glass), chat content uses `bg-surface-panel` (opaque). Tonal mismatch at the seam.

Wave 44 closes these gaps, matching the Claude desktop + Piebald paradigm:

- **Persistent left rail** (pinnable + collapsible), chat-thread list with per-thread status dots, "+ New chat", project grouping.
- **Bottom-left user menu** with Settings / theme / help / exit chat mode.
- **Status-chip row** under the composer (model / permission / profile) — reference Piebald layout.
- **Settings modal + command palette** reachable from chat-only (Ctrl+, / Ctrl+K).
- **Unified opaque theme** aligned with IDE panel tokens — no glass bleed in chat-only.
- **Vertical flex fix** — chat column fills viewport.
- **Drag-region fix** — popovers/menus work.

---

## Scope

### In-scope

- Critical-path fixes (Phase A) shipped first so the shell is usable: exit button, drag-region fix, height fill, theme unification.
- New `ChatHistorySidebar` component replacing `SessionSidebar` inside chat-only (IDE mode unchanged).
- Persistent / pinned sidebar mode with animated collapse to a 48px icon rail.
- `ChatOnlyUserMenu` bottom-left popover with Settings / Language / Theme / Help / Exit chat mode / Log-out.
- Settings modal reachable via `Ctrl+,`, the user menu, and a gear icon in the sidebar footer. Reuses the existing `Settings` component tree via a modal host.
- Command palette (`Ctrl+K`) reachable in chat-only.
- Status-chip row below composer showing model / permission / profile, each clickable. Replaces / complements `ChatOnlyHeaderControls` depending on final layout decision in Phase C.
- Per-thread status indicator (running / pending / complete / error) in the sidebar row, sourced from existing agent events.
- Keyboard shortcut cheat-sheet overlay (`Ctrl+/`) — tiny, optional, but Claude-app-parity.

### Out-of-scope

- Routines / Customize / Upgrade plan / Gift Claude items from Claude's user menu — those are product-side features not in Ouroboros.
- Language switcher — Ouroboros is English-only.
- Theme-mode preview cards in Settings appearance panel (Claude's "Light / Auto / Dark" cards) — existing theme picker stays.
- Mobile responsive layout for chat-only (sidebar below 768px) — defer.
- Cross-window IDE tool delegation — still Wave 45+ candidate.

---

## Architecture

```
ChatOnlyShell
 ├─ ChatOnlyTitleBar  (drag region, sidebar-pin toggle, header controls, window buttons, EXIT CHAT button)
 ├─ ChatOnlyBody  (NEW — horizontal flex row, owns sidebar pin state)
 │    ├─ ChatHistorySidebar  (NEW — persistent or collapsed-to-rail)
 │    │    ├─ SidebarHeader (search, new-chat)
 │    │    ├─ ChatHistoryList (flat threads, project-grouped, status dots)
 │    │    └─ ChatOnlyUserMenu (bottom — trigger + popover)
 │    └─ <main> (conversation column, fills remaining width)
 │         ├─ AgentChatWorkspace variant="chat-only"
 │         └─ ChatStatusChipRow (NEW — model/permission/profile chips)
 ├─ ChatOnlyStatusBar (existing, conditional)
 ├─ ChatOnlyDiffOverlay (existing)
 ├─ ChatOnlySettingsOverlay (NEW — full-screen modal mounting Settings)
 ├─ CommandPalette (existing — just wire to chat-only Ctrl+K)
 └─ KeyboardShortcutCheatSheet (NEW — Ctrl+/, dismissible)
```

**Sidebar state (`useChatSidebarState`):**
- `mode: 'pinned' | 'collapsed' | 'hidden'`
- `pinned` — 280px column, chat list visible
- `collapsed` — 48px rail showing only icons (new chat, search, user menu)
- `hidden` — slide-out behaviour only, overlay scrim (existing Wave 42 behaviour, kept as opt-in)
- Default: `pinned`. Persisted to `config.layout.chatSidebarMode`.

**Sidebar content model:** flat thread list from the existing agent-chat store, grouped by `projectRoot` (basename). Within each project group, sort by last-activity desc. Pinned threads float to top. Each row shows:
- Status dot (running = pulsing green, pending-approval = yellow, error = red, complete = dim)
- Title (first user message, truncated)
- Subtitle (time ago, message count)

---

## Phase A — Critical hotfix pass

**Goal:** Shell is usable again. No more stuck-in-chat-mode, no more glass bleed, no more dead dropdowns.

### Modified files

| File | Change |
|------|--------|
| `src/renderer/styles/tokens.css` | `--surface-chat` no longer aliases `--palette-bg` (which is transparent in glass theme). Change to reference `--palette-panel` or a new per-theme solid value that matches the IDE panel colour. Apply per theme so glass remains opaque in chat-only. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Fix flex chain so `AgentChatWorkspace` fills viewport height. Likely root cause: `<main>` uses `items-center` on a flex-col which stretches cross-axis (horizontal) only — vertical stretch relies on the child having `h-full` and the parent having explicit height from `flex-1 min-h-0`. Audit and ensure `AgentChatWorkspace`'s internal `<div className="flex h-full min-h-0 w-full ...">` actually gets a bounded-height parent. If needed, replace `items-center` with `items-stretch` + manual horizontal centering via `mx-auto` on the inner column. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Restore a visible "Exit chat mode" button on the right side of the title bar (before window controls). Dispatches `TOGGLE_IMMERSIVE_CHAT_EVENT`. Keep it minimal — icon + tooltip, no text. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Remove `WebkitAppRegion: 'drag'` from the `<header>` and instead apply `drag` to a dedicated empty `<div>` flex-spacer between left cluster and window controls. This ensures the area occupied by `ChatOnlyHeaderControls` is not in the drag region, so dropdown popovers fire click events correctly. Buttons in left/right clusters keep `no-drag` as before. |
| `src/renderer/components/AgentChat/SelectPill.tsx` / `AgentChatComposerSection.tsx` dropdowns | Audit for any internal `WebkitAppRegion` overrides. Confirm popover containers (likely portaled) use `no-drag`. |

### Subagent briefing

- **Read first:** `src/renderer/styles/tokens.css` (find `--surface-chat` and `--palette-*`), `src/renderer/themes/` (find `--palette-bg` and `--palette-panel` per theme — especially glass), `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx`, `ChatOnlyTitleBar.tsx`, `src/renderer/components/AgentChat/SelectPill.tsx`, `AgentChatWorkspace.tsx`.
- **Theme audit:** for each theme file in `src/renderer/themes/`, ensure `--surface-chat` resolves to an opaque value. Glass theme needs a specific opaque override since `--palette-bg` is deliberately transparent there. Other themes can alias to `--palette-panel` or `--palette-bg` (whichever is opaque).
- **Height-fill debug:** before "fixing", add a temporary data attribute or inspect via React DevTools equivalent in tests — confirm the actual rendered height of the chat column. The root cause might NOT be what I hypothesise; debug before patching (per memory `feedback_debug_before_fix.md`).
- **Drag region:** test by manually clicking the model picker after the change. Automated test is hard (Electron-specific CSS); parent verifies in dev smoke.
- **Line numbers may have shifted** — locate by symbol.

### Acceptance

- [ ] `--surface-chat` resolves to an opaque value in every theme (audit each theme file).
- [ ] Chat column fills 100% of viewport height; no glass-blurred region below the conversation.
- [ ] "Exit chat mode" button visible in title bar; clicking toggles back to IDE.
- [ ] Model picker dropdown opens and accepts selection.
- [ ] Permission-mode chip click cycles modes.
- [ ] Scoped tests pass.
- [ ] Commit: `fix(wave-44): Phase A — chat-only critical usability fixes`

---

## Phase B — `ChatHistorySidebar` replacement

**Goal:** Replace `SessionSidebar` inside chat-only with a dedicated chat-thread-list sidebar matching Claude / Piebald. Adds pin / collapse / hidden modes.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistorySidebar.tsx` | ~160 | Root sidebar. Supports `mode: 'pinned' \| 'collapsed' \| 'hidden'`. Renders header (search, new-chat button), list body, user-menu footer. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistoryList.tsx` | ~120 | Virtualised list of threads. Groups by `projectRoot` basename; pinned section at top. Each row: `ChatHistoryRow`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistoryRow.tsx` | ~90 | Single thread row. Status dot + title + subtitle. Context menu (right-click) with Pin / Archive / Delete / Rename. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistoryStatusDot.tsx` | ~50 | Maps thread status to colour + optional pulsing animation (running). Uses status tokens. |
| `src/renderer/components/Layout/ChatOnlyShell/useChatSidebarMode.ts` | ~60 | `useChatSidebarMode()` — reads `config.layout.chatSidebarMode`, subscribes to toggle events, persists changes. |
| Tests for each of the above | — | Snapshot + state-transition tests. |

### Modified files

| File | Change |
|------|--------|
| `src/main/configSchemaTail.ts` | Add `layout.chatSidebarMode: 'pinned' \| 'collapsed' \| 'hidden'`, default `'pinned'`. |
| `src/renderer/types/electron-foundation.d.ts` | Mirror schema type. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Introduce new `ChatOnlyBody` layout (horizontal flex). Mount `ChatHistorySidebar` as left rail. Remove `ChatOnlySessionDrawer` from this shell (keep it as the `hidden`-mode fallback overlay only). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Sidebar-pin toggle button replaces / supplements the drawer-toggle. Three-state cycle: pinned → collapsed → hidden. |

### Subagent briefing

- **Read first:** Claude/Piebald screenshots saved to `ai/wave-44-refs/` (parent will stage these before dispatch), existing `SessionSidebar.tsx` for data plumbing, `AgentChatTabBar.tsx` for thread metadata access patterns, `agentChatStore.ts` + `agentChatSelectors.ts` for reading thread state.
- **Status dot source of truth:** derive from existing `AgentChatThreadRecord.status` field. Do NOT invent new state. Pulsing "running" indicator via CSS keyframes.
- **Virtualisation:** if thread count can exceed ~50, use the same virtualisation approach as `SessionVirtualList`. Otherwise plain render.
- **Project grouping:** `projectBasename(root)` helper already exists in `SessionSidebar.tsx:29` — import or mirror.
- **Persistent mode is default** — test that toggling pin mode persists across restart.
- **Design tokens only**; status dot colours come from `--status-success`, `--status-warning`, `--status-error`, `--text-semantic-muted`.
- **Do NOT modify `SessionSidebar.tsx`** — it stays for potential future IDE uses.

### Acceptance

- [ ] `ChatHistorySidebar` renders in chat-only shell by default (pinned mode, 280px).
- [ ] Toggle button cycles pinned → collapsed (48px rail) → hidden.
- [ ] Mode persists across app restart.
- [ ] Threads grouped by project; pinned section at top; ordered by last activity.
- [ ] Status dot reflects thread state; running threads pulse.
- [ ] Clicking a row switches active thread.
- [ ] Right-click menu: Pin/Archive/Delete/Rename.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-44): Phase B — ChatHistorySidebar with pin/collapse/hidden modes`

---

## Phase C — User menu, Settings access, command palette

**Goal:** Bottom-left user menu with Settings shortcut. `Ctrl+,` opens Settings as a full-screen modal over chat. `Ctrl+K` opens command palette. `Ctrl+/` opens keyboard cheat-sheet.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyUserMenu.tsx` | ~140 | Bottom-left trigger (avatar + name) + popover. Items: Settings (Ctrl+,), Theme toggle (inline), Keyboard shortcuts (Ctrl+/), Command palette (Ctrl+K), Exit chat mode, Log out (placeholder if auth not wired). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlySettingsOverlay.tsx` | ~100 | Modal host for existing `Settings` component. Full-screen inside chat-only. Esc closes. Back button via the in-Settings back arrow. |
| `src/renderer/components/Layout/ChatOnlyShell/KeyboardShortcutCheatSheet.tsx` | ~120 | Modal cheat-sheet listing key Ouroboros shortcuts grouped by area. Wave 44 surface: chat-only shortcuts only. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/hooks/useAppKeyboardShortcuts.ts` | Register `Ctrl+,` → `OPEN_SETTINGS_EVENT` in chat-only mode. Register `Ctrl+K` → `OPEN_COMMAND_PALETTE_EVENT`. Register `Ctrl+/` → `TOGGLE_SHORTCUT_CHEATSHEET_EVENT`. Existing bindings in IDE mode unchanged. |
| `src/renderer/hooks/appEventNames.ts` | Add `OPEN_SETTINGS_EVENT`, `TOGGLE_SHORTCUT_CHEATSHEET_EVENT` (if not already present). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatHistorySidebar.tsx` | Mount `ChatOnlyUserMenu` in the sidebar footer. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Mount `ChatOnlySettingsOverlay` + `KeyboardShortcutCheatSheet` + `CommandPalette` at shell level. Wire event listeners. |
| `src/renderer/components/Settings/Settings.tsx` (if needed) | No functional change — just confirm the existing component works when mounted in a modal host (no IDE layout assumptions). If it reaches into IDE-only contexts, audit and flag. |

### Subagent briefing

- **Read first:** `src/renderer/components/Settings/Settings.tsx` (confirm self-contained), `src/renderer/components/CommandPalette/*`, `src/renderer/hooks/useAppKeyboardShortcuts.ts`, existing IDE shortcut registrations.
- **Settings overlay is critical** — this is the primary user pain point. Test that theme toggle from Settings applies live to chat-only. Test that mobile-access settings open correctly.
- **Command palette** — likely already usable if mounted. Main concern: any command it exposes that assumes IDE shell (file tree, terminal) must be filtered out or no-ops gracefully in chat-only.
- **User menu popover** — use the existing popover / dropdown primitive if one exists (search for `Popover` in `src/renderer/components/`). Otherwise use native `<dialog>` or a small floating-ui-style impl. Do NOT introduce a new dependency.
- **Theme toggle inline** in user menu — just a sun/moon icon that flips `config.theme` between light and dark. Reuses existing theme infra.
- **Log out** — if auth isn't wired for local mode, render the item disabled with tooltip "Available in v2.3".

### Acceptance

- [ ] Ctrl+, opens Settings modal over chat.
- [ ] Settings modal reachable from user-menu popover.
- [ ] Settings close on Esc; chat focus restored.
- [ ] Ctrl+K opens command palette; palette works in chat-only (IDE-only commands filtered).
- [ ] Ctrl+/ opens keyboard cheat-sheet; Esc closes.
- [ ] User menu trigger in sidebar footer; popover items clickable.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-44): Phase C — user menu, settings modal, command palette, cheatsheet`

---

## Phase D — Status-chip row + header layout re-think

**Goal:** Piebald-style chip row below the composer (model / permission / profile / context), each clickable. Decide whether `ChatOnlyHeaderControls` in the title bar is redundant once the chip row exists.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatStatusChipRow.tsx` | ~140 | Horizontal chip row below the composer. Chips: Model, Permission mode, Profile, Context usage, Connection status. Each a `SelectPill` or toggle. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/AgentChat/AgentChatComposer.tsx` | Mount `ChatStatusChipRow` below the composer when `variant === 'chat-only'`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | **Decision gate:** if Phase D ships the chip row, remove `ChatOnlyHeaderControls` from the title bar to avoid duplication. Title bar becomes truly minimal: sidebar-pin toggle + project name + drag spacer + exit button + window controls. If Phase D does NOT ship the chip row yet, leave header controls in place. Choose in PR discussion; document the decision. |
| `src/renderer/components/AgentChat/WorkspaceVariantContext.ts` | No change — `variant` prop already flows through. |

### Subagent briefing

- **Read first:** the Piebald screenshot (`Screenshot 2026-04-20 141338.png`) for the exact chip layout; `AgentChatComposer.tsx`; `AgentChatComposerParts.tsx` (model/permission chip rendering in composer footer already exists for IDE mode — Phase D of wave-43 suppressed them only when chat-only). Revisit that suppression.
- **Style:** the Piebald chip row is a thin 28px strip below the composer with ghost-style chips. Match that aesthetic.
- **Context chip:** shows "3% ctx" or similar — reuse existing context-bar content.
- **If removing header controls from title bar** — update `ChatOnlyHeaderControls.test.tsx` expectations, update `ChatOnlyTitleBar.test.tsx`, update the Wave 43 `ChatOnlyShell.polish.integration.test.tsx` assertion about header controls in title bar.

### Acceptance

- [ ] Status chip row renders below composer in chat-only mode only.
- [ ] Each chip clickable; model and permission work end-to-end (Phase A fixed the drag-region).
- [ ] Decision on header-controls placement documented in commit message.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-44): Phase D — status chip row + header layout decision`

---

## Phase E — Tests, integration, docs

**Goal:** Integration test for the new shell layout; update all CLAUDE.md entries.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.wave44.integration.test.tsx` | ~150 | Mount full shell in jsdom; verify sidebar modes (pinned / collapsed / hidden) toggle correctly; Ctrl+, opens Settings; Ctrl+K opens command palette; user menu items render; exit-button dispatches toggle event; status chip row visible when variant is chat-only. |

### Modified files

| File | Change |
|------|--------|
| `CLAUDE.md` (root) | Update chat-only subsection: persistent sidebar default, user menu, Settings access, command palette, status chip row. |
| `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | Full rewrite of the architecture summary to reflect Wave 44 layout. |
| `src/renderer/components/AgentChat/CLAUDE.md` | Add `ChatHistorySidebar`, `ChatStatusChipRow` cross-references if any shared primitives. |
| `docs/architecture.md` | Update chat-only paragraph. |

### Acceptance

- [ ] Integration test passes.
- [ ] CLAUDE.md files updated; no stale references to `SessionSidebar` in chat-only context.
- [ ] Commit: `docs(wave-44): Phase E — integration tests + CLAUDE.md updates`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet` (per user rule `agent-model-selection.md`).
- **Isolation:** sequential on master.
- **Test policy:** subagents MUST NOT run `npm test`. Scoped only. Parent runs full suite post-wave.
- **Lint policy:** no relaxation.
- **Debug policy:** after 1 failed fix, add `log.info('[trace:WAVE44-X]', ...)` and hand back.
- **Commit policy:** one commit per phase, conventional commits, local-only.
- **Scope discipline:** listed files only; stop and report if expansion needed.

### Phase dispatch order

1. **Phase A** (critical fixes) — MUST land first; unblocks dogfooding and prevents users from being stuck in chat mode.
2. **Phase B** (sidebar) — depends on A (theme tokens must be unified for sidebar to inherit correctly).
3. **Phase C** (user menu, settings, palette) — depends on B (user menu mounts in sidebar footer).
4. **Phase D** (chip row) — depends on A (drag-region fix required for chips to work).
5. **Phase E** (tests + docs) — last.

Phases A and D could run in parallel after A lands (D only depends on A), but sequence them sequentially for merge cleanliness.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Height-fill fix doesn't work the way I hypothesise.** | Phase A subagent briefed to debug before patching (per memory). If the cause is inside `AgentChatWorkspace`'s own flex chain rather than `ChatOnlyShell`'s, subagent should scope-escalate and report before editing. |
| **Drag-region fix regresses window dragging.** | Manual smoke: after Phase A, verify you can still drag the window by the title bar's empty areas. Automated test is infeasible. |
| **`Settings` component reaches into IDE-only contexts when mounted in overlay.** | Phase C subagent audits before mounting; if it does, flag in commit and either refactor Settings or inject a minimal context. Do not silently patch. |
| **New `ChatHistorySidebar` duplicates `SessionSidebar` logic.** | Shared helpers (`projectBasename`, filter state) can be extracted to `src/renderer/components/shared/` if genuine duplication emerges. Decide during Phase B review. |
| **Thread status dot flickers on fast updates.** | Debounce status transitions in `ChatHistoryStatusDot` (200ms). |
| **Keyboard shortcut collisions.** | Ctrl+, Ctrl+K Ctrl+/ — grep existing bindings before Phase C. If conflicts, document alternatives. |
| **Glass theme gets a new non-transparent token.** | Theme design review: confirm opaque chat-only background is the right call. Alternative: `--surface-chat` stays translucent but the chat column itself becomes opaque (different fix site). Pick one, document in Phase A commit. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits present on master.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (parent):
  - [ ] Enter chat mode. Full viewport filled. No glass bleed.
  - [ ] Exit button visible; clicking returns to IDE.
  - [ ] Model picker opens; permission chip cycles.
  - [ ] Sidebar pinned by default; toggle cycles pinned → collapsed → hidden; persists.
  - [ ] Chat list shows threads grouped by project; status dots accurate; click switches thread.
  - [ ] User menu popover opens; Settings item opens Settings modal.
  - [ ] Ctrl+, opens Settings; Ctrl+K opens command palette; Ctrl+/ opens cheat-sheet.
  - [ ] Status chip row below composer shows model / permission / profile; chips work.
- [ ] IDE mode unchanged (visual smoke pass).

---

## Out-of-wave follow-ups

- **Threads tab bar at top of conversation** (Claude-app style) when multiple threads per project — instead of just sidebar switching.
- **Drag-to-reorder** pinned chats.
- **Claude-app background-animation settings** (pulse / disabled).
- **Cross-window IDE-tool delegation** (deferred from Wave 42/43).
- **Chat-only mobile responsive layout** — sidebar becomes bottom sheet below 768px.
- **Routines / scheduled agents** surface — Ouroboros equivalent.
