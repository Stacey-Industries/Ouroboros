# Wave 50 — Rule-to-Hook Migration
## Implementation Plan (DRAFT)

**Version target:** v2.7.2 (patch — shift enforcement from prompt to deterministic hooks)
**Feature flags:** new `hooks.enforcedRules` array (default includes converted rules), new `hooks.enforceGraphFirst` (default `false`, flip on once Wave 48 telemetry is in)
**Dependencies:** Wave 48 (telemetry), Wave 49 (claude-md-size lint wired)
**References:**
- `~/.claude/rules/*.md` (global rules, user config)
- `C:\Web App\Agent IDE\.claude\rules\*.md` (project rules)
- `src/main/hookInstaller.ts`
- `src/main/hookInstallerCommands.ts`
- `src/main/hooks/graphUsageLogger.ts` (from Wave 48)

---

## Overview

The user's session baseline includes:

- **~6.5k tokens** from global `~/.claude/CLAUDE.md` + 12 rule files, loaded into every session as "Memory files"
- **~3.5k tokens** from project `CLAUDE.md` + 9 `.claude/rules/*.md` files
- **Total: ~10k tokens of rules in every session**

Many of those rules are "remember to do X" / "don't do Y" instructions. That's exactly the use case for `PreToolUse` hooks — deterministic enforcement at the harness level costs 0 tokens in context and has 100% adherence vs. model judgment.

Analysis shows ~40–60% of the current rule surface is hook-convertible:

| Rule | Token cost | Convertible? | Conversion path |
|---|---|---|---|
| `no-secrets.md` | 122 | YES | `PreToolUse` block on writes to `.env*` |
| `lockfiles.md` | 131 | YES | `PreToolUse` block on edits to `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` |
| `no-minified.md` | 96 | YES | `PreToolUse` block on reads/edits of `*.min.*` |
| `test-scope.md` | 386 | PARTIAL | `PreToolUse` warn on `npm test` without path args |
| `graph-tool-routing.md` | 958 | PARTIAL | Block half via Wave 48's graph-first hook (once enforcing), keep the "when to use" half as rule |
| `init-safety.md` | 897 | NO — slash command | Move to `/init` command content, load on invocation |
| `project-claude-md-template.md` | 914 | NO — slash command | Move to new `/claudemd` command, load on invocation |
| `debug-before-fix.md` | 750 | NO | Process rule, stays as rule |
| `context7.md` | 431 | NO | Judgment-based "when to research", stays as rule |
| `frontend-design.md` | 540 | NO | Subjective quality, stays as rule |
| `research-before-implementing.md` | 595 | NO | Inference-triggered, stays as rule |
| `agent-model-selection.md` | 156 | NO | Meta-instruction, stays as rule |
| Project rules (9 files, total ~3k) | ~3000 | PARTIAL | Case-by-case classification |

**Potential savings: ~2,500–3,500 tokens from every session** once hookable rules move and slash-commandable rules relocate.

Wave 50 also depends on Wave 48 having shipped telemetry. If the graph-usage logger shows agents routinely reach for Grep/Read on symbol queries despite the binding CLAUDE.md paragraph, the graph-first hook flips from log-only to enforcing. If adherence is already high, we skip enforcement — data decides.

---

## Implementation review summary

### Confirmed state

- Hook infrastructure from Wave 48 is in place: `hookInstallerCommands.ts:12-33` maps PascalCase events to shell commands, `hooksSessionHandlers.ts` routes received events to handler modules.
- `~/.claude/hooks/generic_hook.ps1` / `.sh` pipes events to the installed handler by `--type` wire name.
- `graphUsageLogger.ts` (from Wave 48) demonstrates the log-only pattern: receive PreToolUse, classify, write JSONL.
- No existing `PreToolUse` handler actually blocks/denies tool calls today — Wave 48 only logs.
- Slash commands live in `~/.claude/commands/` (global) and `.claude/commands/` (project). The init-safety and claudemd-template content could be turned into commands Claude Code loads only when invoked.

### Gaps this wave closes

- **Hook-shaped rules are paying prompt tokens for no deterministic value.** A "don't edit lockfiles" rule loaded on every session is strictly worse than a hook that blocks the attempt.
- **No slash-command conversion pattern for rules that only matter during specific invocations.**
- **No tooling for migrating a rule to a hook safely with a rollback path.**
- **Graph-first enforcement depends on data that didn't exist pre-Wave-48.** Decision should be telemetry-driven.

---

## Scope

### In-scope

