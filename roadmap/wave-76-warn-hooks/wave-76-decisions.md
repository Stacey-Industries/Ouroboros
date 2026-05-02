# Wave 76 — Warn Hooks Stdout Surfacing: ADR

**Wave:** 76  
**Slug:** warn-hooks  
**Date:** 2026-05-02

---

## Decision 1: Phase A Research Outcome — Hook Stdout Protocol

**Context:** The source plan assumed plain `process.stdout.write(message)` in `pre_tool_use.mjs` would surface as agent-visible context when exit code is 0. Phase A required verifying this before implementing Phase B-E.

**Research method:** Context7 queries against `/anthropics/claude-code` and `/zebbern/claude-code-guide` documentation.

**Finding:** Claude Code PreToolUse hooks surface agent-visible context via **structured JSON stdout**, not plain text. The correct protocol for an advisory warn (tool proceeds, agent sees message) is:

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow"
  },
  "systemMessage": "Warning message for Claude"
}
```

Key protocol facts:
- `systemMessage` in JSON stdout IS surfaced to Claude as agent-visible context (confirmed by docs).
- Plain stdout text (non-JSON) is NOT guaranteed to surface.
- `permissionDecision: "allow"` + `systemMessage` is the correct shape for "proceed but warn".
- `permissionDecision: "deny"` + stderr exit 2 is for blocking (existing `reject` path).
- The old `decision: 'reject'` / `reason` shape is deprecated but still supported.

**Path taken:** Path (a) — stdout DOES surface as agent-visible context, but via structured JSON `systemMessage`, not plain text.

**Pivot from source plan:** Phase C changes from `process.stdout.write(message)` (plain text) to `process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' }, systemMessage: message }))` (structured JSON). This is the only behavioral change from the plan; the overall architecture (Phases B-E) is unchanged.

**Pick:** Structured JSON stdout with `systemMessage` — industry-standard Claude Code hook protocol.

**Rationale:** Plain text stdout is unreliable across Claude Code CLI versions; structured JSON is the documented and stable surface.

**Consequences:** The `waitForApproval` function in `ouroboros.mjs` returns `{ decision, reason }`. The hook script now needs to also carry a `message` field through the approval channel for the warn case. The `ApprovalResponse` type in `approvalManager.ts` needs a `message?: string` field.

---

## Decision 2: Protocol Extension Shape

**Context:** The approval channel (`approval.wait` over ouroboros-tools pipe) currently returns `{ decision: 'approve' | 'reject', reason?: string }`. Warn decisions need to carry a message back to the hook script.

**Pick:** Extend `ApprovalResponse` with `message?: string`. The hook script reads `result.message` for the warn branch.

**Rationale:** Minimal addition. Existing `reason` field is for user-facing text; `message` is agent-facing text. Keeping them separate preserves the semantic distinction.

**Consequences:** `approvalManager.ts`, `approvalWaiterRegistry.ts` need the extended type. `hooks.ts` / `hooksSessionHandlers.ts` must propagate warn message through approval resolution.

---

## Decision 3: Warn vs Deny in Hook Script

**Context:** The `pre_tool_use.mjs` currently has a single branch: reject → stderr + exit 2. Pass → exit 0 silently. Warn needs a third branch.

**Pick:** Warn branch outputs JSON stdout with `systemMessage`, then exits 0. Tool proceeds; agent sees the advisory.

**Order in hook script:** Warn check BEFORE reject check. This is additive — the reject path is unchanged.

**Rationale:** Exit 0 preserves existing "tool proceeds" semantics. JSON stdout with `systemMessage` is the documented Claude Code mechanism for surfacing advisory text to the agent.

---

## Decision 4: Integration Test Scope (Phase D)

**Context:** The test should cover the full path from evaluator → approval channel response → hook script stdout.

**Pick:** Two-level test:
1. Unit: `runPreToolEnforcement` with an `npm test` payload → assert `{ kind: 'warn', ruleName: 'test-scope', message: '...' }`.
2. Integration-lite: mock the approval channel response shape (`{ decision: 'approve', message: '...' }`) and assert the hook script's decision-handling logic would write the correct JSON to stdout.

**Rationale:** Full end-to-end test requires a live Claude Code session and pipe server — too heavy for CI. The two-level approach covers the evaluator contract and the protocol extension shape without spawning processes.
