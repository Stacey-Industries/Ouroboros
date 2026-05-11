---
status: DRAFT
created: 2026-05-11
wave: 86
---

# Wave 86 — Architecture Decision Record

Decisions made before any code is written. Each decision is locked at Phase 0; Phases 1+ implement against these decisions, not around them. If implementation surfaces a reason to revisit a decision, halt and re-evaluate at the orchestrator level — do not silently deviate.

This file is populated at Phase 0 from the Locked decisions section of `waveplan-86.md`. The ten decisions there transcribe directly here with full spectrum framing per `~/.claude/rules/best-practice-spectrum.md` where applicable.

---

## Decision 1: Targeted in-place refactor

**Context:** Wave 84 closed with the recognition that the chat orchestration's bug pattern is state-architecture leakage, not isolated defects. The overhaul could ship as a parallel rebuild (new modules behind a flag, old code untouched until cutover) or as a targeted in-place refactor (reshape existing modules' internals while keeping the file structure).

**Pick:** Targeted in-place refactor — emerging best practice for system overhauls where the existing surface has rich instrumentation that should be preserved through the transition.

**Rationale:** Wave 84's instrumentation discipline is the diagnostic substrate this overhaul depends on; a parallel-rebuild approach would either duplicate the instrumentation or lose it during cutover. In-place reshaping with dual-emit windows (Phase 3) gives us the equality assertion as the integration check without doubling the surface area.

**Consequences:** Each phase must leave the build green and the app shippable. No "halfway" state allowed across commits. The feature flag (`chatOrchestration.useNewStateMachine`) exists for the dual-emit comparison window only, not as a permanent switch.

---

## Decision 2: Correctness over simplicity

**Context:** Brainstorming Q2 framed the spectrum: correctness (zero ID/state leakage), simplicity (fewest concepts), testability (pure reducers), refactor cost (minimal churn).

**Pick:** Correctness — make state-leakage bugs structurally impossible (or loud-fail) even if it costs abstraction. Industry-standard posture for systems whose primary pain is bug accumulation.

**Rationale:** The user's frustration is recurring bug accumulation despite repeated fix waves; correctness directly addresses this. Simplicity-first would risk recreating the same bugs in different shapes. Testability-first would over-invest in pure-reducer ceremony for marginal correctness gain. Refactor-cost-first is what failed in Wave 84.

**Consequences:** The architecture commits to explicit `IdentityRegistry` (hierarchical IDs, no coalescing), strict state-machine transitions (throws on invalid), and single-owner-per-state-piece (no shared mutation). New contributors face a steeper learning curve than the current shape.

---

## Decision 3: Hard-fail on impossible states

**Context:** When the new architecture detects an impossible state at runtime (orphaned ID, missing alias, contract violation), what should it do? Brainstorming Q4 framed three options.

**Pick:** Hard fail — throw `ChatStateError`, surface non-dismissable error banner with trace + "Restart Chat Session" action, emit telemetry event. Industry-emerging practice for systems where silent failure has been the recurring pain point.

**Rationale:** Bugs cannot hide. Every impossible state is loud at the moment it happens. Telemetry pattern analysis surfaces recurring violations. Dev/prod divergence (dev throws, prod soft-fails) was explicitly rejected because it creates "works in dev, fails in prod" surprises that the current architecture has been suffering from.

**Consequences:** Regression mid-development could brick the chat surface; regression tests at phase merge time are the defense. Production builds inherit the same throws — if a banner appears in prod, it's a hotfix wave, not a "log and move on" event.

---

## Decision 4: Main owns canonical chat state; renderer owns ephemeral UI

**Context:** The ownership line between main process (canonical) and renderer (UI-only) needed an explicit boundary. Brainstorming Q6 framed three options.

**Pick:** Main owns everything that survives a renderer reload; renderer owns everything that loses no information if dropped on reload. Composer drafts stay renderer-side with localStorage for per-window survival. Industry-standard for Electron applications where the main process represents the persistent system state.

**Rationale:** Eliminates the desync class that today's architecture suffers from (renderer mutating canonical state, main and renderer holding overlapping views). Composer drafts as renderer-owned preserves per-window typing without IPC round-trips per keystroke.

**Consequences:** Every renderer state mutation must flow from a `chatState:diff` event (or be classified as ephemeral UI state). The boundary becomes auditable: if it's persistent, it's in main; if it's UI feel, it's in renderer.

---

## Decision 5: SQLite stays authoritative; CLI JSONL is read-only secondary

**Context:** Prep doc 03 surfaced the option of mirroring Claude Code's `~/.claude/projects/<project>/<session-id>.jsonl` shape as canonical persistence. Brainstorming Q5 framed three options.

**Pick:** SQLite stays authoritative for everything the IDE needs (branches, forks, tags, IDE-specific metadata). CLI JSONL is treated as a read-only secondary source for crash recovery / verification.

**Rationale:** Migration to JSONL-canonical would force re-encoding IDE-specific metadata (branches, tags, side-chats) as JSONL extensions or sidecar files. The migration risk and the complexity of dual-shape persistence outweighs the interop benefit for a single-user IDE. Standard pragmatic call.

