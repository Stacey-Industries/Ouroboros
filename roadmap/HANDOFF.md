# Session Handoff — 2026-05-08 (Wave 85 implementation complete, awaiting smoke)

**Audience:** the next Claude Code session that starts in this repo. Cole pastes this (or points at it) and you orient from here.

---

## TL;DR

**Wave 85 (Flow Tracer) implemented end-to-end on branch `wave-85-flow-tracer`** — 17 commits now, all 8 phases + 2 orchestrator-applied integration commits + 4 post-smoke fix commits (real-browser smoke surfaced 5 bugs). Gates run, `/review` returned **FLAG** (non-fatal). **Manual smoke partially run** (the user ran a smoke pass, surfaced bugs, fix iteration applied). Three follow-ups filed for non-fix items (diagram polish, trace-engine quality, narration body via graph snippet) — see `roadmap/follow-ups/2026-05-08-flow-tracer-*.md`. No push, no tag yet.

**Wave 84** (Chat Lifecycle Bug-Fix Bundle) still in DRAFT on master, untouched this session.

---

## Wave 85 — branch state

Branch: `wave-85-flow-tracer` (local only, not pushed). Working tree has only post-wrap planning artifacts (follow-ups, wave-84-DRAFT) outside the wave's scope.

**Commits on branch (17 total):**
```
5a397ef feat(wave-85): wire Phase 5/6 surfaces into FlowTracerView
50d5d8c feat(wave-85): phase 6 — natural-language symbol resolution
5c2f3ae feat(wave-85): phase 5 — canonical flow gallery generator
51511c5 feat(wave-85): integrate Phase 3/4/7 hooks into FlowTracerView
a616741 feat(wave-85): phase 4 — chain-aware Why narration
ce2ccff feat(wave-85): phase 3 — per-symbol What+How narration cache
ae51055 feat(wave-85): phase 2 — boundary registry + real trace engine
8d5be33 feat(wave-85-p7): FlowTrace persistence + Mermaid export
fc12ec7 feat(wave-85): phase 1 follow-up — register Command Palette entries
444bca3 feat(wave-85): phase 1 — Flow Tracer walking skeleton
ee2e89b test(wave-85): phase 1 prep — orchestrator-owned acceptance test
d812a22 docs(wave-85): phase 0 — ADR + planning baseline
```

Plus four post-smoke fix commits (after `fa3e357` Phase 8 wrap):
```
087c5a8 fix(wave-85): hover-spasm — pin inspector + memoize SymbolRef
cf7104b fix(wave-85): three more smoke bugs surfaced by real-browser run
7b0d903 fix(wave-85): two real-browser smoke bugs
fa3e357 chore(wave-85): phase 8 wrap — gates + /review report
```

