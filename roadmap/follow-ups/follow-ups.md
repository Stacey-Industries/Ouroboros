# Wave Follow-ups & Deferrals — Centralized Index

**Generated:** 2026-05-01.
**Method:** Read-only sweep of every `.md` under `roadmap/` (auto-briefs, archive, and root). Three subagents covered different subtrees; output consolidated here.
**Format:** `- **<wave-or-doc>** (`<source-path>`): one-line pointer.`
**Caveat:** This is a *pointer* index. Whether each item was later completed is NOT verified — the user requested capture of every "deferred / follow-up / out-of-scope / open question" mention so nothing falls through the cracks. Cross-reference against current code/state before acting on any single entry.

---

## Closure manifest (2026-05-01)

45 items below have been triaged: 12 closed as DONE, 16 as SUPERSEDED, 13 as NOW-USELESS, 4 moved to `roadmap/deferred/`. Authoritative tracker: `roadmap/audit-verification-pass.md` — Triage status section. Source lines below remain unedited so the original capture is preserved verbatim; this manifest is the index. One additional item (`list_projects` 0-stat refresh) was moved from SUPERSEDED to STILL-RELEVANT after verification — see "Newly identified" section below.

### Closed as DONE (verified shipped)

| Line(s) | Item | Wave |
|---|---|---|
| 13 | `codemode.excludeFromMultiplex` | 53k |
| 16 | Universal multiplexer / user-level takeover | 53l |
| 81 | `ResearchOutcomeRecord` missing fields | 29.5 |
| 104, 105, 158 | `internalMcp` barrel split | 51 |
| 104, 105, 107 | `main.ts` split | 51/52 |
| 106 | Hook auto-install | 52 |
| 116, 118, 119, 120, 121 | Standalone Flavor B (53c–e) | 53c–j |
| 126 | SDK SSE migration | 53j (via Wave 60) |
| 104, 105, 157 | CodeMode for user-global MCP servers | 51 |
| 136 | Side chat drawer "is a stub" | review (already shipped) |
| (no follow-ups.md line — captured in audit Section D) | Wave 69 contextLayer rebuild after graph-ready | 69 |
| (no follow-ups.md line — captured in audit Section D) | Wave 69 graph-not-ready spam reduction | 69 |

### Closed as SUPERSEDED

| Line(s) | Item | Superseded by |
|---|---|---|
| 15 | Auto-sync graph staleness | Wave 60 standalone reindexer |
| 104, 156 | `routeInternalMcp` flag flip / soak (Wave 51) | `excludeFromMultiplex` (53k) |
| 129 | CodeMode soak → flip schema defaults (53j) | Same — `excludeFromMultiplex` |
| 156 | `routeInternalMcp` flag flip (Wave 51 follow-up) | Same |
| 126 | SDK SSE replacement / hand-rolled drift removal (53h) | Wave 60 SDK adoption |
| 122, 127, 128, 129 | Streamable HTTP transport migration (53f/h/i × 4) | Wave 60 SDK uses SSE fallback |
| 123 | "SSE client tracking / broadcasts" claim (53f) | Infrastructure deleted in Wave 60 |
| 120, 121, 124, 125 | Per-spawn `--mcp-config` path verification (53e–g × 4) | Universal multiplexer (53l) |
| 127 | Bundle externalization for electron-builder (53i) | Wave 60 standalone built independently |
| 91 | Mobile responsive layout for chat-only (Wave 44) | Chat-only shell + workbench variant exists |
| 94 | `chatWorkbench` default flip (Wave 46) | Retired in Wave 59 |
| 96 | `chatWorkbench` default flip (Wave 47 plan) | Same |
| 97 | `chatWorkbench` default flip (Wave 47 result) | Same |
| 146 | `chatWorkbench` default flip (Wave 47 soak) | Same |
| 131, 132 | `chatWorkbench` default flip (Wave 58) | Same |
| 116, 118, 119, 121, 122, 123, 124 | Version-drift cleanup (Wave 53c–g briefs vs git tags) | Subsumed by Wave 60 archive |

### Closed as NOW-USELESS

| Line(s) | Item | Reason |
|---|---|---|
| 80 | UUID v7 follow-up (Wave 15) | No external integration ever required v7 |
| 132 | Wave 47 stash@{0}/{1} drops (Wave 58) | Stashes for closed wave |
| 98 | Wave 48 telemetry backfill | Time-window passed |
| 109 | Phase D historical corpus analyzer (Wave 53) | Telemetry-dark-signals restored 2026-04-26 |
| 109 | Phase F router backfill blocked on Phase D (Wave 53) | Same — blocking item moot |
| 110, 115 | Wave 54 semantic-ops gated on Phase D (Wave 53/53c) | Wave 54 paused for graph-adoption reasons |
| 111, 112 | Wave 53a Q3 one-sided context outcomes | Explicit YAGNI |
| 124, 125 | Wave 53i external `codebase-memory-mcp` dedup UI (Wave 53g) | Architecture changed |
| 132 | Wave 58 audit #13 rail prop NIT | Cosmetic, intentionally left open |
| 130 | Wave 50 worst-session investigation (`439565f2`) | Historical session ID |
| 130, 161 | Quarterly graph-adherence re-run (Wave 50) | Moved to live router calibration model |
| 102, 159 | Wave 50 source-rule deletion | Verified files still in active use — won't-delete |
| 34, 45, 53, 69 | Manual smoke gate items for closed waves (62/63/66/69) | Not retroactively required |

