# Dead / Stale / Left-Behind Code — Candidate Catalog

**Generated:** 2026-05-01.
**Method:** Three parallel sonnet sweeps (`src/main/`+`src/preload/`, `src/renderer/`, `src/web/`+`tools/`+`scripts/`+other) using the codebase graph (`servers.ouroboros.*`) for symbol/edge queries plus targeted Grep for commented-out blocks and removal markers.
**Caveat:** All entries are candidates flagged for human review. **Do NOT delete based on this doc alone** — borderline calls are marked `(low-confidence)`. The graph index covered ~132/1255 files in some sweeps, so absence of a result is not proof of orphan status.

---

## Part 1 — `src/main/` + `src/preload/`

### 1.1 Unused exports

- **Unused export** — `src/main/research/stalenessMatrixData.ts:28` — `TRAINING_CUTOFF_DATE` — `@deprecated`; only non-test consumer is `stalenessMatrix.ts` fallback path. Remove once that fallback threads `modelId`.
- **Unused export** — `src/main/internalMcp/internalMcpAutoInject.ts:125` — `InjectOptions.stdioTransportPath` — `@deprecated`; `standaloneScriptPath ?? stdioTransportPath` always resolves to former.
- **Unused export** — `src/main/internalMcp/internalMcpAutoInject.ts:126` — `InjectOptions.transport` + re-export of `InternalMcpTransport` — SSE removed in Wave 60; field accepted but never consumed.
- **Unused export** — `src/main/configAppTypes.ts:78` / `src/main/configSchema.ts:164` — `windowSessions: WindowSession[]` — `@deprecated Wave 40 Phase D`; write path removed; read fallback in `windowManagerSessions.ts:87`.
- **Unused export** — `src/main/configSchema.ts:146` — `multiRoots` — `@deprecated`; three remaining callers (`windowManager.ts` seed, `ipc-handlers/mcp.ts` fallback, `extensionsSandbox.ts` root) need migration first.
- **Unused export** — `src/main/router/routerTypes.ts:217` — `RouterSettings.llmJudgeSampleRate` — `llmJudge.ts` was never shipped; field is inert.
- **Unused export** — `src/main/ipc-handlers/systemPromptHandlers.ts:48` — `cleanupSystemPromptHandlers()` — function body is empty; export/call chain exists for structural symmetry only.
- **Misleading naming** — `src/preload/preloadWave6Stubs.ts:31` — `wave6StubApis` — file name and JSDoc say "stubs" returning `{ success: false }`, but all methods are real IPC `invoke` calls. (low-confidence — functional, just misleading)

### 1.2 Orphaned files

- **Orphaned module** — entire `src/main/delegationCoach/` subsystem (`coachLogger.ts`, `detector.ts`, `patterns.ts`, `types.ts`) — zero imports outside the directory. Wave 61 CLAUDE.md describes a build step emitting `out/coach-patterns.json` for the external `~/.claude/hooks/delegation_coach.mjs`; that build step is not implemented. Nothing in `src/main` calls into this module at runtime.
- **Missing file (referenced)** — `src/main/router/llmJudge.ts` — listed in `src/main/router/CLAUDE.md` file map but doesn't exist. Referenced via `llmJudgeSampleRate: 0` default. CLAUDE.md self-acknowledges: "documented in this file but never shipped."
- **Missing file (referenced)** — `src/main/router/llmFallback.ts` — listed in router CLAUDE.md (Layer 3) but doesn't exist. `orchestrator.ts` comment: "Layer 3 (LLM fallback) not yet wired."

### 1.3 Stub / no-op functions

- **No-op** — `src/main/ipc-handlers/systemPromptHandlers.ts:48` — `cleanupSystemPromptHandlers()` empty body; comment says no cleanup needed. Called from `ipc.ts:346` on shutdown.
- **Dead branch** — `src/main/router/orchestrator.ts:93-96` — Layer 3 fallback: both `skipLayer3: true|false` paths return `null`. `RouteOptions.skipLayer3` is forward-compat scaffolding only.
- **Side-effect-free** — `src/main/hooksLifecycleHandlers.ts:138` — `handleConfigChange(sessionId)` body is one `log.info`. Could be inlined at single call site `hooks.ts:187`.
- **Vestigial** — `src/main/orchestration/providers/scopedMcpConfig.ts:102` — `resolveTransport()` always returns `'stdio'` post-Wave-60. `isRoutedThroughCodemode` gate becomes permanently true.

### 1.4 Commented-out code blocks

No large `/* ... */` blocks found. Two stale tombstone inline comments:
- **Tombstone comment** — `src/main/mobileAccess/channelCatalog.always.ts:22-24` — describes Wave 41 Phase A removal of `app:getSystemInfo` channel.
- **Tombstone comment** — `src/main/mainShutdown.ts:56` — Wave 60 Phase E: "no legacy MCP host cleanup remains here."

