# Roadmap Session Handoff — 2026-04-17 (Wave 34 complete)

> Continuation doc for a brand-new Claude Code session. Read this first. Waves 31, 32, 33a, 33b, and 34 are fully landed and pushed. The user's active directive is **"continue with the waves, only stop if I ask"** — Wave 35 (Theme Import & Customization) is next.

## Wave 33a → 33b split — context

Wave 33 in roadmap.md originally had native mobile packaging coupled with auth hardening. The user asked to split so subagents could work on hardening while the framework choice was discussed. **Framework decision: Capacitor 6.** Rationale + "not a wrapper" discipline checklist live in `roadmap/wave-33b-plan.md`. User is on Windows 11 — Android first, iOS deferred until Mac access.

---

## 1. What this project is (one paragraph)

**Ouroboros / Agent IDE** — an Electron desktop IDE (three-process: main / preload / renderer) for launching, monitoring, and orchestrating Claude Code sessions. Built *from within itself* — Claude Code runs as a terminal inside the IDE it edits. Never `taskkill` Electron processes. Prefer HMR (Ctrl+R) over full restarts. Repo at `C:\Web App\Agent IDE\`, branch `master`, remote `origin` = `Stacey-Industries/Ouroboros`.

---

## 2. The ongoing job

A 26-wave roadmap (Waves 15 → 40). Waves 15–31 are complete. The user paused autonomous progression at end of Wave 31 — wait for explicit instructions before starting Wave 32.

### Commit + push protocol (current, as of 2026-04-17)

This changed mid-session. The current policy:

- **Per-phase commits** by subagents (one commit per phase).
- **Push once per wave**, by the parent agent, **after reviewing the aggregate diff** and running the full test suite.
- Subagent prompts must explicitly say "DO NOT PUSH". Parent runs `git push origin master` after verification.
- Commit subject: `feat: Wave N Phase X — short summary`.
- Co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Never** use `--no-verify`. **Never** relax ESLint rules to pass a hook. Memory entry: `feedback_never_change_lint_rules.md`.

Why the change: at start of this session the user flagged 22 unpushed local commits. Per-phase auto-push spammed GitHub mid-wave; per-wave push keeps history coherent. Durable rule saved at `~/.claude/projects/C--Web-App-Agent-IDE/memory/feedback_wave_push_policy.md`.

### Subagent rules (non-negotiable)

- **Model:** always `model: "sonnet"` for parallel work. Opus only if user explicitly approves.
- **No `npm test` inside subagents.** Full vitest suite (~260s) exceeds subagent patience and they hang. Subagents run scoped: `npx tsc --noEmit`, `npm run lint`, and `npx vitest run <specific file>`. The parent runs the full suite with `timeout 540 npx vitest run` before pushing. Memory: `feedback_agent_test_verification.md`.
- **ESLint ceiling is hard:** max 40 lines/function, 300 lines/file, complexity 10, max-depth 3, max-params 4. If a subagent approaches the file cap, it must extract helpers (split point guidance is in each phase plan).
- **Design tokens only** in renderer — no hex/rgb/rgba. Pre-commit hook blocks new hardcoded colors. See `.claude/rules/renderer.md`.
- **Debug-before-fix:** after one failed fix, add `log.info('[trace:TAG]', ...)` at every decision branch. Never propose 3+ fixes from code reading alone. Memory: `feedback_debug_before_fix.md`.

---

## 3. Where things stand right now

### Current branch state

```
Last pushed commit: e026c71 feat: Wave 33a Phase I — E2E pairing spec + mobile-access docs
                    df9f970 feat: Wave 33a Phase H — mobile pairing screen + /api/pair route
                    2085600 feat: Wave 33a Phase G — Settings → Mobile Access pane
                    f0be36e feat: Wave 33a Phase F — per-call-class timeouts
                    374a854 feat: Wave 33a Phase E — streaming resume on reconnect
                    c3897c2 feat: Wave 33a Phase D — WS auth hardening (per-device refresh tokens)
                    2522b2a feat: Wave 33a Phase C — capability gate + channel catalog
                    fbccc45 feat: Wave 33a Phase B — pairing handlers + preload/IPC wiring
                    043c189 feat: Wave 33a Phase A — mobileAccess module skeleton + config schema
                    ef38eef docs: Wave 34 implementation plan
                    b9a0508 docs: Wave 33b implementation plan
                    f1ade7a docs: Wave 33a implementation plan
                    cae81f1 test: fix AppLayout.dnd.test for Wave 32 Phase D + I changes
                    49874b3 feat: Wave 32 Phase J — Playwright mobile viewport tests
                    3b0f38f feat: Wave 32 Phase I — swipe gestures
                    49fcff4 feat: Wave 32 Phase H — Monaco mobile fallback
                    853e558 feat: Wave 32 Phase G — virtual keyboard awareness
                    4ba5c26 feat: Wave 32 Phase F — mobile drawer + bottom sheet primitives
                    2ad2456 feat: Wave 32 Phase E — hover-reveal alternatives at phone breakpoint
                    953ef9c feat: Wave 32 Phase D — mobile panel state lifted to context
                    db18e33 feat: Wave 32 Phase C — touch-target audit + scanner
                    3190c84 feat: Wave 32 Phase B — mobile-primary preset population + resolver wiring
                    9ba8788 feat: Wave 32 Phase A — mobile feature flag + viewport breakpoint hook
                    fe5d29d docs: Wave 32 implementation plan
                    adb641b ← Wave 31 handoff update
                    98bb859 ← last Wave 31 commit
