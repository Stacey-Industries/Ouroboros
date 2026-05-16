# Waves 15–40 — Independent Post-Shipping Review

**Reviewer:** Claude Opus 4.7 (1M context, xhigh effort), with seven parallel Sonnet subagents for evidence gathering.
**Repo state reviewed:** `origin/master` @ `78e4c4e` (final handoff commit pre-review).
**Methodology:** Subagents produced evidence-only reports (file paths, line numbers, no synthesis). Every CRIT/HIGH finding below was re-read in-source by the reviewer before ranking. Waves 15–29 fell outside the handoff's focus areas and are not individually rated; this review concentrates on Waves 30–40 where the handoff directed scrutiny.

---

## 1. Executive summary

The Waves 30–40 code is **not ship-ready for remote use.** The desktop-only functionality is solid; the critical gaps are all in the mobile/web surface and the marketplace install path.

The single most dangerous line of code in this body of work is the comment at `src/main/mobileAccess/channelCatalog.write.ts:190–192`: *"pty:write/resize/kill are paired-write: they affect running terminals but do not spawn new ones."* The reasoning is wrong. `pty:write` sends arbitrary stdin to an already-running shell; if that shell is `bash`, `pwsh`, or anything interactive, a paired mobile device has remote keyboard access to the developer's terminal — which is functionally remote code execution. This must be reclassified `desktop-only` or gated by a per-session whitelist before mobile access is exposed beyond the developer's own LAN.

The second critical gap is the marketplace install path. `marketplace:install` is classified `paired-write` and writes to `ecosystem.systemPrompt` — meaning a signed bundle can persist a prompt injection that affects every subsequent agent session on the machine. The signature verification is mechanically correct and fail-closed with the placeholder key, but (a) there is no build-time enforcement that the placeholder is replaced, (b) the revocation list is not consulted during `installById`, and (c) the install scope is outside the project-root sandboxing that justifies other `paired-write` classifications.

The learned-ranker (Wave 31) and session-dispatch (Wave 34) cores are soundly implemented with good unit test coverage but have no end-to-end tests; the dispatch IPC handler layer specifically has no dedicated test file. Docs are noticeably drifted — `data-model.md` is six waves out of date and two other docs describe config flags that do not exist.

Ship desktop-only features now; gate `mobileAccess.enabled` behind a known-issues banner until the pty and marketplace classifications are fixed.

---

## 2. Critical findings (CRIT)

### CRIT-1 — `pty:write` / `pty:resize` / `pty:kill` classified `paired-write`: mobile-to-shell arbitrary input

- **Where:** `src/main/mobileAccess/channelCatalog.write.ts:190–200`
- **Code:** All three channels have `{ class: 'paired-write', timeoutClass: 'normal' }`. Comment at L191–192: "they affect running terminals but do not spawn new ones."
- **Threat model:** A paired mobile device (or a compromised paired device token) can send `pty:write` to any running PTY session owned by the desktop user. PTY sessions include plain shells (`bash`, `pwsh`, `cmd.exe`) and elevated shells (`sudo bash`, admin PowerShell). `pty:write` delivers arbitrary bytes to stdin — the moral equivalent of remote keyboard access. If the user has opened any interactive shell at all, the paired device has remote code execution as that user. If that shell is root/admin, the paired device has privileged RCE.
- **Why the reasoning is wrong:** The classification justification ("does not spawn new ones") treats `pty:spawn` as the danger. Spawning is not the danger; arbitrary stdin to an existing privileged process is. `pty:spawn` is correctly `desktop-only` — but that restriction is meaningless if `pty:write` can drive any session the user already has open.
- **Suggested fix:**
  - Reclassify `pty:write`, `pty:resize`, `pty:kill` as `desktop-only` by default.
  - If mobile terminal mirroring is a required feature, add per-session classification: Claude Code–managed PTY sessions (`ptyAgent.ts` spawns) may accept `pty:write` from paired devices; plain shells spawned via `pty:spawn` must not. This requires a session metadata field (e.g. `ptyState.ts::PtySession.allowMobileInput: boolean`) set at spawn time.
  - Add a coverage test that asserts no `pty:*` channel is in `WRITE_CATALOG` without an explicit per-session gate.
- **Blocks:** `mobileAccess.enabled` default-on shipping. Also blocks any public rollout of `sessionDispatch` unless the dispatch runner guarantees it never writes arbitrary bytes to paired-device-visible PTYs.

### CRIT-2 — `marketplace:install` is `paired-write` and can persist system-prompt injection and theme keys globally

- **Where:**
  - `src/main/mobileAccess/channelCatalog.write.ts:18` — `'marketplace:install': { class: 'paired-write', timeoutClass: 'normal' }`
  - `src/main/marketplace/marketplaceInstall.ts:39–47` — `installPrompt` calls `setConfigValue('ecosystem', { ...existing, systemPrompt: payload })`
  - `src/main/marketplace/marketplaceInstall.ts:23–37` — `installTheme` merges unvalidated attacker-controlled keys into `config.theming.customTokens`
  - `src/main/marketplace/marketplaceClient.ts:44–61` — `installById` does NOT consult `getRevokedIds()` before installing
