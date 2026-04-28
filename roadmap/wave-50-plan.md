# Wave 50 — Rule-to-Hook Migration

## Implementation Plan

**Status:** READY (revised 2026-04-27 — path drift fixed; Phase D reshaped against richer corpus; Phase C softened to ship-without-deletion)
**Version target:** v2.8.2 (patch — shift enforcement from prompt to deterministic hooks)
**Feature flags:** new `hooks.enforcedRules` array (default includes converted rules), new `hooks.enforceGraphFirst` (default `false`; ship enabled or not based on Phase D analysis)
**Dependencies:** Wave 48 ✅ (telemetry tap shipped, but tap is partially broken — Phase D fixes), Wave 49 ✅ (claude-md-size lint wired, `src/main/hooks/` exists)
**References:**
- `~/.claude/rules/*.md` (14 global rules — user config)
- `C:\Web App\Agent IDE\.claude\rules\*.md` (9 project rules)
- `src/main/hookInstaller.ts`, `src/main/hookInstallerCommands.ts:59` (PreToolUse already wired to `pre_tool_use.mjs`)
- `src/main/hooksGraphUsageTap.ts` (Wave 48 graph-usage tap — args capture is broken)
- `src/main/hooks/gotchaUpdateNudge.ts` (Wave 49 — pattern reference for new hooks)
- `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl` (522 session transcripts — real corpus for adherence analysis)

---

## Why this wave was revised

The original draft (now superseded) referenced `src/main/hooks/graphUsageLogger.ts` (incorrect — actual file is `src/main/hooksGraphUsageTap.ts` at top-level). It also assumed that file's telemetry corpus (`~/.ouroboros/telemetry/graph-usage.jsonl`) was usable. Verification on 2026-04-27 found two issues:

1. **The tap is partially broken.** Of 535 real entries (filtering out `s1` synthetic test data): 433 (~81%) have `args:{}` — empty. Hook is firing but not capturing tool args, so the classifier returns "unknown" instead of symbol/literal. Phase D's enforcement decision can't be driven by this corpus as-is.
2. **A much richer corpus exists.** Claude Code writes full session transcripts at `~/.claude/projects/C--Web-App-Agent-IDE/` — **522 session JSONL files** for this project alone, each with full tool calls including args. Phase D should consume these rather than the broken tap.

Phase C was also softened: the original plan deleted user-global rule files (`~/.claude/rules/init-safety.md`, etc.) on the same wave they moved to slash commands. The revision **keeps the rule files in place for one wave of soak**, with pointers from `~/.claude/CLAUDE.md`. Removal becomes a follow-up after the slash commands prove out.

---

## Overview

The user's session baseline includes:

- **~7.6k tokens** from global `~/.claude/CLAUDE.md` + 14 rule files (verified by char count)
- **~3.7k tokens** from project `CLAUDE.md` + 9 `.claude/rules/*.md` files (verified)
- **Total: ~10–11k tokens of rules in every session**

A meaningful slice of those rules are "remember to do X" / "don't do Y" — the canonical PreToolUse-hook use case. Deterministic enforcement at the harness level costs 0 tokens in context and has 100% adherence vs. model judgment.

**Convertible rules** (preliminary; Phase A produces the formal classification):

| Rule | Bytes | Convertible? | Conversion path |
|---|---|---|---|
| `no-secrets.md` | ~120 | YES | `PreToolUse` block on writes to `.env*` (allow `.env.sample` / `.env.example`) |
| `lockfiles.md` | ~131 | YES | `PreToolUse` block on edits to `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` |
| `no-minified.md` | ~96 | YES | `PreToolUse` block on reads/edits of `*.min.js`, `*.min.css` |
| `test-scope.md` | ~1021 | PARTIAL | `PreToolUse` warn on `npm test` / `npm run test` without path args |
| `graph-tool-routing.md` | — | DECIDE in Phase D | Possibly graduate the (now-fixed) tap from log-only to blocking |
| `init-safety.md` | ~897 | NO — slash command | Move to `/init-safety` command, load on invocation; rule stays one wave |
| `project-claude-md-template.md` | ~914 | NO — slash command | Move to `/claudemd` command, load on invocation; rule stays one wave |
| `debug-before-fix.md`, `context7.md`, `frontend-design.md`, `research-before-implementing.md`, `agent-model-selection.md`, `agent-catalog.md`, `manual-smoke-gate.md` | — | NO | Process / judgment / inference rules, stay as rules |
| Project rules (9 files) | ~3000 | PARTIAL | Phase A classifies case-by-case |

