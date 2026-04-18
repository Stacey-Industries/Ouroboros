# Wave 33b — Capacitor Native Shell

## Implementation Plan

**Version target:** v2.2.0 (major — first non-Electron target).
**Framework:** Capacitor 6 (chosen over Tauri Mobile / React Native — see decision log below).
**Dependencies:** Wave 33a (pairing + capability gate + transport hardening must ship first — a native shell without auth hardening is dangerous).
**Feature flag:** N/A (separate distribution artifact).
**Reference:** `roadmap/roadmap.md:1554-1613` (remainder of Wave 33 after 33a).

**User constraints driving scope:**
- User is on Windows 11 — iOS builds deferred until Mac access is available.
- Android builds first (doable on Windows).
- "Not a wrapper style — always feels cheap." Design discipline captured in the Phase G "native-feel checklist" below.

---

## Decision log — Capacitor vs Tauri Mobile vs React Native

**Chosen: Capacitor 6.**

- **React Native rejected** — would require rebuilding Monaco, xterm.js, FileTree, all of FileViewer. Port cost dwarfs the benefit for an IDE-over-LAN use case with a mature web codebase already running unchanged in the browser.
- **Tauri Mobile 2 rejected** — technically attractive (system WebView, smaller binary, Rust core) but ecosystem is early. Risk of hitting undocumented edge cases alone. Reserve as a future migration target; the web renderer is portable so switching later costs little.
- **Capacitor accepted** — ships the existing web build as an Android/iOS app with native bridges for the parts the web can't reach (Keychain, biometrics, haptics, push, share sheet, deep links). Preserves ~50k LOC of renderer work. Discord Mobile, Linear Mobile, and T3-chat use this pattern.

