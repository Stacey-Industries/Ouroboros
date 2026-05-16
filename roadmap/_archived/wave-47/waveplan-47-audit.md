# Wave 47 Audit — Chat Workbench Follow-Through

**Audited:** 2026-04-26
**Audit scope:** Wave 46 + Wave 47 plans vs code on master, against 7 user complaints.
**Verdict:** Wave 47 passed CI by mocking the joins it was supposed to test. Multiple BLOCKER-level UX defects shipped.

---

## Section 1: Acceptance Criteria Coverage

### Wave 46

**Phase A — Workbench shell scaffold**

| AC | Status | Evidence |
|---|---|---|
| Feature flag added and typed | DONE | `configSchemaTail.ts`; `ChatOnlyShell.tsx:224` dispatches to `ChatWorkbenchShell` when flag on |
| `layout.chatWorkbench=false` preserves classic shell | DONE | `ChatOnlyShell.tsx:249` — ternary on `isWorkbench` |
| `layout.chatWorkbench=true` mounts new scaffold | DONE | `ChatWorkbenchShell.tsx` exists and is mounted |
| Scoped tests pass | DONE | `ChatWorkbenchShell.test.tsx` exists |

**Phase B — Session-first left rail**

| AC | Status | Evidence |
|---|---|---|
| Rail shows active sessions separately from recent chats | DONE | `WorkbenchRailSections.tsx:75-119` |
| Clicking a session focuses its conversation/workspace | PARTIAL | `WorkbenchRail.tsx:184-198` falls back to DOM event when no `onSelectSession` prop. Real bridge wired via `useWorkbenchSessionActivation` but `resolvePreferredThreadId` returns null for empty session list |
| Launch affordance can start a new session | PARTIAL | Button exists; `handleLaunchAgent` dispatches `OPEN_MULTI_SESSION_EVENT` (`ChatWorkbenchBody.model.ts:118`); no handler in workbench context catches it |
| Live state visible: running, waiting, idle, failed | PARTIAL | Attention chips shown but no live spinner / status indicator |
| Scoped tests pass | DONE | `WorkbenchRail.test.tsx`, `useWorkbenchSessions.test.tsx` exist |

**Phase C — Terminal dock**

| AC | Status | Evidence |
|---|---|---|
| Terminal dock opens/closes from workbench shell | DONE | `ChatWorkbenchBody.parts.tsx:201-220`, `useTerminalDockState.ts` |
| Existing terminal sessions render correctly | UNVERIFIABLE | Lazy-loaded via `React.lazy`; jsdom tests skip xterm |
| Active session switching updates docked terminal | UNVERIFIABLE | No visible wiring between `activation.activateSession` and terminal session focus |
| Scoped tests pass | DONE | `ChatWorkbenchTerminalDock.test.tsx` exists |

**Phase D — Artifact pane and editor/preview reuse**

| AC | Status | Evidence |
|---|---|---|
| Agent-originated file/diff/artifact actions can open in side pane | PARTIAL | `useWorkbenchArtifacts.ts` exists; auto-open triggered by `useWorkbenchSurfacePolicy`. `approvalCount` hardcoded `0` at `ChatWorkbenchBody.model.ts:63` |
| Existing viewer/editor modes work in pane | UNVERIFIABLE | Lazy-loaded; untested in integration |
| PDF and markdown preview work | UNVERIFIABLE | No test coverage for artifact pane content routing |
| HTML preview works | DONE | `HtmlPreview.tsx` exists; `ContentRouter.tsx:198-204` routes `isHtml` correctly |
| Scoped tests pass | DONE | `ChatWorkbenchArtifactPane.test.tsx` exists |

**Phase E — Utility drawer**

| AC | Status | Evidence |
|---|---|---|
| Waiting approvals visible and actionable | DONE | `WorkbenchApprovalPanel.tsx` mounted in drawer |
| Diff review completable inside workbench | DONE | `ReviewPanel` in `ChatWorkbenchUtilityDrawer.tsx:75-115` mounts real `DiffReviewPanel` |
| Subagent activity visible | PARTIAL | `SubagentTranscriptPanel` requires `OPEN_SUBAGENT_EVENT`; until tool-call event fires, shows empty state |
| Scoped tests pass | DONE | `ChatWorkbenchUtilityDrawer.test.tsx` |

**Phase F — Integration tests, docs, flag soak prep**

| AC | Status | Evidence |
|---|---|---|
| Integration coverage for new shell | PARTIAL | `ChatWorkbenchShell.integration.test.tsx` exists but mocks the most important joins (`WorkbenchRail`, `useWorkbenchArtifacts` — lines 119-130, 132-140) |
| Docs describe workbench variant accurately | DONE | `CLAUDE.md` updated; `docs/chat-shell.md` referenced |
| Flag default flip after soak | NOT DONE | Default still `false` |