### Moved to `roadmap/deferred/` (preserved for future maintainers)

| Line(s) | Item | Deferred file |
|---|---|---|
| 83 | Wave 33a iOS native packaging | `roadmap/deferred/ios-mobile-packaging.md` |
| 84 | Wave 33b iOS APNs push + App Store submission | Same |
| 85 | Wave 34 native push notifications (iOS) | Same |
| 92, 93 | Wave 45 app-server pooling/warm-up + exec-transport removal | `roadmap/deferred/codex-transport-architecture.md` |

### Newly identified STILL-RELEVANT

- **`list_projects` 0-stat refresh bug** (lines 121, 122, 123) — originally tagged for SUPERSEDED, but verification confirms the bug persists in current code. The `projects` table caches `node_count`/`edge_count` columns that never refresh due to an `INSERT OR REPLACE` cascade bug (`graphControllerCompat.integration.test.ts:189-193`). `handleListProjects` reads the stale cached zeros instead of calling `getNodeCount()` live. To file as a standalone wave or bundle into `graph-mcp-polish.md`/`cypher-engine-feature-additions.md`.

- **`/spec featureName` send-path is structurally broken (pre-existing, surfaced during Wave 81 smoke)** — typing `/spec myFeatureName` and pressing Enter sends the literal text as a chat message instead of running `useSpecAction` → `spec.scaffold({projectRoot, featureName})`. Root cause: `extractSlashQuery` (`src/renderer/components/AgentChat/AgentChatComposerParts.tsx:148-156`) returns `null` when the query contains whitespace, so the slash menu closes the moment the user types a space after the command name. With the menu closed, `useSlashEnter` returns false and Enter falls through to send. Selecting `/spec` from the menu while the draft is still just `/spec` (no args) calls `runSpec` with an empty `featureName` — which our Wave 81 guard correctly turns into a no-op (no more "invalid feature name" toast), but no scaffolding ever happens. Same issue affects `/remember`. **Fix path:** mirror `useResearchIntercept` (`src/renderer/components/AgentChat/AgentChatComposerSection.research.ts`) — add a send-time interceptor that catches `/spec ...` / `/remember ...` messages, parses the arg, and routes to the IDE-side action handler instead of sending as text. Roughly a 30-line addition. Discovered 2026-05-03 during Wave 81 Phase E smoke verification. Not a Wave 81 regression — predates Wave 25.

### Already filed last session (17 STILL-RELEVANT items)

See `roadmap/audit-handoff-2026-05-01.md` for the prior session's filing list. Filed in `roadmap/future/`: context-injection-completion, graph-mcp-polish, telemetry-archival-completion, agent-chat-swipe-navigation, cypher-engine-feature-additions, graph-edge-confidence-scoring, disabled-rules-honor-at-send-path, warn-hooks-stdout-surfacing, memory-curation-completion. Direct code actions: orphan DB cleanup, `agentMonitor.subagentDisplay.enabled` default flip, `accessor` keyword fixture.

### What's NOT in this manifest

The 71 NOT-DONE items (genuine outstanding follow-ups not yet filed or closed) plus the 8 PARTIAL items remain open. Audit Section D notes which audit subsections (A1 dead code, A2 dead config keys, A6 docs drift, A7 stale CLAUDE.md, Section C settings) still need their own triage passes.

---

## From wave auto-briefs

### Wave 53k (`roadmap/_archived/wave-53k/wave-53k-auto-brief.md`)
- **Wave 53k**: `codebase-memory-mcp.exe` stalls on `tools/list`; add `codemode.excludeFromMultiplex` config option.
- **Wave 53k**: Triple-keyed `~/.claude.json projects` map (forward-slash/backslash/worktree variants) still unresolved.
- **Wave 53k**: Auto-sync graph staleness — `files=0` despite file edits; change-detection not catching git-uncommitted writes.
- **Wave 53k**: Wave 53l (universal multiplexer per-spawn → user-level takeover) not yet executed.

### Wave 61 (`roadmap/wave-61-delegation-coach/wave-61-auto-brief.md`)
- **Wave 61**: Live Opus-session smoke deferred — confirm at least one nudge fires and lands in `delegation-coach.jsonl`.
- **Wave 61**: Phase F soak + analytics — run after ≥1 week; promote ≥1 pattern to ack tier or document soft-only decision.
- **Wave 61**: Pattern auto-discovery — mine JSONL for repeated tool-use sequences not in the library.
- **Wave 61**: Settings panel for per-pattern enable/disable + tier toggle in IDE settings view.
- **Wave 61**: Cross-project pattern library — currently global per user; defer until needed.
- **Wave 61**: Richer trigger DSL — 5 deferred patterns need argument fingerprinting, file-content inspection, content-size checks.
- **Wave 61**: Per-pattern-id escalation in pending state — bypass currently clears all unjoined patterns, not just hard-tier ones.
- **Wave 61**: `build:coach-hook` not wired into `postbuild`; currently a manual script.
- **Wave 61**: Hook latency telemetry — measure `detectPatterns` if Phase F shows slow-fire reports.