- **Threat model:** A paired mobile device (or a compromised paired device, or — more realistically — a user operating their own paired device under social-engineering duress) can cause `installPrompt` to overwrite `config.ecosystem.systemPrompt`. That system prompt is injected into every subsequent agent session on the machine, including all Claude Code PTY sessions the user opens later. This is prompt injection at the infrastructure level — persistent, cross-session, and invisible unless the user opens Settings. The current signature check mitigates *content* tampering but not *choice of bundle* — a CDN compromise (or rotation mistake) that substitutes a legitimate-looking "prompt" bundle bypasses this. The unchecked revocation list means a compromised-and-revoked bundle is still installable as long as the attacker's copy of the signature is valid.
- **Suggested fix:**
  - Reclassify `marketplace:install` as `desktop-only`. Bundle installs alter global Claude Code behavior outside any project-root sandbox and should require physical presence at the desktop.
  - Add revocation check inside `installById` (before `installBundle`): fetch revoked IDs, reject if entry is listed, fail-fast on revocation-fetch-unavailable if `ecosystem.moat` is claimed to be a trust boundary.
  - Add a build-time guard (a `prebuild` npm script + CI check) that fails the build if `TRUSTED_PUBLIC_KEY_BASE64 === 'REPLACE_WITH_PRODUCTION_KEY'` in a production build. See CRIT-3.
  - Validate `installTheme` payload key shape — only CSS custom property names matching `--[a-z][a-z0-9-]*` should be accepted.
- **Blocks:** `ecosystem.moat` feature rollout, any marketplace-install UX reached via paired-device dispatch.

### CRIT-3 — `TRUSTED_PUBLIC_KEY_BASE64 = 'REPLACE_WITH_PRODUCTION_KEY'` with no build-time enforcement

- **Where:** `src/main/marketplace/trustedKeys.ts:20`
- **Status:** The placeholder IS fail-closed in practice (verified: `importPublicKey` at `signatureVerify.ts:20–46` returns `null` because the string is not valid base64 DER SPKI and decodes to non-32-byte buffer; `verifyBundleSignature` returns `false`). Test coverage confirms (`signatureVerify.test.ts:44`).
- **Threat model:** Operationally, a rushed replacement could:
  - Paste a public key in the wrong format (raw hex instead of base64 SPKI). The fallback at `signatureVerify.ts:34–45` handles raw-32-byte Ed25519, but silent misformatting is possible.
  - Accidentally substitute a private key thinking it is public. `crypto.createPublicKey` would accept a private-key–derived SPKI; it is not a safety net.
  - Ship a production build with the placeholder still present, then release a signed bundle that never verifies (availability failure, not security failure — but the user-visible failure mode is a marketplace that silently refuses to install anything).
- **Suggested fix:** Add a production-build guard:
  ```ts
  // In a prebuild.ts or CI check:
  if (TRUSTED_PUBLIC_KEY_BASE64 === 'REPLACE_WITH_PRODUCTION_KEY' && process.env.NODE_ENV === 'production') {
    throw new Error('refusing to build production bundle with placeholder marketplace key');
  }
  ```
  Add a runtime assertion at startup that logs a warning (not an error — dev builds should tolerate it) and publish the required key format in `docs/ecosystem.md`.
- **Blocks:** Shipping a public release where marketplace is advertised as working.

---

## 3. High-severity findings (HIGH)

### HIGH-1 — Auto-update downgrade guard only logs a warning; does not block the download

- **Where:** `src/main/updater.ts:104–113, 118–132`; handler at `src/main/ipc-handlers/miscRegistrars.ts:170–172`
- **Issue:** `guardDowngrade` returns a boolean that the `update-available` listener at L126–129 discards. The `updater:download` handler at `miscRegistrars.ts:170` calls `u.downloadUpdate()` directly with no check. Practical impact is currently limited because `autoDownload` is `false` (`updater.ts:42`) — but any renderer UI wired to the `updater:download` IPC will still trigger a downgrade download without blocking.
- **Fix:** Track the last downgrade-rejected version in a module-level `Set<string>`. In the `updater:download` handler, reject if the offered update matches a rejected version. Alternatively, call `autoUpdater.cancel()` (if supported by `electron-updater`) inside `guardDowngrade`.
- **Blocks:** Safe rollout of the `beta` update channel (Wave 38).

### HIGH-2 — `platform:openCrashReportsDir` and `providers:checkAllAvailability` bypass the capability gate

- **Where:**
  - `platform:openCrashReportsDir`: handler at `src/main/ipc-handlers/miscRegistrars.ts:242`, preload bridge at `src/preload/preloadSupplementalApis.ts:117`. No type declaration. Absent from every `channelCatalog.*.ts`. Absent from `HANDLER_REGISTRY_CHANNELS` in `channelCatalogCoverage.test.ts`.
  - `providers:checkAllAvailability`: handler at `src/main/ipc.ts:278`, preload at `src/preload/preload.ts:313`. Absent from every `channelCatalog.*.ts`. Absent from `HANDLER_REGISTRY_CHANNELS`.
