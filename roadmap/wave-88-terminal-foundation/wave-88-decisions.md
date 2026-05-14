---
status: IN-PROGRESS
created: 2026-05-13
updated: 2026-05-13
---

# Wave 88 — Architecture Decisions

Per `~/.claude/rules/best-practice-spectrum.md`. One section per locked decision.

## Decision 1: xterm.js WebGL addon load order

**Context:** `useTerminalSetup.lifecycle.ts:73-84` loads `@xterm/addon-webgl` BEFORE `term.open()` per a CLAUDE.md gotcha citing "the VS Code pattern" to avoid double-cursor rendering. Research against current xterm.js v6 documentation (2026-05-13) confirms the double-cursor issue was retired upstream — the current recommended pattern is load AFTER `term.open()`.

**Pick:** Load AFTER `term.open()` per v6 upstream guidance — **industry standard**.

**Rationale:** Upstream guidance is canonical. The old "VS Code pattern" predates v6's WebGL cursor integration. Keeping the inverted pattern increases divergence from documented behavior and risks subtle rendering issues as we upgrade addon versions.

**Consequences:** CLAUDE.md gotcha entry must be updated to reflect the new pattern. Phase 1 includes the swap. Source: `@xterm/xterm` v6 docs (load-order example block in Context7 results, 2026-05-13).

## Decision 2: Cell-dimensions API access pattern

**Context:** `CommandBlockOverlayBody.tsx` reaches into `term._core._renderService.dimensions.css.cell.height` (private xterm internal) for overlay positioning. Initial research pointed at `terminal.dimensions.css.cell.{width,height}` as a public v6 API, but Phase 1 implementation found that property is NOT present in `@xterm/xterm` v6.0.0 type definitions (likely aspirational in forward-looking docs, not landed in the shipped 6.0.0 surface).

**Options considered:**

- *Industry standard:* `terminal.dimensions.css.cell` public property — turned out to be unavailable in v6.0.0.
- *Emerging best practice:* DOM-based calculation — `element.clientHeight / rows` reads observable layout state without touching xterm internals.
- *Experimental:* Wait for a future v6.x with the public dimensions property — kicks the can.

**Pick:** DOM-based calculation (`element.clientHeight / rows`) — **emerging best practice**, the working v6.0.0 path.

**Rationale:** Goal of eliminating private API access is achieved without depending on an API that doesn't exist yet. The DOM approach reads what xterm has already rendered, which is the authoritative measurement.

**Consequences:** `getCellHeight` in `CommandBlockOverlayBody.styles.ts` now derives cell height from the rendered DOM. CLAUDE.md gotcha updated accordingly (subsystem CLAUDE.md line ~54). If a future xterm release ships a stable public dimensions API, revisit and prefer the public surface; until then, DOM calculation is correct.

## Decision 3: ChatOnlyShell terminal-tool bridge

**Context:** ChatOnlyShell perceived as a "different product" from IDE shell — partly because `getTerminalOutput` tool calls from the chat agent return empty when invoked in ChatOnly (`IdeToolBridge` is intentionally not mounted per Wave 42 design). Audit confirmed `IdeToolBridge` is NOT drop-in mountable: it depends on `useFileViewerManager()` (not in ChatOnly scope), falls back to first-registered terminal via `getTerminalLines(undefined)` (wrong semantics — leaks unrelated session output), and would double-handle queries with the IDE shell's bridge if both windows are open.

**Options considered:**

- *Industry standard:* Cross-window IPC delegation — query main-process router, route to active window (per `roadmap/deferred/cross-window-ide-tool-delegation.md`). Complex; defers Wave 88.
- *Emerging best practice:* Build scoped `ChatOnlyTerminalToolBridge` responding only to terminal queries from the ChatOnly window's own dock. Simpler; achieves user goal without main-process coupling.
- *Experimental / cutting-edge:* Unified bridge with shell-variant detection at runtime. Adds coupling, hides the architectural distinction.

**Pick:** Scoped `ChatOnlyTerminalToolBridge` — **emerging best practice**.

**Rationale:** Solves the user's pain (chat agent can read terminal output in ChatOnly) without the cross-window IPC complexity. Leaves IDE shell's bridge unchanged. Preserves Wave 42 design intent (chat-only has no file editor state) — the new bridge gracefully returns "unavailable" for file-viewer queries instead of throwing or returning empty.

**Consequences:** Two terminal-query bridges (one per shell). Need active-window routing or `targetWindowId` channel-level filter to avoid double-handle when both shells are open simultaneously. Phase 4 is the only cross-boundary phase in this wave; requires orchestrator-authored acceptance test per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`.
