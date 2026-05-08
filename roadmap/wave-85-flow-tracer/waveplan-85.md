# Wave 85 — Flow Tracer (Phase 1 of "An IDE That Teaches You")

## Status

DRAFT · target v2.15.0 (or v2.16.0 if Wave 84 ships first) · drafted 2026-05-08.

## Context — why this wave exists

This wave opens a multi-wave product initiative tentatively named **"An IDE That Teaches You."** The framing crystallized during the 2026-05-08 brainstorming session captured at `docs/superpowers/specs/2026-05-08-flow-tracer-design.md`. In short: agent AI removes the labor of typing code, but it does not close the comprehension gap — someone who relies on an agent to write code still needs to understand that code well enough to ship it, debug it, evolve it, and grow as an engineer. This initiative repositions the Agent IDE around closing that gap explicitly. The agent is your hands; the IDE is your interpreter; the user grows alongside the codebase.

The initiative ships in three waves, each independently usable:

| Wave | Mode | Question it answers |
|---|---|---|
| **85 (this wave)** | **Flow Tracer** | "What happens when X?" — causal/temporal swimlane sequence diagram |
| 86 (planned) | Inline captions + diff narrator | "What is *this*, right where I'm looking?" — pervasive in-editor narration |
| 87 (planned) | Galaxy Map + cross-linking | "How is the codebase laid out?" — spatial/architectural |

Wave 85 builds the first and most load-bearing of the three. It introduces a new architectural surface — the Flow Tracer trace engine sits next to the existing codebase-memory graph indexer, consumes its edges, generates its own boundary registry, ships a new IPC contract, and renders a custom Canvas2D view in the centre pane. Per `~/.claude/rules/walking-skeleton-first.md`, Phase 1 must be a walking skeleton end-to-end before feature work stacks on top.

The codebase already carries the substrate this wave needs: the codebase-memory graph (~18.3K nodes, ~13.2K edges, auto-synced) provides static call edges; `src/main/contextLayer/moduleSummarizer.ts` proves the `spawnClaude` + Haiku + JSON-output + circuit-breaker + hash-cached file pattern that narration must match; `src/renderer/components/Layout/CentrePaneConnected.parts.tsx` shows the centre-pane special-view registration pattern (lazy-imported component + `resolveSpecialViewContent` switch + DOM-event handler in the wiring file); `src/renderer/components/Layout/GraphPanel/GraphCanvas.tsx` shows the custom Canvas2D rendering pattern with viewport culling, LOD, and CSS-custom-property color resolution. Wave 85 borrows from all four.

Auth constraint: per the user's Max subscription with no API key, all narration goes through `spawnClaude` CLI subprocess invocations against the locally-installed Claude Code. Direct Anthropic API calls are unauthorized. This shapes the narration generation architecture (no embedding API, no streaming response, JSON output schema enforced via prompt).

## Goal

After this wave, opening the centre-pane Flow Tracer view in the Agent IDE shows a gallery of 8-15 AI-curated canonical flows for the current project. Clicking a tile renders a swimlane sequence diagram that traces the selected flow through every layer of the running app — User → Renderer → Preload → Main → Claude CLI → Filesystem — with What/Why/How narration on each step. Hovering any step opens the side panel with detailed annotations; clicking "Open file" jumps to the symbol's exact line in the editor. A natural-language search bar accepts queries like "when I click send" and resolves them to entry-point symbols via a single Haiku CLI call against an indexed candidate list. Saved flows persist to `<workspaceRoot>/.ouroboros/flows/` and are exportable as Mermaid sequence diagrams. The feature works end-to-end on the Agent IDE codebase only; cross-project support (Contractor App, Gamify) is explicitly out of scope.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-85-flow-tracer/wave-85-decisions.md` (drafted as Phase 0; the four locked decisions below have full Context / Options / Pick / Rationale / Consequences entries there).

**Locked from grounding + 2026-05-08 architectural research:**

1. **Match `moduleSummarizer.ts` for narration generation.** All What/Why/How narration goes through `spawnClaude` (not direct API), uses `claude-haiku-4-5-20251001`, returns structured JSON validated by the prompt, retries 2x with circuit-breaker on persistent failure, persists to `<workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json` (per-symbol What+How) and `<workspaceRoot>/.ouroboros/flows/<flowId>-why.json` (per-flow Why). Auth-constrained pick; also industry-standard for bounded-candidate prompt decomposition (per ScienceDirect 2025 prompt-decomposition study).

2. **Hand-rolled swimlane-constrained topological sort for layout.** No d3-dag, no elkjs, no Mermaid runtime. ~60-80 lines of pure TypeScript: Kahn's algorithm topological sort, per-lane X assignment with fixed spacing, straight-line edge routing with control-point bends for async edges, cycle collapse before sort. Industry-standard for swimlane-native diagrams (Mermaid, PlantUML, draw.io all do this internally). Matches the codebase's existing custom Canvas2D rendering pattern.

3. **Tree-sitter for AST scanning of IPC handler patterns.** The codebase-memory graph indexer already uses `web-tree-sitter` and `tree-sitter-wasms` (verified in `package.json`). The boundary registry's IPC handler scan reuses this AST tooling, not ts-morph or typescript-eslint. Boundary detection patterns: `ipcMain.handle('channel', handler)` registrations indexed at startup + on file change; `window.electronAPI.X.Y(...)` bridge calls and `ipcRenderer.invoke('channel', ...)` send sites resolved via the registry.

