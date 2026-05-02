# Mobile access + session dispatch — flag flips + QR pairing bug

**Status:** DEFERRED — Capacitor native mobile app prerequisite
**Source:** Wave 41 deferral chain; `roadmap/audit-verification-pass.md` Section D item #10
**Filed:** 2026-05-01

## Why this lives in `deferred/` not `future/`

Both `mobileAccess.enabled` and `sessionDispatch.enabled` (currently default `false`) only matter if the user is running the **Capacitor-built native mobile app**. Browser-based mobile access via the `webAccess` server (port 7890) works today and doesn't touch either flag.

The current developer reaches the IDE from a mobile browser via LAN IP — that path is `webAccess`, not `mobileAccess`. So these flags are moot for the current single-developer use case. They become relevant when:
- A real Capacitor mobile build ships to users
- An OSS distribution starts where mobile-app-native pairing is a feature users will discover and use

## What `mobileAccess.enabled` and `sessionDispatch.enabled` actually do

| Flag | Purpose | When it matters |
|---|---|---|
| `mobileAccess.enabled` | Enables the QR pairing flow, device registry (refresh tokens, fingerprints, push tokens via FCM), the `/api/pairing/*` route handlers | Only when a paired Capacitor mobile app is running |
| `sessionDispatch.enabled` | Cross-device session dispatch queue: paired mobile device kicks off an agent session that runs on your desktop. `maxConcurrent: 1`, 30-min job timeout, optional FCM service account | Only when a paired Capacitor mobile app dispatches sessions |

Default `false` for both is the correct posture:
- **Security:** Listening servers without users are pure attack surface
- **OSS-friendly:** Strangers shouldn't auto-enable mobile pairing on first install
- **Zero friction lost for solo:** Settings toggle is right there if/when needed

The original Wave 41 framing of *"flip after soak"* assumed adoption proves stability. With no adoption (current developer uses browser, not native app), the soak premise hasn't been tested. With the QR pairing bug below, the feature isn't soak-ready anyway.

## Sub-issue: QR pairing flow is broken

Reported by the developer: *"the pairing does not work though, the QR code doesn't."*

This blocks any meaningful adoption of `mobileAccess`. Even users who manually flip the flag can't complete the pairing handshake.

### Likely investigation surface

- `src/main/web/pairingMiddleware.ts` — the pairing route factory (Phase D stub; Phase H wires it). Verify the wire-up actually completed.
- `src/main/mobileAccess/` — device registry, refresh token issuance, fingerprint validation
- `src/web/capacitor/qrScanner.ts` (uses `@capacitor-mlkit/barcode-scanning` per A5 verification) — Capacitor-side QR scan
- The QR generation in Settings → Mobile Access (renderer) — likely uses a QR library to encode a pairing payload (URL + token + fingerprint)
- The pairing handshake protocol — does the scanned payload get POSTed correctly? Does the server validate it? Where does it fail?

### Diagnostic-first approach

Per the user's `debug-before-fix` rule, start by adding `log.info('[trace:pairing]', ...)` at every step of the flow:
1. QR generation (what payload is encoded?)
2. Capacitor scan (what payload was extracted?)
3. POST to pairing endpoint (what arrived server-side?)
4. Server validation (which check failed?)
5. Response back to the device (what did the device receive?)

Without observed runtime data, code-reading-only diagnoses will guess wrong.

## Trigger conditions to revisit

Move from `deferred/` to `future/` (or commit to a wave directly) if any become true:

- A Capacitor mobile build is being prepared for end-user release
- Push notification delivery is needed (the FCM service account path in `sessionDispatch` only matters with paired mobile devices)
- A user reports the QR pairing flow as a blocker
- The product roadmap explicitly targets cross-device session dispatch

When activated:
1. **Diagnose the QR pairing bug first** (separate phase, instrument-then-fix)
2. **Verify the pairing flow end-to-end** with a real Capacitor build on a real device
3. **Then — and only then — consider whether to flip the defaults**, or keep them off and rely on Settings opt-in

## What stays default-true even when activated

If/when this gets activated, the default-`false` for `mobileAccess.enabled` is probably still right. Pattern: "feature exists, opt-in via Settings UI." User-pleasing alternative: a guided first-run flow ("Set up mobile access?") that flips the flag *after* the user explicitly opts in. That's preferable to a default-on listener.

## References

- `src/main/web/webServer.ts` — the LAN-accessible HTTP+WS server (this is what currently works for the developer's mobile browser usage)
- `src/main/web/pairingMiddleware.ts` — pairing route factory (Phase D stub; Phase H wires)
- `src/main/mobileAccess/` — device registry + bridge disconnect handler
- `src/main/configSchemaTailExt.ts:107-153` — `mobileAccess` and `sessionDispatch` schemas
- `src/web/capacitor/qrScanner.ts` — Capacitor-side QR scan (uses `@capacitor-mlkit/barcode-scanning`)
- `roadmap/archive/wave-33a-plan.md` — original mobile pairing wave
- `roadmap/archive/wave-41-plan.md` — defaults-deferred decision
- Audit: `roadmap/audit-verification-pass.md` Section D item #10
