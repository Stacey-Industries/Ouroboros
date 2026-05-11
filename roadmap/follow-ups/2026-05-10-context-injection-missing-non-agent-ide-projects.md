---
status: OPEN
created: 2026-05-10
updated: 2026-05-10
---

# Project context auto-injection works for Agent IDE but not other projects

## Symptom

The IDE auto-injects project / repo context at chat start — rules, CLAUDE.md files, project structure orientation, etc. — so the agent isn't starting cold each turn. This is a flagship feature of the chat-only shell.

Observed during Wave 84 Phase 0 (2026-05-10): the injection **fires for Agent IDE** but **does NOT fire for Contractor App or Gamify**, both of which have been loaded in the same Ouroboros install for a long time.

Cole hypothesis: may be related to long IDE residency for those projects (state accumulation, stale references, or a registration step that only ran for Agent IDE).

## Repro

1. Open the IDE.
2. Open Agent IDE in one window. Start a chat. Observe that the agent's first response demonstrates awareness of the project (cites file paths, knows the architecture, references CLAUDE.md gotchas without being asked).
3. Open Contractor App or Gamify in another window. Start a chat with a comparable prompt. The agent's first response shows no project awareness — generic answers, no file-path citations, no acknowledgment of project-specific patterns.

Sharper repro: ask each chat the same project-specific question (e.g., "What's the main entry point of this app?") and compare the answers. Agent IDE answers correctly without exploration; the others either guess or kick off filesystem exploration first.

## Suspect surface

Per `docs/chat-shell.md`, `docs/codemode-internalmcp-routing.md`, and the chat-only-shell context injection wiring:

- `src/main/contextLayer/` — context assembly for first-message injection. Module summarizer, repo map, rules+skills aggregation all live here.
- `src/main/agentChat/chatOrchestrationBridge.ts` — the bridge that builds the chat-session payload; context injection happens here or in something it calls.
- Wave 51 (`docs/codemode-internalmcp-routing.md`) and Wave 53 (`project_telemetry_dark_signals.md`) both touched this surface.
- Per-window project isolation in `windowManager.ts` — each window owns its own project roots; injection may depend on per-window state that only got initialized for Agent IDE.
- Possible cause: the per-project context index is keyed on something Agent IDE has but Contractor App + Gamify don't (e.g., a graph index, a foundation/ folder, a specific CLAUDE.md shape).

## Likely failure modes (to enumerate during B1)

1. **Per-project graph index gating** — context injection requires the codebase graph to be indexed for the project. Agent IDE's graph is indexed (~18.3K nodes per its CLAUDE.md); the other projects may not be. If injection bails when no graph exists, the symptom matches exactly.
2. **Per-window project-root registration timing** — injection reads `ManagedWindow.projectRoots` (`src/main/windowManager.ts`) before that's populated for non-Agent-IDE windows. Race condition on cold boot.
3. **Foundation folder dependency** — Agent IDE has `roadmap/foundation/`; the other projects may not. If injection reads foundation docs and silently fails when absent, that's the bug.
4. **Stale config / cache** — both other projects have been in the IDE "for quite some time." A migration step or cache invalidation may have missed them.
5. **CLAUDE.md discovery path** — injection may walk `CLAUDE.md` files from a specific root and miss the others' shapes.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md`, instrument first:

1. `log.info('[trace:context-injection] start', { projectRoot, windowId, hasGraph, claudeMdPaths })` at the injection entry point in `chatOrchestrationBridge.ts` (or wherever the injection is assembled).
2. `log.info('[trace:context-injection] step', { stage: 'rules' \| 'graph' \| 'foundation' \| 'claudemd', count, bailedReason })` at each gathering stage.
3. `log.info('[trace:context-injection] final', { projectRoot, payloadSizeBytes, sectionsIncluded })` at the assembled-payload step.
4. Cole reproduces the divergence across Agent IDE / Contractor App / Gamify; compare logs side-by-side. The stage that bails (or returns empty) for the non-Agent-IDE projects is the failure point.

Only after observing where it bails, propose a fix.

## Priority

Medium-high. This is a flagship-feature regression for two of three actively-developed projects. The feature appears to work (because Agent IDE works), masking the bug for users who primarily use Agent IDE for self-testing. Real users on Contractor App / Gamify get a silently-degraded experience.

NOT in Wave 84. Likely candidate for the next wave after Wave 84 ships, or possibly bundled with bug 4's Phase E investigation (both involve the orchestration bridge / per-project state).

## Related

- `2026-05-07-context-preview-rules-disappear-after-chat-start.md` (Wave 84 bug 1) — different surface (popover display) but same broader theme (per-project context state).
- `2026-05-07-subagent-dispatch-fails-inside-ide-chat.md` (Wave 84 bug 4) — also IDE-orchestration-specific, also CLI-clean. The two may share a common root cause in per-project / per-session orchestration state.
- `docs/chat-shell.md` / `docs/codemode-internalmcp-routing.md` — design docs for the surface this bug lives in.