- **Issue:** Because `HANDLER_REGISTRY_CHANNELS` is hand-maintained (see `channelCatalogCoverage.test.ts:75–77`: *"Derived statically from the handler registration grep output"*), the coverage test cannot flag these. A paired mobile client that speaks the raw JSON-RPC bridge can invoke them; the gate will look up the channel, find no catalog entry, and — unless the default is `desktop-only` fail-closed — allow passage. This is a coverage-test structural defect that has already let two channels slip through.
- **Threat model:** `providers:checkAllAvailability` probes environment for installed CLIs and may leak path information via error messages. `platform:openCrashReportsDir` opens a native folder via `shell.openPath` — desktop-only by nature; from a mobile WS client it would either silently no-op or trigger an odd desktop behavior.
- **Fix (channels):** Classify `providers:checkAllAvailability` as `paired-read`/`short`. Classify `platform:openCrashReportsDir` as `desktop-only`/`short`. Add both to `HANDLER_REGISTRY_CHANNELS`.
- **Fix (structural — more important):** Replace the hand-maintained `HANDLER_REGISTRY_CHANNELS` with a runtime-captured list from `installHandlerCapture()` in `src/main/web/handlerRegistry.ts`. Write a dedicated integration test that boots enough of the main process to run handler registration, reads the captured list, and asserts 1:1 correspondence between catalog + allowlist and registered handlers. The current static approach has been proven to miss live channels.
- **Blocks:** Catalog-based security claims generally. Until the coverage test is runtime-derived, any new channel can silently bypass the gate.

### HIGH-3 — `data-model.md` six waves out of date; two docs describe flags that do not exist

- **Where:**
  - `docs/data-model.md:108` still has `streamingInlineEdit: boolean` — the flag was removed in Wave 40 Phase F (`9827012`). Source tree has zero matches.
  - `docs/data-model.md` `AppConfig` interface omits every Waves 32–38 flag: `mobileAccess`, `sessionDispatch`, `theming`, `providers`, `ecosystem`, `platform`, `layout.mobilePrimary`. All are present in `configSchemaTail.ts:263–318`.
  - `docs/ecosystem.md:8` — documents `ecosystem.moat` as a feature flag (default `true`). The key does not exist in the schema. `configSchemaTail.ts:315` only has `ecosystem: { lastSeenSnapshot, lastExport, systemPrompt }`. "Moat" is a feature *theme*, not a flag.
  - `docs/context-injection.md:177` — documents `context.rerankerEnabled` default as `true (implicit)`. Verified: `configSchemaTail.ts:303` has `rerankerEnabled: { type: 'boolean', default: false }`, with a code comment explaining *why* it is off. This is a direct contradiction.
  - `docs/platform.md:65` — documents `platform.dismissedEmptyStates` as "an array in config". Schema (`configSchemaTail.ts:318`) defines it as `{ type: 'object', additionalProperties: { type: 'boolean' } }` — a map, not an array.
  - `docs/platform.md:167` — documents crash reports written to `~/.ouroboros/crash-reports/<ISO>.json`. Source writes to `path.join(app.getPath('userData'), 'crashes')` as `crash-${timestamp}.log`. Path, filename, and format all wrong.
  - `docs/mobile-access.md:101` — documents rate limit as "5 wrong attempts per IP per 60-second window". Source (`src/main/web/webAuth.ts:105–106`) is 10 attempts per 15 minutes. An operator who tunes based on the doc will get both the threshold and the window wrong.
- **Fix:** Full doc regeneration pass. Any config-related claim in a doc file should be regenerated from `configSchemaTail.ts` (consider a doc-gen tool that reads the schema, writes the tables, and a doctest that asserts the generated tables match what the doc claims). The mobile-access rate-limit claim should be corrected immediately.
- **Blocks:** Shipping docs to end-users.

### HIGH-4 — Marketplace revocation list not consulted during install

- **Where:** `src/main/marketplace/marketplaceClient.ts:44–61` (`installById`). Revocation is a separately-exported function (L66–68) that only the renderer calls through the `marketplace:revokedIds` IPC channel.
- **Issue:** If the renderer never fetches revoked IDs before calling `marketplace:install`, a revoked bundle installs cleanly — as long as its signature is valid.
- **Fix:** Move revocation check inside `installById`, before calling `installBundle`. Fail-closed if revocation fetch fails (optional: allow install with a warning if `ecosystem.moat` is off). Add a test with a fixture revoked-ID list.
- **Related:** This is part of the CRIT-2 cluster; called out separately because it is cleanly fixable in isolation.

### HIGH-5 — No end-to-end coverage for streaming resume or session dispatch

- **Where:** Per the test-coverage audit:
  - `src/main/web/bridgeResume.test.ts`, `inflightRegistry.test.ts`, `webPreloadTransport.resume.test.ts` — all layer-isolated with mocked WebSockets. No test exercises `webSocketBridge.ts → bridgeResume.ts → inflightRegistry.ts` over a real socket.
  - `src/main/session/sessionDispatchRunner.test.ts` mocks `spawnAgentSession`, `killSession`, `worktreeManager`, `broadcastJobStatus`, `notifyJobTransition`. `src/main/ipc-handlers/sessionDispatchHandlers.ts` has no test file at all (`sessionDispatch.test.ts` tests TypeScript type literals, not runtime behavior).
- **Issue:** A routing bug in `webSocketBridge.ts` that drops the `resume` method would not be caught. A bug in `dispatchTask` request validation or idempotency would not be caught. Both paths are soak-gated on dogfood; dogfood will be the first integration test.
- **Fix:** Add an integration test in `src/main/web/` that starts a real `ws` server on an ephemeral port, connects a real client, issues a resumable call, closes the socket, reconnects, and asserts the result resolves. Add `sessionDispatchHandlers.test.ts` that goes: IPC call → queue state → runner trigger → status broadcast.
- **Blocks:** Confidence in the Wave 33a resume and Wave 34 dispatch invariants under adversarial network conditions.

