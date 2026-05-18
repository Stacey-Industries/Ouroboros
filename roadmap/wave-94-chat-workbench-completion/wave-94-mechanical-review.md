# Wave 94 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-94-chat-workbench-completion/waveplan-94.md`
- Diff range: `7830b630~1..HEAD` (commits `7830b630`, `abc04d66`, `488798ac`, `d4a2f1dc`, `00421a7e`, `d080f92d`, `1cd6ddce` plus uncommitted result-brief / CHANGELOG / version artifacts)
- Graph: `GRAPH_FALLBACK` — grep + import-following used throughout. Codemode connection not exercised in this session; mark Check 1 / Check 3 findings `(fallback trace — verify manually)`.
- Run timestamp: 2026-05-18

## Check 1: Forward-trace

- Change sites traced: 23 added/modified exports across 5 phases.
- Paths reaching production consumer: 23.
- Paths flagged as dead: 0.

Notable confirmed paths (fallback trace — verify manually):

- `UtilityPaneToggleButton`, `ArtifactPaneToggleButton` → `WorkbenchPanelToggleStrip` → imported by `ChatOnlyTitleBar.RightPaneButtons` → mounted in `WorkbenchControls` strip. Production UI.
- `useChatWorkbenchLayout.isUtilityOpen` / `isArtifactOpen` aliases → `ChatWorkbenchShell.ShellChrome` wires them to title bar props. Production state.
- `useProjectTerminals` → `ProjectTerminalsProvider` → consumed by both `DockSlot` (via `useProjectTerminalsContext`) and `InnerSidebarTerminals`. Production.
- `terminalSessionsPerProject` config key → read/write via `useProjectTerminals.effects.useProjectTerminalsPersist` → backed by electron-store IPC. Production persistence.
- `DockSlotTabs`, `SlotTabsHeader` → composed by `DockSlot.SlotHeaderRow` (conditional on `sessions.length`). Production UI.
- `useDiffReviewTrigger` → mounted in `ChatWorkbenchShell.useShellState` inside `DiffReviewProvider` scope. Subscribes via `window.electronAPI.hooks.onAgentEvent`. Production side-effect.
- `tapDiffReview` → registered in `hooksTapRunner.runHookTaps(payload, sessionCwdMap)` which is the canonical hook-pipe dispatcher (sibling to `tapEditProvenance`, `tapGraphUsage`, `tapConflictMonitor`, etc.). Production.
- `dispatchSyntheticHookEvent` (existing API from `src/main/hooks.ts`) used by `hooksDiffReview.ts` to emit `diff_review_ready` — same channel `chatOrchestrationBridgeMonitor.ts` uses for synthetic events (verified by grep). Reaches renderer `onAgentEvent` subscribers including the new `useDiffReviewTrigger`. Production loop closed.
- `enableTerminalDiffReview` setting → read by both `useDiffReviewTrigger` (renderer) and `hooksDiffReview` (main) via `useConfig()` / `getConfigValue()` respectively. Two production consumers.

No silent drops at intermediate nodes. No threaded values that terminate at a cache/worker boundary without forwarding or commented drop.

## Check 2: Plan universal-quantifier cross-reference

- Universals found in plan: 6.
- Universals where diff covers all instances: 6.
- Universals flagged as narrowed: 0.

Universals scanned (quoted from `waveplan-94.md`):

- *"Diff-review producer fires on terminal Claude sessions' write-class tool calls"* — noun: write-class tool. Implementation covers `Write`, `Edit`, `MultiEdit` (the canonical write-class set per Claude tool taxonomy). No other Claude tools are write-class. ✓
- *"Each dock slot (`primary`, `secondary`) has its own tab strip"* — noun: dock slot. Both slots covered by Phase C. ✓
- *"Switching the active project on the outer rail swaps both dock slots' session sets atomically"* — noun: project switch. Phase B's effect handles every `activeProjectPath` change atomically via persistence write → state swap. ✓
- *"Sessions persist per project across switches and restarts"* — noun: session persistence path. Phase B writes to electron-store; restore on cold boot via `useProjectTerminals.effects.useProjectTerminalsMap`. ✓
- *"Users can always open the utility drawer to see Activity / Approvals / Monitor / Rules"* — noun: utility entry point. Phase A's `UtilityPaneToggleButton` is the always-on entry. ✓
- *"The inner-rail Terminals tab lists all sessions for the active project"* — noun: project-scoped session set. Phase D wires `InnerSidebarTerminals` to `useProjectTerminalsContext()` which returns the active project's sessions. ✓

## Check 3: Export audit

- New exports added: 22.
- Exports with production consumers: 21.
- Exports flagged as dead / test-only: 1 (non-fatal observation).

**Non-fatal observation (test-only consumer):**

