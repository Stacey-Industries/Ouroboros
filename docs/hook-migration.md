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

Every PreToolUse event flows through `runPreToolEnforcement` in `src/main/hooksSessionHandlers.ts`. Evaluators run in order; the first non-pass decision wins (deny short-circuits; warn is logged and returned but does not block today — see [Escalating a warning to a block](#escalating-a-warning-to-a-block)).

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

To disable a single hook, remove its rule name from the array. The config schema lives in `src/main/configSchemaTailExt.ts`; the renderer-facing path is `Settings → Hooks` once the UI surfaces this (today it's config-only — see Wave 50 follow-ups in `roadmap/session-handoff.md`).

### Recovery if a hook blocks legitimate work

1. The agent's last tool call surfaces the deny message verbatim — it names the file and the rule.
2. Apply the workaround the message suggests (e.g. for lockfiles, run `npm install` instead of editing the lockfile directly; for `.env`, populate the value via the user).
3. If the deny is genuinely a false positive, edit the config to remove the rule from `enforcedRules` and retry. File a follow-up to either tighten the hook's pattern or move the case to its allowlist.

The hooks deliberately have no global kill switch besides `enforcedRules: []`. Each rule is opt-in/opt-out individually.

---

## Escalating a warning to a block

Today `warnFullTestSuite` returns a `warn` decision that:

- The IDE main process logs at `info` level (`[hook-enforce] warn`).
- The harness wire (`assets/hooks/pre_tool_use.mjs`) does NOT forward to stdout, so the agent does not currently see the warning text.

To make a warning agent-visible, two steps:

1. Update `assets/hooks/pre_tool_use.mjs` to write the warn message to stdout when `decision.kind === 'warn'`. Today the script only writes a permission decision when `kind === 'deny'`. A warn-stdout branch would surface the message as additional context for the model on the next turn.
2. (Optional) Promote the warn to a deny by changing the evaluator to return `{ kind: 'deny', ... }`. This is appropriate when the data shows the warning is repeatedly ignored. For `test-scope` this is intentionally NOT done today — the rule has legitimate exceptions (pre-commit, wave close, user-requested full runs) that a strict block would interfere with.

If you escalate, update the integration test at `src/main/hooks/hookStack.integration.test.ts` — the warn-path assertions there will start failing, which is the intent.

---

## Slash command soft migration

Wave 50 created two slash commands at `~/.claude/commands/`:

- `/init-safety` — pre-flight checks before generating a project's `CLAUDE.md` (directory-type detection, existing-file backup, stale-artifact check)
- `/claudemd` — canonical structure and style guide for authoring a project-level `CLAUDE.md`

The original rule files at `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md` are intentionally kept in place for one wave of soak. Deletion is a follow-up after Wave 51 confirms `/init-safety` and `/claudemd` invocations are clean. See `roadmap/session-handoff.md` for the follow-up note.

---

## Graph-first decision

Phase D analyzed 378 session JSONLs (174 sessions with at least one Grep/Read call) and measured **93.9% adherence** to graph-first routing — well above the 70% "stay log-only" threshold. The decision is to **not** ship enforcement; the `hooks.enforceGraphFirst` config flag exists (default `false`) but the corresponding decideEnforcement code is not wired.

Re-run `npx tsx scripts/analyze-graph-adherence.ts` quarterly. If adherence drops below 70%, revisit the decision. Full analysis at `roadmap/wave-50-graph-adherence.md`.

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