```

`origin/master` is caught up to `d16f34b`. Working tree is clean. Full vitest: 6328/6328 passing.

### Wave 34 key primitives introduced

- **Config:** `sessionDispatch.{enabled, maxConcurrent, jobTimeoutMs, queue, fcmServiceAccountPath}`. Default off.
- **Queue + persistence:** `src/main/session/sessionDispatchQueue.ts`. FIFO, persisted to config, restart-aware (running jobs on boot → marked failed).
- **Runner:** `sessionDispatchRunner.ts` + `sessionDispatchRunnerLifecycle.ts` + `sessionDispatchRunnerStatus.ts` + `sessionSpawnAdapter.ts`. Polls queue, enforces concurrency, per-job timeout, cancel hook.
- **IPC:** `sessions:dispatchTask`, `sessions:listDispatchJobs`, `sessions:cancelDispatchJob`, `sessions:onDispatchStatus`, `sessions:onDispatchNotification`. All classified in Wave 33a channel catalog (dispatch = paired-write/long, list = paired-read/short, cancel = paired-write/short).
- **Path validation:** `validateProjectPath` in `sessionDispatchHandlers.ts` — paths must match a configured project root; no FS access (security/detect-non-literal-fs-filename clean).
- **Push notifications:** `@capacitor/push-notifications` + `nativePushNotifications` bridge + `mobileAccess:registerPushToken` handler. `sessionDispatchNotifier` uses FCM when configured, in-app banner otherwise. FCM adapter is a stub until `google-auth-library` is wired in a future wave.
- **Offline queue:** `src/web/offlineDispatchQueue.ts` — cap 10, persisted via Wave 33b tokenStorage, idempotent via `clientRequestId` (`sessionDispatchHandlers` rejects duplicates). `useDispatchReconnectDrain` drains on reconnect.
- **Connection state:** `useWebConnectionState` hook + transport `subscribeConnectionState` broadcast + `app.onConnectionState` preload.
- **Renderer UI:** `src/renderer/components/Dispatch/` — `DispatchScreen` + `DispatchForm` + `DispatchQueueList` + `DispatchJobDetail` + styles + `DispatchNotificationBanner`. Reachable via AgentChat secondary-views dropdown OR `agent-ide:open-dispatch` DOM event; gated on `sessionDispatch.enabled || mobileAccess.enabled`. On mobile, renders via Wave 32 MobileBottomSheet.
- **DispatchBadge:** pill in AgentMonitor session list showing dispatched/running/error states.
- **Docs:** `docs/mobile-dispatch.md` + extended `mobile-overview.md`.

### Wave 34 gotchas for next agent

- **tsconfig.web.json** now excludes `**/*.test.{ts,tsx}` + `**/*.spec.{ts,tsx}` — test files should not be part of the web build typecheck. Phase E surfaced this as a latent issue.
- **New Dispatch tests MUST use `@vitest-environment jsdom` pragma + `cleanup()` in `afterEach`** — Wave 34 capstone fix (`d16f34b`). The Dispatch tests initially used jest-dom matchers that aren't installed; native vitest assertions (`.textContent`, `.not.toBeNull()`) are the convention.
- **sessionDispatchRunner tests must mock `sessionDispatchNotifier`** — notifier calls `BrowserWindow.getAllWindows()` which is undefined in node test env.
- **FCM adapter is a stub.** When you wire real FCM, install `google-auth-library` (not `firebase-admin` — too heavy), implement JWT-signed HTTPS to FCM v1 API, and fill in `fcmServiceAccountPath` in config.
- **Offline drain idempotency** relies on `clientRequestId` being included in the dispatch request. Any client path that bypasses the offline queue must still pass `clientRequestId` to benefit from dedup.
- **DispatchForm function size** had to be split (Phase G fix: `useDispatchFormState` hook + `buildSubmitHandler` factory). The file is near the 300-line cap — adding fields needs further extraction.
- **webPreloadTransport.ts** was 310 lines — extracted `webPreloadOverlay.ts`. Don't add connection-overlay logic back in the transport module.

### Wave 33b key primitives introduced

- **Capacitor 6.2.1** installed with Android platform only; iOS deferred (user on Windows). App ID `com.stacey.ouroboros`, webDir `out/web`.
- **Plugins (pinned 6.x):** `@capacitor/preferences 6.0.4`, `@capacitor/status-bar 6.0.3`, `@capacitor/keyboard 6.0.4`, `@capacitor/haptics 6.0.3`, `@capacitor/share 6.0.4`, `@capacitor/app 6.0.3`, `@capacitor/splash-screen 6.0.2`, `@capacitor-mlkit/barcode-scanning 6.2.0`.
- **Bridge modules** in `src/web/capacitor/`: `index.ts` (façade with `isNative`), `nativeStorage`, `nativeStatusBar`, `nativeKeyboard`, `nativeHaptics`, `nativeShare`, `nativeSplashScreen`, `deepLinks`, `qrScanner`. All feature-detect `Capacitor.isNativePlatform()` and fall back to web-equivalents (localStorage, navigator.share) or no-ops.
- **Secure token storage:** `src/web/tokenStorage.ts` — Keychain/Keystore on native, localStorage on web, auto-migration on first native read.
- **Deep links:** `ouroboros://pair?host=...&port=...&code=...&fingerprint=...` scheme. Snippet at `capacitor-resources/android-intent-filter.xml`. `generatePairingCode` returns both `qrPayload` (JSON) and `qrPairingUrl` (scannable URL — Settings pane renders the URL).
- **QR scanner:** Phase F wraps MLKit; pairing screen has "Scan QR" button on native only.
- **Native-feel audit:** `useNativeStatusBar` (theme-aware), `useSystemBack` (Android back → modal → panel cycle → exit), haptic-on-tap in `MobileNavBar` + chat send, splash screen, `user-select: none` on chrome.
- **Release pipeline:** `.github/workflows/mobile-android-release.yml` + `tools/build-android-release.js` (env-validated local builds). Keystore lives in `ANDROID_KEYSTORE_*` env vars / GitHub Secrets.
- **Docs suite:** `docs/mobile-overview.md` (index), `mobile-dev.md` (dev setup), `mobile-access.md` (user pairing guide from 33a), `mobile-not-a-wrapper-checklist.md` (Phase G gate), `mobile-testing.md` (manual Android smoke checklist), `mobile-release.md` (release pipeline).

