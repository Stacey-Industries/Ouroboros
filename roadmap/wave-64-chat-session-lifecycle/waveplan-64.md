# Wave 64 — Chat Session Lifecycle Bridge

## Status

DRAFT · target v2.10.1 · follows Wave 63 (popover tab coverage) and Wave 62 (rule toggles).

## Why this wave exists

**Symptom (reported during Wave 63 wrap):** in the IDE chat targeting any project, the popover's Rules tab shows User=0 and Project=0, even though Claude Code clearly loaded the rules for that session.

**Root cause:** chat-spawned Claude Code sessions never register in the renderer's `useAgentEvents` reducer. The reducer only creates `AgentSession` records on `AGENT_START` (which fires for subagents, not parent chat sessions). `InstructionsLoaded` hook events arrive at the renderer tagged with the chat session's UUID, but no matching record exists, so `updateSession` is a no-op and the rules drop silently.

The popover's `useActiveSessionRulesAndSkills` falls back to "most recent running agent" when no exact match exists. During Wave 62 testing this happened to pick up the *host-IDE terminal* Claude session's rules (the meta-development warning in CLAUDE.md confirms there's always one running). So the Rules tab appeared to work, but it was lying — showing terminal-session rules under the chat-session label.

## Goal

The popover's Rules / Skills / Tools / Memory / Mentions / System tabs report state for the **actual chat session being composed against**. No fallbacks to other sessions, no silent drops.

## Locked decisions

1. **Hook script stays as-is.** `~/.claude/hooks/session_start.mjs:17` early-exits when `OUROBOROS_CHAT_SESSION=1` — correct, since chat sessions are IDE-tracked, not hook-tracked. Reverting that exit would double-track lifecycle.

2. **Renderer-side bridge is the right seam.** The IDE knows the chat session's UUID from stream-json's `system.init` event, propagated to the chat thread's `orchestrationLink.claudeSessionId`. The renderer creates the `AgentSession` record proactively when that ID becomes known, instead of waiting for a hook event that won't fire.

3. **Add `kind` discriminator to `AgentSession`.** Chat sessions and agent-monitor sessions are distinct concepts; tag the source so consumers (AgentMonitor, popover) can filter.

4. **`SESSION_REGISTER` is idempotent.** Multiple bridge invocations for the same id are no-ops. Avoids re-entrancy bugs when chat threads switch.

5. **Popover lookup prefers chat-thread match, falls back to legacy "most recent running."** Backward-compatible with the existing IDE-shell variant where the popover may render without a chat thread context.

## Scope

**In scope:**
- `AgentSession.kind` field (`'chat' | 'agent' | 'terminal'`, optional, default `'agent'` for backward compat).
- New reducer action `SESSION_REGISTER` — idempotent create with kind + cwd.
- New reducer action `SESSION_END_BY_ID` (optional — see Phase B notes).
- New renderer hook `useChatSessionBridge(thread)` that dispatches `SESSION_REGISTER` when a thread's `claudeSessionId` is known and not already in `state.sessions`.
- Update `useActiveSessionRulesAndSkills` in `ComposerContextPreview.tsx` to prefer match by chat thread `claudeSessionId` over "most recent running."
- AgentMonitor filter: hide `kind: 'chat'` sessions.
- Tests covering: SESSION_REGISTER reducer, bridge hook, popover lookup with explicit session match, AgentMonitor filter.

**Out of scope:**
- Changing the hook script. (`session_start.mjs` stays.)
- Refactoring `useAgentEvents` to a new state shape.
- IPC contract changes — chat threads already carry `claudeSessionId`.
- Persistence — chat session records in `useAgentEvents` are runtime-only.
- Backfilling rule events that arrived before the bridge dispatched. The bridge fires on the first turn's `init` event, which precedes the bulk of `InstructionsLoaded` events; missed events would be a rare race and acceptable to ignore for v1.

## Phases

| Phase | Topic | Notes |
|---|---|---|
| 0 | ADR | Capture decisions 1–5 in `roadmap/decisions/wave-64.md`. |
| A | Reducer + types | Add `kind` to `AgentSession` (in `useAgentEvents.helpers.ts` types and the shared interface). Add `SESSION_REGISTER` action + reducer case. Reducer creates a session if missing; if present, no-op. Tests in `useAgentEvents.test.ts`. |
| B | Bridge hook | New `src/renderer/hooks/useChatSessionBridge.ts` — accepts the active chat thread, watches `orchestrationLink.claudeSessionId`, dispatches `SESSION_REGISTER` to the agent-events context when the id is known and not yet registered. Tests use `renderHook` + a mocked dispatcher. |
| C | Popover lookup | Update `useActiveSessionRulesAndSkills` in `ComposerContextPreview.tsx` to take the active chat thread (or its session id) and look up the matching `AgentSession` first; only fall back to "most recent running" when no match. Tests assert the priority order. |
| D | AgentMonitor filter | Filter out `kind: 'chat'` sessions in the AgentMonitor list view. Verify chat sessions don't appear; agent + terminal still do. |
| E | Wire bridge into the chat composer | Mount `useChatSessionBridge` from `AgentChatComposer` (or the closest ancestor that has the active thread). Ensure cleanup on unmount. |
| F | Manual smoke + result brief | Smoke checklist: open chat against contractor app → popover Rules tab → User and Project counts > 0. Backward-compat check: terminal Claude in IDE still surfaces rules. AgentMonitor unchanged. |

## Risks

| Risk | Mitigation |
|---|---|
| Race: `InstructionsLoaded` fires before `SESSION_REGISTER` lands | The bridge dispatches on first paint after the chat thread's session_id resolves (typically right after stream-json init). Hook events lag the init event slightly. If a race manifests, dispatch SESSION_REGISTER from main-side as a fallback (extra IPC) — track for follow-up. |
| AgentMonitor hides too much | Default `kind` in `SESSION_REGISTER` is `'chat'`; existing AGENT_START flow defaults to `'agent'`. AgentMonitor only filters chat. Manual smoke confirms agent monitor still shows subagent rows. |
| `kind` field breaks persisted sessions | Persisted sessions don't include `kind` — they're loaded via `LOAD_PERSISTED` and treated as `'agent'` (the current default). Migration: read missing `kind` as `'agent'`. |
| Multiple chat threads switching rapidly | Bridge keys on session_id, not thread id. Each unique session_id registers once; subsequent threads with the same id no-op. Different ids each get their own record. |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-64.md`.
- [ ] In an IDE chat against the contractor app (or any project), the popover Rules tab shows non-zero counts for both User and Project sub-tabs (assuming Claude Code loaded any rules — most projects load `~/.claude/CLAUDE.md` at minimum, so User > 0).
- [ ] Switching the active chat thread updates the popover's data to that thread's session, not whatever was previously most-recent.
- [ ] AgentMonitor does not show chat sessions as separate rows.
- [ ] Existing terminal Claude monitoring in AgentMonitor unchanged.
- [ ] `npm test` passes; new tests for reducer, bridge, popover lookup.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-64-result.md`.

## Files the next agent should read first

1. `src/renderer/hooks/useAgentEvents.helpers.ts` — reducer entry point and AgentSession type.
2. `src/renderer/hooks/useAgentEvents.session-utils.ts` — `updateSession`, `createPlaceholderSession`.
3. `src/renderer/hooks/useAgentEvents.ruleSkillReducers.ts` — `reduceRuleLoaded` (the silent no-op site).
4. `src/renderer/components/AgentChat/ComposerContextPreview.tsx` — `useActiveSessionRulesAndSkills` (the lookup site).
5. `src/shared/types/agentChat.ts:103-118` — `AgentChatOrchestrationLink.claudeSessionId` (the source of truth).
6. `src/main/orchestration/providers/claudeCodeHelpers.ts:138` — where stream-json init fires (for context; main-side change is not required this wave).
7. `~/.claude/hooks/session_start.mjs` and `~/.claude/hooks/instructions_loaded.mjs` (read-only — for understanding, not editing).

## A note to the next agent on tone

This is a small, surgical wave. The diagnosis is precise; resist the urge to re-design `useAgentEvents`. The fix is one new field on `AgentSession`, one new action, one new bridge hook, one updated lookup, one filter. Tests confirm the renderer creates session records for chat sessions and the popover finds them.

Don't touch the hook scripts. Don't add main-side IPC. Don't migrate persisted state. The chat thread already carries the session id — use it.
