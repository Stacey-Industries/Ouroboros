# Wave 54 — TypeScript Semantic Operations (Conditional)
## Implementation Plan (DRAFT)

**Version target:** v2.9.0 (minor — new agent capability; TS-only first-party semantic ops)
**Feature flags:** new `semanticOps.tsserver.enabled` (default `false` until Phase C validates), new `semanticOps.exposeAsTools` (default `false` — controls whether agent sees the tools)
**Dependencies:**
- **Wave 53 Phase D must have shipped and produced a "semantic ops gap is real" decision report.** This wave MUST NOT start otherwise.
- Wave 48 telemetry for per-turn outcome measurement
- Wave 51 CodeMode routing is a *preferred* exposure path (reduces per-spawn schema cost for the new tools) but not a hard dependency — falls back to direct MCP injection if 51 isn't shipped
**References:**
- `roadmap/wave-53-corpus-analysis.md` (gating decision artifact)
- `roadmap/telemetry-recovery-and-corpus-analysis.md`
- `src/main/codebaseGraph/` (the repo-cognition layer; not replaced by this wave)
- `src/main/internalMcp/` (if exposing via MCP)
- `src/main/orchestration/providers/claudeCodeEventHandler.ts` (tool event integration)
- Monaco editor API for buffer state synchronization
- TypeScript Language Service (`typescript/lib/tsserver.js`) — the embed target

---

## Conditional start guard

**This wave is gated on Wave 53 Phase D's decision report.** The report explicitly answers:

1. What fraction of turns showed grep-loop depth ≥3?
2. What fraction of Edits failed on first attempt?
3. What fraction of turns had rename/refactor/find-usages intent?
4. Is the concentration of Edit failures correlated with rename/refactor intent?

**Start conditions:**
- ≥10% of turns show grep-loop depth ≥3 OR
- ≥15% of Edits fail on first attempt OR
- ≥5% of turns have rename/refactor intent AND those turns show above-average failure rates

**If none of the above hold, this wave does not start.** The measurement has answered "no real gap"; revisit after a workflow shift.

If the decision is "yes, the gap is real," Wave 54 implements **native in-process `tsserver` integration** for TypeScript semantic operations — no wrapper abstraction, no Serena, no multi-language ambition. 95% of the codebase is TypeScript; this wave serves that 95% correctly before worrying about the rest.

---

## Overview

The IDE's `codebaseGraph` (tree-sitter-backed SQLite graph) is a **repo-cognition layer**: "where should the agent look?", "what's relevant?", "what's the blast radius?". That layer stays; Wave 54 does not replace it.

What the graph cannot answer correctly:

- "Find all *exact* references to this symbol" (not text matches, not import names — actual references).
- "What is the precise body range of this function?"
- "What is the type of this expression?"
- "Can I delete this symbol safely — is anything calling it?"

Those require a real language service. For TypeScript, that's `tsserver` — the same engine VS Code embeds, Monaco can talk to, and which you already have in `node_modules`. Embedding it in-process gives you:

- **Zero external subprocess / MCP / stdio round-trip latency.** The Codex analysis estimated Serena cold-start at 5–30s on a monorepo; in-process tsserver warms once per project and stays resident.
- **Dirty buffer correctness for free.** Monaco already holds the unsaved buffer state. Wiring it to tsserver's `didOpen` / `didChange` is ~50 lines, not an integration saga.
- **TypeScript project reference support** — multi-package monorepos work correctly without workspace-root heuristics.
- **No shared-state fight with an external indexer.** Serena has its own project activation / memory / indexing. Tsserver lives inside your main process with your graph, your checkpoints, your context packets.

The cost is that this is TS-only. That's accepted explicitly: 95% of Ouroboros is TS, the user uses TS projects, and adding Python/Rust/Go later is a separate wave with a different backend. Don't build abstractions for a case that isn't happening.

**The wave ships only read-only + symbol-scoped edits.** `renameSymbol` and `safeDelete` are explicitly deferred to Wave 55 — they require preview + checkpoint + rollback plumbing that this wave doesn't own, and a bad rename is worse than no rename.

---

## Implementation review summary

### Confirmed state (to be verified by Phase A spike)

