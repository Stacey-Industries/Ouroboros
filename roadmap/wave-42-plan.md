# Wave 42 — Chat-Only Shell (Immersive Chat Mode)
## Implementation Plan

**Version target:** v1.6.0 (minor — new top-level UI mode)
**Feature flag:** `layout.immersiveChat` (default `false`; enabled automatically when window is opened as `?mode=chat`)
**Dependencies:** Wave 20 (chat-primary preset + pop-out chat window), Wave 41 (layout persistence fixes)

---

## Overview

Wave 20 introduced the `chat-primary` preset, but it was implemented as a slot-swap within the existing five-panel IDE shell. Three user-visible consequences:

1. **Duplicate chat surface** — `AgentChatWorkspace` fills the centre pane, but `RightSidebarTabs` still defaults to the `chat` view, so chat renders twice.
2. **Residual terminal strip** — `visiblePanels.terminal: false` only collapses `TerminalPane` to 32px (header row stays visible).
3. **Empty `editorTabBar`** — the tab strip above chat is still rendered.

Target references (Claude desktop, Codex, piebald.ai) use a **single-column immersive shell**: TitleBar + chat column + StatusBar, with optional off-canvas session/history drawer. No sidebars, no terminal, no editor tab bar.

Wave 42 builds a dedicated `ChatOnlyShell` that replaces the entire IDE shell at the renderer layer when active. **Zero backend changes** — same session store, same threads, same PTY, same hooks pipe. All chat features (tool cards, inline diff preview + apply, change summary bar, plan blocks, thinking blocks, slash commands, @mentions, image attachments, model selector, thread branching, edit+resend, retry, revert) carry over automatically because they live inside `AgentChatWorkspace`.

---

## Scope

### In-scope
- New `ChatOnlyShell` renderer component (TitleBar + AgentChatWorkspace full-width + StatusBar + off-canvas SessionSidebar drawer).
- Mount logic in `App.tsx` / `InnerApp`: when active, `InnerAppLayout` is not mounted; chat-only shell replaces it. Providers (`ApprovalProvider`, `ProjectProvider`, `FocusProvider`, `ToastProvider`, `AgentEventsProvider`, `DiffReviewProvider`, `FileViewerManager`, `MultiBufferManager`) remain mounted — they live in the layer above layout.
- `layout.immersiveChat` config flag + settings entry + keyboard shortcut (`Ctrl+Shift+I`) + View menu item.
- Pop-out chat window (`?mode=chat`) automatically routes to ChatOnlyShell (already wired in Wave 20 Phase B; only the renderer-side mount condition changes).
- Full-pane `DiffReviewPanel` mounts as a modal overlay inside ChatOnlyShell when a batched diff review is pending.
- `IdeToolBridge` is **not** mounted in ChatOnlyShell. IDE-context tool queries (`getOpenFiles`, `getActiveFile`, `getSelection`, `getUnsavedContent`, `getTerminalOutput`) return empty. This matches Claude desktop. Document as intentional.

### Out-of-scope
- Cross-window IDE-tool delegation (listed as a future upgrade path — not needed now because this IDE is agent-first with minimal direct user editing).
- Mobile-primary preset interaction — ChatOnlyShell is desktop-first. If viewport drops below 768px the existing mobile CSS still applies to its contents; no special breakpoint logic in this wave.
- Backend changes. Any subagent that finds itself editing `src/main/**` for anything other than config schema should stop and surface the issue.

---

## Architecture

```
App (config gate)
 └─ Providers (Toast / Focus / AgentEvents / Approval / Project)
      └─ InnerApp
           ├─ IF isImmersive → <ChatOnlyShellWrapper>    ← NEW
           │                     <FileViewerManager>
           │                       <MultiBufferManager>
           │                         <DiffReviewProvider>
           │                           <ChatOnlyShell />
           │
           └─ ELSE             → <InnerAppLayout>        ← existing
                                   (providers + IdeToolBridge + full IDE shell)
```

**Active condition (computed in `InnerApp`):**
```ts
const { isChatWindow } = useChatWindowMode();
const immersiveFlag = useImmersiveChatFlag();
const isImmersive = isChatWindow || immersiveFlag;
```

**ChatOnlyShell layout (single column):**
```
┌───────────────────────────────────────────────────────────┐
│  ChatOnlyTitleBar (drag region, project, mode toggle, x) │
├───────────────────────────────────────────────────────────┤
│  ChatOnlySessionDrawer (off-canvas, slides from left)   │
│  ┌───────────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │            <AgentChatWorkspace />                 │   │
│  │         (full-width, max-w-4xl centered)          │   │
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────────────┤
│  ChatOnlyStatusBar (git branch, token count, diff btn)   │
└───────────────────────────────────────────────────────────┘

Overlays (full-screen, opt-in):
  - <DiffReviewPanel /> when diffReview.pending > 0 AND user opens it
  - <CommandPalette />  (reuse existing)
```

