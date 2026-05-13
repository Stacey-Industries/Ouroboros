---
title: Flow Tracer — Wave 1 Design
status: DRAFT
created: 2026-05-08
updated: 2026-05-08
initiative: an-ide-that-teaches-you
wave: 1 of 3
---

# Flow Tracer — Wave 1 Design

## 1. Context: The "IDE That Teaches You" Initiative

Agent AI removes the labor of typing code, but it does not close the comprehension gap. A user who relies on an agent to write code still needs to understand that code well enough to ship it, debug it, evolve it, and grow as an engineer. Today's agent-first IDEs (Cursor, Windsurf, Copilot) leave this gap entirely to the user.

This initiative repositions the Agent IDE around closing that gap explicitly: **an IDE whose core job is to teach you what's happening to your code.** The agent is your hands; the IDE is your interpreter. The user grows alongside the codebase.

Three modes serve this goal from different angles:

| Mode | Question it answers | Wave |
|---|---|---|
| **Flow Tracer** | "What happens when X?" — causal/temporal | **1 (this spec)** |
| **Inline captions + diff narrator** | "What is *this*, right where I'm looking?" | 2 |
| **Galaxy Map (with cross-linking)** | "How is the codebase laid out?" — spatial | 3 |

The modes cross-link: a galaxy node opens a tracer for flows starting from that file; a tracer step opens the file with its caption already up. Three doors into the same learning surface. This spec covers Wave 1 only — Flow Tracer as a standalone, fully usable feature.

## 2. What Wave 1 Ships

A new view in the IDE's centre pane that, given a starting moment ("when I send a chat message"), renders the complete causal chain through every layer of the running app — User → Renderer → Preload → Main → Claude CLI → Filesystem — with AI-written What/Why/How annotations on each step.

The user enters via either:
- A **gallery** of 8-15 AI-curated canonical flows for the current project, OR
- A **natural-language search bar** ("when I click send")

The user exits with: a clear, navigable, narrated picture of how a single user-facing action propagates through the entire stack.

## 3. Locked Product Decisions

### 3.1 Scope: Agent IDE only
Wave 1 ships for Agent IDE exclusively. Contractor App and Gamify are deferred to later waves so we can validate the UX on a project where we already know the boundary patterns (Electron IPC) before generalizing to Web HTTP, React Native sync, or other transports.

### 3.2 Entry points: Gallery + Natural-Language only
- **B — Curated AI-suggested gallery:** primary surface for browsing.
- **C — Natural-language search:** primary surface for asking.
- **A — Symbol-search entry:** deferred to Wave 2 (low marginal cost; can fold in if cheap).
- **D — Click-the-running-app entry:** deferred to Wave 2 (requires runtime instrumentation).

### 3.3 Sequencing
Wave 1 is standalone. It must be fully usable on its own — no dependence on inline captions (Wave 2) or galaxy (Wave 3) for any core flow.

## 4. User Experience

### 4.1 Where it lives in the IDE shell

**Centre pane special view**, mounted via the existing `CentrePaneConnected` pattern that hosts ContextBuilder, TimeTravel, Settings, etc. (See `src/renderer/components/Layout/CentrePaneConnected.tsx`.)

Opens via:
- Command Palette: `Flow Tracer: Browse Flows`, `Flow Tracer: Search`
- Main menu: `View → Flow Tracer`
- Right sidebar chat: `Trace this conversation's last action` button (when chat just produced an agent edit)

DOM event: `agent-ide:open-flow-tracer` (matching existing `agent-ide:open-context-builder` etc.). Closing the tab closes the view; reopening a saved flow restores its trace from disk.