### Wave 62 (`roadmap/wave-62-rule-toggles/wave-62-auto-brief.md`)
- **Wave 62**: No persistent rule profiles — ephemeral only by design; persistent profiles explicitly deferred.
- **Wave 62**: Concurrent-window race — window A toggles off rule X while window B spawns sees it disabled; accepted for v1.
- **Wave 62**: No telemetry on toggle usage — deferred per scope.
- **Wave 62**: No Settings-modal mirror — user opted for popup-style surface only in v1.
- **Wave 62**: Manual smoke gate not completed — user must sign checklist before push.

### Wave 63 (`roadmap/wave-63-popover-tab-coverage/wave-63-auto-brief.md`)
- **Wave 63**: Live-path Tools enumeration (init-event capture from stream-json) deferred — static path only.
- **Wave 63**: Tool toggling via `--allowedTools` / `--disallowedTools` deferred per ADR Decision 1.
- **Wave 63**: Memory entry write/delete from popover deferred.
- **Wave 63**: Memory inline drill-down preview — `memory:read` IPC wired but unused this wave.
- **Wave 63**: Search/filter input in any popover tab out of scope.
- **Wave 63**: IDE-shell variant parity for the context-preview popover (currently chat-only only).
- **Wave 63**: User-level rules not loading in contractor-app IDE chat popover — investigate `useFilesystemDisabledRuleIds` / `loadedRules` on different cwd shape.
- **Wave 63**: Pre-existing test failure in `mobile-touch-targets.test.ts` (button height check) — tracked separately.
- **Wave 63**: Manual smoke gate not completed.

### Wave 66 (`roadmap/wave-66-graph-mcp-fixes/wave-66-auto-brief.md`)
- **Wave 66**: `manage_adr` per-ID targeting deferred — schema accepts `id`/`adr_id` but DB methods are project-scoped only.
- **Wave 66**: Confidence values on call-resolution writes — column exists (default 1.0); nuanced scoring is next iteration.
- **Wave 66**: Drop legacy parameter aliases (`name_pattern`, `function_name`, `qualified_name`, `inbound`/`outbound`) — kept for one wave per ADR Decision 2.
- **Wave 66**: `McpToolDefinition` envelope migration from `Promise<string>` to `{ isError, content }` — separate wave.
- **Wave 66**: Graph tool adoption telemetry re-measure — was 0% in 369 sessions; re-measure post-Wave-66.
- **Wave 66**: Manual smoke gate not completed.

### Wave 67 (`roadmap/wave-67-indexer-coverage-repair/wave-67-auto-brief.md`)
- **Wave 67**: Cypher engine quality bugs (confidence column access, `labels()` drop, `p.indexed_at` mismatch) — filed as Wave 68 candidate.
- **Wave 67**: `@vscode/tree-sitter-wasm` upgrade for `accessor` keyword and TS 5.x features — out of scope.
- **Wave 67**: Project-wide audit of files still showing File-only nodes after reindex — if count non-trivial, file Wave 68 follow-up.
- **Wave 67**: Probe 4 (`parseAnomalies`) absent from `index_status` when count=0 — fix to always render the field.
- **Wave 67**: Probe 6 (`CALLS→Class` Cypher) returned total node count — Cypher engine ignores target-label filters in relationship patterns.

### Wave 68 (`roadmap/wave-68-cypher-engine-quality/wave-68-auto-brief.md`)
- **Wave 68**: Unsupported Cypher features — `OPTIONAL MATCH`, `WITH`, `UNWIND`, `OR` in WHERE, multi-pattern MATCH, custom aggregations. Parser rewrite needed.
- **Wave 68**: Multi-label nodes — schema stores one label per node; `labels(n)` returns string not array. Schema change required.
- **Wave 68**: `p.indexed_at` returned as Unix-ms in Cypher results — no ISO conversion at query time.
- **Wave 68**: Confidence value population — all existing edges have confidence=1.0; differentiated scoring requires `indexingPipelineCallResolution.ts` updates.

### Wave 69 (`roadmap/wave-69-context-layer-graph-integration/wave-69-auto-brief.md`)
- **Wave 69**: Manual smoke gate not completed — user must sign checklist and inspect `.context/repo-map.json`.
- **Wave 69**: B2 ranking precision — per-module COUNT(*) is coarse; switch to per-symbol scoring once cypherEngine grows GROUP BY.
- **Wave 69**: B3 ESCALATE-2 — modules with >200 outbound edges drop edges over LIMIT; revisit if Wave 70 needs tighter coverage.
- **Wave 69**: `model:` threading — `enrichPacketWithContextLayer` passes `undefined` until `TaskRequest` carries target model.
- **Wave 69**: `ModuleBoundarySignals` fields on `DetectedModule` are zero-initialized and unread — dead-code housekeeping.
- **Wave 69**: Pre-existing test failures in 5 files (mobile-touch-targets, channelCatalogCoverage, TitleBar.menus, ChatWorkbenchFollowThrough, ChatWorkbenchShell) unrelated to Wave 69.

---

## From roadmap/_archived/

