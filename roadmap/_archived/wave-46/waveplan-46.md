# Wave 46 — Chat-Only Workstation Parity
## Implementation Plan

**Version target:** v2.4.0 (minor — chat-only moves from polished transcript shell to integrated agent workstation)
**Feature flag:** `layout.chatWorkbench` (default `false` until Phase F dogfood)
**Dependencies:** Wave 44 (chat-only shell polish), Wave 45 (Codex app-server transport), existing session / terminal / file-viewer / diff / approval infrastructure already on `master`
**References:**
- `src/renderer/components/Layout/ChatOnlyShell/*`
- `src/renderer/components/Layout/InnerAppLayout.tsx`
- `src/renderer/components/Layout/InnerAppLayout.agent.tsx`
- `src/renderer/components/SessionSidebar/*`
- `src/renderer/components/Terminal/*`
- `src/renderer/components/FileViewer/*`
- `src/renderer/components/AgentMonitor/*`
- Claude Code desktop redesign benchmark (April 2026 generation), Piebald, Codex desktop

---

## Overview

Wave 44 fixed the immediate chat-only usability problems: left rail, controls, settings access, visual polish. It did **not** close the larger product gap. The current shell is still fundamentally:

- thread list on the left
- one conversation in the middle
- lightweight overlays around it

That shape feels basic because the rest of the product already contains the harder pieces:

- multi-session state and launch plumbing
- integrated terminal surfaces
- file viewing and editing
- diff review and approval flows
- subagent monitoring
- richer Codex orchestration transport

The problem is composition. Those systems live in the IDE shell and are not re-presented in chat-only mode as a coherent workstation.

Wave 46 changes the target. Chat-only stops trying to be "the stripped version" and becomes a **chat-first workstation shell**:

- **left rail = active sessions + chats**, not only transcript history
- **center = conversation-first workspace**, still dominant
- **bottom dock = integrated terminal / command activity**
- **right utility drawer = approvals, diffs, subagents, artifacts**
- **file/artifact surface = inline or adjacent editor/preview for the thing the agent is touching**

The implementation strategy is explicit: **reuse existing renderer and main-process systems wherever possible; only build new shell composition and missing adapters where necessary.**

---

## Scope

### In-scope

- New chat-workbench shell variant behind `layout.chatWorkbench`.
- Replace thread-only left rail with a session-aware workbench rail that can show active sessions, background sessions, and recent chats.
- Reuse `useTerminalSessions`, `SessionSidebar` data patterns, and multi-session launcher state for a chat-first session rail.
- Bottom terminal dock in chat-only, reusing the existing terminal manager/panel infrastructure.
- File/artifact surface in chat-only, reusing `FileViewer`, diff viewer, PDF viewer, markdown preview, and editor routing.
- Right-side utility drawer for approvals, diff review, subagent activity, and agent-monitor surfaces.
- Workbench-aware command palette filtering and shell-level keyboard shortcuts.
- Minimal HTML preview support if needed to complete the artifact surface expected from the benchmark.
- Integration tests and docs updates.

### Out-of-scope

- Full drag-and-drop IDE layout parity inside chat-only.
- Replacing the existing IDE shell.
- Generic browser-style tabbed editor workspace with arbitrary pane splits.
- New backend session primitives; reuse the current ones.
- Cloud sync / routines / remote dispatch UX.
- Removal of the current chat-only shell before the workbench variant soaks.

---

## Verified starting point

Wave 46 assumes these are already present and should be reused, not rebuilt:

- **Sessions / multi-session launch:** `useTerminalSessions.ts`, `MultiSession/*`, `SessionSidebar.tsx`
- **Terminal surface:** `TerminalManager.tsx`, terminal panel content from `InnerAppLayout`
- **File/artifact surface:** `FileViewer.tsx`, `ContentRouter.tsx`, PDF + markdown preview, Monaco editor/diff
- **Approvals / diffs:** `approvalManager.ts`, `ApprovalContext.tsx`, `ChatOnlyDiffOverlay.tsx`, diff-review providers
- **Subagents / monitoring:** `subagent.ts`, `AgentMonitor/*`, `SubagentPanelHost.tsx`
- **Richer Codex orchestration:** `codexAppServerRunner.ts`, `codexApprovalBridge.ts`, `codexAppServerEventMapper.ts`

