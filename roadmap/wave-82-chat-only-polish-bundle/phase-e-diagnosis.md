# Wave 82 — Phase E Diagnostic Sprint

Read-only deliverable. Produced 2026-05-03.

**Method constraint:** This wave was executed without a live IDE session, so all diagnoses below are from static code analysis. Confidence levels are explicit per finding. Phase F implements with the most-likely fix path; runtime verification falls to Cole's manual smoke walk in Phase J.

---

## E1 — Edit-mode bug cluster (#9)

**Symptoms (user report):** Edit button disappears after pressing Exit Edit. Other toolbar buttons (Minimap, Blame, Outline, History) stop responding. Edit mode has no scroll. Minimap renders alongside the default scrollbar (dual-scrollbar issue).

### Finding E1a — Toolbar reset effect (HIGH CONFIDENCE root cause)

`useFileViewerState.effects.ts:114-128` defines `useResetViewerUi`:

```ts
export function useResetViewerUi(
  filePath: string | null,
  resetters: ViewerUiResetters,
  isHtml: boolean,
  isMarkdown: boolean,
): void {
  'use no memo';
  useEffect(() => {
    resetters.setShowSearch(false);
    resetters.setShowGoToLine(false);
    resetters.setViewMode(defaultViewModeForFile(isHtml, isMarkdown));
    resetters.setShowHistory(false);
    resetters.setEditMode(false);
  }, [filePath, resetters, isHtml, isMarkdown]);
}
```

The effect resets all toolbar UI state whenever `filePath`, `resetters`, `isHtml`, or `isMarkdown` changes. `resetters` is memoized in `useViewerUiResetters` (`useFileViewerState.ts:148-160`) with stable `setX` setter deps — so identity should be stable.

**However**, the `'use no memo'` directive on `useFileViewerState` itself (`useFileViewerState.ts:110`) disables React Compiler memoization for the entire hook. Combined with the per-helper `'use no memo'` directives, identity stability is fragile under React 19. If `resetters` identity churns (even rarely), the effect fires and resets `showHistory`, `setEditMode(false)`, and `viewMode` — explaining why History/Outline/Blame/Minimap toggles "stop responding" (they get reset back to default the moment any unrelated state cycle happens).

**Note on the "Edit button disappears" sub-symptom:** Separate cause. `EditControls` in `FileViewerToolbar.tsx:217-218` returns `null` if `!props.onSave`. `onSave` is wired in `EditorContent.tsx:188-195` (`useSaveAction`) and is a `useCallback` that always returns a callback (early-returns inside if `activeFile` is null). So `onSave` shouldn't ever be undefined for a live file. The "disappears" symptom is more likely the same toolbar reset cascade making the EditControls re-mount mid-cycle and momentarily render before its props are stable. **Confidence: MEDIUM.** Requires runtime trace to confirm.

**Fix path (Phase F1):** Stabilize the reset condition. The effect should ONLY fire when `filePath` actually changes (not on every render where `resetters` or `isHtml` happens to re-identify). Strip `resetters` and the booleans from the dep array — they're internal closures, not external triggers — and gate on `filePath` only:

```ts
useEffect(() => {
  resetters.setShowSearch(false);
  resetters.setShowGoToLine(false);
  resetters.setViewMode(defaultViewModeForFile(isHtml, isMarkdown));
  resetters.setShowHistory(false);
  resetters.setEditMode(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filePath is the
  // only intended trigger; resetters/isHtml/isMarkdown read at fire-time.
}, [filePath]);
```

Alternative if disabling exhaustive-deps is rejected: use `useRef` to capture latest `resetters` / `isHtml` / `isMarkdown` and read from the ref inside the effect.

### Finding E1b — Edit-mode scroll regression (LOW CONFIDENCE)

Edit mode swaps to `MonacoEditor` (per `FileViewer/CLAUDE.md` — `USE_MONACO=true`). Monaco internally manages scroll. The user-reported "no scroll in edit mode" is most likely either:

- **Container CSS issue:** parent container `overflow: hidden` + missing `min-h-0` collapses Monaco's effective height, so internal scrollbars never engage.
- **`automaticLayout: false`:** if Monaco's `automaticLayout` option is disabled, the editor doesn't respond to container resize.

Without runtime DOM inspection I cannot confirm which is the cause. **Phase F1 fix is opportunistic** — if the toolbar-reset fix incidentally also restores scroll (because `viewMode` was being reset to `'code'` mid-edit-mode), that's the cleanest path. If not, Phase F1 should add a baseline `min-h-0` on the edit-mode container.

### Finding E1c — Minimap dual-scrollbar (HIGH CONFIDENCE — config-only fix)

When `showMinimap=true`, Monaco renders both the minimap AND its default vertical scrollbar. Standard Monaco config to fix:

```ts
minimap: { enabled: showMinimap },
scrollbar: {
  vertical: showMinimap ? 'hidden' : 'auto',
  // OR keep auto with verticalScrollbarSize: 0 when minimap is on
}
```

Phase F1 includes this config update in `MonacoEditor.tsx` or `MonacoEditor.hooks.ts` where the editor options are constructed.

---

## E2 — Project rules don't load (#6)

**Symptoms (user report):** Context-preview popover shows User=16, Project=0 even when `.claude/rules/` has 9 project rules in Agent IDE. Inconsistent behavior — sometimes loads, sometimes doesn't.

### Finding E2 — InstructionsLoaded session-id matching (MEDIUM CONFIDENCE)

The pipeline:

1. `instructions_loaded.mjs` (`assets/hooks/instructions_loaded.mjs`) reads stdin from Claude Code and emits one event per loaded rule via `sendEvent({type:'instructions_loaded', sessionId, ...})`.
2. `useAgentEvents.ts:219` routes `instructions_loaded` payloads to `dispatchRuleLoaded` (`useAgentEvents.ruleSkillDispatchers.ts:47-73`).
3. `dispatchRuleLoaded` reads `payload.input.file_path` and `payload.input.memory_type`, dispatches `RULE_LOADED` action with `sessionId: payload.sessionId`.
4. `reduceRuleLoaded` (`useAgentEvents.ruleSkillReducers.ts:34-39`) calls `updateSession(state, action.sessionId, ...)`. **If the session doesn't exist in state, `updateSession` is a no-op** (verified by reading `useAgentEvents.session-utils`).
5. `ComposerContextPreview.tsx:53-67` reads `loadedRules` from the session matched by `claudeSessionId`. If session not registered, it falls back to `pickMostRecent(agents)`.

**Hypothesis:** Project rules load _during session bootstrap_, before the IDE side has registered the session via `useChatSessionBridge` (`ComposerContextPreview.tsx:90-99`). The hook fires `RULE_LOADED` actions; `updateSession` finds no matching session entry; the action is silently dropped. Subsequent rule loads from the same session (User-tier rules loaded later in bootstrap) succeed because by then the session exists.

This explains the "sometimes loads, sometimes doesn't" symptom: it's a timing race between session-spawn and rule-load events. The 9 project rules from `.claude/rules/` likely load fastest (CWD-relative, no globbing needed), beating the session-register dispatch.

**Fix path (Phase F2):** Two options:

- **Option A (defensive):** Modify `reduceRuleLoaded` to auto-create a placeholder session entry if one doesn't exist (queueing the rule against a session-id that hasn't registered yet). Risk: if `payload.sessionId` is malformed or stale, we accumulate orphan sessions.
- **Option B (correct):** Pre-register the session in `useAgentEvents` for any `instructions_loaded` payload whose `sessionId` isn't yet known — minimal version of session-bootstrap that just creates the entry so `loadedRules` can attach. The session metadata fills in when `session_start` event arrives later.

Phase F2 implements **Option B** — it's the direction the architecture already supports via `useChatSessionBridge.registerChatSession`.

**Lower-confidence alternative cause:** The `instructions_loaded.mjs` hook might emit `sessionId='unknown'` for some loads (line 23: `parsed.session_id || process.env.CLAUDE_SESSION_ID || 'unknown'`). If Claude Code doesn't emit `session_id` in its `instructions_loaded` JSON for project-tier rules but does for user-tier rules, the project events arrive with `sessionId='unknown'` and never match any registered session. This would be a Claude Code stream-json issue, not an IDE bug — the IDE-side fix would be: also store rules under `'unknown'` and surface them in the popover when no session-specific match exists. Phase F2 should add an `'unknown'` fallback bucket regardless of which root cause is correct.

---

## E3 — Composer typing lag during rule-load burst (#15)

**Symptoms (user report):** "Rules start loading randomly, and the text started to lag in the composer as I typed. That is quite common."

### Finding E3 — Per-rule reducer dispatch causes context-value churn (HIGH CONFIDENCE)

`dispatchRuleLoaded` (`useAgentEvents.ruleSkillDispatchers.ts:47-73`) fires one `dispatch({type:'RULE_LOADED', ...})` per `instructions_loaded` event. Claude Code emits these synchronously during session bootstrap — typically ≥10 rules in one stream-json batch (project + user rules combined).

Each dispatch:

1. Triggers `useReducer` in `useAgentEvents.ts` to recompute state
2. `AgentEventsContext.Provider` value changes (because `agents` array reference changes)
3. **Every consumer of `useAgentEventsContext()` re-renders**, including `ChatControlsBar`, `ComposerContextPreview`, `useAgentChatStreaming`, and through them, `AgentChatWorkspace`
4. `useSyncStateIntoStore` (`AgentChatWorkspace.storeSync.ts:48-82`) writes to the Zustand store on every workspace re-render
5. Lexical composer subscribes to several store slices via `useAgentChatStoreContext` selectors — each store update triggers Lexical reconciliation
6. Lexical reconcile mid-keystroke costs >16ms when the editor has even a few hundred chars

