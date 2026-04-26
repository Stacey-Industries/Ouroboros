# Wave 48 — Token Baseline Quick Wins
## Implementation Plan (DRAFT)

**Version target:** v2.7.0 (minor — IDE-spawned Claude Code baseline reduction)
**Feature flags:** new `context.leanForSimpleGoals` (default `true`), new `internalMcpScope` (`always` | `task-gated`, default `task-gated`), new `workspaceState.dedupe` (default `true`)
**Dependencies:** none — all changes live in `src/main/orchestration/*` and `src/main/internalMcp/*`
**References:**
- `src/main/orchestration/providers/claudeCodeLaunch.ts`
- `src/main/orchestration/providers/claudeCodeContextBuilder.ts`
- `src/main/orchestration/providers/claudeStreamJsonRunner.ts`
- `src/main/orchestration/providers/claudeCodeHelpers.ts`
- `src/main/internalMcp/internalMcpAutoInject.ts`
- `src/main/internalMcp/internalMcpTools.ts`
- `src/main/codebaseGraph/mcpToolHandlers.ts`
- `CLAUDE.md` (project root)

---

## Overview

The IDE-spawned Claude Code baseline for a bare "Hi" turn is ~60k tokens vs ~50k for terminal CLI in the same project. Investigation of `db51e123-*.jsonl` and the spawn pipeline in `claudeCodeHelpers.ts` shows the delta is ~10k and comes from two sources the IDE controls:

1. **`<ide_context>` first-turn pack** (~5k) — injected by `buildXmlContextBlock` regardless of whether the user's goal would benefit from pre-loaded file snippets.
2. **Ouroboros internalMcp schemas** (~5–7k) — `main.ts:95-113` auto-injects `mcpServers.ouroboros` into `.claude/settings.json` at startup, so every spawned claude eagerly loads the 10–14 graph tool schemas into its System Tools bucket.

Neither cost is wrong — both tools provide real value on real investigations — but both are paid on **every** turn regardless of whether the turn needs them. Wave 48 targets the clean "pay only when needed" wins without touching harder questions (CodeMode integration, CLAUDE.md rewrites, rule-to-hook migration — each of those gets its own wave).

Wave 48 also adds a **graph-usage logging hook** so we have ground-truth data on whether agents actually use the graph tools they're paying for. Tier-1 enforcement and Tier-3 trimming follow in Wave 50 once we have data.

---

## Implementation review summary

### Confirmed state

- `context.packetMode` flag exists with values `'full'` | `'lean'`, default `'full'`. Lean mode already gates `<project_structure>` and caps `<relevant_code>` entries to `LEAN_MAX_FILES`. Underused because default is `'full'`.
- `internalMcpEnabled: true` by default in `configSchemaTail.ts:221`. Binary on/off — no task-level gating.
- `injectIntoProjectSettings` writes `{mcpServers: {ouroboros: {url: 'http://127.0.0.1:<port>/sse'}}}` at startup, removes on shutdown.
- `buildResumeContextBlock` already sends only `<workspace_state>` on resume turns (not `<relevant_code>`). But `<workspace_state>` is re-sent every turn with no dedupe — same 4-commit list re-serialized even when nothing has changed.
- `appendSettingFlags` in `claudeStreamJsonRunner.ts:28-41` supports `allowedTools` / `disallowedTools` / `appendSystemPrompt` / `addDirs`. No `--strict-mcp-config` flag is used today.
- `claudeMdGenerator.ts` uses haiku/sonnet/opus to generate all 51 CLAUDE.mds — orthogonal to this wave, covered in Wave 49.

### Gaps this wave closes

