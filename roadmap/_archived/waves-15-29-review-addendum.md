# Waves 15–29 — Review Addendum

**Reviewer:** Claude Opus 4.7 (1M context, xhigh effort), with five parallel Sonnet subagents clustered by theme coupling.
**Scope:** This addendum covers the waves the original `waves-15-40-review.md` did not reach, because the handoff's focus areas enumerated only Waves 30–40. The methodology is identical: subagents gathered facts with file paths and line numbers; every CRIT/HIGH finding was re-read in source by the reviewer.
**Read with:** `waves-15-40-review.md` (the primary review). Findings here extend that review; severity scale is the same (CRIT / HIGH / MED / LOW).

---

## Theme map (Waves 15–29)

| Wave | Theme |
|------|-------|
| 15 | Instrumentation & observability foundation (telemetry SQLite + JSONL mirror, correlationId, outcomeObserver) |
| 16 | Session primitive + worktree isolation (`sessions.worktreePerSession` flag) |
| 17 | Layout preset engine (`layout:*` IPC channels, built-in + custom + global presets) |
| 18 | Graph GC + edit provenance |
| 19 | Context scoring: PageRank + provenance-aware weights |
| 20 | Chat-primary layout + session sidebar |
| 21 | Thread organization (folders, tags, pins, search) |
| 22 | Message polish + UX refinement (reactions, collapsing, streaming) |
| 23 | Side chats + branching (fork, branch, merge) |
| 24 | Context decision logging + Haiku reranker |
| 25 | Research pipeline (explicit) + pinned context primitive |
| 26 | Profiles, inference controls, tool toggles |
| 27 | Subagent UX |
| 28 | Drag-and-drop pane composition |
| 29 | Diff review, graph panel, hook/rule authoring |
| 29.5 | Data foundation repair (C1–C5: correlationId pairing, JSONL retention, research FK) |

---

## 1. Executive summary of the addendum

The Waves 15–29 codebase is **substantially more mature than Waves 30–40** in terms of invariants, test coverage, and doc alignment — these were the foundations the later waves built on. That said, the audit surfaced three genuine data-correctness bugs and a cluster of wiring-gap findings that suggest the infrastructure was built but not always turned on.

The three real data bugs are:

1. **Layout split-pane edits are silently not persisted** (Wave 28). A user drags a pane to an edge to create a split, the layout renders correctly, and on reload the split is gone with no error. Swaps persist; splits don't.
2. **Reactions written to forked-thread messages overwrite the source thread's reactions** (Waves 22 + 23). The `messages` table uses a composite PK `(id, threadId)`, so forked threads can share `id`s across `threadId`s — but `setMessageReactionsSql` executes `UPDATE messages SET reactions = ? WHERE id = ?` with no `threadId` filter, so a single `UPDATE` hits every row that shares the `id`.
3. **Fork-created threads are invisible in the thread-tree view** (Waves 20 + 23). `forkThreadImpl` writes `parentThreadId` at the top level of the thread record; `buildThreadTree` reads `branchInfo?.parentThreadId`. The fork relationship is persisted but the renderer never follows it.

The wiring gaps are more worrying in aggregate because the infrastructure looks production-ready at the unit-test level:

- `initTraceBatcher()` and `drainTraceBatcher()` are never called in production — `orchestration_traces` accumulate in an in-memory queue that is never flushed (verified: zero production callers across all of `src/main`).
- `createTelemetryJsonlMirror()` is never instantiated in production — the JSONL event mirror is fully tested dead code (verified: zero production callers).
- `purgeRetainedRows` (SQLite telemetry retention) has no production scheduler — the 30-day retention advertised in the plan doesn't run.
- `sessionGc.ts` does not call `worktreeManager.remove()` for archived sessions with worktrees — orphan worktrees accumulate when `sessions.worktreePerSession` is enabled.
- Research cache `purgeExpired()` has no scheduler — cache grows unboundedly until restart.