---

## Phase A — ChatOnlyShell component tree

**Goal:** Build the component files and make them renderable in isolation. No `App.tsx` integration yet — Phase A's output is visible only via tests.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | 120 | Top-level shell. Renders title bar + chat area + status bar + drawer. Handles `agent-ide:toggle-session-drawer` DOM event. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | 100 | Minimal title bar: drag region, project name, "Chat Mode" badge, session-drawer toggle button, "Exit chat mode" button, window controls. Reuse platform-specific controls from existing `TitleBar.tsx`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyStatusBar.tsx` | 90 | Minimal status bar: git branch (reuse `useGitBranch`), token usage (reuse `useCostTracking`), "N pending diffs" button that opens DiffReviewPanel overlay. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlySessionDrawer.tsx` | 80 | Off-canvas drawer. Mounts `SessionSidebar` component. Slide-in via CSS transform. Backdrop click closes. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyDiffOverlay.tsx` | 60 | Modal overlay mount for `DiffReviewPanel`. Subscribes to `DiffReviewProvider` state; shows when user clicks status-bar button. Esc key to close. |
| `src/renderer/components/Layout/ChatOnlyShell/index.ts` | 10 | Barrel export. |
| `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | 40 | Directory doc — architecture summary, mount condition, provider expectations. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.test.tsx` | 80 | Renders shell with mocked `AgentChatWorkspace`; verifies no `TerminalPane`/`AgentMonitorPane` in tree, drawer toggles, status-bar diff button shows correct count. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlySessionDrawer.test.tsx` | 50 | Drawer open/close, backdrop dismiss, focus management. |

### Modified files

None yet — Phase A is purely additive.

### Subagent briefing

- **Read first:** `src/renderer/components/AgentChat/AgentChatWorkspace.tsx` (1-80), `src/renderer/components/Layout/InnerAppLayout.tsx` (full), `src/renderer/components/Layout/TitleBar.tsx` (first ~120 lines for window-controls pattern), `src/renderer/components/SessionSidebar/SessionSidebar.tsx`, `src/renderer/components/DiffReview/DiffReviewPanel.tsx` (signature only), `src/renderer/components/Layout/CLAUDE.md`.
- **Do NOT** duplicate TitleBar's full menu system. ChatOnlyTitleBar should be minimal — no File/Edit/View/Go/Terminal dropdowns. Provide an "Exit chat mode" button that dispatches `agent-ide:toggle-immersive-chat` DOM event (handler added in Phase C).
- **Styling:** design tokens only (`bg-surface-panel`, `text-text-semantic-primary`, etc.). No hex values. Read `.claude/rules/renderer.md` for the full token list.
- **Do NOT** mount `IdeToolBridge`. Add a comment at the relevant hook call-site in `ChatOnlyShell.tsx` explaining why.
- **ESLint constraints:** max 300 lines/file, 40 lines/function, complexity 10. Split modules if approaching.
- **Tests only — do not run `npm test`.** Parent runs full suite post-commit. Subagent may run `npx vitest run src/renderer/components/Layout/ChatOnlyShell/` to verify its own tests only.

### Acceptance criteria
- [ ] All new files created with correct paths and line counts within ESLint limits.
- [ ] `ChatOnlyShell.tsx` renders in jsdom test without throwing; tree contains `AgentChatWorkspace` mock, title bar, status bar.
- [ ] `ChatOnlyShell.tsx` tree does NOT contain any reference to `TerminalPane`, `TerminalManager`, `AgentMonitorPane`, `AppLayout`, `InnerAppLayout`, `CentrePaneConnected`, `IdeToolBridge`, `Sidebar`, or `RightSidebarTabs`.
- [ ] Drawer open/close works; backdrop click dismisses.
- [ ] `npx vitest run src/renderer/components/Layout/ChatOnlyShell/` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors introduced.
- [ ] `npm run lint` on touched files — 0 errors.
- [ ] Commit as: `feat(wave-42): Phase A — ChatOnlyShell component tree`

---

## Phase B — App.tsx integration + mount condition

**Goal:** `App.tsx` mounts ChatOnlyShell instead of InnerAppLayout when `isChatWindow || immersiveFlag` is true. Providers remain at the outer layer and are shared. Defaults keep the IDE view; enabling the flag from Settings or query-string activates chat-only mode.

### Modified files

| File | Change |
|------|--------|
| `src/renderer/hooks/useImmersiveChatFlag.ts` (NEW) | New hook modelled on `useChatPrimaryFlag` in `LayoutPresetResolver.tsx`. Reads `config.layout.immersiveChat`. Subscribes to `agent-ide:toggle-immersive-chat` DOM event for live toggle. |
| `src/renderer/App.tsx` | In `InnerApp`: compute `isImmersive`; branch between `<ChatOnlyShellWrapper>` and `<InnerAppLayout>`. `ChatOnlyShellWrapper` mounts `FileViewerManager` + `MultiBufferManager` + `DiffReviewProvider` + `<ChatOnlyShell>` (same provider stack as InnerAppLayout, minus `IdeToolBridge`). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShellWrapper.tsx` (NEW, ~60 lines) | Pulls the three provider wraps out of InnerAppLayout so both shells compose identically. |