- `typescript` is already a dependency (verify via `package.json`); `tsserver.js` can be required directly or spawned as a JSON-protocol subprocess.
- Monaco editor (already embedded in `src/renderer/components/FileViewer/`) exposes `ITextModel` with `getValue()` / `onDidChangeContent` — the dirty-buffer source of truth.
- The codebase has 4 project roots typical (per-window via `ManagedWindow.projectRoots`); tsserver needs a project root per instance or careful multi-project handling.
- Wave 53's signal restoration gives us per-turn measurement infrastructure — we can compare turns using semantic ops vs. turns using grep+read on the same kind of intent.

### Gaps this wave closes (conditional on Phase D)

- No way to get exact references for a TS symbol. Current workflow: agent Greps the identifier, sees false positives from comments/strings/same-name variables, wanders.
- No way to replace a function body without line-drift risk. Current workflow: agent reads file, computes exact old_string, hopes it's unique, retries on match failure.
- No way to insert an adjacent helper function / test / export reliably. Current workflow: agent reads file, estimates line numbers, Edits with risk of surrounding edit.
- No measurement of whether semantic ops actually reduce these failure modes when offered.

---

## Scope

### In-scope

- Phase A: in-process `tsserver` embedding + project lifecycle + Monaco buffer sync.
- Phase B: two read-only ops — `findReferences`, `getSymbolBody` — exposed to the agent.
- Phase C: **measurement gate** — measure whether read-only ops shift behavior on real turns. This is a hard checkpoint before Phase D spends effort on mutations.
- Phase D (conditional on Phase C positive): two symbol-scoped mutations — `replaceSymbolBody`, `insertBeforeSymbol` / `insertAfterSymbol`.
- Phase E: integration, docs, explicit decision on whether rename/safeDelete enter a Wave 55.

### Out-of-scope

- Any abstraction layer / `SemanticOperationsProvider` interface (single user, single backend, drop the wrapper).
- Serena integration (rejected — TS-native wins for this codebase).
- Non-TypeScript support (separate wave, separate backend).
- `renameSymbol` (Wave 55, gated on preview/checkpoint/rollback maturity).
- `safeDelete` (Wave 55 or later; demands very high correctness).
- Call hierarchy (interesting but not the highest-value subset per Phase D analysis).
- Replacing `codebaseGraph` — the graph stays as the relevance/blast-radius layer.

---

## Verified starting point

Reusable:

- `typescript` npm package — contains `typescript/lib/tsserver.js` and the programmatic API.
- Monaco editor instance at `src/renderer/components/FileViewer/` — holds unsaved buffer state.
- Wave 53 telemetry infrastructure — per-turn tool-call recording, intent classification, Edit failure tracking.
- Wave 48 `<ide_context>` injection mechanism — can surface "available semantic ops" to the agent.
- Wave 51 CodeMode (if shipped) — preferred exposure path to avoid MCP schema bloat.
- Checkpoint system (`src/main/agentChat/`) — mutations emit checkpoints the same as any Edit.

Explicitly targeted:

- Tsserver embedding + project model.
- Monaco → tsserver buffer sync.
- Per-operation tool handlers.
- Per-turn measurement extension to Wave 53's telemetry.
- Mutation integration with checkpoint system.

---

## Architecture

```text
renderer (Monaco)
 └─ ITextModel.onDidChangeContent ───┐
                                     │
main process (Wave 54)               │
 ├─ tsserverLifecycle                │
 │   ├─ spawn per project root       │
 │   └─ warm on project activation   │
 ├─ tsserverBufferSync ◄──────────── │  IPC bridge: Monaco buffer state
 │   └─ didOpen / didChange          │
 ├─ tsserverClient
 │   ├─ findReferences(file, pos)
 │   ├─ getSymbolBody(file, pos)
 │   ├─ replaceSymbolBody(file, pos, newBody)     ← Phase D
 │   └─ insertBeforeSymbol / insertAfterSymbol    ← Phase D
 ├─ semanticOpsExposure
 │   ├─ if Wave 51 CodeMode active  → expose as servers.tsserver.*
 │   └─ else                         → expose as internalMcp tools
 └─ semanticOpsTelemetry (extension of Wave 53)
     └─ records: opName, targetSymbol, resultCount, turnContext
```

