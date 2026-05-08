---
title: Wave 85 Architecture Decisions — Flow Tracer
status: DRAFT
decided: 2026-05-08
wave: 85
initiative: an-ide-that-teaches-you
---

# Wave 85 — Architecture Decision Record

This file captures every architectural decision the Flow Tracer wave commits to before any implementation phase runs. Per `~/.claude/rules/best-practice-spectrum.md`, decisions that involve a real spectrum of industry / emerging / experimental options are documented in full; routine "use this existing pattern" calls use the abbreviated Context / Pick / Rationale form.

Eleven decisions total, all locked as of 2026-05-08. Decisions 1-8 came from brainstorming and follow-up architectural research; Decisions 9-11 were locked by user accepting the recommended picks.

---

## Decision 1: Match `moduleSummarizer.ts` for narration generation

**Context:** The Flow Tracer needs to write What/Why/How narration for every step in every traced flow. The user's auth setup (Max subscription, no API key) forbids direct Anthropic API calls. The codebase already has a working code-summarization pipeline (`src/main/contextLayer/moduleSummarizer.ts`) that uses `spawnClaude` (CLI subprocess) with structured JSON output, circuit-breaker after 3 failures, and hash-based file caching. The decision is whether to reuse this exact pattern or invent a different one.

**Options considered:**

- *Industry standard:* Reuse the existing `moduleSummarizer.ts` pattern verbatim. Same `spawnClaude` invocation shape, same `claude-haiku-4-5-20251001` model, same JSON-output prompt convention, same retry / circuit-breaker / cache-file structure.
- *Emerging:* Build a generalized `LLMCallCache` abstraction shared between `moduleSummarizer` and the new Wave 85 narration code. Refactors the existing module to consume the shared abstraction.
- *Experimental:* Direct API calls via a self-hosted gateway. Requires infrastructure not in scope for Wave 85.

**Pick:** Reuse `moduleSummarizer.ts` pattern — industry standard.

**Rationale:** The wave is already 8 phases. Adding a refactor of `moduleSummarizer.ts` to extract a shared abstraction is a separate refactor wave; pulling it into Wave 85 is scope creep. The existing pattern works in production, has been hardened by real failures, and is exactly the right shape for the Flow Tracer's needs. If a second wave needs a third LLM cache (Wave 86 inline captions probably will), that's the moment to extract — not before. Per `~/.claude/CLAUDE.md`: "Three similar lines is better than a premature abstraction."

**Consequences:** Narration cache lives at `<workspaceRoot>/.ouroboros/narration-cache/<symbolHash>.json` for per-symbol What+How; `<workspaceRoot>/.ouroboros/flows/<flowId>-why.json` for per-flow Why. Two LLM-cache modules in main process (`moduleSummarizer.ts` and `narrationCache.ts`) with similar structure. If Wave 86 adds a third, schedule a refactor wave to extract `LLMCallCache`. Phase 3 implementer must read `moduleSummarizer.ts` end-to-end before writing `narrationCache.ts`.

---

## Decision 2: Hand-rolled swimlane-constrained topological sort for layout

**Context:** The Flow Tracer renders steps positioned in horizontal swimlanes (User, Renderer, Preload, Main, CLI, Filesystem) with time flowing top to bottom. The layout algorithm must pin each step's Y-coordinate to its swimlane row, order steps within a row by causal sequence, route edges, and handle cycles. The codebase has no graph-layout library (no d3-dag, no elkjs, no Mermaid). We can hand-roll the layout or pull in a library.

**Options considered:**

- *Industry standard:* Hand-rolled swimlane-constrained topological sort. Kahn's algorithm + per-lane X assignment + straight-line edge routing + cycle collapse. ~60-80 lines of pure TypeScript. This is what every swimlane-native tool (Mermaid sequence diagrams, PlantUML sequence, draw.io swimlane) does internally — full Sugiyama is overkill once swimlane membership pins Y-coordinate.
- *Emerging:* `d3-dag` (~15KB, MIT-licensed, headless Sugiyama operator). Headless layout output passes to Canvas2D ourselves. As of 2024, the package is in **light maintenance mode** — bug fixes only, no new features.
- *Experimental:* `elkjs` (~500KB, transpiled Java, what VS Code uses for built-in flow renderers). Full swimlane support, designed for general graph layout, requires WebWorker for non-blocking layout on larger graphs. Sledgehammer for the 6-hop, 10-20 node case.