### Wave 33b gotchas for next agent

- **`android/` folder is gitignored** except for `.gitkeep`. User runs `npx cap add android` locally — CI does it too. Subagents MUST NOT attempt `cap add android` (no SDK).
- **Plugin pinning is intentional** — Capacitor plugin majors drop breaking native changes; `^` would let churn through. Don't relax to `^` without explicit soak.
- **iOS is deferred** — all bridge code is cross-platform, so Mac access unblocks iOS in ~1 week. `capacitor-resources/ios-info-plist.deeplink-snippet.txt` has the Info.plist XML ready.
- **Phase I fix (`4b6a477`):** `MobileAccessPairingSection` needed a fallback path when `qrPairingUrl` is absent (old mocks / old IPC builds). Future changes to the pairing payload shape must preserve backward compat.
- **useSystemBack must mount inside MobileLayoutProvider** — it consumes the context. Placed in `LayoutChrome` inside `InnerAppLayout`.

### Wave 33a key primitives introduced

- `mobileAccess` config slice (`enabled`, `pairedDevices[]`, `resumeTtlSec`, `desktopFingerprint`).
- `src/main/mobileAccess/` module: `types`, `tokenStore` (SHA-256 at rest), `pairingTickets` (60s TTL, timing-safe compare), `pairingHandlers` (generate / list / revoke / consumePairingTicket), `channelCatalog.*` (4 files: always/read/write/desktop-only, ~300 classified channels), `capabilityGate` (pure check + `getTimeoutMs`/`isResumable`), `bridgeDisconnect` (active-socket close on revoke), `timeoutMetrics` (per-class counters).
- `src/main/web/` extensions: `authMiddleware.ts`, `pairingMiddleware.ts` (POST /api/pair + test-mode seed route), `bridgeAuth.ts` (upgrade + pairing handshake), `bridgeCapabilityGate.ts` (enforce-or-respond seam), `bridgeResume.ts` (register/detach/reattach + resume handshake frame), `bridgeTimeout.ts` (withTimeout with settled-guard against double-response), `inflightRegistry.ts` (5-min TTL).
- Client transport (`src/web/webPreloadTransport.ts`): meta-frame-driven resumable classification, per-call-class timeouts (short 10s / normal 30s / long 120s), survives disconnect for resumable channels, sends `resume` frame on reconnect.
- Renderer: `Settings → Mobile Access` pane (`MobileAccessPane` + 3 sub-sections). QR via `qrcode.react@^4.2.0` (new dep). Mobile pairing screen (`src/renderer/pairingScreen.tsx`) gated on `window.__WEB_PAIRING_REQUIRED__` injected by the server on unauthenticated non-localhost requests.
- Docs: `docs/mobile-access.md` covers user-facing enable/pair/revoke flow + security model + troubleshooting.