### 1.5 Removal markers (`@deprecated` + "remove" notes that haven't fired)

- `src/main/configAppTypes.ts:78-79` — `windowSessions` — "Remove next cleanup wave."
- `src/main/configSchema.ts:159-162` — `windowSessions` schema entry — "Remove in the next cleanup wave."
- `src/main/internalMcp/internalMcpAutoInject.ts:122-124` — `stdioTransportPath` — "Removed in a future wave."
- `src/main/internalMcp/internalMcpAutoInject.ts:126-129` — `transport` / `InternalMcpTransport` — Wave 60 removed SSE; type re-exported via barrel.
- `src/main/research/stalenessMatrixData.ts:23-27` — `TRAINING_CUTOFF_DATE` — "follow-up wave removes this when every call site threads modelId."
- `src/main/claudeMdGeneratorSupport.ts:190-265` — `buildLegacyPrompt`/`buildLegacyHeader`/`buildLegacyFooter` for `'legacy'` strategy branch — possibly dead if `leanMode` has hard default of true. (low-confidence)

### 1.6 Old feature-flag dead branches

- **`autoRetrainEnabled` defaults `false`** — `src/main/router/retrainTrigger.ts:59` (schema in `configSchemaTail.ts:224`, `routerTypes.ts:244`) — `observeDatasetGrowth()` short-circuits; entire periodic retrain pipeline dead by default.
- **`ecosystem.rulesAndSkillsInstallEnabled` defaults `false`** — `src/main/configSchemaTailExt.ts:245` — `marketplace/marketplaceInstall.ts:77` returns `not-yet-wired` early exit.
- **Vestigial SSE branch** — `src/main/orchestration/providers/internalMcpRoutingPolicy.ts:62-74` — `transport === 'stdio'` guard is permanently true post-Wave-60.
- **Duplicated function (not dead, divergence risk)** — `escapePowerShellArg` re-implemented in 3 private copies (`src/main/ptyCodex.ts:4`, `codexAppServerProcess.ts:35`, `codexExecRunnerHelpers.ts:141`) instead of using canonical `src/main/ptyArgEscape.ts:16`. (low-confidence orphan)

---

## Part 2 — `src/renderer/`

### 2.1 Orphaned files

- **Orphaned file** — `src/renderer/components/Terminal/osc133Handler.ts` — entire file (`Osc133State`, `createOsc133State`, `parseAndStripOsc133`, `handleOsc133Event`, `cleanupOsc133`); logic was reimplemented inside `useTerminalSetupData.ts` and `useCommandBlocksController.ts`.
- **Orphaned file** — `src/renderer/hooks/useOrchestrationEvents.ts` — never called; superseded by `src/renderer/components/Orchestration/model/useOrchestrationEvents.ts` (same name, different file).
- **Orphaned file** — `src/renderer/hooks/useAgentEvents.routing.ts` — `routeEvent` and helpers; superseded by `useAgentEvents.eventRouting.ts` (which is what `useAgentEvents.ts` actually imports).
- **Orphaned file** — `src/renderer/hooks/useDispatchReconnectDrain.ts` — Wave 34 Phase G artifact; only referenced in its own test.

### 2.2 Orphaned directory

- **Orphaned directory** — `src/renderer/components/primitives/` — entire 11-file directory (`Button.tsx`, `Badge.tsx`, `Card.tsx`, `Divider.tsx`, `Dropdown.tsx`, `Input.tsx`, `Menu.tsx`, `Surface.tsx`, `TextArea.tsx`, `index.ts`, `types.ts`) — barrel `index.ts` and components export correctly, but no file in `src/` imports from this directory. `grep -r "components/primitives"` returns only the CLAUDE.md example. **High confidence orphan.**

### 2.3 Unused exports

- **Unused export** — `src/renderer/components/AgentChat/useAgentChatStreaming.ts:13` — `AssistantTurnBlock` (`@deprecated` re-export alias).
- **Unused exports** — `src/renderer/components/FileViewer/editorStateStore.ts:94,117` — `loadEditorState`, `clearEditorState` (re-exported via `index.ts` but no caller).
- **Unused export** — `src/renderer/components/FileViewer/index.ts:63-64` — `useFormatOnSave` and `UseFormatOnSaveOptions` (barrel-exported but no consumer).

### 2.4 Stub / no-op functions

- **Stub** — `src/renderer/components/Terminal/osc133Handler.ts:25-28` — `createOsc133State()` returns `null as unknown as Osc133State`; orphaned alongside the rest of the file.
- **Stub** — `src/renderer/components/FileViewer/monacoVimMode.ts:116-127` — `enableEmacsMode()` body is commented-out `monaco-emacs` code; logs a warning, returns `null`. Called from `MonacoEditor.hooks.ts` but produces no effect.

### 2.5 Commented-out code blocks