**Pick:** Hand-rolled — industry standard.

**Rationale:** The swimlane constraint eliminates 90% of what makes Sugiyama hard. Full Sugiyama's value is its crossing-minimization pass, which reorders nodes within layers to reduce inter-layer edge crossings. In a swimlane diagram, that reordering is forbidden — nodes can't move between swimlanes. The remaining freedom (within-lane X-ordering) reduces to topological sort, which is ~25 lines. Plus per-lane X assignment (10 lines), edge routing (15 lines), cycle collapse before sort (10 lines) = ~60-80 line layout function, zero new dependencies, matches the codebase's custom Canvas2D rendering pattern. d3-dag's maintenance-mode status adds dependency risk without capability gain for this constrained case.

**Consequences:** New file `src/main/flowTracer/flowLayout.ts` with pure functions, fully unit-testable without rendering. Future galaxy view (Wave 87) will need a different layout (force-directed) and that may justify pulling in a library — but Wave 85 layout stays standalone. Cycle handling is explicit (Kahn detects cycles when nodes remain after the topological pass) rather than implicit; the implementer collapses cycle participants into a single "badge" node before layout runs.

---

## Decision 3: Tree-sitter for AST scanning of IPC handler patterns

**Context:** The boundary registry needs to scan TypeScript source for `ipcMain.handle('channel', handler)` registrations and `window.electronAPI.X.Y(...)` bridge mappings. Multiple AST tools are available; the codebase has already chosen one for the existing graph indexer.

**Options considered:**