- **internalMcp is always-on.** Casual chat turns that will never touch code still pay ~5–7k to have graph tool schemas loaded.
- **Packet mode is always `'full'`.** A "Hi" message pays for `<relevant_code>`, `<project_structure>`, graph summary, and terminal output when none are useful.
- **`<workspace_state>` re-serializes every turn.** 300–400 tokens per follow-up turn, compounding over long sessions.
- **internalMcp tool descriptions are verbose.** Written before eager-loading was a bottleneck; ~40% reducible without losing call-site accuracy.
- **No `--strict-mcp-config`.** Spawned claude inherits the user's full MCP server list (github, sentry, context7, Gmail/Calendar/Drive). In `-p` mode those schemas may be eagerly materialized.
- **Zero visibility into graph tool usage.** We pay 5–7k per spawn for graph tools but have no data on whether agents actually use them vs. still reach for Grep/Read.

---

## Scope

### In-scope

- Gate `internalMcp` injection by task type / goal heuristic (still honor `internalMcpEnabled: false` as the global kill).
- Make `<ide_context>` packet mode goal-sensitive (auto-detect when lean mode suffices).
- Suppress `<workspace_state>` re-injection when the block is byte-identical to the previously sent block.
- Trim internalMcp tool descriptions (~40% reduction, manual edit pass).
- Investigate `--strict-mcp-config` and ship a scoped MCP config file for the spawn path if beneficial.
- Add a `PreToolUse` hook that logs Grep/Read calls with symbol-shaped arguments but does NOT block — telemetry only.
- Add a "graph-first" paragraph to project `CLAUDE.md` with trigger language.
- Telemetry counters for every change so we can measure actual savings.

### Out-of-scope

- Rewriting nested CLAUDE.mds (Wave 49).
- Rule-to-hook migration beyond the single logging hook (Wave 50).
- CodeMode integration with internalMcp (Wave 51).
- ContextPacket ranker tuning (Wave 52).
- Removing the user's `~/.claude/CLAUDE.md` or global rules.
- Changing anything in terminal-CLI behavior.

---

## Verified starting point

Reusable systems already in place:

- `claudeCodeContextBuilder.ts` — `buildXmlContextBlock`, `buildResumeContextBlock`, `resolvePacketMode`, `LEAN_MAX_FILES`.
- `claudeCodeHelpers.ts` — `launchHeadless`, `pickSettingOverrides`.
- `claudeStreamJsonRunner.ts` — `buildStreamJsonArgs`, `appendSettingFlags`.
- `internalMcpAutoInject.ts` — `injectIntoProjectSettings`, `removeFromProjectSettings`.
- `internalMcpTools.ts` — `ALL_TOOLS`, `getActiveTools`, `findTool`.
- Config surface: `context.packetMode`, `internalMcpEnabled`.
- Hook installer at `hookInstaller.ts` and generic hook entry table at `hookInstallerCommands.ts:12-33`.

Explicitly targeted:

- Goal-shaped heuristic for lean vs full packet mode.
- Task-gated internalMcp injection decision point.
- Workspace state byte-comparison dedupe.
- Internal MCP tool description trim pass.
- Scoped MCP config file generation.
- Graph-usage telemetry hook.
- Binding CLAUDE.md paragraph.

---

## Architecture

```text
spawn pipeline (unchanged shape, new decision points)
 ├─ resolveEffectiveSettings  (unchanged)
 ├─ buildInitialPrompt
 │    └─ classifyGoal()                    ← NEW: decides packetMode
 │         ├─ codeGoal   → mode='full'
 │         └─ casualGoal → mode='lean'
 ├─ resolveInternalMcpScope()              ← NEW: task-gated injection
 │    ├─ taskNeedsGraphTools  → ensure ouroboros entry present
 │    └─ otherwise            → remove ouroboros entry before spawn
 ├─ buildScopedMcpConfig()                 ← NEW: --strict-mcp-config path
 │    └─ writes tmp file with only required servers, passes flag
 ├─ buildWorkspaceStateBlock()
 │    └─ dedupeCheck()                     ← NEW: suppress if unchanged
 └─ spawnStreamJsonProcess  (unchanged)

telemetry hook path (new)
 ├─ PreToolUse (Grep|Read) → logGraphAvoidance
 └─ telemetry sink         → structured JSONL in ~/.ouroboros/telemetry/
```

**Key design calls:**