4. **LLM tool-call (single Haiku CLI invocation) for natural-language → symbol resolution.** No local embedding model, no third-party embedding API. Index time: extract UI event handler + IPC handler candidates from the existing graph (small bounded list, ~30-80 entries for Agent IDE). Query time: send `{ query, candidates }` in one Haiku prompt asking for top-5 ranked JSON `[{ symbol, file, line, confidence, reason }]`. Confidence > 0.8: resolve immediately. Else: show disambiguation list. Correct under the auth constraint AND on technical merits per CODEXGRAPH (NAACL 2025) on bounded-candidate retrieval; matches the trajectory Sourcegraph itself moved toward in 2024.

5. **Hybrid narration cache: per-symbol What+How (index-time, persistent) + per-flow Why (render-time, optionally cached).** What and How are symbol-intrinsic (don't depend on which flow contains the symbol) — cached by `symbolHash = SHA1(file, line, body)`, regenerated on file change. Why is flow-extrinsic (the same symbol's "why does this exist" reads differently in a chat-send flow vs. a file-save flow) — generated fresh per flow render in a single whole-flow CLI call providing the full causal chain as context. This is the pedagogically right tradeoff (explicit user goal: "most digestible"); per-step Why calls multiply latency without quality gain in a constrained 6-hop flow.

6. **Centre-pane special view, no right-sidebar mini-tracer in Wave 1.** Match the existing pattern: lazy-imported `FlowTracerView` registered in `resolveSpecialViewContent` of `CentrePaneConnected.parts.tsx`, `SpecialViewType` enum entry, `agent-ide:open-flow-tracer` DOM event listener. Mini-tracer in right sidebar is Wave 2 polish; symbol-search entry (option A) and click-the-running-app (option D) are Wave 2 polish.

7. **Honeycomb test shape per `~/.claude/notes/wave-process.md` "Test shape doctrine".** This wave introduces a new architectural surface with cross-layer integration (renderer ↔ preload ↔ main ↔ CLI). Boundary tests dominate; unit tests for layout algorithm + topological sort + Tree-sitter pattern matchers; integration tests for the full IPC contract round-trip; manual smoke per `manual-smoke-gate.md` (UI-bearing wave touching `src/renderer/components/Layout/**`).

8. **Per-phase commits, single push at wave wrap** per the user-memory entry on push policy. Phase commits accumulate on a feature branch (`wave-85-flow-tracer`); one push at Phase 8 after `/review` returns PASS.

**Locked 2026-05-08 (user accepted recommendations):**

9. **Trace depth limit default — 6 hops, configurable.** Industry-standard for sequence-diagram depth. 6 hops covers the deepest realistic Agent IDE flow (renderer click → state update → IPC → main handler → orchestrator → CLI spawn → CLI return → main response → renderer update collapses to 4-6 distinct call hops). Configurable via renderer setting `flowTracer.maxDepth` (range 3-12) so power users can extend. Truncated flows render with "→ continues, depth limit reached" badge per spec §6.

10. **Saved-flow git-tracking — local-only by default.** `.ouroboros/` stays in `.gitignore`; saved flows are personal artifacts during exploration. New setting `flowTracer.saveSharedFlows: boolean` (default `false`); when enabled, flows write to `.ouroboros-shared/<flowId>.json` (NOT gitignored) for intentional check-in. Mermaid export unaffected (clipboard, not file).

11. **Phase 9 (symbol-search entry — option A from spec) — OUT, deferred to Wave 86.** The wave is already 8 phases; gallery + NL search cover the target persona (vibe-coders learning their codebase). Symbol-search overlaps VS Code's Cmd+T and targets already-fluent developers — power-user surface, not primary persona. Wave 86 polish bundle inherits symbol-search alongside mini-tracer, click-to-trace, vocabulary toggle.

## Scope

**In scope:**

- `src/main/flowTracer/` — new subsystem
  - `index.ts` — module barrel; registers IPC handlers
  - `traceEngine.ts` — Layer 1-4 trace computation (static call chain via existing graph; boundary detection; boundary resolution; async detection)
  - `boundaryRegistry.ts` — Tree-sitter-based scan for `ipcMain.handle` registrations and `window.electronAPI` bridge mappings; rebuilt on graph re-index
  - `narrationCache.ts` — per-symbol What+How cache (matches `moduleSummarizer.ts` pattern); per-flow Why cache (separate file per flow)
  - `canonicalFlows.ts` — gallery generation via Haiku CLI; NL→symbol resolution via Haiku CLI
  - `flowPersistence.ts` — save/load FlowTrace to `<workspaceRoot>/.ouroboros/flows/`
  - `flowMermaidExport.ts` — FlowTrace → Mermaid `sequenceDiagram` text
  - `flowLayout.ts` — pure-TS swimlane-constrained topological sort; Kahn algorithm + per-lane X assignment + edge routing + cycle collapse
