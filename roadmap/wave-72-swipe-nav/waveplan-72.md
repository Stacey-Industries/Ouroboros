# Wave 72 — Mount swipe navigation on AgentChatWorkspace

## Status

DRAFT · target v{TBD} · drafted 2026-05-02.

## Context — why this wave exists

Wave 32 Phase I built `useSwipeNavigation` — a pointer-event hook that detects horizontal swipes and fires `onSwipeLeft` / `onSwipeRight`. The intent was to let users swipe between chat threads on touch and trackpad surfaces. The hook was left unmounted because `AgentChatWorkspace` had no stable DOM ref in its slot API, and the tab bar (the other candidate mount point) is too narrow for reliable axis disambiguation.

The TODO comment at `AgentChatTabBar.tsx:101-103` documents the deferral verbatim:
> *Deferred: AgentChatWorkspace has no stable root ref in its slot API.*

Code verification confirms:
- `src/renderer/hooks/useSwipeNavigation.ts` — hook is complete and handles `data-no-swipe` opt-out, scroll container detection, threshold + velocity guards.
- `AgentChatWorkspace.tsx:282-283` — the root `<div>` has no `ref` attached.
- `AgentChatTabBar.tsx:106-108` — `<div data-no-swipe="">` is already on the scroll area; opt-out scaffolding is in place.
- `agentChatSelectors.ts:119` — `onSelectThread` is a stable zustand action available from `useAgentChatActions`.

This is a one-phase wiring wave: add an internal ref to the workspace root div, mount the hook, and wire `onSwipeLeft`/`onSwipeRight` to cycle threads. No new hook code. No architectural change. The tab bar TODO comment is removed.

## Goal

After this wave, swiping left or right on the `AgentChatWorkspace` panel cycles through the thread list (wrap-around), calling `selectThread` with the adjacent thread's ID. The hook is mounted on the workspace's root `<div>` via an internal `useRef`; no slot-API changes are needed. The tab bar's `data-no-swipe` opt-out continues to block swipes originating inside the tab strip. A vitest confirms a synthetic swipe event drives `onSelectThread` with the correct thread ID.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-72-swipe-nav/wave-72-decisions.md`.

1. **Internal ref, not forwardRef.** The workspace mounts the hook internally with its own `useRef` rather than exposing a `forwardRef` to callers — the hook is a workspace-internal concern and no caller needs the ref.
2. **Wrap-around cycling.** Swiping past the last thread wraps to the first, and swiping before the first wraps to the last. This is the universal mobile gesture contract; clamping would feel broken on touch surfaces.
3. **Hook wired from workspace internals.** `useSwipeNavigation` is called inside a new `useWorkspaceSwipe` helper within `AgentChatWorkspace.tsx`, consuming `model.threads` and `model.selectThread` directly — no new props or store fields needed.

## Scope

**In scope:**

