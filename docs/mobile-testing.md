# Mobile Testing — Automated Suites & Manual Android Smoke

Cross-reference: `docs/mobile-dev.md` (dev setup), `docs/mobile-release.md` (release pipeline),
`docs/mobile-not-a-wrapper-checklist.md` (Phase G acceptance gate), `docs/mobile-overview.md` (index).

---

## Automated test suites

### Unit and integration tests — vitest

Location: `src/**/*.test.ts`
Runner: `npx vitest run` (or `npm test`)

The standard vitest suite covers the main and renderer processes. Mobile-specific coverage lives in:

| File | What it covers |
|------|---------------|
| `src/renderer/components/Settings/MobileAccessPane.test.tsx` | Enable toggle, onChange contract, generate button, devices list section, diagnostics toggle, pairing code display |
| `src/renderer/components/Settings/MobileAccessPairingSection.test.tsx` | Generate button state, IPC call, code/QR display, expired state, error handling |
| `src/renderer/components/Settings/MobileAccessDevicesSection.test.tsx` | Device list render, revoke action |
| `src/renderer/components/Settings/MobileAccessDiagnosticsSection.test.tsx` | Timeout stat display |

Run all vitest tests:

```sh
npm test
# or for watch mode during development:
npm run test:watch
```

### Capacitor plugin bridge tests — vitest

Location: `src/web/capacitor/*.test.ts`
These test the feature-detected bridge modules by mocking the Capacitor plugin packages. They run as part of the standard vitest suite (no separate invocation needed).

| File | Plugin under test |
|------|------------------|
| `nativeStorage.test.ts` | `@capacitor/preferences` — secure token store, migration from localStorage |
| `nativeStatusBar.test.ts` | `@capacitor/status-bar` — theme-matched color + style |
| `nativeKeyboard.test.ts` | `@capacitor/keyboard` — inset coordination with `useVisualViewportInsets` |
| `nativeHaptics.test.ts` | `@capacitor/haptics` — Selection + Impact.Light events |
| `nativeShare.test.ts` | `@capacitor/share` — native share sheet |
| `deepLinks.test.ts` | `@capacitor/app` — URL scheme parsing, App plugin listener |
| `qrScanner.test.ts` | `@capacitor-mlkit/barcode-scanning` — scan + cancel, browser fallback |
| `nativeSplashScreen.test.ts` | `@capacitor/splash-screen` — hide after app ready |

All bridge mocks use `vi.mock('@capacitor/...')` to avoid importing native modules in the Node environment. Each module's `isNativePlatform()` branch is exercised by toggling the mock return value.

### Playwright web tests — simulated mobile viewports

Location: `e2e/mobile/*.spec.ts`
Runner: `npx playwright test --project=mobileWeb-iphone` (iPhone 14) or `--project=mobileWeb-pixel` (Pixel 7)
Convenience alias: `npm run test:mobile` (once wired in `package.json`).

These tests run the web build (`out/web/`) served at `http://localhost:4173` and drive it through Playwright browser instances configured with mobile viewport dimensions, touch events, and user-agent strings.

| File | Coverage |
|------|---------|
| `e2e/mobile/mobile-nav.spec.ts` | MobileNavBar panel switching, swipe gestures |
| `e2e/mobile/mobile-touch-targets.spec.ts` | 44 px minimum touch-target audit across all panels |
| `e2e/mobile/pairing.spec.ts` | Pairing screen render, code entry form, error states |

To run (requires `out/web/` to exist — build first with `npm run build:web`):

```sh
# iPhone 14 viewport
npx playwright test --project=mobileWeb-iphone

# Pixel 7 viewport
npx playwright test --project=mobileWeb-pixel

# Parse / list tests without executing (CI sanity check):
npx playwright test --list --project=mobileWeb-iphone
```

---

## Manual Android smoke checklist

Run this checklist once per release candidate on a physical device or emulator. Each numbered item is a discrete verification; check it off before moving to the next.

### Prerequisites

- Android Studio installed with API 34 SDK.
- JDK 17+ (bundled with Android Studio or installed separately).
- A physical Android device with USB debugging enabled, OR an AVD (emulator) running in Android Studio.
- The desktop app running and Mobile Access enabled (Settings → Mobile Access → toggle on).

### Step 1 — Initial setup (first run only)

```sh
npm run build:web
npx cap add android
npx cap sync android
```

Then open Android Studio:

```sh
npm run cap:android
```

or run directly on a connected device:

```sh
npx cap run android
```

### Step 2 — First-launch expectations

Install the debug build and launch the app. Verify:

- [ ] App icon appears in the launcher (Capacitor default is acceptable for now; brand icon ships in a future phase).
- [ ] Splash screen appears briefly and fades out cleanly.
- [ ] No "Powered by Capacitor" banner is visible on the splash screen.
- [ ] The pairing screen renders (not a blank white page, not a crash).
- [ ] Status bar background color matches the app theme.
- [ ] Status bar text/icon style (dark/light) matches the background (no invisible icons).