**Key design calls:**

- **In-process embedding, not subprocess.** Subprocess mode is a fallback if in-process turns out to be unstable. Start with the cheaper option.
- **One tsserver instance per project root**, kept warm for the session. Lifecycle tied to `ManagedWindow.projectRoots`.
- **Monaco is the source of truth for buffer state.** Disk reads are a fallback for files not currently open. This is the single most important correctness decision — it removes the dirty-buffer failure mode that plagues external LSP integrations.
- **Symbol identification by (file, position), not name.** Avoids the "which `handleClick`?" ambiguity. The agent passes `file.ts:line:col`; tsserver resolves to the actual symbol.
- **Measurement is a hard gate between B and D.** If Phase C data shows read-only ops are unused or don't move the needle, Phase D does not ship.
- **All mutations emit checkpoints.** `replaceSymbolBody` is still an edit — it goes through the same approval/review/rollback path as any other `Edit` call.

---

## Phase A — Tsserver embedding + buffer sync spike

**Goal:** Prove the core plumbing works before committing to a surface area.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/tsserver/tsserverClient.ts` | ~280 | Embeds `typescript/lib/tsserver.js` (or spawns as subprocess if in-process proves unstable). JSON-protocol request/response wrapper. |
| `src/main/tsserver/tsserverProject.ts` | ~220 | Project activation: resolves tsconfig, registers project root, handles multi-project monorepos via project references. |
| `src/main/tsserver/tsserverLifecycle.ts` | ~200 | Startup on window focus / first request. Shutdown on window close. Crash recovery (restart on unexpected exit). |
| `src/main/tsserver/tsserverBufferSync.ts` | ~240 | IPC bridge from Monaco → `didOpen` / `didChange` / `didClose`. Debounces rapid edits. |
| `src/main/tsserver/tsserverClient.test.ts` | ~220 | Mock tsserver: verify request framing, response parsing, timeout handling. |
| `src/main/tsserver/tsserverBufferSync.test.ts` | ~220 | Monaco buffer → tsserver sync roundtrip tests. |
| `src/main/tsserver/CLAUDE.md` | ~150 | Subsystem docs: architecture, buffer sync correctness notes, known tsserver quirks. |

### Modified files

| File | Change |
|---|---|
| `src/main/mainStartup.ts` | Add tsserver initialization after codebaseGraph warm-up (gated on `semanticOps.tsserver.enabled`). |
| `src/main/ipc.ts` | Register IPC channel for Monaco → tsserver buffer sync events. |
| `src/renderer/components/FileViewer/FileViewer.tsx` | Subscribe `ITextModel.onDidChangeContent` and dispatch buffer sync events. Gated on the feature flag. |
| `src/main/configSchemaTail.ts` | Add `semanticOps.tsserver.enabled` (default `false`). |

### Subagent briefing

- **Read first:** `typescript/lib/tsserver.js` protocol docs (LSP-adjacent but not identical — tsserver has its own JSON format), Monaco `ITextModel` API, `src/main/mainStartup.ts` sequence.
- **In-process first.** Try requiring `typescript/lib/tsserver` directly. If node version / module loading causes headaches, fall back to `child_process.fork` with JSON IPC over stdin/stdout.
- **Debounce buffer sync.** Monaco emits on every keystroke; tsserver shouldn't process each one. 100ms debounce with flush-on-query.
- **One project per tsconfig.** If the workspace has `packages/foo/tsconfig.json` + `packages/bar/tsconfig.json`, that's two projects. Let tsserver's project reference handling do the work — don't reinvent it.
- **Crash recovery.** Tsserver can OOM on large projects. Detect exit, wait 1s, restart. Log a crash counter — if crashes exceed 3/session, disable tsserver for the session and surface a toast.
- **No tool handlers yet.** Phase A is plumbing only. Success = "we can send a request and get a response."

### Acceptance

- [ ] Tsserver starts on window activation when flag is on; does not start when off.
- [ ] Monaco edits propagate to tsserver within 200ms.
- [ ] A test request (`quickinfo` at a symbol position) returns a response.
- [ ] Crash recovery restarts tsserver without user-visible error.
- [ ] Multi-project monorepo (simulated in test fixture) resolves symbols across packages.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-54): Phase A — tsserver embedding and buffer sync`

