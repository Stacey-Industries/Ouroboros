# Wave 64 — ADR: Chat Session Lifecycle Bridge

**Status:** LOCKED 2026-04-30 by orchestrator + user.
**Plan:** `roadmap/wave-64-chat-session-lifecycle.md`
**Diagnosis surfaced during Wave 63 wrap.**

---

## Decision 1: Bridge in the renderer, not the hook script

**Context:** Chat-spawned Claude Code sessions never register in the IDE's session-tracking. The `session_start` hook script at `~/.claude/hooks/session_start.mjs:17` early-exits when `OUROBOROS_CHAT_SESSION=1` (set by `claudeCodeHelpers.ts:162` on every chat-spawn). As a result, `InstructionsLoaded` events arrive at the renderer tagged with a session_id no `AgentSession` matches → `updateSession` is a no-op → `loadedRules` stays empty → popover Rules tab shows User=0, Project=0.

Three paths to fix:

- **(a) Remove the hook-script early-exit** — let `session_start` fire for chat sessions too.
- **(b) Renderer-side bridge** — when a chat thread has a `claudeSessionId`, dispatch a new `SESSION_REGISTER` action so the reducer creates a session record proactively.
- **(c) Reconcile `instructions_loaded` in `inferSessionId`** — same way `pre_tool_use` is reconciled to "most recent active session."

**Pick:** (b) — renderer-side bridge.

**Rationale:** (a) double-tracks lifecycle: chat sessions are already tracked via stream-json; layering a hook on top introduces redundant lifecycle events and risks divergence between channels. (c) is fragile — "most recent active session" silently misattributes events when multiple chat sessions overlap, and produces inconsistent results when no chat session is yet tracked. (b) is surgical: the IDE already knows the chat session's UUID at the moment stream-json's `system.init` fires, and the chat thread carries it forward via `orchestrationLink.claudeSessionId`. Registering at that exact moment fills the gap precisely without disturbing existing channels.

**Consequences:** No hook-script changes. New `SESSION_REGISTER` action; new `useChatSessionRegistration` hook; bridge mounted from `ComposerContextPreview` keyed on `claudeSessionId`. The `session_start` hook keeps its `OUROBOROS_CHAT_SESSION` early-exit — that exit is correct for chat sessions because the IDE owns their lifecycle.

---

## Decision 2: `kind` discriminator on AgentSession

**Context:** `AgentSession` is the unified record type for both subagents (registered via `AGENT_START` hook) and IDE chat sessions (registered via this wave's bridge). Before this wave, every session was conceptually an "agent" because the only registration path was `AGENT_START`. With chat sessions joining the array, AgentMonitor needs to distinguish.

**Pick:** Add `kind?: 'chat' | 'agent' | 'terminal'` field on `AgentSession`. Default missing kind to "agent" (legacy / persisted records).

**Rationale:** The alternative — separate session arrays for chat vs agent — would require refactoring `useAgentEvents`, the context, and every consumer. The `kind` flag is a zero-cost discriminator that AgentMonitor can filter on without touching the underlying state shape. Mirrors the existing `internal: boolean` flag pattern noted in `AgentMonitor/CLAUDE.md` ("components can use this to suppress them from the main list").

**Consequences:** Persisted sessions don't include `kind` — they're loaded via `LOAD_PERSISTED` and treated as "agent" (the legacy default). No migration logic needed. New consumers that care about provenance check the field; legacy ones don't break.

---

## Decision 3: Idempotent `SESSION_REGISTER` action

**Context:** The bridge fires from `useEffect` whenever the active chat thread's `claudeSessionId` changes. Re-renders, thread switches, and component remounts can all trigger it for the same session id. The reducer must handle this gracefully.

**Pick:** `SESSION_REGISTER` is a no-op when a session with the given id already exists. Returns the same state reference (`if (hasSession) return state`).

**Rationale:** Idempotent reducers are the React-friendly default for cases where the dispatching layer doesn't trivially know the current state. The bridge has read access to `agents`, but checking-then-dispatching introduces a TOCTOU race window. Letting the reducer enforce the invariant centralizes correctness.

**Consequences:** Safe to dispatch from any subscription / re-render path. Tests assert idempotency. The reducer keeps its existing `AGENT_START` behavior (which updates an existing session) — the two actions are intentionally different shapes (`SESSION_REGISTER` is "create if absent"; `AGENT_START` is "create-or-update").

---

## Decision 4: Popover lookup prefers chat-thread session match

**Context:** `useActiveSessionRulesAndSkills` previously fell back to "most recent running agent" when no exact match was found. This silently picked up a host-IDE *terminal* Claude session's rules during Wave 62 demos, masking the bug. With the bridge in place, the popover should now look up by session_id first.

**Pick:** Look up `agents.find(s => s.id === claudeSessionId)` when `claudeSessionId` is provided. Fall back to "most recent running" only when no `claudeSessionId` is given (e.g., IDE-shell variants without a chat-thread context).

**Rationale:** The popover's claim is "context for the next prompt." When a chat thread is active, that context is unambiguous — the chat's own session, no fallback needed. The fallback path stays for surfaces that don't have chat-thread context (IDE shell), but it's clearly a secondary path now, not the primary one.

**Consequences:** When `claudeSessionId` matches an agent record, only that record's rules display. When it doesn't match (race window before SESSION_REGISTER fires, or some other edge), the tab displays empty rather than rules from an unrelated session. Honest empty > misleading borrowed data.

---

## Decision 5: Filter `kind: 'chat'` from AgentMonitor

**Context:** Adding chat sessions to `state.sessions` would surface them in AgentMonitor's session list, which is meant for agent-monitor surfaces (subagents, terminal Claude sessions).

**Pick:** `filterSessions` excludes `kind === 'chat'` unconditionally — both with and without an active query.

**Rationale:** Chat sessions are runtime infrastructure for the popover, not a monitor surface. Showing them in AgentMonitor would confuse the user about what's running. Mirrors the same reason `internal: true` sessions are suppressible from the list.

**Consequences:** Chat sessions still exist in `state.sessions` and the popover finds them via id lookup. AgentMonitor only sees agent + terminal kinds (and legacy records with no `kind`, treated as agent). Non-chat sessions are unaffected.

---

## Decision 6: Eager-persist project root mutations (bundled fix)

**Context:** Surfaced during Wave 64 wrap. The user added the contractor app to a chat-only window's project rail; an unclean restart (HMR / dev-server Ctrl+C / kill) lost it. Diagnosis at `src/main/windowManager.ts:297-313` — `setWindowProjectRoots` updated the in-memory `managed.projectRoots = roots` but did **not** call `persistWindowSessions()`. The only persist path was the `'close'` event handler (line 187), so any unclean exit lost mutations between the last close and the crash.

**Pick:** Call `persistWindowSessions()` from the end of `setWindowProjectRoots` after the in-memory mutation completes. No debounce.

**Rationale:** Project-root mutations are user-initiated and infrequent (clicking "+ Add" in the rail) — eager persist is fine. Bounds use a debounced timer because resize fires hundreds of events per drag; project roots don't have that volume. Choosing "eager + simple" over "debounced + correct in pathological cases" matches the actual usage pattern.

**Consequences:** Every project-root change now hits SQLite synchronously via electron-store. The IPC handler at `setWindowProjectRoots` becomes effectively durable — surviving force-kill, HMR restart, dev-server interrupt, OS reboot, and crash. Bundled into Wave 64's commit since it's the same family of bug as the chat-session lifecycle issue: state that should persist properly didn't.

---