**Potential savings: ~600–1,200 tokens immediately from Phase B + ~1,800 tokens from Phase C** once slash-commandable rules relocate. Phase D may add more if graph-first enforcement ships.

---

## Implementation review summary

### Confirmed state (2026-04-27)

- ✅ `PreToolUse` infrastructure shipped in Wave 48: `hookInstallerCommands.ts:59` routes to `pre_tool_use.mjs`. `hooksSessionHandlers.ts` dispatches received events.
- ✅ `src/main/hooks/` directory exists (Wave 49 created it for `gotchaUpdateNudge.ts`). Phase B's hooks land alongside.
- ✅ Wave 48 telemetry tap exists: `src/main/hooksGraphUsageTap.ts`. **But:** ~81% of real entries have `args:{}` — empty. Phase D fixes.
- ✅ Slash command discovery works in both `~/.claude/commands/` and `.claude/commands/`. 8 project commands and many global ones already in place.
- ✅ 14 global + 9 project rules confirmed by `ls`. Plan references match reality.
- ❌ `hooks.enforcedRules` and `hooks.enforceGraphFirst` config keys do not exist yet — Phase B + D add them.
- ❌ No deny-shaped PreToolUse handlers exist today. The `pre_tool_use.mjs` wire passes events to handlers but no handler currently emits a deny.

### Real corpus for Phase D

- **`~/.claude/projects/C--Web-App-Agent-IDE/`** — 522 session JSONLs with full tool-use history. This is the goldmine.
- Each JSONL line is a structured event with `tool_use` payloads containing real args. Lets us classify Grep/Read calls by shape (symbol vs literal) accurately.
- Phase D's analyzer reads these, not `~/.ouroboros/telemetry/graph-usage.jsonl`.

### Soft observation supporting user's hypothesis

Even with the broken tap, real-data tool ratio is **441 Read calls vs 94 Grep across 8 sessions** (~5:1) — heavy file-reading patterns. Without args capture we can't classify shape, but the volume suggests agents do default to filesystem-shaped tools. Phase D's analyzer over the rich corpus will quantify whether those Reads are symbol-shaped (graph-first violations) or genuinely literal (correct tool choice).

---

## Scope

### In-scope

- Classify all 14 global + 9 project rules (`keep` / `hook` / `slash-command` / `delete`).
- Implement 4 PreToolUse hooks: `no-secrets`, `lockfiles`, `no-minified`, `test-scope` (warn).
- Create `/init-safety` and `/claudemd` slash commands containing the existing rule content.
- **Soft Phase C** — leave the original rule files in place for one wave of soak; add pointers in `~/.claude/CLAUDE.md`.
- Fix `hooksGraphUsageTap.ts` arg capture.
- Build `scripts/analyze-graph-adherence.ts` that reads the Claude Code session JSONL corpus.
- Run analysis, produce `roadmap/wave-50-graph-adherence.md` with the decision.
- Optional graduation of graph-first tap to blocking based on Phase D outcome.
- Integration tests, migration guide, telemetry pointers.

### Out-of-scope

- Project-level rules that aren't clear hook candidates — classify but don't convert this wave.
- Deletion of original rule files after slash command move (next wave, after soak).
- Writing new rules unrelated to enforcement.
- Any CodeMode work (Wave 51).
- New rule authoring or moves not driven by Phase A's classification.

---

## Architecture