- Classify all 14 global + 9 project rules into `keep` / `hook` / `slash-command` / `delete`.
- Implement hooks for the 4 clear conversions: `no-secrets`, `lockfiles`, `no-minified`, `test-scope`.
- Create `/init` and `/claudemd` slash commands containing `init-safety.md` and `project-claude-md-template.md` content.
- Remove the migrated rule files from always-loaded space (with user confirmation).
- Evaluate Wave 48 telemetry → decide on graph-first enforcement.
- If enforcing: graduate `graphUsageLogger` from logging to blocking (with clear error message on block).
- Integration tests for every hook's block path.
- Migration guide: how to roll back a hook if it misfires.

### Out-of-scope

- Project-level rules that aren't clear hook candidates — classify but don't convert this wave.
- Writing new rules unrelated to enforcement.
- Regenerating CLAUDE.mds (Wave 49).
- Any CodeMode work (Wave 51).

---

## Verified starting point

Reusable:

- Wave 48's hook handler pattern in `graphUsageLogger.ts`.
- `hookInstallerCommands.ts` event routing table.
- `hooksSessionHandlers.ts` dispatch layer.
- `~/.claude/hooks/generic_hook.ps1` / `.sh` wire.
- Slash command discovery in Claude Code CLI (project + global).

Explicitly targeted:

- Hook handlers for 4 converted rules.
- Slash-command-shaped docs for 2 converted rules.
- Removal flow for migrated rule files.
- Telemetry-driven decision for graph-first enforcement.
- Migration rollback docs.

---

## Architecture

```text
today (pre-50)
 ├─ every session
 │    ├─ loads ~/.claude/CLAUDE.md (1.1k)
 │    ├─ loads 13 ~/.claude/rules/*.md (~6.5k)
 │    ├─ loads 9 .claude/rules/*.md (~3.5k)
 │    └─ agent has to remember + follow rules via judgment
 └─ wide variance in rule adherence

post-50
 ├─ every session
 │    ├─ loads leaner rule set (~7k saved from non-critical rules)
 │    └─ deterministic hooks enforce what was previously prompted
 ├─ PreToolUse hooks
 │    ├─ blockSecretWrites        (replaces no-secrets.md)
 │    ├─ blockLockfileEdits       (replaces lockfiles.md)
 │    ├─ blockMinifiedOperations  (replaces no-minified.md)
 │    ├─ warnFullTestSuite        (partial replacement of test-scope.md)
 │    └─ enforceGraphFirst        (graduated from log-only if telemetry supports)
 └─ slash commands
      ├─ /init        (contains init-safety content, loads only on invocation)
      └─ /claudemd    (contains template content, loads only on invocation)
```

**Key design calls:**

- Hooks that block must emit clear, actionable error messages. "Denied: lockfile edits must use the package manager" beats "permission_denied: lockfile".
- Slash commands must reference the rule content in their body so invoking the command still gives the agent the rule.
- Telemetry must drive the graph-first enforcement decision. If Wave 48 data shows 60%+ adherence to the soft rule, don't ship enforcement — friction without justification.
- Every hook needs a way to disable it via config — friction surfaces we can't predict should be recoverable without a patch release.

---

## Phase A — Rule classification audit

**Goal:** Produce a complete, reviewed classification of all 23 rules with explicit keep/hook/slash-command/delete reasons.

