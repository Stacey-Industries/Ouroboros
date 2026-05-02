# Disabled file/mention IDs honored at chat send path

**Status:** WAVE-IT — small standalone wave, trust-eroding bug
**Source:** `roadmap/audit-verification-pass.md` Section D item #15 (Wave 59 follow-up)
**Filed:** 2026-05-01
**Re-scoped:** 2026-05-02 — original framing assumed rule toggles were broken; verification showed rules already work via Wave 62 filesystem mechanism (`fireRuleToggleIpc` → `toggleRuleFile` IPC). The actual bug is files and @mentions: their popover toggles only update renderer-local `useState` and never cross IPC. Wave scope refocused accordingly.

## The bug

The chat composer's context preview popover lists rules that will be injected into the agent's context. Each rule has a checkbox. The popover merges two sources of "disabled" state:

| Source | Where it lives | Persisted? | Honored at send? |
|---|---|---|---|
| **Filesystem-disabled rules** (Wave 62) | Moved to a "disabled" sibling directory via the rules manager | Yes — global, survives restarts | ✅ Yes — main-process rules layer reads filesystem and skips disabled dir |
| **Locally-disabled rules** | Per-rule checkbox toggles in the popover (`ComposerContextPreview.tsx:137-151`) | No — pure renderer `useState` | ❌ **No — never crosses the IPC boundary** |

When the user sends a message, locally-disabled rules **are still sent to the agent.** The popover toggle is purely cosmetic.

### Verification (2026-05-01)

- `disabledIds` is computed in `ComposerContextPreview.tsx:229` (`useMergedDisabledIds(localIds, fsDisabledRuleIds)`) and passed to `ContextPreview` for display only
- Grep across `src/main/agentChat/` for `disabledIds` returns zero hits — main-process request preparation never sees this state
- `TaskRequest` (`src/shared/types/orchestrationDomain.ts:121-158`) has no field for disabled rule IDs

## Why this matters

This is a **trust-eroding bug.** The UI gives you a checkbox, you toggle it off, you see it visually disabled — and the agent receives the rule anyway. The agent might cite or follow a rule you explicitly turned off, and you'd have no way to tell from the UI that it happened.

This is the *"UI lies, agent acts on stale state"* pattern. It compounds: users stop trusting the affordance, then stop using it, then the disabling capability is dead-by-distrust. Better to fix it before the trust deficit forms.

It's also easy to demo and verify: untick a rule, send a message, watch the agent reference that rule's content. The bug is reproducible and the fix is verifiable.

## Scope

### 1. TaskRequest schema

Add `disabledRuleIds?: string[]` to `TaskRequest` in `src/shared/types/orchestrationDomain.ts`. Types-only, ~3 lines. Format matches the popover's encoding: `rule:<scope>:<name>` strings.

### 2. Renderer — thread `localIds` to send

The popover's `localIds` state (currently in `ComposerContextPreview.tsx`) needs to be hoisted to wherever the send action originates so it can be included in the IPC call.

Likely path:
- `ComposerContextPreview` exposes the active `localIds` upward via a callback prop or shared state hook
- `useAgentChatWorkspace` collects them into the `sendMessage` payload
- `agentChatWorkspaceActions.ts:sendMessage` includes them in the IPC `agentChat:send` call

Behavioral note: the local set should be cleared after send (or persisted per-thread — see "design question" below). Default behavior: clear after send. The toggle is per-message override.

### 3. Main — request preparation honors the field

In `src/main/agentChat/chatOrchestrationRequestSupport.ts` (or wherever rules get assembled into the context — verify the exact site during implementation), read `request.disabledRuleIds` and exclude those IDs when building the rules portion of the packet.

Filesystem-disabled rules continue to be excluded the way they already are (filesystem-driven). The new exclusion is a simple set-difference applied on top.

### 4. Tests

- Renderer test: confirm `localIds` flows into the IPC send call. Mock the IPC bridge, toggle a rule in the popover, send, assert the call's `disabledRuleIds` includes the toggled ID.
- Main test: build a request with `disabledRuleIds: ['rule:project:foo']`, run through the request preparation path, assert the resulting context packet has no rule with that ID.

## Design question worth flagging (decide during implementation)

The current "local disabled" state is purely renderer-side `useState`. It resets when:
- The popover closes and reopens (likely desired UX — toggle is for the open popover session)
- The chat tab is switched and switched back (probably not desired — surprising loss of state)
- The app restarts (fine)

Two reasonable choices:

- **(a) Keep local-only, fix the send path.** Simplest. Toggling lasts for the popover-open lifetime. User explicitly opts-out per-message. Matches "this is a per-send override" mental model.
- **(b) Persist the local-disabled set per-thread.** Treat it like a sticky preference. More work — requires storage decision (localStorage? thread record?). Matches "I always want this rule off in this conversation" mental model.

**Recommendation: ship (a) first.** It fixes the trust-erosion bug at the smallest scope. (b) is a separate UX enhancement to file later if real users surface the ask.

## Risks

| Risk | Mitigation |
|---|---|
| `disabledRuleIds` IPC field gets out of sync with the popover encoding | Single canonical encoding (`rule:<scope>:<name>`) in a shared constant; both ends import |
| Existing tests pass because they don't exercise the popover toggle path | Phase test explicitly asserts the toggle → send → exclusion flow end-to-end |
| User confusion if local-disabled clears on tab switch | Acceptable for (a); if surfacing as a complaint, escalate to (b) |
| Filesystem-disabled rules accidentally double-excluded | Set-difference is idempotent on sets — exclusion of an already-excluded ID is a no-op |

## Out of scope

- **Persistence of local-disabled state across sessions** — option (b) above; future enhancement
- **Per-rule disable in user-facing rules manager UI** — already exists via the filesystem mechanism (Wave 62)
- **Cross-cutting "disable rules system-wide" toggle** — different feature

## References

- `src/renderer/components/AgentChat/ComposerContextPreview.tsx:137-229` — local disabled state, merge with filesystem set, pass to ContextPreview
- `src/renderer/components/AgentChat/ContextPreview.tsx:43,282-336` — display layer (consumes `disabledIds`)
- `src/main/agentChat/chatOrchestrationRequestSupport.ts` — likely site for honoring the new field (verify during implementation)
- `src/shared/types/orchestrationDomain.ts:121-158` — `TaskRequest` shape (needs new field)
- `src/main/rulesAndSkills/CLAUDE.md` — rules layer documentation
- Audit: `roadmap/audit-verification-pass.md` Section D item #15