### Step 3 — Manual code entry pairing flow

1. On desktop: Settings → Mobile Access → toggle **Enable Mobile Access** on → click **Generate Pairing Code**.
2. Note the 6-digit code displayed.
3. On mobile: type the 6-digit code into the pairing form.
4. Tap **Pair**.

Verify:

- [ ] The app loads the main shell after pairing completes.
- [ ] Pairing completes in under 60 seconds.
- [ ] The pairing screen does not auto-submit — the user must tap Pair explicitly.

### Step 4 — Scan QR pairing flow

1. On desktop: regenerate the pairing code (a new code with a fresh QR).
2. On mobile: from the pairing screen, tap **Scan QR**.
3. Point the camera at the QR code shown on the desktop.

Verify:

- [ ] The QR scanner opens (camera permission requested if not yet granted).
- [ ] On successful scan, the pairing form fields are prefilled automatically.
- [ ] The user still must tap **Pair** — no auto-submit.
- [ ] After tapping Pair, the main shell loads.

### Step 5 — Deep-link flow (QR from a third-party scanner)

1. On desktop: generate the pairing code and display the QR.
2. On the phone: use any third-party QR scanner app (not Ouroboros) to scan the desktop QR.

Verify:

- [ ] Android opens Ouroboros (not the browser).
- [ ] The pairing screen appears with fields prefilled from the QR payload.
- [ ] No "Open in Chrome" prompt or browser navigation occurs.

To test via ADB (without a physical QR scan):

```sh
adb shell am start -a android.intent.action.VIEW \
  -d "ouroboros://pair?host=192.168.1.50&port=7890&code=123456&fingerprint=abc"
```

The app must open and the pairing fields must be prefilled.

### Step 6 — In-app functionality audit

After pairing, exercise each major surface:

| Surface | Action | Expected result |
|---------|--------|----------------|
| Chat | Send a prompt | Response streams back; no freeze or blank screen |
| Terminal | Tap terminal panel | Output visible (read-only on mobile; no paired-write needed for display) |
| File viewer | Open a file from FileTree | Content renders (Monaco mobile fallback or highlighted `<pre>`) |
| Panel switching | Tap each MobileNavBar item | Correct surface shows; haptic feedback on each tap |
| Swipe | Horizontal swipe on centre column | Cycles to the adjacent panel |

Verify for each:

- [ ] Chat streams responses.
- [ ] Terminal output renders.
- [ ] File content renders.
- [ ] Panel switching works via nav bar; haptic fires on each tap.
- [ ] Swipe gesture cycles panels.

### Step 7 — Android back button behaviour

| Context | Back press | Expected |
|---------|-----------|---------|
| Chat (top-level) | Single press | Exit-confirm toast: "Press back again to exit" |
| Chat (top-level) | Second press within 2 s | App exits (`App.exitApp()`) |
| Editor | Single press | Navigates to Files panel |
| Files drawer open | Single press | Closes the drawer (does NOT navigate WebView history) |
| Modal / bottom sheet open | Single press | Closes the modal |

Verify each row:

- [ ] Exit toast shown on first back press from chat.
- [ ] Double back exits the app.
- [ ] Back from editor goes to files.
- [ ] Back closes drawer without history navigation.
- [ ] Back closes modals.

### Step 8 — Reconnect after network interruption

1. With the app paired and showing the main shell: disable Wi-Fi on the phone for 10 seconds.
2. Re-enable Wi-Fi.

Verify:

- [ ] The WebSocket reconnects automatically (no manual action needed).
- [ ] In-flight chat streams resume or can be retried without re-pairing.
- [ ] The app does not show the pairing screen after reconnection.

### Step 9 — Device revocation

1. On desktop: Settings → Mobile Access → Paired Devices → find the device → click **Revoke**.

Verify:

- [ ] The mobile app shows the pairing screen within 1 second of revocation.
- [ ] The revoked device's refresh token is rejected on the next request (no grace period).

### Step 10 — Performance spot-check (mid-tier target: Pixel 6a or equivalent)

- [ ] Chat history scrolls at 60 fps (no visible jank on a 50-message thread).
- [ ] File tree scrolls at 60 fps on a deep project directory.
- [ ] Terminal output renders without frame drops during active command output.

Use Android Studio's CPU profiler or the on-device developer option "Show GPU rendering profile" as a quick frame-rate indicator.

---

## CI integration notes

- The vitest suite (`npm test`) runs on every PR in GitHub Actions. It includes all capacitor bridge tests.
- The Playwright mobileWeb suite can be added to CI once `out/web/` is built as part of the workflow (see `mobile-android-release.yml` for the pattern).
- The manual smoke checklist is a human gate, not an automated one. Run it before tagging a release.