### New files

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-50-rule-classification.md` | ~400 | Full audit: every rule, current token cost, proposed disposition, reason. Human-reviewable before implementation. |

### Modified files

None this phase — pure analysis.

### Subagent briefing

- **Read first:** all files under `~/.claude/rules/*.md` and `.claude/rules/*.md`.
- For each rule, fill in a row:
  - File path
  - Token cost (use `/context` numbers or measure)
  - What it enforces
  - Would a hook handle the case deterministically? If yes, what event + what check?
  - Is it a slash-command candidate (only matters when X is invoked)?
  - If staying as rule, why?
- Be skeptical. "Might be useful for judgment" is weak justification for paying tokens every session.
- `graph-tool-routing.md` needs a split decision — the routing table stays as rule, the "don't Grep for X" moves to hook.

### Acceptance

- [ ] Classification doc covers all 23 rules.
- [ ] Every "hook" entry has a concrete event + check specified.
- [ ] Every "slash-command" entry has a command name proposed.
- [ ] Human review confirms classification before Phase B begins.
- [ ] Commit: `docs(wave-50): Phase A — rule classification audit`

---

## Phase B — Hook implementations

**Goal:** Ship the 4 clear hook conversions with clean block messages.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/blockSecretWrites.ts` | ~180 | PreToolUse handler: inspects Write/Edit args for `.env*` patterns. Emits deny with message "refusing to edit `.env` files — if a secret is needed, add a placeholder and ask the user." |
| `src/main/hooks/blockSecretWrites.test.ts` | ~140 | Fixture tests: allowed vs denied paths, edge cases (`.env.sample` allowed, `.env.local` denied). |
| `src/main/hooks/blockLockfileEdits.ts` | ~180 | PreToolUse handler: denies Write/Edit on `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`. |
| `src/main/hooks/blockLockfileEdits.test.ts` | ~140 | Same shape. |
| `src/main/hooks/blockMinifiedOperations.ts` | ~160 | PreToolUse handler: denies Read/Edit on `*.min.js`, `*.min.css`. |
| `src/main/hooks/blockMinifiedOperations.test.ts` | ~120 | Same shape. |
| `src/main/hooks/warnFullTestSuite.ts` | ~160 | PreToolUse handler: matches `npm test` / `npm run test` without path args, emits warning (not block). |
| `src/main/hooks/warnFullTestSuite.test.ts` | ~140 | Same shape. |

### Modified files

| File | Change |
|---|---|
| `src/main/hookInstallerCommands.ts` | Ensure `PreToolUse` wire is routed to handler dispatch. |
| `src/main/hooksSessionHandlers.ts` | Dispatch table routes to the 4 new handlers based on `tool_name`. |
| `src/main/configSchemaTail.ts` | Add `hooks.enforcedRules: string[]` with defaults. Allow user to disable individual hooks via config. |

### Subagent briefing

- **Read first:** Wave 48's `graphUsageLogger.ts` for pattern. `hookInstallerCommands.ts` for wire format.
- Deny messages are agent-facing. Be prescriptive: "refusing to edit X — do Y instead."
- `.env.sample` and `.env.example` must be explicitly allowed. Block only `.env*` files that are real secret containers.
- Full-test-suite warning is not a block — just emits a warning in the hook output so the agent sees it. This pattern is weaker than deny; if telemetry shows the warning is ignored, consider escalating.
- Each hook MUST respect `hooks.enforcedRules` config — user can disable specific hooks by name.

### Acceptance

- [ ] Writing to `.env.local` is denied with actionable message.
- [ ] Writing to `.env.sample` is allowed.
- [ ] Editing `package-lock.json` is denied.
- [ ] Reading `foo.min.js` is denied.
- [ ] `npm test` with no path arg emits warning.
- [ ] `npm test src/main/foo.test.ts` passes without warning.
- [ ] Each hook can be disabled by removing from `hooks.enforcedRules`.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-50): Phase B — hook implementations for 4 converted rules`

---

## Phase C — Slash command conversions

**Goal:** Move `init-safety.md` and `project-claude-md-template.md` out of always-loaded space.

### New files

| File | ~Lines | Description |
|---|---|---|
| `~/.claude/commands/init.md` | ~220 | `/init` slash command — contains `init-safety.md` pre-flight checks + the current `/init` behavior. Loads only when invoked. |
| `~/.claude/commands/claudemd.md` | ~240 | `/claudemd` slash command — contains the project CLAUDE.md authoring template content. Loads only when invoked. |

### Modified files

| File | Change |
|---|---|
| `~/.claude/rules/init-safety.md` | Keep as historical reference if desired, but remove from always-loaded by deleting/moving. User confirms before removal. |
| `~/.claude/rules/project-claude-md-template.md` | Same. |
| `~/.claude/CLAUDE.md` | Add one-line pointers: "For `/init`, see the command; for authoring CLAUDE.md, see `/claudemd`." |

### Subagent briefing

- **Read first:** existing slash commands under `~/.claude/commands/` for format.
- **USER CONFIRMATION REQUIRED** before deleting/moving any file in `~/.claude/` — these are user config.
- Slash command body should be self-contained — when invoked, Claude Code treats the body as additional context for that invocation only.
- Both commands should still capture all behavior currently in the rule — moving content, not losing it.

### Acceptance

- [ ] `/init` slash command exists and contains init-safety content.
- [ ] `/claudemd` slash command exists and contains template content.
- [ ] Rule files removed from always-loaded (with user confirmation).
- [ ] Baseline session token count drops by ~1.8k (measure via `/context` before/after).
- [ ] Commit: `feat(wave-50): Phase C — slash command conversions for init and claudemd`

---

## Phase D — Graph-first enforcement decision

**Goal:** Look at Wave 48 telemetry and decide whether to graduate the graph-first hook from log-only to blocking.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-graph-adherence.ts` | ~200 | Reads `~/.ouroboros/telemetry/graph-usage.jsonl`, computes: % of symbol-shaped Grep/Read calls that had graph tools loaded, distribution of agent adherence. Outputs decision report. |

### Modified files

| File | Change |
|---|---|
| `src/main/hooks/graphUsageLogger.ts` | **Only if telemetry supports**: graduate to blocking mode behind `hooks.enforceGraphFirst` flag. Keep logging. |
| `src/main/configSchemaTail.ts` | Add `hooks.enforceGraphFirst: boolean` — default `false`. Flip based on Phase D analysis. |
| `CLAUDE.md` (project root) | Update graph-first paragraph to "will be blocked" if enforcement is on, leave as "MUST" if not. |

### Subagent briefing

- **Read first:** Wave 48's `graphUsageLogger.ts`, a sample of `graph-usage.jsonl`.
- Decision criteria:
  - If <40% adherence to the soft rule → enforcement is justified. Ship blocking.
  - If 40–70% → borderline. Ship blocking with a liberal allowlist (literal string searches, file-existence Bashes).
  - If >70% → soft rule is working. Don't ship enforcement; reduce friction.
- If shipping blocking, error message MUST tell the agent exactly which graph tool to use instead. "use `search_graph` for symbol queries" not "use graph tools".
- Enforcement is off-by-default even if shipped — flip the flag in a separate commit after soak.

### Acceptance

- [ ] Telemetry analysis produces a decision report.
- [ ] If enforcement ships: blocking handler + flag + doc update.
- [ ] If enforcement doesn't ship: decision documented, wave still completes.
- [ ] Commit: `feat(wave-50): Phase D — graph-first enforcement decision`

---

## Phase E — Integration, migration guide, telemetry

**Goal:** Verify the full hook stack, document rollback, close the wave.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/hookStack.integration.test.ts` | ~280 | Exercises all 4 block hooks + optional graph-first blocker + slash command invocation. Asserts deny paths and allow paths. |
| `docs/hook-migration.md` | ~200 | How rules became hooks, how to roll back a misfiring hook (disable via `hooks.enforcedRules`), how to escalate a warning to a block. |

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` (project root) | Update "Known Issues / Tech Debt" to reflect rule cleanup. |
| `docs/architecture.md` | Point at new hook stack doc. |
| `roadmap/session-handoff.md` | Record follow-ups (project rule migrations not done this wave). |

### Acceptance

- [ ] Integration test covers all hook block paths.
- [ ] Migration guide is complete.
- [ ] Baseline token cost measurably lower (session `/context` shows Memory files down by ~2k).
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-50): Phase E — integration and migration guide`

---

## Subagent execution model

- **Model:** `sonnet`
- **Isolation:** sequential on `master`
- **Test policy:** scoped vitest per phase; parent runs full suite at wave close
- **Lint policy:** no relaxations
- **Commit policy:** one per phase; Phase C may require confirmation commit from user for rule file removals
- **Scope discipline:** do NOT convert rules flagged as `keep` in Phase A. Do NOT touch CLAUDE.md content.

### Phase dispatch order

1. **Phase A** — classification audit (foundation, requires user review before B)
2. **Phase B** — hook implementations (parallel-safe with C)
3. **Phase C** — slash command conversions (parallel-safe with B; requires user confirmation)
4. **Phase D** — graph-first enforcement decision (depends on Wave 48 soak)
5. **Phase E** — integration and docs

---

## Risks

| Risk | Mitigation |
|---|---|
| A hook blocks a legitimate operation. | Every hook respects `hooks.enforcedRules` — user can disable individually. Migration guide documents rollback. |
| Slash command removal breaks someone's muscle memory. | Keep rule files in place for 1 wave before deletion. Pointer in `~/.claude/CLAUDE.md` tells agent where content moved. |
| Graph-first enforcement fires on false positives (literal searches). | Liberal allowlist for literal patterns. Telemetry continues even when enforcing so we can measure over-block rate. |
| Classification audit misses a rule that actually should be hooked. | Human review gate between Phase A and B. If a rule is reclassified, it gets added to the next wave — not retrofitted mid-wave. |
| User disables all hooks, reverting to pre-50 behavior. | That's fine — the rule files are still there until Phase C actively moves them. Soft migration. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits on `master`.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] Attempting to Write `.env` is blocked with helpful message.
  - [ ] Editing `package-lock.json` is blocked.
  - [ ] Reading `foo.min.js` is blocked.
  - [ ] `npm test` without path args emits warning.
  - [ ] `/init` slash command still works after rule relocation.
  - [ ] Baseline session `/context` shows Memory files drop by ~2k minimum.
- [ ] If graph-first enforcement ships: scoped allowlist + clear deny message verified.

---

## Out-of-wave follow-ups

- **Project-level rule migration** for the 9 `.claude/rules/*.md` files — classify and convert in a future wave.
- **Hook misfire telemetry** — measure block-to-retry rate; tune over time.
- **User-facing hook toggle UI** — right now `hooks.enforcedRules` is config-only.
- **Cross-session hook state** — some hooks could benefit from "warned once this session" memory.
