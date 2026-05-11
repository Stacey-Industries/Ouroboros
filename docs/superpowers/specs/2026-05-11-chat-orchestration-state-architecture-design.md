---
status: APPROVED
created: 2026-05-11
updated: 2026-05-11
authors: Cole Stacey + Claude (Opus 4.7)
profile: A
stage: 1-discovery
supersedes: roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md (framing)
prep-artifacts:
  - roadmap/foundation/chat-orchestration/00-prep-codebase-manifest.md
  - roadmap/foundation/chat-orchestration/01-research-claude-code-cli-headless.md
  - roadmap/foundation/chat-orchestration/02-research-ide-chat-patterns.md
  - roadmap/foundation/chat-orchestration/03-research-streaming-state-architecture.md
---

# Chat Orchestration — State Architecture Overhaul Design

## 1. Context

Wave 84 closed after four phases of bug-by-bug chat-lifecycle fixes failed to converge. Each fix surfaced 1–2 adjacent issues. Hypotheses were wrong in Phase A (twice), Phase B, and Phase D. The pattern is consistent with state-architecture leakage across the main↔renderer boundary, not six independent bugs. This design replaces piecemeal fixing with a structural overhaul.

Source framing: `roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md`. AS-IS map and external research in the four prep artifacts listed above.

### Differentiator from typical chat-with-agent products

Ouroboros IDE launches Claude Code CLI subprocesses with Claude Max subscription auth — NOT direct API or Agent SDK. The CLI emits stream-json on stdout and fires hook events on a named pipe. This shapes the design:

- No direct control over streaming server.
- Session identity is the CLI's `--resume` UUID, not internally issued.
- Multiple ID namespaces in flight (we collapse them in this design).
- Hooks substitute for some SDK callbacks but not all.
- `countTokens`, prompt caching control, structured multi-turn input, message-history retrieval, runtime tool injection — none available.

## 2. Locked-in constraints

| Constraint | Decision |
|---|---|
| Output scope | AS-IS map + prescriptive target architecture in one approved spec |
| Top priority | Correctness — state-leakage bugs structurally impossible or loud-fail |
| Posture | Targeted in-place refactor; build green at every phase |
| Failure mode | Hard-fail on impossible state — throw + error banner + telemetry |
| Persistence | SQLite stays authoritative; CLI JSONL is read-only secondary for repair |
| Ownership boundary | Main owns canonical chat state; renderer owns ephemeral UI only |
| Multi-window | Live mirror — all windows see same canonical state; per-window composer drafts |
| Thread lifecycle | Permanent until user-deleted; hydration capped to ~10 in-memory |

## 3. AS-IS map (summary; full detail in prep doc 00)

The current chat orchestration has six documented classes of state leakage. Each is a structural symptom, not an isolated bug.

| Class | Examples | Root cause |
|---|---|---|
| **Identity conflation** | `findThreadIdForSession` dual-key scan; `inferSessionId` heuristic; synthetic-sessionId-equals-threadId masquerade | Five distinct ID types treated as a flat namespace with ad-hoc translation |
| **Suppression bypass** | `instructions_loaded` exempted from suppression; 2-second `syntheticSessionIds` cleanup window | Suppression as a global gate instead of per-event source-of-truth |
| **Multi-process desync** | `agentChat:thread` IPC dropped during streaming; renderer mutating state main doesn't see | Renderer holds canonical state in parallel to main; no single owner |
| **Event source proliferation** | `agentChat:stream`, `agentChat:thread`, `agentChat:status`, `hooks:event`, `agent-chat:thread-snapshot` CustomEvent | Five channels carrying overlapping data; renderer reducers fan in from all |
| **Lifecycle ambiguity** | No "really over" signal; ~100 sessions accumulate in memory; `MinimalOrchestration.sessions` lost on restart | No explicit state machine; lifecycle implicit in flags and counters |
| **Sticky-field staleness** | `applyStickyLinkFields` retains old model/effort across re-launch; `loadSession` keyed by wrong field post-restart | Field-level merge rules instead of event-driven state transitions |