---

### Wave 47

**Phase A — Rail IA, launcher join, background attention**

| AC | Status | Evidence |
|---|---|---|
| Rail renders separate active/background/recent-chat sections | DONE | `WorkbenchRailSections.tsx:72-119` |
| `New workspace session` and `Launch agent` are distinct affordances | DONE | `WorkbenchRail.tsx:72-82` — two separate buttons |
| Selecting a rail item activates through real bridge | PARTIAL | `handleCreateSession` creates a session; `resolvePreferredThreadId` returns null for new sessions |
| Background sessions show attention state | DONE | `useWorkbenchAttention.ts` + chips in `WorkbenchSessionRow.tsx` |
| Attention set/clear/snooze defined and session-scoped | DONE | `useWorkbenchAttention.helpers.ts` exists |
| Coverage added for grouped rail and attention transitions | PARTIAL | Unit tests exist; integration test mocks `useWorkbenchArtifacts` and `ChatWorkbenchComparePane` |

**Phase B — Adaptive surface policy and artifact history**

| AC | Status | Evidence |
|---|---|---|
| Terminal/artifact/utility auto-open driven by single policy hook | DONE | `useWorkbenchSurfacePolicy.ts` consumed by `ChatWorkbenchBody.model.ts:93` |
| Dismissed surfaces do not re-open on same event key | DONE | `useWorkbenchSurfacePolicy.ts` implements dismissal keying |
| Artifact pane can show recently touched files | DONE | `useArtifactHistoryStack.ts` + `ArtifactHistoryList.tsx` |
| Layout state persisted cleanly | DONE | `useChatWorkbenchLayout.ts:56-63` uses `localStorage` |
| `approvalCount` actually feeds the policy | NOT DONE | `ChatWorkbenchBody.model.ts:63` hardcodes `approvalCount: 0` |

**Phase C — Activity timeline inspector and subagent drill-in**

| AC | Status | Evidence |
|---|---|---|
| Activity tab shows normalized timeline | DONE | `WorkbenchTimelinePanel.tsx`, `useWorkbenchTimeline.ts` |
| Users can inspect failed commands | UNVERIFIABLE | Depends on real agent event data |
| Subagent tab can resolve and open transcript | PARTIAL | `SubagentTranscriptPanel.tsx:103-106` resolution depends on real session data |
| `WorkbenchActivityPanel.tsx` deleted (subsumed) | DONE | Deleted |

**Phase D — Side-by-side live compare**

| AC | Status | Evidence |
|---|---|---|
| Second session can open in compare mode | DONE | `ChatWorkbenchComparePane.tsx`, `useWorkbenchCompare.ts` |
| Primary vs secondary focus visually clear | UNVERIFIABLE | Requires runtime observation |
| Per-pane workspace state isolated | DONE | `useScopedWorkbenchWorkspace.ts` uses `useRef(createAgentChatStore()).current` |
| Compare-mode coverage | PARTIAL | Integration test only checks compare pane not shown when inactive — mocks the pane entirely |

**Phase E — HTML preview and sandbox hardening**

| AC | Status | Evidence |
|---|---|---|
| HTML artifacts can preview | DONE | `HtmlPreview.tsx:125-136` — `iframe srcDoc sandbox=""` |
| Preview sandboxed with explicit restrictions | DONE | `HtmlPreview.tsx:129` — `sandbox=""` (strictest) |
| Unsupported navigation blocked | DONE | `sandbox=""` excludes navigation/popups |
| `ContentRouter` routes `isHtml` before `isMarkdown` | DONE | `ContentRouter.tsx:198-207` |
| `HtmlPreview.test.tsx` and `ContentRouter.test.tsx` exist | DONE | Per result brief |

**Phase F — Integration coverage, docs, soak notes**

| AC | Status | Evidence |
|---|---|---|
| Integration tests exercise real workbench joins | NOT DONE | `ChatWorkbenchFollowThrough.integration.test.tsx` mocks `useWorkbenchArtifacts` (118-130), `ChatWorkbenchComparePane` (132-140), and `useSessions`/`useWorkbenchSessionActivation`. The "joins" tested are mocked stubs |
| Wave 46 coverage debt explicitly closed | NOT DONE | `wave46CoverageCatchup.test.tsx` called for in plan; result brief says coverage "provided by" follow-through test "instead" — it does not |
| Docs updated | DONE | Per result brief |
| `session-handoff.md` soak checklist | DONE | Per result brief |

---

## Section 2: User Complaint Resolution

### Complaint 1: "Launch agent" button does nothing on click

