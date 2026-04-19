# Wave 41 — Review Remediation

## Implementation Plan

**Version target:** v2.7.0 (minor — closes review debt; no new user-visible features).
**Feature flags:** N/A. Every fix either tightens an existing surface or wires existing code; no new flags introduced.
**Dependencies:** `roadmap/waves-15-40-review.md` (primary review) and `roadmap/waves-15-29-review-addendum.md` (addendum). Both must be read end-to-end before executing any phase.
**Goal:** Close every CRIT and HIGH finding; close the majority of MEDs; leave LOWs for opportunistic cleanup. Ship nothing new — restore confidence in what's there.

**Why this is one wave, not split across minor releases:** The CRITs cluster (mobile gate + marketplace install + chat data correctness + wiring gaps) is a coherent "ship-readiness" pass. Splitting it delays when the Wave 33a / 34 / 37 feature flags can safely default on. Treat this as a blocking wave for mobile rollout.

---

## Phase breakdown

| Phase | Scope | Severity | Complexity | Key files |
|-------|-------|---------|------------|-----------|
| A | **Mobile capability gate — reclassifications.** `pty:write/resize/kill` → desktop-only (or per-session gate); `marketplace:install` → desktop-only; `codemode:status` → paired-read; add `platform:openCrashReportsDir` + `providers:checkAllAvailability` to catalog; add `sessionDispatch:status`/`:notification`/`compareProviders:event`/`ecosystem:promptDiff` to `UNCLASSIFIED_ALLOWLIST`; remove phantoms. | CRIT-1, HIGH-2, MED | Medium | `src/main/mobileAccess/channelCatalog.{write,read,desktopOnly,always}.ts`, `channelCatalogCoverage.test.ts` |
| B | **Runtime-derived coverage test.** Replace hand-maintained `HANDLER_REGISTRY_CHANNELS` with a runtime capture from `installHandlerCapture`. Detect any live channel that is neither in catalog nor allowlist. | HIGH-2 structural | Medium | `src/main/web/handlerRegistry.ts`, `channelCatalogCoverage.test.ts` (rewrite) |
| C | **Marketplace hardening.** Production-build guard on placeholder key; revocation check inside `installById`; theme payload key-shape allowlist; `installBundle('prompt')` confirmation UX hook; mark `rules-and-skills` install kind explicitly blocked until wired. | CRIT-2, CRIT-3, HIGH-4 | Medium | `src/main/marketplace/{trustedKeys,marketplaceClient,marketplaceInstall,signatureVerify}.ts`; new `scripts/check-marketplace-key.ts` |
| D | **Auto-update downgrade block.** Track rejected versions; block `updater:download` handler when target is rejected; add test asserting download is suppressed (not just warned). | HIGH-1 | Small | `src/main/updater.ts`, `src/main/ipc-handlers/miscRegistrars.ts`, `src/main/updater.test.ts` |
| E | **Chat data correctness.** Unify fork parentage into top-level `parentThreadId` everywhere (retire `branchInfo.parentThreadId`); add `threadId` to reactions + collapsed SQL; add `persistence.save(...)` in `useSplitSlotCallback`; wire `SideChatDrawerBody` to render the active conversation. | CRIT-A, CRIT-B, CRIT-C, HIGH-G | Medium-Large | `src/main/agentChat/threadStoreFork.ts`, `threadStoreSqliteReactions.ts`, `src/renderer/components/AgentChat/buildThreadTree.ts`, `SideChatDrawer.tsx`, `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx` |
| F | **Telemetry + batcher wiring.** Call `initTraceBatcher()` / `drainTraceBatcher()` from main-process lifecycle; instantiate `createTelemetryJsonlMirror` (or formally delete it — see Architecture notes); schedule `purgeRetainedRows` + JSONL `purgeOldFiles` on daily interval + at startup; schedule `researchCache.purgeExpired()`. | HIGH-A, HIGH-B, HIGH-D | Medium | `src/main/mainStartup.ts`, `src/main/main.ts`, `src/main/telemetry/index.ts`, `src/main/research/researchCache.ts` |
| G | **Worktree GC + path safety.** Call `worktreeManager.remove()` from `sessionGc.ts` for archived sessions with worktrees; add startup orphan-worktree log; add `assertPathAllowed` (or equivalent) to `git:worktreeAdd` projectRoot; validate `sessionId` format at IPC boundary. | HIGH-E | Small-Medium | `src/main/session/sessionGc.ts`, `src/main/ipc-handlers/worktree.ts`, `src/main/session/worktreeManager.ts` |
| H | **Graph indexer symlink hardening.** Reject symlinks in the walker; use `realpath` to confirm directory entries remain inside the project root; optionally promote to stat-based check with clear failure logs. | HIGH-F | Small | `src/main/codebaseGraph/indexingPipelineSupport.ts` |
| I | **Web preload parity decision + execution.** For each of the ~30 missing API namespaces, decide: mirror in `webPreloadApis*.ts` OR reclassify `desktop-only` in catalog. Produce an explicit scope document (`docs/mobile-scope.md`). Execute the decided mapping. | HIGH-6 | Large | `src/web/webPreloadApis*.ts`, `src/main/mobileAccess/channelCatalog.*.ts`, `docs/mobile-scope.md` (new) |
| J | **Test additions.** Real-socket resume integration; full-flow session dispatch; signed-bundle install round-trip; provider matrix conformance; prompt → ordered-output learned ranker E2E; streaming reducer edge cases; diff review stale-file path; reactions cross-fork isolation; split-pane persistence round-trip. | HIGH-5, MED test gaps | Large | Multiple new `*.test.ts` files across main/renderer |
| K | **PII + crash tightening.** Add `redactPayload` pass to `telemetryStore.enqueueEvent`; tighten crash-reporter regex to cover non-`\Users\` Windows paths and add token/secret scrub; restrict webhook to `https:` unless debug flag; validate webhook hostname optionally. | MED security | Medium | `src/main/telemetry/telemetryStore.ts`, `src/main/crashReporter.ts` |
| L | **Validation + allowlist hardening.** `validateProjectPath` → `fs.realpathSync` symlink resolution; `sessionCrud:setMcpOverrides` → validate against registered server list; `profileLint` `bypass+Bash` → gate or document as advisory (pick one). | MED correctness | Small-Medium | `src/main/ipc-handlers/sessionDispatchHandlers.ts`, `src/main/profiles/profileLint.ts`, `src/main/ipc-handlers/sessionCrud.ts` |
| M | **Doc regeneration + schema-driven doc-gen.** Regenerate `docs/data-model.md` from `configSchemaTail.ts`; fix `docs/context-injection.md` rerankerEnabled; correct `docs/mobile-access.md` rate limit; remove `ecosystem.moat` from `docs/ecosystem.md`; correct crash-report path/format/type in `docs/platform.md`. Add `scripts/check-docs-schema.ts` CI check. | HIGH-3 | Medium | All `docs/*.md`, new `scripts/check-docs-schema.ts` |
| N | **Streaming + message polish fixes.** Duplicate-chunk guard; out-of-order blockIndex handling; empty-textDelta noop; reaction-kind allowlist (UI-level); per-message reaction cap at data layer; `subagent:updated` broadcast on natural completion. | MED correctness | Small-Medium | `src/renderer/components/AgentChat/AgentChatStreamingReducers.ts`, `src/main/agentChat/threadStoreSqliteReactions.ts`, `src/main/subagentTracker.ts`, `src/main/hooksSubagentTap.ts` |
| O | **Folder cascade + thread search fixes.** Emit `sessionCrud:changed` (or `folderCrud:changed` with re-derived orphan list) when a folder with sessions is deleted; surface thread-search `DEFAULT_LIMIT = 20` in API + UI (show "+N more"). | MED correctness | Small | `src/main/session/folderStore.ts`, `src/main/agentChat/threadStoreSearch.ts`, `src/renderer/components/AgentChat/ThreadSearchResults.tsx` |
| P | **Diff review stale detection + DnD accessibility.** Detect staleness in diff review (mtime compare or stat check on stage/revert); add `KeyboardSensor` to `useLayoutSensors`; gate `DragAndDropProvider` on `viewport !== 'phone'`. | MED UX | Medium | `src/renderer/components/DiffReview/diffReviewState.ts`, `src/renderer/components/Layout/layoutPresets/useDragAndDrop.ts` |
| Q | **Code quality + dead code sweep.** Delete `src/main/orchestration/providers/anthropicApiAdapter.ts` (252 lines) and `src/main/router/llmJudge.ts`; merge the two `anthropicAuth.ts` files; merge the two `findPython` implementations; replace hardcoded colors in `LayoutListItem.tsx`; fix stale CLAUDE.md claims; commit untracked `test-output-weights.json` fixture; fix `e2e/streaming-inline-edit.spec.ts` (remove or rewrite); de-export `normalizeImportToLibrary`; replace `console.warn` with `log.warn` in telemetry code. | MED/LOW debt | Medium | Many; see phase detail |
| R | **Capstone — verification + soak gates + handoff.** Full `vitest run` + `tsc --noEmit` + `npm run lint` + playwright e2e green. Update `CLAUDE.md` Known Issues. Write `roadmap/wave-41-completion-report.md` summarising what shipped. Update `roadmap/session-handoff.md`. | Verification | Small | All verification; new handoff |

---

## Detailed phase plans

### Phase A — Mobile capability gate reclassifications

**Goal:** Move destructive or over-privileged channels out of the paired tier; add missing catalog entries; remove phantom entries.

**Specific changes:**

1. **`src/main/mobileAccess/channelCatalog.write.ts`:**
   - Move to `channelCatalog.desktopOnly.ts`: `pty:write`, `pty:resize`, `pty:kill`, `marketplace:install`.
   - Delete the comment at L190–192 ("paired-write: they affect running terminals but do not spawn new ones") — the rationale is wrong.
   - Move `codemode:status` → `channelCatalog.read.ts` (`paired-read/short`).
2. **`src/main/mobileAccess/channelCatalog.read.ts`:**
   - Remove phantom entries: `compareProviders:event`, `ecosystem:promptDiff` (both push-only).
3. **`src/main/mobileAccess/channelCatalog.desktopOnly.ts`:**
   - Add `platform:openCrashReportsDir` (`desktop-only/short`).
4. **`src/main/mobileAccess/channelCatalog.always.ts`:**
   - Add `providers:checkAllAvailability` (`always/short`) OR `paired-read/short` — decide based on whether the availability check leaks path info; if yes, use `paired-read`.
5. **`src/main/mobileAccess/channelCatalogCoverage.test.ts`:**
   - Add to `UNCLASSIFIED_ALLOWLIST`: `sessionDispatch:status`, `sessionDispatch:notification`, `compareProviders:event`, `ecosystem:promptDiff`.
   - Remove `app:getSystemInfo` from `HANDLER_REGISTRY_CHANNELS` (preload implements locally; no handler exists). Also remove the catalog entry.

**Alternative for CRIT-1:** If mobile terminal interaction is a required feature, add a per-session `allowMobileInput: boolean` to `ptyState.ts::PtySession`. Only Claude Code–managed PTY sessions (spawned via `ptyAgent.ts`) get `allowMobileInput: true`. The capability gate then checks both the catalog class and the per-session flag. This is more code but preserves the feature. Decision deferred to implementer; default is blanket `desktop-only`.

**Tests to add:**
- `channelCatalogCoverage.test.ts` — assert `pty:write/resize/kill` are NOT in `WRITE_CATALOG`; assert they are in `DESKTOP_ONLY_CATALOG`.
- Assert `marketplace:install` is `desktop-only`.
- Assert every push-only channel is in allowlist; every invocable channel is in catalog; no phantom catalog entries.

**Acceptance:**
- No new classifications added without justification in a code comment.
- `channelCatalogCoverage.test.ts` passes and its assertions are exhaustive.
- Manual review confirms the security argument: "If a paired device is compromised, the worst it can do is …"

---

### Phase B — Runtime-derived coverage test

**Goal:** Make the coverage test self-maintaining. Hand-maintained channel lists have already let `platform:openCrashReportsDir` and `providers:checkAllAvailability` slip through.

**Specific changes:**

1. **`src/main/web/handlerRegistry.ts`:** Export the populated registry `Map` as a read-only view (e.g. `getRegisteredChannels(): readonly string[]`). Ensure it's populated only after `installHandlerCapture()` + a full startup, which requires a test harness that boots enough of main to register all handlers.
2. **`src/main/mobileAccess/channelCatalogCoverage.test.ts`:** Rewrite to:
   - Import `registerIpcHandlers()` from the IPC orchestration module.
   - Boot a minimal Electron-like environment (or mock `ipcMain.handle` to record names).
   - Assert every registered channel is in catalog or allowlist.
   - Additionally: assert every catalog entry has a registered handler (flush out phantom entries).
3. Alternative if full-boot test is too heavy: keep the static list but generate it from a `tools/dump-ipc-channels.ts` script that scans `src/main/` for `ipcMain.handle(` calls. Commit the generated file with a guard that fails CI if the generated file is stale.

**Tests to add:**
- The test above is the test.

**Acceptance:**
- Adding a new `ipcMain.handle('foo:bar', ...)` without adding `foo:bar` to catalog or allowlist fails the test locally and in CI.
- The two currently-missing channels (`platform:openCrashReportsDir`, `providers:checkAllAvailability`) are caught by the test before the human remembers to add them to the list.

---

### Phase C — Marketplace hardening

**Goal:** Close the three marketplace finding clusters (placeholder key, revocation, install scope).

**Specific changes:**

1. **`scripts/check-marketplace-key.ts` (new):**
   ```ts
   // Runs in CI as a prebuild step.
   import { TRUSTED_PUBLIC_KEY_BASE64 } from '../src/main/marketplace/trustedKeys';
   if (process.env.NODE_ENV === 'production' && TRUSTED_PUBLIC_KEY_BASE64 === 'REPLACE_WITH_PRODUCTION_KEY') {
     throw new Error('production build refused: marketplace key is still the placeholder');
   }
   ```
   Wire into `package.json` `prebuild` or a dedicated `build:verify` step.
2. **`src/main/marketplace/marketplaceClient.ts:44–61` (`installById`):**
   - Before calling `installBundle`, call `getRevokedIds()`. If `ids.includes(entry.id)`, return `{ success: false, error: 'bundle-revoked' }`.
   - If revocation fetch fails: fail-closed with `{ success: false, error: 'revocation-check-failed' }`. Offer a config flag `marketplace.allowInstallOnRevocationFetchFailure` (default `false`) for offline scenarios; document in `docs/ecosystem.md`.
3. **`src/main/marketplace/marketplaceInstall.ts:23–37` (`installTheme`):**
   - Add a key-shape allowlist: `/^--[a-z][a-z0-9-]*$/`. Reject payload keys that don't match with `{ success: false, error: 'theme-key-invalid' }`.
4. **`src/main/marketplace/marketplaceInstall.ts:49–57` (`installRulesAndSkills`):**
   - Keep the stub, but add an explicit feature flag `ecosystem.rulesAndSkillsInstallEnabled` (default `false`). When flag is off, return `rules-install-disabled`. This clarifies "not wired" vs "deliberately disabled".
5. **Per primary review CRIT-2:** `marketplace:install` is reclassified `desktop-only` in Phase A. No additional change needed here.

**Tests to add:**
- `marketplaceClient.test.ts` — install revoked bundle → rejected. Revocation fetch failure → rejected unless flag on.
- `marketplaceInstall.test.ts` — theme with bad key shape → rejected.
- New `signatureVerify.build.test.ts` — import the key constant and assert it is not the placeholder when `process.env.CI_RELEASE` is set.

**Acceptance:**
- CI blocks a release build if the placeholder key is still present.
- Installing a revoked-but-signed bundle is rejected.
- Installing a theme with attacker-controlled non-CSS-custom-property key is rejected.

---

### Phase D — Auto-update downgrade block

**Goal:** Make the downgrade guard actually block, not just warn.

**Specific changes:**

1. **`src/main/updater.ts`:**
   - Add a module-level `Set<string> rejectedVersions`.
   - In `guardDowngrade`, on detection, add `info.version` to `rejectedVersions`.
   - Export `isVersionRejected(version: string): boolean`.
2. **`src/main/ipc-handlers/miscRegistrars.ts:170–172` (`updater:download` handler):**
   - Before calling `u.downloadUpdate()`, check `isVersionRejected(lastOfferedVersion)` (capture the last version from `update-available` events). If rejected, return `{ success: false, error: 'downgrade-rejected' }`.
3. **`src/main/updater.test.ts`:**
   - Add test: downgrade detected + renderer calls `updater:download` → handler returns error without calling `downloadUpdate`.

**Tests to add:**
- See above.

**Acceptance:**
- Downgrade warning logs + the download channel refuses to proceed. Both are asserted.

---

### Phase E — Chat data correctness

**Goal:** Fix the three chat CRITs plus the side-chat stub.

**Specific changes:**

**E.1 — Unify fork parentage (CRIT-C):**
1. **Audit usages.** `grep -n "branchInfo\.parentThreadId"` and `grep -n "parentThreadId"` across `src/`. Make a list.
2. **Decide:** canonical field is top-level `parentThreadId`.
3. **`src/main/agentChat/threadStoreRerun.ts` (`branchThreadFrom`):** change to write `parentThreadId` at top level, not inside `branchInfo`. Keep `branchInfo` for branch-name metadata only.
4. **Migration:** for existing threads with `branchInfo.parentThreadId` set and no top-level `parentThreadId`, lift the value at load time. Persist the lift on next save. Add to `sessionMigration.ts` or new `threadMigration.ts`.
5. **`src/renderer/components/AgentChat/buildThreadTree.ts`:** switch to reading top-level `parentThreadId`. Keep `branchInfo` read as a legacy fallback for one release.
6. Update tests.

**E.2 — Reactions threadId scoping (CRIT-B):**
1. **`src/main/agentChat/threadStoreSqliteReactions.ts:22–29` (`setMessageReactionsSql`):**
   - Add `threadId: string` parameter. Change SQL to `UPDATE messages SET reactions = ? WHERE id = ? AND threadId = ?`.
2. **Same for `setMessageCollapsedSql` at L33–42.**
3. **`src/main/agentChat/threadStoreSqlite.ts:274`:** pass `threadId` through the call.
4. **Call sites upstream:** `addReaction`, `removeReaction`, `setMessageCollapsed` — trace and add `threadId` through to the SQL boundary.
5. **`src/main/agentChat/threadStoreSqliteReactions.test.ts`:** add a test that forks a thread (or inserts two rows with shared `id`), sets reactions on one `threadId`, asserts the other is unchanged.

**E.3 — Split-pane persistence (CRIT-A):**
1. **`src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx:219–229` (`useSplitSlotCallback`):**
   - Accept `persistence: ReturnType<typeof useLayoutPersistence>` via the `state` object (expose it if not already).
   - Inside the `setSlotTree` updater, compute `next` explicitly, then call `persistence.save(next as SerializedSlotNode)` before returning `next`.
2. **`LayoutPresetResolverProvider.tsx`:** ensure `persistence` is available on `ProviderState` — may require a small interface change.
3. **Audit other mutators:** `removeLeaf`, any future pane-mutation, should all follow the same save pattern. Consider extracting a `mutateAndSave` helper to prevent this class of bug from recurring.
4. **Tests:** new `useSplitSlotCallback.test.ts` — mount provider, call `splitSlot`, assert `persistence.save` was called. Existing `LayoutPresetResolverProvider.test.tsx` should be extended with a save assertion for splits too.

**E.4 — Side chat body wiring (HIGH-G):**
1. **`src/renderer/components/AgentChat/SideChatDrawer.tsx`:** replace the empty `<div>` stub in `SideChatDrawerBody` with an `AgentChatConversation` (or equivalent renderable) bound to the active side-chat store.
2. Verify the side-chat store is correctly seeded with the forked conversation when the drawer opens; if not, wire `createSideChat` to populate it.
3. Tests: add an integration test that opens a side chat, asserts the conversation renders with the source thread's message history up to the fork point.

**Tests to add:**
- Described per sub-phase above.

**Acceptance:**
- Reaction on forked thread does not affect source thread (asserted).
- Split-pane layout persists across reload (asserted).
- Fork parentage visible in tree renderer (asserted with a fork-inside-fork fixture).
- Side chat drawer shows the conversation, not an empty div.

---

### Phase F — Telemetry + batcher wiring

**Goal:** Turn on what was built. Explicitly decide on dead-code cases.

**Specific changes:**

1. **`src/main/telemetry/index.ts`:** already exports `initTraceBatcher` + `drainTraceBatcher`. Make them mandatory parts of `initTelemetryStore` and `closeTelemetryStore` — compose inside those functions so callers don't need to remember.
2. **`src/main/main.ts:307` (`will-quit` handler):** ensure `drainTraceBatcher()` runs before `closeTelemetryStore()`. If the composition in step 1 is done, this is automatic.
3. **`createTelemetryJsonlMirror` decision:**
   - **Decision required:** wire it or delete it. Default = delete (it has no production consumers and the SQLite store suffices).
   - If wiring: instantiate in `initTelemetryStore`, compose into `enqueueEvent`, schedule `purgeOldFiles` daily. Document behavior in `docs/telemetry.md` (new or existing).
   - If deleting: remove `telemetryJsonlMirror.ts`, its tests, and exports. Update CLAUDE.md.
4. **`purgeRetainedRows` scheduling:** add a daily `setInterval` (24h) in `initTelemetryStore` that calls `purgeRetainedRows(db, 30 * 24 * 60 * 60 * 1000)`. Also call once at startup, `setImmediate`-deferred.
5. **`researchCache.purgeExpired()`:** same pattern — daily interval + startup call. Wire into `mainStartup.ts`.
6. **`research:invoke` handler:** confirm end-to-end wiring; if absent, add an integration test.

**Tests to add:**
- `telemetryStore.lifecycle.test.ts` — boot, enqueue traces, trigger `will-quit`, assert traces persisted.
- `researchCache.scheduled.test.ts` — with fake timers, advance 24h, assert `purgeExpired` ran.

**Acceptance:**
- `initTraceBatcher` is called exactly once per app startup; `drainTraceBatcher` is called on shutdown.
- `purgeRetainedRows` runs on schedule.
- `createTelemetryJsonlMirror` is either fully wired or fully deleted — no middle state.

---

### Phase G — Worktree GC + path safety

**Specific changes:**

1. **`src/main/session/sessionGc.ts`:** before deleting a session record, check `session.worktree === true`. If so, call `worktreeManager.remove(session.workspaceRoot, session.id)` wrapped in try/catch. Log on failure but don't block session GC.
2. **`src/main/session/sessionStartup.ts`:** add an orphan-worktree scan — for each known project root, call `git worktree list`, cross-reference to active sessions, log `[worktree] orphaned path detected: …` for each orphan. Optionally offer an IPC handler `sessions:cleanOrphanWorktrees` for manual cleanup.
3. **`src/main/ipc-handlers/worktree.ts:68`:** add `assertPathAllowed(event, projectRoot)` check before using `projectRoot` as cwd.
4. **`src/main/ipc-handlers/worktree.ts`:** validate `sessionId` matches `/^[a-f0-9-]{36}$/` (UUID v4 pattern) before use. Reject otherwise with `{ success: false, error: 'invalid-session-id' }`.

**Tests to add:**
- `sessionGc.worktree.test.ts` — mock `worktreeManager.remove`, assert it's called on GC of a worktree-bearing session.
- `worktree.pathSecurity.test.ts` — attempt to supply non-UUID sessionId; attempt to supply projectRoot outside allowed roots; both rejected.

**Acceptance:**
- `sessions.worktreePerSession = true` can be enabled without disk-leak concern.
- Renderer-supplied `projectRoot` / `sessionId` cannot escape validation.

---

### Phase H — Graph indexer symlink hardening

**Specific changes:**

1. **`src/main/codebaseGraph/indexingPipelineSupport.ts:127–155` (`walkDirectoryImpl`):**
   - Before recursing or statting, check `entry.isSymbolicLink()`. If true, resolve via `fs.realpath`. If the resolved path does not start with `ctx.projectRoot + path.sep`, skip.
   - If stat fails for any reason, skip silently (current behavior).
2. **Add a structured log event** when a symlink is skipped: `log.warn('[indexer] skipped symlink outside project root', { name, resolved, projectRoot })`.
3. **Optional:** add a fuzz test that builds a temp project containing a symlink to the test tmpdir, asserts the indexer does not walk outside the project.

**Tests to add:**
- `indexingPipelineSupport.symlink.test.ts` (Unix only or platform-guarded) — create a temp project with a symlink to a sibling dir, assert `walkDirectory` returns only files inside the project root.

**Acceptance:**
- Symlinks to directories outside the project root are not walked.
- Symlinks inside the project root (valid worktree-style symlinks) still work.

---

### Phase I — Web preload parity decision + execution

**Goal:** Resolve the mass API gap explicitly. This is the largest phase.

**Specific changes:**

1. **`docs/mobile-scope.md` (new):** For each of the ~30 API namespaces listed in the primary review (HIGH-6), decide:
   - **Mirror** — implement in `webPreloadApis*.ts` with the correct return shape.
   - **Desktop-only** — remove from types' mobile-accessible set; reclassify channels `desktop-only`.
   - **Stub** — add a noop with `{ success: false, error: 'desktop-only' }` for graceful degradation.
2. **Execute the mapping.** For each namespace:
   - Mirror cases: add to `src/web/webPreloadApis.ts` or the appropriate `*Supplemental` file; update types if needed.
   - Desktop-only cases: move catalog entries to `channelCatalog.desktopOnly.ts`.
3. **`channelCatalogCoverage.test.ts`:** add assertions for the final decided shape.

**Suggested default mapping (recommend all three):**
- Mirror: `sessionCrud:*`, `folderCrud:*`, `pinnedContext:*`, `profileCrud:*`, `layout:*`, `subagent:*`, `checkpoint:list`, `agentChat:searchThreads`, `agentChat:setThreadTags`, `agentChat:getThreadTags`, `agentChat:getBufferedChunks`, `marketplace:listBundles`, `marketplace:revokedIds`, `ecosystem:exportUsage`, `ecosystem:lastExportInfo`, `research:getDashboardMetrics`, `agentChat:getThreadCostRollup`.
- Desktop-only (keep out of mobile): `ai:*`, `embedding:*`, `telemetry:queryEvents`, `observability:exportTrace`, `backgroundJobs:enqueue` (long-running, poorly suited for mobile), `checkpoint:create/restore`, `graph:*` (the full codebase graph; paired-read potentially but heavy), `spec:scaffold`, `router:getStats`, `workspaceReadList:*`, `perf:*`.
- Stub: `approval:{remember,forget,listMemory}`, `research:invoke` (keep behind a feature flag — it's an LLM call with cost).

**Tests to add:**
- For each mirrored namespace, add one "happy path" invocation test that confirms the round-trip works (or mocks the transport).

**Acceptance:**
- `docs/mobile-scope.md` committed.
- Every channel in `HANDLER_REGISTRY_CHANNELS` (or the runtime-captured equivalent from Phase B) is either in `webPreloadApis*.ts` or classified `desktop-only`.

---

### Phase J — Test additions

**Tests to add (one subsection each):**

1. **`src/main/web/bridgeResume.integration.test.ts`** — start real `ws` server on ephemeral port; connect real client; issue resumable call; simulate disconnect; reconnect; assert result resolves.
2. **`src/main/ipc-handlers/sessionDispatchHandlers.test.ts`** — new file; test IPC → queue → runner chain. Mock `spawnAgentSession` but exercise the glue.
3. **`src/main/marketplace/marketplaceRoundtrip.test.ts`** — generate Ed25519 keypair; sign a bundle; call `installById` through the full chain; assert config is written.
4. **`src/main/providers/providerMatrix.test.ts`** — run all three providers (Claude, Codex, Gemini) through the same `SpawnOptions`; assert returned `SessionHandle` conforms.
5. **`src/main/orchestration/contextSelector.e2e.test.ts`** — fixture prompt + real feature extraction + real classifier + real ranker + mocked reranker → assert top-N stable ordering.
6. **`src/renderer/components/AgentChat/AgentChatStreamingReducers.edge.test.ts`** — empty `textDelta`, duplicate chunk ID, out-of-order `blockIndex`.
7. **`src/renderer/components/DiffReview/diffReviewState.stale.test.ts`** — simulate external file mutation between load and stage; assert UI state rollback + user-visible error.
8. **`src/main/agentChat/threadStoreFork.reactions.test.ts`** — fork a thread, react on the fork, assert source thread reactions unchanged.
9. **`src/renderer/components/Layout/layoutPresets/persistence.integration.test.ts`** — split a pane, unmount, remount, assert split restored.

**Acceptance:**
- All tests added; all passing.
- Coverage report shows meaningful increase on the affected modules.

---

### Phase K — PII + crash tightening

**Specific changes:**

1. **`src/main/telemetry/telemetryStore.ts:164` (`enqueueEvent`):** add `redactPayload(payload)` before `JSON.stringify`. Scrub:
   - Known secret-y keys: `token`, `accessToken`, `refreshToken`, `apiKey`, `password`, `authorization`.
   - Replace matching string values with `'[REDACTED]'`.
   - Also apply to nested objects recursively.
2. **`src/main/crashReporter.ts:42–50` (`redactPaths`):**
   - Generalise Windows-path regex to `/[A-Za-z]:\\[^\\/:*?"<>|\r\n]+\\[^\\/:*?"<>|\r\n]+\\/g` — any drive + any two-level path, not only `*:\Users\*\`.
   - Add token/key scrubbing similar to telemetry: regex patterns for common key formats (`sk-ant-*`, `sk-*`, JWT three-part tokens, long hex strings that look like tokens).
3. **`src/main/crashReporter.ts:77` (`postToWebhook`):** restrict protocol to `https:` unless `config.platform.crashReports.allowInsecure === true`. Document the flag in `docs/platform.md`.
4. **Optional:** hostname allowlist in config — `config.platform.crashReports.allowedHosts: string[]`. If set and non-empty, reject hostnames not in the list.

**Tests to add:**
- `telemetryStore.redact.test.ts` — event with nested secrets is stored with `'[REDACTED]'` markers.
- `crashReporter.redact.extended.test.ts` — stack traces containing `D:\Projects\alice\...`, `sk-ant-...`, and JWT are all redacted.
- `crashReporter.webhook.test.ts` — `http:` URL rejected unless `allowInsecure` flag set.

**Acceptance:**
- No realistic PII string reaches `telemetry.db` payload blob without redaction.
- Crash reports on non-`\Users\` Windows paths are redacted.
- Webhook rejects `http:` by default.

---

### Phase L — Validation + allowlist hardening

**Specific changes:**

1. **`src/main/ipc-handlers/sessionDispatchHandlers.ts:67–84` (`validateProjectPath`):**
   - Replace `path.resolve` with `fs.realpathSync` for the final check. If `realpathSync` throws (path doesn't exist), keep the current `path.resolve` behavior as a fallback (still valid for "will be created"). If it resolves and the resolved path is outside any root, reject.
2. **`src/main/ipc-handlers/sessionCrud.ts` (for `sessionCrud:setMcpOverrides`):**
   - Fetch the list of registered MCP server IDs via `mcp.getServers()` (or equivalent). Filter the input to only include registered IDs. Reject with `{ success: false, error: 'unknown-mcp-server', unknownIds: [...] }` if any ID is not registered.
3. **`src/main/profiles/profileLint.ts`:**
   - Decide: is `bypass+Bash` a gate or a warning?
   - If gate: `handleUpsert` in `profileCrud.ts` rejects on any `severity: 'error'` lint item. Add test.
   - If warning: document in `docs/agentChat.md` or `docs/profiles.md` that this is a warning only; the user is responsible.
   - Default recommendation: gate it.

**Tests to add:**
- `sessionDispatchHandlers.validatePath.test.ts` — symlink pointing outside project rejected.
- `sessionCrud.setMcpOverrides.test.ts` — unknown MCP ID rejected.
- `profileCrud.upsert.lint.test.ts` — `bypass+Bash` profile cannot be saved (assuming gate decision).

**Acceptance:**
- Symlink-based path escapes in dispatch rejected.
- Arbitrary MCP IDs cannot be set on a session.
- Profile lint decision is explicit in code and docs.

---

### Phase M — Doc regeneration + schema-driven doc-gen

**Specific changes:**

1. **`scripts/check-docs-schema.ts` (new):**
   - Parse `configSchemaTail.ts` to extract the JSON schema tree.
   - For each config flag, check that it appears in at least one doc file. Report missing.
   - Run in CI; fail on drift.
2. **`docs/data-model.md`:** full rewrite of the `AppConfig` section. Regenerate from schema. Remove `streamingInlineEdit`. Add all Wave 32–38 flags.
3. **`docs/context-injection.md:177`:** fix `rerankerEnabled` default to `false`.
4. **`docs/mobile-access.md:101`:** fix rate limit to "10 attempts per 15-minute window".
5. **`docs/ecosystem.md:8`:** remove `ecosystem.moat` as a "flag"; replace with "feature theme, not gated by a config flag".
6. **`docs/platform.md:65`:** change "array in config" → "object (map) in config" for `dismissedEmptyStates`.
7. **`docs/platform.md:167`:** correct crash-reports path + format to match `app.getPath('userData')/crashes/crash-${timestamp}.log`.
8. **Known Issues audit:** re-read `CLAUDE.md` and update the list based on Phases A–L.
9. **Stale CLAUDE.md fixes:** `src/main/CLAUDE.md:137` — update internalMcp from "not yet wired" to "wired and active" (already corrected in root; finish it here).
10. **`roadmap/session-handoff.md`:** after Wave 41 completes, full rewrite.

**Tests to add:**
- The `check-docs-schema.ts` script IS the test.

**Acceptance:**
- CI fails if a schema flag is undocumented.
- All six identified doc errors corrected and verified with `grep`.

---

### Phase N — Streaming + message polish fixes

**Specific changes:**

1. **`src/renderer/components/AgentChat/AgentChatStreamingReducers.ts`:**
   - Maintain a `Set<string> seenChunkIds` per message. Reject duplicates.
   - For out-of-order `blockIndex`: prefer index-targeted write over append; ensure array is sparse-safe.
   - Empty `textDelta`: keep as no-op (already safe).
2. **`src/main/agentChat/threadStoreSqliteReactions.ts`:** add a per-message cap — if `reactions.length >= MAX_REACTIONS_PER_MESSAGE` (e.g. 64), drop the oldest when adding a new one. OR reject. Pick and document.
3. **Reaction kind allowlist:** add to `src/shared/types/agentChat.ts` — `ReactionKind = '+1' | '-1' | ...`. Narrow the IPC handler to validate against the type. Prevents renderer-injected novel kinds.
4. **Subagent natural-completion broadcast:** in `src/main/hooksSubagentTap.ts`, after `recordEnd`, call `broadcastSubagentUpdated(childSessionId)`. Currently only `cancel` broadcasts.

**Tests to add:**
- `AgentChatStreamingReducers.edge.test.ts` (also part of Phase J).
- `threadStoreSqliteReactions.cap.test.ts` — exceeding cap behaves per decision.
- `hooksSubagentTap.broadcast.test.ts` — natural completion triggers broadcast.

**Acceptance:**
- Streaming reducer is robust to adversarial chunk delivery.
- Reactions have a documented cap.
- Live subagent UI does not need a refresh timer to see natural completion.

---

### Phase O — Folder cascade + thread search fixes

**Specific changes:**

1. **`src/main/session/folderStore.ts` (`applyDelete`):** after removing the folder record, iterate `folder.sessionIds` and emit a `sessionCrud:changed` event per session (or a single event with the list of now-unfiled sessions). Renderer `useSessions` already subscribes.
2. **`src/main/agentChat/threadStoreSearch.ts`:** accept `limit` as a parameter; default 20 at call sites; IPC handler `agentChat:searchThreads` accepts optional `limit` up to 100. Surface `{ results, hasMore: boolean }` shape.
3. **Renderer:** `ThreadSearchResults` (or equivalent) shows "+N more — narrow search to see all" when `hasMore === true`.

**Tests to add:**
- `folderStore.cascade.test.ts` — delete folder, assert `sessionCrud:changed` emitted.
- `threadStoreSearch.limit.test.ts` — 30 matches, limit 10, returns 10 + `hasMore: true`.

---

### Phase P — Diff review stale detection + DnD accessibility

**Specific changes:**

1. **`src/renderer/components/DiffReview/diffReviewState.ts` or the handler calling `git:stageHunk`:**
   - Capture file mtime when diff is loaded. On stage/revert, compare; if changed, surface a user-visible "File was modified externally — refresh diff" prompt before proceeding. User must explicitly choose to retry.
2. **`src/renderer/components/Layout/layoutPresets/useDragAndDrop.ts`:**
   - Add `KeyboardSensor` to `useLayoutSensors`. Expose keyboard commands (e.g. arrow keys move selected pane, Enter drops) per dnd-kit's docs.
   - Gate the whole provider on `viewport !== 'phone'` if the mobile swipe-vs-drag conflict is real in practice; if not, document why and skip.

**Tests to add:**
- `diffReviewState.stale.test.ts` (also Phase J).
- `useDragAndDrop.keyboard.test.ts` — keyboard activation moves a pane.

---

### Phase Q — Code quality + dead code sweep

**Specific changes:**

1. **Delete unused files:**
   - `src/main/orchestration/providers/anthropicApiAdapter.ts` (252 lines; TODO-marked duplicate).
   - `src/main/router/llmJudge.ts` (zero importers per knip).
2. **Merge duplicates:**
   - Two `anthropicAuth.ts` — keep `src/main/auth/providers/anthropicAuth.ts`; migrate consumers of `src/main/orchestration/providers/anthropicAuth.ts` and delete the orchestration copy.
   - Two `findPython` implementations — keep one (decide which by caller count); adapt the other's callers; delete.
3. **Hardcoded colors in `src/renderer/components/Layout/layoutPresets/LayoutListItem.tsx:173, 180, 181`:** replace with `var(--surface-hover)`, `var(--status-error)`, `var(--status-error-subtle)` (or closest existing token). Verify with pre-commit token checker.
4. **`e2e/streaming-inline-edit.spec.ts`:** delete (the flag is gone).
5. **`tools/__fixtures__/train-context/test-output-weights.json`:** commit.
6. **`src/main/CLAUDE.md:137`:** change "SSE MCP server (implemented, not yet wired into startup)" → "SSE MCP server (wired and active — see main.ts:22, 126, 137)".
7. **`contextTypes.ts:42`:** remove stale `context_decisions` / `context_outcomes` table references.
8. **`src/renderer/i18n/useLocale.test.ts:7`:** remove stale comment referencing deleted test.
9. **`src/main/agentChat/pairingHandlers.ts:114`:** remove stale TODO (stub is no longer a stub).
10. **`src/main/research/triggerEvaluator.ts:23`:** remove the unused `normalizeImportToLibrary` re-export.
11. **`src/main/telemetry/telemetryStore.ts:225` + `traceBatcher.ts:90`:** replace `console.warn` with `log.warn`.
12. **`schema_meta.schema_version`:** bump to `'2'` in a migration step — update `telemetryStoreHelpers.ts` to write `'2'` for new DBs; add a migration path that bumps existing `'1'` → `'2'` (only if no structural change is required, i.e. the bump documents Wave 29.5's JSONL schema changes).
13. **IPC handler error strings:** `aiHandlers.ts:112 'disabled'`, `embeddingHandlers.ts:42,57,68 'embeddings_disabled'`, `sessionDispatchHandlers.ts:119 'invalid-request'`, `summarizationQueue.ts:184 'unknown'` — replace with user-actionable messages.
14. **Root `CLAUDE.md`:** refresh themes list to include `light`, `high-contrast`.

**Tests to add:**
- None for deletions; rely on the existing suite.
- For error-message changes: existing handler tests may need updating.

**Acceptance:**
- `knip` reports zero dead exports in `src/main/orchestration/` and `src/main/router/`.
- No hardcoded colors in renderer source (pre-commit hook clean).
- `grep -rn 'console\.warn' src/main/` returns zero production hits.

---

### Phase R — Capstone

**Specific tasks:**

1. **Full verification suite:**
   - `npm run build`
   - `tsc --noEmit`
   - `npm run lint`
   - `npm test` (vitest)
   - `npm run test:e2e` (playwright) if available
2. **Smoke test manually in the running IDE** (since Ouroboros edits itself, some tests must be physical):
   - Create a fork, react on the fork, confirm source unchanged.
   - Split a pane, reload, confirm split persisted.
   - Enable `sessions.worktreePerSession`, create + archive a session, confirm worktree removed.
   - Disable mobile access, confirm all `pty:*` channels error when invoked from web.
3. **Write `roadmap/wave-41-completion-report.md`:** mirror Wave 40 audit report format. For each finding in the two reviews, state: fixed / deferred / rejected with reason.
4. **Update `roadmap/session-handoff.md`:** full rewrite.
5. **Update `CLAUDE.md`:** Known Issues list — remove everything closed by this wave; add anything deferred.

**Acceptance:**
- Every finding in the primary review and addendum is accounted for in the completion report.
- Full verification suite green.
- Completion report committed.

---

## Architecture notes

### Ordering

Phases A → B → C → D → E are independent from each other in terms of code coupling, but A/B block mobile rollout and must be done before any of the later mobile-facing work. Recommended order:
- **Day 1:** A, B, D (all small/medium, all unblock production rollout).
- **Day 2–3:** C, E (marketplace and chat correctness — these have more test coupling).
- **Day 4–5:** F, G, H (wiring gaps).
- **Week 2:** I (web preload parity — largest phase).
- **Week 2–3:** J (tests — can run in parallel with I).
- **Week 3:** K, L, M (security polish + docs).
- **Week 3–4:** N, O, P (correctness polish + accessibility).
- **Week 4:** Q (cleanup), R (capstone).

Total: ~4 weeks of focused work, or 6–8 weeks if interleaved with feature work.

### Flag strategy

No new flags in this wave. Several decisions could be gated behind flags, but the review's point is that the features are claimed to work — the fix is to make them actually work, not to add toggles that hide incomplete behavior.

One exception: `ecosystem.rulesAndSkillsInstallEnabled` (Phase C.4) is a new flag that defaults `false`. Rationale: it makes the "not wired" state explicit so the install path can fail-fast with a clear reason. Remove the flag when the install path is wired.

### Subagent parallelization

Phases A, B, D, G, H, K, L, N, O, P are small-to-medium and map well to individual subagents (one phase per Sonnet-agent task).

Phases C, E, F, I, J, M are larger; consider splitting each into sub-tasks before delegating:
- Phase E has four sub-parts (E.1 through E.4) that can run in parallel.
- Phase I is a decision phase first (mobile scope doc) then execution — sequential.
- Phase J is test additions; one agent per test file works.

Phase R (capstone) must be done by the parent (Opus) — it requires judgment on what to accept as "done".

### Rollback

Each phase is a separate commit (or set of commits). If a phase breaks something, `git revert <sha>` of just that phase restores prior behavior. Do NOT bundle multiple phases into a single commit.

---

## Risks

- **Phase A (mobile gate) could break dogfood:** after reclassifying `pty:write/resize/kill` as desktop-only, any in-flight mobile terminal workflow stops working. Coordinate with anyone currently dogfooding mobile access. If per-session gating (the alternative) is chosen instead, the complexity increases but the feature stays.
- **Phase B (runtime coverage test) is brittle to boot order:** if `installHandlerCapture()` is called after `ipcMain.handle(...)` for any channel, that channel is invisible. Write the test to explicitly assert boot order.
- **Phase C (marketplace) build guard requires CI coordination:** if the CI env doesn't set `NODE_ENV=production` or equivalent, the guard won't fire. Verify against actual CI config.
- **Phase E.1 (fork parentage unification) touches live data:** if users have existing threads with `branchInfo.parentThreadId` set, the migration must correctly lift to top-level. Test with a realistic fixture of nested forks.
- **Phase E.4 (side chat body) depends on side-chat store seeding:** if `createSideChat` is not populating the store with forked messages, the wiring fix will render an empty conversation for a different reason. Verify end-to-end.
- **Phase F (JSONL mirror decision) — if deleted, the Wave 15 plan's operator-grepability promise is broken.** This is a visible shift in product contract. Document the decision.
- **Phase H (symlink rejection) may break valid workspaces:** some monorepos use symlinks for cross-package references. Default to "reject all symlinks" is defensive; consider a `codebaseGraph.followSymlinks` config flag for advanced users. Start restrictive; relax on user report.
- **Phase I (web preload scope) is a product decision disguised as a wiring task.** The decision determines what mobile can do. This is not cosmetic — it should be reviewed by the owner.
- **Phase M (doc regeneration) assumes someone knows the ground truth for each flag.** Pair with a subject-matter-expert walk-through for correctness.
- **Phase Q (dead code sweep) — knip has false positives.** Don't blindly delete; verify each file's import graph manually before deleting.

---

## Acceptance

- All CRIT and HIGH findings from `roadmap/waves-15-40-review.md` and `roadmap/waves-15-29-review-addendum.md` have a corresponding entry in `roadmap/wave-41-completion-report.md` marked fixed, deferred, or rejected (with reason).
- `npm run build` clean.
- `tsc --noEmit` clean.
- `npm run lint` clean.
- `vitest run` all green (expect test count to rise significantly with Phase J additions).
- `channelCatalogCoverage.test.ts` runtime-derived version passes; no live channel slips through.
- Docs regeneration CI check passes.
- Manual smoke test of the five scenarios in Phase R passes.

---

## Deferred — explicitly not in this wave

These findings from the reviews are deliberately pushed to a later wave:

- **LOW findings that are purely cosmetic** (hardcoded `rgba()` in hover handlers beyond LayoutListItem, etc.) — sweep opportunistically.
- **LOW test-quality issues** like the `sessionDispatch.test.ts` type-literal tests — rewrite when the file is next touched for another reason.
- **Wave 28 keyboard accessibility beyond DnD** — broader accessibility audit is its own initiative.
- **Full GC policy for Ouroboros checkpoints** — `refs/ouroboros/checkpoints/<threadId>` retention is existing tech debt predating this review; fix separately.
- **`tokenStorage` localStorage-on-web hardening** (MED) — elevating to HIGH only if web mode is exposed beyond trusted networks; keep the finding documented but defer the fix until that scenario is real.
- **Replacing `AnyOverrides = Record<string, any>` in Wave 26 profile code** — one-line type escape hatch; fix when the surrounding code is next refactored.
- **Wave 19 PageRank convergence at 10k cyclic nodes** — bounded and non-DoS; profile in practice before tuning `maxIterations`.
- **Subagent persistence across restarts** — currently in-memory; a persistence layer is a feature, not a fix.

These will be tracked in `CLAUDE.md` "Known Issues / Tech Debt" so they aren't forgotten.

---

## Soak gates

Wave 41 is a remediation wave — it does not introduce soak-gated features. The only gated behavior is:

- **Mobile access enable default:** after Phase A + B + I + Phase J mobile integration tests + Phase R smoke tests all pass, `mobileAccess.enabled` default-flip from `false` to `true` is a *separate* decision that should happen in a follow-up patch release (v2.7.1 or v2.8.0). Two weeks of internal dogfood at the new defaults. Not part of Wave 41 itself.
- **`sessionDispatch.enabled` default:** same pattern. Defer to a follow-up release after Phase G + J land.
- **`marketplace:install` UX:** after Phase C, marketplace is desktop-only. Any future change to allow paired-device install is a *different* wave with its own soak.
- **Learned ranker (`context.learnedRanker`) default-on:** not changed by this wave. Wave 31 soak criteria unchanged.

---

*End of plan. Target start: when a reviewer approves scope. Target end: ~4 weeks of focused work.*
