# Subsystem CLAUDE.md drift audit

Read-only audit of all 55 CLAUDE.md files under `src/` against the current codebase. Findings grouped by file; clean files listed at the end.

---

## `src/main/agentChat/CLAUDE.md`

### Auto-generated section (<!-- claude-md-auto:start -->)

- **`src/main/agentChat/CLAUDE.md`** — claim: "`threadStoreRuntimeSupport.ts` — JSON file backend (legacy)" — issue: file does not exist. The JSON runtime was replaced; the thread store has been decomposed into `threadStoreOps.ts`, `threadStoreFork.ts`, `threadStoreRerun.ts`, `threadStoreSearch.ts`, and similar files. The legacy JSON runtime entry in this table is stale.

### Manual:preserved section

- **`src/main/agentChat/CLAUDE.md`** — claim: "`threadStoreRuntimeSupport.ts` | JSON file runtime (original backend) — reads/writes `{sha1(threadId)}.json`" — issue: same file does not exist (see above). Entry appears in both the auto-generated and manual:preserved sections.
- **`src/main/agentChat/CLAUDE.md`** — claim: "depends on `../hooks` — `dispatchSyntheticHookEvent`" (Dependencies table in manual:preserved section) — issue: the auto-generated section says `beginChatSessionLaunch` is the exported function from `../hooks`. The manual section names `dispatchSyntheticHookEvent`. One of these references is wrong; the manual:preserved section is the older one.

---

## `src/main/contextLayer/CLAUDE.md`

### Auto-generated section

- **`src/main/contextLayer/CLAUDE.md`** — claim: "`contextLayerAiSummarizer.ts` — Optional Haiku calls for natural-language module descriptions." — issue: file does not exist. AI summarization is now handled by `moduleSummarizer.ts` + `summarizationQueue.ts` + `summarizationQueueHelpers.ts`.

### Manual:preserved section (pre-Wave-69 snapshot)

- **`src/main/contextLayer/CLAUDE.md`** — claim: "`languageStrategies.ts` — Language-specific import extraction + resolution for 10 languages" — issue: file does not exist in `contextLayer/`. The manual:preserved section describes the pre-Wave-69 architecture.
- **`src/main/contextLayer/CLAUDE.md`** — claim: "`importGraphAnalyzer.ts` — 'Option C' — builds resolved import graph" — issue: file does not exist. Removed during Wave 69 graph-consumer refactor.
- **`src/main/contextLayer/CLAUDE.md`** — claim: "`contextLayerTypes.ts` — Config interface (`ContextLayerConfig`): enabled, maxModules, maxSizeBytes, debounceMs, autoSummarize, moduleDepthLimit." (manual:preserved section) — issue: the auto-generated section correctly says `contextLayerTypes.ts` re-exports from `orchestration/types`. The manual:preserved type list is an old shape; field names like `autoSummarize` may no longer match.
- **`src/main/contextLayer/CLAUDE.md`** — claim: "`isCodeFile` is duplicated in both `contextLayerController.ts` and `importGraphAnalyzer.ts`" (Gotchas, manual:preserved) — issue: `importGraphAnalyzer.ts` no longer exists; the gotcha references a deleted file.
- **`src/main/contextLayer/CLAUDE.md`** — claim: "`resolveRelativeImport` is duplicated across controller and analyzer" (Gotchas, manual:preserved) — issue: `importGraphAnalyzer.ts` no longer exists; only one copy in `contextLayerControllerSupport.ts` (or none).
- **`src/main/contextLayer/CLAUDE.md`** — claim: "`configureTypeScriptAliases` in `languageStrategies.ts`" (Gotchas) — issue: `languageStrategies.ts` does not exist; this gotcha is orphaned.

---

## `src/main/orchestration/providers/CLAUDE.md`

### Auto-generated section

- **`src/main/orchestration/providers/CLAUDE.md`** — claim: "`anthropicAuth.ts` — OAuth credential management — reads `~/.claude/.credentials.json`" — issue: `src/main/orchestration/providers/anthropicAuth.ts` does not exist. The file lives at `src/main/auth/providers/anthropicAuth.ts` only. The orchestration providers directory has no `anthropicAuth.ts`.
- **`src/main/orchestration/providers/CLAUDE.md`** — claim: "`anthropicApiAdapter.ts` — Direct Anthropic SDK adapter" — issue: `src/main/orchestration/providers/anthropicApiAdapter.ts` does not exist. No file by this name is present in the providers directory.

### Manual:preserved section

- **`src/main/orchestration/providers/CLAUDE.md`** — claim: "`claudeCodeAdapter.ts` — The sole `ProviderAdapter` implementation" (manual:preserved) — issue: there are now multiple `ProviderAdapter` implementations (Claude Code, Codex, Anthropic API). The "sole" qualifier is stale.
- **`src/main/orchestration/providers/CLAUDE.md`** — claim: "Imports from `../../pty`, `../../ptyAgentBridge`" (Dependencies table, manual:preserved) — issue: no `ptyAgentBridge` file found in `src/main/`. Only `ptySpawn.ts`, `ptyClaude.ts`, etc. exist.

