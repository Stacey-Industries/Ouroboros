# Wave 57 Phase A — Subagent Linkage Diagnostic Spike

Code-reading analysis of the subagent parent/child linkage paths and where they fail.
Written from static analysis; no live runtime traces yet (those come from Phase B after
enabling `agentMonitor.subagentDisplay.diagnostics`).

---

## 1. CLI Path Analysis

### What `subagentTracker.ts` records

`subagentTracker.ts` is an in-memory singleton keyed by child session ID. It has two
entry points that matter for linkage:

**`onTaskToolPreUse(payload: HookPayload)`** — called from `hooksSubagentTap.ts` when a
`pre_tool_use` Task event arrives via the named pipe. It reads
`payload.input.childSessionId`. If that field is present, it calls `recordStart({ id:
childSessionId, parentSessionId: payload.sessionId, toolCallId: payload.toolCallId })`,
establishing the parent→child mapping in `records`.

**`recordStart(params)`** — idempotent upsert into the `records` Map. Sets
`parentSessionId` on the record. Also drains any buffered messages/usage that arrived
before the record was created.

**Key observation:** `onTaskToolPreUse` only fires the fast path when
`payload.input.childSessionId` is present. According to the Task tool's contract, the
child session ID is included in the tool input only when Claude Code's fork mechanism
writes it before invoking the hook. In practice, the child session ID is often absent
because the hook fires at pre_tool_use time, before the child process has been assigned
a session ID. When `childSessionId` is missing, `onTaskToolPreUse` returns early without
recording anything.

### What `hooks.ts` receives

The named-pipe server (`hooksNet.ts`) accepts JSON payloads from Claude Code hook
scripts. These arrive as `HookPayload` objects. The `agent_start` event for a child
session has:

- `type: 'agent_start'`
- `sessionId`: the child's new session UUID
- `parentSessionId`: **sometimes absent** — the hook script only sets this when the
  child process itself writes it to the hook payload, which Claude Code does not always
  do for Task-spawned subagents

The `dispatchToRenderer` path in `hooks.ts` calls `runHookTaps(payload)` which calls
`tapSubagentTracker(payload)`. But `tapSubagentTracker` only handles `Task` tool events
(`pre_tool_use` / `post_tool_use`). An `agent_start` event for a child session passes
through `dispatchToRenderer` → `sendPayload` → renderer without ever being enriched
with `parentSessionId` from the tracker's records.

### Where `parentSessionId` gets lost

1. `pre_tool_use` Task arrives → `onTaskToolPreUse` fires → if `childSessionId` in
   input, records `parentSessionId` in `subagentTracker.records`.
2. Child's `agent_start` arrives later via the named pipe.
3. `hooks.ts` dispatches it to the renderer **as-is**, without consulting
   `subagentTracker.records` to enrich the payload with `parentSessionId`.
4. The renderer receives an `agent_start` with no `parentSessionId`.

**The gap:** `subagentTracker.getParentForChild(childSessionId)` (effectively
`subagentTracker.get(childSessionId)?.parentSessionId`) is never called to enrich the
incoming `agent_start` before dispatch. The data is in memory; nobody reads it.

---

## 2. Chat Path Analysis

### What `chatOrchestrationBridgeMonitor.ts` emits (parent only)

`ensureMonitorSessionStarted` (line 91) emits one synthetic `agent_start` via
`dispatchSyntheticHookEvent`:

```
{
  type: 'agent_start',
  sessionId: ctx.threadId,       // ← the PARENT thread ID
  taskLabel: ctx.userPrompt,
  timestamp: now,
  model: ctx.model,
}
```

No `parentSessionId` field. This is the session that appears in the Agent Monitor. It
represents the top-level chat thread.

### What's missing for chat-spawned subagents

When a chat agent uses the Task tool internally, the tool block surfaces in
`chatOrchestrationBridgeProgressBlocks.ts` via `handleToolBlock` → `applyToolStart`.
The block arrives with `toolActivity.name === 'Task'`.

**No synthetic `agent_start` is emitted for the child session.** The chat path only
sees tool_use blocks at the `ProviderProgressEvent` level — it never receives the
child's session UUID from the Anthropic API stream (the API doesn't expose it). So
there is no child session ID to emit a synthetic `agent_start` for, and the child
never appears in the Agent Monitor at all.

The `emitMonitorToolStart` call in `applyToolStart` fires a `pre_tool_use` synthetic
event with `toolCallId = stream-{sessionId}-{blockIndex}`, but this is for the parent
thread's tool list — it does not create a child session entry.

---

