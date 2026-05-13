# iOS mobile packaging — Capacitor build, APNs push, App Store submission

**Status:** DEFERRED — blocked on Mac hardware access; reactivate when relevant
**Source:** Waves 33a, 33b, 34 (`roadmap/_archived/wave-33a-plan.md`, `wave-33b-plan.md`, `wave-34-plan.md`)
**Filed:** 2026-05-01 — moved out of NOW-USELESS bucket per the developer's note that "iOS will be relevant soon"

## Why this lives in `deferred/` not closed

The original audit batched these as NOW-USELESS because the project committed to FCM/Android-only as an expedient when Mac access wasn't available. The developer flagged this as premature — iOS is on the roadmap and the deferral is environmental, not a strategic drop. Preserving the work so a future agent doesn't have to re-derive the iOS path.

## What was deferred

### Wave 33a — iOS native packaging
- **Item:** Capacitor (or Tauri) native iOS build for the chat-only shell
- **Original deferral:** Pushed to Wave 33c, then iOS builds were blocked until Mac access
- **What's already in the repo:** `capacitor.config.ts` is wired (verified by audit Section B), Android build path is functional, and `src/web/capacitor/` bridge module (haptics, keyboard, splash, deep links, QR scanning) is shared between platforms
- **What's missing for iOS:** Xcode project generation (`npx cap add ios`), iOS-specific native plugin configuration, a Mac for code signing, an Apple Developer account

### Wave 33b — APNs push notifications
- **Item:** Apple Push Notification service integration for the iOS build
- **Original deferral:** Android-only (FCM) shipped first; APNs deferred until Mac access
- **What's needed:** APNs auth key (`.p8`), APNs topic (matches bundle ID), Capacitor push plugin iOS configuration, server-side send path that branches FCM vs APNs based on device platform
- **Touch points (likely):** `src/main/mobileAccess/` device registry already stores `pushToken` and `pushPlatform`; the dispatch path (`src/main/sessionDispatch/`) needs an APNs sender alongside the existing FCM sender

### Wave 33b — App Store submission
- **Item:** Submit the iOS build to the App Store
- **Original deferral:** Same — blocked on Mac access, Apple Developer account, and a working iOS build
- **What's needed:** App Store Connect account, signed `.ipa` from a Mac build, App Store metadata (screenshots, descriptions, age rating, privacy nutrition labels), TestFlight beta cycle before public submission

### Wave 34 — Native push (cross-platform Phase F)
- **Item:** Replace in-app banner fallback with real native push when the push plugin is present
- **Original deferral:** Requires Wave 33b push plugin (so by transitivity, blocked on iOS path)
- **What's already wired:** In-app banner degradation path works today on both platforms when push is absent
- **What changes when iOS lands:** Server detects `pushPlatform === 'ios'`, sends APNs payload with the same shape as the FCM payload, Capacitor receives via the push plugin, taps deep-link into the right session

## Trigger conditions to revisit

Move from `deferred/` to `future/` (or commit to a wave directly) if any of these become true:

- Mac hardware (or cloud Mac access — MacStadium, GitHub Actions macOS runners) becomes available for code signing
- An iOS user / dogfood candidate is identified
- The product roadmap explicitly commits to iOS distribution
- App Store distribution becomes a sale or OSS-launch requirement

## Sequencing when activated

1. **Verify the Capacitor Android build still works** (smoke test) — it's the reference platform; if it broke during the iOS-blocked period, fix that first
2. **Generate the iOS Xcode project** (`npx cap add ios`, then `npx cap sync ios`)
3. **Stand up signing infrastructure** (Apple Developer account, certificates, provisioning profiles, App Store Connect)
4. **Get a debug build running on a physical iOS device** (simulator first, then real hardware)
5. **Then — and only then — wire APNs push** (auth key, send-path branch, end-to-end test from server → device)
6. **TestFlight beta** before App Store submission
7. **App Store submission** once feedback loop is settled

Treat steps 5–7 as separate waves once step 4 is green. Each has its own failure modes that don't overlap.

## What NOT to pull in if reactivated

Keep these out of the iOS-revival wave to prevent scope creep:

- **Cross-window IDE-tool delegation** — separate `roadmap/deferred/cross-window-ide-tool-delegation.md` work, conceptually adjacent but architecturally independent
- **`mobileAccess.enabled` / `sessionDispatch.enabled` default flips** — `roadmap/deferred/mobile-access-and-session-dispatch.md` covers this; the default-false posture is correct even after iOS lands (opt-in via Settings or a guided first-run flow)
- **Web-access mobile UX polish** — that's a `webAccess` browser-on-mobile concern, not the native app
- **Multi-platform build matrix in CI** — only worth it once the iOS pipeline is stable; don't gate iOS on CI plumbing

## References

- `roadmap/_archived/wave-33a-plan.md` — original iOS packaging wave
- `roadmap/_archived/wave-33b-plan.md` — APNs + App Store submission deferral
- `roadmap/_archived/wave-34-plan.md` — native push integration
- `capacitor.config.ts` — Capacitor configuration (Android-functional)
- `src/web/capacitor/` — shared native bridge module
- `src/main/mobileAccess/` — device registry (push token storage already present)
- Audit: `roadmap/audit-verification-pass.md` Section D items #2–5 (originally NOW-USELESS bucket; reclassified DEFERRED 2026-05-01)