**Consequences:** Two parallel records of the same conversation exist (SQLite and CLI JSONL). Crash-recovery paths must be clear about which is authoritative (SQLite is canonical; JSONL is consulted only when SQLite-canonical reconstruction needs supplementary evidence).

---

## Decision 6: Multi-window live mirror

**Context:** The IDE supports multiple windows. What should "same chat thread in two windows" mean? Brainstorming Q7 framed three options.

**Pick:** Live mirror — both windows subscribe to the same main-owned state in real time; sends from window A appear in window B instantly; composer drafts are per-window. Matches Cursor, VS Code, Continue.dev. Industry-standard.

**Rationale:** Natural consequence of main-as-source-of-truth + renderer-as-projection. Eliminates the artificial restriction of exclusive lock or per-window thread copies.

**Consequences:** `ChatStateBroadcaster` must fan out IPC chunks to every subscribed window, not just the originating window. Subscriber set per thread maintained in main.

---

## Decision 7: Threads permanent; hydration capped

**Context:** The follow-up doc surfaced ~100 sessions accumulating in memory with no pruning. Brainstorming Q8 framed three lifecycle endpoints.

**Pick:** Threads are permanent until user-deleted; at any time only ~10 fully-hydrated threads exist in main+renderer memory. Industry-standard for IDE-class agent products (Cursor, Continue, Zed).

**Rationale:** Users don't lose old conversations. Memory pressure is solved by capping hydration, not by archiving / dehydrating policy that requires UX. Tab-flip behavior with a 30s dehydration grace covers the common rapid-switching pattern.

**Consequences:** Thread list view loads summaries only (id, title, status, lastUpdated, messageCount). Opening a thread hydrates lazily — must hit < 100ms perceived latency target.

---

## Decision 8: Three permanent `[trace:*]` tags

**Context:** Wave 84 introduced multiple investigation-specific `[trace:*]` tags that were retained at wave close. Going forward, what's the instrumentation discipline?

**Pick:** Three permanent structural tags + one transient class:
- `[trace:identity]` at every `IdentityRegistry` resolve method — replaces `[trace:agent-record]` 3-site chain
- `[trace:event]` at `ChatSessionStateMachine.dispatch()` — replaces `[trace:stream]` emit/receive pair
- `[trace:state]` at state-machine transition method — replaces `[trace:chat-order]`
- `[trace:DEBUG-*]` for per-bug investigations — removed at end of investigating wave

**Rationale:** Three logs reconstruct any chat-flow bug from the trio (event flow + state transitions + ID resolution). Single emit point per tag is grep-friendly and refactor-stable. Investigation tags are the only category that needs cleanup discipline.

**Consequences:** Wave 84 retained tags (`[trace:agent-record]`, `[trace:heat-map]`, `[trace:stream]`, `[trace:chat-order]`) retire at Phase 7. Hard-fail telemetry table created in `telemetry.db` for `ChatStateError` throws.

---

## Decision 9: Schema v10 migration

**Context:** The new architecture requires persistent identity-alias rows + crash-recovery markers + optional per-message event logs. Schema v9 has none of these.

**Pick:** Schema v10 additions (standard up + down migration pair):
- `threads.lastProviderSessionId TEXT NULL`
- `threads.lastInterruptedAt INTEGER NULL`
- `messages.canonical_event_log TEXT NULL` (JSON, optional per-message canonical event log)
- New table `identity_aliases (thread_id TEXT PK, turn_id TEXT, provider_session_id TEXT, created_at INTEGER, retired_at INTEGER NULL)`

**Rationale:** Minimal additions that support registry-restore-on-startup, crash-recovery marker, and forensic event-log replay. Single migration step keeps risk low.

**Consequences:** Test fixture `src/main/storage/__fixtures__/threads-v9-seeded.db` checked into the repo; migration up + down both tested against it before Phase 2 merges. Real-user-DB smoke at Phase Z before v2.16.0 tag release.

---

## Decision 10: Feature-flag gated rollout

**Context:** The dual-emit window in Phase 3 requires both old and new paths to run side-by-side; the renderer cutover in Phase 4 requires renderer to read from new channels while old channels still emit; the production rollout needs a clean cutover.

**Pick:** `chatOrchestration.useNewStateMachine` boolean in `agentChatSettings`:
- Phase 1: default `false`; flipped `true` only in dev smoke
- Phase 3: stays `false` in production; flipped `true` in dev/test for dual-emit verification
- Phase 5: flipped `true` for production at end of phase
- Phase 6: flag removed entirely (new path is the only path)

**Rationale:** Standard feature-flag rollout for risky cutovers. The flag's lifetime is bounded by the wave; it's a transition tool, not permanent config.

**Consequences:** `configSchemaTail.ts` gains and loses the flag across the wave. Phase 6's deletion checklist includes the flag declaration. Cole's existing `config.json` may carry a stale `useNewStateMachine` field briefly post-Phase-6; migration cleanup is a one-line removal in the config layer.