Ship impact: these gaps are invisible on a short dogfood because they manifest as unbounded growth (minutes of usage don't exceed caps). They will surface as "my disk is full" or "telemetry file is 4 GB" months into production use.

---

## 2. Critical findings (CRIT)

### CRIT-A — Layout split-pane changes are not persisted

- **Where:** `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx:219–229` (`useSplitSlotCallback`) vs `src/renderer/components/Layout/layoutPresets/LayoutPresetResolverProvider.tsx:155–163` (`swapSlots`).
- **Verified asymmetry:**
  - `swapSlots` at L155–163:
    ```ts
    setSlotTree((prev) => {
      const next = /* swap */;
      persistence.save(next as SerializedSlotNode);   // L157 — persists
      return next;
    });
    ```
  - `useSplitSlotCallback` at L222–228:
    ```ts
    state.setSlotTree((prev) => {
      const sourceDesc = state.preset.slots[sourceSlot] ?? { componentKey: sourceSlot };
      const sourceLeaf: LeafSlot = { kind: 'leaf', slotName: sourceSlot, component: sourceDesc };
      return unsplitIfOrphan(splitLeafWith({ tree: prev, targetSlot, source: sourceLeaf, direction, position }));
      // no persistence.save(...) call
    });
    ```
- **User impact:** Silent loss of DnD-split layouts on reload. No error, no warning.
- **Fix:** Add `persistence.save(next as SerializedSlotNode)` inside the `setSlotTree` updater in `useSplitSlotCallback`. Add a test asserting that after a split + page reload, the persisted tree contains the split.
- **Blocks:** Any dogfood of the Wave 28 DnD feature that measures "did the layout survive a reload."

### CRIT-B — Forked-thread reactions overwrite source-thread reactions

- **Where:**
  - Fork preserves message `id`: `src/main/agentChat/threadStoreFork.ts:37, 44`:
    ```ts
    return source.messages.slice(0, idx + 1).map((m) => ({ ...m, threadId: newId }));
    ```
    `...m` spreads the full record including `id`; only `threadId` is replaced.
  - Table schema: `src/main/agentChat/threadStoreSqliteHelpers.ts:33–42`:
    ```sql
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT NOT NULL, threadId TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      ...
      PRIMARY KEY (id, threadId)   -- composite PK permits same id across threads
    );
    ```
  - Reactions update: `src/main/agentChat/threadStoreSqliteReactions.ts:28`:
    ```ts
    db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(encoded, messageId);
    //                                                  ^^^^^^^^^^^ no threadId filter
    ```
- **Failure scenario:** User forks thread A at message M. Both threads' rows for M coexist (composite PK permits it). User reacts `+1` on M in the fork. `UPDATE ... WHERE id = ?` matches both rows. Source thread A silently gains the same `+1` reaction. Same mechanism applies to `setMessageCollapsedSql` at L38 — collapse state also leaks.
- **Fix:** Change both SQL statements to `UPDATE messages SET reactions = ? WHERE id = ? AND threadId = ?`. Pass `threadId` through the call chain. Add a test that forks a thread, reacts on the fork, and asserts the source thread's reactions are unchanged.
- **Blocks:** Correctness of reactions in any workflow that uses forks or side chats.

### CRIT-C — Fork-created threads do not appear in the thread tree

- **Where:**
  - `src/main/agentChat/threadStoreFork.ts:87` — forks write `parentThreadId: source.id` at the root level of the thread record (not inside `branchInfo`).
  - `src/renderer/components/AgentChat/buildThreadTree.ts` (per the subagent's read) — builds the tree by following `thread.branchInfo?.parentThreadId`.
  - `threadStoreSqlite.rowToThread()` populates both `branchInfo` (from a JSON column) and `parentThreadId` (from a separate column) as independent fields — they are not aliased.
- **Failure scenario:** User forks a thread. The fork is persisted with `parentThreadId` correctly set. In the sidebar's thread-tree view, the fork appears at the top level, not nested under its source. Two separate code paths for "branching" exist: `branchThread` (uses `branchInfo`) is the older path and does show hierarchy; `forkThread` (uses root-level `parentThreadId`) does not. This is user-visible inconsistency, not just a UI nit.
- **Fix:** Choose one parentage field and make both creation paths write to it. Update `buildThreadTree` to read from the canonical field. Given `parentThreadId` is already in the schema as its own column and is the cleaner design, migrate `branchInfo.parentThreadId` → top-level `parentThreadId` and update the tree builder.
- **Blocks:** Discoverability of forks, which is the whole point of the feature.

---

## 3. High-severity findings (HIGH)

### HIGH-A — `traceBatcher` never initialised or drained in production

- **Where:** `src/main/telemetry/traceBatcher.ts:131` (`initTraceBatcher`) and `:145` (`drainTraceBatcher`).
- **Verification:** Grep across all of `src/main` shows zero production callers — only `traceBatcher.test.ts` calls them. `enqueueTrace` is called from `claudeStreamJsonRunner.ts:158, 244, 248` — those pushes go into a module-level queue whose flush interval was never started.
- **Impact:** The `orchestration_traces` telemetry table is never written in production. Wave 29.5 Phase I claimed C5 was "wired" but only the `enqueueTrace` call sites were wired — the batcher lifecycle was not. All orchestration trace data is silently dropped.
- **Fix:** Call `initTraceBatcher()` once during main-process startup (likely in `mainStartup.ts` alongside `initTelemetryStore`). Call `drainTraceBatcher()` in the `will-quit` handler in `main.ts`, before `closeTelemetryStore()`. Add a startup smoke test.
- **Blocks:** Any analysis that requires orchestration_traces data. The Router (Wave 31 learned ranker) and context outcome correlation rely on this table per the Wave 29.5 plan — at minimum this is a research-quality blocker.

### HIGH-B — JSONL event mirror is never instantiated in production

- **Where:** `src/main/telemetry/telemetryJsonlMirror.ts:101` (`createTelemetryJsonlMirror`).
- **Verification:** Grep shows zero production callers — only the barrel export in `index.ts:13` and the test file. `main.ts` only calls `initTelemetryStore(app.getPath('userData'))` with no mirror companion.
- **Impact:** The plan promised a dual-write to SQLite and JSONL for operator-level grepability. Only SQLite is written. The 10 MB rotation and 30-day `purgeOldFiles` advertised in Wave 15 §1 do not run (there are no `events-YYYY-MM-DD.jsonl` files to rotate or purge because the mirror never fires).
- **Fix:** Either instantiate the mirror in `initTelemetryStore` (and call `purgeOldFiles` on a daily timer), or retire the mirror code. Leaving it tested-but-dead is the worst of both worlds. If it stays, add integration coverage that writes via the store and asserts a JSONL line appeared.
- **Blocks:** Operator grepability of event logs.

### HIGH-D — Telemetry SQLite retention purge has no scheduler

- **Where:** `src/main/telemetry/telemetryStoreHelpers.ts:189` (`purgeRetainedRows`). Grep shows it is only called inside tests. No scheduled timer, no startup call.
- **Impact:** `telemetry.db` grows without bound. The 30-day retention advertised in the Wave 15 plan does not run.
- **Fix:** Call `purgeRetainedRows(db, 30 * 24 * 60 * 60 * 1000)` on a daily interval (`setInterval` in `initTelemetryStore`), and once at startup.
- **Blocks:** Long-term telemetry storage. Low severity in absolute terms (SQLite compaction is rare and the rows are small), but the plan explicitly promised it; it's just not wired.

### HIGH-E — Worktree GC gap: archived sessions leak worktrees on disk

- **Where:** `src/main/session/sessionGc.ts` deletes session trash files but does not call `worktreeManager.remove()` for sessions where `session.worktree === true`.
- **Impact:** With `sessions.worktreePerSession` off by default this is not a current-production risk. When turned on, every archived session leaves a git worktree on disk indefinitely. The Wave 16 risk table noted ~500 MB/session. No startup scan detects orphans. The plan referenced "Wave 20 adds a GC command" — no such command was implemented.
- **Fix:** In `sessionGc.ts`, when removing a session record, also call `worktreeManager.remove(session.workspaceRoot, session.id)` if `session.worktree === true`. Wrap in try/catch — worktree removal failures should log but not block session GC. Separately, add a startup scan that compares `git worktree list` output to active sessions and warns on orphans.
- **Blocks:** Turning `sessions.worktreePerSession` on by default.

### HIGH-F — Graph indexer follows symlinks unchecked

- **Where:** `src/main/codebaseGraph/indexingPipelineSupport.ts:127–155` (`walkDirectoryImpl`).
- **Verified:** Walker uses `fs.readdir(dir, { withFileTypes: true })` at L133 and filters by `e.isDirectory()` at L138 / `e.isFile()` at L139. Node's `Dirent` with `withFileTypes` resolves symlinks — `isDirectory()` returns `true` for a symlink pointing to a directory. No `entry.isSymbolicLink()` check exists anywhere in the file. `ALWAYS_IGNORE_DIRS` (line 29) includes `node_modules` but only checks the immediate directory name — a symlink named `modules` pointing to `node_modules` slips through.
- **Impact:** A project that contains a symlink to `/`, `C:\`, `/Users/`, or any large tree will cause the indexer to walk the entire tree (capped only by `maxFiles: 10000` and per-file `maxSize: 512KB`). Not just a performance issue — the indexer will read files outside the project root, exposing them to graph-based search (`searchCode`) by any consumer of the graph controller.
- **Fix:** Before recursing into `entry.isDirectory()`, explicitly reject `entry.isSymbolicLink()` unless the resolved target is within the project root (use `fs.realpath` + prefix check). At minimum, reject all symlinks to be safe; cross-repo symlinks are uncommon enough that the restriction has low UX cost.
- **Blocks:** Safe indexing of any project the user doesn't fully control (e.g. an opened external repo, a cloned contribution).

### HIGH-G — Side chat drawer conversation body is unimplemented

- **Where:** `src/renderer/components/AgentChat/SideChatDrawer.tsx` per the Wave 20–23 audit. `SideChatDrawerBody` receives `hasChats` but renders an empty `<div className="flex-1 min-h-0 overflow-hidden" />` when `hasChats` is true.
- **Impact:** The side-chat shell (tabs, toggle, persistence) is complete but the actual conversation view inside the drawer is a stub. Users who open a side chat see the tab list but no messages. The feature advertised in Wave 23 is functionally incomplete.
- **Fix:** Wire `SideChatDrawerContent` to render `AgentChatConversation` (or equivalent) for the active side-chat store. This is scoped work, not a structural gap.
- **Blocks:** Shipping side chats as a user-visible feature.

---

## 4. Medium and low findings (MED / LOW)

### Security / data integrity

- **MED** — Telemetry PII in payload column: `enqueueEvent` stores `JSON.stringify(payload)` verbatim at `telemetryStore.ts:164`. `HookPayload.prompt`, `input`, `output`, `data` may contain file content, credentials, or personal data — all unredacted in `telemetry.db`. No scrubbing pass exists. Needs a `redactPayload` helper similar to `crashReporter.redactPaths` before storage.
- **MED** — `git:worktreeAdd` IPC handler accepts `projectRoot` from the renderer without `assertPathAllowed` (`src/main/ipc-handlers/worktree.ts:68`). The rendering validation is `validateWorktreePath` which only checks that the *resolved worktree path* stays in the allowed root — the `cwd` supplied to `git worktree list` is unchecked. A renderer-controlled `projectRoot` value can make `git worktree list` run in an arbitrary cwd.
- **MED** — Research cache `purgeExpired()` exists (`researchCache.ts`) but has no scheduled caller. Cache grows unboundedly until restart. Expiry is only evaluated lazily on `get()`.
- **MED** — `sessionCrud:setMcpOverrides` stores any `string[]` of MCP server IDs with no validation against the registered-servers list. A future compromised renderer could enable arbitrary MCP servers on a session.
- **MED** — `profileLint` rule for `permissionMode='bypass' + Bash` returns `severity: 'error'` but the IPC handler does not block save. The lint is advisory-only. If the intent is a security gate, `handleUpsert` should reject profiles with any `error`-level lint.
- **MED** — `docs/context-injection.md:177` still documents `rerankerEnabled` default as `true (implicit)`; schema has `default: false` (already flagged in the primary review — still uncorrected).
- **MED** — `schema_meta.schema_version` is seeded `'1'` at `telemetryStoreHelpers.ts:77` and never updated. Wave 29.5 raised `ContextOutcome.schemaVersion` to `2` at the record level but the SQLite schema version did not advance in lockstep — two independent versioning systems that could diverge.
- **LOW** — `console.warn` used in `telemetryStore.ts:225` and `traceBatcher.ts:90`. ESLint's `no-console: warn` doesn't error on `console.warn` (only `.log`), so these slipped through. Inconsistent with the `log` module used elsewhere and bypasses `electron-log` output files.
- **LOW** — JSONL file permissions on Unix: `fs.openSync(filePath, 'a')` in `telemetryJsonlMirror.ts:47` uses the process umask. World-readable by default on most Unix systems. Moot while the mirror is never instantiated, but becomes relevant if HIGH-B is fixed.
- **LOW** — `(gc as any)._db` access in `contextSelector.ts:246` for PageRank integration — silent failure if the internal property is renamed (caught by outer try/catch).

### Correctness / invariants

- **MED** — Streaming reducer gaps (`AgentChatStreamingReducers.ts`): no duplicate-chunk guard, no out-of-order handling beyond positional append. If IPC delivers a chunk twice (retry, broadcast race), the text is doubled. No test covers these.
- **MED** — Diff review has no stale-diff detection. If a user modifies a file externally between `git:diffReview` load and `git:stageHunk`/`git:revertHunk`, git returns a patch-apply error that surfaces in the UI as an unexplained rollback to `pending`. No user-visible message. No test for this path.
- **MED** — Wave 21 `folderCrud:delete` drops folder rows without re-parenting the sessions inside. Sessions silently become unfiled — no user notification, no `sessionCrud:changed` event. Tests verify the data change but not the UX story.
- **MED** — Wave 21 thread search has a hardcoded `DEFAULT_LIMIT = 20` that silently truncates. Not documented in `docs/mobile-*` or the API contract.
- **LOW** — Edit provenance is not clock-rollback-safe (`editProvenance.ts`): `markAgentEdit` uses `Date.now()` directly; an NTP correction backwards can reset the 2-second suppression window.
- **LOW** — `pruneExpiredProjects` iterates without a single wrapping transaction (`graphGc.ts:61–85`). A mid-loop crash leaves partial state; next boot resumes correctly, so this is cosmetic.
- **LOW** — PageRank at 10k-node cyclic graph terminates (bounded `maxIterations = 50`) but does not converge to `epsilon = 1e-6` — produces a nearly-uniform result. Quality degradation, not DoS.
- **LOW** — PageRank `buildPersonalizationVector` silently falls back to uniform distribution when all seeds are out-of-graph. Callers are not notified.
- **LOW** — Wave 26 profile precedence (`session toolOverrides > profile enabledTools > unset`) is not directly unit-tested at the `buildResolvedOptions` level; only individual layers are tested.
- **LOW** — Wave 27 subagent `subagent:updated` broadcast fires on `cancel` but not on natural `completed/cancelled` transitions via the hook tap. Live UI must refresh on timer rather than event.
- **LOW** — Wave 27 subagent cost is not rolled into parent session cost display — two separate cost streams, undocumented.
- **LOW** — Wave 27 subagent docstring advertises a "30-second temporal window heuristic" that is not implemented in code.

### Code quality / structure

- **MED** — `src/main/agentChat/threadStoreFork.ts` + `buildThreadTree.ts` have two coexisting parentage systems (`branchInfo.parentThreadId` vs root-level `parentThreadId`) that the renderer and backend disagree on. This is the structural cause of CRIT-C; flagging separately so that the fix is "unify the data model," not just "patch the tree builder."
- **MED** — `src/renderer/components/Layout/AppLayout.tsx` at 299 lines, `ContentRouter.tsx` at 300, `diffReviewState.ts` at 300, `AgentChatStreamingReducers.ts` at 299 — four files at or within one line of the ESLint `max-lines: 300` cap. The cap is actively binding; next addition will force a split.
- **LOW** — Two hardcoded `rgba(...)` colors and one `#f85149` in `LayoutListItem.tsx:173, 180, 181` applied via `element.style.backgroundColor` in `onMouseEnter`, bypassing the pre-commit token checker (which scans static JSX).
- **LOW** — Wave 17 `handlePromoteToGlobal` does not deduplicate preset names — two global presets can have the same `name`.
- **LOW** — Wave 28 `useLayoutSensors` registers only `PointerSensor` and `TouchSensor`. No `KeyboardSensor`. Drag handles are keyboard-focusable but non-operable — WCAG 2.1 2.1.1 gap.
- **LOW** — Wave 28 hidden drag handles on mobile (`[data-layout='resize-handle'] { display:none }`) still register `useDraggable`. On phone viewports, a pointer that lands on the handle element can initiate a drag concurrent with `useSwipeNavigation`. No explicit `enabled: viewport !== 'phone'` gate exists on `DragAndDropProvider`.
- **LOW** — Wave 26 `AnyOverrides = Record<string, any>` type alias in `chatOrchestrationRequestSupportHelpers.ts:337` suppresses type safety for inference-control resolution.
- **LOW** — `TODO(Wave 20)` markers in `layoutPresets/presets.ts:47, 50` indicate chat-primary preset slot assignments still incomplete per the plan.

### Docs / operations

- **LOW** — `src/main/CLAUDE.md:137` still says `internalMcp/` is "not yet wired into startup" (flagged in the primary review; still stale).
- **LOW** — `contextTypes.ts:42` comments reference `context_decisions` / `context_outcomes` tables that Wave 29.5 dropped (`telemetryStoreHelpers.ts:69` documents the drop).
- **LOW** — Wave 15 plan §2 DDL and Wave 16 plan §4 idempotency claims use the old `sessions` key name; actual implementation uses `sessionsData` (renamed in Wave 40 Phase D). The plans were written before that rename; not a bug but a reader-confusing doc drift.
- **LOW** — Wave 16 plan §6 promised a startup `[worktree] orphaned path detected` log line and a "Wave 20 GC command." Neither exists.
- **LOW** — Wave 29.5 plan Phase I names `providers/claudeCodeAdapter.ts` as the wiring site for `recordTrace`; actual wiring is in `claudeStreamJsonRunner.ts`. Intent was implemented but the plan reference is stale.

---

## 5. Per-wave assessment (Waves 15–29)

Ratings 1–5. Same scale as the primary review.

| Wave | Theme | Impl. | Tests | Docs | Notes |
|------|-------|------:|------:|-----:|-------|
| 15 | Telemetry foundation | 4 | 4 | 3 | WAL mode, batched flush, close-flush invariants all enforced and tested. JSONL mirror is code-complete but never instantiated in production (HIGH-B). SQLite retention purge has no scheduler (HIGH-D). PII in payload column (MED). `console.warn` instead of `log.warn` in two places (LOW). |
| 16 | Session primitive + worktree | 4 | 3 | 3 | Worktree path validation is sound. Migration to `sessionsData` (post-Wave-40) is idempotent and tested. Worktree GC gap (HIGH-E). `projectRoot` not validated at IPC boundary (MED). `sessionId` format not asserted before use as path component. |
| 17 | Layout preset engine | 4 | 4 | 4 | Three-tier storage (built-in + custom-per-session + global) works. LRU and cap enforcement tested. Duplicate global names possible (LOW). No schema-version field on persisted trees — unrecognised `kind` falls through silently (borderline; not a current production concern). |
| 18 | Graph GC + edit provenance | 4 | 4 | 4 | GC is atomic-per-project via `ON DELETE CASCADE`. Idempotency-gated `purgeSkippedNodes` wrapped in a transaction. Symlink following in the walker (HIGH-F) is the load-bearing concern. Clock-rollback edit-provenance window (LOW). |
| 19 | PageRank + provenance weights | 4 | 3 | 3 | Convergence bounded by `maxIterations`; no DoS. Seeds filtered and fallback to uniform when empty (LOW silent fallback). No realistic-fixture convergence test; no test for max-file-aggregation with multiple symbols. `(gc as any)._db` access (LOW). |
| 20 | Chat-primary layout + sidebar | 3 | 3 | 3 | Sidebar subscribes to list changes via `sessionCrud:changed` but not to active-session changes — inter-window drift possible. Folder delete cascades visually but not via event. |
| 21 | Thread organization | 3 | 3 | 3 | Folders + tags + pins + search. Many-to-many folder mapping at the data layer but one-to-one in the UI. Hardcoded `DEFAULT_LIMIT = 20` for thread search (MED). Folder-delete orphan handling (MED). |
| 22 | Message polish | 3 | 2 | 3 | Streaming reducer tested only for the `complete` chunk path — empty/duplicate/out-of-order cases untested (MED). Reaction cap absent; any string accepted as `kind`. No XSS vector in rendering (positive). |
| 23 | Side chats + branching | 2 | 2 | 2 | Two parentage systems coexist (CRIT-C). Cross-fork reaction leakage (CRIT-B). Side chat drawer body is a stub (HIGH-G). Merge operation is a transclude (no position-at-N semantics — the "conflict" scenario is not a real concern here). |
| 24 | Context decision logging + reranker | 4 | 4 | 2 | Reranker fail-closed paths comprehensively tested. `rerankerEnabled` default `false` correctly enforced at code. Stdin-based prompt (no shell injection). Doc line still wrong (MED). |
| 25 | Research + pinned context | 4 | 3 | 3 | Five-tier TTL matrix + semver normalisation. Pinned context session-scoped with `MAX_ACTIVE_PINS = 10` + token-budget dropping. `purgeExpired()` never scheduled (MED). Research IPC handler has argument validation but lacks end-to-end coverage. |
| 26 | Profiles / inference controls / tool toggles | 4 | 3 | 3 | Override precedence correctly embedded in `resolveInferenceControls` but not directly unit-tested (LOW). `bypass+Bash` lint is advisory only (MED). MCP server ID allowlist absent (MED). `AnyOverrides` type escape hatch (LOW). |
| 27 | Subagent UX | 4 | 4 | 3 | Comprehensive subagent test file covers all IPC handlers including PTY-kill-on-cancel. Cost not rolled into parent display (LOW). Natural-completion `subagent:updated` broadcast missing (LOW). In-memory only; lost on restart — undocumented. |
| 28 | Drag-and-drop pane composition | 2 | 3 | 3 | Structural shell solid. Split persistence bug (CRIT-A) is the only reason this isn't a 4. No keyboard accessibility path (LOW). No mobile-viewport arbitration with swipe nav (LOW). Hardcoded colors (LOW). |
| 29 | Diff review + graph panel + rule authoring | 4 | 3 | 3 | Diff review cleanly uses `git apply --cached` / `-R`, correctly rolls back UI on failure. `commands:*` / `rulesDir:*` paths rely on `path.basename` + regex sanitisation (traversal-safe). No stale-diff detection (MED). `diffReviewState.ts` at the 300-line cap. |
| 29.5 | Data foundation repair | 4 | 4 | 3 | C1 (correlationId pairing) correctly implemented. C3 (`ContextOutcomeRecord` shape) at `schemaVersion: 2`. C5 call sites wired in `claudeStreamJsonRunner.ts` — but the batcher itself is never initialised/drained (HIGH-A). `schema_meta.schema_version` not bumped in lockstep (MED). Plan file references old file paths in two places (LOW). |

---

## 6. Updates to the primary review's critical-moving-parts judgments

The primary review made judgments on Waves 31, 33a, 34, 36, 37, 38. This addendum adds:

### Telemetry + observability foundation (Wave 15)
**Infrastructure is solid; operational wiring is incomplete.** The SQLite store, WAL mode, batched writes, and close-time flush are all correct and tested. Three separately-shipped sub-systems (JSONL mirror, traceBatcher, retention purge) are code-complete and unit-tested but never turned on in production. This is the most visible "tested-but-dead" pattern in the audit — if I had to guess why, the most likely explanation is that these were landed separately and a subsequent wiring PR was missed. The fix is a 10–20 line `mainStartup.ts` change per sub-system, not a rewrite.

### Session primitive + worktrees (Wave 16)
**Strong invariant enforcement (path validation, migration idempotency); operational gap in GC.** Worktree GC is the hinge: ship it, and `sessions.worktreePerSession` becomes safe to enable. Without it, enabling the flag means unbounded worktree growth on disk.

### Chat stack (Waves 20–23)
**This is the area that most needs fixes before any further feature work.** The three CRITs (CRIT-A through CRIT-C) cluster here, and the side chat drawer is a stub (HIGH-G). The fork/branch/parentage dual-system (CRIT-C plus the behind-the-scenes `branchInfo` vs top-level `parentThreadId` split) is structural debt that will hurt any future work on thread hierarchy visualisation or branch-based search. Recommend a scoped refactor: one parentage field, one creation path.

### Context pipeline (Waves 18, 19, 24)
**Mathematically sound, operationally solid.** PageRank convergence is bounded, GC is atomic, reranker fail-closed paths are comprehensive. The reranker is correctly off by default and the cold-start rationale is documented in the schema. Symlink following in the graph indexer (HIGH-F) is the only sharp edge, and it is defensively bounded by `maxFiles: 10000`.

### Research + profiles + subagents (Waves 25, 26, 27)
**Mature features. Minor operational hygiene gaps.** Research cache unscheduled purge (MED), profile bypass+Bash advisory-only (MED), subagent cost not rolled into parent display (LOW). None of these block shipping.

---

## 7. Operational readiness additions

Items to add to the primary review's operational checklist:

Tier 1 — do before next dogfood:

- [ ] **CRIT-A** fix: persist splits in `useSplitSlotCallback`.
- [ ] **CRIT-B** fix: add `threadId` to reactions and collapsed SQL.
- [ ] **CRIT-C** fix: unify thread parentage field; update `buildThreadTree`.
- [ ] **HIGH-A** fix: call `initTraceBatcher()` at startup, `drainTraceBatcher()` at quit.
- [ ] **HIGH-B** decision: wire JSONL mirror or remove it.
- [ ] **HIGH-D** fix: schedule `purgeRetainedRows` on a daily interval.
- [ ] **HIGH-E** fix: call `worktreeManager.remove()` from `sessionGc.ts`.
- [ ] **HIGH-F** fix: reject symlinks in graph indexer walker, or `realpath`-check against project root.
- [ ] **HIGH-G** fix: wire `SideChatDrawerBody` to render the active side-chat conversation.

Tier 2 — do before 1.0:

- [ ] Schedule `researchCache.purgeExpired()` on a daily interval.
- [ ] Add PII redaction pass to `enqueueEvent` in the telemetry store.
- [ ] Add `assertPathAllowed` (or equivalent validation) to `git:worktreeAdd`.
- [ ] Add stale-diff detection to diff-review flow.
- [ ] Add empty/duplicate/out-of-order chunk tests to the streaming reducer.
- [ ] Enforce MCP server ID allowlist in `sessionCrud:setMcpOverrides`.
- [ ] Decide on the `bypass+Bash` profile lint: gate or advisory (pick one, document).
- [ ] Add a `sessionCrud:changed` event when `folderCrud:delete` orphans sessions.

Tier 3 — debt cleanup:

- [ ] Replace `console.warn` in telemetry code with `log.warn`.
- [ ] Bump `schema_meta.schema_version` to `2` to match `ContextOutcome.schemaVersion`.
- [ ] Add `KeyboardSensor` to `useLayoutSensors` (Wave 28 WCAG gap).
- [ ] Add `enabled: viewport !== 'phone'` gate on `DragAndDropProvider`.
- [ ] Replace hardcoded colors in `LayoutListItem.tsx` with tokens.
- [ ] Dedupe global preset names in `handlePromoteToGlobal`.
- [ ] Correct `contextTypes.ts:42` stale table references.

---

## 8. What this addendum did not cover

- Any of the Waves 30–40 findings — those are in the primary review.
- UI/UX visual correctness — code-read only, no browser run.
- The `symbolExtractor/`, `rulesAndSkills/` internals in any depth — the Wave 29 audit focused on the authoring IPC channels, not the full subsystem.
- Cross-window state coherence (e.g. if two BrowserWindows edit the same thread simultaneously) — would require a multi-window integration test that doesn't exist.
- Performance benchmarks. Graph indexing walk-time and PageRank timing on real 10k-node cycles were not measured.

---

*End of addendum. Read with `waves-15-40-review.md`.*