**"Not a wrapper" is a design discipline, not a framework property.** Phase G is the acceptance gate — a Capacitor app that ticks the checklist is indistinguishable from RN; a sloppy RN app still feels wrappery.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Capacitor bootstrap.** Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`. `npx cap init` with app id `com.stacey.ouroboros` and name `Ouroboros`. Configure `capacitor.config.ts` to point `webDir` at `out/web`. Add `npm run cap:sync`, `cap:android`, and `cap:build:android` scripts. `.gitignore` additions for `android/` build artifacts. | `package.json`, `capacitor.config.ts` (new), `.gitignore`, `android/` scaffold (committed minus build artifacts) |
| B | **Dev-server mode.** In dev, the Capacitor app should load `http://<desktop-host>:<port>/` directly (pointing at the electron-vite web server) rather than a bundled `out/web/`. Add a `CAPACITOR_SERVER_URL` env var path. In release, load the bundled build. Document the dev workflow in `docs/mobile-dev.md`. | `capacitor.config.ts`, `docs/mobile-dev.md` (new) |
| C | **Native plugins — required.** Install + wire: `@capacitor/preferences` (secure refresh token storage via Keychain/Keystore, replacing localStorage in Wave 33a Phase H), `@capacitor/status-bar` (match theme tokens), `@capacitor/keyboard` (coordinate with Wave 32's `useVisualViewportInsets`), `@capacitor/haptics` (tap feedback on MobileNavBar + chat send), `@capacitor/share` (file/session link share sheet). Create `src/web/capacitor/` bridge module that feature-detects `Capacitor.isNativePlatform()` and falls back gracefully in browser mode. | `src/web/capacitor/index.ts`, `nativeStorage.ts`, `nativeStatusBar.ts`, `nativeKeyboard.ts`, `nativeHaptics.ts`, `nativeShare.ts` + tests |
| D | **Secure token storage refactor.** Update Wave 33a Phase H's pairing-screen token persistence: when `Capacitor.isNativePlatform()`, use `Preferences.set({ key, value, ... })` with `encrypt: true` on iOS (Keychain) and Android (Keystore). Browser mode keeps localStorage. Add automatic migration: on first native launch, if a legacy localStorage token exists, move it to secure storage and clear localStorage. | `src/web/pairingScreen.tsx` (token store branch), `src/web/capacitor/nativeStorage.ts`, tests |
| E | **Deep links for pairing.** `ouroboros://pair?host=<host>&port=<port>&code=<code>&fingerprint=<fp>` deep link scheme. Android `intent-filter` in `AndroidManifest.xml`. When app opens via deep link, route directly to the pairing screen with fields prefilled. Enables "Scan QR" in a third-party scanner app → opens Ouroboros with the payload. Configure Capacitor `App` plugin listener. | `android/app/src/main/AndroidManifest.xml`, `src/web/capacitor/deepLinks.ts`, `src/web/pairingScreen.tsx` (URL param parsing), tests |
| F | **Native QR scanner (Android).** Add `@capacitor-mlkit/barcode-scanning` (preferred over older `@capacitor-community/barcode-scanner` — ML Kit is Google-maintained). Pairing screen gains a "Scan QR" button that launches the scanner; on detection, fills the fields from the scanned QR payload. Browser mode still falls back to manual entry. | `src/web/pairingScreen.tsx` (Scan button), `src/web/capacitor/qrScanner.ts` + mocks in test |
| G | **Native-feel checklist.** Applied as audit, not new features:<br>(a) Status bar color matches theme (`StatusBar.setStyle({ style: theme.isDark ? 'DARK' : 'LIGHT' })` on theme change).<br>(b) Haptic tap on `MobileNavBar` switches + chat send button (Selection + Impact light).<br>(c) Android system back button maps to panel-cycle-back (Files → Editor → Terminal → Chat → exit with confirmation).<br>(d) No browser chrome visible (Capacitor hides it by default — audit release build).<br>(e) Splash screen with project logo + matching background token (`@capacitor/splash-screen`).<br>(f) No text-selection cursor on non-selectable UI (add `user-select: none` to chrome, preserve in content).<br>(g) 44 px min touch targets verified via Wave 32 scanner on the Android emulator. | `src/web/capacitor/nativeStatusBar.ts`, `src/web/capacitor/systemBack.ts`, `MobileNavBar.tsx` (haptic hook), `AgentChatComposer*.tsx` (haptic on send), `AndroidManifest.xml` (splash), checklist doc |
| H | **Release build pipeline (Android).** Release signing config via `ANDROID_KEYSTORE_PATH` + `ANDROID_KEY_ALIAS` env vars (never commit keystore or password — refuse `npm run cap:build:android:release` if env vars missing). GitHub Actions workflow `mobile-android-release.yml` produces signed APK + AAB on tagged releases. Store-submission docs deferred (user owns Google Play account + screenshots). | `android/app/build.gradle` (signingConfigs), `.github/workflows/mobile-android-release.yml`, `docs/mobile-release.md` |
| I | **E2E + docs.** Playwright test already runs in the web build (Wave 33a Phase I). Add an Android-emulator smoke test via `@capacitor/cli` + `appium` OR (simpler) a manual smoke checklist the user runs once per release: launch → scan QR → pair → send chat → view terminal → swipe panels → background + resume. Document in `docs/mobile-testing.md`. | `docs/mobile-testing.md`, `docs/mobile-dev.md` (cross-link) |

**iOS (deferred to future wave, tentatively 33c):**
Scope when Mac access is available: `npx cap add ios`, Xcode signing, `@capacitor/ios` plugins (most already dual-platform after Phase C), `Info.plist` URL schemes, TestFlight distribution. Estimated 1-week scope once unblocked. Do not attempt on Windows.

---

## "Not a wrapper" acceptance gate (Phase G)

Every item below must be ✅ before tagging a release:

- [ ] App icon: custom, not Capacitor default
- [ ] Splash screen: logo + background token color, no "Powered by Capacitor" banner
- [ ] Status bar: theme-aware color + text-style on every screen
- [ ] Safe-area insets: respected top/bottom/left/right (Wave 32 already handled CSS)
- [ ] Keyboard: composer stays above (Wave 32's `--keyboard-inset` works on Capacitor without changes)
- [ ] System back (Android): maps to app-level navigation, not WebView history
- [ ] Haptic feedback: on tab switches, chat send, long-press
- [ ] No browser chrome: no URL bar, no tab bar, no "Open in Chrome" prompts on deep links
- [ ] Text selection: disabled on UI chrome, enabled on chat content + code blocks
- [ ] Share sheet: native share for file paths + session links
- [ ] Deep link: `ouroboros://pair?...` opens the app and routes to pairing screen
- [ ] Token storage: in Keystore, never in localStorage when native
- [ ] Network transition: switching Wi-Fi ↔ cellular triggers Wave 33a streaming resume, not a full reload
- [ ] Battery: backgrounded app pauses WebSocket, resumes on foreground with replay
- [ ] 60 fps scroll in chat history, file tree, terminal on a Pixel 6a (mid-tier target device)

If any item fails dogfood, it's a blocker, not a nice-to-have.

---

## ESLint split points to anticipate

- `capacitor.config.ts` is TS configuration, not subject to renderer line caps — but keep it short (< 80 lines).
- `src/web/capacitor/index.ts` is a façade — re-exports only, should stay < 50 lines.
- Each `native<Feature>.ts` module: one file per plugin wrapper, < 150 lines each.
- `pairingScreen.tsx` — already split in Wave 33a; Phase D + F additions must not push it past 300 lines (extract `PairingFormFields.tsx` + `QrScannerButton.tsx` if so).

---

## Risks

- **Monaco inside a WebView on mid-range Android.** Worker cost is real. Mitigation: Wave 32's `MonacoMobileFallback` kicks in (`layout.mobilePrimary === true` + phone viewport). Users never touch Monaco on mobile; they get the highlighted `<pre>` or textarea.
- **Capacitor plugin churn.** Native plugin APIs have historically changed between majors. Pin versions in package.json; no `^` on native plugins.
- **Play Store signing keystore loss.** If the keystore is lost, the app can never be updated on Play Store (Google enforces signing continuity). Document backup procedure in `docs/mobile-release.md`; back up the keystore to a password manager + offline copy.
- **WebView version skew.** Android WebView version is tied to system Chrome — older devices get older Chromium. Capacitor 6 targets Android 6.0+ which ships Chromium 55+. Accept as constraint; Monaco fallback covers the worst case.
- **iOS-only bugs ship unnoticed.** Without Mac access, iOS-specific behaviours (Keychain quirks, safe-area on notched devices) can't be verified. Mitigation: DEFER iOS release until Mac access — do not ship iOS builds from an Android-only test path.

---

## Acceptance

- `npm run cap:build:android` produces a signed APK on a clean Windows install (no Mac required).
- Installing the APK on a physical Android phone:
  - First launch shows the pairing screen with "Scan QR" button.
  - "Scan QR" opens the camera, scans a QR from Desktop Settings → Mobile Access, autofills the form.
  - Pair completes in < 60 s over LAN.
  - Chat, terminal output, file tree, file viewing all work.
  - Backgrounding the app for 5 minutes and returning does not require re-pair (Wave 33a streaming resume handles it).
  - Revoking the device from Desktop Settings disconnects the phone within 1 s.
- Every item in the Phase G "not a wrapper" checklist is ✅.
- `npm test`, `npm run lint`, `tsc --noEmit` all green on the web codebase.

---

## Exit gates before release

- 2-week author Android daily use.
- Security review of Wave 33a + 33b combined (pairing, capability gate, native storage, deep links).
- QR pairing tested on ≥ 3 Android devices (stock Pixel, Samsung, OnePlus or equivalent).
- Release keystore backed up (password manager + offline cold storage).
- Play Store listing prepared (screenshots, description, privacy policy) — but submission itself is optional per user preference.

---

## Per-phase commit message format

`feat: Wave 33b Phase X — short summary`

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**No `--no-verify`. No ESLint rule relaxation. No push from subagents.** Parent reviews aggregate diff, runs full vitest suite, and pushes once after Phase I lands. Android builds are verified locally by the user; subagents do not run `cap:build:android`.