Real gaps still expected:

- chat-only shell composition
- session-first left rail model
- right-side utility drawer in chat-only
- artifact/editor surface in chat-only
- generic HTML preview if product parity requires it
- a few incomplete joins, especially subagent transcript resolution

---

## Architecture

```text
ChatWorkbenchShell
 ├─ ChatOnlyTitleBar
 ├─ WorkbenchRail
 │   ├─ SessionLauncherButton
 │   ├─ ActiveSessionList
 │   ├─ BackgroundSessionList
 │   └─ RecentChatsSection
 ├─ WorkbenchMain
 │   ├─ ConversationPane
 │   │   └─ AgentChatWorkspace variant="chat-workbench"
 │   ├─ ArtifactPane (toggleable)
 │   │   └─ FileViewer / Diff / Preview host
 │   └─ UtilityDrawer (toggleable right side)
 │       ├─ ApprovalQueuePanel
 │       ├─ DiffReviewPanel
 │       ├─ SubagentPanelHost
 │       └─ AgentMonitor panels
 ├─ TerminalDock
 │   └─ TerminalManager
 ├─ CommandPalette / Settings / Shortcut overlays
 └─ existing providers:
     DiffReviewProvider
     FileViewerManagerProvider
     ApprovalContext
     IdeToolBridge (selectively enabled in workbench mode)
```

**Key design call:** this is not "IDE inside chat-only." The conversation remains primary. Secondary surfaces are docked and collapsible, with the shell deciding when to open them based on agent activity.

---

## Phase A — Workbench shell scaffold

**Goal:** Introduce the new shell composition and feature flag without changing behavior for existing chat-only users.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | ~220 | New shell root behind `layout.chatWorkbench`. Owns composition state for rail, artifact pane, utility drawer, and terminal dock. |
| `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchLayout.ts` | ~120 | Local persisted UI state: `railOpen`, `artifactOpen`, `utilityOpen`, `terminalOpen`, widths/heights, active utility tab. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchHotkeys.ts` | ~100 | Shell-local shortcuts: toggle terminal, toggle utility drawer, focus rail, cycle utility tabs. |

### Modified files

| File | Change |
|------|--------|
| `src/main/configSchemaTail.ts` | Add `layout.chatWorkbench: boolean`, default `false`. Add persisted defaults for drawer and dock state if needed. |
| `src/renderer/types/electron-foundation.d.ts` | Mirror schema additions. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Dispatch to `ChatWorkbenchShell` when the flag is on; keep current Wave 44 shell intact as fallback. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Add workbench-aware controls/toggles only when the new variant is active. |
| `src/renderer/hooks/useAppKeyboardShortcuts.ts` | Register workbench toggles only when `layout.chatWorkbench` is active. |

### Subagent briefing

- **Read first:** `ChatOnlyShell.tsx`, `InnerAppLayout.tsx`, `InnerAppLayout.agent.tsx`, `AppLayout.tsx`.
- **Do not** immediately pull in terminal/editor/monitor panels. Phase A is composition state and feature-flag plumbing only.
- State shape must stay small and serializable. No giant reducer if a few booleans and dimensions will do.
- The fallback Wave 44 shell must remain untouched for dogfood safety.

### Acceptance

- [ ] Feature flag added and typed.
- [ ] `layout.chatWorkbench=false` preserves current chat-only shell behavior.
- [ ] `layout.chatWorkbench=true` mounts the new shell scaffold with placeholder regions and no regressions in basic chat send/stream flow.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-46): Phase A — chat workbench shell scaffold`

---