### HIGH-6 — Mass web-preload gap: ~30 API namespaces exposed in Electron preload are absent from `webPreload.ts`

- **Where:** `src/preload/preload.ts` and `preloadSupplementalApis.ts` expose `sessionCrud.*`, `subagent.*`, `research.*`, `layout.*`, `pinnedContext.*`, `profileCrud.*`, `workspaceReadList.*`, `folderCrud.*`, `backgroundJobs.*`, `agentConflict.*`, `checkpoint.*`, `embedding.*`, `telemetry.*`, `observability.*`, `router.*`, `graph.*` (all 12 graph channels), `spec.*`, `marketplace.*`, `ecosystem.*` (write side), `approval.{remember,forget,listMemory}`, several `perf:*` channels, several `ai:*` channels, and several `agentChat:*` channels. None are mirrored in `src/web/webPreloadApis*.ts`.
- **Issue:** A web-mode client (including a paired mobile client using web mode) calling these namespaces hits `undefined is not a function`. The catalog classifies these channels as paired-read or paired-write, so the gate is prepared to accept them — but the client-side transport cannot issue them.
- **Fix:** Either (a) mirror every missing API namespace in `src/web/webPreloadApis*.ts`, or (b) reclassify these catalog entries as `desktop-only` to make the intent explicit. Option (b) is cheaper but narrows what mobile can do. Pick one deliberately; the current state is an unplanned mixture.
- **Blocks:** Meaningful mobile UX beyond the narrow set of mirrored APIs.

---

## 4. Medium and low findings (MED / LOW)

### Security

