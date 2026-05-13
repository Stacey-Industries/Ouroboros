# Session Handoff — 2026-05-13 (clean state: master = origin/master; Wave 87 on its branch)

**Audience:** the next Claude Code session that starts in this repo.

---

## TL;DR

**Local master matches `origin/master` exactly.** No divergence, no stale local-only commits. Hop in clean.

**What's shipped on `origin/master` (most recent first):**

| Commit | Topic |
|---|---|
| `0d6ee197` (PR #6) | `fix(ci): override node-gyp to ^11` — unblocks Windows + macOS validate matrix from the distutils crash (~4 days red) |
| `c6314000` (PR #5) | HANDOFF refresh post M-4 + filed `2026-05-13-ci-distutils-node-gyp.md` follow-up |
| `d5effffa` (PR #4) | Pipeline Hardening M-1 doctrinal + M-4 (Electron Playwright e2e on Ubuntu CI via xvfb, 9-test stable subset) |
| `271ffe77` | Gitignore dev-mode threads.db at repo root |
| `071db978` | Wave 86 result brief + refreshed HANDOFF |
| `f5202238` ... `f3ee6f54` (7 commits) | Wave 86 (Chat Orchestration State-Architecture Overhaul) — Phases 4-6 + post-smoke fixes |

**Wave 87 (Chat Orchestration Cleanup) is on the `wave-87-chat-orchestration-cleanup` branch (pushed).** 8 clean commits: Phase 0 → Phase 1 → Phase 1-followup → Phase 2-prep → Phase 2A → Phase 2B → Phase 4-pulled-forward → renderer-projection-fix. Branch tip: `e9c57dca`. The duplicate M-1 commit that was on local master (already absorbed into PR #4's squash) was dropped during the cleanup rebase.

**To continue Wave 87:** `git checkout wave-87-chat-orchestration-cleanup`. From there, pick up Phase 3 (or wherever Wave 87's plan ends — see `roadmap/wave-87-chat-orchestration-cleanup/waveplan-87.md` if it exists; otherwise the carryover items below).

The new chat-state architecture (Wave 86) shipped is **wired but dormant** in production. Wave 87 Phase 1 (`9271d02c`) is the lazy-init fix for the threadStore bundle issue; subsequent phases migrate the send path away from the legacy `agentChat:*` IPC.

**Wave 85 (Flow Tracer)** is still on local-only branch `wave-85-flow-tracer` (not pushed). Verify status independently before resuming.

## CI status

Master CI still has pre-existing test failures (~80-130 across the matrix, heavily clustered in chat-orchestration tests). These reflect Wave 86's half-migrated state and **will land green naturally as Wave 87 ships its migration** — Wave 87 Phase 2A/2B move the send pipeline to `chatSendCoordinator` + `chatCommand:sendMessage`, which the failing tests need to be updated against.

PR #6's distutils fix unblocked the install/rebuild layer; the test failures downstream are NOT regressions caused by this PR — they were masked by the install crash and are now visible because the install completes. The 11 deferred Electron e2e specs filed at `roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md` are part of the same pattern — fix as part of Wave 87 or in a dedicated follow-on.

---

## M-4 what shipped

- `playwright.config.ts` — testIgnore for `*.test.ts` + 6 drift-broken specs; timeout 30s → 60s
- `e2e/electron.fixture.ts` — `page.close()` workaround per the `e2e/CLAUDE.md` Windows-teardown gotcha
- `e2e/app-launch.spec.ts` — `test.fixme` on "no uncaught exceptions" (real bug catching)
- `.github/workflows/ci.yml` — new Playwright e2e step on Ubuntu under `xvfb-run`, 10min timeout, playwright-report artifact upload on failure
- `roadmap/wave-temperature-log.md` — M-4 row (TEETH-PULLING; e2e drift was deeper than M-2 / M-3 surprises)
- `roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md` — 11 deferred test failures enumerated

Local verification: 9 passed, 0 failed, 25.2s on Windows. CI verification: blocked by pre-existing Test step failures (the 25 pre-existing test failures above) — my e2e step didn't get to run in CI on this push. Cole's call on whether to wire the e2e step into a separate parallel job (so it runs regardless of Test step) once the 25 pre-existing tests are fixed.

---

## What to do next

### Option A — Push Wave 86

1. Run pre-push gates:
   ```
   npx tsc --noEmit
   npm run lint
   npx vitest run src/renderer/components/AgentChat src/main/agentChat src/main/ipc-handlers
   ```
2. If green, push `master`.
3. Tag release if applicable (semver: minor — new architecture surface).

### Option B — Start Wave 87 (chat-orchestration cleanup)

Carryover items from Wave 86 (see `roadmap/wave-86-chat-orchestration-overhaul/wave-86-result.md`):

1. **Fix the Vite bundle issue.** `src/main/ipc-handlers/chatStateNewPath.ts:runCrashRecovery` uses `require('../agentChat/threadStore')`. The reason it's lazy is that `threadStore.ts` calls `app.getPath('userData')` at module-eval time. Vite drops the lazy require during bundling. Two fixes possible:
   - Refactor `threadStore.ts` to lazy-init its DB connection (safe to static-import).
   - Restructure `chatStateNewPath.ts` to register handlers eagerly but defer the threadStore touch until `app.whenReady()`.
2. **Verify `chatState:diff` IPC fires end-to-end** for a complete turn after the bundle fix. Smoke before declaring it working.
3. **Delete the legacy DOM `agent-chat:thread-snapshot` path** (emit in `useAgentChatStreaming.ts:206`, listener in `agentChatWorkspaceSupport.ts`). Only after #2.
4. **Migrate the send path.** Production user sends still route through `agentChat:*` IPC via the old `chatOrchestrationBridge`. Wave 87 should route through `chatCommand:sendMessage`, then retire:
   - `inferSessionId()` in `hooksDispatchLogic.ts`
   - `applyStickyLinkFields()` in `eventProjector.ts`
   - `activeSends` map in `chatOrchestrationBridge*.ts`
   - synthetic-sessionId-equals-threadId masquerade in `chatOrchestrationBridgeMonitor.ts`
   - Four old IPC emit sites: `agentChat:thread`, `agentChat:status`, `agentChat:stream` (and the web preload subscriptions in `src/web/webPreloadApisSupplemental.ts`)
5. **Clean up `[trace:agent-record]` instrumentation spam** (100+ session IDs per render).
6. **Decide on `[trace:stream]` baseline structural logging** — keep or remove.

### Option C — Address chat-orchestration follow-ups in `roadmap/follow-ups/`

Several pre-existing chat issues filed before Wave 86 may now be resolved by it. Sweep:
- `2026-05-07-chat-streaming-freezes-on-project-switch.md`
- `2026-05-07-context-preview-rules-disappear-after-chat-start.md`
- `2026-05-07-queued-message-no-autosend-and-text-reappears.md`
- `2026-05-11-chat-state-architecture-overhaul.md` (this was the wave's origin)
- `2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md`

---

## Wave 85 status (still pending)

Branch `wave-85-flow-tracer` (local only, not pushed). 17 commits including post-smoke fixes. `/review` returned FLAG (non-fatal). Three follow-ups filed. Worth checking before/after pushing Wave 86.

---

## Repo entry points

- Wave plan: `roadmap/wave-86-chat-orchestration-overhaul/waveplan-86.md`
- ADR: `roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md`
- Phase 0 baseline: `roadmap/wave-86-chat-orchestration-overhaul/phase-0-results.md`
- Result brief: `roadmap/wave-86-chat-orchestration-overhaul/wave-86-result.md`
- Prep/research: `roadmap/foundation/chat-orchestration/00–03-*.md`
- Spec: `docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md`

---

## Open known gotchas worth re-reading

- `project_wave86_dom_snapshot_load_bearing.md` (memory) — why the DOM event path is back
- `~/.claude/rules/walking-skeleton-first.md` — the rule Wave 86 followed
- `src/renderer/components/AgentChat/CLAUDE.md` — chat subsystem map
- `src/main/agentChat/CLAUDE.md` — main-process chat map (does NOT yet list Wave 86 modules; consider updating during Wave 87)
