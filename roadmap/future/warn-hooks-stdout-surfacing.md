# Warn-class hook decisions surfaced to agent via PreToolUse stdout

**Status:** WAVE-IT — moderate single wave, enabling work for warn-class rules
**Source:** `roadmap/audit-verification-pass.md` Section D item #16 (Wave 50 follow-up)
**Filed:** 2026-05-01

## Summary

The IDE has a hook-enforcement chain (`runPreToolEnforcement` in `src/main/hooksSessionHandlers.ts:38-54`) that evaluates pre-tool-use payloads and returns `pass` / `deny` / `warn` decisions. **Deny works** — the reason is written to stderr and the hook exits 2, blocking the tool. **Warn doesn't** — the message is logged to electron-log on the IDE side and never reaches the agent.

This wave threads warn decisions through to the agent via Claude Code's PreToolUse hook stdout, making warn-class rules actually nudge agent behavior instead of silently logging.

## Why this matters

`warnFullTestSuite` is the prototype for soft-rule enforcement under the rules-as-hooks architecture. Wave 50's thesis was *"convert rules to hooks so they fire deterministically."* That works for deny-class rules (lockfile edits, secrets, minified files) — those already block via stderr. It silently doesn't work for warn-class rules.

Future warn-class candidates that would benefit from the same pipe once it exists:

- *"Editing a file outside the stated task scope"* — scope-creep nudge
- *"About to write to a path that doesn't exist yet"* — typo guard
- *"Bash command with a long-running pattern but no `&` or background flag"* — timeout nudge
- *"Running a destructive operation; consider a dry-run first"* — destructive-op nudge

If the warn channel works, those become single-evaluator additions. If it doesn't, every soft rule has to be either hardcoded into prompts or escalated to a deny — both worse.

## Current state (verified 2026-05-01)

**IDE side** — `runPreToolEnforcement` returns structured decisions:

```ts
// hooksSessionHandlers.ts:48-50
if (decision.kind === 'warn') {
  log.info('[hook-enforce] warn', { rule: decision.ruleName, message: decision.message });
  return decision;
}
```

The decision flows back through the named-pipe approval channel.

**Hook script** — `assets/hooks/pre_tool_use.mjs:105-110`:

```js
if (decision === 'reject') {
  process.stderr.write(reason || 'Rejected by user in Ouroboros IDE');
  process.exit(2);
}
process.exit(0);
```

Only handles reject. Every non-reject decision exits 0 silently.

**Result:** the warn message exists on the IDE side, gets logged once, never crosses back to the agent.

## Scope

### Phase A — Research (~30 min, blocking)

Confirm Claude Code's PreToolUse hook stdout semantics. The wave's correctness depends on whether stdout actually surfaces to the agent.

Tasks:
- Read current Claude Code hook docs for PreToolUse stdout behavior (use `claude-code-guide` agent or context7)
- Spike test: trivial `pre_tool_use.mjs` that writes a known string to stdout. Run a session, observe whether the agent sees it in the tool-result context.
- Decision point:
  - **(a) Stdout surfaces as agent-visible context** → proceed with Phase B as planned
  - **(b) Stdout is captured but not surfaced** → pivot to alternate path (synthetic system message via separate IPC, or different hook event type that does surface)

Do NOT skip this step. The wave's value depends entirely on whether the chosen channel actually reaches the agent. Code-reading-only verification is insufficient — Claude Code hook semantics have evolved across CLI versions.

### Phase B — Protocol extension

Extend the approval-response shape between IDE main and `pre_tool_use.mjs` to carry warn decisions.

Current shape (inferred from `pre_tool_use.mjs`): `{ decision: 'reject' | <other>, reason?: string }`

Proposed shape: `{ decision: 'reject' | 'warn' | <pass>, reason?: string, message?: string }`

Touch points:
- `src/main/approvalManager.ts` (or wherever the approval response file/pipe message is constructed) — emit warn decisions through the same channel currently used for reject
- `assets/hooks/lib/ouroboros.mjs` — `waitForApproval` returns the new shape
- Wave 50 ADR (`roadmap/decisions/wave-50.md`) — note the protocol extension

### Phase C — Hook script warn handling

`assets/hooks/pre_tool_use.mjs` adds a warn branch before the reject check:

```js
if (decision === 'warn' && message) {
  process.stdout.write(message);
  // exit 0 — tool proceeds, but agent sees the message as context
  process.exit(0);
}
```

Important: stdout, not stderr. Stderr is for blocking errors per Claude Code's hook protocol; stdout is for advisory context.

### Phase D — Wire `warnFullTestSuite`

The evaluator already exists and returns `warn` correctly. With Phases B+C complete, it actually nudges. Add an integration test that simulates the full path:
- Mock pre_tool_use payload with `npm test` command
- Run through `runPreToolEnforcement` → assert warn decision
- Run through approval channel → assert response carries warn shape
- Run through `pre_tool_use.mjs` (or simulate its decision-handling logic) → assert stdout contains the warn message

### Phase E — Document the pattern

Brief addition to `docs/hook-migration.md` showing the warn-rule template:

- How to write a new warn evaluator
- The decision shape (`{ kind: 'warn', ruleName, message }`)
- How the message reaches the agent (via PreToolUse stdout)
- When to choose warn vs deny (deny = blocks, warn = advisory)

This template is what unblocks future warn-class rules from being one-off implementations.

## Risks

| Risk | Mitigation |
|---|---|
| Phase A reveals stdout doesn't surface the way we assume | Pivot in the same wave to alternate channel (IPC-injected system message). Don't proceed past Phase A without verification. |
| Existing reject path regresses during protocol extension | Phase B keeps reject handling unchanged; warn is additive. Tests verify both paths. |
| Warn messages flood the agent's context on noisy projects | Each warn evaluator is responsible for being non-noisy. `warnFullTestSuite` only fires on full-suite commands without paths — already targeted. Future evaluators must follow same discipline. |
| Hook script becomes a security surface (untrusted IDE injecting content into agent context) | The IDE is the source of truth for the rules; this isn't external-attacker territory. The agent is already trusting IDE-injected context (CLAUDE.md, rules); warn messages are the same trust boundary. |

## Out of scope

- **Adding new warn rules.** This wave only enables the channel. New warn evaluators are separate small items.
- **Stop/SubagentStop hook stdout surfacing.** Different hook event, different protocol. If needed, separate wave.
- **User-visible warn surfacing in the IDE UI.** The warn message goes to the agent. Whether it ALSO shows in the chat composer / agent monitor is a UI decision out of scope here.
- **Configurable warn-vs-deny escalation thresholds** (e.g., "after 3 ignored warns, escalate to deny"). Future enhancement.

## References

- `src/main/hooks/warnFullTestSuite.ts` — the canonical warn evaluator (returns warn decision; never reaches agent today)
- `src/main/hooksSessionHandlers.ts:31,38-54` — evaluator chain + warn logging
- `src/main/hooks/hookDecision.ts` — `HookDecision` type union
- `assets/hooks/pre_tool_use.mjs` — hook script (handles reject only)
- `assets/hooks/lib/ouroboros.mjs` — IDE↔hook protocol helpers
- `~/.claude/rules/test-scope.md` — the user-facing rule the warn was supposed to enforce
- `docs/hook-migration.md` — rule-to-hook migration guide (needs warn template addition)
- `roadmap/decisions/wave-50.md` — Wave 50 ADR (rule classification)
- Audit: `roadmap/audit-verification-pass.md` Section D item #16
