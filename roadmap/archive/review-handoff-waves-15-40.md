# Review Handoff — Waves 15–40 Deep Audit

**For:** Claude Opus 4.7 (1M context, xhigh effort)
**Scope:** Full post-shipping review of Waves 15–40 in the Ouroboros / Agent IDE repo at `C:\Web App\Agent IDE\`.
**Final state:** origin/master @ `78e4c4e`. Vitest 7055/7055 green. tsc + lint clean.

---

## What you are being asked to do

Perform a deep, independent, skeptical review of Waves 15–40. Find what the implementation missed, what was shipped but fragile, what violates best practice, and what will bite in production. Do not rubber-stamp. Assume the shipping agent was optimistic.

You should:

1. **Spawn parallel subagents** (Sonnet, per the user's convention — see `~/.claude/rules/agent-model-selection.md`) to gather information in focused slices. One subagent per review axis.
2. **Synthesize the subagent reports yourself** (Opus handles the analysis and judgment). Do not ask subagents to make quality calls — only to gather facts.
3. **Produce a written review** with severity-ranked findings, grounded in file paths and line numbers.

**Authority to act:** Review only. Do not modify code, commit, or push. Flag every concern; the user will triage what to fix.

---

## How to gather (subagent strategy)

Spawn these subagents in parallel — they don't overlap:

### Subagent 1 — Security surface audit
Investigate every security-critical seam introduced in Waves 15–40. For each, gather:
- The relevant file paths + line numbers.
- What the threat model appears to be (implicit or explicit).
- The defense mechanism in place.
- Any obvious bypass or weakness.

Focus areas:
- **Wave 33a pairing + capability gate** — `src/main/web/webAuth.ts`, `bridgeAuth.ts`, `authMiddleware.ts`, `src/main/mobileAccess/{pairingHandlers,tokenStore,pairingTickets,capabilityGate,channelCatalog.*,bridgeDisconnect}.ts`.
  - Ed25519 of refresh tokens? SHA-256 at rest verified?
  - Capability gate fail-closed? Unknown channel → `'unclassified'` rejection confirmed?
  - Rate limit on pairing ticket brute force? Timing-safe compare verified?
  - Replay resistance? Single-use ticket enforcement?
  - Localhost bypass logic — does `isLocalhost` handle IPv6 `::1` + `::ffff:127.0.0.1`?
- **Wave 33a streaming resume** — `src/main/web/{inflightRegistry,bridgeResume}.ts`, `src/web/webPreloadTransport.ts`.
  - Can a different device reattach to another's resume token?
  - TTL enforcement correct? Zombie handlers cleaned?
- **Wave 33b native storage** — `src/web/tokenStorage.ts`, `src/web/capacitor/nativeStorage.ts`.
  - Auto-migration from localStorage → secure storage on first native run. Is the legacy token cleared after migration?
  - Device fingerprint stability?
- **Wave 37 marketplace signature** — `src/main/marketplace/{signatureVerify,marketplaceClient,trustedKeys}.ts`.
  - Ed25519 verify correctly invoked (first arg to `crypto.verify` is `null` for Ed25519)?
  - Is the signature computed over the raw bundle string or parsed JSON? Any canonicalization issue?
  - Placeholder key `'REPLACE_WITH_PRODUCTION_KEY'` — does it reliably fail-closed?
  - Revocation list fetched + checked?
- **Wave 38 crash reporter redaction** — `src/main/crashReporter.ts`.
  - Redaction regex coverage: `os.homedir()`, Windows drive paths, `/Users/` patterns.
  - Do stacks ever leak env values, config values, or session content? Check what's read during crash dump.
  - Webhook POST: is the URL validated? Any SSRF vector (user supplies webhook URL that hits internal services)?
- **Wave 38 auto-update** — `src/main/updater.ts`.
  - Downgrade block correct for pre-release versions (beta → stable transition)?
- **Wave 33a resume token leak** — `inflightRegistry.ts`: token generated on server and sent to client in the `meta` frame. Is it bound to the WS so a hostile peer can't enumerate? What if two devices are paired to the same account?

Report format:
```
[SEVERITY: CRIT / HIGH / MED / LOW]  <concern>
  Where: path:line
  Why concerning: <one line>
  What to verify further: <one line>
