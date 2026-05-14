# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.16.0] - 2026-05-14

### Added
- **Wave 88 — Terminal Foundation.** First wave of the chat-substrate migration (88→91): bug-sweeps the terminal subsystem, brings the ChatOnly shell's terminal dock to parity with the IDE shell, and migrates dock resize onto the shared `useResizable` hook — laying the foundation for Wave 89's stacked-terminal layout and Wave 90's interactive-Claude substrate.
  - **xterm v6 lifecycle correctness** (`useTerminalSetup.lifecycle.ts`): WebGL addon loads after `term.open()` per v6 guidance; `onContextLoss` disposes the addon and falls back to the canvas renderer without remount; the WebGL canvas is hidden before `dispose()` to eliminate a context-loss white flash; `_core` private-API access removed (cell height now derived from the DOM as `element.clientHeight / rows`, since xterm v6.0.0 exposes no public cell-size property).
  - **Addon manifest** (`terminalAddonManifest.ts`): declares all 9 `@xterm/*` addons with load-order (`pre-open` / `post-open`) and criticality.
  - **Dock resize unification** (`ChatWorkbenchTerminalDock.tsx`): the bespoke `useDockResize` hook is replaced by the shared `useResizable` hook, reusing the `terminal` PanelId; dock height persists via `panelSizes.terminal` (localStorage + electron-store) with a non-destructive one-time migration from the legacy `agent-ide:chat-workbench-terminal-dock` key.
  - **`ChatOnlyTerminalToolBridge`** (`ChatOnlyShell/ChatOnlyTerminalToolBridge.tsx`): scoped tool bridge mounted in `ChatWorkbenchShell` — routes `getTerminalOutput` to the dock's active session, returns a structured "unavailable in chat-only mode" envelope for file-viewer / file-tree tool calls. Backed by a 10-case orchestrator-owned acceptance test.
  - **Dock header parity + keybind** (`ChatWorkbenchTerminalDock.handlers.ts`, `useWorkbenchMenuEvents.ts`): New Claude / New Codex buttons + a recording toggle in the dock header; `Ctrl+J` toggles dock collapse, mirroring the IDE shell.

### Fixed
- **xterm `UnicodeGraphemesAddon` version string** — `term.unicode.activeVersion` was set to `'graphemes'`; the addon registers `'15-graphemes'`, so the grapheme-aware width provider never activated and threw on every terminal bootstrap.
- **Dock-height migration was destructive** — the legacy-key migration overwrote any user-set dock height with the stale legacy value; now guarded to apply only when the current height is still the default.
- **CI: Electron binary missing on cold-cache runners** — `npm ci --ignore-scripts` skipped electron's postinstall; CI now runs `node node_modules/electron/install.js` explicitly so test files importing `electron` / `electron-log` / `electron-store` can load. (Pre-existing failure, not a Wave 88 regression.)
- **Tailwind v4 CSS build crash** — an orphaned `.stryker-tmp/` sandbox was scanned by tailwind's auto-source walker; Windows paths inside it parsed as out-of-range Unicode escapes. Added a `@source not` exclusion + `.gitignore` entry.

### Architecture decisions (per `roadmap/wave-88-terminal-foundation/wave-88-decisions.md`)
- WebGL addon loads after `term.open()` (xterm v6 upstream guidance — the v5-era double-cursor issue was retired when v6 integrated cursor rendering into the WebGL canvas).
- Dock resize reuses the existing `terminal` PanelId rather than introducing a new persistence key — IDE shell and ChatOnly dock share `panelSizes.terminal` so both shells feel like the same product.
- `ChatOnlyShell` mounts a scoped `ChatOnlyTerminalToolBridge` rather than the full `IdeToolBridge` (which depends on `useFileViewerManager()`, unavailable in chat-only scope).

### Known issues
- master CI is partially red (Ubuntu / Windows jobs) from pre-existing, platform-specific test failures unrelated to Wave 88 — tracked in `roadmap/bugs/2026-05-14-master-ci-ubuntu-windows-failures.md`. The macOS job is green as of this release.

## [2.15.0] - 2026-05-08