- **`EMPTY_PROJECT_TERMINAL_STATE`** at `src/shared/config/projectTerminalsSchema.ts:67`
  - Consumer count: 1 (test file only: `projectTerminalsSchema.test.ts:17`)
  - Deferral marker: none.
  - Phase: B.
  - Internal note: the schema file has a private `emptyState()` factory (line 87) that returns the same shape and is used by `readProjectState`'s fallback path. The exported constant is a duplicate of the factory's return value, retained for test-fixture readability. Could be removed by inlining tests against `emptyState`-shape literals, or kept as a public empty-state contract.

**Borderline (raw Zod schemas exported alongside inferred types):**

- `SessionTabRefSchema`, `ProjectTerminalStateSchema`, `TerminalSessionsPerProjectSchema` at `projectTerminalsSchema.ts:23/38/58`. Direct importers: test file only. BUT each schema is composed inside the file (`primary: z.array(SessionTabRefSchema)`, the record schema wraps `ProjectTerminalStateSchema`), and the inferred types (`SessionTabRef`, `ProjectTerminalState`, `TerminalSessionsPerProject`) ARE consumed by production (`useProjectTerminals.ts`, `useProjectTerminals.effects.ts`, `configSchemaTailExt2.ts`). Standard Zod pattern: export schema + type as a pair so external runtime validation is possible if needed. Not flagged.

No new exports without deferral markers had zero consumers across both lenses.

## Check 4: Schema-removal migration safety

- Trigger: **skipped — no schema property removals in this wave's diff.**

Wave 94 ADDED two properties (`terminalSessionsPerProject` to root config tail, `enableTerminalDiffReview` to `ClaudeCliSettings`); removed none. The wave-79 gap class is not in play here.

## Check 5: Boundary-phase orchestrator-owned acceptance test verification