---

## Phase B — Read-only operations

**Goal:** Expose `findReferences` and `getSymbolBody` to the agent.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/tsserver/tsserverFindReferences.ts` | ~220 | Wraps tsserver's `references` request. Normalizes result to `{filePath, line, col, contextLine, isDefinition}`. Filters out definition-only results when the agent asks for usages. |
| `src/main/tsserver/tsserverGetSymbolBody.ts` | ~200 | Wraps tsserver's `quickinfo` + `getOutliningSpans`. Returns `{symbolName, kind, bodyRange, body, declaration}`. |
| `src/main/tsserver/tsserverFindReferences.test.ts` | ~200 | Fixture-driven: TS files with known symbol references, assert correct resolution. |
| `src/main/tsserver/tsserverGetSymbolBody.test.ts` | ~200 | Same shape. |
| `src/main/semanticOpsExposure/semanticOpsExposure.ts` | ~260 | Decides tool-exposure path: CodeMode (via Wave 51) or direct MCP. Registers the two ops as agent-callable. |
| `src/main/semanticOpsExposure/semanticOpsExposure.test.ts` | ~200 | Exposure-path decision matrix. |

### Modified files

| File | Change |
|---|---|
| `src/main/internalMcp/internalMcpTools.ts` (if Wave 51 not shipped) | Add `find_references` and `get_symbol_body` to the tool registry behind the `semanticOps.exposeAsTools` flag. |
| `src/main/codemode/typeGenerator.ts` (if Wave 51 shipped) | Emit TypeScript definitions for `servers.tsserver.find_references(...)` etc. |
| `src/main/configSchemaTail.ts` | Add `semanticOps.exposeAsTools` (default `false` until Phase C positive). |
| `CLAUDE.md` (project root) | Add paragraph under "Key Conventions": when semantic ops are available, prefer `find_references` over `Grep` for symbol queries, `get_symbol_body` over whole-file `Read` for targeted inspection. |

### Subagent briefing

- **Read first:** Phase A output, tsserver protocol docs for `references` and `quickinfo`, Wave 48's graph-first CLAUDE.md paragraph (the semantic-ops guidance builds on it).
- **Exposure path matters.** If Wave 51 (CodeMode) shipped and is active, route via `typeGenerator` — costs ~200 tokens total for the whole surface. If Wave 51 isn't available, fall back to direct MCP tool injection — costs ~500 tokens per tool.
- **Position-based, not name-based.** The agent passes `{file, line, col}`, not `{symbolName}`. This prevents the "which overload?" ambiguity that kills symbol tools.
- **Result normalization matters.** Tsserver returns raw position data; the agent needs `contextLine` (the line of code, not just position) to make sense of results. Normalize consistently.
- **No mutations in this phase.** Any code path that would write must error explicitly.
- **CLAUDE.md guidance:** prescriptive, not descriptive. "When semantic ops are available and the query is about a TypeScript symbol, use them FIRST. Fall back to Grep/Read only if semantic ops return empty."

### Acceptance

- [ ] Agent can call `find_references` with a file:line:col and receive a normalized result list.
- [ ] Agent can call `get_symbol_body` with a file:line:col and receive the symbol body range + text.
- [ ] Both tools respect Monaco's dirty-buffer state (unsaved edits are visible).
- [ ] Both tools return a structured error if the position is ambiguous or resolves to nothing.
- [ ] Tools exposed via CodeMode when Wave 51 is active; direct MCP otherwise.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-54): Phase B — read-only semantic ops exposed to agent`

---

## Phase C — Measurement gate (HARD CHECKPOINT)

