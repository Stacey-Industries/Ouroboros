# Agent Chat Best Practices — Executive Summary

**Initiative:** Map the industry standard for agent-chat UX in IDEs and compare Ouroboros against it.
**Completed:** 2026-05-07
**Total research output:** 5,020 lines across 5 docs.

This is the entry point. Read this first; the four other docs are reference material the gap analysis was synthesized from.

---

## Doc map

| File | Lines | Purpose |
|---|---:|---|
| **`00-summary.md`** | this | Executive summary + bug-fix-wave punch list |
| `01-api-based-ides.md` | 1,440 | Survey of 11 API-based IDE chat tools (Cursor, Windsurf, Copilot, Kiro, Cline, Continue, Zed, Aider + v0, Bolt, Replit) |
| `02-cli-subscription-ides.md` | 479 | Survey of CLI-subscription tools (Claude Code, Piebald, Goose, OpenCode) — Ouroboros's closest peers |
| `02b-claude-code-terminal-deepdive.md` | 1,444 | Deep reference on Claude Code terminal UX + community gap-fill appendix |
| `03-coverage-matrix.md` | 456 | 64-axis × 15-tool coverage grid with per-axis observations |
| `04-ouroboros-gap-analysis.md` | 1,201 | Code-verified comparison of Ouroboros against the matrix, all 64 axes, with file:line citations |

---

## The headline finding

> Ouroboros is feature-complete at the architectural level but carries quality debt as PARTIAL bugs. Fixing the existing bugs is higher ROI than building new features — the AHEAD count would grow from 11 to 17+ if four already-filed bugs were closed, without writing a single line of new feature code.

| Verdict | Ouroboros | Mid-tier tool | Reading |
|---|---:|---|---|
| **AHEAD** | 11 (17.2%) | ~5-8% | Strong differentiation; near Copilot's level |
| **MATCHES** | 37 (57.8%) | ~40-50% | Industry-standard coverage |
| **BEHIND** | 5 (7.8%) | ~15-25% | Below mid-tier — deliberate gaps |
| **PARTIAL** | **9 (14.1%)** | ~10-15% | **The actionable category — bugs on shipped features** |
| **ABSENT** | 2 (3.1%) | ~10-20% | Unusually low |
| **N/A** | 0 | ~5-15% | — |

The PARTIAL cluster is the unusual profile. In most tools PARTIAL means "half-implemented." In Ouroboros's case it means **"implemented and shipped, but a known bug breaks the user-visible behavior."** That re-frames the bug-fix wave: it's not catching up to the field, it's making the work that's already done actually deliver.

---

## Four bugs hide six AHEAD verdicts

The single highest-leverage finding from the gap analysis:

| Bug (filed 2026-05-07) | Axes hidden | If fixed |
|---|---|---|
| `context-preview-rules-disappear-after-chat-start` | #19 (popover discreteness), #20 (per-entry disable), #33 (per-rule disable toggle), #35 (memory inline preview) | Four AHEAD verdicts realized; transparency story complete |
| `full-review-artifact-pane-empty` | #42 (side-panel diff review) | PARTIAL → MATCHES; diff review usable |
| `chat-streaming-freezes-on-project-switch` | #47 (live text streaming) | PARTIAL → MATCHES; multi-project workflows usable |
| `subagent-dispatch-fails-inside-ide-chat` | #28 (parallel sub-agents) | PARTIAL → MATCHES; sub-agent workflows usable |

**Two more AHEAD claims are in reach but require slightly more work:**

| Bug | Axes |
|---|---|
| `2026-05-06-file-heat-map-still-broken` | #37 (file-tree change indicators), #40 (heat-map / activity coloring on edited files) — **#40 is genuinely field-wide rare; nobody else has this** |
| `queued-message-no-autosend-and-text-reappears` | Adjacent to #47; correctness gap in queue lifecycle |

These six bugs collectively account for the gap between Ouroboros's structural ambition and its delivered experience. They are the **bug-fix wave's top priority** by a large margin.

---

## Where Ouroboros leads (the 11 AHEAD axes)

Drawn from the gap analysis. These are the axes where Ouroboros sets or matches the industry high-water mark with code-verified evidence:

1. **Per-rule disable toggle in context preview** (#33) — **field-wide rare**; only Ouroboros has this UX surface.
2. **Heat-map / activity coloring on edited files** (#40) — also **field-wide rare**; the bug-blocked feature is unique-in-class.
3. **Discrete context preview popover** (#19) — itemizes rules / skills / memories / files / mentions / tools / system. VS Code Copilot exposes a debug view; nobody else has a user-facing popover.
4. **Per-entry disable in popover** (#20) — paired with #33; structurally similar surface elsewhere.
5. **Memory inline preview** (#35) — drill-down from popover into the memory file; unique.
6. **Token-calibration feedback loop** (token estimate refines from API observation across turns) — unique in the matrix.
7. **LLM-powered async thread title derivation** — heuristic title shows immediately, gets replaced by an LLM-generated one. No other tool does this.
8. **Bidirectional MCP** (Ouroboros is both client AND server via internalMcp) — structurally unusual; pair with CodeMode proxy gives a third indirection layer.
9. **Response-file approval protocol** — survives IDE restart mid-approval; no socket leak. Unusual vs the industry's socket / blocking IPC.
10. **Per-thread draft persistence** with full Lexical node serialization (mention chips survive thread switch).
11. **Adaptive token budget** computed dynamically per turn from conversation length — most tools use a fixed cap.

Several of these only land for the user once the four bugs above are closed.

---

## Where Ouroboros is behind (the 5 BEHIND axes)

Each is a deliberate design gap, not an oversight. Decision needed on each.

| Axis | Gap | Field standard | Recommendation |
|---|---|---|---|
| #9 | `@web` mention | Cursor `@web`, Continue `@Web`, Copilot `#fetch` — user-initiated web search at compose time | Add. The Lexical mention infrastructure makes it cheap (~2-4hr per provider). |
| #8 | `@docs` / `@url` mention | Cursor / Windsurf indexed-doc libraries; Aider `@url` raw fetch | Add `@url` (cheap); decide separately whether to build doc indexing. |
| #12 | `@diff` / `@commit` mention | Cline, some others | Add. Reuses existing `gitExecSimple`. Medium-effort because it needs new IPC handler. |
| #21 | System prompt visibility | VS Code Copilot exposes raw assembled prompt (Chat Debug view) | **Strong candidate.** Pairs with Ouroboros's transparency story; would push #21 from BEHIND to AHEAD. |
| #43 | Per-hunk accept/reject in diff review | VS Code Copilot, Cursor — hover-buttons on hunk gutter | Medium-high effort (selective `git apply`). The `DiffLine[]` data already supports it. |

The gap analysis verified `@past-conversation` (#10) as PARTIAL not BEHIND — the data layer exists but no mention-type wiring.

---

## Where Ouroboros is absent (the 2 ABSENT axes)

| Axis | Status | Recommendation |
|---|---|---|
| #5 — Markdown preview in composer | **Field-wide absent** — no tool in the survey has this | Skip. Implementing closes no competitive gap. |
| #38 — File tree "open in chat" | Cursor, Zed have it | **Cheap to add** — reuses `buildMentionFromDropJson` from `LexicalDropPlugin`. Right-click context menu → IPC → composer insert mention. ~few hours. |

---

## Recommended bug-fix wave shape (ordered)

Ranked by impact × inverse effort. Six items, sized for one wave:

| # | Item | Effort | Impact | Effect on verdicts |
|---|---|---|---|---|
| 1 | Fix `context-preview-rules-disappear` | MED | HIGH | 4 axes PARTIAL → AHEAD |
| 2 | Fix `full-review-artifact-pane-empty` | LOW-MED | HIGH | 1 axis PARTIAL → MATCHES |
| 3 | Fix `chat-streaming-freezes-on-project-switch` | MED | HIGH | 1 axis PARTIAL → MATCHES |
| 4 | Fix `subagent-dispatch-fails-inside-ide-chat` | MED | HIGH | 1 axis PARTIAL → MATCHES |
| 5 | Fix `queued-message-no-autosend-and-text-reappears` | LOW | MED | Correctness gap closed |
| 6 | Fix `2026-05-06-file-heat-map-still-broken` | MED | MED | 2 axes PARTIAL → AHEAD (#40 unique-in-class) |

**Total verdict effect on the wave:** PARTIAL count drops from 9 to 3; AHEAD count grows from 11 to 17. Per the gap analysis: this is the highest ROI work currently available without building new features.

If a feature wave follows the bug-fix wave, the natural next batch is the **mention-types cluster** (#8, #9, #10, #12, #38) — five axes addressable through the same data-provider extension pattern, sized at ~10-20 hours total per the gap analysis.

---

## Cross-cutting observations

1. **Four of the six bugs share a theme: post-start lifecycle state management.** State transitions on session start, project switch, and agent completion all surface bugs. A focused audit of state transitions across these three lifecycle events might address multiple root causes in a single investigation pass.

2. **The self-application loop is a quality signal.** Bugs that affect the daily-development path (composer, mentions, branching, slash commands) are caught fast; bugs in adjacent surfaces (full diff review, project switching, heat-map, subagent dispatch from chat) accumulate longer because the development team isn't exercising them. The `roadmap/follow-ups/` directory is the artifact of this pattern.

3. **Ouroboros's transparency story is genuinely industry-leading but currently theoretical.** Per-rule disable, context preview popover, memory inline preview, system prompt awareness — these are AHEAD on paper. In practice they're hidden behind the rules-disappear bug. Fixing one bug closes that gap.

4. **The mention-types gap is single-wave-addressable.** Five BEHIND/ABSENT axes share one fix surface (the data provider system in `MentionAutocompleteSupport.ts`). No Lexical changes needed. Strong candidate for the wave after bug-fix.

5. **PARTIAL count is the canary.** A healthy mature tool targets PARTIAL <5%. Ouroboros sits at 14.1%. This number drops sharply with the proposed bug-fix wave; sustaining sub-5% requires the bug-noticing → follow-up-filing → wave-bundling loop to keep running.

6. **No major architectural rework is implied by this analysis.** Every BEHIND axis has a concrete fix path that fits within the existing architecture. Every PARTIAL axis is a bug, not a missing layer. The conclusion is "fix the bugs" not "rewrite the chat layer."

---

## What this initiative did NOT cover

- Performance benchmarks (latency, throughput) — not part of UX research scope.
- Model quality / accuracy claims — out of scope.
- Pricing / business-model analysis beyond "subscription vs API."
- Mobile / web variants of the tools surveyed.
- Internal tool implementation details for closed-source tools where Anthropic / Microsoft / Anysphere don't publish.

For each axis where the source research was thin (~8 axes had high `?` cell counts), the gap analysis cited the uncertainty rather than papering over it.

---

## Where this lives in the roadmap

This document set is the **foundation** for the next wave's planning. The recommended bug-fix wave should reference `04-ouroboros-gap-analysis.md` as its primary input — every bug in that wave's plan should cite the matrix axis it closes and the verdict transition it produces. That keeps the wave anchored to the strategic findings rather than drifting into local fixes.