- Goal classification is heuristic-only. Short messages, no code tokens, no file paths → lean. Anything else → full. No LLM-based routing — that's more tokens, not fewer.
- Task-gated internalMcp must not cause spawn loops when the file is already in the right state. Check desired state vs. actual state before writing.
- Workspace state dedupe must be per-thread, not per-turn — if the thread resumes a day later with nothing changed, we should still dedupe.
- The graph-usage hook is logging-only this wave. Enforcement (rejecting Grep/Read with "use graph tools") waits for Wave 50 once we have data.

---

## Phase A — Goal-sensitive packet mode

**Goal:** Route casual prompts through lean packet mode automatically.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/providers/goalClassifier.ts` | ~140 | Heuristic classifier: returns `'code'` \| `'casual'` \| `'unknown'` from goal text. Regex-based (file paths, code tokens, command shells, question shapes). No LLM call. |
| `src/main/orchestration/providers/goalClassifier.test.ts` | ~180 | Fixture-driven tests for classification accuracy — ~30 sample prompts with expected classification. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeCodeContextBuilder.ts` | `resolvePacketMode` accepts a `goalHint?: 'code'\|'casual'` parameter. If config is `'auto'` or unset and `goalHint==='casual'`, return `'lean'`. Preserve explicit `'full'`/`'lean'` config values. |
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | `buildInitialPrompt` callsite passes `classifyGoal(context.request.goal)` through to `buildXmlContextBlock`. |
| `src/main/configSchemaTail.ts` | Add `context.packetMode: 'full'\|'lean'\|'auto'` — default `'auto'`. Migrate existing `'full'` users unchanged. |

### Subagent briefing

- **Read first:** `claudeCodeContextBuilder.ts:155-169`, `claudeCodeLaunch.ts:120-125`, `configSchemaTail.ts`.
- Classifier is **regex heuristics**, not a model. Keep it fast and explainable.
- Casual indicators: message under ~80 chars, question marks, no code-fence tokens, no file path patterns, no function-call shapes, no shell commands.
- Code indicators: file paths (`src/`, `.ts`, `/`), identifier shapes (`handleX`), code fences, error messages, "review this / debug this / fix this" triggers.
- When ambiguous, default to **lean** — better to under-serve context than over-pay on every turn.
- Respect explicit `'full'`/`'lean'` config — don't override user choice.

### Acceptance

- [ ] `'auto'` mode classifies goal text and routes accordingly.
- [ ] "Hi" goal produces `'lean'` packet (~1k `<ide_context>` instead of ~5k).
- [ ] "Review this bug in src/main/agentChat" produces `'full'` packet.
- [ ] Explicit `'full'`/`'lean'` overrides classifier.
- [ ] Fixture tests cover 30+ sample prompts.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-48): Phase A — goal-sensitive packet mode`

---

## Phase B — Task-gated internalMcp injection

**Goal:** Stop loading 10–14 graph tool schemas on every chat spawn; only inject when the task needs them.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/internalMcp/internalMcpScope.ts` | ~120 | Decides whether the current spawn needs graph tools. Takes goal classification + task type + explicit request flags. Returns `{ shouldInjectOuroboros: boolean, reason: string }`. |
| `src/main/internalMcp/internalMcpScope.test.ts` | ~140 | Matrix test for all combinations: goal classification × task type × explicit override. |

### Modified files

| File | Change |
|---|---|
| `src/main/internalMcp/internalMcpAutoInject.ts` | Add `ensureDesiredState(projectRoot, port, shouldInject)` — idempotent; reads current state, only writes if delta. |
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | Before `scheduleLaunch`, call `ensureDesiredState` with the scope decision. |
| `src/main/main.ts:95-113` | No longer inject unconditionally at app startup. Keep the server running, but let each spawn decide. |
| `src/main/configSchemaTail.ts` | Add `internalMcpScope: 'always' \| 'task-gated' \| 'never'` — default `'task-gated'`. `internalMcpEnabled: false` still short-circuits everything. |

### Subagent briefing