**Goal:** Measure whether read-only ops shift agent behavior on real turns. **Phase D does not run if this data says no.**

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/measure-semantic-ops-uptake.ts` | ~320 | Walks post-Phase-B session JSONLs, computes: frequency of `find_references` / `get_symbol_body` calls, reduction in grep-loop depth on turns that used them, reduction in Edit failure rate, agent preference (semantic vs grep when both are available). |
| `roadmap/wave-54-phase-c-decision.md` | ~240 | Decision report. Explicit Go/No-Go for Phase D. Numbers, not narrative. |

### Modified files

| File | Change |
|---|---|
| Wave 53's telemetry schema | Extend to tag turns with "had semantic ops available" and "used semantic ops." Allows before/after comparison at the corpus level. |
| `package.json` | Add `npm run measure:semanticops` script. |

### Subagent briefing

- **Read first:** Wave 53's `analyze-claude-corpus.ts`, Wave 53 Phase D's corpus-analysis report (the baseline), Phase B's exposure code.
- **Baseline needed:** collect at least 2 weeks of post-Phase-B sessions. If the user isn't using the IDE heavily during that window, extend. Don't decide on <50 relevant turns.
- **Decision criteria:**
  - Semantic-ops uptake rate (calls per session on eligible turns) ≥30% → positive signal.
  - Grep-loop depth on turns using `find_references`: ≥40% lower than baseline → positive signal.
  - Edit first-try failure rate on turns using `get_symbol_body` preceding an Edit: ≥30% lower than baseline → positive signal.
  - Any of the above met → Phase D is justified.
  - None met → Phase D does not ship; wave closes with read-only only.
- **Honest about sample size.** If the window is too small, the report says "inconclusive, extend soak period."
- **Don't bury outcomes.** If the data says "agent doesn't use semantic ops even when available," that's a valid result. Wave 54 still delivered value via Phase B infrastructure, but Phase D shouldn't ship on hope.

### Acceptance

- [ ] Measurement script runs against post-Phase-B JSONLs.
- [ ] Report produces explicit Go/No-Go for Phase D with numbers.
- [ ] If decision is "no," Phase E closes the wave with read-only ops only.
- [ ] If decision is "yes," Phase D proceeds with explicit performance targets to beat.
- [ ] Commit: `docs(wave-54): Phase C — measurement and Phase D gate decision`

---

## Phase D — Symbol-scoped mutations (conditional on Phase C positive)

**Goal:** Add `replaceSymbolBody` and `insertBeforeSymbol` / `insertAfterSymbol` — exact-boundary mutations that sidestep Edit's line-drift failure mode.

### New files (conditional)

| File | ~Lines | Description |
|---|---|---|
| `src/main/tsserver/tsserverReplaceSymbolBody.ts` | ~260 | Uses `getSymbolBody`'s range, replaces the text within that range, emits a checkpoint-compatible edit descriptor. |
| `src/main/tsserver/tsserverInsertSymbol.ts` | ~240 | `insertBeforeSymbol` and `insertAfterSymbol` — computes insertion point from symbol's declaration range, emits checkpoint-compatible edit. |
| `src/main/tsserver/tsserverReplaceSymbolBody.test.ts` | ~220 | Fixture tests: insert/replace preserves surrounding code, respects indentation, handles trailing comments. |
| `src/main/tsserver/tsserverInsertSymbol.test.ts` | ~220 | Same shape. |

### Modified files (conditional)

| File | Change |
|---|---|
| `src/main/semanticOpsExposure/semanticOpsExposure.ts` | Add the three new mutation tools. Respect the `semanticOps.exposeAsTools` flag. |
| `src/main/agentChat/checkpointManager.ts` (or equivalent) | Accept semantic-op edits as a distinct edit kind — same rollback path, optionally tagged for telemetry. |
| `CLAUDE.md` (project root) | Extend semantic-ops paragraph: when mutating a known symbol, prefer `replace_symbol_body` over Edit for exact-boundary safety. |
| `docs/architecture.md` | Document the mutation flow through checkpoint system. |

### Subagent briefing

- **Read first:** Phase C decision report + acceptance numbers, Phase B code for tsserver usage pattern, `checkpointManager.ts` for edit-kind integration.
- **Replace = exact range replacement.** No "find-and-replace" heuristics. The range comes from tsserver; the new text replaces exactly that range.
- **Indentation handling:** match the indentation of the existing symbol. If the old body had 2-space indent, the new body gets 2-space indent. Tsserver gives you the column offset to work with.
- **Trailing semicolons, comments, whitespace:** tsserver's `getOutliningSpans` gives the structural range but not necessarily the textual range including trailing `;` or attached comments. Decide explicitly: does `replaceSymbolBody` include the trailing semicolon? Document the choice; test both paths.
- **Integration with checkpoint system:** these mutations are checkpoints just like Edit — they show in diff review, they roll back cleanly, they get approvals if the permission mode requires.
- **Still no rename/safeDelete.** Explicitly scope this phase to body replacement and insertion only.

### Acceptance (conditional)

- [ ] `replace_symbol_body` replaces the exact symbol body and preserves surrounding code.
- [ ] `insert_before_symbol` / `insert_after_symbol` insert at the correct position with matching indentation.
- [ ] All three mutations emit checkpoints; rollback restores original content byte-for-byte.
- [ ] Diff review shows semantic-op edits distinctly from plain Edit.
- [ ] No regression in Edit behavior when semantic ops aren't used.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-54): Phase D — symbol-scoped mutations`