- `src/main/ipc-handlers/flowTracerHandlers.ts` — IPC handler registrar following the domain-split pattern in `src/main/ipc-handlers/`
- `src/preload/preload.ts` — add `flowTracer` namespace to the contextBridge surface
- `src/renderer/types/electron.d.ts` — add `flowTracer` typed contract (single source of truth)
- `src/renderer/components/FlowTracer/` — new component tree
  - `FlowTracerView.tsx` — top-level view; switches between gallery / NL-search / trace render states
  - `FlowGallery.tsx` — tile grid for canonical flows; refresh button
  - `FlowSearchBar.tsx` — NL search input with disambiguation dropdown
  - `FlowCanvas.tsx` — custom Canvas2D swimlane render (matches `GraphCanvas.tsx` pattern: viewport culling, LOD, CSS-property color resolution)
  - `FlowSidePanel.tsx` — What/Why/How aside; Open file / Trace deeper / Explain in chat actions
  - `FlowLayerControls.tsx` — bottom strip (depth toggle, layer toggles)
  - `useFlowData.ts` — orchestrating hook (IPC calls + state)
  - `flowTracerEvents.ts` — DOM event constants (`agent-ide:open-flow-tracer`)
- `src/renderer/components/Layout/CentrePaneConnected.parts.tsx` — register `'flow-tracer'` in `SpecialViewType` enum and `resolveSpecialViewContent` switch
- `src/renderer/components/Layout/CentrePaneConnected.wiring.tsx` — register `agent-ide:open-flow-tracer` DOM event handler
- `src/renderer/components/Layout/EditorTabBar.tsx` — add `'flow-tracer'` to `SpecialViewType`
- `src/renderer/components/CommandPalette/` — register commands: `flow-tracer:browse-flows`, `flow-tracer:search`
- `src/renderer/components/Layout/TitleBar.tsx` — add `View → Flow Tracer` menu item dispatching the DOM event
- Manual smoke entry in the wave's result brief per `~/.claude/rules/manual-smoke-gate.md` — UI-bearing changes touching `src/renderer/components/Layout/**`
- `ai/vision.md` (new) — capture the "An IDE That Teaches You" framing for future-session continuity (tiny, ~30 lines)

**Out of scope:**