- **Read first:** `main.ts:95-125`, `internalMcpAutoInject.ts`, `internalMcpTypes.ts`, `internalMcpTools.ts`.
- Startup can still start the server — just don't auto-inject the settings entry unconditionally.
- Each spawn's decision must be idempotent against the settings file. Read → compare → write only if delta.
- The app-quit `removeFromProjectSettings` hook still fires — make sure it's safe when the entry wasn't present anyway.
- `'always'` = pre-48 behavior. `'never'` = global kill. `'task-gated'` = the new default.

### Acceptance

- [ ] "Hi" chat spawn does NOT have `mcpServers.ouroboros` in settings.
- [ ] "Debug this in src/main" spawn DOES have it.
- [ ] Toggling `internalMcpScope: 'always'` restores old behavior.
- [ ] Settings file mutation is idempotent (no unnecessary writes).
- [ ] App shutdown leaves the settings file clean.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-48): Phase B — task-gated internalMcp injection`

---

## Phase C — Workspace state dedupe + internalMcp tool trim

**Goal:** Two independent small wins bundled — drop the repeated `<workspace_state>` and tighten the internalMcp descriptions.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/providers/workspaceStateDedupe.ts` | ~100 | Per-thread last-sent-block cache. Emit new block only if content hash differs. |
| `src/main/orchestration/providers/workspaceStateDedupe.test.ts` | ~100 | Cache hit/miss behavior, eviction, multi-thread isolation. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeCodeContextBuilder.ts` | `buildResumeContextBlock` consults `shouldSendWorkspaceState(threadId, blockContent)` before including the section. |
| `src/main/internalMcp/internalMcpToolsGraph.ts` | Tighten every `description` field on the 6 graph tools. Target 40% reduction per description. Keep call-site guidance, drop background prose. |
| `src/main/internalMcp/internalMcpToolsModules.ts` | Same trim for the 4 module tools. |
| `src/main/codebaseGraph/mcpToolHandlerDefs.ts` | Same trim for the graph-pipeline tools exposed via `createGraphMcpTools`. |

### Subagent briefing

- **Read first:** `claudeCodeContextBuilder.ts` `buildResumeContextBlock`, all three tool description files.
- Dedupe cache is module-scoped `Map<threadId, contentHash>`, evict on session end.
- For tool description trims, preserve the one-line "when to call this" guidance — the part a model reads to decide which tool to call. Drop everything else (examples, multi-paragraph rationale, redundant cross-refs).
- Run `npx vitest run` on `mcpToolHandlers` after trimming to make sure nothing parses the description as required metadata.

### Acceptance

- [ ] Identical `<workspace_state>` on consecutive turns produces one send + `null` on subsequent.
- [ ] A changed commit / edited-files list sends a fresh block.
- [ ] Tool descriptions each shorter by 30%+ without losing call-site clarity.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-48): Phase C — workspace state dedupe and tool description trim`

---

## Phase D — Scoped MCP config via `--strict-mcp-config`

**Goal:** Pass claude only the MCP servers relevant to the spawn, not the user's full inherited list.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/providers/scopedMcpConfig.ts` | ~160 | Builds a temp JSON file with only the MCP servers required for the current task. Returns path. Cleans up on process exit. |
| `src/main/orchestration/providers/scopedMcpConfig.test.ts` | ~140 | Builder tests: respects `internalMcpScope`, includes/excludes based on goal, cleanup on exit. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeStreamJsonRunner.ts` | `buildStreamJsonArgs` accepts `mcpConfigPath?: string`. If present, append `--mcp-config <path>` and `--strict-mcp-config`. |
| `src/main/orchestration/providers/streamJsonTypes.ts` | Add `mcpConfigPath?: string` to `StreamJsonSpawnOptions`. |
| `src/main/orchestration/providers/claudeCodeHelpers.ts` | `launchHeadless` builds the scoped config, threads the path through to `spawnStreamJsonProcess`, registers cleanup in `invocationTempPaths`. |

### Subagent briefing

- **Read first:** Claude Code CLI docs on `--mcp-config` and `--strict-mcp-config`. Verify the exact filename/flag shape against current CLI version (context7 lookup).
- The scoped config replaces settings inheritance entirely. You have to include any MCP server the agent actually needs (including ouroboros when task-gated is true).
- Cleanup MUST fire on both success and error paths — leaked temp files in `%TEMP%` pile up.
- If `--strict-mcp-config` turns out to be CLI-version-gated, detect the CLI version and fall back to inheritance when unsupported.

### Acceptance

- [ ] Spawn uses `--mcp-config <tmp>` and `--strict-mcp-config` when feature flag enabled.
- [ ] Temp file contains only task-relevant servers.
- [ ] Temp file is removed after process exit.
- [ ] Feature flag off = previous behavior exactly.
- [ ] Telemetry counter records scoped-config usage.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-48): Phase D — scoped MCP config for spawned claude`