### Subagent briefing

- **Read first:** `src/renderer/App.tsx` (full), `src/renderer/components/Layout/InnerAppLayout.tsx` (full — pay attention to provider nesting order and `IdeToolBridge` placement), `src/renderer/hooks/useChatWindowMode.ts`, the `useChatPrimaryFlag` block in `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx:217-225`.
- Provider order in `ChatOnlyShellWrapper` must match `InnerAppLayout` exactly: `FileViewerManager > MultiBufferManager > DiffReviewProvider > children`. Anything that reads diff-review state or file-viewer state must still work.
- `IdeToolBridge` is intentionally absent. Add a one-line comment in `ChatOnlyShellWrapper.tsx`: `// IdeToolBridge not mounted — IDE-context tool queries return empty in chat-only mode (Wave 42 design).`
- The branch in `InnerApp` must not unmount providers — they live above the branch. Only the layout shell swaps.
- Don't break existing tests. Run: `npx vitest run src/renderer/App` and `npx vitest run src/renderer/components/Layout/InnerAppLayout.test.tsx`.

### Acceptance criteria
- [ ] When `config.layout.immersiveChat === false` AND not a chat window, `InnerAppLayout` mounts (existing IDE behaviour; no regression).
- [ ] When `config.layout.immersiveChat === true`, `ChatOnlyShell` mounts instead.
- [ ] When opened as `?mode=chat`, `ChatOnlyShell` mounts regardless of flag state.
- [ ] `DiffReviewProvider`, `FileViewerManager`, `MultiBufferManager` all still accessible in ChatOnlyShell via their hooks (verify with a test that calls `useDiffReview` and `useFileViewerManager` inside a child of `ChatOnlyShellWrapper`).
- [ ] All prior Layout/App tests pass.
- [ ] Commit: `feat(wave-42): Phase B — App.tsx integration + mount condition`

---

## Phase C — Toggle UX, config schema, settings entry

**Goal:** User can enable immersive mode from Settings, keyboard shortcut, or View menu (main window only). Persists across restart.

### Modified files

| File | Change |
|------|--------|
| `src/main/config.ts` / `src/main/configSchemaTail.ts` | Add `layout.immersiveChat: { type: 'boolean', default: false }` to schema. Follow the exact pattern used by `layout.chatPrimary`. |
| `src/renderer/components/Settings/settingsEntries.ts` | Add entry: section "General", label "Immersive chat mode", description "Replaces the IDE shell with a single-column chat interface. Same backend, same features.", type boolean, key `layout.immersiveChat`. |
| `src/renderer/components/Settings/GeneralSection.tsx` | If the section is auto-built from entries, no change. If hand-coded, add the toggle row. |
| `src/renderer/hooks/appEventNames.ts` | Add `TOGGLE_IMMERSIVE_CHAT_EVENT = 'agent-ide:toggle-immersive-chat'`. |
| `src/renderer/hooks/useAppKeyboardShortcuts.ts` | Register `Ctrl+Shift+I` / `Cmd+Shift+I` → dispatch `TOGGLE_IMMERSIVE_CHAT_EVENT`. Check the key isn't already bound; if so, use a different combo and document it. |
| `src/renderer/components/Layout/TitleBar.menus.ts` | Add View-menu item "Switch to Chat Mode" (main window only) that dispatches the toggle event. Label flips to "Exit Chat Mode" when flag is on. |
| `src/renderer/hooks/useImmersiveChatFlag.ts` | Toggle event handler writes to `config.layout.immersiveChat` via IPC (`window.electronAPI.config.set`). |

### Subagent briefing