### Wave 33a regressions / gotchas for next agent

- `AppLayout.dnd.test.tsx` needed to wrap in `<MobileLayoutProvider>` (Wave 32 fix). Any future test that renders `AppLayout` directly must do the same.
- Phase C catalog classifications that the parent flagged as "review if dogfood surfaces issues": `files:writeFile/saveFile`, `pty:write/resize/kill`, `graph:reindex`, `codemode:*`, `orchestration:buildContextPacket` — all classified as `paired-write`. Move to `desktop-only` if mobile abuse becomes a concern.
- Bearer-token auth cascade order: `authMiddleware.ts` branches on `mobileAccess.enabled && !isLocalhost`. Localhost always bypasses mobile path. Legacy `webAccessToken` cookie/query continues to work when flag off.
- `pairingMiddleware.ts` mounts BEFORE `authMiddleware` so unauthenticated mobile requests get the pairing screen, not a 401.
- Resumable-timeout semantics: end-to-end clock (not paused during disconnect). 5-min registry TTL and per-call-class budget both run; whichever fires first wins.

### Wave 33a flag state

- `mobileAccess.enabled` default `false`. Flip default-on is BLOCKED on Wave 33b shipping a native mobile client — until then, there's nothing to pair.
- No soak gate for the flag itself; user opts in from desktop Settings per install.

### Wave 32 feature flags (both default off)

- `layout.mobilePrimary` (boolean, default `false`). When `true` AND viewport < 768px, LayoutPresetResolver routes to `mobile-primary`. Soak gate: 1-week phone dogfood + Playwright mobile tests green + zero open mobile regressions over last 3 days.
- All mobile behaviours added this wave (swipe nav, Monaco fallback, drawer, bottom sheet, visual-viewport insets, tap-to-reveal) are gated on this flag combined with `useViewportBreakpoint() === 'phone'`. Desktop paths are untouched.

### Wave 32 key primitives introduced