---

## Phase E — Integration, docs, Wave 55 gating decision

**Goal:** Verify the full stack, document, decide whether rename/safeDelete become a Wave 55 candidate.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/tsserver/tsserver.integration.test.ts` | ~320 | End-to-end: Monaco edit → tsserver sync → find_references → get_symbol_body → (if Phase D) replace_symbol_body → checkpoint → rollback. |
| `docs/semantic-ops.md` | ~280 | How the semantic ops layer works, when to use which op, tsserver correctness caveats (project references, implicit-any, generated files), opt-out flow. |
| `roadmap/wave-55-gating-decision.md` | ~180 | Based on Phases B/C/D measurement data: is rename/safeDelete worth Wave 55? What prerequisites (preview UI, rollback, multi-file staging) would Wave 55 need? |

### Modified files

| File | Change |
|---|---|
| `src/main/tsserver/CLAUDE.md` | Finalize with shipped op list, known quirks, tsserver crash patterns. |
| `CLAUDE.md` (project root) | Update "Known Issues / Tech Debt" to reflect post-54 state. Add semantic-ops to "Key Conventions" if tools are live. |
| `docs/architecture.md` | Reflect tsserver as an in-process subsystem. |
| `roadmap/session-handoff.md` | Record soak checklist, Wave 55 criteria if identified. |
| `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` | Update with post-54 state: tsserver integration live, which ops available, which are deferred. |

### Acceptance

- [ ] Integration test exercises the full stack.
- [ ] Docs cover semantic-ops usage, caveats, opt-out.
- [ ] Wave 55 gating doc exists with explicit criteria.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-54): Phase E — integration, semantic ops docs, Wave 55 gate`

---

## Subagent execution model

- **Model:** `sonnet`
- **Isolation:** Phase A handled directly by parent (plumbing subtlety); Phases B/C/D/E can dispatch to subagents with tight specs
- **Test policy:** scoped vitest per phase; parent runs full suite + integration tests at wave close
- **Lint policy:** no relaxations
- **Commit policy:** one per phase; Phase D is conditional and may not produce a commit
- **Scope discipline:** do NOT build abstraction layers. Do NOT add Serena. Do NOT ship rename/safeDelete. Do NOT extend to non-TS languages.

### Phase dispatch order

1. **Phase A** — tsserver embedding + buffer sync (parent, plumbing risk)
2. **Phase B** — read-only ops (Sonnet subagent with tight spec)
3. **Phase C** — measurement gate (parent decides based on data; subagent writes the script)
4. **Phase D** — conditional mutations (Sonnet subagent; only runs if Phase C positive)
5. **Phase E** — integration + docs (Sonnet subagent)

Phases B and C are sequential — C depends on B being live and soaked. Phase D conditional on C.

---

## Risks

