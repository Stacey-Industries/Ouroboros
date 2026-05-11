---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
supersedes: 2026-05-07-chat-streaming-freezes-on-project-switch.md
---

# Chat streaming render-freeze — Wave 84 Phase D hypothesis disproven; corrected repro recipe identified

## Background

Wave 84 Phase D targeted bug 3 ("chat streaming freezes when window loses focus"). The original follow-up (`2026-05-07-chat-streaming-freezes-on-project-switch.md`) hypothesized rAF (requestAnimationFrame) throttle on background/unfocused windows. Phase D's instrumentation (commit `ff90c523`) added `[trace:stream] emit / received / flush` logs across main and renderer to confirm or kill the hypothesis.

Phase D is deferred from Wave 84. The actual bug exists, but the original hypothesis was wrong AND the original repro recipe was wrong. This follow-up captures what we learned so a future wave can address it correctly.

## What Phase D's instrumentation revealed

Cole's repro on 2026-05-11 (two windows side-by-side, both visible, `/explain` skill in Window A):

- **`documentHidden: false` for every chunk received.** The Page Visibility API only flips to `true` when the page is minimized/obscured/tab-hidden, not when the window loses focus. With both windows visible side-by-side, neither went hidden.
- **`emit` → `received` latency: 1-344ms.** IPC is fine.
- **`received` → `flush` latency: <50ms most of the time.** rAF batching is fine.
- **Only 5 emit events across a 145-second turn.** The chunk sequence was:
  - chunkId 1, `thinking_delta`, t=53s
  - chunkId 2, `tool_activity`, t=53s
  - chunkId 3, `tool_activity`, t=80s
  - chunkId 4, `thinking_delta`, t=80s
  - chunkId 5, `text_delta`, t=181s (101 seconds after chunk 4)
  - `thread_snapshot` + `complete`, t=182s

The visual symptom Cole reported (tool call → silence → big burst of text at end) was caused by the main process / bridge / subprocess **not emitting chunks for 101 seconds**, not by the renderer failing to render them. The renderer rendered everything it received, promptly.

## The corrected repro recipe (from Cole's note)

The bug Cole has actually been seeing:

> "I have never tried this render freeze problem with two windows. It is typically multiple chats within the same window running when the issue happens. I have been using chat only view (I had to use IDE view mode to open two different windows) for most of my chat sessions, however the freezing happens in either view."

So the real repro is **single window, multiple chat tabs, switching between them while one is streaming** — NOT cross-window project switching as the title of the original report suggested.

Critical: `document.hidden` is the WRONG signal for in-app tab switching. When you switch tabs within a single Electron window, the document stays visible. The rAF throttle hypothesis cannot apply.

## Possible mechanisms (not yet investigated)

Two candidate causes for the "render keeps the background tab static" symptom:

1. **Inactive chat tab is `display:none` / unmounted.** If the tab system unmounts inactive panels, their streaming hooks tear down and the React state for the background chat doesn't update. When the user switches back, the hook re-mounts and reads the latest persisted state — which may be the post-turn snapshot, not the in-flight stream. Effect: looks like a freeze + catch-up.
2. **The streaming hook is alive on the background tab but its state updates don't trigger re-render until tab activation.** React 18 concurrent mode + state batching could defer renders for hidden subtrees in some configurations. Less likely but possible.
3. **The IPC chunk listener fires only on the active tab's chat instance.** If the chunk-to-thread routing layer dispatches to whichever chat instance is mounted/active, background tabs miss their chunks.

## The separate finding (orthogonal to Phase D)

Cole's `/explain` skill repro showed only 5 emit events across 145s. For an explanation that long (~7000 chars in Cole's quoted response), the underlying Claude API should emit many text_delta chunks during generation. The fact that we see ONE text_delta chunk at the very end suggests either:

- The Claude Code subprocess buffers text and emits a single chunk at end-of-turn for this prompt shape.
- The bridge between subprocess and renderer aggregates text_delta chunks.
- The `/explain` skill's extended-thinking mode produces thinking_delta during reasoning and a single text_delta after — by design.

This is its own investigation and separate from Phase D's renderer-render scope. Worth a follow-up if/when chat streaming becomes a feature target.

## Recommended next steps

1. **Repro with the corrected recipe.** Single window, two chat tabs, one mid-stream. Use the existing Phase D instrumentation (commits `ff90c523`, retained per Wave 84 Phase Z decision pending). Watch whether the background tab's `[trace:stream] received` log fires while it's in the background.
2. **Instrument the chat-panel mount/visibility lifecycle.** Add a `[trace:panel] mount / unmount / activate / deactivate` log on whichever component owns the per-thread chat lifecycle. This will distinguish between "tab unmounts" vs "tab stays mounted but hidden."
3. **Pick the fix based on evidence:** if mount/unmount → keep panels mounted but hidden (CSS `display:none`); if state-update routing → fix the per-thread state isolation; if React render gating → use `<Suspense>` or `useDeferredValue` to allow background renders.

## Severity

Medium-high. User-facing symptom is "chat appears frozen while agent works." Currently a leading PARTIAL verdict on AHEAD axis #47. Closing this is one of the larger gap-analysis prediction movers — see `04-ouroboros-gap-analysis.md`.

## Why this wasn't caught in Wave 84

- Original bug report's title misled the waveplan's repro recipe (cross-window vs in-window).
- `documentHidden` was a plausible signal for the suspected hypothesis but doesn't fire for the actual scenario.
- Cole had not previously tested the bug in a two-window arrangement; doing so for the first time during Phase D produced no freeze (because `document.hidden` never flipped).

The instrumentation cost was not wasted — it disproved the hypothesis cleanly and pointed at the actual mechanism. Next wave starts further along than this one did.