- **Wave 15** (`roadmap/_archived/wave-15-plan.md`): UUID v7 vs v4 — follow-up ticket if v7 needed for external tool integrations.
- **Wave 29.5** (`roadmap/_archived/wave-29.5-plan.md`): `ResearchOutcomeRecord` missing `toolKind`, `outcomeSignal`, `followupTestExit` fields — not implemented per data-foundation audit.
- **Wave 30** (`roadmap/_archived/wave-30-plan.md`): Legacy `TRAINING_CUTOFF_DATE` constant in `stalenessMatrixData.ts` — deprecated but not removed.
- **Wave 33a** (`roadmap/_archived/wave-33a-plan.md`): iOS native packaging (Capacitor/Tauri) deferred to Wave 33c; iOS builds blocked until Mac access.
- **Wave 33b** (`roadmap/_archived/wave-33b-plan.md`): Push notifications APNs (iOS) deferred; Android-only until Mac access. App-store submission deferred.
- **Wave 34** (`roadmap/_archived/wave-34-plan.md`): Native push notifications (Phase F) require Wave 33b push plugin; degrade to in-app banner if push is absent.
- **Wave 41** (`roadmap/_archived/wave-41-plan.md`): `mobileAccess.enabled` and `sessionDispatch.enabled` default flips deferred to follow-up patch release after dogfood soak.
- **Wave 41** (`roadmap/_archived/wave-41-plan.md`): `ecosystem.rulesAndSkillsInstallEnabled` defaults false — install path not wired end-to-end.
- **Wave 42** (`roadmap/_archived/wave-42-plan.md`): Cross-window IDE-tool delegation (Option 2) deferred.
- **Wave 43** (`roadmap/_archived/wave-43-plan.md`): Cross-window IDE-tool delegation still open as Wave 44+ candidate.
- **Wave 43** (`roadmap/_archived/wave-43-plan.md`): `detectLocalIp()` exclusion-list fix (user-pick interface) deferred to Wave 44.
- **Wave 44** (`roadmap/_archived/wave-44-plan.md`): Cross-window IDE-tool delegation deferred from Wave 42/43; mobile responsive layout for chat-only deferred.
- **Wave 45** (`roadmap/_archived/wave-45-plan.md`): App-server process pooling across sessions; Codex exec-transport removal after <1% fallback rate; Codex subscription auth polish; tool-use parity audit Claude vs Codex.
- **Wave 45** (`roadmap/_archived/wave-45-plan.md`): Session warm-up (pre-spawn app-server) — profile before committing.
- **Wave 46** (`roadmap/_archived/wave-46-plan.md`): `layout.chatWorkbench` default flip deferred pending soak; adaptive auto-open, multi-session compare, artifact history, per-session branch/worktree controls all out-of-wave.
- **Wave 46** (`roadmap/_archived/auto-briefs/wave-46-blocked.md`): Phase F chat-only command filter artifacts preserved but never committed due to Wave 53 tsc-blocking WIP.
- **Wave 47** (`roadmap/_archived/wave-47-plan.md`): `layout.chatWorkbench` default flip, cross-window workbench attention sync, export/share timeline snippets, per-session notification preferences.
- **Wave 47** (`roadmap/_archived/auto-briefs/wave-47-result.md`): `layout.chatWorkbench` default flip still deferred; cross-window workbench attention sync deferred; timeline entry window tuning needs production data; export/share timeline snippets deferred.
- **Wave 48** (`roadmap/_archived/wave-48-plan.md`): Wave 50 enforcement — decide whether logging hook becomes enforcing hook; goal classifier refinement if false-negative >5%; telemetry backfill for pre-48 sessions.
- **Wave 48** (`roadmap/_archived/auto-briefs/wave-48-result.md`): Phase F integration spawn-token-budget test deferred; telemetry rollup script `scripts/summarize-graph-usage.ts` deferred; Settings UI for `internalMcpScope` and `packetMode:'auto'` out of scope.
- **Wave 49** (`roadmap/_archived/wave-49-plan.md`): Gotcha extraction from git history (backfill from bug-fix commits); lint rule for derivable-content EXCLUDE list; telemetry-driven prompt tuning.
- **Wave 49** (`roadmap/_archived/auto-briefs/wave-49-result.md`): Pre-existing ESLint warnings in `FileViewerChrome` and `HtmlPreview` — sweep in next renderer-touching wave; gotcha extraction from git history.
- **Wave 50** (`roadmap/_archived/wave-50-plan.md`): Original rule file deletion (`~/.claude/rules/init-safety.md`, `project-claude-md-template.md`) deferred one wave for soak; project-level `.claude/rules/` migration (9 files) deferred.
- **Wave 50** (`roadmap/_archived/auto-briefs/wave-50-result.md`): `warnFullTestSuite` warnings not agent-visible (IDE-log only); `hooks.enforcedRules` has no Settings UI toggle; Phase D classifier can't distinguish find-callers vs find-mentions; original rule file deletion still pending; hook misfire telemetry not measured; user-facing hook toggle UI not wired.
- **Wave 51** (`roadmap/_archived/wave-51-plan.md`): CodeMode soak + `routeInternalMcp` flag flip; CodeMode for user-global MCP servers (`sentry`, `github`, `stripe`, `codebase-memory`, `context7`) deferred; user-facing CodeMode toggle UI; dynamic tool unloading; `main.ts` split (at 337 lines, over cap).
- **Wave 51** (`roadmap/_archived/auto-briefs/wave-51-result.md`): CodeMode soak/flag-flip follow-up; CodeMode for user-global MCP servers; leaf-module extraction from `internalMcp/index.ts`; `main.ts` cleanup (4 prettier-ignore directives).
- **Wave 52** (`roadmap/_archived/wave-52-plan.md`): Hook auto-install automation; SQLite mirror of all queued telemetry records; drain throttling for large queues.
- **Wave 52** (`roadmap/_archived/auto-briefs/wave-52-result.md`): Hook installation is manual — auto-install is Wave 53a+ follow-up; `main.ts` at 337 lines (grandfathered disable, needs split); fundamentally-IDE-only telemetry surfaces (#5,#8–11,#15–17) remain uncaptured.
- **Wave 52** (`roadmap/_archived/wave-52-audit.md`): Telemetry surfaces #5,#8,#9,#10,#11,#15,#16,#17 classified fundamentally-IDE-only and left deferred.
- **Wave 53** (`roadmap/_archived/auto-briefs/wave-53-result.md`): Phase D (historical corpus analyzer + decision report) deferred; Phase F (router backfill + offline eval) blocked on Phase D; Phase G integration test `telemetryRestoration.integration.test.ts` skipped; `docs/telemetry.md` not written.
- **Wave 53** (`roadmap/_archived/wave-53-plan.md`): Wave 54 semantic-ops build-out gated on Phase D report; router retrain gated on Phase F; telemetry aggregation dashboard; remote telemetry transmission (explicit opt-in wave); cross-project corpus analysis; effort signal instrumentation.
- **Wave 53a** (`roadmap/_archived/wave-53a-plan.md`): Q3 one-sided context outcomes deferred (YAGNI); codegen hook helper from TS schema; lint check for schema mirror drift; hook auto-uninstall not implemented.
- **Wave 53a** (`roadmap/_archived/auto-briefs/wave-53a-result.md`): Q3 one-sided context outcomes deferred; codegen hook helper from TS schema; lint check for schema mirror drift; hook auto-uninstall still manual; PostToolUse → file-touched-per-turn deferred to Wave 53b; harden `hookInstallerStatusLine.ts` atomic-write pattern.
- **Wave 53b** (`roadmap/_archived/wave-53b-plan.md`): Bayesian weight optimization (needs N≥200 corpus); learning-to-rank with embedding signals; PostToolUse → file-touched-per-turn deferred; per-user ranker tuning; cache-hit rate analysis for 60s packet cache.
- **Wave 53b** (`roadmap/_archived/auto-briefs/wave-53b-result.md`): Quarterly re-run of `analyze-ranker-hit-rate.ts`; Bayesian weight optimization; LTR with embedding signals; PostToolUse file-touched-per-turn deferred; metric-comparison dashboard; per-user ranker tuning; cache-hit rate analysis.
- **Wave 53c** (`roadmap/_archived/wave-53c-plan.md`): Wave 54 TS semantic ops gated on Phase C outcome (now PAUSED on 53d); router retrain wave gated on Phase D evaluation.
- **Wave 53c** (`roadmap/_archived/auto-briefs/wave-53c-result.md`): Per-turn grep-loop measurement (currently session-max only); standalone MCP server extraction ("Flavor B") deferred; live-telemetry router calibration needs ~1K turns; version-drift cleanup (briefs vs git tags for waves 58, 59, 53b) unaddressed.
- **Wave 53c** (`roadmap/_archived/wave-53c-corpus-analysis.md`): Quarterly corpus re-run; per-turn grep-loop measurement; live-telemetry router calibration post–Wave 53.
- **Wave 53d** (`roadmap/_archived/wave-53d-plan.md`): Standalone MCP server Flavor B (IDE-off terminal); adoption-rate telemetry per session; tool description quality/discoverability work if tools wired but agent ignores them; version-drift cleanup.
- **Wave 53d** (`roadmap/_archived/auto-briefs/wave-53d-result.md`): Wave 54 verdict not finalized; second-injection-system mystery unresolved; adoption-rate telemetry not shipped; version-drift cleanup pending.
- **Wave 53e** (`roadmap/_archived/wave-53e-plan.md`): Wave 54 adoption smoke (manual, user-driven) needed to finalize Decision 9; per-spawn `--mcp-config` path verification deferred; standalone MCP server Flavor B still out-of-wave.
- **Wave 53e** (`roadmap/_archived/auto-briefs/wave-53e-result.md`): `list_projects` stale-stat refresh (shows 0 nodes/edges despite live data); per-spawn `--mcp-config` path verification; standalone MCP server Flavor B; version-drift cleanup.
- **Wave 53f** (`roadmap/_archived/wave-53f-plan.md`): Streamable HTTP transport migration — only if 2024-11-05 SSE insufficient; `list_projects` stale-stat refresh; version-drift cleanup.
- **Wave 53f** (`roadmap/_archived/auto-briefs/wave-53f-result.md`): CLAUDE.md claims "SSE client tracking / broadcasts tool-result events" but handler doesn't implement it — stale doc or removed feature; `list_projects` stale-stat refresh still pending; version-drift cleanup still pending.
- **Wave 53g** (`roadmap/_archived/wave-53g-plan.md`): External `codebase-memory-mcp` deduplication (user-driven); per-spawn `--mcp-config` path confirmation; Wave 53c corpus re-analysis with prefix-aware tool names (`mcp__<server>__<tool>`).
- **Wave 53g** (`roadmap/_archived/auto-briefs/wave-53g-result.md`): Wave 53c corpus re-analysis with prefix-aware tool names still pending; per-spawn chat-panel path confirmation; external `codebase-memory-mcp` deduplication UI out of scope.
- **Wave 53h** (`roadmap/_archived/auto-briefs/wave-53h-result.md`): SDK replacement (`@modelcontextprotocol/sdk SSEServerTransport`) to stop hand-rolled drift; Streamable HTTP migration if SDK drops SSE fallback; Wave 53c corpus re-analysis with prefix-aware names still pending.
- **Wave 53i** (`roadmap/_archived/wave-53i-plan.md`): Streamable HTTP transport migration if SDK drops SSE; bundle externalization confirmation for electron-builder; Wave 53c corpus re-analysis still pending.
- **Wave 53i** (`roadmap/_archived/auto-briefs/wave-53i-result.md`): Streamable HTTP migration; Zod-based tool registration via `McpServer.registerTool`; `@modelcontextprotocol/sdk` has 32 transitive vulnerabilities — security audit needed before next major release.
- **Wave 53j** (`roadmap/_archived/wave-53j-plan.md`): CodeMode soak then flip schema defaults globally; Streamable HTTP if SDK drops SSE; hook-based graph-tool enforcement if passive measurement shows continued Grep defaults; graph adoption corpus re-analysis with prefix-aware names.
- **Wave 50** (`roadmap/_archived/wave-50-graph-adherence.md`): Quarterly re-run of `analyze-graph-adherence.ts`; worst-session investigation (`439565f2`); classifier refinement for short symbol false-positives.
- **Wave 58** (`roadmap/_archived/wave-58-plan.md`): `layout.chatWorkbench` default flip explicitly out of scope — still gated; rules-panel extraction may need deferral if it balloons.
- **Wave 58** (`roadmap/_archived/auto-briefs/wave-58-result.md`): Audit #13 (rail prop wiring NIT) intentionally left open; `layout.chatWorkbench` default still false — flip is a separate soak decision; Wave 47 stash@{0} and stash@{1} not dropped.
- **Wave 59** (`roadmap/_archived/auto-briefs/wave-59-result.md`): Memory tab in context preview — no IPC bridge to read MEMORY.md from renderer; disabled-IDs in context preview toggle visual-only (send path does not honour it); terminal-row project filter needs `cwd` field on `TerminalSession`; `config.layout.workbenchProjects` dedicated array deferred.
- **data-foundation-audit** (`roadmap/_archived/data-foundation-audit.md`): `startContextRetrainTrigger` implemented but never called in production; `contextWorker.ts` + `contextWorkerTypes.ts` implemented but not wired; H3 self-correction capture not implemented in `ResearchOutcomeRecord`.
- **waves-15-40-review** (`roadmap/_archived/waves-15-40-review.md`): `startContextRetrainTrigger` and `contextWorker.ts` not wired — should be in root CLAUDE.md Known Issues; Codex single-turn `send` no-op not enforced at renderer UI layer; Waves 15–29 systems (agentChat, checkpoint, graph, LSP) not deeply audited.
- **waves-15-29-review-addendum** (`roadmap/_archived/waves-15-29-review-addendum.md`): SQLite compaction not wired (explicitly promised in plan); Wave 27 "30-second temporal window heuristic" in docstring not implemented; thread parentage dual-system (CRIT-C: `branchInfo` vs `parentThreadId`) structural debt — side chat drawer is a stub (HIGH-G).
- **review-handoff-waves-15-40** (`roadmap/_archived/review-handoff-waves-15-40.md`): Wave 36 Codex single-turn `send` no-op not enforced at renderer UI layer; Wave 40 knip sweep left some exports flagged but not deleted.
- **pnpm-spike** (`roadmap/_archived/pnpm-spike.md`): pnpm migration deferred — worktree `node_modules` symlinking (`worktreeManager.linkNodeModules`) also deferred; revisit when a user requests it.
- **telemetry-recovery-and-corpus-analysis** (`roadmap/_archived/telemetry-recovery-and-corpus-analysis.md`): Whether to surface telemetry status in IDE UI (indicator showing "recording") deferred to Phase 3/A.6.

---

## From roadmap/ (other)

### `roadmap/session-handoff.md`
- **Wave 47 soak**: flip `layout.chatWorkbench` default to `true` when soak confirms no regressions.
- **Wave 47 soak**: widen `useWorkbenchCompare.canCompare` eligibility if users can't enter compare mode due to missing `linkedThreadId`.
- **Wave 47 soak**: HTML preview local assets — `allow-same-origin` blocks relative URLs; consider controlled asset-proxy endpoint.
- **Wave 47 soak**: tune `FORCE_FINALIZE_DELAY_MS` if sessions stay in `running` too long after agent-end defer.
- **Wave 53b follow-ups**: re-run offline ranker analysis quarterly; first target 2026-07-28.
- **Wave 53b follow-ups**: variant ranker soak — set `contextRanker.mode` to `tuned`/`experimental` and re-analyze after 100+ sessions per mode.
- **Wave 53b follow-ups**: graduation trigger — Bayesian weight optimization when corpus reaches ≥500 IDE-orchestrated sessions with hook-side Read coverage.
- **Wave 53a follow-ups**: auto-install of all four telemetry hooks lands in Phase E (not yet shipped); manual snippets in `docs/telemetry-parity.md`.
- **Wave 53a follow-ups**: PostToolUse → file-touched-per-turn partial signal — Wave 53b decides whether worth the maintenance cost.
- **Wave 53a follow-ups**: codegen hook helper from TS schemas to eliminate comment-mirror discipline — future wave.
- **Wave 51 follow-ups**: soak `routeInternalMcp=true` for 1 week; flip default to `true` if MCP token savings confirmed and no regressions.
- **Wave 51 follow-ups**: CodeMode for user-global MCP servers (sentry, github, etc.) — separate wave, touches user-global config.
- **Wave 51 follow-ups**: `internalMcp` barrel split to remove `app` transitive import blocking unit-test imports.
- **Wave 50 follow-ups**: delete original rule files `~/.claude/rules/init-safety.md` and `project-claude-md-template.md` after one wave of slash-command soak.
- **Wave 50 follow-ups**: convert project-level rules flagged as hook candidates (9 files in `.claude/rules/`).
- **Wave 50 follow-ups**: re-run `analyze-graph-adherence.ts` quarterly; enforce `hooks.enforceGraphFirst` if adherence < 70%.
- **Wave 50 follow-ups**: make `warnFullTestSuite` agent-visible via `pre_tool_use.mjs` stdout output.

### `roadmap/deferred-task-type-aware-ranking.md`
- **Wave 69 deferral**: task-type-aware repo-map ranking deferred — needs literature check, telemetry baseline, classifier design, and A/B comparison before implementing.

### `roadmap/wave-53k-plan.md`
- **Wave 53k out-of-scope**: Wave 53l — extend CodeMode to ALL user MCP servers + external session access.
- **Wave 53k out-of-scope**: soak before flipping schema defaults (`codemode.enabled`, etc.) to `true`.
- **Wave 53k out-of-scope**: `disabledMcpServers` standardization if custom key (`_codemodeManagedServers`) is used.

### `roadmap/wave-53l-plan.md`
- **Wave 53l out-of-scope**: standalone ouroboros MCP server for IDE-off external CodeMode sessions.
- **Wave 53l out-of-scope**: reactive `~/.claude.json` watcher — pick up new MCP servers without IDE restart.
- **Wave 53l out-of-scope**: flip `codemode.enabled` default only after soak telemetry confirms multiplexer value.

### `roadmap/wave-54-plan.md`
- **Wave 54 out-of-scope**: Wave 55 candidate — `renameSymbol` / `safeDelete` gated on Phase E positive decision + preview/checkpoint/rollback maturity.
- **Wave 54 out-of-scope**: call hierarchy — lower priority; natural next op once references work.
- **Wave 54 out-of-scope**: non-TS language backends (Python/pyright, Rust/rust-analyzer, Go/gopls) — separate wave each.
- **Wave 54 out-of-scope**: semantic-op confidence scoring for incomplete results.
- **Wave 54 out-of-scope**: graph + semantic-op join for single "impact" query.
- **Wave 54 out-of-scope**: dirty-buffer correctness audit post-ship.

### `roadmap/wave-56-plan.md`
- **Wave 56 out-of-scope**: hooks/instrumentation of CodeMode tool-call stream.
- **Wave 56 out-of-scope**: streamable HTTP transport migration for ouroboros.

### `roadmap/wave-57-plan.md`
- **Wave 57 out-of-scope**: multi-level subagent nesting (depth > 1) — deferred pending real-world evidence.
- **Wave 57 out-of-scope**: sub-tool capture for chat subagents (only start/end shipped, not sub-tool calls).
- **Wave 57 out-of-scope**: cost roll-up UI for subagents — `subagentTracker.rollupCostForParent` exists; surfacing in UI is separate scope.
- **Wave 57 out-of-scope**: replace temporal-window fallback — heuristic stays; revisit after explicit-payload path is proven reliable.

### `roadmap/wave-57-phase-e-decision.md`
- **Wave 57 soak pending**: `agentMonitor.subagentDisplay.enabled` default stays `false` — soak observations not yet recorded; flip to `true` when criteria met.

### `roadmap/wave-60-standalone-ouroboros.md`
- **Wave 60 out-of-scope**: self-indexing standalone — let standalone reindex incrementally when IDE is off.
- **Wave 60 out-of-scope**: context-layer fallback tools (6 file-based read tools) for standalone when graph not yet indexed.
- **Wave 60 out-of-scope**: per-server namespace docstrings for agent discrimination.
- **Wave 60 out-of-scope**: JSON tool output migration (Wave 53l Phase C scope).
- **Wave 60 out-of-scope**: npm-package release of standalone ouroborosMcp.
- **Wave 60 manual cleanup** (`roadmap/wave-53k-followup-autosync.md`): orphan `C:\Web App\Agent IDE\codebase-graph.db*` files (7.7 MB + WAL/SHM) — safe to delete, not auto-removed.

### `roadmap/wave-61-delegation-coach.md`
- **Wave 61 out-of-scope**: coach pattern auto-discovery — mine JSONL for high-frequency unregistered tool-use sequences.
- **Wave 61 out-of-scope**: `llmJudge.ts` for the model router — reference in `src/main/router/CLAUDE.md`; build only when concrete need arises.
- **Wave 61 out-of-scope**: counterfactual sampling for tier classification — true ground-truth source; separate wave.
- **Wave 61 out-of-scope**: GUI for managing the pattern library (Settings panel with per-pattern stats + toggle).
- **Wave 61 out-of-scope**: Phase F analytics deferred if it doesn't fit the wave window — analysis recipe documented in `delegationCoach/CLAUDE.md`.
- **Wave 61 out-of-scope**: coach data analytics dashboard surfaced in IDE telemetry view.

### `roadmap/wave-62-rule-toggles.md`
- **Wave 62 open question**: confirm "first session-spawn" vs "first message" restore timing in `claudeStreamJsonRunner.ts`.
- **Wave 62 out-of-scope**: persistent / per-session rule profiles.
- **Wave 62 out-of-scope**: Settings-modal mirror for rule toggles.

### `roadmap/wave-63-popover-tab-coverage.md`
- **Wave 63 out-of-scope**: tool toggling via `--allowedTools` / `--disallowedTools` CLI flags.
- **Wave 63 out-of-scope**: memory entry inline preview (click → drawer with file content).
- **Wave 63 out-of-scope**: memory entry write/delete from popover.
- **Wave 63 out-of-scope**: search/filter input above each popover tab.
- **Wave 63 out-of-scope**: wiring the popover into the IDE-shell variant.
- **Wave 63 out-of-scope**: subagent-truncation investigation (#54018) — still biting `sonnet-implementer`.
- **Wave 63 open question**: check `AgentEventsContext` `system.init` payload for existing tool-surface emitter before adding new IPC.
- **Wave 63 open question**: decide whether to scope memory item expansion (click → inline preview) into Wave 63 or punt.

### `roadmap/wave-64-chat-session-lifecycle.md`
- **Wave 64 risk**: race where `InstructionsLoaded` fires before `SESSION_REGISTER` — file a follow-up for main-side IPC fallback if it manifests.

### `roadmap/wave-66-graph-mcp-fixes.md`
- **Wave 66 out-of-scope**: drop deprecated parameter aliases (`name_pattern`, `qualified_name`, `function_name`) after one wave transition window.
- **Wave 66 out-of-scope**: migrate `McpToolDefinition` handlers to `{ isError, content }` MCP envelope — future wave.

### `roadmap/wave-67-indexer-coverage-repair.md`
- **Wave 67 risk / deferred**: re-export-only barrel detection in `countParseAnomalies` — tune `lineCount` threshold based on post-fix data.
- **Wave 67 out-of-scope**: tree-sitter package upgrade — declared non-issue; revisit if a syntactic feature the grammar can't handle is found.

### `roadmap/wave-68-cypher-engine-quality.md`
- **Wave 68 out-of-scope**: multi-label nodes (schema has one label per node — Cypher array semantics not implemented).
- **Wave 68 out-of-scope**: unimplemented Cypher features (`OPTIONAL MATCH`, `WITH`, `UNWIND`, `OR`, subqueries, custom aggregations).
- **Wave 68 out-of-scope**: `MATCH (p:Project)-[...]->(child)` hop queries for Project node — Project routing only fixed for single-node queries.

### `roadmap/wave-69-audit.md`
- **Wave 69 escalation (P0)**: ESCALATE-1 — `languageStrategies.ts` has external callers; Phase D deletion scope must be resolved before B dispatches.
- **Wave 69 escalation (P0)**: ESCALATE-2 — `queryGraph` LIMIT 200 cap makes single-query cross-module deps infeasible; B3 must use per-module batched queries.
- **Wave 69 escalation (P1)**: ESCALATE-3 — `contextInjector.ts` and `orchestration/types.ts` not named in B1 touch points; cascade needed.
- **Wave 69 pending gate**: Phase B dispatch gated on user decision re ESCALATE-1 scope (Option A shrink vs Option B refactor).

### `roadmap/wave-69-context-layer-graph-integration.md`
- **Wave 69 out-of-scope**: task-type-aware ranking (Item 6) — deferred per `roadmap/deferred-task-type-aware-ranking.md`.
- **Wave 69 out-of-scope**: git-frequency importance signal (Item 4) — deferred; reconsider after Wave 69 settles.
- **Wave 69 out-of-scope**: AI summarizer changes (`contextLayerAiSummarizer.ts` stays as-is).
- **Wave 69 risk**: soft-fallback fires for too long — add telemetry; if fallback rate > 10%, file a graph-startup-readiness wave.