---

## Phase E — Graph-usage telemetry hook + CLAUDE.md binding paragraph

**Goal:** Ship the data pipeline that tells us whether agents actually use graph tools, and the minimal CLAUDE.md nudge to shift behavior.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/hooks/graphUsageLogger.ts` | ~180 | `PreToolUse` hook handler: inspects Grep/Read args, classifies as "symbol-shaped" or "literal", writes a JSONL entry to `~/.ouroboros/telemetry/graph-usage.jsonl`. Non-blocking. |
| `src/main/hooks/graphUsageLogger.test.ts` | ~160 | Classification tests + log-write tests. |

### Modified files

| File | Change |
|---|---|
| `src/main/hookInstallerCommands.ts` | Add `PreToolUse` entry pointing at a new `graph_usage_hook.ps1`/`.sh`. |
| `src/main/hooksSessionHandlers.ts` | Route `PreToolUse` events through `graphUsageLogger.log` when the event's `tool_name` is `Grep` or `Read`. |
| `CLAUDE.md` (project root) | Add "Graph-first rule" section before existing "Key Conventions". Binding language: "MUST call graph tools before Grep/Read for symbol/structural queries." |
| `.claude/rules/graph-tool-routing.md` | Pointer update: reference the binding paragraph in root CLAUDE.md as the authoritative rule. |

### Subagent briefing

- **Read first:** `hookInstallerCommands.ts:12-33` for event table, existing hook handler files for pattern, `~/.claude/rules/graph-tool-routing.md` for existing descriptive language.
- Logging hook is **data collection only**. It must not block or modify tool calls. Emit a telemetry line and return.
- Symbol-shaped heuristic: bare identifier, regex with `\w`/`\s`/`[a-zA-Z]`, function-definition patterns. Literal: quoted strings, error messages, config values.
- CLAUDE.md paragraph is prescriptive. Example shape: "For any query about symbols, functions, callers, call paths, or code structure, you MUST call `search_graph` / `get_symbol` / `get_code_snippet` / `trace_call_path` BEFORE Grep or Read. Fall back to Grep/Read only when graph returns empty or the query is a literal string search."
- Do NOT add an enforcing hook this wave. Wave 50 does that once we have data.

### Acceptance

- [ ] Grep/Read calls emit JSONL telemetry entries to `~/.ouroboros/telemetry/graph-usage.jsonl`.
- [ ] Entries include: timestamp, sessionId, tool, classified shape, pattern/path (redacted as needed), goal classification.
- [ ] No tool calls blocked or delayed.
- [ ] Project `CLAUDE.md` has the binding paragraph.
- [ ] Telemetry file is excluded from git via `.gitignore`.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-48): Phase E — graph-usage telemetry and binding rule`

---

## Phase F — Integration coverage, telemetry dashboard, docs