10 rules × 5+ render cycles per rule = perceptible keystroke lag.

**Confirmed from architect's Phase A audit Section 2 Root E:** Same diagnosis.

**Fix path (Phase F3):** Coalesce rule-load events. Two implementation approaches:

- **Option A — Reducer-level batching:** add a `RULES_BATCH_LOADED` action that takes an array of rules; have `dispatchRuleLoaded` enqueue and flush via `queueMicrotask` so all rules from a single stream-json batch land in one dispatch. ~30 lines.
- **Option B — Hook-level throttle:** wrap the reducer dispatch in a 16ms-throttled batcher. Catches more cases (any rapid-fire dispatch type benefits) but adds latency to all events, not just rules.

Phase F3 implements **Option A** — narrowly scoped to the rule-load path; doesn't slow down other event types; matches Claude Code's batch-emit pattern where all rules arrive in one stream-json chunk.

---

## E4 — File > New Session "froze IDE" (#13 secondary)

**Symptoms (user report):** Clicking File > New Session causes IDE freeze.

### Finding E4 — No matching listener + dropdown portal lifecycle (HIGH CONFIDENCE on root, MEDIUM on freeze mechanism)

Per Phase A audit Section 1, `WORKBENCH_NEW_SESSION_EVENT` had no `addEventListener` consumer in `src/renderer`. Phase D wired this event to dispatch `OPEN_MULTI_SESSION_EVENT` (which IS wired in `ChatWorkbenchShell.tsx:48`). **The "no-op" symptom is fixed by Phase D.**

The "freeze" sub-symptom is more interesting. Possible causes:

- **Dropdown portal not dismissing after click:** if the menu portal's onClose handler relies on the action callback completing without throwing, an unhandled error in the action could leave the portal mounted with focus trapped.
- **Action throws synchronously:** the menu's `action` callback (`TitleBar.workbench.menus.ts:71`) calls `dispatchEv(WORKBENCH_NEW_SESSION_EVENT)` which is just a `window.dispatchEvent` call — shouldn't throw. But if any of the (formerly-unwired) listeners that ARE now wired post-Phase-D throws during initial setup (e.g., MultiSessionLauncher's mount error), the unhandled error propagates to the dropdown click handler.

**Phase F4 mitigation:** Wrap `dispatchEv` in a try/catch in `TitleBar.workbench.menus.ts` to ensure menu actions never propagate exceptions back to the dropdown portal. Combined with Phase D's wiring (which removes the no-op symptom), this should resolve both the "did nothing" AND "froze IDE" symptoms.

If freeze persists after F4, the next investigation step is the dropdown portal component itself (likely `MenuItem.tsx` or similar) — does its onClose handler fire reliably? — but that's deferred to a follow-up wave if the F4 mitigation isn't sufficient.

---

## Summary — Phase F implementation order

| Fix                        | File(s)                                     | Approach                                                                                                                                         | Confidence                              |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| F1a — toolbar reset        | `useFileViewerState.effects.ts:114-128`     | Strip `resetters`/`isHtml`/`isMarkdown` from dep array; gate on `filePath` only. Read latest values via ref or eslint-disable comment.           | HIGH                                    |
| F1b — edit-mode scroll     | `MonacoEditor.tsx` / `EditorContent.tsx`    | Add `min-h-0` to edit-mode container; verify `automaticLayout: true`. Opportunistic fix; may resolve via F1a alone.                              | LOW                                     |
| F1c — minimap dual-scroll  | `MonacoEditor.tsx` (options builder)        | Set `scrollbar.vertical: 'hidden'` when `showMinimap=true`.                                                                                      | HIGH                                    |
| F2 — project rules load    | `useAgentEvents.session-utils.ts` + reducer | Auto-create placeholder session entry on `RULE_LOADED` if session doesn't exist; also bucket `'unknown'` sessionId rules and surface in popover. | MEDIUM                                  |
| F3 — composer lag          | `useAgentEvents.ruleSkillDispatchers.ts`    | Add `queueMicrotask`-based batcher; batch all `RULE_LOADED` from same tick into one `RULES_BATCH_LOADED` dispatch. New reducer case.             | HIGH                                    |
| F4 — menu portal hardening | `TitleBar.workbench.menus.ts`               | Wrap `dispatchEv` in try/catch so menu actions never throw to the portal click handler.                                                          | MEDIUM (mitigation, not root-cause fix) |

All findings above are code-reading-derived. Cole's manual smoke walk in Phase J validates each fix against the runtime symptom.