- `AgentChatWorkspace.tsx` — add `workspaceRef = useRef<HTMLDivElement>(null)`, attach to root div, extract `useWorkspaceSwipe(workspaceRef, model)` helper that mounts `useSwipeNavigation`.
- `AgentChatTabBar.tsx:101-103` — remove the TODO comment (it's resolved by this wave).
- `useSwipeNavigation.test.ts` (new or add to existing test file) — smoke test: synthetic pointerdown + pointerup on a mounted element triggers `onSwipeLeft`/`onSwipeRight` with the expected thread ID.

**Out of scope:**

- `forwardRef` on `AgentChatWorkspace` — no caller needs external access to the workspace root; deferred until a concrete use case arises.
- Keyboard shortcut for thread cycling — separate feature; this wave is gesture-only.
- Vertical swipe axis — not needed for thread cycling; deferred to a future gesture layer if needed.
- Mobile / Capacitor specific touch tuning (threshold/velocity) — defaults are sufficient for desktop; mobile tuning is a "mobile readiness wave" item.
- Tab bar narrowing or redesign — not touched here.

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| A | Mount swipe hook on workspace root + vitest | sonnet-implementer | Add `workspaceRef` to workspace root div. Extract `useWorkspaceSwipe(workspaceRef, model)` helper that calls `useSwipeNavigation` with wrap-around thread cycling. Remove TODO comment from `AgentChatTabBar.tsx`. Write smoke vitest: render workspace with two threads, fire synthetic pointerdown+pointerup, assert `selectThread` called with correct adjacent thread ID. |

### Phase ordering

Single phase — A is the only phase. No dependencies to sequence.

```
A (implement + test)
```

## Risks

| Risk | Mitigation |
|---|---|
| `useWorkspaceSwipe` exceeds max-lines-per-function (40) | Extract the cycle-direction logic into a pure `cycleThread` helper — keeps both functions short |
| Swipe fires on text-selection drag in the message list | `useSwipeNavigation` already guards via velocity threshold (0.3 px/ms) and distance threshold (50px); text drags are short and slow — not a practical concern |
| Tab bar `data-no-swipe` opt-out becomes ineffective if the tab bar DOM is restructured | The opt-out is already on the `<div>` that wraps the scrolling tabs area; the hook walks up the DOM via `.closest('[data-no-swipe]')` — restructuring the tab bar's internals won't break it unless the `data-no-swipe` attribute itself is removed |
| `model.threads` length changes between pointerdown and pointerup (e.g., thread deleted mid-swipe) | The swipe callback reads `model.threads` at call time via the stable `optionsRef` pattern already in the hook — it will always cycle against the current snapshot |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | `useSwipeNavigation.test.ts` — smoke test: two threads, synthetic swipe event → `selectThread` called with correct ID | n/a | Integration not applicable; this is renderer-only with no IPC surface |

## Acceptance criteria

- [ ] `AgentChatWorkspace.tsx` has a `workspaceRef = useRef<HTMLDivElement>(null)` attached to the root `<div>`.
- [ ] `useWorkspaceSwipe` helper is called inside `AgentChatWorkspace`, receives the ref and model, and mounts `useSwipeNavigation`.
- [ ] Swiping left on the workspace with two threads calls `selectThread` with the next thread's ID (wrap-around).
- [ ] Swiping right on the workspace with two threads calls `selectThread` with the previous thread's ID (wrap-around).
- [ ] Swiping when only one thread exists does nothing (wrap-around to same thread is a no-op or guarded).
- [ ] The TODO comment at `AgentChatTabBar.tsx:101-103` is removed.
- [ ] Vitest for the swipe→select path passes.
- [ ] `tsc --noEmit` clean.
- [ ] ESLint clean on touched files.

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| A | User swipes left in the chat panel with multiple threads open | `useWorkspaceSwipe` mounts hook on workspace root div → `useSwipeNavigation` fires `onSwipeLeft` on threshold+velocity met → `cycleThread` computes next index → `model.selectThread(nextId)` → zustand store updates `activeThreadId` → `AgentChatConversation` re-renders with the newly selected thread's messages | The conversation panel switches to the adjacent thread — different messages appear without the user clicking the tab bar |

### Data-shape probes

```ts
// After Phase A: verify vitest passes for swipe event → selectThread
// npx vitest run src/renderer/hooks/useSwipeNavigation.test.ts
// Expected: all tests pass, including the new thread-cycling smoke test
```

## Files the next agent should read first

1. `src/renderer/hooks/useSwipeNavigation.ts` — the hook being mounted; understand its API (`target: RefObject<HTMLElement>`, `options: SwipeNavigationOptions`) and opt-out mechanism.
2. `src/renderer/components/AgentChat/AgentChatWorkspace.tsx` — the mount target; understand the root div structure, existing hooks, and `useWorkspaceSetup` return shape to find where to insert `useWorkspaceSwipe`.
3. `src/renderer/components/AgentChat/AgentChatTabBar.tsx:101-103` — the TODO comment to remove.
4. `src/renderer/components/AgentChat/useAgentChatWorkspace.ts` — `AgentChatWorkspaceModel` interface to confirm `threads: AgentChatThreadRecord[]` and `selectThread: (id: string | null) => void` are available.
5. `roadmap/wave-72-swipe-nav/wave-72-decisions.md` — ADR committing to internal ref + wrap-around cycling.
6. `roadmap/wave-71-disabled-files-mentions-send-path/wave-71-auto-brief.md` — prior wave brief for orientation.

## Note to the implementer

This wave closes a two-year-old deferral with minimal code: one ref, one helper function, one removed comment, one vitest. The hook is already done; this wave only wires it. Resist the temptation to refactor `useWorkspaceSetup` or touch anything outside `AgentChatWorkspace.tsx` and `AgentChatTabBar.tsx` unless the test file requires a new location.

The thread-cycling logic (`cycleThread`) is a pure function — given `threads[]` and `activeThreadId`, return the adjacent thread's ID with wrap-around. Extract it as a named helper so the function body stays under the 40-line ESLint ceiling. The `useWorkspaceSwipe` hook itself should be 10–15 lines.

Before declaring Phase A complete, restate in your own words what the observation point is — specifically, "the conversation panel switches to the adjacent thread when the user swipes" — and describe what you actually observed at that surface. If you cannot observe it directly (no live IDE, no rendered panel, no triggered swipe session), say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary are necessary but not sufficient.

## Orchestrator dispatch checklist

1. Verify `roadmap/wave-72-swipe-nav/wave-72-decisions.md` exists (ADR stub must be present before Phase A starts).
2. Dispatch Phase A to `sonnet-implementer`: implement `useWorkspaceSwipe` in `AgentChatWorkspace.tsx`, attach ref to root div, remove the tab bar TODO, write vitest.
3. After Phase A: run `npx tsc --noEmit` (clean required). Run `npx vitest run src/renderer/hooks/useSwipeNavigation.test.ts` (or wherever the test lands). Run ESLint on touched files.
4. Review Phase A diff: confirm no files outside `AgentChatWorkspace.tsx`, `AgentChatTabBar.tsx`, and the test file were touched.
5. Wave wrap: full lint, typecheck, targeted tests. Run `/review 72` — verdict must be PASS or FLAG with written justification before push.
6. Note smoke status in result brief: "user smoke deferred per lead directive" (this wave is not in `src/renderer/components/Layout/**` so the manual smoke gate rule doesn't strictly apply).