### Added
- **Wave 85 — Flow Tracer (Phase 1 of "An IDE That Teaches You").** New centre-pane special view that traces a user-facing action through every layer of the running app — User → Renderer → Preload → Main → Claude CLI → Filesystem — with AI-written What/Why/How narration on each step. Opens via Command Palette (`Flow Tracer: Browse Flows` / `Flow Tracer: Search`), View menu (`View → Flow Tracer`), and a DOM event (`agent-ide:open-flow-tracer`).
  - **Boundary registry + trace engine** (`src/main/flowTracer/boundaryRegistry.ts`, `traceEngine.ts`): Tree-sitter scan of `src/main/**/*.ts` for `ipcMain.handle` registrations + `src/preload/**/*.ts` for bridge mappings; outbound trace via the codebase-memory graph's `trace_call_path`; layer detection per design spec §5.1; depth cap 6 (configurable via `flowTracer.maxDepth`, range 3-12); cycle collapse before topological sort.
  - **Per-symbol What+How narration cache** (`src/main/flowTracer/narrationCache.ts`): matches `moduleSummarizer.ts` pattern verbatim — `spawnClaude` CLI subprocess against `claude-haiku-4-5-20251001`, JSON output, 2-attempt retry, circuit-breaker after 3 failures, hash-based file cache at `<workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json`. Auth-constrained (no direct Anthropic API).
  - **Per-flow chain-aware Why** (`src/main/flowTracer/flowWhyCache.ts`): single CLI call per flow render with the ordered chain of symbols + their cached What+How as context; ask Haiku to name the invariant the user couldn't have guessed; cache to `<flowId>-why.json`.
  - **Canonical flow gallery** (`src/main/flowTracer/canonicalFlows.ts`): index-time CLI call extracts UI event handler + IPC handler candidates from the codebase-memory graph (~30-80 entries for Agent IDE) and asks Haiku for 8-15 pedagogically-valuable flow titles + entry-point symbols. `FALLBACK_FLOWS` provides cold-start coverage. Refresh button regenerates on demand.
  - **Natural-language search + disambiguation** (`src/main/flowTracer/nlResolver.ts` + `FlowSearchBar.tsx`): single Haiku CLI call with `{ query, candidates }`; top-5 ranked JSON; confidence > 0.8 resolves directly, else shows disambiguation dropdown.
  - **Persistence + Mermaid export** (`src/main/flowTracer/flowPersistence.ts`, `flowMermaidExport.ts`): save FlowTrace JSON to `<workspaceRoot>/.ouroboros/flows/<flowId>.json` with atomic temp-rename writes; `flowTracer.saveSharedFlows` setting (default `false`) opts into a `.ouroboros-shared/` location for intentional check-in; Mermaid `sequenceDiagram` export to clipboard.
  - **Renderer UX surfaces** (`src/renderer/components/FlowTracer/`): `FlowTracerView`, `FlowGallery`, `FlowSearchBar`, `FlowCanvas` (Canvas2D swimlane), `StepInspector` (What/How via `useStepNarration` hook + Why via `useFlowWhy` on hover), `FlowActions` (Save title input + Mermaid clipboard via `useFlowPersistence`), `SavedFlowsPanel`, `useCanonicalFlowsRefresh`. Centre-pane integration via existing `CentrePaneConnected.parts.tsx` special-view registration.
  - **IPC contract** (10 new channels): `flowTracer:get-canonical-flows`, `:trace-flow`, `:get-narration`, `:get-flow-why`, `:resolve-natural-language`, `:regenerate-gallery`, `:save-flow`, `:list-saved-flows`, `:load-flow`, `:export-mermaid`. Typed in `src/renderer/types/electron-flow-tracer.d.ts`; shared types in `src/shared/types/flowTracer.ts`.

