# Audit Verification Pass — Consolidated Report

**Date:** 2026-05-01
**Method:** 12 parallel subagent verifications against the 11 audit outputs in `roadmap/cleanup/`, `roadmap/oldfiles/`, `roadmap/settings/`, and `roadmap/follow-ups/`. All non-destructive: read code + git history, classify each claim, recommend action. No source edits.

**Classification scheme:**
- ✅ **VERIFIED** — claim accurate, safe to act on
- ❌ **STALE** — claim is wrong; code has changed since audit
- ⚠️ **PARTIAL** — partly true; some sub-items valid, others not
- 🔮 **FUTURE-INTENT** — looks dead but deliberate hold for planned work
- 🗑️ **DROPPED-INTENT** — was for an abandoned wave (candidate for deletion OR resurrection)

For follow-ups: ✅ DONE / ⚠️ PARTIAL / ❌ NOT-DONE / 🔄 SUPERSEDED / 🗑️ NOW-USELESS / 🔮 STILL-RELEVANT.

---

## Table of Contents

1. [Executive summary](#executive-summary)
2. [Cross-cutting themes](#cross-cutting-themes)
3. [Section A — Cleanup audits](#section-a--cleanup-audits)
   - [A1. Dead code](#a1-dead-code)
   - [A2. Dead config keys](#a2-dead-config-keys)
   - [A3. Orphaned IPC](#a3-orphaned-ipc)
   - [A4. Orphaned tests](#a4-orphaned-tests)
   - [A5. Unused dependencies](#a5-unused-dependencies)
   - [A6. Docs drift](#a6-docs-drift)
   - [A7. Stale CLAUDE.md files](#a7-stale-claudemd-files)
   - [A8. TODO inventory](#a8-todo-inventory)
4. [Section B — Old files](#section-b--old-files)
5. [Section C — Settings audit](#section-c--settings-audit)
   - [C1. Part A — General through Agent Profiles](#c1-part-a--general-through-agent-profiles)
   - [C2. Part B — Files through Accounts](#c2-part-b--files-through-accounts)
6. [Section D — Follow-ups](#section-d--follow-ups)

---

## Executive summary

| Audit | Verified | Stale | Partial | Future-intent | Dropped-intent | Headline |
|---|---|---|---|---|---|---|
| Dead code | 30 | 4 | 7 | 4 | 4 | 5→4 stale claims (one was a half-done rename, not dead vs live); see Second-pass corrections |
| Dead config keys | 4 | 2 | 4 | 0 | 0 | `llmJudgeSampleRate` UI slider controls nothing |
| Orphaned IPC | 2 | many | 8 | 1 | 0 | 2 genuinely orphan, 1 naming collision, 7 web/mobile-client wiring |
| Orphaned tests | 0 | 0 | 0 | 0 | 0 | Audit clean — 0 orphans confirmed in sample |
| Unused deps | 5 | 2 | 3 | 0 | 0 | `vitest-axe` and `@capacitor-mlkit/barcode-scanning` are live |
| Docs drift | 13 | 0 | 0 | 0 | 0 | All 13 verified; 2 HIGH-severity (Wave-51 sections describe deleted arch) |
| Stale CLAUDE.md | 13 | 4 | 2 | 0 | 0 | Auto-generated sections also stale, not just manual:preserved |
| TODO inventory | 5 | 0 | 0 | 0 | 0 | All 5 are intentional deferrals |
| Old files | 9 | 0 | 0 | 2 | 0 | ~12 MB safe to delete; `AGENTS.md` and `capacitor.config.ts` are load-bearing |
| Settings A | 4 | 8 | 4 | 1 | 0 | 8 false-positive ⚠ from misreading `useConfig().set` pattern |
| Settings B | 0 | 3 | 3 | 1 | 0 | Telemetry "broken" toggle is intentional placeholder |
| Follow-ups | 12 | — | 8 | — | — | 71 NOT-DONE, 18 SUPERSEDED, 19 NOW-USELESS, 27 STILL-RELEVANT |

---

## Second-pass corrections (added after re-verification)

After the initial 12-agent pass, I re-verified the highest-stakes / most-uncertain claims directly. Findings:

| Claim | First-pass result | Second-pass verdict | Source |
|---|---|---|---|
| `startContextRetrainTrigger` has zero production callers | Reported as headline finding | ✅ CONFIRMED — Grep returns only the module, its test, docs, and roadmap mentions. No call sites in `main.ts`, `mainStartup.ts`, or any IPC handler. | Grep across repo |
| `stdioTransportPath` is dead vs the live path | Two agents disagreed | ⚠️ RESOLVED as half-done rename. Both fields exist on `InjectOptions`: `standaloneScriptPath?: string` (new) and `stdioTransportPath?: string` (`@deprecated`). Fallback `??` at `internalMcpAutoInject.ts:133`. Live call site `index.ts:39` STILL uses the deprecated field. **Action: update `index.ts:39` first, then delete the deprecated field.** | `src/main/internalMcp/internalMcpAutoInject.ts:121-135`, `src/main/internalMcp/index.ts:39` |
| `contextWorker.ts` wiring conflict | Orchestration CLAUDE.md said wired; data-foundation-audit said not | ✅ RESOLVED — IS wired. `src/main/ipc-handlers/agentChatContext.ts:103-209` spawns it as a Worker thread from `outMainDir/contextWorker.js`. Also referenced in `electron.vite.config.ts` for build. The data-foundation-audit was wrong. | `src/main/ipc-handlers/agentChatContext.ts:103,108,112,116,120,125,206,209` |
| `parseAnomalies` absent-when-zero in `index_status` | Wave 67 follow-up claim | ✅ CONFIRMED — `mcpToolHandlerDefs.ts:83` literally returns `[]` when count is zero, so the field never appears in clean output. | `src/main/codebaseGraph/mcpToolHandlerDefs.ts:78-92` |
| `enrichPacketWithContextLayer` model threading gap | Wave 69 follow-up claim | ✅ CONFIRMED — `contextPacketBuilder.ts:155` passes only `request.goal`. `enrichPacketWithContextLayer` (line 159) takes `goal: string` and calls `layerController.enrichPacket(packet, extractGoalKeywords(goal))`. `request.model` is never threaded. | `src/main/orchestration/contextPacketBuilder.ts:154-167` |
| Wave 60 standalone MCP server exists | Many follow-up CLOSE recommendations depend on this | ✅ CONFIRMED — 8 files at `src/standalone/ouroborosMcp/` including `ouroborosMcpServer.ts` and tests. All Wave 60 closures are valid. | Glob `src/standalone/**/*.ts` |
| `internalMcpStdioTransport.ts` deleted by Wave 60 | HIGH-severity docs drift hinges on this | ✅ CONFIRMED — Glob returns no files. Wave 51 docs in `architecture.md` and `codemode-internalmcp-routing.md` describe deleted infrastructure. Update is non-optional. | Glob `src/main/internalMcp/internalMcpStdioTransport*` |

### Updates to first-pass classifications

- **`stdioTransportPath` (A1 #1.1b, A2 #6)** — Reclassify from "STALE — audit was wrong" to **"PARTIAL — half-done rename, deletion blocked on caller migration."** Both verification agents had part of the picture. The dead-code audit's claim that the deprecated path "always wins" is wrong; the current state is the deprecated path is the only one being passed.
- **`contextWorker.ts` (Section D, INVESTIGATE-FURTHER)** — Promote to **"NOT a follow-up. The data-foundation-audit error is the issue, not the wiring."** Worth fixing the audit doc, not the code.
- **`startContextRetrainTrigger` (Section D, top STILL-RELEVANT)** — Confirmed as the highest-priority single finding. Fully implemented module + tests, zero call sites in production. Decide: wire or delete.

### Items I did NOT re-verify but that warrant caution before action

- The other **5 dead-code STALE claims** (`TRAINING_CUTOFF_DATE`, `multiRoots`, `wave6StubApis`, `resolveTransport`, SSE branch) — agent reports look solid and the citations are specific, but a quick check of any one before deletion is cheap insurance.
- **`list_projects` 0-stat refresh bug** (Wave 53e/53f) — runtime observation needed; static read can't tell.
- **`agentChatSettings.defaultVerificationProfile` terminal consumer** — would need to trace `chatOrchestrationRequestSupportHelpers.ts:31` deeper.
- **Wave 69 ESCALATE-1/3 outcomes** — phase log artifacts not in this verification pass.

---

## Triage status (2026-05-01)

This audit has been worked through across two sessions. Status of items in Section D:

### Filed in `roadmap/future/` — committed waves (17 items, prior session)

`context-injection-completion.md` (items 1+5), `graph-mcp-polish.md` (2+3+4), `telemetry-archival-completion.md` (7 + HIGH-A/B from waves-15-29 review), `agent-chat-swipe-navigation.md` (8a), `cypher-engine-feature-additions.md` (11+12), `graph-edge-confidence-scoring.md` (13), `disabled-rules-honor-at-send-path.md` (15), `warn-hooks-stdout-surfacing.md` (16), `memory-curation-completion.md` (17). Direct code actions: orphan DB cleanup (#6), `agentMonitor.subagentDisplay.enabled` default flip (#8b), `accessor` keyword fixture (#14).

### Filed in `roadmap/deferred/` — preserved for future maintainers (5 files)

- `cross-window-ide-tool-delegation.md` (item #9, prior session)
- `mobile-access-and-session-dispatch.md` (item #10, prior session)
- `tree-sitter-grammar-upgrade.md` (item #14, prior session)
- `ios-mobile-packaging.md` (Waves 33a/33b/34 — moved out of NOW-USELESS this session per developer note "iOS will be relevant soon")
- `codex-transport-architecture.md` (Wave 45 app-server pooling/warm-up + exec-transport removal — moved out of NOW-USELESS this session pending architecture verification)

### Closed as DONE (12 items — this session)

| Item | Wave | Evidence |
|---|---|---|
| `codemode.excludeFromMultiplex` | 53k | `configSchemaTailExt.ts:315`, `codemodeStartup.ts`, `internalMcpRoutingPolicy.ts` |
| Universal multiplexer / user-level takeover | 53l | `enableCodeModeUserLevel()` in `codemodeStartup.ts` |
| `ResearchOutcomeRecord` missing fields | 29.5 | `researchOutcomeWriter.ts:35,43,48` |
| Wave 51 `internalMcp` barrel split | 51 | `internalMcp/index.ts` is now thin barrel |
| Wave 51 `main.ts` split | 51 | `mainStartup.ts`, `mainStartupContextLayerTrigger.ts` extracted |
| Wave 52 hook auto-install | 52 | `hookInstaller.ts` auto-installs at startup |
| Wave 53c/d/e standalone Flavor B | 53c–j | `src/standalone/ouroborosMcp/` ships with binary |
| Wave 53j SDK SSE migration | 53j | Wave 60 adopted SDK for standalone |
| Wave 51 CodeMode for user-global MCP servers | 51 | `enableCodeModeUserLevel()` patches `~/.claude.json` globally |
| Wave 25 side chat drawer "is a stub" | review | `SideChatDrawer.tsx` is full implementation |
| Wave 69 contextLayer rebuild after graph-ready | 69 | Commits `39af078`/`9d0c0ec` |
| Wave 69 graph-not-ready spam reduction | 69 | Commit `d804a8e` |

### Closed as SUPERSEDED (16 items — this session)

Auto-sync graph staleness (Wave 53k) → Wave 60 standalone reindexer; `routeInternalMcp` flag flip + soak (Wave 51 × 2 occurrences, Wave 53j) → replaced by `excludeFromMultiplex` (Wave 53k); SDK SSE replacement + hand-rolled SSE drift removal (Wave 53h) → Wave 60 SDK adoption; Streamable HTTP migration (Waves 53f/h/i × 4 occurrences) → Wave 60 SDK uses SSE fallback; SSE client tracking / broadcasts claim (Wave 53f) → infrastructure deleted in Wave 60; per-spawn `--mcp-config` path verification (Waves 53e/f/g × 4 occurrences) → universal multiplexer (Wave 53l) eliminated per-spawn injection; bundle externalization for electron-builder (Wave 53i) → Wave 60 standalone built independently; mobile responsive layout for chat-only (Wave 44) → chat-only shell + workbench variant exists; `chatWorkbench` default flip (Waves 46/47/47-soak/47-result/58) → retired in Wave 59; version-drift cleanup (Wave 53c–g briefs vs git tags) → subsumed by Wave 60 archive.

### Closed as NOW-USELESS (13 items — this session)

UUID v7 follow-up (Wave 15) — never needed; Wave 47 stash@{0}/{1} drops (Wave 58) — for closed wave; Wave 48 telemetry backfill — time-window passed; Phase D historical corpus analyzer + Phase F router backfill (Wave 53 × 2) — telemetry-dark-signals restored 2026-04-26 makes the historical corpus path moot; Wave 54 semantic-ops gated on Phase D (Wave 53/53c × 2) — Wave 54 paused for graph-adoption reasons; Wave 53a Q3 one-sided context outcomes (× 2 occurrences) — explicit YAGNI; Wave 53i external `codebase-memory-mcp` dedup UI (Wave 53g × 2) — architecture changed; Wave 58 audit #13 rail prop NIT — cosmetic, intentionally left open; Wave 50 worst-session investigation (`439565f2`) — historical session ID; quarterly graph-adherence re-run (Wave 50) — moved to live router calibration model; Wave 50 source-rule deletion (`init-safety.md`, `project-claude-md-template.md`) — verified files still in active use, close as won't-delete; manual smoke gate items for closed waves (Waves 62/63/66/69) — not retroactively required.

### Newly identified — STILL-RELEVANT (1 item — this session)

- **`list_projects` 0-stat refresh bug** — verification confirms the bug persists. The `projects` table caches `node_count` / `edge_count` columns, but the indexer can't call `upsertProject()` to refresh them due to an `INSERT OR REPLACE` cascade-delete bug documented in `graphControllerCompat.integration.test.ts:189-193`. `handleListProjects` reads the cached zeros instead of calling `getNodeCount()` live. Should be filed as a future wave (probably bundled with the broader `index_status` quality work in `graph-mcp-polish.md` or `cypher-engine-feature-additions.md`, or as a standalone `list_projects-stat-refresh` wave).

### Audit batches handled in second pass (2026-05-01 evening)

The remaining audit sections were swept in a second triage pass on the same day. Status:

**Section A1 — Dead code (12 high-confidence DELETEs + DROPPED-INTENT items closed)**
- Deleted: `src/renderer/components/primitives/` directory (12 files), `osc133Handler.ts`, 3 unused hooks + tests, 5 dead `build*Apis` exports surgically removed.
- Deleted scripts: `analyze-graph-adherence.ts`, `analyze-ranker-hit-rate*` (4 files), `measure-mcp-token-cost.ts`, `manual-seq-test.mjs`. Synced `docs/hook-migration.md` and `docs/context-ranker.md`.
- Deleted artifacts: 2 timestamped vite configs, `tmp_monitor.py`, plus untracked gitignored cruft (`.lint-report.json`, `tsconfig.web.tsbuildinfo`, `vitest-results.json`, `tools/__pycache__/`).
- Stale TODO comments dropped: `en.ts` Wave 38 Phase G, `AgentChatTabBar.tsx` Wave 32 Phase I, `electron-mobile-access.d.ts` Wave 33a.
- DROPPED-INTENT: removed `RouteOptions.skipLayer3` scaffolding from `orchestrator.ts`; synced `router/CLAUDE.md` to remove `llmFallback.ts` / `llmJudge.ts` file map references.
- PARTIAL items (`escapePowerShellArg` 3× dup, `enableEmacsMode`, `useFormatOnSave` barrel, `useOutsideClick` 3× dup, `TOOL_COLORS` 2× dup) NOT touched — needs design judgment beyond cleanup scope.

**Section A2 — Dead config keys (1 of 6 cleanly removed)**
- Removed: `routerSettings.llmJudgeSampleRate` (schema, type, UI slider, search entry, 5 test fixtures, router CLAUDE.md note).
- Filed as `roadmap/future/config-key-cleanup-followups.md`: `windowSessions` (large surface + sessionMigration), `codemode.routeInternalMcp` (test rework), `internalMcp.transport` (test rework), `InjectOptions.transport` field (small), `InjectOptions.stdioTransportPath` (3-step caller migration). Each blocked on test-rework or load-bearing sequencing that warranted its own commits.
- KEEP per audit: `multiRoots`, `autoRetrainEnabled`, `TRAINING_CUTOFF_DATE`, `ecosystem.rulesAndSkillsInstallEnabled` (latter already filed).

**Section A6 — Docs drift (all 13 items fixed)**
- HIGH severity: rewrote `docs/architecture.md` "MCP transport and CodeMode routing (Wave 51)" section to describe the current Wave 60 standalone server; replaced `docs/codemode-internalmcp-routing.md` (108 lines of pre-Wave-60 operator guide) with a tombstone pointing at the standalone module CLAUDE.md.
- MEDIUM severity: 6 path/filename corrections across `docs/architecture.md`, `docs/context-injection.md`, `docs/context-ranker.md`.
- LOW severity: theme count 5→8, "Canvas renderer"→WebGL via @xterm/addon-webgl, `chatPrimary`→`immersiveChat` in data-model, `glass`→`material` in root CLAUDE.md folder map, removed broken README screenshot link.

**Section A7 — Stale CLAUDE.mds (4 of 4 subsystem files refreshed)**
- `agentChat/CLAUDE.md` — dropped 5 references to deleted `threadStoreRuntimeSupport.ts`; updated both auto-gen and manual:preserved sections to reflect SQLite-only reality.
- `contextLayer/CLAUDE.md` — replaced `contextLayerAiSummarizer.ts` row with `moduleSummarizer.ts`; dropped 3 gotchas pointing at deleted `importGraphAnalyzer.ts` / `languageStrategies.ts`; replaced pre-Wave-69 manual section with tombstone.
- `orchestration/providers/CLAUDE.md` — corrected "three providers" → "two" (no `anthropicApiAdapter` exists); moved `anthropicAuth.ts` reference out (lives at `auth/providers/`); replaced stale manual section.
- `symbolExtractor/CLAUDE.md` — corrected Consumers table: removed phantom `graphParser*.ts` and `internalMcpToolsGraph.ts` rows; added real consumer `useSymbolOutline.ts`.
- `router/CLAUDE.md` — already updated in the A1 commit (skipLayer3 + llmFallback removal pass).

**Section C — Settings audit (5 VERIFIED-PARTIAL items filed as wave)**
- All five items are real feature-implementation work, not cleanup deletes. Filed as `roadmap/future/settings-partial-wiring-fixes.md` (two bundles: backend wiring fixes for `webAccessPassword` UI feedback / `useMcpHost` gating / `modelSlots.claudeMdGeneration` slot; persistence fixes for Export Usage time window + output path).

### Audit batches handled in third pass (2026-05-01 → 2026-05-02)

**Section A3 — Orphaned IPC (3 of 3 channels deleted)**
- `app:rebuildAndRestart` — security-positive removal (unrestricted shell-spawn surface, no UI entry point). Dropped main handler + `runBuildCommand` + `handleRebuildAndRestart` helpers, preload bridge, renderer `AppAPI` type field, web stub, channel catalog entry.
- `perf:markFirstRender` — back-compat alias for `perf:mark('first-render')`. Renderer always uses the canonical `perf:mark`. Dropped `handleFirstRender` helper, registration, 2 dedicated test cases, preload bridge, renderer `PerfAPI` type field, channel catalog entry.
- `shell:openExtensionsFolder` — naming collision with the live `extensions:openFolder`. Verified renderer uses only the latter (`useExtensionsSectionSupport.ts:220`). Dropped `openExtensionsFolder` helper, registration, preload bridge, `ShellAPI` field, web stub, channel catalog entry.
- `memory:read` — KEEP per audit; pre-wired for `roadmap/future/memory-curation-completion.md` (already filed).

**Section A1 PARTIAL items (4 of 5 actioned; 1 skipped per audit)**
- `escapePowerShellArg` consolidation — replaced 3 byte-identical local copies (`ptyCodex.ts`, `codexAppServerProcess.ts`, `codexExecRunnerHelpers.ts`) with imports from the canonical `src/main/ptyArgEscape.ts`. Security-positive: single source of truth for PowerShell argument escaping.
- `enableEmacsMode` removal — stub function returned null and warned; no UI option referenced 'emacs' anywhere in Settings or schema. Dropped the function, narrowed `KeybindingMode` to `'default' | 'vim'`, removed the dead branch in `MonacoEditor.hooks.ts`, dropped barrel export.
- `useFormatOnSave` deletion — barrel-exported but zero direct consumers. Deleted the 65-line file plus barrel exports. When LSP formatting lands, it should plug into Monaco directly via `DocumentFormattingEditProvider`.
- `useOutsideClick` extraction — extracted to `src/renderer/hooks/useOutsideClick.ts` with canonical signature `(ref, open, onClose)` and `pointerdown` (touch-aware). Replaced all 3 in-place definitions; behavior more permissive on touch surfaces. Test file co-located with 5 cases.
- `TOOL_COLORS` 2× duplication — SKIPPED per audit's "intentional" classification (`Analytics/CLAUDE.md` documents the hardcoded-by-design rationale; the Analytics dashboard map and the ApprovalDialog map serve different surfaces).

### Audit closeout (2026-05-02)

**Section A5 — Unused dependencies** — 3 of 5 packages removed (`depcheck`, `remark-gfm`, `babel-plugin-react-compiler`). 2 audit false positives caught and corrected:
- `jsdom` — required by `@vitest-environment jsdom` directive in 5 renderer tests; audit's "vitest has its own jsdom" claim was wrong. Restored.
- `@xenova/transformers` — `src/main/embeddings/embeddingProvider.ts:1-6` documents the local ONNX provider as the DEFAULT; Voyage AI is the secondary option. Audit had the primary/secondary inverted. Restored.

**Section A8 — TODO inventory** — 3 of 5 already covered (monaco-emacs deletion landed in commit 349fb4a; `useSwipeNavigation` mount filed as `roadmap/future/agent-chat-swipe-navigation.md`; rulesAndSkills install path tracked under Wave 41 follow-up). 2 remaining filed as small waves:
- `roadmap/future/skill-executions-persistence.md` — 3-step plan from the inline TODO
- `roadmap/future/misc-registrars-decomposition.md` — ~10 domain extraction from the 336-line `miscRegistrars.ts`

**Section A6 open question** — `glassOpacity` is **not** vestigial despite the `glass` theme being gone. Verified 30+ live references across `useTheme.ts`, `useTheme.tokens.ts`, `useTheme.actions.ts`, Settings UI, and the extension-host proxy. The key drives `--glass-dim` for the always-on transparency feature (mica-electron on Windows, vibrancy on macOS). KEEP.

### Audit batches now complete

A1, A2 (partial — 1 inline + 1 wave filed), A3, A4 (clean per audit), A5 (3 removed; 2 false positives flagged), A6, A7, A8 (3 covered; 2 filed), B (cleaned during Phase 1), C (filed as wave). The audit-verification-pass.md is fully triaged.

Remaining work is implementation, not classification — captured in 13 future waves under `roadmap/future/`:
- 9 STILL-RELEVANT waves filed during initial triage round (context-injection-completion, graph-mcp-polish, telemetry-archival-completion, agent-chat-swipe-navigation, cypher-engine-feature-additions, graph-edge-confidence-scoring, disabled-rules-honor-at-send-path, warn-hooks-stdout-surfacing, memory-curation-completion)
- 2 cleanup waves filed during second-pass triage (config-key-cleanup-followups, settings-partial-wiring-fixes)
- 2 A8 follow-up waves filed during closeout (skill-executions-persistence, misc-registrars-decomposition)

Plus 5 deferred items preserved under `roadmap/deferred/` for future activation (iOS mobile packaging, Codex transport architecture, mobile access + session dispatch, cross-window IDE-tool delegation, tree-sitter grammar upgrade).

---

## Cross-cutting themes

1. **The audits themselves are imperfect.** ~15-20% of flagged items are false positives. Don't act on a single classification without a quick verification on the highest-stakes items.

2. **Wave 60 silently closed many items.** The standalone MCP server at `src/standalone/ouroborosMcp/` resolved a cluster of 53k–53j follow-ups and dead-code items that the audits still list as open.

3. **Several "future-intent" items have rotted.** Layer 3 router, `llmJudge.ts`, `enableEmacsMode`, swipe navigation — all have UI/schema scaffolding but no implementation, with no active wave to land them. Candidates for either deletion or a "finish-the-stubs" wave.

4. **`startContextRetrainTrigger` is the most important single finding.** Real code (260 lines), real tests, zero call sites in production. Either wire it or delete it — it's actively misleading right now.

5. **The "bypass-draft via `useConfig().set`" pattern was misread by the settings audit** for at least 8 components. `AccentPicker`, `ThinkingVerbPicker`, `PaneFontPicker`, `AppearanceSectionVsCodeImport`, `customCSS`, and several `agentChatSettings.*` are all wired correctly — the audit was confused by components that don't take a `draft` prop.

6. **Auto-generated CLAUDE.md sections are also stale.** The audit assumed only manual:preserved sections needed cleanup; in reality, three of five audited subsystem CLAUDE.mds have stale entries in their auto-generated blocks (regeneration didn't catch up to Wave-69 file deletions).

---

# Section A — Cleanup audits

## A1. Dead code

**Source:** `roadmap/cleanup/dead-code.md`
**Breakdown (53 items):** 30 VERIFIED · 5 STALE · 6 PARTIAL · 4 FUTURE-INTENT · 4 DROPPED-INTENT · 4 INVESTIGATE-FURTHER.

### Audit errors that would cause breakage if acted on

These claims are factually wrong. Do **not** delete these items.

| # | Claim | Reality | Evidence |
|---|---|---|---|
| 1.1a | `TRAINING_CUTOFF_DATE` "only non-test consumer is fallback" → safe to delete | Live production fallback path | `src/main/research/stalenessMatrix.ts:14,119` |
| 1.1b | `InjectOptions.stdioTransportPath` deprecated; `standaloneScriptPath` always wins | **Half-done rename** (second-pass): both fields exist; `stdioTransportPath` is `@deprecated` but `index.ts:39` still calls with it. Migrate caller first, then delete field. | `src/main/internalMcp/internalMcpAutoInject.ts:121-135`, `src/main/internalMcp/index.ts:39` |
| 1.1e | `multiRoots` is "unused export" | Six live callers | `windowManager.ts:124`, `extensionsSandbox.ts:52`, four `ipc-handlers/*.ts` |
| 1.1h | `wave6StubApis` returns `{ success: false, error: 'not-yet-implemented' }` | All methods are real `ipcRenderer.invoke` calls; misleading file name and JSDoc only | `src/preload/preloadWave6Stubs.ts:36-41` |
| 1.3d | `resolveTransport()` "always returns 'stdio'" | Returns `'sse'` by default | `src/main/orchestration/providers/scopedMcpConfig.ts:102-105` |
| 1.6c | SSE branch "permanently true" | SSE is the common production path | `internalMcpRoutingPolicy.ts:62-74` |

### High-confidence DELETE candidates

Safe to queue immediately:

- `src/renderer/components/primitives/` — entire 12-file directory, zero importers
- `src/renderer/components/Terminal/osc133Handler.ts`
- `src/renderer/hooks/useOrchestrationEvents.ts` (the `hooks/` copy; the live one is in `Orchestration/model/`)
- `src/renderer/hooks/useAgentEvents.routing.ts` + its test
- `src/renderer/hooks/useDispatchReconnectDrain.ts` + its test
- Five `build*Apis` wrapper functions in `src/web/` (`webPreloadApis.ts:159,261`, `webPreloadApisSupplemental.ts:154,223,286`)
- `scripts/analyze-graph-adherence.ts`
- `scripts/analyze-ranker-hit-rate*` (3 files + test)
- `scripts/measure-mcp-token-cost.ts`
- `scripts/manual-seq-test.mjs`
- 3 stale TODO comments: `en.ts:3`, `AgentChatTabBar.tsx:103`, `electron-mobile-access.d.ts:7`
- All untracked build artifacts (`electron.vite.config.*.mjs`, `tsconfig.web.tsbuildinfo`, `vitest-results.json`, `tools/__pycache__/*.pyc`, `tmp_monitor.py`)

### FUTURE-INTENT (keep, possibly wave-it later)

- `src/main/delegationCoach/` — Wave 61 build pipeline target, intentional
- `buildLegacyPrompt`/`buildLegacyHeader`/`buildLegacyFooter` — `leanMode=false` rollback path (tested)
- `autoRetrainEnabled` gate — Wave 61 ADR
- `USE_MONACO = true` dead branches — deliberate rollback escape hatch per FileViewer CLAUDE.md

### DROPPED-INTENT (worth flagging for a possible new wave or full deletion)

- **`src/main/router/llmFallback.ts` + `skipLayer3` scaffolding** — file does not exist; both branches of `skipLayer3` guard return null. DELETE.
- **`src/main/router/llmJudge.ts`** — never shipped; `llmJudgeSampleRate` UI slider controls nothing. DELETE or WAVE-IT.
- **Wave 38/32/33a TODO comments** — all in dropped or absorbed waves.

### PARTIAL — needs judgment

- **`escapePowerShellArg` duplicated 3×** — each copy is local, but canonical at `ptyArgEscape.ts:16` is unused by `ptyCodex.ts`, `codexAppServerProcess.ts`, `codexExecRunnerHelpers.ts`. Consolidation wave.
- **`enableEmacsMode()`** — stub body but live caller at `MonacoEditor.hooks.ts:112`. Either wire `monaco-emacs` or remove the Emacs option from the keybinding selector.
- **`useFormatOnSave` barrel re-export** — barrel export is dead, but the hook itself may be imported directly. Check before deleting.
- **`useOutsideClick` defined 3×** — extract to `src/renderer/hooks/useOutsideClick.ts`.
- **`TOOL_COLORS` defined 2×** — overlapping but not identical maps. Low priority.
- **`scripts/test-coach-hook*.mjs` (3 files)** — active Wave 61 dev utilities; keep through Wave 61 close.

---

## A2. Dead config keys

**Source:** `roadmap/cleanup/dead-config-keys.md`
**Breakdown (10 items):** Audit's "no orphans" top-line conclusion is broadly correct — every key has at least one reader. But several keys are dead-by-default, vestigial, or have audit-claim errors.

| Key | Status | Recommendation |
|---|---|---|
| `windowSessions` | ⚠️ PARTIAL — write removed Wave 40, read fallback still active | DELETE — Wave 16 "two releases" window has expired. Remove schema + both read sites together. |
| `multiRoots` | ❌ STALE — 5 live readers | KEEP until callers migrate to per-window roots |
| `routerSettings.llmJudgeSampleRate` | ✅ VERIFIED dead | DELETE — schema, type, UI slider, settings-audit entry. `llmJudge.ts` was never shipped. |
| `routerSettings.autoRetrainEnabled` | ⚠️ PARTIAL (dead-by-default, intentional) | KEEP — deliberate Wave 61 ADR |
| `ecosystem.rulesAndSkillsInstallEnabled` | ⚠️ PARTIAL (dead-by-default, install path incomplete) | WAVE-IT — flip to `true` once install path is wired |
| `InjectOptions.stdioTransportPath` | ⚠️ PARTIAL (second-pass) — half-done rename. `standaloneScriptPath` field exists at `internalMcpAutoInject.ts:121`; `stdioTransportPath` is deprecated at line 125. Live caller `index.ts:39` still uses deprecated field. | ORDER MATTERS: (1) update `index.ts:39` to set `standaloneScriptPath`, (2) verify tests still green, (3) THEN delete `stdioTransportPath` field. Doing it in reverse breaks MCP injection. |
| `InjectOptions.transport` field | ✅ VERIFIED dead | DELETE the field only (keep `InternalMcpTransport` type) |
| `internalMcp.transport` config key | ⚠️ PARTIAL (vestigial branch) | DELETE in cleanup wave — default `'sse'` makes the `'stdio'` branch unreachable |
| `codemode.routeInternalMcp` | ✅ VERIFIED dead | DELETE — no runtime branch reads it post-Wave-53l |
| `TRAINING_CUTOFF_DATE` constant | ❌ STALE — has live consumer | KEEP until all call sites pass `modelCutoffDate` |

### Risks

- **`stdioTransportPath` deletion sequence is load-bearing.** Removing it before updating `buildInjectOptions()` will make the `??` resolve to `undefined`, silently breaking the ouroboros MCP server for all sessions.
- **`windowSessions` deletion needs both reads removed in the same change** to avoid stale `getConfigValue('windowSessions')` calls returning `undefined` instead of `[]`.
- **`llmJudgeSampleRate` UI is actively misleading users** — slider responds to interaction, persists, and controls nothing.

---

## A3. Orphaned IPC

**Source:** `roadmap/cleanup/orphaned-ipc.md`

**Breakdown:** 2 truly orphan, 1 naming collision, 1 future-intent, 7 wired for web/mobile client (correctly absent from Electron renderer), ~100 channels confirmed live.

### Genuinely orphan — DELETE

| Channel | Main | Preload | Renderer caller | Note |
|---|---|---|---|---|
| `app:rebuildAndRestart` | `app.ts:261` | `preload.ts:173` | None | Dev-time feature; spawns `npm run build && npm run dev`. Has unrestricted shell-spawn surface. No UI entry point. |
| `perf:markFirstRender` | `perfHandlers.ts:91` | `preloadSupplementalApis.ts:124` | None | Back-compat alias for `perf:mark('first-render')`; the canonical `perf:mark` is what the renderer actually uses. |

### Naming collision — DELETE

| Channel | Live sibling | Action |
|---|---|---|
| `shell:openExtensionsFolder` (`app.ts:143`) | `extensions:openFolder` (`miscRegistrarsHelpers.ts:195`) | Delete the `shell:` version — renderer uses `extensions:openFolder` exclusively |

### FUTURE-INTENT — WAVE-IT

| Channel | Note |
|---|---|
| `memory:read` | Pre-wired for Wave 63 inline preview. `useMemoryEntries` uses `list`/`onChanged` only. |

### KEEP — wired for web/mobile client (not Electron renderer)

`pty:linkToThread`, `pty:getLinkedThread`, `pty:getLinkedSessionIds`, `window:list`, `window:focus`, `window:close`, `window:getSelf` — all consumed by `src/web/webPreloadApis*.ts`. Electron renderer doesn't call them because there's no multi-window management UI yet.

---

## A4. Orphaned tests

**Source:** `roadmap/cleanup/orphaned-tests.md`
**Verdict:** ✅ Audit's "no orphaned tests" conclusion confirmed (sample of 5 across 5 subsystems). All SUTs exist; `src/web/preloadParity.test.ts` is correctly classified as an intentional contract test.

**Recommendation:** No cleanup action required.

---

## A5. Unused dependencies

**Source:** `roadmap/cleanup/unused-deps.md`

### Safe to delete (5 packages)

| Package | Reason |
|---|---|
| `@xenova/transformers` (v2.17.2) | Dynamic import shadow; embedding system uses Voyage AI provider |
| `depcheck` (v1.4.7) | Superseded by `knip` |
| `jsdom` (v29.0.1) | Only in test docstrings as `@vitest-environment jsdom`; vitest has its own jsdom |
| `remark-gfm` (v4.0.1) | Zero references |
| `babel-plugin-react-compiler` (v1.0.0) | Intended but never wired |

### ❌ STALE — audit was wrong, KEEP

| Package | Live use |
|---|---|
| `vitest-axe` (v0.1.0) | `src/test-utils/axe.ts:13`, `vitest.setup.ts:16` |
| `@capacitor-mlkit/barcode-scanning` (v6.2.0) | `src/web/capacitor/qrScanner.ts:36,58` |

### KEEP — tooling/build infrastructure

`rollup-plugin-visualizer` (ANALYZE=true), `postcss` (Tailwind), `tree-sitter-wasms` (C-language fallback), `knip` (lint tooling), `@capacitor/*` suite (mobile build).

---

## A6. Docs drift

**Source:** `roadmap/cleanup/docs-drift.md`
**Verdict:** All 13 claims VERIFIED. Zero false positives.

### HIGH severity — describes deleted architecture (will mislead agents into configuring nonexistent infrastructure)

| # | Doc | Issue |
|---|---|---|
| 3 | `docs/architecture.md:638–661` | Wave 51 MCP section describes SSE+stdio architecture deleted by Wave 60 |
| 5 | `docs/codemode-internalmcp-routing.md` (whole) | Same — entire doc describes the deleted stack |

### MEDIUM severity — wrong paths/filenames

| # | Doc | Fix |
|---|---|---|
| 4 | `docs/architecture.md:660` | `roadmap/wave-51-*.md` → `roadmap/archive/wave-51-*.md` |
| 6 | `docs/codemode-internalmcp-routing.md:5` | Same |
| 7 | `docs/context-injection.md:149` | Add `providers/` to `claudeCodeContextBuilder.ts` path |
| 8 | `docs/context-ranker.md:21` | Same |
| 9 | `docs/context-ranker.md` | `contextRankerVariant.ts` → `contextSelectorRankerVariant.ts` |
| 10 | `docs/context-ranker.md:9` | `roadmap/wave-53b-analysis.md` → `roadmap/archive/wave-53b-analysis.md` |

### LOW severity

| # | Doc | Fix |
|---|---|---|
| 1 | `docs/architecture.md:488` | "5 built-in themes" → "7" |
| 2 | `docs/architecture.md:480` | "Canvas renderer" → WebGL via `@xterm/addon-webgl` |
| 11 | `docs/data-model.md:55` | `chatPrimary: boolean` is a migration source key, not live; replace with `immersiveChat: boolean` (default `false`) |
| 12 | `CLAUDE.md` (root) Folder Map | Remove `glass` from theme list (no `glass` theme exists) |
| 13 | `README.md:9` | Broken screenshot link `docs/assets/screenshot.png` |

### Open question

`glassOpacity` in `docs/data-model.md:41` — if `glass` theme was never shipped, is this config key also vestigial? Not in scope for the audit, but worth following up.

---

## A7. Stale CLAUDE.md files

**Source:** `roadmap/cleanup/stale-claudemds.md`
**Breakdown:** 13 VERIFIED, 4 FALSE ALARM, 2 PARTIAL.

### Key finding

**Auto-generated sections are also stale, not just manual:preserved.** Three of five audited subsystem CLAUDE.mds have stale entries in their auto-generated blocks. The regeneration pass didn't catch up to Wave-69 file deletions.

### Action table

| File | Section | Issue | Status | Action |
|---|---|---|---|---|
| `agentChat/CLAUDE.md` | auto-gen, line 45 | `threadStoreRuntimeSupport.ts` does not exist | ✅ VERIFIED | UPDATE |
| `agentChat/CLAUDE.md` | auto-gen, Architecture | JSON-runtime branch references deleted file | ✅ VERIFIED | UPDATE |
| `agentChat/CLAUDE.md` | auto-gen, Gotchas line 94 | "Two backends" claim hinges on deleted file | ✅ VERIFIED | INVESTIGATE |
| `agentChat/CLAUDE.md` | manual, line 129 | Same deleted file | ✅ VERIFIED | UPDATE |
| `agentChat/CLAUDE.md` | manual, line 167 | Title-duplication gotcha references deleted file | ✅ VERIFIED | UPDATE |
| `agentChat/CLAUDE.md` | both, Dependencies | `beginChatSessionLaunch` vs `dispatchSyntheticHookEvent` | ❌ FALSE ALARM | KEEP |
| `contextLayer/CLAUDE.md` | auto-gen, line 14 | `contextLayerAiSummarizer.ts` does not exist | ✅ VERIFIED | UPDATE |
| `contextLayer/CLAUDE.md` | auto-gen, Gotchas 63 | `isCodeFile` references deleted `importGraphAnalyzer.ts` | ✅ VERIFIED | UPDATE |
| `contextLayer/CLAUDE.md` | auto-gen, Gotchas 64 | `resolveRelativeImport` references deleted `languageStrategies.ts` | ✅ VERIFIED | UPDATE |
| `contextLayer/CLAUDE.md` | auto-gen, Gotchas 65 | `configureTypeScriptAliases` references deleted file | ✅ VERIFIED | DELETE-SECTION |
| `contextLayer/CLAUDE.md` | manual:preserved entire section | Describes pre-Wave-69 three-option pipeline | ✅ VERIFIED | DELETE-SECTION |
| `contextLayer/CLAUDE.md` | manual, types | `autoSummarize` claim is correct | ❌ FALSE ALARM | KEEP |
| `orchestration/providers/CLAUDE.md` | auto-gen, line 24 | `anthropicAuth.ts` lives in `auth/providers/`, not here | ✅ VERIFIED | UPDATE |
| `orchestration/providers/CLAUDE.md` | auto-gen, line 29 | `anthropicApiAdapter.ts` does not exist anywhere | ✅ VERIFIED | UPDATE |
| `orchestration/providers/CLAUDE.md` | manual, line 99 | "sole ProviderAdapter" — actually 3 | ✅ VERIFIED | UPDATE |
| `orchestration/providers/CLAUDE.md` | manual, Dependencies | `ptyAgentBridge` claim is correct (and is in auto-gen) | ❌ FALSE ALARM | KEEP |
| `router/CLAUDE.md` | manual, File Map line 47 | `llmJudge.ts` not shipped | 🗑️ DROPPED-INTENT | UPDATE |
| `symbolExtractor/CLAUDE.md` | manual, Consumers 41 | `codebaseGraph/graphParser*.ts` doesn't exist | ✅ VERIFIED | UPDATE |
| `symbolExtractor/CLAUDE.md` | manual, Consumers 42 | `internalMcp/internalMcpToolsGraph.ts` doesn't exist | ✅ VERIFIED | UPDATE |
| `symbolExtractor/CLAUDE.md` | manual, Consumers 43 | `contextLayer/moduleSummarizer.ts` exists, correct | ❌ FALSE ALARM | KEEP |

---

## A8. TODO inventory

**Source:** `roadmap/cleanup/todo-inventory.md`
**Verdict:** All 5 TODOs verified at claimed locations. All are intentional deferrals with documented context.

| TODO | Location | Intent | Recommendation |
|---|---|---|---|
| Persist `skillExecutions` on assistant message | `chatOrchestrationBridgeProgress.ts:112` | FUTURE-FEATURE; 3-step roadmap inline | WAVE-IT |
| Refactor `miscRegistrars.ts` (10 unrelated domains) | `miscRegistrars.ts:1-3` | TECH-DEBT | WAVE-IT |
| Wire rulesAndSkills install path | `marketplaceInstall.ts:82` | KNOWN-BUG, gated behind `ecosystem.rulesAndSkillsInstallEnabled` | ADDRESS |
| Mount `useSwipeNavigation` on AgentChatWorkspace | `AgentChatTabBar.tsx:103` | FUTURE-FEATURE, blocked on slot API | WAVE-IT |
| Install monaco-emacs | `monacoVimMode.ts:120` | FUTURE-FEATURE, currently stubbed | DELETE-COMMENT or WAVE-IT |

**Conclusion:** No cleanup action required from the TODO comments themselves; the items are catalogued elsewhere (dead-code, follow-ups).

---

# Section B — Old files

**Source:** `roadmap/oldfiles/oldfiles.md`

### DELETE immediately (~11.7 MB)

| File | Size | Note |
|---|---|---|
| `electron.vite.config.1773455369021.mjs` | 1.5 KB | electron-vite build artifact (timestamp 2026-03-25) |
| `electron.vite.config.1773461758663.mjs` | 1.5 KB | duplicate from same session |
| `tmp_monitor.py` | 2.6 KB | one-shot script with hardcoded agent ID |
| `codebase-graph.db` | 7.4 MB | orphan from prior reindex; production DB lives in `userData/` |
| `codebase-graph.db-shm` | 32 KB | companion to orphan db |
| `codebase-graph.db-wal` | 4.1 MB | companion to orphan db |

### DELETE + `git rm --cached` (gitignored but tracked)

| File | Size | Note |
|---|---|---|
| `tsconfig.web.tsbuildinfo` | 387 KB | Matches `.gitignore:17` (`*.tsbuildinfo`) |
| `vitest-results.json` | 1.3 MB | Matches `.gitignore:96` |
| `.lint-report.json` | 525 KB | Matches `.gitignore:91` |

### KEEP — auto-regenerated, ships in distribution

- `THIRD_PARTY_LICENSES` (331 KB) — regenerated by `npm run licenses`; included in electron-builder `files` array.

### KEEP — load-bearing, actively wired

- **`AGENTS.md`** (2.7 KB) — provider-aware rules convention. Read by `src/main/rulesAndSkills/rulesReader.ts:13`, watched by `rulesWatcher.ts:16`, surfaced in renderer via `RulesSkillsPanelParts.tsx:19`. NOT a stale documentation file.
- **`capacitor.config.ts`** (1 KB) — Wave 33 mobile bootstrap. Wired into `package.json` scripts (`cap:sync`, `cap:android`, etc.) and the entire `src/web/capacitor/` bridge module (haptics, keyboard, splash, deep links, QR scanning). Active.

---

# Section C — Settings audit

**Source:** `roadmap/settings/settings-audit.md`
**Note:** Audit had 22 ⚠ entries across 27 tabs. Verification reclassified 11 of those as ❌ STALE (audit was wrong; the controls work correctly). Most stem from misreading the live-preview "bypass-draft via `useConfig().set`" pattern as evidence of unwired controls.

## C1. Part A — General through Agent Profiles

### ❌ STALE (audit was wrong — KEEP, no action needed)

| Item | Why audit flagged | Reality |
|---|---|---|
| `AccentPicker` | "Operates outside `onChange`" | Uses `useConfig().set` directly with 16ms debounce — intentional live-preview pattern (`AccentPicker.tsx:41,98-108`) |
| `ThinkingVerbPicker` | "Manages own state" | Same pattern — `useConfig()` direct write |
| `PaneFontPickerSection` | "No props from draft" | Same — self-contained by design |
| `AppearanceSectionVsCodeImport` | "Fires IPC directly" | `useConfig().set`, not raw IPC |
| `customCSS` | "Config key not verified" | Fully wired: schema, draft, save, renderer consumer (`App.helpers.tsx:80`) |
| `agentChatSettings.defaultView` | "No renderer consumer" | `useAgentChatDefaultView.ts:22-23` reads it |
| `agentChatSettings.openDetailsOnFailure` | "No consumer" | `useAgentChatLinkedDetailsSupport.ts:275` reads it |
| Model slot assignments (3 of 4) | "No reader in main" | Audit used wrong key name (`modelSlotAssignments` vs actual `modelSlots`); `terminal`, `agentChat`, `inlineCompletion` all wired via `buildProviderEnv()` |
| `ProviderApiKeysSection` | "Manages own IPC" | Correctly delegates to `useAuth()` — security architecture, not config draft |

### ✅ VERIFIED-PARTIAL (genuine gap, fixable)

| Item | Gap | Recommendation |
|---|---|---|
| `webAccessPassword` | Write path complete; no UI feedback indicating "password is set" | WAVE-IT — add SecureKeyStore-presence indicator |
| `useMcpHost` | Schema/UI/storage all wired; no main-process reader gates anything on it | WAVE-IT — insert `getConfigValue('useMcpHost')` check in MCP host launch path |
| `routerSettings.layer3Enabled` | Stub correctly labeled; never read by router | KEEP — UI is correct future-intent stub |
| `modelSlots.claudeMdGeneration` | Only slot of 4 not consumed | WAVE-IT — wire `buildProviderEnv('claudeMdGeneration')` into CLAUDE.md generation spawn |

### 🔮 INVESTIGATE-FURTHER

| Item | Note |
|---|---|
| `agentChatSettings.defaultVerificationProfile` | Resolved into `ResolvedAgentChatSettings` and threaded into `chatOrchestrationRequestSupportOptions.ts:141`; behavioral effect unconfirmed past that point |

## C2. Part B — Files through Accounts

### ❌ STALE (audit was wrong — KEEP)

| Item | Reality |
|---|---|
| Platform / Language picker | Fully wired via `useLocale()` → `config.platform.language` (`PlatformLanguageSection.tsx:61`, `useLocale.ts:39`) |
| Platform / Update channel | Read by `updater.ts:118-124,139` and applied to electron-updater. Tested in `updater.test.ts:152-190` |
| Telemetry "remote transmission" toggle | Intentionally `disabled` placeholder for future wave (`TelemetrySection.tsx:69-93`). Reclassify from 🔴 broken to 🔮 FUTURE-INTENT |

### ⚠️ VERIFIED-PARTIAL

| Item | Gap | Recommendation |
|---|---|---|
| CodeMode / MCP server names input | Component-local state; resets on each open. May be by-design (one-shot provisioning) | KEEP, or INVESTIGATE-FURTHER if pre-fill expected |
| Export Usage / time window default | Resets to '24h' each open; no persistence key | WAVE-IT (low priority) |
| Export Usage / output path | Auto-generates timestamped filename each open; `lastExportInfo()` partially mitigates | WAVE-IT (low priority) |

### Summary correction

The audit's summary (88 ✅ / 22 ⚠ / 0 ❌ / 1 🔴 = 111 total) shifts after verification:
- ⚠ count drops by ~11 (false-positive bypass-draft components)
- 🔴 count drops to 0 (telemetry remote is 🔮, not 🔴)
- ✅ count rises accordingly

---

# Section D — Follow-ups

**Source:** `roadmap/follow-ups/follow-ups.md`
**Breakdown (155 items):** 12 DONE · 8 PARTIAL · 71 NOT-DONE · 18 SUPERSEDED · 19 NOW-USELESS · 27 STILL-RELEVANT.

### Notable observations

- **Wave 60 silently closed many items.** The standalone MCP server at `src/standalone/ouroborosMcp/` resolved at least 6 follow-up items from Waves 53c–53j (Flavor B, SDK adoption, SSE hand-roll removal, `internalMcp` barrel split, CodeMode user-level global) that the follow-ups list still shows as open.
- **Wave 69's two implementation items confirmed wired** (`mainStartupContextLayerTrigger.ts` at `mainStartup.ts:233`, log spam fix in commit `d804a8e`).
- **`startContextRetrainTrigger` is unwired in production.** Fully implemented (260 lines + tests), zero call sites in `main.ts`, `mainStartup.ts`, or any IPC handler. The retrain system cannot activate. **Confirmed in second-pass** — only the module itself, its test file, and docs/roadmap mentions reference the symbol.
- **Orphan `codebase-graph.db*` files** (7.7 MB) physically present in repo root. Production path is `userData/codebase-graph.db`. Repo-root copies are stale dev artifacts.
- **Legacy parameter aliases in `mcpToolHandlers.ts`** outlived their one-wave window (Wave 66 ADR Decision 2). `name_pattern`, `qualified_name`, `function_name` should be dropped.
- **Cypher engine unsupported features** (`OPTIONAL MATCH`, `WITH`, `UNWIND`, multi-pattern MATCH) — agents writing Cypher with these get silent failures. `get_graph_schema` doesn't warn. ~~`OR` in WHERE~~ corrected 2026-05-01: `OR` IS supported (`cypherEngineParser.ts:148-149`, `cypherEngineSqlHelpers.ts:56-58`); audit was wrong on that one.
- **`agentMonitor.subagentDisplay.enabled`** still default `false`; Phase E soak criteria never recorded as met.

### Items to CLOSE (✅ DONE)

| Item | Wave | Evidence |
|---|---|---|
| `codemode.excludeFromMultiplex` config option | 53k | `configSchemaTailExt.ts:315`, `codemodeStartup.ts`, `internalMcpRoutingPolicy.ts` |
| Wave 53l universal multiplexer / user-level takeover | 53l | `enableCodeModeUserLevel()` in `codemodeStartup.ts`, called from `mainStartup.ts` |
| `ResearchOutcomeRecord` missing fields | 29.5 | `researchOutcomeWriter.ts:35,43,48` — all three present |
| Wave 51 `internalMcp` barrel split | 51 | `internalMcp/index.ts` is now thin barrel (Wave 60 deleted old machinery) |
| Wave 51 `main.ts` split | 51 | `mainStartup.ts`, `mainStartupContextLayerTrigger.ts` extracted |
| Wave 52 hook auto-install | 52 | `hookInstaller.ts` auto-installs at startup |
| Wave 53c/53d/53e standalone Flavor B | 53c–53j | `src/standalone/ouroborosMcp/` ships with Electron binary |
| Wave 53j SDK SSE migration | 53j | Wave 60 adopted SDK for standalone (`ouroborosMcpServer.ts`) |
| Wave 51 CodeMode for user-global MCP servers | 51 | `enableCodeModeUserLevel()` patches `~/.claude.json` globally |
| Wave 25 side chat drawer "is a stub" | review | `SideChatDrawer.tsx` is full implementation |
| Wave 69 contextLayer rebuild after graph-ready | 69 | `mainStartupContextLayerTrigger.ts`, commits `39af078`/`9d0c0ec` |
| Wave 69 graph-not-ready spam reduction | 69 | Commit `d804a8e` |

### Items to CLOSE (🗑️ NOW-USELESS)

UUID v7 follow-up (15), iOS Capacitor/APNs path (33a/33b/34 — project went FCM/Android), Wave 47 stash drops, Wave 48 telemetry backfill (time-sensitive), Wave 50 source-rule deletion (still in active use as slash-command sources), Wave 53 Phase D blocking Wave 54 (Wave 54 paused for graph-adoption reasons instead), Wave 53a Q3 one-sided outcomes (YAGNI), Wave 53i external dedup UI (architecture changed), Wave 58 audit #13 NIT, Wave 46/47/58 `chatWorkbench` flag flip (retired in Wave 59), Wave 45 app-server pooling/warm-up (Codex architecture changed), Manual smoke gate items for closed waves, Wave 50 graph-adherence "worst session" investigation (historical IDs).

### Items SUPERSEDED (🔄)

Auto-sync graph staleness (Wave 60 standalone replaces SSE relay), `chatWorkbench` default flip (retired in Wave 59), CodeMode `routeInternalMcp` flag (replaced by `excludeFromMultiplex`), SDK adoption (done in Wave 60), Wave 53f SSE handler claim (deleted in Wave 60), Mobile responsive layout (chat-only shell exists; gap is specifically cross-window delegation).

### High-priority STILL-RELEVANT candidates for next wave

1. Wire `startContextRetrainTrigger` or delete it (data-foundation-audit)
2. Drop legacy `mcpToolHandlers.ts` parameter aliases (`name_pattern`, `qualified_name`, `function_name`) — Wave 66 follow-up
3. Migrate `McpToolDefinition` envelope to `{ isError, content }` — Wave 66
4. Fix `parseAnomalies` absent-when-zero in `index_status` (`mcpToolHandlerDefs.ts:83`) — Wave 67
5. Wire `model:` argument in `enrichPacketWithContextLayer` from `TaskRequest` — Wave 69
6. Delete orphan `codebase-graph.db*` files in repo root — Wave 60
7. SQLite VACUUM/compaction not wired (Wave 27 promise) — waves-15-29 review
8. `useSwipeNavigation` mount + `agentMonitor.subagentDisplay.enabled` default flip — Waves 32, 57
9. Cross-window IDE-tool delegation Option 2 — Waves 42–44
10. `mobileAccess.enabled` and `sessionDispatch.enabled` default flip after soak — Wave 41
11. Cypher engine: `OPTIONAL MATCH`, `WITH`, `UNWIND`, multi-pattern `MATCH` — Wave 68 (NB: `OR` in WHERE is already supported — audit was wrong; corrected 2026-05-01)
12. `cypherEngine.ts` `p.indexed_at` ISO conversion at query time — Wave 68
13. Confidence scoring for call-resolution edges (currently default 1.0) — Wave 67/68
14. Tree-sitter `accessor` keyword via `@vscode/tree-sitter-wasm` upgrade — Wave 67
15. Disabled rule IDs in context preview not honored at send path — Wave 59
16. `warnFullTestSuite` agent-visible via `pre_tool_use.mjs` stdout — Wave 50
17. Memory write/delete IPC + inline drill-down preview (`memory:read`) — Wave 63

### INVESTIGATE-FURTHER

- `list_projects` 0-stat refresh bug (Wave 53e/53f) — was this fixed or does it persist in standalone?
- ~~`contextWorker.ts` wiring — orchestration CLAUDE.md says wired; data-foundation-audit says not~~ **RESOLVED in second-pass: IS wired (`ipc-handlers/agentChatContext.ts:103-209`). The audit doc is wrong, not the code.**
- Wave 69 ESCALATE-1/3 outcomes (`languageStrategies.ts` deletion scope, `contextInjector.ts` B1 touch points)
- Wave 47 `FORCE_FINALIZE_DELAY_MS` constant — couldn't locate anywhere in codebase
- Codex exec-transport <1% threshold — runtime metric

---

## End of report

This consolidated verification artifact is the basis for the second-pass triage. Recommended next steps:

1. **Quick wins (delete-only):** old files (~12 MB), 5 deps, the highest-confidence dead-code DELETE items, 6 stale doc paths.
2. **Cleanup wave:** stale CLAUDE.md regen (auto-gen blocks), Wave-51-era doc rewrites (HIGH-severity drift), `windowSessions` removal.
3. **Finish-the-stubs decisions:** `llmJudge`/Layer 3 router, `enableEmacsMode`, `useSwipeNavigation`, `useMcpHost`, `modelSlots.claudeMdGeneration`, `webAccessPassword` UI feedback.
4. **Critical wiring fix:** `startContextRetrainTrigger` (decide: wire or delete).
5. **Defer pending verification:** `stdioTransportPath` rename sequencing, Cypher engine feature gaps, MCP tool envelope migration.