```text
today (pre-50)
 ├─ every session
 │    ├─ loads ~/.claude/CLAUDE.md (1.1k)
 │    ├─ loads 14 ~/.claude/rules/*.md (~6.5k)
 │    ├─ loads 9 .claude/rules/*.md (~3.5k)
 │    └─ agent has to remember + follow rules via judgment
 └─ wide variance in rule adherence

post-50
 ├─ every session
 │    ├─ loads same set MINUS init-safety + claudemd-template (~1.8k saved)
 │    └─ deterministic hooks enforce 4 unambiguous rules
 ├─ PreToolUse hooks (in src/main/hooks/)
 │    ├─ blockSecretWrites        (replaces no-secrets enforcement)
 │    ├─ blockLockfileEdits       (replaces lockfiles enforcement)
 │    ├─ blockMinifiedOperations  (replaces no-minified enforcement)
 │    ├─ warnFullTestSuite        (partial replacement of test-scope)
 │    └─ enforceGraphFirst        (graduated from log-only IFF Phase D supports)
 ├─ slash commands
 │    ├─ /init-safety   (init-safety.md content; loads only on invocation)
 │    └─ /claudemd      (project-claude-md-template.md content; loads only on invocation)
 └─ original rule files remain in ~/.claude/rules/ for one wave of soak
      └─ pointer in ~/.claude/CLAUDE.md: "for /init-safety, see the slash command; for authoring, see /claudemd"
```

**Key design calls:**

- Hooks that block emit clear, actionable error messages — "refusing to edit lockfile — use `npm install` to modify dependencies" beats "permission_denied".
- Each hook respects `hooks.enforcedRules` config — user can disable individually.
- Slash commands contain the rule content verbatim so an invocation gives the agent the rule context.
- **Phase D enforcement decision is data-driven.** Thresholds: ≥70% adherence → don't enforce; 40–70% → optional warn; <40% → block with allowlist for genuine literals.
- Phase D ships the analyzer + the decision doc regardless of whether enforcement is enabled. The analyzer is reusable for future re-evaluation.

---

## Phase A — Rule classification audit

**Goal:** Produce a complete, reviewed classification of all 23 rules with explicit keep/hook/slash-command/delete reasons.