Ten specific gaps remain in the AS-IS understanding (listed in prep doc 00 §GAPS). The target architecture below renders most of them moot by eliminating the structures they describe; remaining gaps surface during plan execution.

## 4. Target architecture

### 4.1 State authority model

**One owner per piece of state. Two zones.**

**Main-owned (canonical).** Thread records; per-thread message list; in-flight block accumulator (current turn's streaming buffer); send queue; thread status; identity registry; active turn's session metadata (model/effort/permissionMode).

**Renderer-owned (ephemeral UI).** Composer draft text (per-window, localStorage-persisted); scroll position; expanded/collapsed code blocks; mention dropdown / slash menu state; per-window selected thread; optimistic visual markers.

**The rule:** if it survives a renderer reload, main owns it; if losing it on reload causes no information loss, renderer owns it.

### 4.2 IPC contract — three channels total

| Channel | Direction | Purpose |
|---|---|---|
| `chatState:snapshot` | Main → renderer | Full thread state on subscribe / on demand |
| `chatState:diff` | Main → renderer | Incremental state changes with per-thread monotonic `seq` |
| `chatCommand:*` | Renderer → main | User-initiated commands (sendMessage, cancelTurn, editAndResend, forkThread, etc.) |

**Deleted from today's surface:** `agentChat:thread`, `agentChat:status`, `agentChat:stream` separate channels, and the `agent-chat:thread-snapshot` renderer-internal CustomEvent. All collapse into `chatState:diff`.

**Snapshot-on-gap.** Renderer detecting a `seq` gap (e.g., diff `seq=43` received without seeing `seq=42`) immediately requests a fresh snapshot. Hard-fail if main can't honor the request.

**Hard-fail surfacing.** `chatCommand:*` referencing unknown thread/message/block IDs returns a structured error. Renderer raises a non-dismissable error banner with trace + "Restart Chat Session" button. Telemetry event emitted with full context.

### 4.3 Identity model

**Five canonical ID types. No coalescing. Registry is the only translation surface.**

| Canonical name | Created by | Identifies | Lifetime | Format |
|---|---|---|---|---|
| `ThreadId` | IDE on `createThread()` | A persistent conversation thread | Forever (until user-deleted) | UUIDv4 |
| `TurnId` | IDE on `submitTurn()` | One submit→complete cycle within a thread (replaces today's `taskId`) | Per turn | UUIDv4 |
| `MessageId` | IDE deterministic from `(threadId, turn, role, seq)` | A persisted message | Forever | `agent-chat:{threadId}:{turn}:{role}:{seq}` |
| `BlockId` | IDE deterministic from `(messageId, blockIndex)` | A content block within a message | Forever | `agent-chat:{messageId}:b{N}` |
| `ProviderSessionId` | Claude Code CLI | The CLI's resumable session (used for `--resume`) | Per CLI session | CLI's UUID format |

**Eliminated:**

- **Hook-pipe `sessionId` as distinct namespace.** Hook events arrive with `CLAUDE_SESSION_ID` = `ProviderSessionId`. Normalizer resolves to `ThreadId` before dispatch. Unresolved events (not ours) drop with high-severity log. Unresolved-but-claiming-to-be-ours (malformed) throw.
- **Synthetic session ID (= threadId masquerade).** Monitor emits using `ThreadId` directly; no fake `ProviderSessionId`.
- **`inferSessionId` heuristic.** Gone. No "most recent active session" guessing.

**`IdentityRegistry` interface:**

```typescript
class IdentityRegistry {
  // Forward lookups (canonical → canonical)
  getThread(threadId: ThreadId): ThreadRecord | undefined;
  getActiveTurn(threadId: ThreadId): TurnId | undefined;
  getProviderSession(threadId: ThreadId): ProviderSessionId | undefined;

  // Reverse lookups (external → canonical) — every event entry point uses these
  threadIdForTurn(turnId: TurnId): ThreadId;            // throws ChatStateError if unknown
  threadIdForProviderSession(psid: ProviderSessionId): ThreadId; // throws if unknown
  threadIdForMessage(msgId: MessageId): ThreadId;       // throws if unknown

  // Registrations (callable only from orchestration layer, not reducers)
  registerTurn(threadId: ThreadId, turnId: TurnId): void;
  assignProviderSession(turnId: TurnId, psid: ProviderSessionId): void; // one-way; throws if reassigned
  retireTurn(turnId: TurnId): void;
}
```

**Properties:**

1. Reverse-lookup methods throw `ChatStateError` on unknown IDs — caller does NOT catch.
2. `assignProviderSession` is one-way; second assignment with different value throws (Wave 84 Phase A class of bug becomes impossible).
3. Registry is rebuilt from SQLite on app start: every non-completed thread's last known `ProviderSessionId` restored so `--resume` flows survive crash.
4. Every method emits `[trace:identity]` log on resolve. Single instrumented surface replaces today's 3-site `[trace:agent-record]` chain.

**Exception: events from sessions we don't own.** A hook event arriving with a `ProviderSessionId` that is NOT in our registry means it came from a Claude Code session we didn't spawn (e.g., the user's own terminal session running inside the IDE). These drop with a high-severity log — they didn't belong to us. Distinct from "events claiming to belong to a thread we own but with malformed details" which throw.

### 4.4 Event flow

Three event sources funnel into one normalizer, into one state machine per thread, into one broadcaster.

```
stream-json from CLI          hook pipe events          chatCommand:* IPC
        │                              │                          │
        ▼                              ▼                          ▼
┌────────────────────────────────────────────────────────────────────┐
│ EventNormalizer                                                    │
│  - resolve external IDs → ThreadId via IdentityRegistry            │
│  - drop "not ours" with high-severity log                          │
│  - throw on "ours-but-malformed"                                   │
│  - produce CanonicalChatEvent { threadId, type, payload, seq, ts } │
└────────────────────────────┬───────────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│ ChatSessionStateMachine (one per active threadId)                  │
│  - imperative methods keyed by event.type                          │
│  - state mutation guarded by valid-transition table                │
│  - emits diffs                                                     │
└────────────────────────────┬───────────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│ ChatStateBroadcaster                                               │
│  - fan out diffs to all subscribed renderer windows                │
│  - send snapshot on subscribe                                      │
│  - persist to SQLite on stable transitions                         │
└────────────────────────────────────────────────────────────────────┘
```

**Canonical event vocabulary** (only types the state machine accepts):

| Event type | Source | Trigger |
|---|---|---|
| `turn_submitted` | command | User pressed send |
| `turn_started` | normalizer | Provider subprocess spawned |
| `provider_session_assigned` | stream-json | First event carrying `session_id` |
| `text_delta` | stream-json | `content_block_delta` with `text_delta` |
| `tool_call_started` | stream-json | `content_block_start` with `tool_use` |
| `tool_call_input_delta` | stream-json | `input_json_delta` |
| `tool_call_completed` | stream-json | `content_block_stop` for tool_use |
| `tool_result_observed` | stream-json | next-turn `tool_result` arrives |
| `tool_permission_requested` | hook | PreToolUse with `ask` |
| `tool_permission_resolved` | command | User clicked allow/deny |
| `instructions_loaded` | hook | CLI loaded rules/skills |
| `turn_completed` | stream-json | `result` event with `success` |
| `turn_failed` | stream-json | `result` event with `error_*` |
| `turn_cancelled` | command + signal | User cancelled; process killed |
| `queue_appended` | command | User sent while busy |
| `message_committed` | state-machine internal | At `turn_completed`, in-flight becomes persisted |

**Sequencing.** Per-thread monotonic `seq`. State machine refuses out-of-order (throws). Diffs include `seq` so renderer detects gaps and requests snapshot.

### 4.5 Lifecycle state machine

States: `IDLE | SUBMITTING | STREAMING | TOOL_RUNNING | COMPLETING | (terminal not modeled — threads never "end")`.

Transitions (allowed only those listed; anything else throws):

```
IDLE ──turn_submitted──▶ SUBMITTING
SUBMITTING ──turn_started──▶ STREAMING
STREAMING ──text_delta──▶ STREAMING (loop)
STREAMING ──tool_call_started──▶ TOOL_RUNNING
TOOL_RUNNING ──tool_call_input_delta──▶ TOOL_RUNNING (loop)
TOOL_RUNNING ──tool_permission_requested──▶ TOOL_RUNNING (status sub-flag: awaiting_permission)
TOOL_RUNNING ──tool_permission_resolved──▶ TOOL_RUNNING (sub-flag cleared)
TOOL_RUNNING ──tool_call_completed──▶ STREAMING
{STREAMING|TOOL_RUNNING} ──turn_completed──▶ COMPLETING
{STREAMING|TOOL_RUNNING|SUBMITTING} ──turn_failed──▶ COMPLETING
{any non-IDLE non-COMPLETING} ──turn_cancelled──▶ COMPLETING
COMPLETING ──message_committed──▶ IDLE
IDLE ──queue_appended──▶ IDLE (queue grows; no state change)
{any non-COMPLETING} ──queue_appended──▶ same state (queue grows)
COMPLETING ──(internal: queue non-empty)──▶ auto-emits turn_submitted to head of queue
```

**Why `COMPLETING` is a real state.** Persistence write + registry retirement + in-flight-clear happens in COMPLETING. Crash during COMPLETING is recoverable from the canonical event log. UI can show "saving" briefly if desired.

**Crash recovery.**
1. On app start, every thread with non-terminal status in SQLite gets reconciled.
2. Stranded turns with known `ProviderSessionId` restart in `IDLE` with sticky "previous turn interrupted" marker visible in UI. The marker is the `threads.lastInterruptedAt` column from §4.6 — set on app start during reconciliation, cleared when user starts a new turn on the thread. We do NOT auto-resume mid-stream — too brittle.
3. Tool_use without matching tool_result at crash time → synthesize `tool_result: [interrupted]` before commit (avoids Anthropic strict-adjacency landmine on next `--resume`).

**Queue handling.** `queue_appended` accepted in all states except COMPLETING. State machine auto-emits next `turn_submitted` from queue head at IDLE entry. Renderer is uninvolved in autosend — eliminates Wave 84 Phase F class.

### 4.6 Persistence boundaries

**One writer per store. SQLite is the only authoritative persistence.**

| Store | Writer | Read paths | Purpose |
|---|---|---|---|
| SQLite `threads.db` (schema v10) | `ChatPersistenceLayer` (single class) | Broadcaster hydration, threadHydrator | Authoritative chat history |
| Session memory JSON | `memoryExtractor` (main) | `ChatPersistenceLayer` at hydration | Per-session facts |
| Git checkpoint refs | `ChatPersistenceLayer` | `revertToSnapshotWithBridge` | Pre-turn HEAD hashes |
| electron-store `agentChatSettings` | Settings UI handler only | Read-only in chat path | Provider/model/effort defaults |
| localStorage `agentChat:draft:*` | Renderer composer only | Renderer composer only | Per-window draft survival |
| CLI JSONL (`~/.claude/projects/`) | Claude Code CLI (external) | `ChatPersistenceLayer` recovery (READ-ONLY) | Secondary source for repair |

**Schema v10 additions** (migration from v9):

- `threads.lastProviderSessionId TEXT NULL` — for `--resume` reconstruction post-restart
- `threads.lastInterruptedAt INTEGER NULL` — crash-recovery marker timestamp
- `messages.canonical_event_log TEXT NULL` (JSON) — per-message canonical event log, written on commit
- `identity_aliases` new table: `(thread_id TEXT PK, turn_id TEXT, provider_session_id TEXT, created_at INTEGER, retired_at INTEGER NULL)` — persistent alias registry rows for forensics + crash-recovery

**Hydration policy.** Cap ~10 fully-hydrated threads in memory. Thread list pulls summaries only (id, title, status, lastUpdated, messageCount). Opening hydrates; switching dehydrates after 30s grace. "100 sessions accumulating" failure mode becomes impossible.

**Write fences.** SQLite writes only on stable transitions: `message_committed`, `turn_completed`, `turn_failed`, `turn_cancelled`, `queue_appended`, status changes between states. Per-token deltas stay in-memory; in-flight block accumulator never touches disk.

### 4.7 Instrumentation strategy

**Three permanent structural log tags + one transient class.**

| Tag | Sites | Purpose | Status |
|---|---|---|---|
| `[trace:identity]` | `IdentityRegistry.threadIdFor*` (single emit point per method) | Every resolve attempt (success/throw) | Permanent — replaces today's `[trace:agent-record]` 3-site chain |
| `[trace:event]` | `ChatSessionStateMachine.dispatch()` (single site) | Every CanonicalChatEvent entering state machine | Permanent — replaces today's `[trace:stream]` emit/receive pair |
| `[trace:state]` | `ChatSessionStateMachine` transition method (single site) | Every state transition (from → to + reason) | Permanent — replaces today's `[trace:chat-order]` |
| `[trace:DEBUG-*]` | Anywhere | Investigation-scoped per-bug instrumentation | Transient — removed at end of investigating wave |

**Structured payload shape (all permanent tags):**

```typescript
log.info('[trace:identity]', {
  threadId: ThreadId,
  op: 'threadIdForProviderSession' | 'registerTurn' | ...,
  externalId?: string,
  result: 'ok' | 'throw',
  elapsed_ms: number,
});
```

JSON-grep-friendly. Telemetry layer samples to structured table for cross-session pattern analysis.

**"Three logs always" investigation rule.** Any chat-flow bug investigation collects:
1. All `[trace:event]` lines for affected `threadId`
2. All `[trace:state]` lines for same `threadId`
3. All `[trace:identity]` lines matching threadId OR returning throw

Trio reconstructs full decision path. No guessing across IPC / hook / DOM bridges.

**Hard-fail telemetry.** Every `ChatStateError` throw reports to telemetry with the canonical event that caused it + state machine snapshot at throw time. Pattern analysis surfaces recurring violations.

## 5. What this kills

Mapping target architecture → AS-IS leak classes:

| AS-IS leak (from prep doc 00) | Killed by section |
|---|---|
| 5.1 `instructions_loaded` suppression bypass | §4.3 (normalizer rejects unknown PSIDs outright; no suppression gate needed) |
| 5.2 2-second `syntheticSessionIds` cleanup delay | §4.3 (synthetic IDs eliminated entirely) |
| 5.3 `MinimalOrchestration` non-persistent | §4.6 (`identity_aliases` table + `lastProviderSessionId` column persist registry across restart) |
| 5.4 Session update suppressed during streaming | §4.2 (single `chatState:diff` channel; no parallel suppressed channels) |
| 5.5 `inferSessionId()` multi-session heuristic | §4.3 (throws on unknown; no guessing) |
| 5.6 `applyStickyLinkFields` staleness | §4.5 (turn metadata is event-driven; new turn → fresh assignment, no merge rules) |
| Conflation 1 (PSID vs hook-pipe sessionId) | §4.3 (same ID under canonical name) |
| Conflation 2 (taskId vs sessionId in `findThreadIdForSession`) | §4.3 (single `threadIdForTurn` resolution; no dual scan) |
| Conflation 3 (monitor sessionId = threadId masquerade) | §4.3 (monitor uses ThreadId directly) |
| Conflation 4 (PSID arrives late) | §4.3 (`assignProviderSession` is explicit one-way one-time; no implicit timing) |
| 100-sessions-in-memory | §4.6 (hydration cap of ~10) |

## 6. What stays out of scope

Per the source follow-up doc:

- Mention types (@url, @web, @thread, @diff/@commit) — feature additions, not state fixes
- System prompt visibility (#21) — UX feature
- Per-hunk accept/reject in diff review (#43) — separate wave
- `AgentChatConversation.tsx` line-count refactor — known tech debt unrelated

Also out of scope for this overhaul:
- Event sourcing / CQRS — explicitly rejected as overkill (doc 03 topic 2 verdict)
- Pure-reducer Elm-style refactor — testability gain doesn't justify ceremony cost (Approach B)
- CRDT — wrong shape (single-user)
- Mirroring CLI JSONL as canonical persistence — too much migration risk; SQLite stays authoritative

## 7. Implementation phasing

Out of scope for this design doc; the writing-plans skill drives the wave plan. Sketch only:

- **Phase 1 (walking skeleton):** IdentityRegistry + EventNormalizer + ChatStateError. Read-only — no behavioral changes yet. Existing bridge code calls `registry.registerTurn` and `registry.assignProviderSession` at the right points; resolves still happen in old code paths. Verifies the registry rebuilds correctly across crash. ~3-5 files.
- **Phase 2:** ChatSessionStateMachine introduced behind a feature flag. Existing bridge code dual-emits to old paths AND to state machine. Diff comparison surfaces divergences.
- **Phase 3:** Renderer chatState:diff subscription added; renderer reads from state machine via main while old IPC channels still fire. Renderer Zustand store reshaped to projection-only.
- **Phase 4:** Old IPC channels (`agentChat:thread`, `agentChat:status`, `agentChat:stream`, `agent-chat:thread-snapshot` CustomEvent) deleted. State machine becomes the only source.
- **Phase 5:** Hydration cap, identity_aliases table migration, crash-recovery synthesis of tool_result on interruption.
- **Phase 6:** Old code removed (suppression gates, inferSessionId, synthetic session IDs, sticky-field merge). Permanent `[trace:*]` instrumentation finalized; Wave 84 transient traces retired.

Each phase leaves the build green and the app shippable per the locked posture.

## 8. Risks

- **Phase 2 dual-emit divergences** may be hard to reason about. Mitigation: Phase 2 ships with a diff comparator that asserts equality and hard-fails on divergence in dev builds.
- **Crash-recovery `tool_result` synthesis** may not match what the CLI expects on `--resume`. Mitigation: empirical test in Phase 5; if `--resume` rejects, fall back to "previous turn interrupted; please re-send" UI and skip resume.
- **Schema v10 migration** on existing user databases must be reversible if rollback is needed. Mitigation: standard `up`/`down` migration pair, tested against a Wave-84-era seeded DB.
- **The "events from sessions we don't own" exception** (hook events from user's own terminal sessions) is the one place we keep best-effort behavior. Mitigation: log every drop; if telemetry shows we're dropping events we shouldn't, the rule tightens.

## 9. Acceptance criteria

The overhaul is complete when:

1. Every documented AS-IS leak class in §5 has no code path that could reintroduce it (verified by grep + review).
2. The four old IPC channels and the DOM CustomEvent are deleted from the codebase.
3. The IdentityRegistry is the only translation surface for non-canonical IDs.
4. The ChatSessionStateMachine is the only mutation surface for canonical chat state.
5. Crash recovery test: kill the app mid-stream, restart, verify thread shows "interrupted" marker and SQLite is consistent.
6. Multi-window test: open same thread in two windows, send from one, verify mirror in the other within one frame.
7. All Wave 84 follow-up bugs reproduce as no-bugs (or, if they reproduce, the failure is loud, with banner + telemetry — not silent).
8. The "Three logs always" investigation trio reconstructs at least one historical Wave 84 bug from logs alone.

## 10. References

- Prep doc 00: `roadmap/foundation/chat-orchestration/00-prep-codebase-manifest.md` (AS-IS map)
- Prep doc 01: `roadmap/foundation/chat-orchestration/01-research-claude-code-cli-headless.md` (CLI capabilities)
- Prep doc 02: `roadmap/foundation/chat-orchestration/02-research-ide-chat-patterns.md` (IDE survey)
- Prep doc 03: `roadmap/foundation/chat-orchestration/03-research-streaming-state-architecture.md` (architecture spectrum)
- Source follow-up: `roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md`
- Wave 84 close: commit `142566bb`
