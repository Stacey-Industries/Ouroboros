# Wave 76 — Warn Hooks Stdout Surfacing: Result Brief

**Branch:** `wave-76-warn-hooks`  
**Commits:** 1  
**Date:** 2026-05-02  
**Status:** Complete

---

## What shipped

Warn-class hook decisions (previously logged on the IDE side and never reaching the agent) now surface to the agent via Claude Code's PreToolUse hook stdout protocol.

### Files changed

| File | Change |
|---|---|
| `src/main/approvalManager.ts` | `ApprovalResponse` extended with `message?: string` |
| `src/main/hooksSessionHandlers.ts` | `resolveEnforcementResponse()` added — maps HookDecision to ApprovalResponse in one call; import sorted |
| `src/main/hooks.ts` | `handleApprovalRequest` simplified to call `resolveEnforcementResponse`; stays under 300-line ESLint ceiling |
| `assets/hooks/lib/ouroboros.mjs` | `waitForApproval` returns `{ decision, reason, message }` — 3-arg `finish` throughout |
| `assets/hooks/pre_tool_use.mjs` | Extracts `message` from both pipe path and file-poll fallback; warn branch writes structured JSON stdout |
| `src/main/hooks/warnHooksStdout.test.ts` | 8 new tests covering evaluator → enforcement → approval response shape → stdout JSON |
| `docs/hook-migration.md` | Stale section replaced with warn evaluator template + warn-vs-deny guidance |
| `roadmap/wave-76-warn-hooks/wave-76-decisions.md` | ADR capturing Phase A research outcome and protocol decisions |

---

## Phase A outcome: Path (a)

**Claude Code hook stdout DOES surface as agent-visible context, via structured JSON.**

Research via Context7 (`/anthropics/claude-code`, `/zebbern/claude-code-guide`) confirmed:

```json
{
  "hookSpecificOutput": { "permissionDecision": "allow" },
  "systemMessage": "<advisory message>"
}
```

`systemMessage` in JSON stdout is the documented Claude Code mechanism for surfacing agent-visible context from a hook. Plain `process.stdout.write(text)` is NOT guaranteed to surface.

**Pivot from source plan:** Phase C changed from `process.stdout.write(message)` (plain text, plan's assumption) to `process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' }, systemMessage: message }))` (structured JSON, documented protocol). No architectural pivot needed — overall Phases B-E proceeded as written.

---

## Key design decisions

1. **`resolveEnforcementResponse` helper** — moves deny/warn branching out of `hooks.ts` into `hooksSessionHandlers.ts` where the evaluators live. Keeps `hooks.ts` under the 300-line ESLint ceiling.
2. **`message` not `reason`** — `reason` is the existing user-facing field on `ApprovalResponse`; `message` is the new agent-facing field. Kept separate to preserve semantic distinction.
3. **Warn branch before reject check** — in `pre_tool_use.mjs`, the warn check (`decision === 'approve' && message`) runs before the reject check. Additive; reject path unchanged.
4. **File-poll fallback also carries message** — the older `~/.ouroboros/approvals/{requestId}.response` polling path now reads `resp.message` too, so warn surfacing works even when the ouroboros-tools pipe is unavailable.

---

## Test coverage

- 8 new tests in `src/main/hooks/warnHooksStdout.test.ts` — all passing
- Existing `hooksDispatchLogic.test.ts` — 26 tests, all passing
- Full typecheck: clean
- Full ESLint on touched files: clean

---

## Not in scope (confirmed out)

- New warn evaluators beyond `warnFullTestSuite` (channel-enabling only)
- Stop/SubagentStop hook stdout surfacing
- User-visible warn display in IDE UI
- Configurable warn-vs-deny escalation thresholds

---

## Observation point

This wave is `Internal — no user-observable surface`. The change surfaces advisory text to the agent (Claude Code CLI) via hook stdout. Whether the agent acts on it is behavior-dependent, not a UI fixture. The channel is now wired; `warnFullTestSuite` now actually nudges rather than silently logging.

Manual smoke gate: N/A — not UI-bearing.