- Cross-project support (Contractor App, Gamify) — Wave 88+ each as their own wave; the boundary-resolution patterns generalize but each codebase has different transport (HTTP, sync protocol, etc.)
- Click-the-running-app entry (option D) — Wave 86 polish
- Symbol-search entry (option A) — see locked decision #11; tentatively Wave 86
- DOM event-listener async tracing (`addEventListener`, observer patterns) — Wave 86
- Performance / timing data (p50, error rates) — requires runtime instrumentation; Wave 87
- Test → source flows ("when this test runs, what does it exercise?") — Wave 87
- DB query tracing — relevant for Contractor App / Gamify waves; Agent IDE has no DB
- Beginner/expert vocabulary toggle — Wave 86 polish
- Mini-tracer in right sidebar — Wave 86 polish
- Galaxy cross-linking (galaxy → tracer click handoff) — requires Wave 87 to exist
- Inline captions integration (caption → tracer link) — requires Wave 86 to exist
- Refactoring the existing `GraphPanel` to share code with `FlowCanvas` — separate refactor wave if duplication grows; for Wave 85 the two are independent

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| **0** | ADR — author `wave-85-decisions.md` | orchestrator | Capture the 8 locked decisions + 3 REQUIRES-USER-LOCK items with Context / Options (industry / emerging / experimental) / Pick / Rationale / Consequences per `~/.claude/rules/best-practice-spectrum.md`. Phase 0 deliverable is a single file. No code. |
| **1** | **Walking skeleton — end-to-end stub for one canonical flow** | sonnet-implementer | Per `~/.claude/rules/walking-skeleton-first.md`: this wave introduces a new architectural surface (Flow Tracer trace engine + new IPC contract + new centre-pane view + Canvas2D swimlane render). Phase 1 ships the thinnest end-to-end slice: ONE hardcoded canonical flow ("send a chat message"), boundary registry hardcoded for that flow's specific channels, trace engine returns a stubbed FlowTrace with placeholder narration, gallery shows one tile, click renders the swimlane with placeholder text. The slice runs end-to-end on the developer's machine — no real Tree-sitter scanning yet, no real narration, no NL search. Smoke run terminus: opening Flow Tracer from Command Palette and seeing the swimlane diagram render in the centre pane. NOT "set up the package," NOT "write the schema," NOT "scaffold the components" — those are sub-tasks subsumed into this phase. The deliverable is the slice running end-to-end with one automated smoke. |
| **2** | Boundary registry — generalize to all IPC channels via Tree-sitter | sonnet-implementer | Replace Phase 1's hardcoded channel list with a Tree-sitter scan of `src/main/**/*.ts` for `ipcMain.handle` registrations and `src/preload/preload.ts` for bridge mappings. Build the in-memory `BoundaryRegistry` at startup; rebuild on graph re-index events. Deliverable: any user-defined IPC flow now traces correctly, not only the hardcoded one. |
| **3** | Narration cache — per-symbol What+How (index-time batch) | sonnet-implementer | Match `moduleSummarizer.ts` pattern verbatim: `spawnClaude` with Haiku, JSON output, 2-attempt retry, circuit-breaker after 3 failures, hash-based file cache at `<workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json`. Pre-compute What+How for every symbol referenced by at least one canonical flow at index time, batch concurrency=3 (matching moduleSummarizer's concurrency cap). Deliverable: opening a Flow Tracer flow shows real What+How narration for previously-indexed symbols; placeholder text for stale/missing. |
| **4** | Narration — per-flow Why with chain context (render-time) | sonnet-implementer | The harder narration call. At flow render time, send a single CLI call with the ordered chain of symbols + their What+How (already cached) + the flow title; ask Haiku for `Why` for each step in the chain. Cache result at `<workspaceRoot>/.ouroboros/flows/<flowId>-why.json`. Stream each step's Why into the side panel as it returns. Deliverable: opening a flow shows What+How immediately (cached), Why loads ~2-4s after; subsequent opens are instant from cache. |
| **5** | Canonical flow gallery — AI-suggested 8-15 flows per project | sonnet-implementer | Index-time CLI call: send the project's UI event handler list + IPC handler list + brief project description; ask Haiku for 8-15 pedagogically-valuable flow titles + entry-point symbols + estimated step counts in JSON. Persist to `<workspaceRoot>/.ouroboros/canonical-flows.json`. Refresh button in gallery header re-runs the call. Deliverable: opening Flow Tracer with no flow selected shows the populated gallery; clicking a tile renders that flow. |
| **6** | Natural-language search + disambiguation | sonnet-implementer | Search bar above the gallery accepts NL queries. On submit: single Haiku CLI call with `{ query, candidates }` (candidates = the index-time entry-point list); receive top-5 JSON ranked. If top-1 confidence > 0.8: resolve immediately and render flow. Else: show disambiguation dropdown. Deliverable: typing "when I send a chat message" resolves to the chat-send entry point and renders the flow. |
| **7** | Persistence + Mermaid export | haiku-implementer | Mechanical implementation: save FlowTrace as JSON to `<workspaceRoot>/.ouroboros/flows/<flowId>.json` via `flowPersistence.ts`; load on demand; list saved flows via `listSavedFlows`. Mermaid export: FlowTrace → `sequenceDiagram` text, copy-to-clipboard. Tight spec; matches existing JSON-on-disk patterns elsewhere in the codebase. |
| **8** | Wave wrap | orchestrator | Full lint, full typecheck, scoped tests (`test:main`, `test:renderer`, the new flowTracer tests), then `/review` (mechanical gap-check), then manual smoke per `manual-smoke-gate.md` checklist (UI-bearing wave). Single push to remote; create release notes; update `roadmap/HANDOFF.md`. |

### Phase ordering

```
0 (ADR)
 │
 └→ 1 (walking skeleton — end-to-end one flow)
     │
     ├→ 2 (boundary registry generalize) ──┐
     │                                      ├→ 5 (canonical flow gallery) ──┐
     ├→ 3 (narration: per-symbol What+How) ─┤                               │
     │                                      ├→ 6 (NL search) ────────────────┤
     ├→ 4 (narration: per-flow Why) ────────┘                                ├→ 8 (wave wrap)
     │                                                                       │
     └→ 7 (persistence + Mermaid export) ─────────────────────────────────────┘
```

Phase 1 blocks everything (walking skeleton must run before feature work stacks). Phases 2, 3, 4 are independent of each other and can run in parallel. Phases 5 and 6 both depend on 2+3+4 (gallery uses real candidates from registry; NL search uses real candidates from registry). Phase 7 depends on 1 only (FlowTrace shape stable from Phase 1). Phase 8 depends on all preceding phases passing.

Practical scheduling: Phase 0 first (orchestrator); Phase 1 next (single sonnet-implementer dispatch); then Phase 2 + 3 + 7 in parallel (three sonnet-implementer dispatches); then Phase 4 (depends on 3 narration cache being in place); then Phase 5 + 6 in parallel; then Phase 8 wrap.

## Risks

| Risk | Mitigation |
|---|---|
| **Tree-sitter scan misses non-standard `ipcMain.handle` patterns** (e.g., dynamic channel names, registrations inside helper functions) — boundary registry incomplete, traces dead-end at "unknown handler" | Phase 2 deliverable includes an audit pass: enumerate all `ipcMain.handle` calls via grep, cross-check against the registry, flag any missing. Where the pattern can't be statically resolved, render the boundary as terminal with a clear "→ unresolved" badge — don't silently drop. Same fallback strategy as the existing graph indexer's "unknown reference" handling. |
| **Haiku narration quality is poor for codebase-specific jargon** ("orchestrator," "chat-only shell," "ChatWorkbenchBody") — narration reads as generic LLM boilerplate, fails the "most digestible" goal | Prompt engineering in Phase 3 prompts: include the project's `CLAUDE.md` excerpts as system-prompt context so Haiku has access to repo-specific terminology. Add a manual quality eval as part of Phase 8 smoke: for 5 canonical flows, check that narration uses repo-specific terms correctly. If fail: tune the system prompt and re-batch. |
| **Whole-flow Why CLI call exceeds Haiku context budget** for deep flows (10+ steps with full bodies) — call truncates or fails | Phase 4 includes a step-body truncation pass before assembling the prompt: first 30 lines + full signature per symbol. This caps the prompt at a predictable byte budget. Failure mode: graceful degradation to per-step Why calls (3 calls instead of 1) at higher latency. |
| **Layout algorithm produces tangled output for high-fanout single-step nodes** (e.g., `ipcMain.handle('chat:send', ...)` is a hub touched by 8+ flows) — visual mess | Phase 1 includes layout snapshot tests for known flows. If a layout looks wrong, the issue is in the topological sort + per-lane X assignment, not the renderer. The 60-80 line layout function is unit-testable without rendering. |
| **Walking-skeleton scope creep** (Phase 1 implementer pulls in real Tree-sitter scanning, real narration, real gallery) — Phase 1 doesn't ship as a thin slice, takes 3x as long | Phase 1 brief explicitly forbids: real boundary scanning (hardcoded channel list); real narration (placeholder strings); real gallery (one tile). The implementer's smoke-run target is "open Flow Tracer, click the one tile, see the swimlane render with placeholder text." Anything beyond that is Phase 2+. Orchestrator reviews Phase 1 diff for scope before merging. |
| **`spawnClaude` CLI subprocess startup latency dominates index-time batch** (each invocation ~1-2s startup; 18K nodes × ~500 narrated = ~500 invocations × 1.5s = 12 minutes blocked) | Phase 3 batches concurrency=3 (matching moduleSummarizer); also batches multiple symbols per CLI call (~10 symbols per prompt) to amortize startup. Index-time batch runs fire-and-forget on first project open; the gallery renders even with stale narration; cache fills in over time. Same UX pattern as `moduleSummarizer.ts` — never blocks user interaction. |
| **Confusion between Flow Tracer and existing GraphPanel** — users think they overlap, code accidentally couples | Wave 85 keeps `FlowCanvas` and `GraphCanvas` independent (no shared code in this wave). They serve different purposes (causal flow vs. spatial graph) and may diverge further. If duplication grows in Wave 86+ when galaxy ships, then a separate refactor wave can extract shared canvas primitives. |
| ~~REQUIRES USER LOCK items remain unanswered when Phase 0 begins~~ — RESOLVED 2026-05-08: items 9, 10, 11 locked to recommended picks (6-hop depth, local-only saved flows, Phase 9 deferred). ADR reflects locks; Phase 1 brief is unblocked. | n/a |

## Test coverage by phase

Per `~/.claude/notes/wave-process.md` "Test shape doctrine": this wave is **honeycomb-shaped** (cross-layer integration dominates). Boundary tests carry the bulk of coverage; unit tests for genuinely standalone logic; manual smoke as the third leg.

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | n/a | n/a | ADR is documentation, not code. |
| 1 | n/a — walking skeleton has placeholder logic; real coverage starts Phase 2 | One end-to-end smoke test exercising the IPC contract round-trip for the hardcoded flow. Test imports the renderer's IPC client (typed) and the main's handler (real) and asserts the swimlane data shape returned is what the renderer expects. | Honeycomb shape begins here — boundary test is the load-bearing one. |
| 2 | `boundaryRegistry.test.ts` — Tree-sitter pattern matchers (each `ipcMain.handle` shape variant); `traceEngine.test.ts` — depth limiting + cycle collapsing | Integration test loads real `src/main/ipc-handlers/*.ts`, asserts the registry contains all known channels (regression test against a snapshot). | Tree-sitter pattern tests are isolated logic; integration test asserts the registry against the real codebase. |
| 3 | `narrationCache.test.ts` — hash invalidation + stale detection + cache-file round trip | Integration test exercises `spawnClaude` with a fixture symbol; mock the CLI subprocess to return canned JSON; assert cache file is written with expected schema. | Mock the CLI; do not run real Haiku in tests (cost + flakiness). Real narration validated in manual smoke. |
| 4 | `narrationFlowWhy.test.ts` — chain assembly + step-body truncation + prompt assembly | Integration test sends a 6-step flow through the prompt builder, asserts the final prompt is under the byte budget and contains all symbol signatures. | Same pattern as Phase 3 — mock CLI in tests. |
| 5 | `canonicalFlows.test.ts` — gallery JSON shape parsing + symbol-resolution | Integration test runs the gallery generator against a fixture project (small 5-file repo committed under `test/fixtures/`); assert the generated JSON has expected fields. | The fixture project is part of the deliverable so the test isn't dependent on the real Agent IDE state. |
| 6 | `naturalLanguageResolver.test.ts` — confidence threshold logic + disambiguation list shape | Integration test sends NL query through the resolver with a mock CLI returning canned candidates; assert the disambiguation list renders correctly when confidence is low. | n/a |
| 7 | `flowPersistence.test.ts` — save/load round-trip; `flowMermaidExport.test.ts` — Mermaid output for known flows | n/a — pure save/load logic, no boundary | Snapshot test for Mermaid output to catch unintended format drift. |
| 8 | n/a — full suite re-run as part of wrap | n/a — full suite re-run | Wave wrap runs `test:main`, `test:renderer`, `test:ipc`. `/review` runs after. Manual smoke gate per `manual-smoke-gate.md`. |

## Acceptance criteria

- [ ] `roadmap/wave-85-flow-tracer/wave-85-decisions.md` exists with all 8 locked decisions + the 3 user-locked decisions captured per the spectrum-spec format.
- [ ] `src/main/flowTracer/index.ts` exports a registered set of IPC handlers (`flowTracer:trace-flow`, `flowTracer:resolve-natural-language`, `flowTracer:get-canonical-flows`, `flowTracer:regenerate-gallery`, `flowTracer:get-narration`, `flowTracer:save-flow`, `flowTracer:list-saved-flows`, `flowTracer:load-flow`, `flowTracer:export-mermaid`).
- [ ] `src/preload/preload.ts` exposes `window.electronAPI.flowTracer` with all nine methods, typed against `src/renderer/types/electron.d.ts`.
- [ ] `src/renderer/components/Layout/CentrePaneConnected.parts.tsx` registers `'flow-tracer'` in `SpecialViewType` and `resolveSpecialViewContent`.
- [ ] Opening Command Palette → "Flow Tracer: Browse Flows" opens the centre-pane view with the gallery populated for the current project.
- [ ] Clicking any gallery tile renders the swimlane diagram in the centre pane within 2s.
- [ ] Hovering any rendered step opens the side panel with What/Why/How content (real or cached, not placeholder).
- [ ] Clicking "Open file" on the side panel opens the editor at the symbol's exact line.
- [ ] Typing "when I send a chat message" in the search bar resolves to the chat-send entry point and renders the flow within 3s (or shows disambiguation if confidence < 0.8).
- [ ] Saving a flow writes JSON to `<workspaceRoot>/.ouroboros/flows/<flowId>.json`; reopening the IDE and loading it produces an identical visual render.
- [ ] Exporting a flow produces valid Mermaid `sequenceDiagram` text that renders correctly when pasted into a Mermaid playground.
- [ ] All scoped test scripts (`test:main`, `test:renderer`, `test:ipc`) pass.
- [ ] `/review` returns PASS or FLAG-with-flags-addressed.
- [ ] Manual smoke checklist (per `~/.claude/rules/manual-smoke-gate.md`) is signed in `roadmap/wave-85-flow-tracer/wave-85-result.md`.
- [ ] `roadmap/HANDOFF.md` updated with Wave 85 ship status.
- [ ] `ai/vision.md` exists and captures the "An IDE That Teaches You" framing.

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | ADR is internal documentation; no user-facing surface produced. Phase 0 unblocks user-facing phases by removing decision ambiguity. |
| 1 | Centre-pane Flow Tracer view renders the swimlane for the hardcoded canonical flow | Command Palette `flow-tracer:browse-flows` command → dispatches `agent-ide:open-flow-tracer` DOM event → `CentrePaneConnected.wiring.tsx` listener → `resolveSpecialViewContent` switch resolves to `FlowTracerView` → `useFlowData.loadGallery` → IPC `flowTracer:get-canonical-flows` (Phase-1 stub: returns hardcoded one-tile list) → `FlowGallery` renders the single tile → click handler → `useFlowData.traceFlow` → IPC `flowTracer:trace-flow` (Phase-1 stub: returns canned FlowTrace with placeholder narration) → `FlowCanvas` viewport-culled render → centre pane | Centre pane shows the swimlane with at least 4 step boxes connected by arrows; placeholder text is visible in the side panel; no console errors; the editor tab bar shows a "Flow Tracer" tab that closes cleanly |
| 2 | Centre-pane swimlane resolves the correct main-side handler for a non-hardcoded flow | `FlowGallery` tile click OR `FlowSearchBar` submit → `useFlowData.traceFlow` → IPC `flowTracer:trace-flow` → main `traceEngine.trace` → `boundaryRegistry.lookup(channelName)` → Tree-sitter-scanned `ipcMain.handle` index built at startup from `src/main/**/*.ts` → handler symbol resolved to file:line → trace recurses into main-side handler symbols via the existing graph → `FlowTrace` returned with resolved boundary → `FlowCanvas` re-renders the swimlane with the resolved handler in the main lane | Centre pane shows the file-open flow's swimlane with the correct main-side handler resolved (not "→ unknown handler"); the boundary arrows cross from preload to main lane on the correct channel |
| 3 | `FlowSidePanel` shows real What+How narration on hover | `FlowCanvas` step hover handler → `FlowSidePanel.onStepHover(symbolKey)` → `useFlowData.getNarration(symbolKey)` → IPC `flowTracer:get-narration` → main `narrationCache.get(symbolHash)` → reads `<workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json` (or, on miss, queues background `spawnClaude` batch and returns placeholder) → JSON returned to renderer → `FlowSidePanel` renders What and How fields | Side panel "What" reads as a 1-2 sentence specific description (not "this function does various things"); "How" is 3-5 lines describing the actual mechanism. Repeat-hovering the same step renders instantly from cache. |
| 4 | `FlowSidePanel` Why field populates with chain-aware motivation after a brief load | `FlowCanvas` first render of a new flow → `useFlowData.fetchFlowWhy(flowId, chain)` → IPC `flowTracer:get-flow-why` → main `narrationCache.generateFlowWhy` assembles prompt from chain + cached What+How → `spawnClaude` single CLI call with full chain context → Haiku returns JSON per step → cached to `<workspaceRoot>/.ouroboros/flows/<flowId>-why.json` → returned to renderer → `FlowSidePanel.Why` populates per step | What and How render immediately (cached); Why loads ~2-4s later with a step-specific motivation that references the flow's causal context, not just the symbol's intrinsic role |
| 5 | `FlowGallery` renders project-specific tiles on first open | `FlowTracerView` mount → `useFlowData.loadGallery` → IPC `flowTracer:get-canonical-flows` → main `canonicalFlows.read` (cache miss triggers `canonicalFlows.regenerate`) → `spawnClaude` with project UI-handler + IPC-handler list → Haiku returns 8-15 flow titles + entry points as JSON → persisted to `<workspaceRoot>/.ouroboros/canonical-flows.json` → returned to renderer → `FlowGallery` renders tile grid | 8-15 tiles visible, each with a recognizable user-facing title (e.g., "Send a chat message," "Open a file from the tree," "Toggle the sidebar"); none are generic placeholders |
| 6 | `FlowSearchBar` resolves the NL query to the right entry point or shows disambiguation | `FlowSearchBar` submit handler → `useFlowData.resolveQuery(text)` → IPC `flowTracer:resolve-natural-language` with bounded candidate list (assembled at index time from graph) → main `canonicalFlows.resolveNL` → `spawnClaude` single CLI call with `{ query, candidates }` → Haiku returns top-5 ranked JSON `[{ symbol, file, line, confidence, reason }]` → confidence threshold check (`>0.8` direct render, else dropdown) → either `FlowCanvas` renders the chosen flow OR `FlowSearchBar` shows disambiguation dropdown for Cole to pick | Either the chat-send flow renders directly (high confidence) or a disambiguation dropdown shows top-5 candidates with reasons; Cole can pick one and the flow renders |
| 7 | Saved flow round-trips across IDE restart; Mermaid export reaches the clipboard | Save: `FlowSidePanel` save action → IPC `flowTracer:save-flow` → main `flowPersistence.save` → writes `<workspaceRoot>/.ouroboros/flows/<flowId>.json` → IDE restart → `FlowTracerView` mount → IPC `flowTracer:list-saved-flows` → main `flowPersistence.list` → `FlowGallery` saved-flows list → click → IPC `flowTracer:load-flow` → `flowPersistence.load` → identical FlowTrace returned → `FlowCanvas` renders identically. Export: `FlowSidePanel` export action → IPC `flowTracer:export-mermaid` → main `flowMermaidExport.toSequenceDiagram` → string returned → renderer writes to system clipboard | The saved flow appears in the list; clicking renders it identically to before; "Export Mermaid" copies syntactically valid Mermaid to clipboard |
| 8 | Internal — no observation point | n/a | Wave-wrap phase: full lint, full typecheck, scoped tests (`test:main`, `test:renderer`, `test:ipc`), `/review` mechanical gap-check, manual smoke checklist sign-off per `manual-smoke-gate.md`, single push to remote, tag/release. User-observable surfaces are covered by Phases 1-7 individually; Phase 8 is the orchestrator's wave-end gate, not a feature surface. |

### Data-shape probes

Optional programmatic checks the orchestrator runs at wave-wrap to confirm files / JSON / on-disk shapes:

```bash
# Verify ADR exists with required sections
test -f roadmap/wave-85-flow-tracer/wave-85-decisions.md
grep -q "## Decision 1" roadmap/wave-85-flow-tracer/wave-85-decisions.md
grep -q "## Decision 11" roadmap/wave-85-flow-tracer/wave-85-decisions.md

# Verify IPC handlers registered
grep -q "flowTracer:trace-flow" src/main/flowTracer/*.ts
grep -q "flowTracer:resolve-natural-language" src/main/flowTracer/*.ts

# Verify preload bridge
grep -q "flowTracer:" src/preload/preload.ts

# Verify renderer type contract
grep -q "flowTracer:" src/renderer/types/electron.d.ts

# Verify centre-pane registration
grep -q "'flow-tracer'" src/renderer/components/Layout/CentrePaneConnected.parts.tsx

# Verify cache directory pattern matches moduleSummarizer
grep -q ".ouroboros/narration-cache" src/main/flowTracer/narrationCache.ts
grep -q ".ouroboros/flows" src/main/flowTracer/flowPersistence.ts

# Verify on-disk artifact shapes after a smoke run on the Agent IDE codebase
test -f "$HOME/.ouroboros/canonical-flows.json" || test -f "/c/Web App/Agent IDE/.ouroboros/canonical-flows.json"
# (the canonical-flows.json should contain at least 8 entries)
```

## Files the next agent should read first

1. `docs/superpowers/specs/2026-05-08-flow-tracer-design.md` — the design spec; this wave plan operationalizes it.
2. `roadmap/wave-85-flow-tracer/wave-85-decisions.md` — the ADR, Phase 0 deliverable. Read before any implementation phase.
3. `src/main/contextLayer/moduleSummarizer.ts` — pattern to match for narration cache. The implementer should not invent a different pattern.
4. `src/renderer/components/Layout/GraphPanel/GraphCanvas.tsx` — pattern to match for FlowCanvas (custom Canvas2D, viewport culling, LOD, CSS-property color resolution).
5. `src/renderer/components/Layout/CentrePaneConnected.parts.tsx` — pattern to match for centre-pane special-view registration.
6. `src/renderer/components/Layout/CentrePaneConnected.wiring.tsx` — pattern to match for DOM event listener wiring.
7. `src/renderer/types/electron.d.ts` — single source of truth for IPC contract; new `flowTracer` namespace goes here first.
8. `src/main/codebaseGraph/CLAUDE.md` — the graph indexer's structure; the boundary registry consumes from here.
9. `~/.claude/notes/wave-process.md` — wave conventions (Sites 1/2/3, honeycomb test shape, walking-skeleton-first).
10. `~/.claude/rules/walking-skeleton-first.md` — Phase 1's binding rule.
11. `~/.claude/rules/manual-smoke-gate.md` — Phase 8's binding rule (UI-bearing wave).
12. `roadmap/wave-82-chat-only-polish-bundle/waveplan-82.md` — most recent shipped wave plan as a structural exemplar.

## Note to the implementer

This wave opens the most consequential product initiative the IDE has run since the chat-only shell. The framing is **"an IDE that teaches you"** — the agent is the user's hands, the IDE is their interpreter, and Wave 85 ships the first and most load-bearing of three modes (Flow Tracer; Wave 86 inline captions; Wave 87 galaxy). Read the design spec at `docs/superpowers/specs/2026-05-08-flow-tracer-design.md` before touching code. Internalize that the wave's purpose is pedagogical: every What/Why/How block, every gallery tile title, every disambiguation reason is the surface where the user *learns*. Boring output kills the product, even when the technical scaffolding is correct.

The wave introduces a new architectural surface — Flow Tracer trace engine, boundary registry, IPC contract, centre-pane view, Canvas2D swimlane render. Per `~/.claude/rules/walking-skeleton-first.md`, Phase 1 must be a working end-to-end slice before any feature work stacks on top. The temptation will be to build the boundary registry "right" first, then the narration cache "right" first, then assemble. Resist it. The walking skeleton's value is that integration risk gets exercised first; building component-by-component buries that risk until the last phase. Phase 1's brief explicitly forbids real Tree-sitter scanning, real narration, and a real gallery — a single hardcoded flow with placeholder text rendering end-to-end is the deliverable. The implementer should verify their Phase 1 diff against this constraint before reporting done.

Three patterns the codebase already encodes: `moduleSummarizer.ts` for narration generation, `GraphCanvas.tsx` for Canvas2D rendering, `CentrePaneConnected.parts.tsx` for view registration. Match these. Do not invent an alternative. The narration cache has a 2-attempt retry, circuit-breaker after 3 failures, hash-based file cache, and `<workspaceRoot>/.ouroboros/` storage location — all four are required, all four are already in the codebase, copy them. The Canvas renderer uses CSS custom property resolution, viewport culling, and LOD — match all three or the visual quality will diverge from the existing GraphPanel and the divergence will need a refactor wave to undo.

Auth constraint reminder: Max subscription, no API key. All LLM calls go through `spawnClaude`. Direct `fetch` calls to api.anthropic.com are unauthorized and will fail at runtime even if they pass type-check. The CLI subprocess pattern is the only path; embed the prompt as the user message, parse JSON from stdout. The `moduleSummarizer.ts` implementation is the canonical reference.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. **Confirm Phase 0 ADR exists at `roadmap/wave-85-flow-tracer/wave-85-decisions.md`** with all 11 locked decisions before dispatching any subagent. (The folder will be renamed from `wave-85-DRAFT/` once the wave plan validates.)
2. **All ADR decisions locked 2026-05-08** — no outstanding user-lock items. Phase 1 dispatch unblocked.
3. **Phase 1 — sonnet-implementer.** Brief: walking skeleton end-to-end for ONE hardcoded flow. Deliverable: opening Flow Tracer in the centre pane, clicking the one gallery tile, seeing the swimlane render with placeholder text. Acceptance: `npm run test:main` and `test:renderer` pass; the smoke run is captured in the phase commit message. Forbid real Tree-sitter scanning, real narration, multi-flow gallery. Orchestrator reviews the Phase 1 diff for scope before merging.
4. **Phase 2 — sonnet-implementer.** Brief: Tree-sitter scan generalizing the boundary registry. Acceptance: registry contains all `ipcMain.handle` channels in `src/main/**/*.ts`; tracing any user-defined IPC flow now resolves the boundary correctly.
5. **Phase 3 — sonnet-implementer.** Brief: per-symbol What+How narration cache, exact match to `moduleSummarizer.ts` pattern. Acceptance: opening a Flow Tracer flow shows real What+How for cached symbols within 1s of hover.
6. **Phase 4 — sonnet-implementer.** Brief: per-flow Why with chain context, single CLI call per flow render, cache to disk. Acceptance: opening a fresh flow shows What+How immediately and Why streaming in within 4s.
7. **Phase 5 — sonnet-implementer.** Brief: canonical flow gallery generation via Haiku CLI; persist to `<workspaceRoot>/.ouroboros/canonical-flows.json`. Acceptance: gallery shows 8-15 project-specific tiles on first open.
8. **Phase 6 — sonnet-implementer.** Brief: NL search via single Haiku CLI call with bounded candidate list; disambiguation dropdown when confidence < 0.8. Acceptance: typing "when I send a chat" resolves to the right entry point or shows top-5 disambiguation.
9. **Phase 7 — haiku-implementer.** Tight spec: save/load FlowTrace JSON to disk; Mermaid export. Acceptance: save → close → reopen → load reproduces identical render; Mermaid output passes Mermaid playground validation.
10. **Phase 8 — orchestrator only.** Run `npm run lint` (full), `npx tsc --noEmit` (full), `npm run test:main test:renderer test:ipc` (scoped per `~/.claude/rules/test-scope.md`). Then run `/review` for the mechanical gap-check. Then sign the manual smoke checklist on the built artifact (`npm run dist` and walk through the centre-pane Flow Tracer view per `~/.claude/rules/manual-smoke-gate.md`). Update `roadmap/HANDOFF.md` with Wave 85 ship status. Push the feature branch and tag.

After Phase 8 PASS: rename `roadmap/wave-85-DRAFT/` to `roadmap/wave-85-flow-tracer/`. Mark wave SHIPPED in HANDOFF.