### Architecture decisions (per `roadmap/wave-85-flow-tracer/wave-85-decisions.md`, ADR with 11 decisions)
- Match `moduleSummarizer.ts` for narration generation — auth-constrained pick, also industry-standard for bounded-candidate prompt decomposition.
- Hand-rolled swimlane-constrained topological sort (no d3-dag, no elkjs, no Mermaid runtime) — Phase 1 ships sequential-X positions; full topological sort deferred to polish.
- Tree-sitter for AST scanning (already in `package.json` via the codebase-memory graph indexer).
- LLM tool-call with bounded candidate list for NL resolution (per CODEXGRAPH NAACL 2025 + Sourcegraph's 2024 trajectory away from embeddings on bounded sets).
- Hybrid narration cache: per-symbol What+How (index-time, persistent) + per-flow Why (render-time, optionally cached).
- Centre-pane view; mini-tracer + click-to-trace + symbol-search deferred to Wave 86.
- Honeycomb test shape (cross-layer integration dominates); orchestrator-owned acceptance test predates Phase 1 implementation.
- 6-hop depth default, configurable. Saved flows local-only by default (`.ouroboros/` stays gitignored).

### Fixed (post-smoke iteration)
- **`drawSwimlane` runtime crash** — Phase 1 left a positional/destructured-arg mismatch on `drawEdges`/`drawStepNodes` call sites. Project tsconfig wasn't catching it; jsdom's null `getContext('2d')` skipped the bug in tests; manifested in the real browser. Fixed by passing object literals at call sites.
- **`canonicalFlows` renderer-event candidate extraction** — compound `(STARTS WITH 'handle' OR STARTS WITH 'on' OR ENDS WITH 'Handler')` clause unsupported by the codebase-graph compat queryGraph engine. Split into three single-condition queries with `(symbol|file|line)` dedupe; defensive `Array.isArray` guard on the return.
- **`listSavedFlows` crashing on Phase 4 cache files** — Phase 7's directory listing read every `*.json` in `.ouroboros/flows/` and tried `record.flow.metadata.layerCount`, which fails on Phase 4's `<flowId>-why.json` blobs (different shape). Filter `-why.json` from the listing.
- **Narration prompt missing symbol body** when graph line was stale. Added `rescueBodyByName`: if the line slice doesn't contain the symbol name as a word-bounded token, scan the file for the first declaration-shaped occurrence and re-slice.
- **Wasted 2nd narration CLI call** when Haiku replied with valid empty `[]` — added `isValidEmptyArrayResponse` short-circuit; record success, return empty Map, no retry.
- **Hover-panel "spasm"** — removing `onMouseLeave` clear so the inspector stays pinned to the last hovered step + memoizing `hoverRef` so `useStepNarration` doesn't refetch on every render. Smoke logs showed 30+ get-narration calls per second; now fires once per unique step.

### Open / Deferred
Three follow-ups filed for Wave 86 polish:
- **Diagram is rudimentary** (`roadmap/follow-ups/2026-05-08-flow-tracer-diagram-rudimentary.md`). The swimlane render is numbered circles + lines; design spec called for layer-color-coded boxes, dashed async edges, boundary labels, LOD, CSS-token color resolution. Canvas2D scaffold is in place; replacing the placeholder draw functions is the work.
- **Trace engine output quality** (`roadmap/follow-ups/2026-05-08-flow-tracer-trace-engine-quality.md`). Three sub-problems: bridge call expressions (`window.electronAPI.X`) surface as step symbols instead of resolving to main-side handlers; JS keywords (`delete`, etc.) surface as step symbols; every flow truncates at exactly 3 steps (likely depth-cap or boundary-resolution gap; needs instrumentation).
- **Narration body via graph snippet** (`roadmap/follow-ups/2026-05-08-flow-tracer-symbol-body-via-graph-snippet.md`). `fetchSymbolBody` uses raw file slice; the design spec's referenced `get_code_snippet` graph API would be more robust to stale-line graph data. The `rescueBodyByName` fallback papers over the file-slice case for now.

### Documentation
- Wave 85 plan (`roadmap/wave-85-flow-tracer/waveplan-85.md` — 14 sections, validated against Sites 1/2/3 from `wave-process.md`).
- Wave 85 ADR (`roadmap/wave-85-flow-tracer/wave-85-decisions.md` — 11 decisions, all locked).
- Wave 85 mechanical review (`roadmap/wave-85-flow-tracer/wave-85-mechanical-review.md` — `/review` FLAG verdict, 6 findings, all non-fatal; the 4 dead-export findings now carry `DEFERRED-CONSUMER: wave-86` markers, the 2 universal-quantifier findings live in the trace-engine-quality follow-up).
- Design spec (`docs/superpowers/specs/2026-05-08-flow-tracer-design.md`).
- Initiative framing (`ai/vision.md` — "An IDE That Teaches You" three-mode roadmap: Flow Tracer (this), inline captions (Wave 86), galaxy map (Wave 87)).

## [2.14.0] - 2026-05-06

### Fixed
- **Wave 82 — chat-only polish bundle (14 of 15 user-reported bugs).** Multi-round smoke walks across rounds 1-5 closed the bulk of the post-Lexical (v2.12.0) chat-only / chat-workbench surface defects:
  - **C1** chat add/delete row-flash — optimistic update; routes delete through the workspace's canonical action to remove the race with `useSyncStateIntoStore`.
  - **F1** FileViewer toolbar persistence — defensive fall-through in `renderInitialViewerState` so the toolbar stays mounted across the brief content=null transition during edit-mode toggles.
  - **F1c** Monaco minimap dual-scroll / residual decoration ruler — `verticalScrollbarSize: 0`, `verticalSliderSize: 0`, `useShadows: false`, plus disabled `overviewRulerLanes`/`overviewRulerBorder`/`hideCursorInOverviewRuler` when minimap is on.
  - **F2 / C3** chat-project binding (Wave 82.1 follow-up). Workbench `LayoutState.activeProject` is now mirrored into a per-workspace field on `AgentChatStore`; `ComposerContextPreview` and `WorkbenchRulesPanel` read from the store rather than `ProjectContext` (which is `multiRoots[0]` and isn't rail-aware). Prior symptom: rules popover showed 16 user / 0 project rules in either project; chat workspace stayed bound to the IDE's main root after rail switch.
  - **F4** menu collapse — "New Session" + "New Chat in Active Session" → single "New Chat" (Ctrl+N). The dispatched `WORKBENCH_NEW_SESSION_EVENT` is unchanged so the canonical handler chain (`handleCreateSession` → orchestration session row + thread + activation) is intact.
  - **G** artifact pane top-strip + Recent section removed; timeline outer card scroll fixed via `min-h-0 flex-1 overflow-hidden` on the drawer aside so the inner list's `overflow-y-auto` actually engages.
  - **H2** image attachments now thread through `buildChatOnlyContextPreviewProps` → `ComposerContextPreview` → `useContextPreview` and appear as `attachment:`-prefixed entries in the popover's Files tab.
  - **B3** branch indicator removed from the chat-only status bar (`ChatOnlyStatusBar` was a separate mount, not just `StatusBar`).
  - **WorkbenchMenuBar.test.tsx** assertions updated for the F4 rename ("New Session" → "New Chat").

### Changed
- **Lint-debt cleanup folded into the wave.** Extracted `chatHistorySidebarCompletions.ts` (+ test) from `ChatHistorySidebar.tsx`; extracted `ContextPreview.popover.tsx` (+ test) from `ContextPreview.tsx` with a `PopoverContent` subcomponent split for the function-line cap; extracted `DockCloseButton` from `ChatWorkbenchTerminalDock.tsx`; dropped a stale `log.info` cold-boot trace from `FileTree.tsx`.

### Removed
- **Investigation trace logging** stripped after round-5 smoke confirmed the wave-82.x fixes are working: F1 instrumentation in FileViewer / FileViewerToolbar / FileViewerManager (`[trace:FileViewer]`, `[trace:EditBtn]`), rules-popover binding traces in AgentChatComposer / ComposerContextPreview (`[trace:rules]`), projectRoot mirror / body-effective / setActiveProject / TwoTierRailSurface render traces (`[trace:projectRoot]`, `[trace:rail]`), useRootTreeState cold-boot traces (`[trace:fileTree]`), `flushRuleLoadQueue` trace. Baseline structural warns kept (rail-validator divergence, `loadRoot` error path).

### Open / Deferred
- **B2 file-tree heat map** is not closed by this release. Round-5 smoke confirmed colored borders still don't appear after agent edits despite two attempted fixes in wave-82.x (extending `EDIT_TOOL_NAMES` to MCP-style names; `extractFilePath` JSON parse). Filed as `roadmap/follow-ups/2026-05-06-file-heat-map-still-broken.md` with repro steps and an instrumented investigation plan — next attempt requires runtime evidence per `~/.claude/rules/debug-before-fix.md`, not another code-read guess.

### Documentation
- Wave 82 plan / decisions / phase audits / auto-brief / handoff committed under `roadmap/wave-82-chat-only-polish-bundle/`.
- Wave 82.1 plan + result brief committed under `roadmap/wave-82.1-chat-project-binding/`.
- Outstanding follow-up digest as of 2026-05-03 captured at `roadmap/follow-ups/outstanding-2026-05-03.md` (~100 unique open items across Chat/UI, Telemetry, MCP, Graph, Performance, and prior-wave follow-ups).

## [2.13.0] - 2026-05-05

### Added
- **Wave 83 — Playwright-electron repro harness.** `npm run repro -- <slug>` driver runs `e2e/_repro-<slug>.spec.ts` against the built Electron app and writes artifacts (screenshot, console + network logs, optional video) under `artifacts/repro-<slug>-<timestamp>/`. Template at `e2e/_repro-template.spec.ts` includes a `reproArtifacts` helper for consistent artifact emission. Onboarding doc at `docs/repro-harness.md`. Path A (consumer MCP exposure) and Path B (preload bridge) deferred — single npm-run path is the v1 surface.

## [2.12.0] - 2026-05-03

### Changed
- **Composer engine: rich-textarea → Lexical (Wave 81).** The chat composer now uses Lexical (`lexical` + `@lexical/react` + `lexical-beautiful-mentions`) instead of `rich-textarea`'s overlay model. Backspacing through `@` mentions no longer triggers the 2-3 second renderer freeze that motivated the wave — Lexical's immutable-node reconciliation only re-renders the affected text node per keystroke instead of re-tokenizing and re-rendering all spans. The `@`-dropdown is now driven by `BeautifulMentionsPlugin`'s `LexicalMentionMenuItem` (positioned above the cursor via a custom `menuComponent`); `/` slash commands still use the existing `SlashCommandMenu`, driven by a small custom `SlashCommandPlugin` that watches editor state. Backspace into a chip uses `showMentionsOnDelete={true}` for deterministic deletion — first backspace replaces the chip with the trigger char (`@`) and re-opens the menu, second backspace removes the `@` entirely. Bundle delta: +115 KB gz versus the pre-wave baseline.
- **Smoke-time fixes shipped with the cutover.** Backspace-on-chip now syncs to the chip-bar via a mutation listener + reconciler in `LexicalMentionBridge`. `useMentionSearch` no longer rebuilds the file index on every mention add/remove (residual stutter eliminated). Slash-command Enter selection now plumbs `slashCommandContext` + `onAddMention`, fixing the silent no-op on `/spec`/`/clear`/`/diff` etc. via Enter (mouse-click already worked). Selecting `/spec` with an empty draft no longer toasts "invalid feature name". Selected-item highlight in the slash + `@` menus changed from `bg-surface-overlay` (zero contrast against the menu container) to `bg-interactive-selection`. In-composer chip styling now visible via `theme.beautifulMentions['@']`. `LexicalMentionMenuItem` strips library-spread `option.data` props before forwarding to the `<li>` to silence React unknown-DOM-attribute warnings.

### Removed
- `rich-textarea` dependency. `LegacyRichTextarea` branch in `AgentChatComposerInput.tsx`. `AgentChatComposerHighlights.tsx` (overlay helper for the legacy textarea path) and its test. Dead helpers `tokenizeComposerHighlights` / `isComposerMentionHighlight` (`AgentChatComposerTypes.ts`) and `getTextareaStyle` (`AgentChatComposerSupport.ts`) along with their dedicated test files (`AgentChatComposerTypes.test.ts`, `AgentChatComposerMentions.test.ts`).

### Added
- **14 scoped vitest scripts + parallel `test:all` runner.** `npm test` runs the full suite (~5 min wall-clock) which consistently exceeded agent timeouts. The new `test:main` / `test:renderer` / `test:agentchat` / `test:lexical` / `test:layout` / `test:codebasegraph` / `test:orchestration` / `test:ipc` / `test:hooks` / `test:preload` / `test:web` / `test:shared` / `test:tools` / `test:filetree` scripts each finish in 30-120s. `npm run test:all` runs the full suite as 4 parallel vitest shards via `scripts/test-all-parallel.mjs` (~344s vs serial ~480s). CLAUDE.md documents the routing table for future agent runs.

### Documentation
- Wave 81 Phase A audit (`roadmap/wave-81-composer-engine-migration/phase-a-audit.md`) committed.
- Six gotcha entries appended to `src/renderer/components/AgentChat/CLAUDE.md` documenting the load-bearing Phase F decisions.
- `/spec featureName` Enter-send flow filed as a follow-up in `roadmap/follow-ups/follow-ups.md` — pre-existing structural break (the slash menu closes on whitespace, so the IDE-side `onSpec` never fires when the user types arguments after the command name). Fix path: add a send-time interceptor mirroring `useResearchIntercept`.

## [2.11.2] - 2026-05-02

### Performance
- **Chat composer hot-path fixes.** Live session investigation surfaced a 2-3 second renderer freeze when backspacing through inserted `@` mentions in the chat-only composer. Four compounding issues fixed:
  - `useProjectFileIndex` now skips `.claude/` (treated like `.git`); empty-`@` dropdown no longer flooded by command/rule/setting/worktree files.
  - `MentionAutocompleteSupport` replaces Fuse.js fuzzy search (300-450ms per call on a 5K-file index) with ranked substring matching (basename-prefix > basename-mid > dirname). Per-call cost ~3-5ms. 120ms debounce added on the query as defense-in-depth.
  - `useAgentChatThreadView` selector added (excludes `draft` + `canSend`); `AgentChatConversation`, `ConversationDrawer`, `ConversationBodyWithThread` switched to it. Previous selector caused full message-list reconciliation on every keystroke.
  - `mentionLabels` and `pinnedFileNames` memoized at the producer (`AgentChatComposer`) and consumer (`ComposerContextPreview`) boundaries; `useContextPreview` no longer recomputes 30+ times per keystroke. `buildChatOnlyContextPreviewProps` refactored to options-object signature.

### Fixed
- **Wave 79 transport-field cleanup completed.** Wave 79 removed `internalMcp.transport` from the config schema but missed `McpSpawnCostRecord.transport` in the downstream telemetry record type, causing a typecheck failure on master HEAD. Field removed from the type, the drain handler payload, and the test fixture.

### Chore
- ESLint import-sort and prettier autofix applied to nine pre-existing master-broken test files (`src/main/codebaseGraph/`, `src/main/ipc-handlers/`).

### Docs
- Wave 81 plan added: `roadmap/wave-81-composer-engine-migration/`. Migrates the chat composer from `rich-textarea` to Lexical with `lexical-beautiful-mentions` to address residual stutter not eliminated by this release's hot-path fixes (root cause: `rich-textarea`'s overlay-render-everything pattern).

## [2.11.1] - 2026-05-02

### Fixed
- **Upgrade-boot config validation.** Wave 79 removed deprecated config keys from the schema (`additionalProperties: false`) but did not migrate stored configs, so users upgrading from 2.10.x crashed at startup with `Config schema violation: routerSettings/codemode must NOT have additional properties`. `runConfigPreflight()` now strips the removed keys (`windowSessions`, `routerSettings.llmJudgeSampleRate`, `codemode.routeInternalMcp`, `internalMcp.transport`) idempotently before electron-store validates.

## [2.11.0] - 2026-05-02

Wave-burn batch — nine waves shipped in parallel from `roadmap/future/`.

### Added
- **Wave 72 — chat thread swipe navigation.** `useSwipeNavigation` mounted on `AgentChatWorkspace` root with wrap-around thread cycling; closes the Wave 32 Phase I deferral.
- **Wave 73 — skill executions persisted on chat messages.** `SkillExecutionRecord[]` now lands in SQLite via the assistant message record, so reopened historical threads show their skill executions in the details drawer (renderer falls back to persisted state when the live `AgentEventsContext` doesn't have the session).
- **Wave 75 — memory curation completion.** Inline drill-down preview for memory entries (Phase A) plus `memory:write` / `memory:delete` IPC handlers and edit/delete UI with atomic write-then-rename, idempotent delete, and confirmation modals (Phase B).
- **Wave 76 — warn-class hook decisions surface to agent.** `pre_tool_use.mjs` now emits structured JSON stdout (`hookSpecificOutput.permissionDecision: 'allow'` + `systemMessage`) for `warn` decisions; `warnFullTestSuite` actually nudges the agent. Pattern documented in `docs/hook-migration.md`.
- **Wave 77 — Cypher engine Wave A.** `OPTIONAL MATCH` (LEFT JOIN), `UNWIND` (VALUES CTE), multi-pattern `MATCH`, and `indexed_at` ISO→epoch coercion added to the mini-engine. `get_graph_schema` advertises `supportedCypherFeatures`. `STARTS WITH` / `ENDS WITH` no longer false-positive the unsupported-clause check.
- **Wave 78 — settings panel partial-wiring fixes.** webAccessPassword "✓ Password set" badge via `config:hasWebPassword`; useMcpHost main-process gating in `injectStandaloneMcpEntry`; `modelSlots.claudeMdGeneration` slot threaded into `buildProviderEnv`; `usageExport.defaultWindow` and `usageExport.lastDir` persisted across export sessions.
- **Wave 80 — graph edge confidence on CALLS.** Per-resolution-path confidence (import-resolved 0.95, same-file 0.85, name-unique 0.80, new-expression class 0.65) emitted at indexing time; `min_confidence` filter param on `trace_call_path` and `detect_changes` (default 0); `confidence` field disclosed in `get_graph_schema`.

### Changed
- **Wave 74 — IPC handler decomposition.** `miscRegistrars.ts` (336 lines, 10 unrelated domains) split into 8 named per-domain handler files (`updaterHandlers`, `costHandlers`, `usageHandlers`, `crashHandlers`, `shellHistoryHandlers`, `symbolHandlers`, `approvalHandlers`, `trustHandlers`). No behavior change; channel contract preserved. `misc.ts` imports the named registrars directly.

### Removed
- **Wave 79 — deprecated config keys removed (deprecation windows expired per audit).** `windowSessions`, `codemode.routeInternalMcp`, `internalMcp.transport`, `InjectOptions.transport`, and `InjectOptions.stdioTransportPath` deleted. `InjectOptions.stdioTransportPath` removal followed the audit-mandated 3-step order (caller → fixtures → field). `migrateWindowSessionsToSessions` removed; stale barrel re-export in `session/index.ts` cleaned up (caught by `/review`'s dead-export check).

### Process notes
- All nine waves drafted plans via `/wave-plan` and gap-checked via `/review` before merge. The mechanical review caught real defects in three waves (73 dead-value threading on the renderer side, 76 silent-drop in `notifyApprovalResolved`, 79 stale barrel re-export) — all self-corrected before merge. Each wave's artifacts live in its own `roadmap/wave-NN-{slug}/` folder.
- `/wave-plan` and `/review` slash commands updated in this batch to write into the per-wave folder convention introduced earlier.

## [2.8.0] - 2026-04-29

### Added
- **Wave 60 — standalone Ouroboros MCP server.** The graph server now runs as a read-only stdio binary outside Electron and serves the same SQLite DB the IDE writes.
- **Codemode now proxies `context7` too.** A local stdio shim bridges Context7's HTTP MCP endpoint into the shared CodeMode gate so Claude Code and Codex both see it as `servers.context7` inside `execute_code`.

### Changed
- **Legacy bridge / mcpHost stack removed.** The old in-process `internalMcp` HTTP server, stdio bridge, port registry, and `mcpHost` subsystem were deleted in favor of the standalone server.
- **Release metadata updated.** Package version bumped to `2.8.0`, changelog advanced, and Wave 60 marked complete in the roadmap.

### Fixed
- **Build entry cleanup.** Removed the stale `mcpHostMain.ts` Vite input so production builds resolve cleanly.

## [2.7.13] - 2026-04-29

### Added
- **Wave 53l Phase A — codemode universal multiplex.** When `codemode.enabled: true`,
  the IDE patches `~/.claude.json mcpServers` once at startup with `__codemode_proxy`
  so EVERY Claude Code session — IDE-internal AND external terminal — sees the
  proxy. The per-spawn `acquireCodeModeForLaunch` short-circuits via
  `isCodeModeEnabled()` once the user-level enable runs.
- **Wave 53l Phase B — per-spawn routing default flipped.** With user-level CodeMode
  active steady-state, the routing policy no longer needs an opt-in flag. New
  `codemode.excludeFromMultiplex: string[]` config replaces the now-deprecated
  `codemode.routeInternalMcp`. Default behavior: ouroboros multiplexes through
  the proxy when `internalMcp.transport: 'stdio'`; opt out per-server via the
  exclude list.

### Fixed
- **Stdio bridge port decoupled from baked entry.** `internalMcpStdioTransport.ts`
  now resolves the live port at spawn time from `~/.claude/internalMcp-port.json`
  (written on every IDE start), rather than reading a port baked into the
  injected entry's args at enable time. Survives any number of IDE restarts.
- **Bridge health probe before SSE handshake.** Unreachable port → descriptive
  stderr line in `~/.claude/codemode-proxy.log` instead of opaque MCP
  CONNECTION_CLOSED.
- **Crash-recovery skip for ouroboros.** `maybeRestoreFromCrash` no longer
  applies a stale ouroboros entry from a prior session's managed-backup — the
  IDE's fresh injection is the source of truth for ouroboros lifecycle.
- **Codemode UX polish.** `__codemode_proxy` entry now sets `alwaysLoad: true`
  (skip tool-search deferral for the one-tool surface). Executor diagnoses
  `Cannot read properties of undefined (reading 'X')` with available-server
  hint. `execute_code` description spells out the explicit `return` requirement.

### Changed
- **Tool docstrings made prescriptive.** Graph tools (`search_graph`,
  `trace_call_path`, `get_code_snippet`, `query_graph`, etc.) now lead with
  "USE INSTEAD OF Grep when..." / "USE THIS for...". Project CLAUDE.md and
  `~/.claude/rules/graph-tool-routing.md` align: graph tools FIRST for symbol
  queries, Grep is the fallback.

## [2.7.12] - 2026-04-29

### Fixed
- **Wave 53k:** CodeMode end-to-end functional. The proxy was silently broken
  since Wave 53g (file-targeting regression cascaded into eight latent bugs
  the leak masked). Working agent path: `mcp__codemode_proxy__execute_code`
  → `servers.<name>.<tool>(...)` for `github`, `stripe`, `ouroboros` (graph
  tools). HTTP-only servers (`sentry`, `context7`) stay directly registered.
- `codemodeManager` now writes to `~/.claude.json` and `<root>/.mcp.json` (the
  files Claude Code CLI actually reads), not `~/.claude/settings.json`
  (Anthropic Desktop's file). Restoration data lives in the v2-schema sibling
  file `~/.claude/codemode-managed.json`.
- `scopedMcpConfig.readGlobalMcpServers()` corrected from the same wrong-file
  bug; user globals now flow through to the per-spawn temp config and the
  agent sees them under `--strict-mcp-config`.
- Project-scope multiplex now uses destructive write to `<root>/.mcp.json`
  (with verbatim restore on disable) because empirical testing in Claude
  Code v2.1.122 on Windows showed `--strict-mcp-config` doesn't isolate
  `.mcp.json` discovery and `disabledMcpjsonServers` flag is non-functional.
- Self-healing crash recovery: `enableCodeMode` checks for stale restoration
  files and applies them before starting a new enable.

### Changed
- `mcpClient.ts` and `proxyServer.ts` rewritten on `@modelcontextprotocol/sdk`
  (`Client`/`Server` + `StdioClientTransport`/`StdioServerTransport`),
  retiring ~280 lines of hand-rolled JSON-RPC. Mirrors the Wave 53j precedent
  for `internalMcpStdioTransport.ts`. SDK owns wire format (NDJSON, not the
  pre-fix LSP-style Content-Length framing), request correlation, and
  initialize handshake.
- HTTP/SSE upstreams (`url` field, no `command`) are filtered out at the
  `claudeCodeMode.resolveProxiedServerNames` boundary via the new
  `isStdioCapable()` predicate. They remain directly registered in
  `~/.claude.json mcpServers` and surface to the agent as `mcp__<name>__*`
  unchanged.
- `proxyServer.connectServerEntry` now races each upstream against a 15s
  startup deadline (was: blocked on `Promise.allSettled` for the slowest
  upstream's full 30s timeout — exhausted Claude Code's ~30s safety window).
- `~/.claude/codemode-proxy.log` — new diagnostic log file capturing every
  proxy spawn, upstream connect/fail, and shutdown event. Append-forever;
  truncate periodically if it grows large.

### Internal
- `codemodeManager.ts` split: public API surface delegates to
  `codemodeManagerFiles.ts` (paths + atomic JSON I/O + restoration record)
  and `codemodeManagerScopes.ts` (global vs project enable+restore).
- `proxyServer.js` path resolution: `resolveProxyServerPath()` walks
  sibling-then-parent so the registered path works regardless of bundle
  layout (electron-vite chunks the calling code into `out/main/chunks/`
  while `proxyServer.js` is at `out/main/`).
- Tailwind `@source not` glob extended to `roadmap/archive/**` after
  archiving completed waves moved `wave-53c-output/` under it; Tailwind
  v4's auto-source scan trips on Windows path encodings (`\afa0da`-shaped
  hex segments) above U+10FFFF.
- Wave 53k ADR (`roadmap/archive/wave-53k/wave-53k-decisions.md`) documents nine architecture
  decisions, including the Decision-2 reversal (toggle-flag → destructive
  write) and Decision 9 (SDK adoption pulled forward from a Wave 53m punt).

## [2.0.0] - 2026-04-20

Major release: dual-shell UI model. The IDE now ships with two top-level
shells that share the same main-process backend (sessions, threads, PTY,
hooks, config). Toggle between them via `Ctrl+Alt+I`, the View menu, or
Settings → Immersive chat mode.

### Added
- **Chat-only shell** (Wave 42): single-column immersive chat interface modelled
  on Claude desktop, Codex, and piebald.ai. Mounts `AgentChatWorkspace` full-width
  with a minimal title bar, off-canvas session drawer, minimal status bar, and
  full-screen `DiffReviewPanel` overlay. Pop-out chat windows (`?mode=chat`)
  route to this shell automatically.
- `layout.immersiveChat` config flag; keyboard shortcut `Ctrl+Alt+I`;
  Settings entry; dynamic "Switch to / Exit Chat Mode" View menu item.
- `useImmersiveChatFlag` hook; `ChatOnlyShellWrapper` provider stack;
  hoisted `TOGGLE_IMMERSIVE_CHAT_EVENT` + `TOGGLE_SESSION_DRAWER_EVENT`
  constants in `appEventNames.ts`.
- Lazy config store (`configStoreLazy`) with preflight sanitization
  (`configPreflight`) for startup reliability under worker-thread contention
  and transient schema-mismatch states.

### Changed
- `IdeToolBridge` is intentionally not mounted in the chat-only shell.
  IDE-context tool queries (`getOpenFiles`, `getActiveFile`, `getSelection`,
  `getUnsavedContent`, `getTerminalOutput`) return empty — matches Claude
  desktop's behaviour. Option for cross-window delegation is deferred.
- `AutoSyncWatcher.triggerReindex` routes through `getIndexingWorkerClient()`
  singleton to avoid SQLite WAL-lock contention with initial-index workers
  that previously froze the UI for 20–30s.
- `handleActive` IPC handler falls back to `windowManager.getWindow(id)?.
  activeSessionId` when the renderer hasn't explicitly called `sessionCrud:
  activate`. Fixes session-bound actions for freshly-opened windows.
- `preload.ts` fans out `config:externalChange` through a single underlying
  `ipcRenderer.on` listener with a subscriber set, avoiding EventEmitter's
  default-cap warning at 11 subscribers.
- `optimizeDeps.force` in dev is now opt-in via `FORCE_OPTIMIZE_DEPS=1`
  (was always-on). Saves 20–30s on dev cold starts.
- `graphWorker` entry renamed to `indexingWorker` in electron-vite config
  to match the source module name.

### Fixed
- `EdgeDropZones` now gates pointer events on `useDndContext().active` —
  invisible edge zones no longer swallow all clicks/hovers/keyboard-focus
  routing when no drag is in flight.
- Worker-thread safety: `agentChatThreadStore` and its path constants are
  now lazy / gated by `isMainThread`, so worker threads that transitively
  import the module no longer crash on module load.
- `ThreadStoreSqliteRuntime.initSchema` always runs column migrations
  (idempotent via `hasCol`). Repairs DBs that were left in a half-migrated
  state by a prior broken migration condition.
- `indexingPipeline.ts` and `settingsEntries.ts` split along natural
  seams to satisfy `max-lines:300` without `eslint-disable` directives.

### Removed
- Two `eslint-disable max-lines` directives that were added as a short-term
  workaround. Both underlying files have been properly split.

## [1.0.1] - 2026-03-23

### Fixed
- **Packaging**: Add better-sqlite3 to asarUnpack (prevents launch crash on all platforms)
- **Packaging**: Add @electron/rebuild to devDeps with node-pty in rebuild scope
- **Packaging**: Set actual GitHub repo in electron-updater publish config
- **Security**: Remove web access token from stdout logging
- **Security**: Replace blocking execSync(taskkill) with async exec (eliminates 5s UI freeze on Windows)
- **Security**: Convert synchronous file read to async in IDE tool handler hot path
- **Security**: Add 10s timeout to OAuth token refresh fetch (prevents indefinite hang)
- **Security**: Restrict CSP connect-src to specific port in production builds
- **Stability**: Add top-level React error boundary with reload fallback
- **Stability**: Add SIGTERM/SIGINT handlers for graceful POSIX shutdown
- **Stability**: Cache OAuth credentials in memory (eliminates repeated disk reads)
- **Stability**: Cache SPA index.html at server startup (eliminates per-request sync read)
- **Stability**: Replace sleepSync with async delay in approval retry loop
- **Stability**: Add 15s fetch timeouts to extension/MCP marketplace handlers
- **Stability**: Consolidate electron-updater into singleton module
- **Stability**: Configure electron.crashReporter for local crash dump collection
- **Stability**: Fix React HMR double-createRoot warning
- **Accessibility**: Add keyboard access to AgentChat plan block expand/collapse
- **Accessibility**: Add keyboard access to blame gutter annotation rows
- **Accessibility**: Add aria-live to streaming chat messages for screen readers
- **UI**: Auto-detect system light/dark theme preference on first launch
- **UI**: Replace empty Suspense fallback with visible loading state
- **UI**: Replace alert() about dialog with custom event dispatch
- **Tests**: Fix all 35 pre-existing test failures (native module ABI, stale assertions, DB cleanup)
- **Tests**: Add 216 new tests (pathSecurity, gitDiffParser, importGraphAnalyzer, languageStrategies, chatOrchestrationBridgeGit)

### Changed
- Restore original ESLint thresholds (max-lines:300, max-lines-per-function:40) by splitting 17 oversized files
- Remove unused `streamdown` and `marked` dependencies
- Move @types/express, @types/ws to devDependencies
- Move react, react-dom to dependencies
- Replace `marked` usage with `react-markdown` in ExtensionStoreSection
- Replace `any` types in configSchema with `Record<string, unknown>`
- Update vitest include pattern to support .tsx test files
- Add `no-console` lint rule (warn level)

### Added
- MIT LICENSE file
- README.md with project overview and quick start
- CHANGELOG.md
- CONTRIBUTING.md with dev setup and coding conventions
- SECURITY.md with disclosure policy
- GitHub Actions CI workflow (typecheck, lint, test, build)
- GitHub issue templates and PR template
- .env.example documenting environment variables
- ai/deferred.md for tracking post-v1.0 features
- TODO-v1.1.md with all deferred audit items
- `clean` script in package.json
- `engines` field requiring Node >= 20, npm >= 9

### Removed
- 1,169 lines of duplicate content from 32 subsystem CLAUDE.md files
- Stale @types/marked (marked v17 ships its own types)

## [1.0.0-rc.1] - 2026-03-23

### Added
- Agent Chat with multi-turn Claude Code conversations and full IDE context injection
- Terminal management with shell integration, command block detection, and OSC 133 support
- File explorer with virtual tree, git status indicators, staging area, and inline editing
- Monaco-based code editor with syntax highlighting, vim mode, diff view, and minimap
- Agent Monitor for real-time session visibility, tool call timeline, and cost tracking
- Context Layer pipeline for automatic code intelligence and context enrichment
- Multi-provider orchestration (Claude Code CLI, Codex CLI)
- Web remote access via WebSocket bridge (Tailscale, Cloudflare Tunnel, LAN)
- 7 built-in themes (retro, modern, warp, cursor, kiro, light, high-contrast) plus custom theme editor
- Command palette with fuzzy search, file picker, and symbol search
- Session replay for reviewing past agent conversations
- Multi-session launcher for parallel agent workflows
- Settings panel with 16 configuration tabs and full-text search
- Git panel with branch selection, staging, and commit
- Time travel for exploring file change history
- Usage and cost analytics dashboard
- MCP server management and marketplace
- Extension store with VS Code marketplace integration
- CLAUDE.md auto-generation for project context