```

### Subagent 2 — Correctness + invariants

Verify the load-bearing invariants in the critical moving parts. For each, locate the code enforcing the invariant and judge whether it's actually enforced or just asserted in comments.

Focus areas:
- **Wave 31 feature order invariant** — `src/main/orchestration/contextSelectorFeatures.ts::computeFeatures()` output key order MUST match `contextClassifierDefaults.ts::featureOrder`. Test asserting this exists. Verify it's actually sufficient: does the array-index-based scoring collapse silently if keys are reordered by a JS engine optimization?
- **Wave 31 retrain hot-swap atomicity** — `contextRetrainTrigger.ts`, `contextClassifier.ts::reloadContextWeights()`. Can a mid-turn read see partial state?
- **Wave 34 queue persistence + restart recovery** — `sessionDispatchQueue.ts`, `sessionStartup.ts`. On desktop crash mid-run, are `running` jobs marked `failed` exactly once? Is there a race between `loadQueue` and `registerCancelHook`?
- **Wave 34 idempotency** — `sessionDispatchHandlers.ts::dispatchTask` dedup via `clientRequestId`. Is the match exact string or normalized? Is a replay after long offline correctly recognized?
- **Wave 33a pairing ticket consumption** — `pairingTickets.ts::verifyAndConsume` uses `crypto.timingSafeEqual`. Is the comparison length-matched? What if the user types 7 digits or 5? Do you leak timing info on length differences?
- **Wave 32 `useMobileActivePanel` + DOM events** — state lifted to context. If multiple tabs of the web app exist, do DOM events (`agent-ide:focus-agent-chat`) cross-fire? Expected behavior?
- **Wave 36 SessionProvider registry mutation** — `providerRegistry.ts` is a module-level Map. Does test isolation work? Phase A noted tests use `vi.resetModules()` + dynamic import — is every test doing this correctly?
- **Wave 32 swipe navigation scroll-detect** — `useSwipeNavigation.ts` checks `scrollWidth > clientWidth` to bail on horizontal scrollers. Does this correctly handle nested scrollers (e.g. code block inside chat message)?
- **Wave 40 `windowSessions` migration** — `src/main/session/sessionMigration.ts`. Does the migration run on EVERY startup (idempotent) or only first? What if the legacy key is gradually restored by a sync client? Is the read-fallback ordering correct (new first, old second)?

Report format: same as Subagent 1, plus for each invariant:
```
Invariant: <statement>
Enforced by: path:line
Test coverage: yes/no (path:line if yes)
Attack surface: <what could break it>
```

### Subagent 3 — IPC contract audit

Review every IPC channel added in Waves 15–40 for:
1. Presence in `src/renderer/types/electron*.d.ts` (renderer sees it).
2. Preload bridge wiring in `src/preload/preload.ts` or `preloadSupplementalApis.ts`.
3. Web preload mirror in `src/web/webPreloadApis*.ts`.
4. Main-process handler registration in `src/main/ipc.ts`.
5. Wave 33a channel-catalog classification: `always / paired-read / paired-write / desktop-only` + timeout class.
6. Coverage-guard test in `channelCatalogCoverage.test.ts` passing (no unclassified channels).

Produce a matrix:
```
Channel | Types | Preload | Web | Handler | Class | Timeout | Coverage
--------|-------|---------|-----|---------|-------|---------|---------
...
```

Mark any channel missing from any column. Flag any classification that looks wrong (e.g. a destructive operation marked `paired-write` that should be `desktop-only`).

Particular scrutiny: channels added in Waves 34 (session dispatch), 36 (compare providers), 37 (marketplace install — this one is especially sensitive), 38 (platform).

### Subagent 4 — Code quality audit

For each wave, assess:
- **File sizes** — what percentage of files are within 10 lines of the 300-line cap? High concentration suggests the cap is binding architecture choices, not naturally fitting.
- **Function sizes** — same for 40-line cap.
- **Complexity** — look at `contextSelector.ts`, `claudeCodeContextBuilder.ts`, `webSocketBridge.ts`, `webPreloadTransport.ts`. Are they readable end-to-end or fragmented across 3+ helper files?
- **Naming** — `SessionProvider` vs `ModelProvider` in `providers.ts` — same word, different concepts. Find any other confusing naming.
- **Test quality** — spot-check 20 test files. Are they testing behavior or implementation? Are there tests that mock so much the test proves nothing? Any tests using `.skip()` without a TODO?
- **Error handling** — IPC handlers return `{ success, error? }`. Are error messages user-actionable or opaque (e.g. `'error'`)?
- **Logging discipline** — grep `console.log` in `src/main/` and `src/renderer/` — lint rule should prevent, but verify. Check that security-sensitive code (tokens, passwords, paths in crash reports) never logs raw values.
- **TODO / FIXME inventory** — `grep -rn 'TODO\|FIXME\|XXX\|HACK' src/` — list unresolved tech debt added during Waves 15–40.

### Subagent 5 — Documentation + operational readiness

Verify:
- `docs/context-injection.md`, `docs/providers.md`, `docs/ecosystem.md`, `docs/platform.md`, `docs/mobile-*.md`, `docs/theming.md` — do they accurately match the code? Pick 3 claims per doc and verify against source.
- `CLAUDE.md` + rule files in `.claude/rules/` — are they still accurate post-Wave-40? Any stale claims?
- `roadmap/session-handoff.md` — accurate summary?
- Every plan file (`roadmap/wave-*-plan.md`) should exist. Verify.
- Flag soak gates documented with specific criteria (sample counts, AUC thresholds, dogfood duration)?
- Known-issues list in root CLAUDE.md — accurate after the Wave 40 audit?
- Disaster recovery / operational runbook for: marketplace key loss, FCM service account, crash report path exposure, pairing-code enumeration, stored refresh token compromise.

### Subagent 6 — Wave-40 cleanup validity

The shipping agent removed / restructured code in Wave 40. Audit whether anything live was mistakenly removed:
- `semantic_match`, `active_file`, `open_file` reasons — any test fixture, telemetry schema, or external caller still using them?
- `REASON_WEIGHTS` trimmed — did the tier classifier still work correctly post-trim?
- `windowSessions` write-path cut — is the new `sessionsData` store complete (bounds, project roots, everything the old key held)?
- `streamingInlineEdit` flag removal — was the "disabled path" truly dead before removal? Any diff between enabled+disabled behavior that's now lost?
- Knip sweep — were any type-only exports incorrectly deleted? Grep `import type.*<removed>` across the codebase.
- `internalMcp` — audit report said it IS wired. Trace the actual wiring path and verify it's functional, not just present.

### Subagent 7 — Testing gaps

For each wave, check whether the critical paths have tests:
- **Wave 31 learned ranker** — integration test that goes prompt → feature extraction → classifier score → top-N → reranker? Or only unit tests at each layer?
- **Wave 33a resume** — end-to-end reconnect test with actual socket disconnect + reattach? Or only registry-level unit?
- **Wave 34 dispatch** — full flow from mobile request → queue → runner → session spawn → status stream → completion notification? Or only unit tests per layer?
- **Wave 33b Capacitor** — can anything be tested in CI without a real device? What smoke coverage exists?
- **Wave 37 marketplace** — install flow with signed-and-verified bundle. Is there a fixture test with a real test keypair?
- **Wave 38 first-run tour** — does it cover the case where anchor DOM elements don't exist (phone breakpoint, custom layout)?

Flag areas where a single unit bug could ship undetected by current tests.

---

## How to synthesize (Opus does this)

Once you have subagent reports:

1. **Cluster findings by severity.** CRIT (production-breaker or security hole), HIGH (likely pain in dogfood), MED (quality debt worth scheduling), LOW (nitpick).

2. **Reject optimistic reports.** If a subagent says "looks good" without citing specific evidence, re-read the file yourself and form an independent judgment. Subagents can rubber-stamp; your job is the counter-check.

3. **Cross-reference.** If Subagent 1 flagged a concern in a file and Subagent 4 flagged code-quality in the same file, that's a compounding risk. Call it out.

4. **Map to release gates.** Each flag in the roadmap has soak gates. For every finding, note which gate (if any) it blocks.

5. **Write a single review document** — don't just dump subagent reports. You are the analyst.

---

## Known risk areas the shipping agent flagged

These were surfaced during implementation — verify they're in the right state:

- **Wave 32 Phase D fix (`cae81f1`):** `AppLayout.dnd.test.tsx` needed MobileLayoutProvider wrap + MOBILE_NAV_ITEMS mock. Verify no other callers of AppLayout render without the provider.
- **Wave 34 tsconfig.web.json exclude (`48e9e97`):** added `**/*.test.ts*` + `**/*.spec.ts*` to exclude. Verify this doesn't mask a real build-time issue in any test file.
- **Wave 34 Phase F jest-dom-style matchers in some Dispatch tests were eventually replaced (`d16f34b`) with native vitest.** Verify no jest-dom matcher remains in any wave-added test.
- **Wave 37 Phase B line-diff delete-before-insert fix (`aa58d52`).** Verify the fix's unified-diff output matches standard tooling (diff utility, git diff) on a few fixture cases.
- **Wave 36 Codex adapter uses the exec path (`spawnCodexExecProcess`) not the interactive PTY path.** `send()` is a documented no-op — verify renderer UI correctly handles the "single-turn session" semantics (no follow-up message UI dead-ends).
- **Wave 36 Gemini `--yolo` flag assumption.** Spawn args are a guess; verify by checking the current Gemini CLI documentation or README against `buildCliArgs` in `geminiSessionProvider.ts`.
- **Wave 37 FCM adapter is a stub.** Verify the fallback path (in-app banner) is functional and tested. The stub returning `{ sent: false, reason: 'no-fcm-backend' }` should trigger the banner.
- **Wave 37 marketplace `TRUSTED_PUBLIC_KEY_BASE64 = 'REPLACE_WITH_PRODUCTION_KEY'`.** Verify signature verification always returns false with this placeholder (as it should). Separately verify there is a test key path (not hard-coding the placeholder in tests).
- **Wave 40 Phase H knip sweep left some exports flagged but not deleted** (session barrel, type re-exports). Decide if the remaining knip hits are false positives or deferred cleanup.

---

## Specific high-risk areas

If time is limited, prioritize these:

1. **Wave 33a channel catalog classifications.** Several channels were classified as `paired-write` with the shipping agent flagging "review if dogfood surfaces issues": `files:writeFile`, `files:saveFile`, `pty:write/resize/kill`, `graph:reindex`, `codemode:*`, `orchestration:buildContextPacket`. Re-assess — are any of these actually too permissive for mobile?

2. **Wave 33a localhost bypass.** `isLocalhost` determines whether a request skips the mobile gate. A misconfigured proxy could make every remote request appear localhost. Verify the check is robust against `X-Forwarded-For` header spoofing if the server ever sits behind a proxy.

3. **Wave 37 marketplace bundle installation.** The `installBundle` function writes to `config.theming.customTokens`, `config.ecosystem.systemPrompt`, or calls the rules/skills install path. Verify that a malicious bundle (even one that passes signature — hypothetically if the key is ever leaked) can't escalate: e.g. write an arbitrary key to config, or install a "rules-and-skills" bundle that contains shell-command-capable content.

4. **Wave 34 project path validation.** `validateProjectPath` uses `path.resolve` + `path.relative`. Does it correctly reject symlink-based escapes? Does it reject paths containing NUL bytes or other junk?

5. **Wave 31 retrain trigger spawning Python.** `contextRetrainTrigger.ts` spawns a python subprocess. What's the arg-escaping story? Could an attacker who can write to `context-outcomes.jsonl` somehow influence the python invocation?

6. **Wave 33a auth middleware fallthrough.** When `mobileAccess.enabled === false` OR request is localhost, the middleware falls through to the legacy single-token path. Verify there's no state-leak between the two auth modes (e.g. a request that's 75% authenticated by mobile and 25% by legacy).

---

## Deliverable

Write a single markdown file:

**Filename:** `roadmap/waves-15-40-review.md`

**Required sections:**

1. **Executive summary** (≤ 200 words). What's the overall state? Ship-ready or not?
2. **Critical findings** (CRIT severity only). Each with: where, why, suggested fix, blocking which gate.
3. **High-severity findings.** Same format.
4. **Medium and low findings.** Can be briefer — path + one-line each.
5. **Per-wave assessment.** For each of Waves 15–40, a 1–5 rating on: Implementation quality, Test coverage, Documentation. Justification in 1–2 sentences.
6. **Critical-moving-parts assessment.** Specific judgment on: learned context ranker (Wave 31), mobile auth + capability gate (Wave 33a), session dispatch queue (Wave 34), provider abstraction (Wave 36), signed marketplace (Wave 37), crash reporter (Wave 38).
7. **Operational readiness checklist.** What must happen before shipping to users? Keys, webhooks, CI changes, docs.
8. **Recommendations.** Prioritized list of follow-up work.

**Do NOT:**
- Modify code.
- Commit anything.
- Accept subagent reports without verifying key claims yourself.
- Let "tests pass" substitute for "implementation is sound." Passing tests only prove what was tested.

**Do:**
- Read the actual code for anything suspicious.
- Form independent judgments.
- Be specific: file paths, line numbers, commit SHAs.
- Disagree with the shipping agent's decisions where warranted.

---

## Reference data

### Commit boundaries (for wave → commit mapping)

```bash
# Per-wave commits:
git log --oneline --grep="Wave 32" --reverse
git log --oneline --grep="Wave 33a"
git log --oneline --grep="Wave 33b"
git log --oneline --grep="Wave 34"
git log --oneline --grep="Wave 35"
git log --oneline --grep="Wave 36"
git log --oneline --grep="Wave 37"
git log --oneline --grep="Wave 38"
git log --oneline --grep="Wave 40"
```

### Key files by surface

```
Auth/security:
  src/main/web/{webAuth,authMiddleware,pairingMiddleware,bridgeAuth}.ts
  src/main/mobileAccess/{tokenStore,pairingTickets,pairingHandlers,capabilityGate,channelCatalog.*,bridgeDisconnect,bridgeCapabilityGate}.ts
  src/main/marketplace/{trustedKeys,signatureVerify,marketplaceClient}.ts
  src/main/crashReporter.ts