`WorkbenchRail.tsx:79` renders the button only when `onLaunchAgent` is truthy. `ChatWorkbenchBody.parts.tsx:137-138` wires the prop. `ChatWorkbenchBody.model.ts:117-119`:

```ts
const handleLaunchAgent = React.useCallback((): void => {
  window.dispatchEvent(new CustomEvent(OPEN_MULTI_SESSION_EVENT));
}, []);
```

The click dispatches `OPEN_MULTI_SESSION_EVENT` as a DOM `CustomEvent`. `OPEN_MULTI_SESSION_EVENT` is consumed by the multi-session launcher in the **IDE shell path**, not the chat-workbench path. There is no `window.addEventListener(OPEN_MULTI_SESSION_EVENT, ...)` in `ChatWorkbenchShell.tsx`, `ChatWorkbenchBody.tsx`, or any workbench-specific file.

**Verdict:** The button fires into a void. BLOCKER.

### Complaint 2: "New session" button — does it create a real session?

`ChatWorkbenchBody.model.ts:112-116`:

```ts
const handleCreateSession = React.useCallback(async (): Promise<void> => {
  const session = await createStoredSessionFromPicker();
  if (!session) return;
  await activation.activateSession(session.id);
}, [activation]);
```

The picker opens and a session is created. `activation.activateSession` calls `window.electronAPI.sessionCrud.activate(sessionId)`. However, `resolvePreferredThreadId` returns `null` for new sessions with no linked threads, and `selectThread(null)` silently fails to navigate the conversation pane.

**Verdict:** Creates a session record but the chat doesn't navigate to it. PARTIAL / MAJOR.

### Complaint 3: Can the user delete or manage sessions/chats in the rail?

`WorkbenchRail.tsx` — no `onDelete`, `onRename`, `onPin`, `onArchive` props. `WorkbenchRailSections.tsx` — no context menu, right-click, or destructive affordances. `WorkbenchSessionRow.tsx` — only `onSelect` and `onCompare`.

**Verdict:** Rail is entirely read-only for management. The classic `ChatHistorySidebar` has a context menu with delete/rename — not ported. MAJOR.

### Complaint 4: "Active utility: activity" label

`ChatWorkbenchBody.parts.tsx:75-80`:

```tsx
<div
  className="ml-auto text-xs text-text-semantic-tertiary"
  data-testid="chat-workbench-utility-tab"
>
  Active utility: {layout.activeUtilityTab}
</div>
```

This is a debug/state-inspection label that was never removed. It displays the raw enum value of `layout.activeUtilityTab` as visible UI text in the toggle row.

**Verdict:** Debug label visible to users. BLOCKER.

### Complaint 5: HTML preview

`HtmlPreview.tsx:124-136` — fully implemented `iframe srcDoc` with `sandbox=""`. `ContentRouter.tsx:196-207` checks `isHtml` before `isMarkdown`. `useFileViewerState.ts:231` derives `isHtml` from filename.

**Verdict:** Genuinely implemented and wired end-to-end. If not visibly working, the issue is `viewMode !== 'preview'` on open — separate concern. CODE CORRECT.

### Complaint 6: Missing chat elements

**User profile / `ChatOnlyUserMenu`:** `ChatHistorySidebar.tsx:145` mounts `ChatOnlyUserMenu` in the classic shell footer. `ChatWorkbenchShell.tsx` mounts `ChatOnlyTitleBar` + `ChatWorkbenchBody` + `ChatOnlyStatusBar`. No `ChatOnlyUserMenu` anywhere in the workbench tree. Settings/theme/shortcuts/exit/logout — all unreachable from workbench UI. `ChatOnlySettingsOverlay` is mounted via `ShellOverlays` but has no visible entry point. **BLOCKER.**

**Rules panel:** No `RulesPanel` in workbench shell. Utility drawer tabs are `activity`, `approvals`, `review`, `subagents`. No rules tab. MAJOR.

**Compact / comfortable density toggle:** Absent. Was in `ChatOnlyUserMenu` (also absent). MINOR.

### Complaint 7: White borders

Every workbench component uses `border-stroke-default`:
- `WorkbenchRail.tsx:101`, `WorkbenchRailSections.tsx:17`
- `ChatWorkbenchBody.parts.tsx:57,101`
- `ChatWorkbenchUtilityDrawer.tsx:128,144`
- `SubagentTranscriptPanel.tsx`, `WorkbenchSessionRow.tsx:157`
- 7 other files

**`border-stroke-default` is not registered in the design token system.** Searched `tokens.css`, `globals.css` `@theme` block, `themes/types.ts` — zero occurrences. The correct token is `border-border-semantic` or `border-border-semantic-subtle`. The `--stroke-inner` and `--stroke-faint` tokens at `tokens.css:121-122` are material-layer tokens for semi-transparent white strokes, not `stroke-default`.