- **MED** — Pairing ticket entropy is 6 digits (1M space). Rate limit is per-IP only (10 / 15 min), unconstrained across source IPs. 60-second TTL bounds the per-ticket exposure, but a coordinated multi-IP attack is not defended. — `src/main/mobileAccess/pairingTickets.ts:17`; `src/main/web/webAuth.ts:105–130`.
- **MED** — `config:get` / `config:getAll` classified `always`. Only `webAccessToken` and `webAccessPassword` are redacted (`src/main/ipc-handlers/config.ts:99`). API keys in `modelProviders`, `ecosystem.systemPrompt` text, etc. are returned to any authenticated paired device. Either narrow to `paired-read` with explicit allowlist, or redact more keys. — `src/main/mobileAccess/channelCatalog.always.ts:25–26`.
- **MED** — Web (non-native) refresh token stored in `localStorage` (`src/web/tokenStorage.ts:84`). Any XSS on the web deployment captures the token. If web mode is ever exposed beyond a trusted network, elevate to HIGH.
- **MED** — Crash reporter webhook allows `http:` protocol (`src/main/crashReporter.ts:77`). No hostname allowlist. A user-editable config pointing at an internal service is possible (mild SSRF posture).
- **MED** — `mobileAccess.resumeTtlSec` is server-configurable (`configSchemaTail.ts`) but the client-side TTL at `src/web/webPreloadTransport.ts:79` is hardcoded `5 * 60 * 1000`. Changing the config on the server silently diverges from the client.
- **LOW** — `validateToken` does a length short-circuit before `timingSafeEqual` (`src/main/web/webAuth.ts:44`), leaking token length via timing. With a fixed 64-hex-char token this is practically immaterial; `validatePassword` (L75) has the same pattern where user-set passwords vary in length — slightly more concerning.
- **LOW** — `isLocalhost` covers `127.0.0.1`, `::1`, `::ffff:127.0.0.1` (`src/main/web/authMiddleware.ts:51–53`). Current Node normalizes other IPv6 loopback forms to these three; not provably safe across Node upgrades.
- **LOW** — Rate limiter is in-memory only (`src/main/web/webAuth.ts:103`). Restart resets the counter. Documented in `src/main/web/CLAUDE.md`.
- **LOW** — Phase-D capability-gate fallthrough: `src/main/web/bridgeCapabilityGate.ts:74–76` — `if (!connectionMeta) return true` — legacy single-token connections bypass the gate entirely. Intentional per the Phase D comment; left unresolved.
- **LOW** — `reattach` does not re-check TTL (`src/main/web/inflightRegistry.ts:119–129`). Relies entirely on the `setTimeout` cleanup.
- **LOW** — Crash redaction misses Windows paths outside `*:\Users\` (e.g. `D:\Projects\alice\...`). `src/main/crashReporter.ts:42–50`.
- **LOW** — No secret scrubbing in crash reporter error messages; only path redaction. An exception thrown with `new Error(token)` would land in the webhook payload.
- **LOW** — `validateProjectPath` uses `path.resolve` without `fs.realpathSync` (`src/main/ipc-handlers/sessionDispatchHandlers.ts:71`). A symlink inside a trusted root pointing outside the root would pass. Combined with CRIT-1 (if `pty:write` is fixed), this becomes more important for the dispatch-runner worktree creation path.
- **LOW** — Marketplace signature is over the raw downloaded JSON string, not canonical JSON (`src/main/marketplace/marketplaceFetch.ts:65`). Whitespace/BOM changes by a CDN break verification (availability). Trust root is effectively the GitHub repo, not an offline key.
- **LOW** — `installTheme` merges attacker-controlled keys into `theming.customTokens` with no key-shape allowlist (`src/main/marketplace/marketplaceInstall.ts:34`). Blast radius bounded to UI corruption because `electron-store` schema enforces string values.
- **LOW** — `fetchBundle` uses `httpsGet(entry.downloadUrl)` with no URL scheme/host validation (`src/main/marketplace/marketplaceFetch.ts:65`). Compare `postToWebhook` in `crashReporter.ts:77` which does check protocol.

### Correctness and invariants

- **MED** — `dispatchTask` idempotency via `clientRequestId` is an exact-string match with no TTL (`src/main/ipc-handlers/sessionDispatchHandlers.ts:107–128`). After a long-running session, a legitimate retry with a previously-used ID is permanently blocked. No test for the dedup path because `sessionDispatchHandlers.ts` has no test file.
- **MED** — `sessions.ts:212` — bare `JSON.parse(raw)` on a user's on-disk session file. A corrupt session JSON crashes the handler. The highest-impact unguarded `JSON.parse` in the audit.
- **LOW** — `sessionMigration.ts:41–45` — if `sessionsData` exists but is empty, the `existing.length > 0` guard re-runs migration. Practically harmless; legacy windowSessions would get re-migrated cleanly.
- **LOW** — `checkpointStore.ts:55` — bare `JSON.parse(row.filesChanged)` would throw on SQLite corruption, crashing checkpoint retrieval.
- **LOW** — `themeLoader.ts:250` — bare `JSON.parse(raw)` on an installed extension's theme file; malformed theme crashes the loader.
- **LOW** — Session dispatch crash recovery happens only at startup (`sessionDispatchQueue.ts:51–61`). No heartbeat, no PID check. A SIGKILLed Electron that is never relaunched leaves `running` jobs on disk forever; acceptable for a desktop app.
- **POSITIVE** — Learned-ranker feature-order invariant is doubly-enforced: scoring is name-matched (not array-index-based) at `contextClassifier.ts:75–86`, and the array-order test at `contextSelectorFeatures.test.ts:48–56` is belt-and-braces. `reloadContextWeights` hot-swap is atomic by virtue of Node's single-threaded event loop (`contextClassifier.ts:165–196`).
- **POSITIVE** — Pairing ticket `timingSafeCodeEqual` checks length before `timingSafeEqual` — correct pattern, no length-mismatch exception (`pairingTickets.ts:95–104`). Single-use enforcement via `stored.consumed = true` in the same synchronous block (L58–61). Tested.
- **POSITIVE** — Resume token deviceId binding is enforced: `inflightRegistry.ts:119–129` rejects cross-device reattach.

### IPC / channel catalog

- **MED** — `sessionDispatch:status` and `sessionDispatch:notification` are push-only event channels, neither in the catalog nor in `UNCLASSIFIED_ALLOWLIST`. Should be in the allowlist.
- **MED** — `compareProviders:event` in `channelCatalog.read.ts:24` as `paired-read`, but it is push-only — no `ipcMain.handle` exists for it (`src/main/web/webSocketBridge.ts` routing would not find a handler). Phantom catalog entry. Should move to allowlist.
- **MED** — `ecosystem:promptDiff` same issue — listed `paired-read` via `READ_CATALOG`, but `ecosystemHandlers.ts:13–16` explicitly documents it as push-only. The channel name is returned from the registrar to satisfy the coverage test, which is a workaround, not a correct fix.
- **MED** — `codemode:status` classified `paired-write/short` (`channelCatalog.write.ts:81`) but is a read operation. Should be `paired-read`.
- **LOW** — `orchestration:buildContextPacket` and `orchestration:previewContext` have two handlers doing identical work (`ipc.ts:193, 209`). The Electron preload aliases both to `previewContext` but the web preload invokes `buildContextPacket` directly. Maintenance footgun; not a security issue.
- **LOW** — `mobileAccess:generatePairingCode` classified `paired-write` — bootstrapping paradox if a mobile client ever needs to initiate pairing. Currently handled by desktop-side pairing flow; flag if the mobile UX grows.

### Code quality

- **MED** — `webPreloadTransport.ts` at 396 lines is the largest file in the Wave era and the least readable. The resume-protocol state machine is interleaved across `handleOpen → sendResumeFrame → handleClose → startResumableTimers → handleMessage` without section markers. Adding a state-diagram comment and grouping the resume lifecycle would meaningfully help maintainability.
- **MED** — Non-actionable error strings from IPC handlers: `aiHandlers.ts:112 'disabled'`, `embeddingHandlers.ts:42,57,68 'embeddings_disabled'`, `sessionDispatchHandlers.ts:119 'invalid-request'`, `summarizationQueue.ts:184 'unknown'`. The renderer cannot surface these to users. Each should include context.
- **MED** — Duplicate implementations:
  - Two `anthropicAuth.ts` files — `src/main/orchestration/providers/anthropicAuth.ts` (232 lines, marked with a TODO header as the duplicate to delete) and `src/main/auth/providers/anthropicAuth.ts` (176 lines).
  - Two `findPython` implementations — `contextRetrainTriggerHelpers.ts:38–53` and `router/retrainTriggerHelpers.ts`. TODO at `contextRetrainTriggerHelpers.ts:8` flags this.
- **MED** — `sessionDispatch.test.ts` tests only TypeScript type literals. Low value — tsc already catches these.
- **LOW** — `src/renderer/themes/` CLAUDE.md line 121 lists 5 themes (retro, modern, warp, cursor, kiro). Actual registry has 7 (adds light, high-contrast). `glass.ts` exists but is not registered.
- **LOW** — `src/main/CLAUDE.md:137` still states `internalMcp/` is "implemented, not yet wired into startup". Wave 40 G+H fixed the root `CLAUDE.md` and `src/main/internalMcp/CLAUDE.md` but missed this file. Verified wired at `src/main/main.ts:22, 100, 126, 137, 151–153`.
- **LOW** — `src/renderer/i18n/useLocale.test.ts:7` references deleted `useStreamingInlineEditFlag.test.ts` in a comment.
- **LOW** — `pairingHandlers.ts:114` TODO ("Replace stub with real bridge disconnect") is stale — `disconnectDevice(deviceId)` is already called on the next line.
- **LOW** — `miscRegistrars.ts:1` self-acknowledges it "spans multiple unrelated domains" — structural debt, acknowledged.
- **LOW** — `useInlineEdit.ts:85–87` — `hasStreamingApi()` checks `!!window.electronAPI?.config` as a proxy for "streaming available", always true in the renderer. Semantically misleading leftover.

### Wave 40 cleanup

- **MED** — `e2e/streaming-inline-edit.spec.ts` still exercises the removed `streamingInlineEdit` config key. Two of its three tests will fail at runtime (`config.set` on a non-schema key under strict validation). Wave 40 Phase F deleted the flag and the unit test but missed the e2e.
- **LOW** — Untracked `tools/__fixtures__/train-context/test-output-weights.json` — the expected output fixture for the retrain pipeline tests. Its companions (`decisions.jsonl`, `outcomes.jsonl`) are already tracked. A fresh checkout without this file will fail retrain tests. Commit it.

### Docs / operational

- **MED** — No operational runbook exists for: FCM service-account setup and rotation; marketplace key rotation procedure; emergency webhook disable; pairing-code enumeration response; bulk refresh-token revocation. These should be written before any of the corresponding features are exposed publicly.
- **MED** — `startContextRetrainTrigger` is implemented and tested but never called in production (verified: no call in `main.ts` or `mainStartup.ts`; only in tests). `contextWorker.ts` + `contextWorkerTypes.ts` similarly implemented but not wired (`agentChatContext.ts:103–124` is documented as the intended wiring point but doesn't call `startContextRetrainTrigger`). These should be in the root CLAUDE.md Known Issues list; currently they're only in `docs/context-injection.md` footnotes.
- **LOW** — `sessionDispatch.fcmServiceAccountPath` is in the schema but not read by any code (`sessionDispatchNotifier.ts:54` is a `// Future: read` comment). Schema key is premature.
- **LOW** — `session-handoff.md:164` claims `internalMcp/CLAUDE.md` still says "UNWIRED" — that claim is itself stale; Phase G already corrected it.

