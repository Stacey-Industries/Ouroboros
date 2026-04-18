# Mobile — Documentation Index

Reading order for the full mobile feature set. Each document has a distinct scope; start with
`mobile-dev.md` for setup, then read in order for a complete picture.

---

## `docs/mobile-dev.md` — Development setup and daily workflow

Initial Android setup, daily edit/debug cycle, live-server dev mode, release workflow reminders,
deep-link manifest configuration, and project identifiers (`com.stacey.ouroboros`). Start here
if you are setting up the Capacitor environment for the first time.

Also contains the **iOS — deferred** section describing what is needed once Mac access is
available (estimated 1 week of effort for a first build; TestFlight-ready in 2 weeks).

## `docs/mobile-access.md` — User-facing pairing, capability gate, and security (Wave 33a)

End-user documentation for the Mobile Access feature: enabling the server, pairing a device via
6-digit code or QR scan, the capability matrix (always / paired-read / paired-write /
desktop-only), device revocation, network setup (LAN vs reverse proxy vs Cloudflare Tunnel), and
the security model (short-lived pairing tickets, 256-bit refresh tokens, fingerprinting,
fail-closed capability gate).

## `docs/mobile-not-a-wrapper-checklist.md` — Phase G acceptance gate

Checklist of every criterion that must be true before a release is tagged. Covers: app icon,
splash screen, status bar, safe-area insets, keyboard, system back, haptic feedback, browser
chrome, text selection, share sheet, deep link, token storage, network resilience, performance,
and 44 px touch targets. Phase I (wave capstone) is the intended milestone for ticking these
items after manual Android smoke.

## `docs/mobile-testing.md` — Automated suites and manual Android smoke (Wave 33b Phase I)

Where every test lives: vitest unit/integration tests, Capacitor plugin bridge tests in
`src/web/capacitor/*.test.ts`, and Playwright web tests in `e2e/mobile/*.spec.ts` (simulated
iPhone 14 and Pixel 7 viewports). Followed by a 10-step manual Android smoke checklist covering
first-launch expectations, code entry pairing, QR pairing, deep-link pairing, in-app
functionality audit, Android back button, reconnect after network interruption, device
revocation, and a performance spot-check.

## `docs/mobile-release.md` — Android release build pipeline (Wave 33b Phase H)

Keystore generation and backup procedure, local release build via
`npm run cap:build:android:release`, GitHub Actions CI workflow
(`.github/workflows/mobile-android-release.yml`) with signed APK + AAB output, configuring
GitHub Secrets, triggering a release via git tag, and the unsigned debug fallback. Also covers
the Store submission gate checklist.

## `docs/mobile-dispatch.md` — Cross-Device Session Dispatch user guide (Wave 34 Phase H)

End-user documentation for the Cross-Device Dispatch feature: what it is, prerequisites (Mobile
Access paired, `sessionDispatch.enabled = true`, at least one configured project root), step-by-step
usage from the mobile secondary-views menu, offline behavior (up to 10 locally queued dispatches,
automatic drain on reconnect, idempotent replay via `clientRequestId`), notification options
(in-app banner always; FCM push documented as future work), how to cancel queued and running jobs,
and a troubleshooting section covering the most common failure modes ("project path not allowed",
queue cap exceeded, duplicate detection, stuck queue, desktop-restart mid-job).