- **Read first:** `src/main/config.ts` schema section near `layout.chatPrimary`, `src/renderer/components/Settings/settingsEntries.ts` (pattern for a boolean toggle entry), `src/renderer/hooks/appEventNames.ts`, `src/renderer/hooks/useAppKeyboardShortcuts.ts`, `src/renderer/components/Layout/TitleBar.menus.ts`.
- **Keyboard shortcut collision check:** `grep -rn "Ctrl+Shift+I\|ctrlShift.*i" src/renderer/` before committing. If taken, use `Ctrl+Alt+I` and note it in the PR.
- Schema change is the ONLY acceptable `src/main/**` edit in this wave. If you need others, stop and surface.
- After editing schema: `npx tsc --noEmit` to catch type-derivation failures.

### Acceptance criteria
- [ ] Boolean toggle appears in Settings → General.
- [ ] Keyboard shortcut toggles mode live; no reload required.
- [ ] View menu entry label reflects current state.
- [ ] Config persists across app restart (manual verify; no automated test required in this wave).
- [ ] `layout.immersiveChat` appears in config schema tests if any exist.
- [ ] Commit: `feat(wave-42): Phase C — immersive toggle UX + config`

---

## Phase D — DiffReview overlay + status bar integration

**Goal:** Batched diff review works in chat-only mode. Inline per-hunk accept/reject (inside AgentChatWorkspace) already works — this phase adds the full-pane overlay for multi-file batched review.

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyDiffOverlay.tsx` | (Scaffolded in Phase A) — fill implementation: subscribe to `useDiffReview()`, show button in status bar with pending count, open full-screen overlay mounting `DiffReviewPanel`. Esc key closes. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyStatusBar.tsx` | Wire pending-diff count display; click opens overlay. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyDiffOverlay.test.tsx` (NEW, ~60 lines) | Overlay open/close, keyboard Esc, integration with DiffReview state. |

### Subagent briefing

- **Read first:** `src/renderer/components/DiffReview/DiffReviewPanel.tsx` (signature + props), `src/renderer/components/DiffReview/DiffReviewManager.tsx`, `src/renderer/components/DiffReview/diffReviewState.ts`, `src/renderer/components/Layout/CentrePaneConnected.tsx` (how it mounts `DiffReviewPanel` today).
- Reuse `DiffReviewPanel` as-is. Do not modify it. If props don't fit a modal context, add an optional prop — flag it in the commit message.
- Overlay must trap focus and restore on close (use existing focus-trap pattern from the codebase if one exists — search `useFocusTrap` in `src/renderer/hooks/`).

### Acceptance criteria
- [ ] Status-bar button shows pending count, hidden when count is 0.
- [ ] Clicking opens full-screen overlay with `DiffReviewPanel` mounted.
- [ ] Accept/reject actions inside `DiffReviewPanel` work identically to IDE mode.
- [ ] Esc closes overlay.
- [ ] Test file passes.
- [ ] Commit: `feat(wave-42): Phase D — diff review overlay in chat-only shell`

---

## Phase E — Tests, docs, telemetry

**Goal:** Integration tests for the full mode-switch flow; CLAUDE.md updates.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.integration.test.tsx` | 120 | Mount `App` with `config.layout.immersiveChat: true`; verify ChatOnlyShell in tree, no InnerAppLayout, send a chat message flow (mocked IPC), diff review overlay opens correctly. |

### Modified files

| File | Change |
|------|--------|
| `CLAUDE.md` (project root) | Add a "Chat-Only Shell" subsection under Key Conventions. Explain the two-shell model and `IdeToolBridge` exclusion. |
| `src/renderer/CLAUDE.md` | Update the three-layer bootstrap section to note the ChatOnlyShell branch in InnerApp. |
| `src/renderer/components/Layout/CLAUDE.md` | Add ChatOnlyShell row to the Key Files table, note which existing components are NOT mounted in chat-only mode. |
| `docs/architecture.md` | Add a one-paragraph section describing chat-only mode as the second shell over the same backend. |
| `src/main/telemetry/telemetryStore.ts` | OPTIONAL — emit a `mode_switch` telemetry event when `immersiveChat` is toggled. Skip if the telemetry store has a strict schema that would require a main-process edit beyond a single line. |

### Subagent briefing

- **Read first:** all CLAUDE.md files touched, existing integration tests for reference patterns (`src/renderer/App.test.tsx` if it exists, `InnerAppLayout.test.tsx`).
- Integration test should use the same mocking pattern the existing App/Layout tests use — don't invent a new mock harness.
- Telemetry is optional; prefer correctness over breadth. If schema edit blocks, skip telemetry entry and note in commit.

