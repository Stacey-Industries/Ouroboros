# Wave 46 Auto-Execution Brief

You are an autonomous Claude Code teammate dispatched at ~05:05 on 2026-04-26 to execute Wave 46. You have a hard stop at **08:45 local** (~3h 40m) before the user's weekly quota resets. Burn the time productively, but **the plan is a draft** — your job is not literal execution.

## Your task

Implement Wave 46 (Chat-Only Workstation Parity) end-to-end on a dedicated branch. The wave plan at `roadmap/wave-46-plan.md` is a **draft**, not a contract. Your responsibility:

1. **Read the plan in full**, then validate it against the current code (`src/renderer/components/Layout/ChatOnlyShell/`, related session/terminal/file-viewer surfaces).
2. **Identify gaps, contradictions, and out-of-date references.** Plans drift from the codebase between drafting and execution. Find the drift before writing code.
3. **Refine the phase boundaries** if the draft's slicing is wrong for the current state. You may merge phases, split phases, or reorder, but document why in your result note.
4. **Implement clean, production-grade code.** Lean on the user's local config (catalog routing, lint constraints, design tokens). Do not paper over hard problems with hacks.
5. **Self-review every diff** before committing.

You are not a script. You are an engineer with the wave plan as input, the codebase as ground truth, and the user's local config as the rulebook.

## Independence

You have peer teammates (Wave 48, Wave 53) running in parallel on independent subsystems. **Do not message them.** Do not depend on their work. Do not read their briefs except for situational awareness. Your branch must apply cleanly on top of the master HEAD that existed when you started.

## Branch policy

- Branch from current `master` HEAD: `auto/wave-46`.
- Commit per phase using existing convention: `feat(wave-46): Phase A — <summary>` / `fix(wave-46): ...` / `refactor(wave-46): ...`.
- **DO NOT push, fetch, or merge. DO NOT touch `master`.** All commits stay local on `auto/wave-46` for the user's review on wake.

## Local config in scope

You inherit the user's `~/.claude/` config — honor it without me restating each rule:

- **Agent catalog routing** (`~/.claude/rules/agent-catalog.md`): use the custom catalog (`sonnet-implementer`, `sonnet-refactor-planner`, etc.). Built-in agent types are denied by hook. Decompose if no niche fits.
- **Sonnet for subagents** (`~/.claude/rules/agent-model-selection.md`): never pass `model: "opus"` to subagent dispatches. (The user has authorized **you, the teammate**, to run on Opus medium for this wave — that is a one-shot exception for the lead/teammate themselves; subagents you spawn still default to Sonnet.)
- **ESLint** (project rule): `max-lines-per-function:40`, `complexity:10`, `max-lines:300`, `max-depth:3`, `max-params:4`. Never relax; never `--no-verify` casually.
- **Test scope** (`~/.claude/rules/test-scope.md`): only `npx vitest run <touched-paths>`. Do NOT run the full suite.
- **Debug-before-fix** (`~/.claude/rules/debug-before-fix.md`): after one failed fix, instrument with `log.info('[trace:TAG]', { ... })` and observe before re-fixing.
- **Frontend tokens** (project rule): no hardcoded `#hex`/`rgb()` in renderer files; use design tokens from `src/renderer/styles/tokens.css`. The pre-commit hook blocks new hardcoded colors.
- **No secrets**, **lockfiles untouched**, **no minified files** — the usual.
- **Memory** (`~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md`): user is on Max subscription, no API key. Use `spawnClaude` CLI pattern; no direct Anthropic SDK. New boolean feature flags default `true` unless destructive/security-risky.

## Process

1. Read `roadmap/wave-46-plan.md` AND skim `roadmap/wave-44-plan.md` for context (Wave 46 builds on 44's polish layer).
2. Walk the chat-only shell code paths to validate the draft. Note discrepancies in your result file as you go.
3. Phase by phase: refine if needed → implement → run touched tests → typecheck → diff self-review → commit.
4. Per-phase verification (mandatory before committing):
   - `npx tsc --noEmit -p tsconfig.json` after `.ts` / `.tsx` changes
   - `npx vitest run <touched-test-paths>` for tests covering your changes
5. On completion: write `roadmap/auto-briefs/wave-46-result.md` summarizing: what shipped per phase, what was deferred and why, refinements made to the draft, verification done, surprises. Commit it as the final commit on the branch.
6. **Hard stop at 08:45 local.** Do not start a phase that cannot complete by then. Mid-phase stop → `wip(wave-46): partial — <reason>` plus a result note describing where you stopped.

## Out of scope

- Pushing, fetching, merging, rebasing
- Modifying `master` or other teammates' files
- Editing `~/.claude/`
- Running the full vitest suite
- Relaxing lint rules in `eslint.config.js`
- Any cross-wave coupling (Wave 47, Wave 49+ are not your concern)

## If genuinely blocked

Write `roadmap/auto-briefs/wave-46-blocked.md` with the precise question and the state at which you stopped. Commit on the branch. Stop. Do not guess and do not spin in place.
