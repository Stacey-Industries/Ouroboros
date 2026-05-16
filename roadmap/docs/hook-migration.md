# Hook Migration — Wave 50

This guide explains how four prompt-level rules became deterministic PreToolUse hooks in Wave 50, how to disable a misfiring hook, how to escalate a warning to a block, and how to roll the wave back if needed.

If you only need the rollback path, jump to [Rollback](#rollback).

---

## What changed in Wave 50

Before Wave 50, every Claude Code session in this repo loaded ~10–11k tokens of rules from `~/.claude/rules/` and `.claude/rules/`. A meaningful slice of those rules were "remember to do X" / "don't do Y" — the canonical use case for a deterministic harness hook.

Wave 50 converted four of them to PreToolUse hooks that the harness enforces before the model ever sees the tool call:

- `no-secrets.md` → `blockSecretWrites`
- `lockfiles.md` → `blockLockfileEdits`
- `no-minified.md` → `blockMinifiedOperations`
- `test-scope.md` → `warnFullTestSuite` (warn, not block — see below)

Two further rules — `init-safety.md` and `project-claude-md-template.md` — moved to slash commands (`/init-safety`, `/claudemd`) so they only consume tokens when invoked. Original rule files remain in place for one wave of soak; deletion is a follow-up after Wave 51.

**Token cost.** Preliminary estimates from `roadmap/wave-50-plan.md`: ~600–1,200 tokens saved immediately from the four hook conversions, and an additional ~1,800 tokens once the slash-command-only rules are deleted. Real numbers will be measured at wave close from session header diffs.

For the full classification of all 23 rules (14 global + 9 project), see `roadmap/wave-50-rule-classification.md`.

---

## The hook stack

Every PreToolUse event flows through `runPreToolEnforcement` in `src/main/hooksSessionHandlers.ts`. Evaluators run in order; the first non-pass decision wins (deny short-circuits and blocks; warn surfaces a message to the agent via PreToolUse stdout but does not block — see [Adding a new warn evaluator](#adding-a-new-warn-evaluator)).

| Rule          | Hook file                                  | Trigger                                            | Decision | Allowlist                              |
|---------------|--------------------------------------------|----------------------------------------------------|----------|----------------------------------------|
| `no-secrets`  | `src/main/hooks/blockSecretWrites.ts`      | Write/Edit/MultiEdit on `.env*`                    | deny     | `.env.sample`, `.env.example`, `.env.template` |
| `lockfiles`   | `src/main/hooks/blockLockfileEdits.ts`     | Write/Edit/MultiEdit on lockfiles                  | deny     | none — use the package manager command |
| `no-minified` | `src/main/hooks/blockMinifiedOperations.ts`| Read/Edit/MultiEdit/Write on `*.min.{js,mjs,css}`  | deny     | none — find the source file            |
| `test-scope`  | `src/main/hooks/warnFullTestSuite.ts`      | Bash command starting with `npm test`, `npx vitest run`, etc. without a path arg | warn | scoped path arg silences the warning |

Each hook reads the `hooks.enforcedRules` array from config before deciding. A rule whose name is absent from that array is a no-op for the session.

Lockfiles covered: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`.

Bash commands matched by `warnFullTestSuite`: `npm test`, `npm run test`, `npx vitest run`, `npx jest`, `pnpm test`, `pnpm run test`, `yarn test`. A trailing path argument (anything containing `/`, `\`, `.test.`, `.spec.`, or a dot-segment) silences the warning.

---

## Disabling a misfiring hook

Each hook is gated on the `hooks.enforcedRules` array in the user's electron-store config. The default set is:

```json
{
  "hooks": {
    "enforcedRules": ["no-secrets", "lockfiles", "no-minified", "test-scope"]
  }
}
```

To disable a single hook, remove its rule name from the array. The config schema lives in `src/main/configSchemaTailExt.ts`; the renderer-facing path is `Settings → Hooks` once the UI surfaces this (today it's config-only — see Wave 50 follow-ups in `roadmap/HANDOFF.md`).

### Recovery if a hook blocks legitimate work

1. The agent's last tool call surfaces the deny message verbatim — it names the file and the rule.
2. Apply the workaround the message suggests (e.g. for lockfiles, run `npm install` instead of editing the lockfile directly; for `.env`, populate the value via the user).
3. If the deny is genuinely a false positive, edit the config to remove the rule from `enforcedRules` and retry. File a follow-up to either tighten the hook's pattern or move the case to its allowlist.

The hooks deliberately have no global kill switch besides `enforcedRules: []`. Each rule is opt-in/opt-out individually.

---

## Adding a new warn evaluator

Wave 76 wired the warn channel end-to-end. `warnFullTestSuite` is now the reference implementation. When a warn fires:

1. `runPreToolEnforcement` returns `{ kind: 'warn', ruleName, message }`.
2. `resolveEnforcementResponse` maps this to `{ decision: 'approve', message }`.
3. `pre_tool_use.mjs` detects `decision === 'approve' && message` and writes structured JSON to stdout:
   ```json
   { "hookSpecificOutput": { "permissionDecision": "allow" }, "systemMessage": "<message>" }
   ```
4. Claude Code surfaces `systemMessage` as agent-visible context. The tool proceeds (no block).

### Warn evaluator template

```typescript
// src/main/hooks/warnMyRule.ts
import type { HookPayload } from '../hooks';
import { type HookDecision, PASS } from './hookDecision';

const RULE_NAME = 'my-rule';

export function evaluatePreToolUse(payload: HookPayload): HookDecision {
  if (payload.type !== 'pre_tool_use') return PASS;
  // ... condition check ...
  return { kind: 'warn', ruleName: RULE_NAME, message: 'Advisory text for the agent.' };
}
```

Register it in `EVALUATORS` in `hooksSessionHandlers.ts` and add the rule name to `hooks.enforcedRules` in the config schema default.

### When to choose warn vs deny

- **deny** — blocks the tool call. Use when the operation is unconditionally wrong (editing a lockfile, writing secrets). The message is shown to the agent and execution stops.
- **warn** — tool proceeds; agent sees advisory context. Use when the operation has legitimate exceptions that a hard block would interfere with (e.g. `test-scope`: running the full suite is correct at wave close, wrong during implementation).

### Escalating a warning to a block

Change the evaluator to return `{ kind: 'deny', ... }` instead of `warn`. The rest of the pipeline (approval channel, hook script) already handles `deny` correctly. Update any tests asserting the warn path.

For `test-scope` this is intentionally NOT done — the rule has legitimate full-suite cases (pre-commit, wave close, user-requested runs) that a strict block would interrupt.

---

## Slash command soft migration

Wave 50 created two slash commands at `~/.claude/commands/`:

- `/init-safety` — pre-flight checks before generating a project's `CLAUDE.md` (directory-type detection, existing-file backup, stale-artifact check)
- `/claudemd` — canonical structure and style guide for authoring a project-level `CLAUDE.md`

The original rule files at `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md` are intentionally kept in place for one wave of soak. Deletion is a follow-up after Wave 51 confirms `/init-safety` and `/claudemd` invocations are clean. See `roadmap/HANDOFF.md` for the follow-up note.

---

## Graph-first decision

Phase D analyzed 378 session JSONLs (174 sessions with at least one Grep/Read call) and measured **93.9% adherence** to graph-first routing — well above the 70% "stay log-only" threshold. The decision is to **not** ship enforcement; the `hooks.enforceGraphFirst` config flag exists (default `false`) but the corresponding decideEnforcement code is not wired.

The `analyze-graph-adherence.ts` script was removed in 2026-05 (Wave 50 quarterly re-run was closed as superseded — live router signals from Wave 53 telemetry restoration replace the periodic corpus-run model). Historical analysis remains at `roadmap/_archived/wave-50-graph-adherence.md`; the 70%-adherence threshold is preserved here as the original decision rationale.

---

## Rollback

Reverting Wave 50 does not require code changes. Three steps to disable everything the wave introduced at runtime:

1. **Disable all four hooks.** Edit the user's electron-store config so `hooks.enforcedRules` is `[]`:

   ```json
   { "hooks": { "enforcedRules": [] } }
   ```

   Restart the IDE. All four evaluators will short-circuit to `pass` for every event. The slash commands have no behavior to roll back — they only inject content when invoked.

2. **No rule-file deletions to undo.** The Phase C soft migration intentionally left `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md` in place. The slash commands are additive; the original rule prose is still loaded into every session's context.

3. **Code rollback (only if needed).** The Phase B hooks are isolated to `src/main/hooks/block*.ts` and `warnFullTestSuite.ts`, plus the dispatch in `hooksSessionHandlers.ts`. `git revert` of the Phase B commit removes them cleanly. The integration test added in Phase E will need to be reverted alongside.

---

## Cross-references

- `roadmap/wave-50-plan.md` — full implementation plan
- `roadmap/wave-50-rule-classification.md` — Phase A audit of all 23 rules
- `roadmap/wave-50-graph-adherence.md` — Phase D adherence analysis and decision
- `src/main/hooksSessionHandlers.ts` — `runPreToolEnforcement` orchestration
- `src/main/hooks/hookStack.integration.test.ts` — integration coverage for the four hooks
