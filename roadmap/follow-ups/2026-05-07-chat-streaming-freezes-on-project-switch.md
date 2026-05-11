---
status: OPEN
created: 2026-05-07
updated: 2026-05-07
---

# Chat streaming UI freezes when switching between project windows

## Symptom

With agents actively working in two or more separate project windows in the IDE, switching focus between them causes the chat UI to stop streaming live in the windows that aren't currently focused (or possibly: in any window once focus moves around). The agent keeps working in the background — file edits land, the run eventually completes — but during the streaming window the chat panel's content stops updating.

When the run finishes, the persistent render catches up and shows the full conversation correctly. So the underlying message/state is intact; only the streaming render path appears to stall.

## Repro (rough — to be tightened during B0)

1. Open the IDE with two or more projects (separate windows or separate per-window project roots).
2. Send a message to project A's agent that triggers a long-running task (multi-tool, multi-minute).
3. Send a message to project B's agent similarly.
4. Click between the two windows / project chats while both agents are mid-stream.
5. Observe: chat content in the non-focused window(s) stops updating during the focus-elsewhere period. The streaming indicator may also stall.
6. When each agent finishes, the persisted conversation renders fully — the live streaming UI never showed those blocks but the saved record has them.

## Suspect surface

Streaming pipeline candidates (per `src/renderer/components/AgentChat/CLAUDE.md`):

- `useAgentChatStreaming.ts` — accumulates `agentChat:streamChunk` events into block arrays. Per the CLAUDE.md, uses `useRafBatchedChunks` with `requestAnimationFrame` batching. **Suspect:** background tabs/windows throttle rAF (browser/Electron behavior — `requestAnimationFrame` runs at ~1 Hz or pauses entirely when the document is hidden). If the renderer is not the foreground window, rAF batching could starve and chunks pile up un-rendered.
- `useRafBatchedChunks.ts` — the rAF batcher itself. Worth checking whether the flush loop has a fallback timer or only relies on rAF.
- `chatOrchestrationBridge.ts` (and the `Progress*` siblings under `src/main/agentChat/`) — main-process emitter of `agentChat:streamChunk`. Less likely the source — events are still produced and the persisted render proves they arrive eventually.
- Per-window project isolation (`windowManager.ts`) — verify each window's `agentChat:streamChunk` listener is mounted and not torn down on focus change.

Per-window IPC isolation: each window has its own `ManagedWindow` (per repo CLAUDE.md). The streaming events should route per-window. Worth confirming the dispatch isn't accidentally going to the focused window only.

## Likely failure modes (enumerate during B1, not fix yet)

1. **rAF throttling on hidden/blurred renderers** — most-likely cause. Chrome/Electron throttle `requestAnimationFrame` to ~1 Hz on background tabs and may pause entirely on minimized/occluded windows. The `useRafBatchedChunks` hook's flush loop would stall, and chunks would queue in the batcher without rendering. When the window regains focus the queue may flush all-at-once or not at all (depending on whether the batcher closes over stale state).
2. **Listener teardown on focus change** — if `useAgentChatStreaming` re-subscribes its event listener and the unmount path drops the queued chunks, that explains the missing live render.
3. **Per-window `webContents.send` only fires to focused window** — main-process bug where the bridge picks the wrong target when multiple windows are subscribed.
4. **State setter in stale closure** — common rAF + React pattern bug where the batcher's flush callback captures an old `setStateMap` reference, silently fails to update.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md`, instrument both ends:

1. **Main side** — `log.info('[trace:stream] emit', { windowId, threadId, chunkId, ts })` at the bridge's `webContents.send` call site for `agentChat:streamChunk`.
2. **Renderer side** — `log.info('[trace:stream] received', { threadId, chunkId, ts, documentHidden: document.hidden })` at the `useAgentChatStreaming` listener.
3. **rAF batcher** — `log.info('[trace:stream] flush', { queuedCount, sinceLastFlushMs })` inside `useRafBatchedChunks`'s flush callback.
4. Run the repro: focus window A, focus window B, focus window A again, leave both for 30s minimized. Compare timestamps:
   - Are emit/receive timestamps continuous on the unfocused window? (rules out main-side dispatch bug)
   - Does the flush log stop firing when `document.hidden === true` or the window is unfocused? (confirms rAF throttle hypothesis)
   - Does the queued count grow unboundedly? (confirms accumulation)

If hypothesis 1 (rAF throttle) is confirmed, fix candidates:
- Add a `setTimeout(0)` / `setInterval` fallback when `document.hidden` or visibility events fire blurred.
- Switch to `MessageChannel`-based microtask batching for unfocused windows (no throttle).
- Flush synchronously when the queue exceeds a threshold (e.g. 20 chunks).

Per the CLAUDE.md note: `complete`/`error` chunks already flush synchronously. The streaming `delta` chunks are the only ones at risk — which matches the observed symptom (final render works, intermediate render stalls).

## Priority

Medium — does not lose data (final render is correct), but degrades UX during multi-project work. User flagged "to follow up on later." Wave 84 (Cypher engine, Project hop fix) takes the next slot.

## Related

- Adjacent open follow-ups touching chat-only-shell streaming/state: `2026-05-07-context-preview-rules-disappear-after-chat-start.md`, `2026-05-07-full-review-artifact-pane-empty.md`. Different surfaces; same area.
- `src/renderer/components/AgentChat/CLAUDE.md` "rAF-batched streaming" section explicitly notes 20–50 chunks per frame on a fast model — if rAF is throttled to 1 Hz, that's hundreds of chunks queued before flush, which would manifest as a hard stall.