---

## 5. Per-wave assessment (Waves 30–40)

Ratings 1–5 (higher is better). Waves 15–29 predate the scope the handoff focus-areas enumerated; they are not rated here.

| Wave | Theme | Impl. | Tests | Docs | Notes |
|------|-------|------:|------:|-----:|-------|
| 30 | Research auto | 4 | 4 | 4 | Soak gate documented with concrete criteria (`wave-30-plan.md:29`); `normalizeImportToLibrary` re-export at `triggerEvaluator.ts:23` is a harmless dead export. |
| 31 | Learned context ranker | 5 | 3 | 3 | Invariants robust (feature-order doubly enforced, hot-swap atomic, fallback correct). No end-to-end test from prompt → ordered output (all tests layer-isolated). `rerankerEnabled` default misdocumented. |
| 32 | Mobile primary + swipe nav | 4 | 3 | 4 | `useSwipeNavigation` nested-scroller detection correct (walks ancestry). No test asserting `AppLayout` swap at narrow viewport; no test wiring swipe callbacks to panel state change. |
| 33a | Mobile auth + pairing + resume | 3 | 3 | 3 | Core crypto and invariants correct. Catalog classifications for `pty:*` (CRIT-1) and `marketplace:install` (CRIT-2) wrong. Rate-limit docs wrong. Coverage test structurally incomplete (HIGH-2). |
| 33b | Capacitor native | 4 | 3 | 3 | Token migration well-tested; localStorage is cleared after migration. Web fallback remains in `localStorage` (MED). No device-level testing in CI. |
| 34 | Session dispatch queue | 4 | 3 | 3 | Runner state machine, concurrency cap, timeout, cancel hook, crash-recovery all tested at unit level. `sessionDispatchHandlers.ts` has no test file. No full-flow integration test. FCM stubbed. |
| 35 | Theming overrides | 4 | 4 | 4 | Per-user theming well-shaped. 41 VS Code color keys mapped. No major findings. |
| 36 | Provider abstraction | 3 | 3 | 3 | Three providers tested independently; no shared-interface conformance test matrix. Codex single-turn semantics (`send` no-op) not enforced at the renderer UI layer — a regression that allowed follow-up messages would silently eat them. Gemini `--yolo` assumption tested against the spawn-args assertion, not against current Gemini CLI docs. |
| 37 | Signed marketplace + ecosystem | 2 | 3 | 2 | Signature crypto correct. Install flow misclassified (CRIT-2). Revocation unchecked (HIGH-4). `rules-and-skills` install path is a documented stub. `ecosystem.moat` flag documented but does not exist. Marketplace has no full-flow test (signed bundle → verify → install). |
| 38 | Platform (onboarding, crash, updater, i18n) | 3 | 3 | 2 | First-run tour robustly tested at the hook level; no test of centered-fallback propagation to tooltip positioning. Crash reporter redaction tested. Auto-update downgrade guard is advisory-only (HIGH-1). Crash-reports path+format contradicts `docs/platform.md`. Empty-states schema type contradicts docs. |
| 40 | Cleanup | 4 | 4 | 4 | Phase B/C reason-removal was coordinated correctly across type union, emitters, weights, tier set, confidence list, and fixtures. Phase D windowSessions migration idempotent and covered. Phase F `streamingInlineEdit` inlined but e2e test not updated (MED). Phase G+H audit applied except for two stale CLAUDE.md spots and the 30+ knip false-positive backlog. `src/main/orchestration/providers/anthropicApiAdapter.ts` (252 lines) and `src/main/router/llmJudge.ts` appear genuinely dead and should be deleted. |