### Acceptance criteria
- [ ] Integration test passes.
- [ ] CLAUDE.md files updated, mode-switch behaviour documented.
- [ ] Commit: `docs(wave-42): Phase E — tests + docs for chat-only shell`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet` (per user rule `agent-model-selection.md`).
- **Isolation:** No worktree needed — sequential phases on master.
- **Branching:** All commits land on `master`.
- **Test policy:** Subagents MUST NOT run `npm test` (full vitest suite, ~280s, exceeds subagent patience per memory `feedback_agent_test_verification.md`). Subagents may run scoped vitest: `npx vitest run <path>`. Parent agent runs `timeout 360 npx vitest run` once per wave post-commit.
- **Lint policy:** Subagents MUST NOT relax ESLint rules. Per memory `feedback_never_change_lint_rules.md` — max-lines-per-function:40, complexity:10, max-lines:300, max-depth:3, max-params:4, security:error. If a rule blocks, split the code.
- **Debug policy:** If a test fails after 1 fix attempt, add logging (`log.info('[trace:WAVE42-X]', ...)`) and hand back to parent rather than guessing a second fix.
- **Commit policy:** One commit per phase, conventional commits format. Subagents commit locally; parent reviews aggregate diff and pushes once all phases complete (per memory `feedback_wave_push_policy.md`).
- **Scope discipline:** Each phase lists exact files. If you think you need to edit a file not listed, stop and report to parent.

### Phase dispatch order

Phases are **sequential** (each reads output of prior):

1. Phase A — shell components (isolated, testable).
2. Phase B — App.tsx integration (requires Phase A output).
3. Phase C — toggle UX + config (requires Phase B mount condition).
4. Phase D — diff overlay (requires Phase A scaffold + Phase C event wiring).
5. Phase E — integration tests + docs (requires everything).

Do not parallelise — file overlaps across phases (CLAUDE.md, ChatOnlyShell files) would cause merge conflicts.

### Per-phase briefing template

Each subagent invocation passes:
- Link to this plan (`roadmap/wave-42-plan.md`).
- The specific Phase section only (excerpted).
- Reminder of test/lint/commit rules above.
- Expected output: commit SHA + one-paragraph summary of any deviation from spec.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Provider re-mount on toggle** causes chat state loss mid-conversation. | Providers live ABOVE the shell branch in `InnerApp`. Verify with a test that toggles `isImmersive` mid-test and checks thread state survives. |
| `DiffReviewPanel` was designed for full-pane centre mount and breaks in a modal overlay. | Phase D reads the panel's signature before implementing; any prop mismatch is flagged in the commit, not patched silently. |
| **Keyboard shortcut collision** on `Ctrl+Shift+I`. | Phase C grep check before commit; fallback combos named. |
| `useChatWindowMode()` reads query string once at boot — if user toggles mode live, `isChatWindow` stays false but `immersiveFlag` flips. That's fine; they compose with OR. Document so future readers don't "fix" it. | Comment in `InnerApp` branch. |
| Subagent edits `src/main/**` beyond config schema. | Phase briefings explicitly forbid; parent reviews diff before pushing. |
| **HMR state loss** on the ChatOnlyShell during dev. | ChatOnlyShell follows existing HMR safety patterns (`_reactRoot` guard is at index.tsx; ChatOnlyShell itself is a plain React tree). No special handling needed. |

---

## Acceptance criteria (wave-level)

- [ ] All five phase commits present on master.
- [ ] `timeout 360 npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (parent runs, not subagent):
  - [ ] Launch app, toggle `Settings → Immersive chat mode`, observe shell swap.
  - [ ] In chat mode: send a message, receive response, apply an inline code suggestion, open session drawer, switch thread, open diff review overlay, close overlay, exit chat mode.
  - [ ] Pop out chat via existing "Pop out" button — new window opens in chat-only mode.
- [ ] No regression in IDE mode: file tree, terminal, editor, right sidebar all work as before.

---

## Out-of-wave follow-ups (candidates for Wave 43+)

- **Cross-window IDE-tool delegation** (the deferred "Option 2" from planning discussion) — only if dogfooding surfaces the need.
- **Model-selector and permission-mode chips in the title bar** — currently live in the composer; might surface to title bar for visibility.
- **Session drawer persistence** — remember drawer-open state per window.
- **Immersive-chat telemetry** — token cost, session length, diff acceptance rate comparison between modes.
- **Mobile-primary + immersive-chat merge** — if chat-only shell looks good on mobile, consider promoting it to the mobile default.