## 3. Renderer Resolution

### How `useAgentEvents.helpers.ts` resolves `parentSessionId`

When an `AGENT_START` action fires, `startSession` calls `resolveParentAndTimestamps`:

```typescript
function resolveParentAndTimestamps(state, action) {
  // Fast path: payload carried parentSessionId
  let resolvedParent = action.parentSessionId
    ?? state.pendingSubagentLinks[action.sessionId];

  // Fallback: temporal window heuristic
  if (!resolvedParent) {
    const temporalMatch = findTemporalParent(
      state.pendingSubagentTimestamps, action.timestamp
    );
    if (temporalMatch) {
      resolvedParent = temporalMatch.parentSessionId;
      // consume the stamp
    }
  }
  return { resolvedParent, updatedTimestamps };
}
```

**Fast path 1 — payload `parentSessionId`:** Works only if the `agent_start` hook
payload carries `parentSessionId`. As shown above, for CLI subagents this field is
absent because `hooks.ts` never enriches it from `subagentTracker`. For chat subagents
it never fires at all.

**Fast path 2 — `pendingSubagentLinks`:** Populated by `LINK_SUBAGENT` actions, which
are dispatched from `dispatchToolStart` when a `pre_tool_use` event arrives with
`payload.input.childSessionId`. This works for the CLI fast path only when
`childSessionId` is present in the tool input. The link is stored as
`pendingSubagentLinks[childSessionId] = parentSessionId`. When the child's `agent_start`
arrives, it matches and the link resolves.

**Fallback — temporal window:** `findTemporalParent` searches
`pendingSubagentTimestamps` for a stamp within 30 seconds of the child's start
timestamp. A stamp is recorded by `RECORD_SUBAGENT_TOOL` when a `pre_tool_use` Task
event arrives without `childSessionId`. This is the heuristic path for CLI subagents
whose tool input doesn't carry the child session ID.

**Why it fails:**

- For CLI subagents: `agent_start` arrives at the named pipe with no `parentSessionId`.
  The temporal stamp is placed when `pre_tool_use` fires. But the 30-second window
  relies on the child process starting quickly and the `agent_start` hook arriving
  before the window expires. Model loading time can exceed 30 seconds for large
  contexts. The stamp is also a one-shot: once consumed, subsequent retries fail.

- For CLI subagents with `childSessionId`: The `LINK_SUBAGENT` reducer stores it in
  `pendingSubagentLinks`, but only if the `pre_tool_use` arrives before `agent_start`.
  With parallel subagents, ordering is not guaranteed.

- For chat subagents: No `agent_start` event ever fires for the child. The temporal
  stamp fires (chat `pre_tool_use` synthetic event goes through the same
  `dispatchToolStart` path), but there is no child `agent_start` to consume it.

### Persisted session restore

`usePersistedSessionsLoader` loads sessions from `window.electronAPI.sessions.load()`.
Persisted sessions carry whatever `parentSessionId` was set at save time. If a session
was saved without a `parentSessionId` (because linkage failed), restore has no way to
recover the relationship. There is no secondary lookup against persisted subagent
records on restore.

---

## 4. Gaps Summary

This wave closes four gaps:

### Gap 1 — CLI enrichment (Phase B)

**Problem:** `agent_start` events arriving via the named pipe never have
`parentSessionId` enriched from `subagentTracker.records`.

**Fix location:** `hooks.ts` → `dispatchToRenderer`, before `sendPayload`. When the
incoming event is `agent_start`, look up `subagentTracker.get(payload.sessionId)` and
attach `parentSessionId` if found. Alternatively, enrich in `hooksSubagentTap.ts`
which already imports `subagentTracker`.

**Data available:** `subagentTracker.records` has the mapping when `pre_tool_use` Task
arrived before `agent_start` (the common case for sequential subagents). When
`pre_tool_use` arrives after (parallel spawning), the enrichment must be deferred — a
post-hoc `LINK_SUBAGENT` dispatch once the Task tool event arrives.

### Gap 2 — Chat synthetic emission (Phase B)

**Problem:** No synthetic `agent_start` fires for chat-spawned subagents. The chat
stream delivers Tool use blocks but never exposes the child's session UUID.

**Fix location:** `chatOrchestrationBridgeProgressBlocks.ts` → `applyToolStart` for
`toolActivity.name === 'Task'`. A synthetic `agent_start` can be emitted using a
derived session ID (e.g. the `toolCallId` as a stable proxy) with `parentSessionId:
ctx.threadId`. The child will never have a real Claude session UUID from the API stream,
so the proxy ID becomes the canonical identifier for display purposes.