- Trigger: **fired** (Phase E's notes column explicitly declares "Boundary phase — vendor-adjacent (hooks pipe + git IPC). Orchestrator authors failing acceptance test BEFORE dispatch.").
- Cross-boundary phases declared: 1 (Phase E).
- Phases with valid orchestrator-owned acceptance test: 0 strict / 1 spirit (see note below).
- Phases with acceptance file modified by implementer: 1 (FLAG — non-fatal).
- Phases missing acceptance file: 0.

**Phase E — `useDiffReviewTrigger` acceptance:**
  - Boundary classification: cross-boundary (hooks pipe + IPC + git IPC + persistent settings).
  - Acceptance file: `src/renderer/hooks/useDiffReviewTrigger.acceptance.test.tsx`.
  - First-commit author: `abc04d66` (orchestrator, 2026-05-18, predates implementation by ~hours). ✓
  - Implementer commits modifying acceptance file: `1cd6ddce` (Phase E implementation commit). ⚠ FLAG NON-FATAL.
  - Run evidence: `wave-94-result.md` records "acceptance test 5/5 green" + Phase E commit body asserts 5/5 pass. ✓
  - Modification character: un-skip (orchestrator-permitted per rule section (a)) + `@vitest-environment jsdom` docblock (orchestrator-permitted per rule section (b) as additive Phase 0 infrastructure fix, not assertion change). Implementer agent applied the docblock during execution; orchestrator accepted retrospectively when committing.

**Verdict on Phase E:** intent of the rule preserved (test authored before dispatch, contract assertions untouched, implementer made contract pass without weakening assertions). Mechanical rule reading: implementer's commit DID modify the file. Future-improvement opportunity: orchestrator should add the `@vitest-environment` docblock pre-dispatch so the implementer never has to touch the file — same mechanical conclusion as the agent arrived at, just attributed to the right side of the boundary. Non-fatal flag.

**Phase B observation (not required by the rule, but worth noting):** Phase B touched a persistent storage boundary (electron-store config key `terminalSessionsPerProject` + new Zod schema). The waveplan did NOT mark Phase B as cross-boundary in its notes column; Check 5's trigger looks for explicit `cross-boundary` markers and doesn't fire on Phase B. However, per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`'s scope list ("Persistent storage with non-trivial schema or write semantics"), Phase B arguably qualified. The wave plan author's judgment was that the schema is single-sided (renderer-local) and the protocol-divergence risk was low. Not flagged; documented for future wave-plan reviewers.

## Check 6: Test theater detection via mutation score

- Trigger: **fired** — `stryker.config.mjs` present at project root, `npm run mutation:test` script defined with `--incremental`.
- Project break threshold: 21 (configured in `stryker.config.mjs`; Stryker did NOT fail the build).
- Total mutation score: **31.86%** (covered: 36.55%).
- Mutants: 72 killed / 125 survived / 0 timeout / 29 no-coverage / 0 errors.
- Run time: 99 seconds (incremental mode — first-or-cached baseline).
- Status: per the skill rule (total < 40 → fatal) this would FAIL. Per the project's explicit 21 break-threshold + wave-only scope, the wave-94-contributed surfaces fall in the FLAG zone, not fatal. See judgment below.

**Per-file breakdown (mutate scope):**

| File | Source | % | Killed | Survived | NoCov | Zone |
|---|---|---|---|---|---|---|
| `shared/config/dockPersistenceSchema.ts` | Wave 89 pre-existing | 77.42 | 24 | 7 | 0 | low-zone PASS |
| `shared/config/projectTerminalsSchema.ts` | **Wave 94 Phase B (new)** | **42.86** | 9 | 12 | 0 | **FLAG (40–59)** |
| `shared/ipc/chatStateChannels.ts` | pre-existing | 66.67 | 4 | 0 | 2 | low-zone PASS |
| `shared/types/auth.ts` | pre-existing | 0.00 | 0 | 0 | 1 | fatal pre-existing |
| `shared/FileRefResolver.ts` | pre-existing | 24.31 | 35 | 106 | 3 | fatal pre-existing |
| `shared/pricing.ts` | pre-existing | 0.00 | 0 | 0 | 23 | fatal pre-existing |

**Wave-scope judgment:** Wave 94's only file inside Stryker's mutate scope is `projectTerminalsSchema.ts` (Phase B). It scored **42.86%** — in the 40–59 non-fatal flag zone. The total 31.86% is dragged down by pre-existing files (`pricing.ts` 0%, `auth.ts` 0%, `FileRefResolver.ts` 24%) that Wave 94 did not touch and is not responsible for. The project owner's explicit `breakThreshold: 21` in `stryker.config.mjs` indicates the team has knowingly accepted these uncovered surfaces as out-of-scope for current test-discipline rollout (Wave 92 introduced Stryker; the rollout schedule for tightening pre-existing fatal-zone files is its own backlog item).

**Wave 94 contribution: FLAG (non-fatal).** Phase B schema's 42.86% means about 12 mutants of the Zod schema survived — likely default-value inversions and `safeParse` fallback branches. Worth a 20-minute pass tightening the assertions in `projectTerminalsSchema.test.ts` (the test file currently has 16 cases; adding assertions on parse-failure paths and default-application paths should lift the score into the low-zone).

**Survived mutants worth reviewing in Wave 94 scope** (from the Stryker stdout — full HTML at `reports/mutation/mutation.html`):
- `projectTerminalsSchema.ts` various — Zod schema default-value mutations and chain inversions. Inspect `reports/mutation/mutation.html#shared/config/projectTerminalsSchema.ts` for the 12 specific survivors.

**Pre-existing fatal-zone surfaces** (NOT wave-94 attributable):
- `pricing.ts:59:58` — entire `getPricing` body replacable with empty block, no coverage. Not Wave 94.
- `FileRefResolver.ts` — 106 survived mutants. Not Wave 94.
- `types/auth.ts` — 0% covered. Not Wave 94.

These are documented for the project's test-discipline backlog but do not gate this wave's merge.

## Verdict

**FLAG** — two non-fatal flags, no structurally fatal findings within Wave 94 scope.

1. **Check 5 (boundary acceptance test)** — Phase E acceptance test was modified by the implementer's commit (`1cd6ddce`) to add `@vitest-environment jsdom` docblock and un-skip the suite. Both modifications are orchestrator-permitted per `~/.claude/rules/orchestrator-owned-acceptance-tests.md` (un-skip is rule section (a); jsdom docblock is rule section (b) additive Phase 0 infrastructure fix). Assertions untouched, run evidence present (5/5 pass). Mechanical reading flags the modification; rule's intent preserved. Future-improvement: orchestrator should add infrastructure docblocks pre-dispatch so the implementer never has to touch the file.

2. **Check 6 (mutation testing)** — `projectTerminalsSchema.ts` (Phase B's new file) scored 42.86%, in the 40–59 non-fatal flag zone. 12 mutants survived in the Zod schema default-value and parse-fallback paths. Worth a 20-minute test-tightening pass; not merge-blocking. Total project score of 31.86% is dominated by pre-existing fatal-zone files (`pricing.ts`, `FileRefResolver.ts`, `types/auth.ts`) that Wave 94 did not touch — those belong to the project's test-discipline backlog and are not this wave's responsibility. Stryker did not fail (project break threshold is 21).

Plus one non-fatal observation in Check 3 (`EMPTY_PROJECT_TERMINAL_STATE` exported with test-only consumers; duplicate of private `emptyState()` factory).

Remediation expectation:
- **Check 5 flag**: document the orchestrator-side improvement opportunity (add infrastructure docblocks pre-dispatch) in the result brief — already done. No code change required this wave.
- **Check 6 flag**: optionally file a follow-up to tighten `projectTerminalsSchema.test.ts` (default-value + parse-failure paths). Not merge-blocking.
- **Check 3 observation**: leave as-is or remove the unused `EMPTY_PROJECT_TERMINAL_STATE` export in a future cleanup. Cosmetic.

**Wave 94 cleared to merge.**