| Risk | Mitigation |
|---|---|
| Tsserver in-process is unstable (module loading, memory pressure). | Fallback to subprocess mode is documented in Phase A. Auto-switch on repeated crashes. |
| Dirty buffer sync races on rapid edits. | 100ms debounce + flush-on-query pattern. Buffer sync tests cover rapid-edit cases. |
| Agent ignores semantic ops when they're available. | Phase C directly measures this. If adherence is low, Phase D doesn't ship — the wave delivered Phase B infrastructure without spending on mutations that aren't used. |
| Semantic-op results look authoritative but are silently incomplete (LSP correctness tax). | Document explicitly in `docs/semantic-ops.md`. Consider confidence tagging on results in a future wave. |
| Multi-project monorepos confuse tsserver's project model. | Phase A test fixture includes a multi-package monorepo. If tsserver's built-in project references don't work, document the gap and require explicit project hinting. |
| CodeMode (Wave 51) isn't shipped when Wave 54 starts → direct MCP exposure costs per-spawn tokens. | Phase B's `semanticOpsExposure` handles both paths. Exposure cost is tolerable without CodeMode (~1k tokens per spawn); not a blocker. |
| Phase C sample size is too small for a confident decision. | Phase C explicitly allows "inconclusive — extend soak" as an outcome. Wave doesn't close until the data is decisive. |
| Wave 53 Phase D decision turns out to have been premature / biased. | Wave 54's Phase C is a second measurement against a second dataset (post-Phase-B sessions). If Phase C contradicts Phase 53 Phase D, that's new data — act on it. |
| Integrating semantic-op edits with checkpoint system requires larger changes than expected. | Phase D scope is "symbol-scoped mutations through existing checkpoint flow." If checkpoint changes are >50 LOC, flag and reconsider — the mutation might not be worth the plumbing. |

---

## Acceptance criteria (wave-level)

- [ ] Wave started only after Wave 53 Phase D produced a "gap is real" decision.
- [ ] At minimum Phases A, B, C, E commits on `master` (D conditional).
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] Semantic-op enabled, ask agent to "find all callers of X" — agent uses `find_references`, results match reality.
  - [ ] Semantic-op enabled, ask agent to "show me the body of function Y" — agent uses `get_symbol_body`, returns correct range.
  - [ ] (If Phase D shipped) Agent uses `replace_symbol_body` for a refactor task; diff review shows the change; rollback restores original.
  - [ ] Semantic-op disabled (flag off) — agent falls back to Grep/Read without error.
  - [ ] Tsserver crash recovery works (simulated via SIGKILL).
- [ ] Phase C measurement report published with explicit uptake + impact numbers.
- [ ] Wave 55 gating decision documented (proceed to rename/safeDelete, or defer indefinitely).

---

## Out-of-wave follow-ups

- **Wave 55 candidate: Rename + safeDelete** — only if Phase E's Wave 55 gating decision is positive AND preview/checkpoint/rollback flow supports multi-file staging.
- **Wave 55+ candidate: Call hierarchy** — lower priority, but a natural next op once references works. Decide after Phase C.
- **Non-TS backend wave** — if TypeScript success motivates it, a separate wave for Python (pyright) / Rust (rust-analyzer) / Go (gopls). Same in-process strategy; no wrapper abstraction; each language pays its own integration cost.
- **Semantic-op confidence scoring** — tag results with "likely complete" / "may be incomplete due to implicit types / project reference gap" so the agent can discount accordingly.
- **Graph + semantic-op join** — the codebaseGraph's blast radius + tsserver's exact references could be combined into a single "impact" query. Blue-sky; defer until semantic ops themselves are proven.
- **Dirty-buffer correctness audit** — once shipped, run a targeted audit to verify Monaco → tsserver sync is correct under all user-surface scenarios (split view, unsaved across multiple files, format-on-save).

---

## Cross-wave alignment

- **Wave 48** — lean packet mode + task-gated internalMcp: compatible. Semantic ops are a distinct exposure surface. When tasks don't need them, they don't inject.
- **Wave 51** — CodeMode integration: **preferred exposure path for Wave 54 tools.** If Wave 51 shipped, use CodeMode's TypeScript namespace to expose `servers.tsserver.*` efficiently. If not, fall back to direct MCP.
- **Wave 52** — context ranker measurement: orthogonal. Semantic ops are post-ranker — the ranker picks files, semantic ops operate on symbols within them.
- **Wave 53** — telemetry recovery: **prerequisite.** Wave 54 Phase C's measurement depends on Wave 53's restored quality signals to compute impact on real turns. Without Wave 53, Phase C can't run.
- **Wave 55 (hypothetical)** — rename + safeDelete: gated on Wave 54 Phase E's decision and Wave 47/46 diff review maturity.

**Re-sequencing note:** Wave 54 cannot run before Wave 53 Phase D ships. The conditional start guard is load-bearing.