---

## 6. Critical moving parts — specific judgments

### Learned context ranker (Wave 31)
**Sound.** The three invariants that matter (feature ordering, hot-swap atomicity, corrupt-weights fallback) are correctly enforced and tested. The scoring function at `contextClassifier.ts:75–86` is name-based, not array-index-based, which defends against V8 key-order oddities; the array-order test at `contextSelectorFeatures.test.ts:48–56` is redundant defense-in-depth. The retrain trigger and Python subprocess call use `spawn` with separate argv (no shell injection). The main risk here is a subtle logic error between layers — feature extraction → classifier → ranker → reranker — that no test exercises end-to-end. A silent ordering inversion would degrade every subsequent agent task invisibly. **Recommendation:** add one end-to-end test that feeds a realistic prompt, runs through all four layers with real inputs, and asserts a stable top-N.

### Mobile auth + capability gate (Wave 33a)
**Structurally sound but operationally unsafe without the Wave 33a classification fixes.** The cryptographic primitives (Ed25519 binding, SHA-256 at rest, `timingSafeEqual` with length guard, single-use ticket enforcement, deviceId binding on resume) are correct and tested. The design is correct. The execution is let down by two channel classifications (`pty:*`, `marketplace:install`) and two coverage-test structural gaps. Until CRIT-1, CRIT-2, HIGH-2 are fixed, `mobileAccess.enabled` should remain behind a warning banner even after the `beta` soak.

### Session dispatch queue (Wave 34)
**Sound for desktop; unverified for end-to-end mobile flow.** Queue persistence, crash recovery, runner state machine, timeout, cancel — all correctly modeled and unit-tested. The weakness is entirely at the seam: no test goes from `sessions:dispatchTask` IPC → queue → runner → completion → push notification. The FCM adapter is a documented stub; the fallback in-app banner exists but its wiring is not traced end-to-end in tests. `validateProjectPath` does not defend against symlink escape (LOW), which matters more if the runner is ever invoked from a less-trusted context.

### Provider abstraction (Wave 36)
**Working but thin.** Each provider (Claude, Codex, Gemini) is tested independently. There is no single conformance test that exercises all three through the same `SessionProvider` interface with the same `SpawnOptions`. Codex's "single-turn" semantics (`send` no-op) are tested at the provider level but not enforced at the renderer UI — a future refactor that removes the Codex UI guard would cause messages to silently vanish. The Gemini `--yolo` flag is asserted against `buildCliArgs` but not against the actual Gemini CLI documentation. **Recommendation:** add a small `providerMatrix.test.ts` that calls `providerRegistry.getProvider(id).spawn(...)` for each of Claude/Codex/Gemini with a common fixture and asserts the same `SessionHandle` shape.

### Signed marketplace (Wave 37)
**Not ready for production.** The cryptography is correct; the surrounding operational defenses are not. (a) No build-time enforcement that the placeholder key is replaced. (b) Install paths write to global-scope config (`ecosystem.systemPrompt`, `theming.customTokens`) rather than project-root scope — misclassified as `paired-write`. (c) Revocation list is not checked in the install path. (d) No end-to-end test of signed-bundle → verify → install → verify-applied. (e) `rules-and-skills` install is a stub. Until these are fixed, treat marketplace as desktop-demo only.