- `useViewportBreakpoint()` — `'phone' | 'tablet' | 'desktop'`. Returns `'desktop'` in Electron mode (no `.web-mode` class on `<html>`).
- `MobileLayoutContext` / `MobileLayoutProvider` — owns `activePanel`, drawer state, bottom-sheet state. Mounted inside `LayoutProviders` in `InnerAppLayout.tsx`. **Any test that renders `AppLayout` directly must wrap in `<MobileLayoutProvider>`** — `AppLayout.dnd.test.tsx` landed a post-hoc fix for this.
- `MobileDrawer` + `MobileBottomSheet` + shared `MobileOverlayShell` (scrim, focus trap, scroll lock). No deps added.
- `useSwipeNavigation()` — pointer-based, threshold + velocity, `data-no-swipe` opt-out, scrollable-child opt-out. Used by centre column (cycle MOBILE_NAV_ITEMS) and MobileBottomSheet (swipe-down dismiss).
- `useVisualViewportInsets()` — sets `--keyboard-inset` CSS var (100ms debounce, 50px jitter guard). Mounted once in `App.tsx`, same layer as `useThemeRuntimeBootstrap`.
- `useTapToReveal()` — phone-only `data-revealed` toggle. Desktop pass-through returns always-revealed.
- `MonacoMobileFallback` — `<pre>` + `monaco.editor.colorizeElement` for readonly; `<textarea>` with `font-size:16px` for editable. Gated on phone + `layout.mobilePrimary`.
- Touch-target scanner — `src/renderer/styles/mobile-touch-targets.test.ts` walks renderer components for `<button>` under 32px and fails with a list. Opt-out via `// touch-target-ok` trailing comment.
- Multi-project `playwright.config.ts` — `electron` (existing) + `mobileWeb-iphone` + `mobileWeb-pixel`. `test:mobile` script runs the mobile projects. Specs under `e2e/mobile/` auto-skip if `out/web/index.html` is absent.

### Waves done (15–33a, all landed on origin/master)

- **Waves 15–30** — see git log; scope per `roadmap/wave-NN-plan.md`.
- **Wave 32** — Mobile-Responsive Refinement (10 phases A–J). Flag `layout.mobilePrimary` default off.
- **Wave 33a** — Mobile Client-Server Hardening (9 phases A–I, v2.1.1). Flag `mobileAccess.enabled` default off.
- **Wave 33b** — Capacitor Native Shell (9 phases A–I, v2.2.0). Android-first; iOS deferred until Mac access.
- **Wave 34** — Cross-Device Session Dispatch (8 phases A–H, v2.3.0). Flag `sessionDispatch.enabled` default off. All 6328 vitest tests green at push time.

### Plans queued

- None currently drafted. Wave 35 (Theme Import & Customization) is next — draft plan before implementing.
- **Wave 30** — Research Auto-Firing (10 phases A–J). Phase J added per-model training cutoffs via `Record<ModelId, ModelTrainingInfo>` (compile-time enforcement — new models fail tsc without an entry). Feature flag `research.auto` default off; 4-week soak gate.
- **Wave 31** — Learned Context Ranker + Lean Packet Mode. **Just completed this session.** Details below.

---

## 4. Wave 31 — detailed rundown (this session's work)

Plan: `roadmap/wave-31-plan.md`. All 6 phases shipped. Target v2.0.1 (patch). Two feature flags, both default off pending soak gates.

### Phase-by-phase