## Phase B — Session-first left rail

**Goal:** Replace the chat-history mental model with a workbench rail centered on active sessions and resumable work.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx` | ~220 | Left rail shell for workbench mode. Sections for launch, active sessions, background sessions, and recent chats. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchSessionRow.tsx` | ~110 | Session row showing provider, branch/worktree label, live status, unread/attention state, and quick actions. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSessions.ts` | ~140 | Adapts `useTerminalSessions`, active agent-chat thread state, and launcher state into a chat-workbench view model. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/MultiSession/useMultiSessionLauncherModel.ts` | Expose any small helpers needed by the rail without duplicating launch logic. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Workbench path mounts `WorkbenchRail` instead of `ChatHistorySidebar`. |
| `src/renderer/components/SessionSidebar/SessionSidebar.tsx` | No functional change expected; extract shared helpers only if duplication is real. |

### Subagent briefing

- **Read first:** `SessionSidebar.tsx`, `useTerminalSessions.ts`, `MultiSession/*`, `AgentChatTabBar.tsx`, agent chat store selectors.
- The rail is **session-first**, not folder-tree-first and not thread-history-first.
- Preserve quick "new chat/new session" affordance at the top.
- Recent chats can remain a secondary section below active sessions.
- Avoid importing the full `SessionSidebar` wholesale; reuse logic, not its entire IA.

### Acceptance

- [ ] Rail shows active sessions separately from recent chats.
- [ ] Clicking an active session focuses its conversation/workspace.
- [ ] Launch affordance can start a new session without leaving chat-only.
- [ ] Live state is visible: running, waiting approval, idle, failed.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-46): Phase B — session-first workbench rail`

---

## Phase C — Terminal dock

**Goal:** Bring the integrated terminal into chat-only as a first-class docked surface.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.tsx` | ~180 | Bottom dock host that mounts terminal panel content in chat-workbench mode. Resizable and collapsible. |
| `src/renderer/components/Layout/ChatOnlyShell/useTerminalDockState.ts` | ~80 | Dock height + visibility persistence. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Terminal/TerminalManager.tsx` | Audit for shell assumptions; extract any wrapper props needed for dock mode. |
| `src/renderer/components/Layout/InnerAppLayout.tsx` | Extract terminal panel composition into a reusable host if needed, so chat-workbench can mount the same content without copying layout code. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Mount terminal dock and wire shell toggles. |

### Subagent briefing

- **Read first:** `InnerAppLayout.tsx` terminal composition, `TerminalManager.tsx`, any `TerminalPanelContent` helpers.
- Reuse the existing terminal session state. Do not build a second PTY stack.
- The dock should open automatically when the active session is terminal-heavy or when the user asks for it, but Phase C can ship manual open/close first.
- Dock behavior must work on smaller laptop heights; enforce sensible min/max height.

### Acceptance

- [ ] Terminal dock can open/close from the workbench shell.
- [ ] Existing terminal sessions render correctly in chat-only.
- [ ] Active session switching updates the docked terminal surface.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-46): Phase C — integrated terminal dock`

---

## Phase D — Artifact pane and editor/preview reuse

**Goal:** Let chat-only open the thing the agent is working on without leaving the workbench.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` | ~220 | Toggleable adjacent pane hosting file viewer, preview, diff, and artifact navigation for the active chat/session. |
| `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchArtifacts.ts` | ~120 | Resolves which artifact/file/diff to show based on recent agent activity, selected references, and explicit user actions. |
| `src/renderer/components/FileViewer/HtmlPreview.tsx` | ~120 | Minimal safe HTML preview host if generic HTML preview is still missing after adapter audit. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/FileViewer/FileViewer.tsx` | Audit for assumptions about IDE-only mounting; extract small host wrapper if needed. |
| `src/renderer/components/FileViewer/ContentRouter.tsx` | Add generic HTML preview routing if still absent. |
| `src/renderer/components/Layout/InnerAppLayout.tsx` | Extract reusable file-viewer host/provider composition if needed for chat-workbench. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Mount artifact pane and route open-file/open-diff actions into it. |