Smoke fixes covered:
- `drawSwimlane` positional-vs-destructured arg crash on first render (the latent bug I'd Tier-3-flagged at the integration commit; manifested in real browser).
- `extractRendererEventCandidates` compound-WHERE clause unsupported by the codebase-graph compat queryGraph engine. Split into 3 single-condition queries with dedupe.
- `listSavedFlows` reading Phase 4's `<flowId>-why.json` cache files and crashing on `.metadata` access. Filter `-why.json` from the directory listing.
- Narration prompt missed symbol body when graph line was stale. Added `rescueBodyByName` fallback that scans the file for the symbol token.
- Wasted 2nd CLI call when Haiku replied with valid empty `[]`. Added `isValidEmptyArrayResponse` short-circuit.
- Hover-panel "spasm" — removing the `onMouseLeave` clear so inspector stays pinned to last hovered step + memoizing `hoverRef` so useStepNarration doesn't refetch on every render.

**Phase 8 automated gates (all green or pre-existing-only failures):**
- `tsc --noEmit` — clean
- `npm run lint` — 0 errors, 5 advisory warnings (none in wave-85 code)
- `npm run test:ipc` — 624/626 pass (0 fail)
- `npm run test:main` — 6154/6160 pass; 1 file fails on `boundaryRegistry.test.ts builtAt` 1ms timing race that Phase 3's report had pre-flagged; passes when run alone
- `npm run test:renderer` — 4024/4030 pass; 3 pre-existing failures (`mobile-touch-targets`, `ChatWorkbenchShell`, `ChatWorkbenchFollowThrough`), confirmed via git stash by Phase 1 follow-up + Phase 6 to predate wave-85
- `walkingSkeleton.acceptance.test.ts` (orchestrator-owned boundary contract) — 12/12 pass throughout

## `/review` findings (FLAG — non-fatal)

Full report: `roadmap/wave-85-flow-tracer/wave-85-mechanical-review.md`. Six findings to address before push:

**Narrowed universals (Check 2):**
1. `traceEngineSupport.inferLayer` classifies 4 of 6 layers; emits no `'filesystem'` or `'user'` step kinds. The `LayerKind` enum supports them; the classifier doesn't produce them. Either extend `inferLayer` for fs.* call sites + UI-handler entry points, or document in ADR that 4-of-6 is the Wave 85 scope and FS/user are Wave 86 polish.
2. Phase 2 audit pass (the "enumerate ipcMain.handle calls via grep, cross-check against the registry" mitigation in the Risks table) was not implemented. The scan does it implicitly; the explicit cross-check assertion in `boundaryRegistry.test.ts` is the missing piece.

**Dead exports (Check 3) — all test-only consumers, no `DEFERRED-CONSUMER` markers:**
3. `batchGenerateNarrations` at `src/main/flowTracer/narrationCache.ts:250` — Phase 3 spec'd "pre-compute What+How for every symbol referenced by a canonical flow at index time"; function exists but no production caller invokes it.
4. `invalidateNarration` at `src/main/flowTracer/narrationCache.ts:318` — designed for graph-reindex / file-change hooks; no production caller.
5. `invalidateFlowWhy` at `src/main/flowTracer/flowWhyCache.ts:260` — same shape; no production caller.
6. `deleteSavedFlow` at `src/main/flowTracer/flowPersistence.ts:161` — Phase 7's report explicitly noted "no IPC handler yet; wired in a future phase." Add a `// DEFERRED-CONSUMER: wave-86` comment to clear the flag without code change.

None are structurally fatal — wave is mergeable once findings are addressed (fix or document).

## Manual smoke — deferred

Per `~/.claude/rules/manual-smoke-gate.md` (recently updated to require both light AND dark theme passes). User has running IDE chats and asked to defer the smoke until they don't need the IDE for active work. Smoke walkthrough should hit:
- Open Flow Tracer via Command Palette → "Flow Tracer: Browse Flows"
- Open via View menu → Flow Tracer
- Click a gallery tile → swimlane renders
- Click "Regenerate" → gallery refreshes
- Hover any step → side panel populates with What/How (and Why on supported flows)
- Type a query in search bar → resolves to entry point or shows disambiguation
- Save a flow with a title → reopen → confirm round-trip
- Click "Copy Mermaid" → paste somewhere and confirm valid sequenceDiagram syntax
- Run all the above in BOTH light and dark theme

After smoke: address the 6 `/review` findings (or document deferrals), update HANDOFF, push branch, tag (target version: v2.15.0 or v2.16.0 depending on Wave 84's order).

## Tier-3 follow-ups noted during the wave

- `src/renderer/components/FlowTracer/FlowTracerView.tsx` lines 117-118 (drawEdges/drawStepNodes call sites) pass positional args though signatures take a destructured object. Project tsconfig isn't catching it; jsdom's `getContext('2d')` returns null in tests so the bug doesn't surface; only manifests in a real browser. Pre-existing from Phase 1; documented in `51511c5` commit message.
- `boundaryRegistry.test.ts` `builtAt` 1ms timing flake — passes when run alone; Phase 3's report flagged it. Tier-1 fix per Phase 2's report: change `>` to `>=` with a 1ms tolerance, or `await` a no-op timer before the timestamp capture.
- `walkingSkeletonStub.ts` is now an empty comment file after Phase 5 moved `WALKING_SKELETON_FLOWS` to `canonicalFlows.ts` as `FALLBACK_FLOWS`. Delete in wave-wrap cleanup.

---

**Two waves now in DRAFT, both awaiting Cole's review:**
- **Wave 84** — Chat Lifecycle Bug-Fix Bundle (drafted 2026-05-08 morning; six chat-related follow-ups bundled). Untouched this session.
- **Wave 85** — Flow Tracer / Phase 1 of "An IDE That Teaches You" — **implementation complete on branch as of this session**.

Wave 84 and Wave 85 are independent. Either can ship first.

---

## What's new in this session

### Wave 85 — Flow Tracer (new initiative)

A 2026-05-08 brainstorming session crystallized a new product framing: **"an IDE that teaches you."** The agent removes the labor of typing code; the IDE closes the comprehension gap by making every layer of the code legible. The user grows alongside the codebase.

The initiative ships in three waves:
- **Wave 85** — **Flow Tracer** (this draft). Causal/temporal swimlane sequence diagram: pick a moment ("when I click send"), see the flow traced through every layer (renderer → preload → main → CLI → filesystem) with AI-written What/Why/How narration on each step.
- **Wave 86** (planned) — Inline captions + diff narrator. Pervasive narration where the user is already looking.
- **Wave 87** (planned) — Galaxy Map with cross-linking. The spatial / architectural view, with click-to-trace handoff.

Artifacts produced this session:
- `docs/superpowers/specs/2026-05-08-flow-tracer-design.md` — full design spec (11 sections)
- `roadmap/wave-85-DRAFT/waveplan-85.md` — 14-section wave plan, all sections drafted from grounding + research
- `roadmap/wave-85-DRAFT/wave-85-decisions.md` — ADR with 11 decisions (8 locked, 3 REQUIRES USER LOCK)
- `ai/vision.md` (new) — captures the "IDE that teaches you" framing for future-session continuity

The ADR's three **REQUIRES USER LOCK** items must be answered before Phase 1 dispatches:
1. **Decision 9 — Trace depth limit default.** Recommended: 6 hops, configurable via setting.
2. **Decision 10 — Saved-flow git-tracking default.** Recommended: keep `.gitignore` rule (local-only by default), opt-in shared via setting.
3. **Decision 11 — Symbol-search entry (option A) — in or out of Wave 85?** Recommended: OUT, defer to Wave 86.

Cole reviews the spec + waveplan + ADR, locks the three items (or overrides), and the wave is ready for Phase 0 → Phase 1 dispatch. Re-running `/wave-plan 85` validates the filled plan against Sites 1/2/3 and renames the folder from `wave-85-DRAFT/` to `wave-85-flow-tracer/` on PASS.

The wave plan dispatches 8 phases (per `~/.claude/rules/walking-skeleton-first.md`, Phase 1 is the walking skeleton end-to-end stub). Estimated ~2-3 weeks at sonnet-implementer dispatch cadence with parallel phase execution where possible.

### Wave 84 — Chat Lifecycle Bug-Fix Bundle

Drafted earlier 2026-05-08; targets v2.15.0. Six chat-related follow-ups bundled per `roadmap/foundation/agent-chat-best-practices/00-summary.md` ROI analysis (PARTIAL count drops from 9 to 3; AHEAD count grows 11 → 17).

Plan at `roadmap/wave-84-DRAFT/waveplan-84.md`. Cole's review pending. One REQUIRES USER LOCK item: bug 4 (subagent dispatch 500) implementer choice depending on reproducibility.

---

## Current state

**Branch:** `master`, in sync with `origin/master`.

**Recent ship history:**
```
1d09774 chore(release): v2.14.0 — wave 82 chat-only polish bundle (14/15 closed)
d0a16e5 chore(wave-82): post-smoke cleanup — strip investigation traces, defer B2 heat map
6d842ff docs(handoff): refresh for 2026-05-06 — wave-82 committed, smoke-pending
d7882a9 fix(wave-82): chat-only polish bundle — rounds 1-3 + 82.1 + post-smoke iterations
f545747 chore(release): v2.13.0 — wave 83 Playwright-electron repro harness shipped
```

**Tags pushed:** `v2.14.0` (Wave 82), `v2.13.0` (Wave 83).

**Wave folders in flight:**
- `roadmap/wave-84-DRAFT/` — Chat Lifecycle Bug-Fix Bundle (six follow-ups bundled)
- `roadmap/wave-85-DRAFT/` — Flow Tracer (new initiative; awaiting 3-item user lock)

---

## What's open after wave 82

### B2 — File-tree heat map still broken

Round-5 smoke confirmed colored borders still don't appear after agent edits despite two attempted fixes in wave-82.x. Filed as a standalone follow-up at `roadmap/follow-ups/2026-05-06-file-heat-map-still-broken.md`. **Bundled into Wave 84** as one of the six bugs (item #6). Per `~/.claude/rules/debug-before-fix.md`, the next attempt MUST add temporary `log.info('[heat-map] tool event', …)` and `log.info('[heat-map] extracted path', …)` instrumentation so live tool-name and extracted path can be compared against the file-tree row's lookup key. Two free fix attempts already burned; instrumentation comes next.

Files involved: `src/renderer/hooks/useFileHeatMap.ts`, `src/renderer/components/FileTree/FileTree.tsx`, plus the row component that applies the colored border.

### Other open follow-ups

`roadmap/follow-ups/outstanding-2026-05-03.md` is the canonical digest of ~100 unique open items across Chat/UI, Telemetry, MCP, Graph, Performance, and prior-wave follow-ups. Five of those are now bundled into Wave 84.

### Pre-existing test baselines (not regressions)

Three pre-existing failures preserved through wave-82 — all on the outstanding follow-ups list, not introduced by this wave:
- `TitleBar.menus.test.ts > contains Switch to IDE Shell`
- `ChatWorkbenchFollowThrough.integration.test.tsx > opens utility drawer on OPEN_SUBAGENT_PANEL_EVENT`
- `ChatWorkbenchShell.integration.test.tsx > switches to subagents tab when a subagent-open event fires`

---

## Conventions worth knowing

- **Push policy:** per-wave, not per-phase. Don't push until smoke is signed off. (Recorded in user memory.)
- **Lint hooks:** harness PreToolUse hooks at `assets/hooks/pre_*.mjs` enforce conventional-commits, prettier, ESLint, secrets, and full-tsc-on-push. `--no-verify` is a git-hooks flag and doesn't bypass the harness layer. Run `npx prettier --write` and fix lint violations directly. `OUROBOROS_SKIP_QUALITY_HOOKS=1` only works if set in the parent Claude Code session env, not inline.
- **Test scope during iteration:** prefer the scoped `npm run test:agentchat` / `test:layout` / `test:filetree` etc. over `npm test`. Full suite runs at push-time.
- **Heat map debug rule:** when picking up B2 (now Wave 84 item 6), INSTRUMENT FIRST. The follow-up doc has the exact log statements to add and the repro steps to capture them on.
- **Wave-85 narration auth constraint:** all LLM calls go through `spawnClaude` CLI subprocess (Max subscription, no API key). Direct Anthropic API calls are unauthorized. Pattern reference: `src/main/contextLayer/moduleSummarizer.ts`.

---

## File map for the in-flight waves

```
roadmap/wave-84-DRAFT/
├── waveplan-84.md                       — 14-section plan; one REQUIRES USER LOCK item (bug 4 reproducibility)

roadmap/wave-85-DRAFT/
├── waveplan-85.md                       — 14-section plan, fully drafted; 3 REQUIRES USER LOCK items
└── wave-85-decisions.md                 — ADR with 8 locked decisions + 3 user-lock items

docs/superpowers/specs/
└── 2026-05-08-flow-tracer-design.md     — Wave 85's design spec; brainstorming output

ai/
└── vision.md                            — "An IDE That Teaches You" positioning (new)

roadmap/wave-82-chat-only-polish-bundle/  — SHIPPED v2.14.0
├── waveplan-82.md
├── wave-82-decisions.md                 — locked ADR (12 decisions)
├── phase-a-audit.md
├── phase-e-diagnosis.md
├── wave-82-auto-brief.md
└── wave-82-handoff.md

roadmap/wave-82.1-chat-project-binding/   — SHIPPED v2.14.0 (sub-wave)
├── waveplan-82.1.md
└── wave-82.1-result.md

roadmap/follow-ups/
├── 2026-05-06-file-heat-map-still-broken.md  — B2 (bundled into Wave 84 item #6)
├── 2026-05-07-chat-streaming-freezes-on-project-switch.md
├── 2026-05-07-context-preview-rules-disappear-after-chat-start.md
├── 2026-05-07-full-review-artifact-pane-empty.md
├── 2026-05-07-queued-message-no-autosend-and-text-reappears.md
├── 2026-05-07-subagent-dispatch-fails-inside-ide-chat.md
└── outstanding-2026-05-03.md             — categorical digest of ~100 open items
```

---

## Next session's first move

If Cole is starting fresh: **read this handoff, then read `roadmap/wave-85-DRAFT/waveplan-85.md`** and decide on the three REQUIRES USER LOCK items (Decision 9, 10, 11 in `wave-85-decisions.md`). Once locked, re-running `/wave-plan 85` validates the plan against Sites 1/2/3 and renames the folder. Then Phase 1 can dispatch.

If picking up Wave 84 instead: read `roadmap/wave-84-DRAFT/waveplan-84.md` and answer the bug-4 reproducibility lock. Then `/wave-plan 84` validates and Phase 0 dispatches.

The two waves are independent. Cole picks the order.