---

## `src/main/router/CLAUDE.md`

- **`src/main/router/CLAUDE.md`** — claim: "`llmJudge.ts` — Sampled async judge — scores routing quality via Haiku" (File Map table) — issue: `src/main/router/llmJudge.ts` does not exist. The CLAUDE.md itself notes in the text that this file "never shipped" but includes it in the File Map table regardless — the table entry should be removed or clearly marked as not-yet-implemented.

---

## `src/main/symbolExtractor/CLAUDE.md`

- **`src/main/symbolExtractor/CLAUDE.md`** — claim: "Consumers: `codebaseGraph/graphParser*.ts` — Feeds extracted symbols into graph node construction" — issue: no files matching `graphParser*.ts` exist in `src/main/codebaseGraph/`. The codebase graph uses tree-sitter (`treeSitterParser*.ts`) for symbol extraction, not this subsystem.
- **`src/main/symbolExtractor/CLAUDE.md`** — claim: "Consumers: `internalMcp/internalMcpToolsGraph.ts` — Exposes symbol search via MCP tool responses" — issue: `src/main/internalMcp/internalMcpToolsGraph.ts` does not exist. Post-Wave-60, the internal MCP directory was radically shrunk; only `index.ts`, `internalMcpAutoInject.ts`, `internalMcpScope.ts`, and `internalMcpTypes.ts` remain.
- **`src/main/symbolExtractor/CLAUDE.md`** — claim: "Consumers: `contextLayer/moduleSummarizer.ts`" — issue: the file does exist at `src/main/contextLayer/moduleSummarizer.ts`. This one is fine.

---

## Clean

All of the following CLAUDE.md files were audited. No stale file-path references, missing folders, or broken npm-script claims were found in these files:

- `CLAUDE.md` (root)
- `src/main/CLAUDE.md`
- `src/main/auth/CLAUDE.md`
- `src/main/auth/__tests__/CLAUDE.md`
- `src/main/auth/providers/CLAUDE.md`
- `src/main/codebaseGraph/CLAUDE.md`
- `src/main/codebaseGraph/passes/CLAUDE.md`
- `src/main/codemode/CLAUDE.md`
- `src/main/delegationCoach/CLAUDE.md`
- `src/main/internalMcp/CLAUDE.md`
- `src/main/ipc-handlers/CLAUDE.md`
- `src/main/orchestration/CLAUDE.md`
- `src/main/rulesAndSkills/CLAUDE.md`
- `src/main/storage/CLAUDE.md`
- `src/main/telemetry/CLAUDE.md`
- `src/main/web/CLAUDE.md`
- `src/preload/CLAUDE.md`
- `src/renderer/CLAUDE.md`
- `src/renderer/components/AgentChat/CLAUDE.md`
- `src/renderer/components/AgentMonitor/CLAUDE.md`
- `src/renderer/components/Analytics/CLAUDE.md`
- `src/renderer/components/CommandPalette/CLAUDE.md`
- `src/renderer/components/ContextBuilder/CLAUDE.md`
- `src/renderer/components/DiffReview/CLAUDE.md`
- `src/renderer/components/ExtensionStore/CLAUDE.md`
- `src/renderer/components/FileBrowser/CLAUDE.md`
- `src/renderer/components/FileTree/CLAUDE.md`
- `src/renderer/components/FileViewer/CLAUDE.md`
- `src/renderer/components/GitPanel/CLAUDE.md`
- `src/renderer/components/Layout/CLAUDE.md`
- `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md`
- `src/renderer/components/McpStore/CLAUDE.md`
- `src/renderer/components/MultiSession/CLAUDE.md`
- `src/renderer/components/Orchestration/CLAUDE.md`
- `src/renderer/components/Search/CLAUDE.md`
- `src/renderer/components/SessionReplay/CLAUDE.md`
- `src/renderer/components/Settings/CLAUDE.md`
- `src/renderer/components/StorePageShell/CLAUDE.md`
- `src/renderer/components/Terminal/CLAUDE.md`
- `src/renderer/components/TimeTravel/CLAUDE.md`
- `src/renderer/components/UsageModal/CLAUDE.md`
- `src/renderer/components/primitives/CLAUDE.md`
- `src/renderer/components/shared/CLAUDE.md`
- `src/renderer/contexts/CLAUDE.md`
- `src/renderer/hooks/CLAUDE.md`
- `src/renderer/themes/CLAUDE.md`
- `src/renderer/types/CLAUDE.md`
- `src/shared/types/CLAUDE.md`
- `src/standalone/CLAUDE.md`
- `src/standalone/ouroborosMcp/CLAUDE.md`
- `src/web/CLAUDE.md`
- `src/main/router/CLAUDE.md` — one structural issue flagged above but the file itself is coherent