Context pipeline:
  src/main/orchestration/{contextSelector,contextSelectorFeatures,contextSelectorRanker,contextClassifier,contextClassifierDefaults,claudeCodeContextBuilder,contextReranker,contextPacketBuilderSupport,contextOutcomeObserver*}.ts
  src/main/orchestration/contextRetrainTrigger.ts + helpers
  tools/train-context.py

Session lifecycle:
  src/main/session/{sessionDispatch,sessionDispatchQueue,sessionDispatchRunner,sessionDispatchNotifier,sessionSpawnAdapter,sessionStartup,sessionMigration}.ts
  src/main/providers/{sessionProvider,providerRegistry,claudeSessionProvider,codexSessionProvider,geminiSessionProvider,profileSpawnHelper,providerBootstrap}.ts
  src/main/ptyAgent*.ts, pty.ts, ptyState.ts

Transport:
  src/main/web/{webServer,webSocketBridge,bridgeResume,bridgeTimeout,inflightRegistry,broadcast,handlerRegistry}.ts
  src/web/{webPreload,webPreloadTransport,webPreloadOverlay,tokenStorage,pairingScreen,offlineDispatchQueue}.ts
  src/web/capacitor/*.ts

Renderer features:
  src/renderer/components/{Onboarding,EmptyState,Changelog,Dispatch,Marketplace,AwesomeRef,AgentChat/CompareProviders}/
  src/renderer/hooks/{useMobileActivePanel,useViewportBreakpoint,useTokenOverrides,useLocale,useDispatchJobs,useCompareSession,useWebConnectionState}.ts
  src/renderer/i18n/*
  src/renderer/themes/{vsCodeImport,fontPickerOptions,thinkingDefaults}.ts

Tests to spot-check:
  src/main/mobileAccess/channelCatalogCoverage.test.ts
  src/main/web/bridgeResume.test.ts
  src/main/orchestration/contextSelector.test.ts
  src/main/marketplace/signatureVerify.test.ts
```

### Config flag inventory

See `src/main/configSchemaTail.ts` + `src/main/config.ts`. Flags added by Waves 32–38:

```
layout.mobilePrimary          (Wave 32, default false)
mobileAccess.enabled          (Wave 33a, default false)
mobileAccess.resumeTtlSec     (Wave 33a, default 300)
sessionDispatch.enabled       (Wave 34, default false)
sessionDispatch.maxConcurrent (Wave 34, default 1, max 3)
sessionDispatch.jobTimeoutMs  (Wave 34, default 1_800_000)
sessionDispatch.fcmServiceAccountPath (Wave 34)
theming.*                     (Wave 35)
providers.multiProvider       (Wave 36, default false)
ecosystem.moat                (Wave 37, default true)
platform.onboarding           (Wave 38, default true)
platform.language             (Wave 38)
platform.updateChannel        (Wave 38, default 'stable')
platform.crashReports.*       (Wave 38)
platform.dismissedEmptyStates (Wave 38)
```

Verify each is read in main AND renderer consistently. Verify each has a sensible default. Verify each is documented.

---

## Tone and attitude

Be the reviewer you wished you had. Be specific. Be critical where warranted. Be willing to say "this was rushed" or "this has a race condition" or "this documentation is wrong about what the code does."

Do not:
- Pad with generic advice ("consider adding more tests").
- Repeat claims from the shipping agent without verifying.
- Grade on effort — grade on the code.
- Defer security judgments to "the user can decide" — you are the security reviewer; decide.

Do:
- Point out when a claim in a doc or commit message is wrong.
- Suggest concrete changes with file paths.
- Explain the attack/failure mode so the user can judge severity themselves.
- Flag when something is "fine but fragile" — design choices that work today but will fight maintainers later.

---

## Expected deliverable turnaround

This is deep-review work. Budget for it: give subagents enough time to actually read the files, not just skim. A superficial review is worse than no review — it creates false confidence.

Final document at `roadmap/waves-15-40-review.md`. Commit with message:

```
docs: independent review of Waves 15–40

Review performed by Claude Opus 4.7 xhigh with parallel Sonnet subagents.
Findings ranked CRIT / HIGH / MED / LOW. No code changes; see commit for the
shipping agent's fixes if applicable.

Co-Authored-By: Claude Opus 4.7 (reviewer) <noreply@anthropic.com>
```

Do NOT push. The user will review your review and push if satisfied.