### Crash reporter (Wave 38)
**Usable for internal dogfood; not production-ready without redaction tightening.** Core redaction of homedir and `*:\Users\` Windows paths works and is tested. Gaps: no token/secret scrubbing in error-message text; Windows paths on non-`\Users\` drives (e.g. `D:\Projects\alice\...`) pass through; webhook protocol allows `http:`; no hostname allowlist. The `docs/platform.md` description of crash-report path and format is wrong. **Recommendation:** tighten the redaction regex to handle any `[A-Za-z]:\\[^\\]+\\[^\\]+` path preceded by a drive letter, restrict webhook to `https:` unless `DEBUG` flag, and fix the documented path.

---

## 7. Operational readiness checklist

Must-do before any public rollout of the mobile/marketplace surface:

- [ ] **CRIT-1 fix:** Reclassify `pty:write`/`pty:resize`/`pty:kill` as `desktop-only`, or introduce per-session `allowMobileInput` gating.
- [ ] **CRIT-2 fix:** Reclassify `marketplace:install` as `desktop-only`. Add revocation check inside `installById`. Validate `installTheme` payload key shape.
- [ ] **CRIT-3 fix:** Add production-build guard rejecting `TRUSTED_PUBLIC_KEY_BASE64 === 'REPLACE_WITH_PRODUCTION_KEY'`.
- [ ] **HIGH-1 fix:** Auto-update downgrade guard must block the download, not merely warn.
- [ ] **HIGH-2 fix:** Convert `HANDLER_REGISTRY_CHANNELS` to runtime-derived from `installHandlerCapture`. Add `platform:openCrashReportsDir` (desktop-only) and `providers:checkAllAvailability` (paired-read) to the catalog.
- [ ] **HIGH-3 fix:** Regenerate `docs/data-model.md`; correct `docs/ecosystem.md`, `docs/context-injection.md`, `docs/platform.md`, `docs/mobile-access.md`. Consider a schema-driven doc-gen tool.
- [ ] **HIGH-6 decision:** Either mirror the ~30 missing API namespaces in `webPreloadApis*.ts`, or reclassify them `desktop-only`. Current state is an unplanned mix.

Should-do before marketplace features are widely used:

- [ ] Publish a signing-key rotation procedure and an FCM service-account rotation procedure.
- [ ] Write a revocation-response runbook (pairing-code enumeration, refresh-token compromise).
- [ ] Document the crash-reports path and emergency-disable procedure correctly.
- [ ] Fix `e2e/streaming-inline-edit.spec.ts` (remove or rewrite; the flag no longer exists).
- [ ] Commit `tools/__fixtures__/train-context/test-output-weights.json`.
- [ ] Remove `src/main/orchestration/providers/anthropicApiAdapter.ts` (dead, duplicate) and `src/main/router/llmJudge.ts` (dead).
- [ ] Add an integration test that starts a real `ws` server, tests the resume protocol over a real socket.
- [ ] Add `sessionDispatchHandlers.test.ts` covering the IPC → queue → runner chain.

CI changes:

- [ ] Build-time check: placeholder marketplace key in production.
- [ ] Build-time check: `docs/` config-table entries match `configSchemaTail.ts` flags.
- [ ] Test-suite check: coverage of `HANDLER_REGISTRY_CHANNELS` against runtime-captured registry.

---

## 8. Recommendations — prioritized

### Tier 1 — do before any public/dogfood exposure of mobile or marketplace
1. Reclassify `pty:write/resize/kill` (CRIT-1) and `marketplace:install` (CRIT-2).
2. Add build-time and runtime guards on the marketplace public key (CRIT-3).
3. Move revocation check into `installById` (HIGH-4).
4. Block downgrade downloads (HIGH-1).
5. Convert the catalog coverage test to runtime-captured (HIGH-2).

### Tier 2 — do before 1.0
6. Fix all documented flags that don't match the schema (HIGH-3 full doc regen).
7. Resolve the web-preload API-mirror gap (HIGH-6): decide mobile scope and make types, preload, web preload, and catalog agree.
8. Add at least one end-to-end test per critical seam: learned ranker, streaming resume, session dispatch (HIGH-5, ranker gap, provider matrix).
9. Tighten crash-reporter redaction and scrubbing.
10. Write the operational runbooks.

### Tier 3 — debt cleanup
11. Delete the `anthropicApiAdapter.ts` and `llmJudge.ts` dead code; merge the two `anthropicAuth.ts` files; merge the two `findPython` implementations.
12. Refactor `webPreloadTransport.ts` to surface the resume state machine explicitly.
13. Make error strings from IPC handlers user-actionable.
14. Decide the fate of `startContextRetrainTrigger` and `contextWorker.ts` — either wire them or remove them; don't leave implemented-but-unwired code indefinitely.
15. Fix the stale `internalMcp` claim in `src/main/CLAUDE.md`, the duplicate-dispatch `orchestration:buildContextPacket`/`previewContext`, and the push-only channels in the read catalog.
16. Commit the untracked train-context fixture.

### Tier 4 — optional
17. Add a schema-driven doc-gen tool so config flag documentation can never drift again.
18. Add a per-session terminal-whitelist for mobile `pty:write` if CRIT-1 is not addressed by a blanket `desktop-only` reclassification.

---

## 9. What this review did not cover

- **Waves 15–29** implementation quality was not deeply audited; the handoff focus areas enumerated only Waves 30–40 systems. A follow-up audit of agentChat/checkpoint/graph/LSP machinery in those earlier waves is warranted if any of them approach a soak gate.
- **UI/UX correctness** was not exercised (no browser run). Claims about phone breakpoint layout, first-run tour visual fit, swipe-to-panel wiring are from code read only.
- **Performance** was not measured. The Wave 31 reranker is disabled-by-default because of a known 1–3s cold-start; that claim was not re-measured here.
- **Electron process-boundary security** (context isolation, sandbox flags) was not audited end-to-end; spot checks found the expected shape.
- **Dependency vulnerabilities** were not scanned.

---

*End of review.*