### New files

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-50-rule-classification.md` | ~400 | Full audit: every rule, byte cost, proposed disposition, reason. Reviewable by the orchestrator before Phase B/C/D dispatch. |

### Modified files

None this phase — pure analysis.

### Subagent briefing (sonnet-implementer)

- **Read first:** all 14 files under `~/.claude/rules/*.md` and 9 under `C:/Web App/Agent IDE/.claude/rules/*.md`.
- For each rule, fill a row:
  - File path
  - Bytes (use `wc -c`)
  - What it enforces (1 sentence)
  - Disposition: `keep` / `hook` / `slash-command` / `delete`
  - If `hook`: which event + check (e.g., `PreToolUse on Edit/Write where path matches *.lock`)
  - If `slash-command`: command name + when it should be invoked
  - Reason (especially for `keep` — why is paying tokens every session worth it?)
- Be skeptical. "Might be useful for judgment" is weak justification for paying tokens every session.
- For `graph-tool-routing.md`: split disposition allowed — the routing table is `keep`, the "don't Grep for symbol queries" enforcement piece is decided in Phase D.
- The 4 baseline conversions (no-secrets, lockfiles, no-minified, test-scope) are pre-classified as `hook`.
- The 2 baseline slash-command conversions (init-safety, project-claude-md-template) are pre-classified as `slash-command`.
- Don't preempt user-config decisions: the doc records dispositions, but actual user-global-file changes happen in Phase C with user-confirmation guard already specified.

### Acceptance

- [ ] Doc covers all 23 rules.
- [ ] Every `hook` entry has a concrete event + check.
- [ ] Every `slash-command` entry has a command name.
- [ ] Every `keep` entry has a justification beyond "useful."
- [ ] Commit: `docs(wave-50): Phase A — rule classification audit`

---

## Phase B — 4 PreToolUse hook implementations

**Goal:** Ship the 4 unambiguous deterministic hooks.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/blockSecretWrites.ts` | ~150 | PreToolUse handler — denies Write/Edit on `.env*` paths except `.env.sample` / `.env.example` / `.env.template`. Emits structured deny with actionable message. |
| `src/main/hooks/blockSecretWrites.test.ts` | ~140 | Allowed/denied matrix per filename pattern. |
| `src/main/hooks/blockLockfileEdits.ts` | ~140 | Denies Write/Edit on `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`. |
| `src/main/hooks/blockLockfileEdits.test.ts` | ~120 | Same shape. |
| `src/main/hooks/blockMinifiedOperations.ts` | ~140 | Denies Read/Edit on `*.min.js`, `*.min.css`, `*.min.mjs`. |
| `src/main/hooks/blockMinifiedOperations.test.ts` | ~120 | Same shape. |
| `src/main/hooks/warnFullTestSuite.ts` | ~140 | Inspects Bash commands; matches `npm test` / `npm run test` / `npx vitest run` without trailing path args. Emits warning, does not block. |
| `src/main/hooks/warnFullTestSuite.test.ts` | ~120 | Allowed (with paths) vs warned (without). |

### Modified files

| File | Change |
|---|---|
| `src/main/hooksSessionHandlers.ts` | Dispatch PreToolUse events through the 4 new handlers (each handler decides whether the event applies). Wrap each in try/catch — a hook failure must not break session handling. |
| `src/main/configSchemaTail.ts` | Add `hooks.enforcedRules: { type: 'array', items: { type: 'string' }, default: ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'] }`. Each handler reads this list before deciding to deny/warn. |
| `src/main/configTypes.ts` | Add the field to the matching TS interface. |

### Subagent briefing (sonnet-implementer)

- **Read first:**
  - `src/main/hooksGraphUsageTap.ts` (Wave 48 — pattern reference for PreToolUse handler shape)
  - `src/main/hooks/gotchaUpdateNudge.ts` (Wave 49 — pattern for handlers in `src/main/hooks/`)
  - `src/main/hookInstallerCommands.ts` (PreToolUse wire format)
  - `src/main/hooksSessionHandlers.ts` (current dispatch shape)
  - `~/.claude/rules/no-secrets.md`, `lockfiles.md`, `no-minified.md`, `test-scope.md` (source of truth for what each rule enforces)
- **Deny messages are agent-facing and prescriptive.** Examples:
  - `"refusing to edit '.env.local' — secrets must not be modified by the agent. If a value is needed for testing, ask the user to populate it manually."`
  - `"refusing to edit 'package-lock.json' — lockfiles must be regenerated by 'npm install'. Modify package.json instead."`
  - `"refusing to read 'foo.min.js' — minified output is not source. Find the source file or ask the user where it lives."`
- **`.env.sample`, `.env.example`, `.env.template` are explicitly allowed.** Block only files that are real secret containers.
- **`warnFullTestSuite` is a warning, not a block.** Match Bash inputs of `npm test`, `npm run test`, `npx vitest run`, `npx jest`, etc. without trailing args. Emit a warning string in the hook output so the agent sees it. Do NOT deny.
- **Each hook respects `hooks.enforcedRules` config.** A hook whose name is not in the list is a no-op for that session. Disable mechanism for the user.
- Each handler returns a typed `HookDecision` shape — see `hooksGraphUsageTap.ts` for the existing pattern. If a "deny" decision shape doesn't exist yet, define a minimal one: `{ kind: 'deny', message: string, ruleName: string } | { kind: 'warn', message: string, ruleName: string } | { kind: 'pass' }`. Surface deny/warn to the harness in whatever format `pre_tool_use.mjs` expects (read it).
- **Test policy: scoped only.** `npx vitest run src/main/hooks/`. Skip full suite.
- **Lint constraints:** max-lines-per-function 40, complexity 10, max-lines 300, max-depth 3, max-params 4. No console.log.
- **Commit:** `feat(wave-50): Phase B — block-secret/lockfile/minified hooks + warn-full-test-suite`

### Acceptance

- [ ] Writing to `.env.local` is denied with a prescriptive message.
- [ ] Writing to `.env.sample` is allowed.
- [ ] Editing `package-lock.json` is denied.
- [ ] Reading `foo.min.js` is denied.
- [ ] `npm test` with no path emits warning; `npm test src/main/foo.test.ts` does not.
- [ ] Each hook can be disabled by removing its name from `hooks.enforcedRules`.
- [ ] Scoped tests pass.
- [ ] Lint + tsc clean.

---

## Phase C — Slash command conversions (soft)

**Goal:** Ship `/init-safety` and `/claudemd` slash commands. **Leave original rule files in place for soak.**

### New files

| File | ~Lines | Description |
|---|---|---|
| `~/.claude/commands/init-safety.md` | ~220 | Verbatim content of `~/.claude/rules/init-safety.md`, reformatted as a slash command body so an invocation feeds it as one-shot context. |
| `~/.claude/commands/claudemd.md` | ~240 | Verbatim content of `~/.claude/rules/project-claude-md-template.md`, reformatted similarly. |

### Modified files

| File | Change |
|---|---|
| `~/.claude/CLAUDE.md` | Add a small section pointing at the new commands. Format: `For initializing a project's CLAUDE.md, invoke '/init-safety' (handles pre-flight checks) and '/claudemd' (template guidance).` |

**DO NOT delete or move the original rule files** at `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md`. They stay for one wave of soak. Removal is a follow-up after the commands prove out.

### Subagent briefing (sonnet-implementer)

- **Read first:**
  - `~/.claude/rules/init-safety.md` (full content)
  - `~/.claude/rules/project-claude-md-template.md` (full content)
  - 2–3 existing slash commands under `~/.claude/commands/` to see the format (e.g., `analyze.md`, `audit.md`)
- The slash command body is what gets injected when the user types `/init-safety` or `/claudemd`. It should be self-contained — when invoked, the agent gets the full rule context for that turn.
- Preserve all behavior in the rule. Reformat headings/sections to fit slash command conventions, but do not lose substance.
- **Do NOT delete the original rule files.** They remain at `~/.claude/rules/` for one wave of soak.
- The pointer in `~/.claude/CLAUDE.md` is short — one or two lines. Don't move the rule's prose into CLAUDE.md.
- **Test policy:** there's nothing executable to scoped-test for this phase — verify by reading the resulting commands. Manual smoke: invoke `/init-safety` and `/claudemd` from Claude Code, confirm content loads.
- **Commit:** `feat(wave-50): Phase C — /init-safety and /claudemd slash commands (soft)`

### Acceptance

- [ ] `~/.claude/commands/init-safety.md` exists, contains init-safety content.
- [ ] `~/.claude/commands/claudemd.md` exists, contains template content.
- [ ] `~/.claude/CLAUDE.md` has a small pointer to both.
- [ ] Original rule files in `~/.claude/rules/` are UNCHANGED.
- [ ] Manual smoke (orchestrator runs): `/init-safety` and `/claudemd` invoke without errors.
- [ ] Commit lands.

---

## Phase D — Fix tap, build adherence analyzer, decision

**Goal:** Quantify graph-first adherence using the real corpus, then either ship enforcement or document the decision to defer.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/analyze-graph-adherence.ts` | ~280 | tsx-runnable. Reads `~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl`, walks tool-use entries, classifies Grep/Read calls by shape (symbol/literal/unknown) using the same classifier logic as `hooksGraphUsageTap.ts` (extracted into a shared module). Outputs: total Grep/Read count, symbol-shaped count, per-session adherence rate, distribution. |
| `roadmap/wave-50-graph-adherence.md` | ~150 | Decision doc. Records corpus size, per-session adherence rates, the threshold the data hit, the resulting recommendation (`enforce` / `optional warn` / `stay log-only`), and rationale. |
| `src/main/hooks/graphUsageClassifier.ts` | ~120 | Extract `classifyShape` and helpers from `hooksGraphUsageTap.ts` into a shared module so both the tap and the analyzer use identical classification. |
| `src/main/hooks/graphUsageClassifier.test.ts` | ~140 | Coverage for symbol / literal / unknown classifications (Grep patterns + Read paths). |

### Modified files

| File | Change |
|---|---|
| `src/main/hooksGraphUsageTap.ts` | (1) Fix `args:{}` capture — read tool args from the right field of the PreToolUse event. (2) Use the extracted classifier from `graphUsageClassifier.ts`. (3) **Conditional** — if Phase D analysis returns "enforce" or "optional warn": add a `decideEnforcement` function gated on `hooks.enforceGraphFirst` config that returns deny/warn. Default `false`; user opts in. |
| `src/main/configSchemaTail.ts` | Add `hooks.enforceGraphFirst: { type: 'boolean', default: false }`. |
| `src/main/configTypes.ts` | Add the field. |

### Subagent briefing (sonnet-implementer)

- **Read first:**
  - `src/main/hooksGraphUsageTap.ts` (the broken tap — figure out why `args` is empty by tracing the event shape)
  - `src/main/hookInstallerCommands.ts` and `assets/hooks/pre_tool_use.mjs` if it exists (to see what the hook receives)
  - 1–2 sample JSONLs from `~/.claude/projects/C--Web-App-Agent-IDE/` to learn the schema (each line is JSON; look for `tool_use_id`, `name`, `input` fields)
- **Tap fix.** The current tap logs `args:{}` for ~81% of entries. Diagnose by:
  - Reading `pre_tool_use.mjs` (under `assets/hooks/`) to see what it forwards
  - Comparing one synthetic test (with `args` populated) to a real broken entry — likely the args are nested under `input` instead of `args`, or the JSON parsing is dropping them
  - Add structured `log.info('[tap]')` lines temporarily if needed; remove before commit
- **Analyzer over Claude Code session JSONLs.**
  - Each line in those files is one event. Filter to `type === 'tool_use'` (or whatever schema field marks a tool call — confirm by reading samples).
  - For each Grep/Read tool_use, extract `input.pattern` (Grep) or `input.file_path` (Read), classify with the shared classifier.
  - Compute: total Grep+Read calls, symbol-shaped count, % adherence (= 1 - symbol-shaped/total).
  - Per-session breakdown: bin sessions by their adherence rate.
- **Decision threshold.**
  - ≥70% adherence → record decision `stay log-only`. Don't ship enforcement code.
  - 40–70% → record decision `optional warn`. Ship `decideEnforcement` returning `warn` when `hooks.enforceGraphFirst` is true. Default flag stays false.
  - <40% → record decision `enforce`. Ship `decideEnforcement` returning `deny` when flag is true, with allowlist for literal patterns. Default flag stays false even when shipped.
- **The decision doc is required regardless of outcome.** It records the analysis so future iterations don't repeat it.
- **Test policy: scoped only.** `npx vitest run src/main/hooks/graphUsageClassifier.test.ts`. The analyzer is a script — manual run, no test.
- **Commit:** `feat(wave-50): Phase D — fix graph tap + adherence analyzer + decision`. Include the decision doc and (if applicable) the `decideEnforcement` code in the same commit.
- **Anti-deviation:** do NOT modify project rule documentation about graph routing — Phase E's job. Do NOT delete the broken-corpus tap output file.

### Acceptance

- [ ] `hooksGraphUsageTap.ts` now captures real args (verify by tailing the tap during a session).
- [ ] `analyze-graph-adherence.ts` runs against the JSONL corpus and produces a numeric report.
- [ ] `roadmap/wave-50-graph-adherence.md` records corpus size, adherence numbers, decision, rationale.
- [ ] `hooks.enforceGraphFirst` config exists, default false.
- [ ] If decision was `enforce` or `optional warn`: `decideEnforcement` function exists with allowlist for literal patterns.
- [ ] If decision was `stay log-only`: doc is committed; no enforcement code ships.
- [ ] Scoped tests pass (classifier).
- [ ] Lint + tsc clean.

---

## Phase E — Integration tests, migration guide, wave-close prep

**Goal:** Verify the full hook stack, document rollback, prepare wave for close.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/hookStack.integration.test.ts` | ~280 | Exercises all 4 Phase B block/warn hooks + (if shipped) graph-first decideEnforcement. Asserts deny paths, allow paths, and `hooks.enforcedRules` toggle behavior. |
| `docs/hook-migration.md` | ~200 | How rules became hooks; how to disable a misfiring hook (`hooks.enforcedRules` config); how to escalate a warning to a block; how to roll back. Cross-references `wave-50-rule-classification.md` and `wave-50-graph-adherence.md`. |

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` (project root) | Add `docs/hook-migration.md` to "Further Reading". Update "Known Issues / Tech Debt" if any rule-related items existed. |
| `docs/architecture.md` | Add a brief mention of the deterministic-hook layer pointing at `hook-migration.md`. |
| `roadmap/session-handoff.md` | Note follow-ups: project-rule migrations not done this wave, original `init-safety.md` / `project-claude-md-template.md` rule files still in place pending soak. |

### Subagent briefing (sonnet-implementer)

- **Read first:** Phase B's hook test files (pattern reference), `hooks.enforcedRules` config layout.
- Integration test mounts a fake event router, fires synthetic PreToolUse events with realistic args, and asserts each handler's decision.
- Migration guide is reader-first. Lead with the rollback path (one config edit). Walk the rule→hook map. Include "if a hook misfires, here's what to do" and "if you want a warning to become a block, here's how."
- **Test policy:** scoped only. Orchestrator runs full suite at wave close.
- **Commit:** `docs(wave-50): Phase E — integration test, migration guide, doc updates`

### Acceptance

- [ ] Integration test covers all Phase B handlers + graph-first if shipped.
- [ ] Migration guide complete and reader-friendly.
- [ ] Tech-debt and architecture docs updated.
- [ ] Scoped tests pass.
- [ ] Lint + tsc clean.

---

## Subagent execution model

- **Model:** `sonnet` (catalog: `sonnet-implementer`)
- **Isolation:** sequential on `master`, no worktree
- **Test policy:** scoped vitest per phase; orchestrator runs full suite + lint + lint:claude-md at wave close
- **Commit policy:** one per phase; orchestrator may add small fix-up commits between phases
- **Push policy:** orchestrator reviews aggregate diff at wave close and pushes once
- **Scope discipline:** phase agents may NOT touch files outside their stated scope. Phase C may NOT delete original rule files. Phase D may NOT modify enforcement code if decision is `stay log-only`.

### Phase dispatch order

1. **Phase A** — classification audit (foundation; orchestrator reviews before B/C/D dispatch)
2. **Phase B** — 4 hook implementations
3. **Phase C** — slash commands (soft, no deletions)
4. **Phase D** — tap fix + analyzer + decision (may or may not ship enforcement code)
5. **Phase E** — integration test + migration guide

Phases B, C, D are independent of each other once A is reviewed. They run sequentially under the current async-block rule but produce non-overlapping diffs.

---

## Risks

| Risk | Mitigation |
|---|---|
| A hook blocks a legitimate operation. | Each hook respects `hooks.enforcedRules` — user can disable individually. Migration guide leads with rollback. |
| Slash command move loses content. | Phase C copies content verbatim. Original files stay in place for soak. |
| Tap fix breaks something else in the hook pipeline. | Scoped test in Phase D + integration test in Phase E catches it. Orchestrator runs full suite at wave close. |
| Phase D corpus analysis disagrees with user's intuition (high adherence). | The data is the data. Ship the decision doc. Soft rule continues to work; we revisit when corpus grows. |
| Phase D corpus analysis confirms low adherence and we ship enforcement. | Default flag is `false` even when shipped. User opts in after a soak period. Allowlist for genuine literals to prevent false positives. |
| Subagent stops mid-phase (observed pattern in Wave 49). | Orchestrator monitors and resumes via SendMessage. Each phase's commit is the recoverable checkpoint. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits on `master`.
- [ ] `npx vitest run` (timeout 800) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run lint:claude-md` — 0 errors.
- [ ] Manual smoke (orchestrator):
  - [ ] Attempting to Write `.env` is blocked with helpful message.
  - [ ] Editing `package-lock.json` is blocked.
  - [ ] Reading `foo.min.js` is blocked.
  - [ ] `npm test` without path args emits warning.
  - [ ] `/init-safety` and `/claudemd` slash commands invoke and return content.
- [ ] Phase D decision doc exists at `roadmap/wave-50-graph-adherence.md`.
- [ ] Result brief at `roadmap/auto-briefs/wave-50-result.md`.
- [ ] Status flipped to ✅ COMPLETED.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Original-rule-file deletion** — after one wave of soak with the slash commands, delete `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md`. User-confirmation gate.
- **Project-level rule migration** — classify and convert the 9 `.claude/rules/*.md` files in a follow-up wave.
- **Hook misfire telemetry** — measure block-to-retry rate over the next wave; tune messages or behavior.
- **User-facing hook toggle UI** — `hooks.enforcedRules` is config-only today.
- **Cross-session hook state** — some hooks could benefit from "warned once this session" memory.
- **Re-run Phase D analysis quarterly** — corpus grows; thresholds may flip.