| Phase | Scope | Files | Commit |
|-------|-------|-------|--------|
| A | `tools/train-context.py` mirrors `train-router.py`. scikit-learn LogisticRegression, stratified 80/20, roc_auc_score. Outputs `context-retrained-weights.json` with `{version, featureOrder, weights, bias, metrics{samples, heldOutAuc, trainedAt}}`. | `tools/train-context.py` | `33410ab` |
| B | `contextClassifier.ts` — sigmoid scorer + hot-swap. `score(features)`, `reloadContextWeights()`. Loads `context-retrained-weights.json`; falls back to `contextClassifierDefaults.ts` (bundled). | `src/main/orchestration/contextClassifier.ts`, `contextClassifierDefaults.ts`, tests | `d9abbde` |
| C | `contextRetrainTrigger.ts` — fs.watch + 500ms debounce on `context-outcomes.jsonl`. Retrains when newRows ≥ 200 and outside 5-min cooldown. Spawns python, parses `trained samples=N auc=0.xx version=...`, calls `reloadContextWeights()` on success. | `contextRetrainTrigger.ts`, `contextRetrainTriggerHelpers.ts`, tests | `7b3ed8b` |
| D | Selector refactor. Extracted `contextSelectorFeatures.ts` (pure `computeFeatures`) + `contextSelectorRanker.ts` (classifier rank + `runShadowMode`). `contextSelector.ts` branches on `context.learnedRanker` flag. Shadow mode: flag off → classifier runs anyway, logs `[context-ranker] shadow {additiveTopN, classifierTopN, overlap}`; errors swallowed once via `shadowErrorLogged` guard. | `contextSelector.ts` (modified), `contextSelectorFeatures.ts` (new), `contextSelectorRanker.ts` (new), tests, `configSchemaTail.ts` | `20f6c6f` |
| E | Lean packet mode. Config `context.packetMode: 'full' \| 'lean'` default `'full'`. Lean drops `<project_structure>`, caps `<relevant_code>` to 6 files, keeps workspace_state/current_focus/diagnostics/terminal/PageRank/memories/skills/system_instructions. Settings UI radio in AI Agents tab. | `claudeCodeContextBuilder.ts`, `config.ts`, `configSchemaTail.ts`, `AgentContextPacketSection.tsx` + test, `AgentSection.tsx` | `1ba6495` |
| F | Observability dashboard. IPC `context:getRankerDashboard` → `{version, trainedAt, auc, topFeatures[5]}`. Renderer `ContextRankerCard.tsx` with color-coded ±weight bars. New sub-tab `'context-ranker'` in `OrchestrationInspector.tsx` (mirrors Wave 30 Phase H research tab pattern). | `contextRankerDashboardHandlers.ts` + test, `ContextRankerCard.tsx` + test, preload/type updates, `ipc.ts`, `OrchestrationInspector.tsx` | `98bb859` |

### Feature flags (both default off)

- `context.learnedRanker` (boolean, default `false`)
  - Off: additive path drives top-N. Classifier runs in **shadow mode**, recording both scores to telemetry for offline AUC verification.
  - On: classifier score is the ranking key. Wave 24 reranker still runs AFTER top-N in both branches.
- `context.packetMode` (enum `'full' | 'lean'`, default `'full'`)

### Soak gates (DO NOT flip flags before these are met)

**`context.learnedRanker` → `true` requires:**
1. ≥ 2 weeks of samples since Phase D landed (2026-04-17).
2. ≥ 1000 labeled samples in `context-outcomes.jsonl`.
3. Most-recent held-out AUC > 0.75.
4. Shadow-mode A/B telemetry shows classifier↔additive top-N overlap ≥ 80%.

**`context.packetMode` → `'lean'` default requires:**
1. 2 weeks of observation with half of sessions manually set to lean.
2. `missed` rate across recorded sessions < 5%.

### Feature order (MUST stay in sync)

`contextClassifierDefaults.ts` defines `featureOrder` — 9 features:
```
recencyScore, pagerankScore, importDistance, keywordOverlap, prevUsedCount,
toolKindHint_read, toolKindHint_edit, toolKindHint_write, toolKindHint_other
```
`contextSelectorFeatures.ts::computeFeatures()` MUST produce the object in this exact key order. There is a test (`feature order matches defaults`) asserting `Object.keys(features) === BUNDLED_CONTEXT_WEIGHTS.featureOrder`. If you add features, update both files and the trainer's feature extraction together.

### Gotchas and non-obvious decisions

- **`findPython` duplication:** `contextRetrainTriggerHelpers.ts` duplicates `router/retrainTriggerHelpers.ts::findPython` with a `// TODO: extract to shared` comment. The router's version isn't exported from a non-circular location. Leave the TODO until a future "orchestration utilities" cleanup wave.
- **`countRows` mocking:** retrain trigger tests mock `countRows` rather than using real `fs.promises`. Real I/O leaves libuv callbacks outliving test boundaries. The helpers test covers `countRows` against a real tmpdir.
- **Shadow mode error-suppression is intentional:** classifier failures must NOT surface in the UI or block selection. One warn log per process lifetime via module-level boolean; everything else stays silent.
- **`researchDashboardHandlers.test.ts` has nested `vi.mock` warnings.** Pre-existing, not caused by Wave 31. The new `contextRankerDashboardHandlers.test.ts` mirrored the same pattern and also warns. Both tests pass; warnings are vitest future-deprecation notices. Fixing is a cross-cutting chore.
- **Config path for new flags:** `src/main/configSchemaTail.ts` owns the `context` sub-schema. Renderer-side mirror is `src/renderer/types/electron-foundation.d.ts` (AppConfig → context). Keep both in sync.