**Goal:** Prove the real spawn path actually saves tokens, document the knobs, wrap up.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/orchestration/providers/spawnTokenBudget.integration.test.ts` | ~260 | End-to-end: build prompt for casual vs code goal, assert packet mode + mcp scope + workspace dedupe all behave. |
| `scripts/summarize-graph-usage.ts` | ~140 | Reads `graph-usage.jsonl`, outputs daily rollup: total Grep/Read calls, % symbol-shaped, % where agent had just-loaded graph tools but chose Grep. |
| `docs/token-budget.md` | ~180 | Operator-facing doc: what each config controls, how to measure savings, troubleshooting. |

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` (project root) | Update "Known Issues / Tech Debt" with any Wave 48 items deferred. |
| `docs/architecture.md` | Reflect task-gated internalMcp, goal-sensitive packet mode, scoped MCP config. |
| `roadmap/session-handoff.md` | Record soak checklist and follow-ups for Wave 49. |

### Acceptance

- [ ] Integration test proves casual-goal spawn is ≥4k tokens lighter than pre-48.
- [ ] Telemetry rollup script runs and produces a readable summary.
- [ ] Docs describe the three new config flags and their interactions.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-48): Phase F — integration coverage, telemetry rollup, docs`

---

## Subagent execution model

- **Model:** `sonnet`
- **Isolation:** sequential on `master`
- **Test policy:** scoped vitest per phase; parent runs full suite at wave close
- **Lint policy:** no relaxations
- **Debug policy:** after one failed speculative fix, add instrumentation rather than guessing
- **Commit policy:** one commit per phase, conventional commits, local-only
- **Scope discipline:** do NOT touch CLAUDE.md content (Wave 49), rule-to-hook conversions beyond the single logging hook (Wave 50), or CodeMode wiring (Wave 51)

### Phase dispatch order

1. **Phase A** — goal-sensitive packet mode
2. **Phase B** — task-gated internalMcp injection
3. **Phase C** — workspace state dedupe + internalMcp tool trim (parallel-safe with B)
4. **Phase D** — scoped MCP config
5. **Phase E** — telemetry hook + binding paragraph
6. **Phase F** — integration, rollup, docs

Phases A and C are independent; A and B touch adjacent code and should serialize. D depends on B's injection decision plumbing.

---

## Risks

| Risk | Mitigation |
|---|---|
| Goal classifier false-negatives produce lean mode on real code tasks. | Default to `'full'` on any ambiguous signal. Telemetry records classification — tune fixtures over time. |
| Task-gated internalMcp causes settings file churn. | Idempotent `ensureDesiredState` — only write on delta. Atomic rename. |
| `--strict-mcp-config` turns out to be unavailable on the pinned CLI version. | Detect CLI version at spawn time, fall back to inherited config when unsupported. Telemetry counter for fallback rate. |
| Dedupe cache keeps stale state across thread resumes. | Evict on `StopFailure` + `SessionEnd` hook events. Cap cache size at 100 threads. |
| Tool description trim removes metadata the CLI actually uses. | Full vitest run on `mcpToolHandlers` before/after trim. Visual diff review. |
| Graph-usage logging writes produce disk pressure on long sessions. | Async write, 10ms batching, 100MB rotation cap. |

---

## Acceptance criteria (wave-level)

- [ ] Six phase commits present on `master`.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] "Hi" in IDE chat produces spawn ≥4k tokens lighter than pre-48 baseline (measure via `claudeStreamJsonRunner` stdin length).
  - [ ] "Debug this" in IDE chat still loads internalMcp.
  - [ ] Telemetry file shows graph-vs-grep split after 10+ sessions.
  - [ ] Workspace state suppressed when unchanged between turns.
  - [ ] Scoped MCP config only includes relevant servers.

---

## Out-of-wave follow-ups

- **Wave 50 enforcement:** once telemetry shows the graph-vs-grep split, decide whether to convert the logging hook into an enforcing hook.
- **Goal classifier refinement:** if false-negative rate >5% in the rollup, tune fixtures.
- **Dynamic tool-schema trimming:** consider shipping even leaner internalMcp schemas when `internalMcpScope === 'task-gated'` at spawn time.
- **Telemetry backfill:** extend the rollup script to parse historical `~/.claude/projects/*/*.jsonl` sessions for pre-48 vs post-48 comparison.
