---
status: OPEN
created: 2026-05-08
updated: 2026-05-08
source_wave: 85
target_wave: 86
---

# Flow Tracer diagram is visually rudimentary

## What

Smoke run after Wave 85 ship surfaced that the swimlane render in `FlowCanvas` / `FlowTracerView.tsx:drawSwimlane` is a placeholder, not the design-spec rendering.

User feedback: *"The graph looks like an elementary project. It is just like, A circle with a number, and then a line to the next circle with a number, and then a line to another circle with another number. And all of them look identical."*

## Where it lives in the code

`src/renderer/components/FlowTracer/FlowTracerView.tsx` — functions `drawLanes`, `drawStepNodes`, `drawEdges`, `drawSwimlane` (lines 43-119). All Canvas2D, all hardcoded colors with `// hardcoded: canvas2d` comments.

## What the design spec called for (vs what shipped)

Per `docs/superpowers/specs/2026-05-08-flow-tracer-design.md` §4.2:

| Spec item | Shipped | Gap |
|---|---|---|
| Step boxes with layer color, symbol name, kind icon | Numbered circle (1, 2, 3 …) | No identification of what the step IS |
| Dashed arrows for async edges | All solid | Async vs sync indistinguishable |
| Solid arrows with note label for IPC boundary crossings | Solid orange line, no label | Boundary channel name not visible |
| Hover step → highlight + side panel locks to it | Hover wired (Phase 3/4) but visual hover-state on the canvas itself missing | Mouse-over the canvas does nothing |
| LOD + viewport culling matching `GraphCanvas.tsx` | Full redraw every render | Will scale poorly past ~30 steps |
| CSS-custom-property color resolution | Hardcoded hex (`#4f8`, `#888`, `#f59e0b`) | No theme support; canvas2d stays fixed across light/dark |
| Layer-color-coded swimlane backgrounds | One faint white-on-dark fill for all lanes | Lanes indistinguishable visually |

## What "fixed" looks like

A swimlane diagram where:
- Each step renders as a labeled rounded rectangle (not a circle): `[layer-color] symbol(args)` truncated to fit, with a small kind glyph (function / spawn / fs / ipc-bridge / ipc-handler).
- Lane backgrounds use the existing layer color tokens (`var(--layer-renderer-bg)` etc. — define in `tokens.css` if absent).
- Async edges render dashed; boundary edges render with the channel name as a midpoint label.
- Hover on the canvas highlights the step (pulses the box) AND scrolls the StepInspector to that step. Currently inspector is hover-driven via the StepList; canvas hover is unwired.
- LOD: when the diagram exceeds the viewport, render only the visible band; reuse the GraphCanvas.tsx pattern.

## Why this didn't ship in Wave 85

Phase 1's brief explicitly said "hardcoded positions are acceptable for the walking skeleton — DO NOT implement the topological-sort layout algorithm yet." The implementer correctly stopped at minimum-viable; subsequent phases focused on data layer (boundary registry, narration, persistence, NL search) and never came back to the rendering. The wave plan didn't budget a "visual polish" phase.

## Suggested home

Wave 86 — Flow Tracer Polish, alongside the other deferred items (mini-tracer, click-to-trace, vocabulary toggle, symbol-search entry, the trace-engine quality issues filed as siblings in `2026-05-08-flow-tracer-trace-engine-quality.md`).

## Effort estimate

~1-2 days. The Canvas2D scaffold is in place; the work is replacing the placeholder draw functions with proper rendering and wiring layer-color tokens. The hand-rolled swimlane-constrained layout (Decision 2 in the wave-85 ADR) was deferred to "if needed" — for Wave 85's scale (≤6 hops) the sequential-X layout is sufficient; visual polish is the higher leverage.