### Test regressions fixed mid-session

Landed Wave 30 required repairing two test files that broke on flag/plumbing changes:
- `src/main/research/triggerEvaluator.test.ts` — added `vi.mock('../config', () => ({ getConfigValue: vi.fn(() => undefined) }))` at top of file. Without this, the real ElectronStore instantiates at module load and hits the user's on-disk `profiles` field, failing schema validation with `Config schema violation: profiles must be array`.
- `src/renderer/components/AgentChat/AgentChatComposerSection.test.tsx` — added mocks for `ToastContext`, `ResearchModeToggle`, and `useResearchModeShortcut` (Phase G wired `useToastContext().toast` into the composer, and ResearchModeToggle tried to read `window.electronAPI.research.getSessionMode` which is undefined in jsdom).

### Verification summary at push time

```
npx tsc --noEmit           → clean
npm run lint               → 0 errors
timeout 540 npx vitest run → 469 test files, 5425 tests, all passing (260s)
```

---

## 5. What remains after Wave 31

The user said "do wave 31 and stop after that." Do not auto-start Wave 32.

Upcoming waves (scope in `roadmap/roadmap.md`):

- **Wave 32** — Mobile-Responsive Refinement
- **Wave 33** — Mobile Shell & Client-Server Hardening
- **Wave 34** — Cross-Device Session Dispatch
- **Wave 35** — Theme Import & Customization
- **Wave 36** — Multi-Provider Optionality
- **Wave 37** — Ecosystem Moat
- **Wave 38** — Platform & Onboarding
- **Wave 39** — Research Classifier (Contingent)
- **Wave 40** — System Cleanup & Deprecation

When the user signals to resume: draft `roadmap/wave-32-plan.md` first (Sonnet subagent), confirm with the user if scope is ambiguous, then implement one phase at a time.

---

## 6. Operational reminders

### File locations

- Plans: `roadmap/wave-NN-plan.md` (one per wave)
- Roadmap overview: `roadmap/roadmap.md`
- Auto-memory: `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` + per-topic files
- Rules: `.claude/rules/*.md` (auto-injected by glob) + `~/.claude/rules/*.md` (global)

### Commands

- `npm run dev` — dev server + Electron (HMR). Don't start a second instance unless testing.
- `npm run build` — electron-vite production build.
- `npx tsc --noEmit` — full typecheck.
- `npm run lint` — ESLint.
- `timeout 540 npx vitest run` — full test suite (runs in ~260s).
- `npx vitest run <path>` — scoped tests. Use this in subagents.

### Auto-memory highlights relevant to wave work

| Memory | Why it matters |
|--------|----------------|
| `feedback_wave_push_policy.md` | Per-wave push, parent reviews first |
| `feedback_agent_test_verification.md` | Subagents must not run full `npm test` |
| `feedback_agent_model_selection.md` | Subagents default to `model: "sonnet"` |
| `feedback_never_change_lint_rules.md` | ESLint caps are hard — extract helpers instead |
| `feedback_debug_before_fix.md` | Add logging before 2nd fix attempt |
| `feedback_verify_before_planning.md` | Read code, don't infer from docs, when scoping |
| `user_auth_subscription.md` | Max subscription only — no API key; use CLI spawn pattern |

### Meta-development warning

This IDE edits itself. A terminal session of Claude Code is always running in the host window. Never kill Electron. The hooks server on the named pipe receives events from both the current dev session and any child sessions — filter by session ID when debugging. See `.claude/rules/multi-process-debugging.md`.

---

## 7. Quick recovery checklist for next agent

- [ ] `git log -7 --oneline` to confirm Wave 31 commits are present locally.
- [ ] `git status` should be clean.
- [ ] `git log origin/master..HEAD` should be empty (all pushed).
- [ ] Read `roadmap/wave-31-plan.md` if touching context ranker code — feature flags, soak gates, and acceptance criteria live there.
- [ ] Before flipping either Wave 31 flag to true, verify the soak gate in §4 above.
- [ ] If starting Wave 32, confirm scope with user first; then draft plan doc before implementing.