**Constraint:** The proxy ID must be stable across re-renders (use `toolCallId`, not a
random UUID) and must not collide with real CLI session IDs (prefix it, e.g.
`chat-task:{toolCallId}`).

### Gap 3 — Renderer live-event path (Phase B)

**Problem:** Even when `parentSessionId` arrives on `agent_start`, `dispatchAgentStart`
in `useAgentEvents.ts` forwards it to the `AGENT_START` reducer, which calls
`resolveParentAndTimestamps`. If `pendingSubagentLinks` already has a conflicting entry
(from an earlier `LINK_SUBAGENT`) it takes precedence over the payload value. The
payload `parentSessionId` should win.

**Fix location:** `resolveParentAndTimestamps` — payload `parentSessionId` should be
the first resolution, and `pendingSubagentLinks` should only serve as a fallback for
when the payload carries nothing.

Currently: `action.parentSessionId ?? state.pendingSubagentLinks[action.sessionId]` —
this is already correct ordering. But the `LINK_SUBAGENT` reducer only fires when
`childSessionId` is in the tool input. When the tool input lacks it, only the temporal
stamp path fires.

**Real gap:** `RECORD_SUBAGENT_TOOL` timestamps are consumed on the first match, but
parallel subagents spawn multiple children from the same parent in rapid succession.
Once the first stamp is consumed, subsequent children fall through without a match.

### Gap 4 — Renderer restore (Phase B)

**Problem:** Persisted sessions carry no `parentSessionId` when linkage failed. On
restore, `LOAD_PERSISTED` places sessions directly into state without re-running
linkage logic.

**Fix location:** `useAgentEvents.helpers.ts` → `loadPersistedSessions`. On restore,
cross-reference each session's `parentSessionId` against the loaded sessions. If a
session has no `parentSessionId` but another session's tool calls reference its ID (via
`toolCalls[*].toolName === 'Task'`), attempt retroactive linkage. This is best-effort
and only works when both parent and child were persisted in the same snapshot.

---

## 5. Instrumentation Added (Phase A)

The following trace points were added to observe the linkage pipeline at runtime.
All are no-ops until `agentMonitor.subagentDisplay.diagnostics` is set to `true`.

| Trace stage | Location | What it logs |
|---|---|---|
| `tracker:recordStart` | `subagentTracker.recordStart` | parentSessionId, childSessionId, toolCallId at tracker write time |
| `tracker:recordEnd` | `subagentTracker.recordEnd` | parentSessionId (from record), childSessionId at end time |
| `hook:agentStart` | `hooksSubagentTap.tapSubagentTracker` | parentSessionId from payload, childSessionId from tool input, for pre_tool_use Task events |
| `chat:taskBlockObserved` | `chatOrchestrationBridgeProgressBlocks.applyToolStart` | toolCallId when a Task tool block first surfaces in the chat stream |
| `renderer:resolve` | `useAgentEvents.helpers.resolveParentAndTimestamps` | resolved parentSessionId and childSessionId at the reducer decision branch |

To enable: set `agentMonitor.subagentDisplay.diagnostics: true` in electron-store (via
Settings or direct config edit). Main-process traces emit to electron-log at
`[trace:subagent-link]` level. Renderer trace emits to DevTools console via
`console.warn('[trace:subagent-link]', ...)`.

---

## 6. Files Modified / Created

| File | Change |
|---|---|
| `src/main/configSchemaTailExt2.ts` | New — `agentMonitor.subagentDisplay.diagnostics` config schema |
| `src/main/configSchemaTailExt2.test.ts` | New — smoke tests for schema |
| `src/main/configSchemaTailExt.ts` | Spreads `tailSchemaExt2` |
| `src/main/configAppTypes.ts` | Added `agentMonitor?` to `AppConfig` |
| `src/main/agentChat/subagentLinkTrace.ts` | New — `traceLink` helper, gated on config flag |
| `src/main/agentChat/subagentLinkTrace.test.ts` | New — 20 tests covering gating + schema |
| `src/main/agentChat/subagentTracker.ts` | `traceLink` calls in `recordStart` + `recordEnd` |
| `src/main/hooksSubagentTap.ts` | `traceLink` call on `pre_tool_use` Task events |
| `src/main/agentChat/chatOrchestrationBridgeProgressBlocks.ts` | `traceLink` call when Task tool block first surfaces in chat stream |
| `src/renderer/hooks/useAgentEvents.helpers.ts` | `console.warn` trace at `resolveParentAndTimestamps` decision branch |