- *Industry standard:* Tree-sitter (via `web-tree-sitter` and `tree-sitter-wasms`). Already in `package.json`; used by the existing codebase-memory graph indexer. Fast, language-agnostic, and the modern industry-standard for code intelligence (used by GitHub, Sourcegraph, Cursor, Zed).
- *Emerging:* Reuse the existing graph (don't scan AST at all). The codebase-memory graph already indexes function calls; we could query it for `ipcMain.handle` callsite patterns via Cypher rather than re-running an AST scan.
- *Experimental:* `ts-morph` or `typescript-eslint/parser`. Stronger TypeScript-specific type info (resolves `ipcMain` to its `Electron.IpcMain` declaration), at the cost of being TS-only and significantly slower.

**Pick:** Tree-sitter — industry standard. (Plus opportunistic graph reuse where applicable.)

**Rationale:** The codebase already commits to Tree-sitter via the existing graph indexer; adding ts-morph would mean two AST libraries with overlapping responsibilities. Tree-sitter is fast enough for re-scanning on every file change (the graph indexer already does this). The "reuse the existing graph" alternative is appealing — the boundary registry can query the graph for `Function` nodes whose name matches `ipcMain.handle` and read the first argument's value — but this requires the graph to capture call-argument values, which it currently doesn't fully. A pragmatic path: where the graph already has the data, query it; where it doesn't, supplement with a targeted Tree-sitter scan limited to `src/main/**/*.ts` (the only place IPC handlers live).

**Consequences:** The Phase 2 implementer must understand both Tree-sitter query syntax and the existing graph schema. The Phase 2 acceptance criteria require the registry to be complete — not finding all `ipcMain.handle` calls is a Phase 2 fail. Tree-sitter scan time is bounded by the file count in `src/main/**/*.ts` (~150 files), runs at startup + on file change, expected ~50-200ms total — acceptable.

---

## Decision 4: LLM tool-call (single Haiku CLI invocation) for natural-language → symbol resolution

**Context:** The user types a query like "when I click send" — the system must resolve this to a starting symbol (button click handler, IPC handler, etc.) so the trace engine can begin. Three architectural patterns exist for this problem in 2025-2026.

**Options considered:**

- *Industry standard:* Embedding-based RAG. Pre-compute embeddings for symbol names + code snippets at index time; cosine-similarity search at query time; LLM rerank for top-K. Used by Cursor, Continue.dev, Sourcegraph Cody (until 2024).
- *Emerging (and the correct pick under our constraints):* LLM tool-call with bounded candidate list. At index time, extract UI event handler + IPC handler candidates from the existing graph (~30-80 entries for Agent IDE). At query time, send `{ query, candidates }` in one Haiku CLI call asking for top-5 ranked JSON. Confidence threshold disambiguation. Aligns with CODEXGRAPH (NAACL 2025) and Sourcegraph's 2024 trajectory move away from embedding APIs for Cody.
- *Experimental:* Local embedding model (e.g., `bge-small-en` via `@huggingface/transformers` in Node.js). ~150MB node_modules addition; ~150-300ms cold inference per query.

**Pick:** LLM tool-call with bounded candidate list — emerging best practice.

**Rationale:** Two reasons converge on the same pick. First, the auth constraint (Max subscription, no API key) forbids embedding API calls; a local embedding model adds 150MB of dependencies for marginal benefit on a bounded candidate set. Second — and more importantly — the technical merits favor this approach for *this specific problem*. When the candidate set is bounded (not millions of symbols), structured candidate-list + LLM reasoning outperforms embedding similarity because the LLM can reason about user intent ("what is the user really asking?") and project-specific naming conventions ("`handleSubmit` is what we call submit handlers") in ways that cosine similarity over identifiers cannot. The CODEXGRAPH paper confirms this; Sourcegraph's 2024 architectural shift confirms it; the bounded-candidate count for Agent IDE (~30-80) fits comfortably in a single Haiku prompt.

**Consequences:** Phase 5 builds the index-time candidate extraction (reuses `search_graph` patterns from `repoMapGeneratorGraph.ts`). Phase 6 builds the resolver — a single `spawnClaude` call with JSON output, top-5 ranked. Disambiguation UI in renderer when confidence < 0.8. No embedding infrastructure, no vector index. Cross-project waves (Wave 88 Contractor App, Wave 89 Gamify) will have larger candidate sets — if those exceed Haiku's context budget, that's the moment to introduce embedding pre-filtering. Wave 85 doesn't need it.

---

## Decision 5: Hybrid narration cache — per-symbol What+How (index-time) + per-flow Why (render-time)

**Context:** The narration generator needs to produce three fields per step (What / Why / How) with high pedagogical quality at acceptable latency. Two extreme patterns exist; hybrid is also possible.

**Options considered:**

- *Industry standard:* Per-step prompts with batching. One CLI call per symbol for each of What/Why/How. Highest accuracy per step, highest latency, fully cacheable. The pattern `moduleSummarizer.ts` uses for module summaries.
- *Emerging:* Whole-flow prompt. One CLI call per flow render with the full chain as context, asking Haiku to write all three fields for all steps in one JSON array. Lower latency, but per-step output quality degrades observably as the flow grows beyond ~5 steps.
- *Experimental:* Hybrid — pre-compute What+How per symbol at index time; generate Why per-flow with full chain context at render time. Cache per-symbol What+How by `symbolHash`; cache per-flow Why by `flowId`.

**Pick:** Hybrid — experimental but pedagogically optimal.

**Rationale:** The user's explicit goal is "most digestible." This is a quality-over-latency call. The What and How fields are *symbol-intrinsic* — they don't change based on which flow contains the symbol. Pre-computing them once per symbol at index time and caching by `symbolHash` is correct and matches the existing `moduleSummarizer.ts` pattern. The Why field is *flow-extrinsic* — its best answer requires knowing the causal chain the step sits in. The same function's "why does this exist" reads differently in a chat-send flow vs. a file-save flow. Generating Why fresh per flow render with the full chain as context produces meaningfully better pedagogy than per-symbol Why caching could. Per-step Why CLI calls (N calls per render) would multiply latency without quality gain; whole-flow prompts produce blander per-step text. The hybrid is the third option that gets pedagogical quality + cache hit rate + bounded latency.

**Consequences:** Two cache files: `narration-cache/<symbolHash>.json` (What+How, persistent across flows) and `flows/<flowId>-why.json` (Why, per-flow, optionally cached). Phase 3 builds the symbol-level cache. Phase 4 builds the flow-level Why generator with chain-context prompt assembly. The Phase 4 implementer treats the prompt assembly as the most careful prompt-engineering task in the wave — wrong prompt shape = bland Why output = pedagogical failure. Risk: confidence is high on the cache structure, medium on the per-flow Why granularity. The implementer should A/B per-flow Why against per-step Why on a real flow before locking the contract; if quality is comparable, per-step is simpler.

---

## Decision 6: Centre-pane special view, no right-sidebar mini-tracer in Wave 1

**Context:** The Flow Tracer's UI surface needs a home in the IDE shell. Three candidate locations exist: centre pane (where editor + special views live), right sidebar (where chat + monitor + git + analytics + memory + rules live), or full-screen overlay (breaks IDE conventions).

**Pick:** Centre pane special view, registered like `ContextBuilder`, `TimeTravel`, `GraphPanel`. Mini-tracer in right sidebar deferred to Wave 86.

**Rationale:** The Flow Tracer's swimlane diagram is wide (6 lanes) and tall (variable depth). The right sidebar's default 300px width is too narrow for the swimlane render at any reasonable zoom level. Centre pane is the natural fit and matches the established pattern for stateful inspection views. The mini-tracer in the right sidebar (showing the current file's outgoing flows) is a useful Wave 86 polish — a tiny version of the Flow Tracer that floats next to the chat — but it requires the Wave 85 trace engine to exist and works as a polish rather than a primary entry surface.

**Consequences:** New `'flow-tracer'` entry in the `SpecialViewType` enum (`src/renderer/components/Layout/EditorTabBar.tsx`); `resolveSpecialViewContent` switch case in `CentrePaneConnected.parts.tsx`; DOM event listener (`agent-ide:open-flow-tracer`) in `CentrePaneConnected.wiring.tsx`. Three entry points: Command Palette (`flow-tracer:browse-flows`, `flow-tracer:search`), main menu (`View → Flow Tracer`), and a button on the right-sidebar chat ("Trace this conversation's last action"). Right-sidebar mini-tracer scheduled for Wave 86.

---

## Decision 7: Honeycomb test shape for Wave 85

**Context:** Per `~/.claude/notes/wave-process.md` "Test shape doctrine," waves where the dominant complexity is layer interactions (IPC, sync, cross-package) default to honeycomb (boundary tests dominate, unit tests for genuinely standalone logic, manual smoke as third leg). Wave 85 is exactly this shape.

**Pick:** Honeycomb. Boundary tests carry the bulk of test budget.

**Rationale:** The Wave 85 boundaries are real failure points: renderer ↔ preload ↔ main ↔ CLI subprocess. A unit test of `traceEngine.ts` can pass while the full IPC contract is broken — the unit test mirrors the implementation and inherits its mental model. A boundary test exercises the actual seam (renderer fires `traceFlow`, main computes, renderer renders). This is the test shape Gamify Wave 1 Phase 5 (referenced in `wave-process.md`) needed and didn't have.

**Consequences:** Per the test-coverage table in the wave plan: Phase 1 ships one end-to-end smoke test as the load-bearing test (boundary contract round-trip). Phases 2-7 each ship unit tests for pure logic (Tree-sitter pattern matchers, hash invalidation, layout algorithm) AND integration tests for boundary behavior. CLI subprocess calls are mocked in tests (canned JSON responses) — real Haiku calls are not run in CI; quality is validated at manual smoke. Phase 8 wave wrap runs `test:main`, `test:renderer`, `test:ipc` (scoped per `~/.claude/rules/test-scope.md`), then `/review`.

---

## Decision 8: Per-phase commits, single push at wave wrap

**Context:** User-memory entry (`feedback_wave_push_policy.md`) records the standing preference: subagents commit per phase locally; parent reviews aggregate diff and pushes once the wave is complete. This is repository-wide standing policy, not a Wave 85-specific decision.

**Pick:** Match the standing policy.

**Rationale:** Established preference from prior waves. Push policy is per-wave, not per-phase. Phase commits accumulate on a feature branch (`wave-85-flow-tracer`); one push at Phase 8 wave wrap after `/review` returns PASS. No deviation from the standing policy is appropriate for this wave.

**Consequences:** Orchestrator creates branch `wave-85-flow-tracer` before Phase 1. Each phase commits to the branch with conventional-commits format. Phase 8 pushes once, tags, and merges to master.

---

## Decision 9: Trace depth limit default

**Context:** The trace engine traverses outbound call edges from the entry point. Without a depth cap, deep flows produce visual noise and risk infinite cycles (cycles are detected and collapsed, but the depth cap is a separate guardrail).

**Options considered:**

- *Industry standard:* 6 hops. Sequence-diagram tools (Mermaid, PlantUML, draw.io) typically cap at 5-8 hops because human readers lose causal track beyond that. 6 covers the deepest realistic Agent IDE flow (renderer click → state → IPC → main → orchestrator → CLI → return = ~6-8 distinct call hops within layers).
- *Emerging:* Adaptive — limit by visual screen budget rather than fixed hop count. Complex to implement; uneven results.
- *Experimental:* Always full-depth, render in a scrollable overflow region. Risks producing 30+ step diagrams that defeat the pedagogical purpose.

**Pick:** 6 hops — industry standard. Configurable via renderer setting `flowTracer.maxDepth` so power users can extend.

**Rationale:** 6 hops covers the Agent IDE's deepest realistic flows; below 6 means truncating real flows mid-causal-chain (broken pedagogy); above 6 means diminishing returns and visual clutter. Configurable via setting hedges against being wrong — the user can experiment in v2.16+ if needed.

**Consequences:** `flowTracer.maxDepth` added to `configSchemaTail.ts` with default 6, range 3-12. Phase 2 implementer validates the setting on each trace request; truncated flows render with "→ continues, depth limit reached" badge on the last step (per spec §6).

---

## Decision 10: Saved-flow git-tracking default

**Context:** Saved flows persist to `<workspaceRoot>/.ouroboros/flows/<flowId>.json`. The `.ouroboros/` directory is already in `.gitignore` (verified at line 75). Question: is local-only the right default, or should saved flows be shareable via git by default?

**Options considered:**

- *Industry standard:* Keep `.gitignore` rule; saved flows are local-only by default. Add a `flowTracer.saveSharedFlows` setting — when enabled, write shared flows to `.ouroboros-shared/` (NOT in gitignore) so the user can intentionally check them in.
- *Emerging:* Auto-detect "this looks like a tour-quality flow" and prompt the user to commit (Sourcegraph-style "share this insight" pattern).
- *Experimental:* Auto-commit canonical flows the AI thinks are educational. Highest risk of cluttering the repo with churn.

**Pick:** Industry standard — `.gitignore` rule stays; add `flowTracer.saveSharedFlows` opt-in setting (default `false`).

**Rationale:** Saved flows are personal artifacts during normal development (the user is exploring their own codebase). Auto-checking-in produces noise. The opt-in path serves the rare "this flow is educational; share it with the team" case explicitly. Default-off keeps the working tree clean; users who want to share flows explicitly enable the setting.

**Consequences:** No change to `.gitignore`. New setting `flowTracer.saveSharedFlows: boolean` (default `false`). When `true`, flows write to `.ouroboros-shared/<flowId>.json`. Phase 7 implementer wires the setting; Mermaid export is unaffected (clipboard, not file).

---

## Decision 11: Phase 9 (symbol-search entry — option A from spec) deferred to Wave 86

**Context:** The original spec listed four entry-point UX options: A (symbol search), B (curated gallery), C (NL search), D (click-the-running-app). Brainstorming locked B + C for Wave 85 with A and D deferred. Phase 9 contingent: "if budget remains after Phase 7, fold in symbol-search."

**Options considered:**

- *Industry standard:* Defer A to Wave 86. Wave 85 ships gallery + NL search; symbol-search is the third entry surface that targets already-fluent developers (a smaller persona). Adding it risks scope creep on a wave already at 8 phases.
- *Alternative:* Include A as Phase 9, gated on Phase 7 finishing under budget. If Phase 7 ships clean and there's bandwidth, fold in. If not, defer to Wave 86.

**Pick:** OUT of Wave 85; defer to Wave 86.

**Rationale:** Symbol-search overlaps with VS Code's existing Cmd+T pattern, which experienced developers already know. The Wave 85 audience (vibe-coders learning their codebase) is better served by NL search and the AI-curated gallery — symbol-search is a power-user surface. Adding it would extend the wave's deliverables without proportionally serving the primary persona. Wave 86's polish budget is the right place; bundled with mini-tracer + click-to-trace polish, it's a coherent "advanced entry points" mini-wave.

**Consequences:** Phase 9 dropped from the wave plan. Wave 86 inherits the four polish items (symbol-search, click-to-trace, mini-tracer, vocabulary toggle).