### Subagent briefing

- **Read first:** `FileViewer.tsx`, `ContentRouter.tsx`, `ViewModeBar.tsx`, `FileViewerManager` provider wiring.
- Reuse the existing file-viewer stack. The new code should mostly be selection/orchestration, not editor implementation.
- HTML preview should only be added if the audit confirms generic HTML rendering is still missing.
- Artifact pane should support at minimum: code file, diff, PDF, markdown preview, and image.

### Acceptance

- [ ] Agent-originated file/diff/artifact actions can open in a side pane inside chat-workbench.
- [ ] Existing viewer/editor modes work in the pane.
- [ ] PDF and markdown preview work; HTML preview works if added in this phase.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-46): Phase D — artifact pane and editor reuse`

---

## Phase E — Utility drawer: approvals, diffs, subagents

**Goal:** Expose the existing review and intervention surfaces in chat-only instead of burying them in overlays or the IDE sidebar.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx` | ~220 | Right-side drawer with tabs: Approvals, Review, Subagents, Activity. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchApprovalPanel.tsx` | ~120 | Queue-style approval view built from existing approval context/store. |
| `src/renderer/components/Layout/ChatOnlyShell/WorkbenchActivityPanel.tsx` | ~140 | High-level agent activity stream: commands, file writes, failures, handoffs. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/AgentMonitor/SubagentPanelHost.tsx` | Finish any small adapter needed so chat-workbench can resolve the currently selected parent turn/tool call. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyDiffOverlay.tsx` | Reuse internals or migrate diff review into the utility drawer while keeping overlay fallback for non-workbench mode. |
| `src/renderer/contexts/ApprovalContext.tsx` | Expose any small selector/helper needed by the drawer; do not rewrite approval flow. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` | Mount utility drawer and auto-open relevant tabs when approvals/diffs/subagents become active. |

### Subagent briefing

- **Read first:** `ApprovalContext.tsx`, `AgentChatApprovalBanner.tsx`, `ChatOnlyDiffOverlay.tsx`, `DiffReviewPanel`, `SubagentPanelHost.tsx`, `InnerAppLayout.agent.tsx`.
- Reuse current review/approval logic. This is a presentation wave.
- The drawer should auto-open on waiting approval and pending diff review unless the user explicitly dismisses it for the current turn.
- If `SubagentPanelHost` still lacks the resolver it needs, keep the fix tightly scoped to the adapter gap already identified.

### Acceptance

- [ ] Waiting approvals are visible from the workbench drawer and still actionable.
- [ ] Diff review can be completed inside the workbench without relying solely on the full-screen overlay.
- [ ] Subagent activity is visible from the drawer.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-46): Phase E — utility drawer for approvals, review, and subagents`

---

## Phase F — Integration tests, docs, flag soak prep

**Goal:** Lock down the new shell behavior with integration coverage and document the new composition model.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.integration.test.tsx` | ~240 | Mount full workbench shell in jsdom with mocked session/chat/file state. Verify rail, terminal dock, artifact pane, utility drawer, and shell toggles. |

### Modified files