In Tailwind v4, an unknown utility class with `border` produces a border with no color, falling back to `currentColor` — which renders as white-on-dark.

**Verdict:** All 31 occurrences across 13 files use a fabricated token. BLOCKER.

---

## Section 3: Design Quality Findings

| # | Issue | File:Line | Severity |
|---|---|---|---|
| 1 | `border-stroke-default` used 31× across 13 files; token does not exist. Renders as white borders. Correct: `border-border-semantic`. | `WorkbenchRail.tsx:101`, `WorkbenchRailSections.tsx:17`, `ChatWorkbenchUtilityDrawer.tsx:128,144`, `ChatWorkbenchBody.parts.tsx:57`, `SubagentTranscriptPanel.tsx`, `WorkbenchSessionRow.tsx:157`, +7 files | BLOCKER |
| 2 | Debug label "Active utility: {layout.activeUtilityTab}" rendered as visible UI text. | `ChatWorkbenchBody.parts.tsx:75-80` | BLOCKER |
| 3 | `ChatOnlyUserMenu` absent from workbench shell. No settings, theme, shortcuts, exit, or logout reachable from UI. | `ChatWorkbenchShell.tsx:49-63` (absence) | BLOCKER |
| 4 | `handleLaunchAgent` dispatches event with no listener in workbench context. | `ChatWorkbenchBody.model.ts:117-119` | BLOCKER |
| 5 | `approvalCount` hardcoded to `0`, permanently disabling approval-triggered drawer auto-open. | `ChatWorkbenchBody.model.ts:63` | MAJOR |
| 6 | Rail has no delete/rename/pin/archive context menu. Classic shell has one. | `WorkbenchRail.tsx`, `WorkbenchRailSections.tsx` (absence) | MAJOR |
| 7 | No rules panel in workbench utility drawer. | `ChatWorkbenchUtilityDrawer.tsx:139` (DRAWER_TABS) | MAJOR |
| 8 | `WorkbenchToggleRow` is a developer scaffold (Rail/Artifact/Utility/Terminal toggle buttons + debug label). Never replaced with production chrome. | `ChatWorkbenchBody.parts.tsx:47-81` | MAJOR |
| 9 | `handleCreateSession`: new session has no thread; `selectThread(null)` silently fails to navigate. | `ChatWorkbenchBody.model.ts:112-116`, `useWorkbenchSessionActivation.ts:65,77` | MAJOR |
| 10 | Density toggle absent. | (absence) | MINOR |
| 11 | Phase F integration test mocks `useWorkbenchArtifacts` and `ChatWorkbenchComparePane`, then tests mocked stubs. Spec-as-implementation tests. | `ChatWorkbenchFollowThrough.integration.test.tsx:118-140, 219-225` | MAJOR |
| 12 | Drawer close affordance hidden inside debug toggle row. | `ChatWorkbenchUtilityDrawer.tsx:126-137`, `ChatWorkbenchBody.parts.tsx:64-67` | MINOR |
| 13 | `WorkbenchRailSurface` doesn't pass `sessions`/`threads`/`approvalRequests` props; rail consumes from context internally. Fragile. | `ChatWorkbenchBody.parts.tsx:133-145` | NIT |

---

## Section 4: Honest Assessment

Wave 47 did not finish what the spec asked for. The implementation addressed the architecturally cleanest parts (HTML preview, timeline decomposition, artifact history stack, surface policy hook) while leaving the most user-visible defects intact. The wave passed CI by writing integration tests that mock the components under test — the follow-through test verifies that mocked stubs appear in the DOM and that a mocked compare pane does not show when compare is inactive. None of the six integration tests exercise a real join. The "Coverage catch-up" work explicitly named in the Wave 47 plan (`wave46CoverageCatchup.test.tsx`) was quietly dropped with the explanation that the follow-through test "covers the same join paths" — it does not.

The three most damaging defects shipped with the wave:
1. `border-stroke-default` is a fabricated token that does not exist in the design system, meaning every border in the workbench shell is visually broken.
2. The "Active utility: activity" debug label is rendered as permanent visible UI.
3. `ChatOnlyUserMenu` and all settings/theme/exit affordances were never ported to the workbench shell.

These are all immediately visible on first use and indicate the shell was never manually tested against a real user experience checklist. The Wave 47 result brief's claim of "all tests passing" is technically accurate but obscures the fact that those tests prove implementation-shape, not user experience correctness. The spec's own acceptance criteria — "The shell still feels chat-first rather than like a cramped mini IDE" — is untestable via vitest and was not verified.
