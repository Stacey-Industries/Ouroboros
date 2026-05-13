# Wave 48 Auto-Execution Brief

You are an autonomous Claude Code teammate dispatched at ~05:05 on 2026-04-26 to execute Wave 48. You have a hard stop at **08:45 local** (~3h 40m). The plan is a **draft**, not a contract.

## Your task

Implement Wave 48 (Token Baseline Quick Wins) end-to-end on a dedicated branch. `roadmap/wave-48-plan.md` is a draft — read it, validate against current code, refine where the draft has drifted, and implement clean code. Do not chase the plan's phase boundaries if the current state of `src/main/orchestration/`, `src/main/internalMcp/`, and `src/main/codebaseGraph/` makes a different slicing more correct. Document refinements in your result note.

You are not a script. You are an engineer with the wave plan as input and the codebase as ground truth.

## Independence

You have peer teammates (Wave 46, Wave 53) running in parallel on independent subsystems. **Do not message them.** Do not depend on their work. Your branch must apply cleanly on top of the master HEAD that existed when you started.

## Branch policy

- Branch from current `master` HEAD: `auto/wave-48`.
- Commit per phase using existing convention: `feat(wave-48): Phase A — <summary>` / `fix(wave-48): ...` / `refactor(wave-48): ...`.
- **DO NOT push, fetch, or merge. DO NOT touch `master`.** All commits stay local on `auto/wave-48`.

## Local config in scope

You inherit the user's `~/.claude/` config:

- **Agent catalog routing** (`~/.claude/rules/agent-catalog.md`): custom catalog only; built-ins denied by hook.
- **Sonnet for subagents** (`~/.claude/rules/agent-model-selection.md`): never pass `model: "opus"` to subagent dispatches. (One-shot exception for you, the teammate, to run Opus medium.)
- **ESLint** (project rule): `max-lines-per-function:40`, `complexity:10`, `max-lines:300`, `max-depth:3`, `max-params:4`, security rules at error in main/preload. Never relax.
- **Main-process rules** (`.claude/rules/main-process.md`): no `eval()`, no dynamic `require()`, no `child_process` without explicit allowance, no non-literal `fs` paths. Wave 48 is entirely in `src/main/`.
- **IPC contract** (`.claude/rules/ipc-contract.md`): if you touch `src/renderer/types/electron.d.ts`, run `npx tsc --noEmit` to verify type consistency. (Wave 48 likely doesn't touch this — flag if you find yourself reaching for it.)
- **Test scope**: only `npx vitest run <touched-paths>`. No full suite.
- **Debug-before-fix**: instrument before re-fixing.
- **Memory**: user on Max subscription, no API key. New boolean feature flags default `true` unless destructive.

## Process

1. Read `roadmap/wave-48-plan.md` in full. Note the three feature flags it introduces (`context.leanForSimpleGoals`, `internalMcpScope`, `workspaceState.dedupe`) and their default values.
2. Validate the draft against actual current paths: `src/main/orchestration/providers/claudeCodeLaunch.ts`, `claudeCodeContextBuilder.ts`, `claudeStreamJsonRunner.ts`, `claudeCodeHelpers.ts`, `src/main/internalMcp/internalMcpAutoInject.ts`, `internalMcpTools.ts`, `src/main/codebaseGraph/mcpToolHandlers.ts`. If files have moved or been refactored since the draft, adapt.
3. **Critical care**: the wave modifies `internalMcpAutoInject` behavior. The auto-inject of `mcpServers.ouroboros` into `.claude/settings.json` at startup (`src/main/main.ts:95-113`) **must keep working**. The wave is about *gating when schemas load*, not removing the injection. Read that bootstrap path before changing anything.
4. Phase by phase: refine slicing if needed → implement → touched tests → typecheck → diff self-review → commit.
5. Per-phase verification:
   - `npx tsc --noEmit -p tsconfig.json` after `.ts` changes
   - `npx vitest run <paths>` for new/modified tests
6. On completion: write `roadmap/auto-briefs/wave-48-result.md` summarizing: phases shipped, flag wiring, draft refinements, verification, deferred items, surprises. Commit on the branch.
7. **Hard stop at 08:45 local.** Mid-phase stop → `wip(wave-48): partial — <reason>` + result note.

## Out of scope

- Pushing, fetching, merging
- Modifying `master` or other teammates' files
- Touching renderer code (Wave 48 is main/orchestration only)
- Editing `~/.claude/`
- Wiring graph-usage telemetry into Wave 50's enforcement (separate wave)
- Running the full vitest suite

## If genuinely blocked

Write `roadmap/auto-briefs/wave-48-blocked.md` with the precise question, commit on the branch, stop.