| File | Change |
|------|--------|
| `CLAUDE.md` (root) | Update chat-only / shell architecture section to describe workbench mode. |
| `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | Rewrite for Wave 46 composition model. |
| `src/renderer/components/FileViewer/CLAUDE.md` | Add chat-workbench mounting notes if file viewer is now reused there. |
| `src/renderer/components/Terminal/CLAUDE.md` | Add docked chat-workbench usage notes if needed. |
| `docs/architecture.md` | Update shell composition and chat-only workstation notes. |
| `src/main/configSchemaTail.ts` | Parent-only follow-up: flip `layout.chatWorkbench` to `true` after soak if dogfood is clean. |

### Acceptance

- [ ] Integration coverage exists for the new shell.
- [ ] Docs describe the workbench variant and reuse boundaries accurately.
- [ ] Parent dogfood checklist ready before flipping the flag.
- [ ] Commit: `docs(wave-46): Phase F — integration tests and docs`
- [ ] Parent commit (separate): `feat(wave-46): flip layout.chatWorkbench default to true after soak`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet` (same execution policy as recent wave plans).
- **Isolation:** sequential on master.
- **Test policy:** scoped vitest only. Parent runs full suite, lint, and typecheck at wave close.
- **Lint policy:** no relaxation. Respect `max-lines-per-function: 40`, `max-lines: 300`, `complexity: 10`, `max-depth: 3`, `max-params: 4`.
- **Debug policy:** after 1 failed fix, add trace logging and hand back rather than iterating blindly.
- **Commit policy:** one commit per phase, conventional commits, local-only.
- **Scope discipline:** listed files only. Stop and report if a phase wants to spill into unrelated backend work.

### Phase dispatch order

1. **Phase A** — feature-flagged scaffold
2. **Phase B** — session-first rail
3. **Phase C** — terminal dock
4. **Phase D** — artifact pane
5. **Phase E** — utility drawer
6. **Phase F** — integration tests and docs

Phases C and D could run in parallel after B if the reusable host extraction lands cleanly, but serialize them unless the extracted shell boundaries are already obvious.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **The workbench becomes "mini IDE" sprawl and loses the chat-first character.** | Keep chat central and make every secondary surface docked/collapsible. Avoid arbitrary pane splitting in this wave. |
| **Reusing IDE providers in chat-only introduces hidden shell assumptions.** | Phase A and D explicitly audit `InnerAppLayout` composition and extract reusable hosts rather than copying JSX whole. |
| **Session model in the left rail becomes confusing because "chat thread" and "session" are not always identical.** | Make active sessions primary and recent chats secondary. Use consistent row metadata showing provider, status, and project/worktree. |
| **Terminal dock consumes too much vertical space on laptops.** | Persist dock height with strict min/max bounds and a one-keystroke collapse shortcut. |
| **Artifact pane adds too much complexity before selection heuristics are stable.** | Ship manual open/select first; automatic artifact opening can stay conservative in this wave. |
| **Subagent panel still lacks one or two adapter joins.** | Treat that as a tightly scoped Phase E gap-close, not a reason to redesign subagents. |
| **HTML preview becomes a rabbit hole.** | Only add the minimal safe host if generic HTML preview is genuinely missing; otherwise defer broader preview ambitions. |
| **Workbench command palette exposes IDE-only commands that are nonsensical in this shell.** | Filter commands by shell capability in Phase F, using the work done already identified in the earlier audit. |

---

## Acceptance criteria (wave-level)

- [ ] Six phase commits present on master.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (parent, flag on):
  - [ ] Left rail shows active sessions and recent chats, not just transcript history.
  - [ ] A new session can be launched from the workbench rail.
  - [ ] Terminal dock opens and follows the active session.
  - [ ] File/diff/PDF/preview artifacts can open inside the workbench.
  - [ ] Waiting approvals and diff-review work are visible without leaving chat-only.
  - [ ] Subagent activity is visible from the utility drawer.
  - [ ] Core chat flow still feels conversation-first, not IDE-fragmented.
- [ ] Manual smoke (parent, flag off):
  - [ ] Existing Wave 44 chat-only shell remains unchanged.

---

## Out-of-wave follow-ups

- **Adaptive auto-open behavior** for terminal/artifact/drawer surfaces based on agent activity.
- **Side-by-side multi-session compare view** for two live sessions in one workbench.
- **Background session notification model** in the rail.
- **Artifact history stack** for "recently touched by the agent."
- **Per-session branch/worktree controls** in the rail.
- **Full command/output timeline inspector** if the lighter activity drawer proves insufficient.
- **Deeper HTML/web preview sandboxing** beyond a minimal host.
