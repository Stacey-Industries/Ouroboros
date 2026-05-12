# Session Handoff — 2026-05-12 (Wave 86 shipped, awaiting push)

**Audience:** the next Claude Code session that starts in this repo.

---

## TL;DR

**Wave 86 (Chat Orchestration State-Architecture Overhaul) shipped on master**, 11 commits ahead of `origin/master`. Smoke confirmed working after the final fix (`f5202238`). **Not yet pushed.** Pre-push gates not yet run.

The new chat-state architecture is **wired but dormant** in production — `chatState:diff` IPC doesn't fire because of a Vite bundle issue (lazy `require('./threadStore')` in `chatStateNewPath.ts:runCrashRecovery`). The legacy DOM `agent-chat:thread-snapshot` path was restored as load-bearing until Wave 87 fixes the bundle issue and actually migrates the send path.

Wave 85 (Flow Tracer) shipped earlier on a different branch (`wave-85-flow-tracer`, not pushed either — verify status before pushing).

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