A mini-tracer in the right sidebar (showing the current file's outgoing flows) is a Wave 2 polish.

### 4.2 The viewing experience

Layout (left to right):
- **Swimlane labels** (140px) — User, Renderer, Preload, Main, Claude CLI, Filesystem. Color-coded per layer.
- **Flow canvas** (fluid) — step boxes connected by arrows. Solid arrows = sync calls; dashed = async/boundary crossings. Hover any step to highlight; click to lock the side panel.
- **Side panel** (280px, right) — "Inspecting step N", with `What / Why / How` blocks and an `Open file / Trace deeper / Explain in chat` action row.
- **Top bar** — title, layer/boundary count, search input, scope pill.
- **Bottom bar** — depth toggle (Surface only / Through async boundaries / Down to FS), trace metadata.

Visual reference: the v2 mock pushed during brainstorming (`flow-tracer.html`).

### 4.3 Entry surface 1: Gallery

When opened with no flow selected, the centre-pane view shows a gallery of canonical flows pre-computed for the current project. Each tile shows:
- Title ("When I send a chat message")
- Layer badges (which layers this flow crosses)
- Step count
- "Last regenerated N days ago"

Click a tile → trace renders.

Gallery is generated once per project at index time via a Claude CLI call (see § 5.2). Refreshable via a header button. Stored at `<project>/.ouroboros/canonical-flows.json`.

### 4.4 Entry surface 2: Natural-language search

A search input in the top bar accepts plain-English queries:
- "when I click send"
- "what happens when I save settings"
- "how does the file tree refresh"

The query is resolved to a starting symbol via a Claude CLI call given (a) the query, (b) the project's entry-point candidates (UI event handlers + IPC handlers indexed at project load), (c) up to 5 most-likely matches.

If resolution is unambiguous (top match has high confidence) → trace renders immediately.
If ambiguous → disambiguation list shown; user picks the right entry point.
If no match → empty state with "browse the gallery instead" CTA.

## 5. Technical Design

### 5.1 Trace computation

Four computational layers operating on the existing codebase-memory graph (~18.3K nodes, ~13.2K edges, auto-synced).

#### Layer 1 — Static call chain
Use `trace_call_path(symbol, direction='callees')` from the entry symbol. Build a tree of outbound calls.
- Depth-limited to 6 hops in Wave 1 (deeper = cycles + noise).
- Cycle detection: collapse repeated paths, badge with "repeats X times, click to expand."

#### Layer 2 — Boundary detection
Pattern-match nodes against known boundary signatures:
- **Renderer → Preload:** call expression of shape `window.electronAPI.<namespace>.<method>(...)` → marks the call as a *bridge boundary*.
- **Preload → Main:** call expression `ipcRenderer.invoke(<channel>, ...)` → marks as an *IPC boundary* with the channel string captured.
- **Main entry:** registration `ipcMain.handle(<channel>, <handler>)` → indexed into the **boundary registry**.
- **Main → CLI:** `child_process.spawn(...)`, `execFile(...)`, `spawn(...)` from `node-pty` etc. → marks as *subprocess boundary*; subprocess is treated as terminal (no further trace).
- **Main → Filesystem:** `fs.writeFile`, `fs.readFile`, `fs.promises.X` → marks as *FS boundary*; rendered with the path argument when statically resolvable.

Each boundary is rendered as a swimlane crossing in the visual layer.

#### Layer 3 — Boundary resolution (the magic)
At index time, build a **boundary registry**:

```typescript
type BoundaryRegistry = {
  preloadBridge: Map<string, { channel: string; symbol: string }>;
    // window.electronAPI.flowTracer.traceFlow → { channel: 'flow-tracer:trace-flow', ... }
  ipcMainHandlers: Map<string, { symbol: string; file: string; line: number }>;
    // 'flow-tracer:trace-flow' → handler symbol
};
```

When a trace hits a `window.electronAPI.X()` call: look up the bridge → get the channel → look up the main handler → continue trace from there. Two-step resolution.

The registry is rebuilt whenever the codebase graph re-indexes (auto-syncs on file changes).

#### Layer 4 — Async detection
- `await X()` and `.then(...)` → rendered with dashed-arrow style (non-blocking edge).
- Promise-returning IPC calls → marked async by default.
- DOM event listeners (`addEventListener`, `EventEmitter.on`) and observer patterns (`MutationObserver`, etc.) → **deferred to Wave 2**. In Wave 1, these appear as terminal points with a "→ event-driven, see Wave 2" badge.

### 5.2 Narration generation — auth-constrained

**Hard constraint:** the user is on Max subscription with no API key. Per memory and project conventions, narration must use the `spawnClaude` CLI subprocess pattern, not direct Anthropic API calls.

**Strategy: hybrid cache.**

#### Pre-compute at index time
When the codebase graph indexes a project (initial index or large delta), batch-generate What/Why/How for each meaningful symbol:
- Batch ~50 symbols per CLI invocation to amortize startup cost.
- Cache to `<project>/.ouroboros/narration-cache/<symbolHash>.json`.
- Symbol hash = SHA1 of `{file, line, body}` so any code change invalidates.

#### Lazy regeneration on file change
File watcher detects changes → invalidate cache for affected symbols. Re-generation is lazy: don't pre-compute proactively, wait until the next view.

#### On flow render
For each step in the trace:
- Cached narration fresh? → render immediately.
- Cached narration stale? → render the stale version with a "regenerating…" indicator, kick off a CLI call, swap in the new one.
- No cache? → render placeholder ("generating description…"), kick off CLI call.

Narration never blocks the trace render. Failed CLI calls render as "couldn't write description, retry?" with no impact on adjacent steps.

#### Vocabulary level
"Intermediate developer" by default in Wave 1. Beginner/expert toggle deferred to Wave 2.

#### Three fields per step
- **What** — 1-2 sentences. The function's role. *("The submit handler that fires when you press Enter or click Send.")*
- **Why** — 1-2 sentences. What would break without it; what design constraint forced it. *Most pedagogical — names the invariant the user couldn't have guessed.* *("The renderer can't talk directly to the Claude CLI — Electron's security model isolates it. handleSubmit is the boundary.")*
- **How** — 3-5 lines. Mechanism in plain English, optionally with key identifiers in code-formatted spans.

### 5.3 Architecture: three-process split

#### Main process — `src/main/flowTracer/`
- `traceEngine.ts` — trace computation (Layers 1-4 above)
- `boundaryRegistry.ts` — IPC handler indexing, bridge mapping
- `narrationCache.ts` — narration cache, lazy invalidation, CLI invocation
- `canonicalFlows.ts` — gallery generation, NL→symbol resolution
- `flowPersistence.ts` — save/load flow JSON to `<project>/.ouroboros/flows/`
- `index.ts` — module barrel; registers IPC handlers via `src/main/ipc-handlers/flowTracerHandlers.ts`

#### Preload bridge — `src/preload/preload.ts`
New surface on `window.electronAPI.flowTracer`:
```typescript
flowTracer: {
  traceFlow(entry: { symbol: string; file: string; line: number }): Promise<FlowTrace>;
  resolveNaturalLanguage(query: string): Promise<{ matches: EntryPointCandidate[]; confidence: number }>;
  getCanonicalFlows(): Promise<CanonicalFlow[]>;
  regenerateGallery(): Promise<CanonicalFlow[]>;
  getNarration(symbolHash: string): Promise<Narration>;
  saveFlow(flow: FlowTrace, title: string): Promise<{ id: string }>;
  listSavedFlows(): Promise<SavedFlowSummary[]>;
  loadFlow(id: string): Promise<FlowTrace>;
  exportMermaid(flow: FlowTrace): Promise<string>;
}
```

Type contract added to `src/renderer/types/electron.d.ts` (single source of truth).

#### Renderer — `src/renderer/components/FlowTracer/`
- `FlowTracerView.tsx` — top-level centre pane view; switches between gallery / search / trace render.
- `FlowGallery.tsx` — tile grid for canonical flows.
- `FlowSearchBar.tsx` — NL search input with disambiguation dropdown.
- `FlowCanvas.tsx` — swimlane layout + arrows; SVG rendering for Wave 1 (Canvas/WebGL is a Wave 3 polish if needed).
- `FlowSidePanel.tsx` — What/Why/How aside.
- `FlowLayerControls.tsx` — bottom bar (depth, layer toggles).
- `useFlowData.ts` — hook orchestrating IPC calls and state.

DOM event listener for `agent-ide:open-flow-tracer` registered in `CentrePaneConnected`.

### 5.4 Data model

```typescript
type FlowTrace = {
  id: string;
  title: string;                   // "When I send a chat message"
  entryPoint: SymbolRef;
  steps: FlowStep[];
  edges: FlowEdge[];
  generatedAt: number;             // epoch ms
  graphVersion: string;            // for cache invalidation
  metadata: { layerCount: number; boundaryCount: number; depthCapHit: boolean };
};

type FlowStep = {
  id: string;
  layer: 'user' | 'renderer' | 'preload' | 'main' | 'cli' | 'filesystem';
  symbol: string;                  // qualified name
  file: string;                    // project-relative path
  line: number;
  kind: 'function' | 'spawn' | 'fs' | 'ipc-bridge' | 'ipc-handler';
  narration: { what: string; why: string; how: string } | { stale: true } | null;
};

type FlowEdge = {
  from: string;                    // step id
  to: string;
  kind: 'sync' | 'async' | 'boundary';
  boundaryChannel?: string;        // populated for IPC boundaries
};

type CanonicalFlow = {
  title: string;
  entryPoint: SymbolRef;
  estimatedSteps: number;
  layers: LayerKind[];
};

type EntryPointCandidate = {
  symbol: SymbolRef;
  reason: string;                  // why the AI thinks this matches the query
  confidence: number;              // 0..1
};
```

### 5.5 Persistence

- **Saved flows:** `<project>/.ouroboros/flows/<flowId>.json`
- **Narration cache:** `<project>/.ouroboros/narration-cache/<symbolHash>.json`
- **Canonical flow gallery:** `<project>/.ouroboros/canonical-flows.json`
- **Boundary registry:** in-memory only, rebuilt on graph re-index (no disk cache; cheap to rebuild)

`.ouroboros/` should be added to `.gitignore` if not already (similar to `.superpowers/`). User-saved flows MAY be checked in if the user wants to share them; subdirectory split (`flows/shared/` vs `flows/local/`) deferred to a later wave if needed.

Mermaid export produces a sequence diagram suitable for embedding in markdown docs.

## 6. Failure Modes

| Failure | Visual treatment | User recovery |
|---|---|---|
| NL resolution ambiguous | Disambiguation list of top 5 candidates with confidence + reason | Pick one |
| NL resolution no match | Empty state with "Browse gallery" CTA | Switch surface |
| Trace cycle detected | Collapse with "repeats X times, click to expand" badge | Click to expand |
| Trace depth-cap hit | Last step rendered with "→ continues, depth limit reached" badge | Click "Trace deeper" to extend |
| Boundary unresolved (channel not in registry) | Render terminal "→ unknown handler" with link to boundary file | Refresh registry, or report bug |
| Narration CLI call fails | "couldn't write description, retry?" inline button on the step | Click retry |
| Subprocess boundary | Render terminal "→ Claude CLI (external)" — no further trace | (intentional) |

Trace render NEVER blocks on narration. Trace render NEVER blocks on a single failed step.

## 7. Testing Strategy

### Unit tests (`src/main/flowTracer/*.test.ts`)
- `traceEngine` — boundary detection patterns (every layer's signature), depth limiting, cycle collapsing
- `boundaryRegistry` — bridge → channel resolution, channel → handler resolution, registry rebuild
- `narrationCache` — hash invalidation, stale detection, lazy regeneration triggers
- `canonicalFlows` — gallery refresh, NL resolution disambiguation logic

### Integration tests
- IPC contract end-to-end: renderer fires `traceFlow` → main computes → renderer renders the returned `FlowTrace` shape
- Persistence: save flow → list → load → re-render produces identical visual output

### Snapshot tests
- Layout stability: known flows render with stable step positions across re-renders (catch unintended layout drift)

### Manual smoke gate (per `~/.claude/rules/manual-smoke-gate.md`)
Wave touches `src/renderer/components/Layout/**` (centre pane integration) → smoke checklist required:
- Open Flow Tracer via menu, palette, and chat button — all three paths work
- Gallery loads with at least 5 canonical flows for the current project
- Click a gallery tile → trace renders within 2s
- NL search "when I send a chat message" → trace renders or disambiguation list appears
- Hover any step → side panel updates with What/Why/How
- Click "Open file" → editor opens to the symbol's line
- Save a flow → reopen later → identical render
- No console errors on any path

### What is NOT tested
- Narration *quality* — that's a manual eval, not an automated test
- Cross-project portability (Contractor App, Gamify) — those are separate waves
- Performance under deeply recursive call chains beyond 6 hops — depth-capped intentionally

## 8. Out of Scope (Wave 1)

Explicitly deferred so the wave does not bloat:

- **Cross-project support.** Contractor App (HTTP boundary, Postgres DB queries) and Gamify (React Native + Supabase sync) come in separate waves.
- **Click-the-running-app entry (D).** Requires renderer instrumentation to capture user clicks and resolve them to event handlers. Wave 2.
- **Symbol-search entry (A).** Cheap to add; folded in only if a phase ends with budget. Otherwise Wave 2.
- **DOM event-listener async tracing.** `addEventListener`, observer patterns. Wave 2.
- **Performance / timing data.** The "p50 ~830ms · 0 errors" footer in mockups was fictional. Real timing requires runtime instrumentation. Wave 3.
- **Test → source flows.** "When this test runs, what does it exercise?" — useful but separate. Wave 3.
- **DB query tracing.** Agent IDE has no DB; relevant for Contractor App / Gamify waves.
- **Beginner/expert vocabulary toggle.** Wave 2.
- **Mini-tracer in right sidebar.** Wave 2 polish.
- **Galaxy cross-link.** Requires Wave 3 to exist.
- **Inline captions integration.** Requires Wave 2 to exist; cross-link added then.
- **`ai/vision.md` / positioning copy update.** This spec captures the framing; updating product copy is a half-session task that runs alongside or after Wave 1, not blocking it.

## 9. Estimated Wave Size

**~7-9 phases.**

| Phase | Scope |
|---|---|
| 1 | Boundary registry + indexer (main process) |
| 2 | Trace engine: static chain + boundary resolution |
| 3 | Narration cache + Claude CLI integration |
| 4 | Canonical flow gallery generation + NL resolution |
| 5 | Renderer scaffolding + centre pane integration |
| 6 | FlowCanvas (swimlane render) + FlowSidePanel |
| 7 | Persistence + Mermaid export |
| 8 | Manual smoke + polish + accessibility |
| 9 (contingent) | Symbol-search entry (A) if budget remains |

Per `~/.claude/rules/walking-skeleton-first.md`: Wave 1 introduces a new architectural surface (the boundary-resolution seam between main and renderer for trace computation), so Phase 1 should be scoped as a walking skeleton — thinnest end-to-end slice that runs ONE flow end-to-end before any further phase work begins.

## 10. References

- **Brainstorming origin:** brainstorming session 2026-05-08 (this spec is its output).
- **Visual mock:** `.superpowers/brainstorm/40861-1778218403/content/flow-tracer.html` — final v2 design used as the visual reference.
- **Existing graph panel (Wave 29):** `src/renderer/components/Layout/GraphPanel/` — substrate for Wave 3 galaxy.
- **Codebase memory graph:** `src/main/codebaseGraph/` — provides `trace_call_path`, `search_graph`, `get_code_snippet`.
- **Centre pane special-view pattern:** `src/renderer/components/Layout/CentrePaneConnected.tsx` — template for view registration.
- **IPC contract source of truth:** `src/renderer/types/electron.d.ts`.
- **Manual smoke rule:** `~/.claude/rules/manual-smoke-gate.md`.
- **Walking skeleton rule:** `~/.claude/rules/walking-skeleton-first.md`.
- **Auth constraint:** narration must use `spawnClaude` CLI pattern (Max subscription, no API key).

## 11. Open Questions (to resolve in `/wave-plan`)

- Exact phase split — section 9 is an estimate; `/wave-plan` produces the canonical phase list.
- Whether Phase 1 (boundary registry) and Phase 2 (trace engine) should merge into a single phase, since the registry has no consumer until the engine exists.
- Whether the canonical-flow gallery generation should happen automatically on first project open or require an explicit user action.
- Whether to support flows that *start* in main (e.g., "when a hook fires") in addition to user-initiated flows.

These are not blockers for spec approval; they're tactical and resolved during `/wave-plan`.