- `src/renderer/components/FileViewer/ContentRouter.tsx:17` — `// import { MonacoEditor } from './MonacoEditor';` with note "kept as legacy fallback".
- `src/renderer/components/FileViewer/monacoVimMode.ts:121-124` — four commented-out `monaco-emacs` integration lines.

### 2.6 Dead feature-flag branches

- **`USE_MONACO = true` permanent flag** — `src/renderer/components/FileViewer/ContentRouter.tsx:27` — gates legacy paths at lines 132, 221, 281. The `false` branches (`renderInlineEditor` → `InlineEditor`/CodeMirror; legacy `DiffView`; legacy `CodeView` read-only path) are unreachable as long as the flag stays `true`.

### 2.7 Stale notes / placeholder TODOs

- `src/renderer/i18n/en.ts:3` — Wave 38 Phase A placeholder copy note; Phase G never shipped as a translations pass. (low-confidence — copy may be intentionally "good enough")
- `src/renderer/components/AgentChat/AgentChatTabBar.tsx:103` — `TODO(Wave 32 Phase I — session cycling)` — wave closed without this.
- `src/renderer/types/electron-mobile-access.d.ts:7` — `TODO(Wave 33a)` move types to `src/shared/`; Wave 33a completed without this.

### 2.8 Duplicate implementations (not orphans, but consolidation candidates)

- **Same hook name, different scopes** — `src/renderer/hooks/useOrchestrationEvents.ts` (orphaned) vs `src/renderer/components/Orchestration/model/useOrchestrationEvents.ts` (live).
- **`useOutsideClick`** defined 3× independently — `AgentCardControlsParts.tsx:9`, `TitleBar.mobile.tsx:19`, `ChatOnlyShell/KeyboardShortcutCheatSheet.tsx:128`.
- **`TOOL_COLORS`** defined in `AgentMonitor/ApprovalDialogCardParts.tsx:6` and `Analytics/analyticsDashboardFormatting.ts:23` — overlapping but not identical.

---

## Part 3 — `src/web/`, `tools/`, `scripts/`, other

### 3.1 Orphaned scripts (no `npm run` entry, no import consumer)

- `scripts/analyze-graph-adherence.ts` — Wave 50 Phase D corpus analysis; wave closed.
- `scripts/analyze-ranker-hit-rate.ts` — Wave 53b Phase A; wave closed.
- `scripts/analyze-ranker-hit-rate-report.ts` — support module imported only by orphan above.
- `scripts/analyze-ranker-hit-rate-types.ts` — support types imported only by the two orphans above.
- `scripts/measure-mcp-token-cost.ts` — Wave 51 Phase D soak script; wave closed.
- `scripts/manual-seq-test.mjs` — Phase D smoke driver; comment says "Not part of the test suite."
- `scripts/test-coach-hook.mjs` — `delegation_coach.mjs` smoke; not wired to CI.
- `scripts/test-coach-hook-d.mjs` — Phase D outcome-tracking smoke.
- `scripts/test-coach-hook-e.mjs` — Phase E acknowledgment/hard-gate smoke.
- `scripts/codemode-proxy-launcher.mjs` — launches `out/main/proxyServer.js`; appears superseded by IDE startup.

### 3.2 Unused exports (deprecated `src/web/` wrappers)

- `src/web/webPreloadApis.ts:158` — `buildDataApis` (`@deprecated`).
- `src/web/webPreloadApis.ts:260` — `buildAppApis` (`@deprecated`).
- `src/web/webPreloadApisSupplemental.ts:153` — `buildToolingApis` (`@deprecated`).
- `src/web/webPreloadApisSupplemental.ts:222` — `buildIntegrationApis` (`@deprecated`).
- `src/web/webPreloadApisSupplemental.ts:285` — `buildAgentApis` (`@deprecated`).

### 3.3 Build artifacts present in working tree

- `electron.vite.config.1773455369021.mjs` — timestamped compiled copy of `electron.vite.config.ts`; not gitignored, not referenced (2026-03-25).
- `electron.vite.config.1773461758663.mjs` — second timestamped compiled copy; same status.
- `tsconfig.web.tsbuildinfo` — TS incremental build info at repo root; `*.tsbuildinfo` IS gitignored but file is in the working tree.
- `vitest-results.json` — 1.3 MB CI/test output; gitignored but in working tree.
- `tools/__pycache__/train-router.cpython-314.pyc` — Python bytecode; `__pycache__/` and `*.pyc` gitignored but file present.

### 3.4 One-shot dev artifacts

- `tmp_monitor.py` — Python subagent transcript monitor with hardcoded agent ID; no test coverage, no `npm run` entry.

### 3.5 Test-written fixture output

- `tools/__fixtures__/train-context/test-output-weights.json` — written by `train-context.test.ts:134` per run; not cleaned up afterward.

---

*See also:* `roadmap/cleanup/unused-deps.md` (npm-package-level orphans), `roadmap/cleanup/orphaned-tests.md` (test-file orphans), `roadmap/oldfiles/oldfiles.md` (repo-root one-offs).
