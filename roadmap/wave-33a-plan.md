# Wave 33a — Mobile Client-Server Hardening (code-only slice)

## Implementation Plan

**Version target:** v2.1.1 (patch — no user-visible feature default-on; all gated).
**Scope split rationale:** Wave 33 (roadmap.md:1554-1613) has two distinct halves. This plan (33a) covers everything that can ship as pure code today, without Apple/Google developer accounts, macOS CI, or signing infrastructure. Wave 33b will cover the native packaging decision (Capacitor vs Tauri Mobile vs React Native) and the signed iOS/Android builds — that wave is **blocked on user decisions** and will be drafted separately.
**Feature flag:** `mobileAccess.enabled` (default `false`; flipped per-install by the user from Settings → Mobile Access).
**Dependencies:** Wave 32 (mobile layout primitives already shipped).
**Reference:** `roadmap/roadmap.md:1554-1613`.

**Prior art already on disk:**
- `src/main/web/webServer.ts` (327 lines) — Express-style HTTP server behind `web` mode with a single process-wide `webAccessToken` (cookie + query-bootstrap). Rate-limit on failed attempts via `recordFailedAttempt(ip)`.
- `src/main/web/webAuth.ts` + `webAuth.test.ts` — `getOrCreateWebToken`, `validateToken`, failed-attempt tracking.
- `src/main/web/webSocketBridge.ts` — JSON-RPC upgrade handler on `/ws`.
- `src/main/web/handlerRegistry.ts` — IPC channel → handler map consumed by the bridge.
- `src/web/webPreloadTransport.ts` — client-side WS transport. Already has exponential-backoff reconnect (1s → 30s), connection overlay, and `ticketFetcher`. **In-flight requests are rejected immediately on disconnect** — no streaming resume. 30s flat timeout for every call.
- `src/web/webPreload.ts` + API builders — typed `window.electronAPI` surface. Currently proxies **every** channel unchanged to the main process.
- `src/renderer/components/Layout/MobileNavBar` + Wave 32 preset/flag infra — the pairing screen can render inside the existing web build without any native shell.

**What this wave is NOT:**
- Native packaging (Capacitor / Tauri / RN) — deferred to 33b.
- TLS termination / certificate provisioning — user-configured (see Phase D note).
- App-store submission — deferred.
- Pen test — external, runs after the wave lands.
- Offline mode / on-device LLM — out of scope permanently per roadmap.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **`mobileAccess` module skeleton + config.** Add `mobileAccess: { enabled: boolean; pairedDevices: PairedDevice[] }` to config schema. Create `src/main/mobileAccess/` with `types.ts` (PairedDevice, PairingTicket, Capability enum), `tokenStore.ts` (per-device refresh tokens persisted to electron-store via config, not in-memory), `pairingTickets.ts` (short-lived single-use tickets — 60s TTL, in-memory map), `index.ts` (module façade). No IPC wiring yet — this phase is data model + storage only. | `src/main/configSchemaTail.ts`, `src/main/config.ts`, `src/renderer/types/electron-foundation.d.ts`, `src/main/mobileAccess/types.ts`, `tokenStore.ts`, `pairingTickets.ts`, `index.ts` + unit tests |
| B | **Pairing protocol — desktop side.** IPC handlers `mobileAccess:generatePairingCode` (returns 6-digit code + QR payload with code + host + port), `mobileAccess:listPairedDevices`, `mobileAccess:revokePairedDevice(deviceId)`, `mobileAccess:consumePairingTicket(code, deviceLabel)` (exchanges ticket for long-lived refresh token + device record; called by the WS handshake, not the renderer). QR payload is JSON: `{ v: 1, host, port, code, fingerprint }`. Use Node `crypto.randomBytes` for ticket + token generation (256-bit), `crypto.timingSafeEqual` for code comparison. | `src/main/mobileAccess/pairingHandlers.ts`, `src/main/ipc.ts` (register), tests |
| C | **Capability gate.** `src/main/mobileAccess/capabilityGate.ts` — enumerates all IPC channels and classifies each as `'always' \| 'paired-read' \| 'paired-write' \| 'desktop-only'`. Desktop-only examples: `files:delete`, `pty:spawn`, `process:kill`, `config:reset`. Paired-write allows chat, checkpoints, layout switches. Paired-read allows file reads, git status, diagnostics. Request path in `webSocketBridge.ts` rejects channels not matching the connection's capability set. Default classification is `'desktop-only'` (fail closed). | `src/main/mobileAccess/capabilityGate.ts`, `src/main/mobileAccess/channelCatalog.ts` (hand-maintained list of channels + their class), `webSocketBridge.ts` (enforcement), tests |
| D | **WS authentication hardening.** Replace single-token auth in `webAuth.ts` with per-device refresh tokens. Upgrade handshake on `/ws` now expects `Authorization: Bearer <refreshToken>` OR a short-lived pairing ticket (for first-connect after QR scan). On successful verification, the connection is tagged with `{ deviceId, capabilities, issuedAt }`. Revoking a device in Phase B immediately closes any matching open sockets. Maintain backwards compat: when `mobileAccess.enabled === false`, fall through to the legacy single-token path (so existing dev workflows don't break). | `src/main/web/webAuth.ts` (extend, don't rewrite), `webServer.ts` (middleware branch), `webSocketBridge.ts` (tag connections), tests |
| E | **Streaming resume on reconnect.** Extend `webPreloadTransport.ts` so in-flight requests are NOT rejected on disconnect — they're queued with their `id` and a `resumeToken`. On reconnect, the transport sends `{ method: 'resume', params: { tokens: [...] } }` in its first frame. The server either acknowledges (the call is still running — future responses will be delivered to the new socket) or NACKs (the call was lost — client rejects with `ECONNLOST`). Server tracks per-call state via `{ resumeToken → { deviceId, inflightHandlerPromise } }` with a 5-minute TTL. Scoped: only `paired-write` and `paired-read` channels are resumable; `'always'` channels (pings, etc.) remain fire-and-forget. | `src/web/webPreloadTransport.ts` (queue + resume frame), `src/main/web/webSocketBridge.ts` (resume handler), `src/main/web/inflightRegistry.ts` (new), tests |
| F | **Per-call-class timeouts.** Replace the flat 30 s client-side timeout with a class-keyed map: `{ short: 10_000, normal: 30_000, long: 120_000 }`. Classification lives in `channelCatalog.ts` (Phase C). Long-class covers streaming chat, spec scaffold, retrain triggers. Short covers health pings, `config:get`. Normal is default. Server-side timeout enforcement mirrors the client: if handler exceeds its budget, send `error: 'timeout'` and clean up `inflightRegistry`. | `src/web/webPreloadTransport.ts` (consume class), `src/main/web/webSocketBridge.ts` (enforce), `channelCatalog.ts` (extend with `timeoutClass` field), tests |
| G | **Desktop Settings → Mobile Access pane.** New Settings tab `mobile-access`. UI: toggle `mobileAccess.enabled`, "Generate Pairing Code" button (opens a modal with 6-digit code + QR canvas from `qrcode` lib if already a dep — otherwise plain code + manual URL entry), paired devices list (label, last-seen, capability badge, revoke button). Accessible over keyboard + tap. Design-token only. | `src/renderer/components/Settings/MobileAccessPane.tsx` + sub-components, Settings tab registry, IPC type mirrors in `electron-foundation.d.ts`, tests |
| H | **Mobile pairing screen.** When `window.__WEB_PAIRING_REQUIRED__` is set (server-injected when the incoming request presents no valid token), render a minimal pairing UI **before** the full app bootstraps. Inputs: host (pre-filled), 6-digit code, optional device label. On submit, POST to `/api/pair` with `{ host, code, label }`, receive refresh token, store in `localStorage` (scoped + `sameSite=strict`) + reload. This path replaces the current "provide token in URL" flow for first-time mobile connections. Desktop legacy path unchanged when flag off. | `src/web/pairingScreen.tsx` (new — plain React, no full app needed), `src/web/index.html` (inject pairing screen script before app bundle via vite.web.config plugin), `src/main/web/webServer.ts` (`POST /api/pair` route), tests |
| I | **End-to-end smoke test + docs.** Playwright e2e (runs under Phase 32's `mobileWeb` project): boot web build with pairing required, simulate QR scan by reading a seeded pairing code from a test fixture, complete pair flow, invoke a `paired-read` channel (should succeed), invoke a `desktop-only` channel (should reject with capability error). Document the pairing flow + capability matrix in `docs/mobile-access.md`. | `e2e/mobile/pairing.spec.ts`, `docs/mobile-access.md` |

**Phase order rationale:**
- A lays the data model so B–F all operate on the same types.
- B depends on A. C is independent of B but both feed into D.
- D depends on B (refresh tokens), C (capability check at handshake).
- E + F are orthogonal after D lands.
- G + H are user-facing — they depend on B (IPC) and D (transport path). Can run parallel to E/F.
- I is the capstone.

**Non-obvious seam:**
The existing `webPreloadTransport.ts` has a `ticketFetcher` property that is never wired. Phase H will wire it — the fetcher will pull the refresh token from localStorage and attach it as `Authorization: Bearer` on the WS upgrade. If the token is missing or rejected, the pairing screen renders instead of the overlay.

---

## Feature flag behaviour

`mobileAccess.enabled` (default `false`):
- **Off:** Today's web mode — single process-wide token from `webAuth.ts`, legacy query-param/cookie auth, no capability gate (every paired session sees every channel), no pairing screen. Dev workflow on LAN unchanged.
- **On:** New connections require a paired device token (or a valid ticket). Capability gate enforces per-class allowlist. Settings pane surfaces device management. Existing (desktop) `wsToken` cookie remains valid on the same host for backwards-compat with the local dev workflow — it's treated as a synthetic "desktop" device with full capabilities.

**No soak gate required for the flag itself.** Flipping it default-on is blocked on Wave 33b (native mobile build) since without a mobile client, there's nothing to pair.

---

## Architecture notes

**Pairing ticket vs refresh token (Phase A–B):**
- **Pairing ticket** = 6-digit human-enterable code, 60-second TTL, single-use. Lives in memory only — if the desktop process restarts, the ticket is gone (acceptable — user generates a new one). Generated via `crypto.randomInt(0, 1_000_000)` then zero-padded.
- **Refresh token** = 256-bit `crypto.randomBytes(32).toString('base64url')`. Persisted to `config.mobileAccess.pairedDevices[].refreshTokenHash` (SHA-256 of the token — we never store the raw token at rest). Revocable by deleting the entry. No expiry — intentional: deleting is the only path to revocation.
- **Device fingerprint in QR payload** = SHA-256 of the desktop's WS host pubkey OR a stable-random device-install id. Used by the mobile client to detect MITM when the host/port changes.

**Capability catalog shape (Phase C):**
```ts
// src/main/mobileAccess/channelCatalog.ts
export interface ChannelDescriptor {
  channel: string;                // e.g. 'files:readFile'
  class: 'always' | 'paired-read' | 'paired-write' | 'desktop-only';
  timeoutClass: 'short' | 'normal' | 'long';
}
export const CHANNEL_CATALOG: readonly ChannelDescriptor[] = [...];
```
Hand-maintained. New channels default to `'desktop-only'` / `'normal'` unless explicitly added. CI test asserts every channel in `src/renderer/types/electron.d.ts` has a catalog entry — prevents silent additions.

**Why refresh-token-only (not short-lived access token)?**
The roadmap spec calls out "short-lived WS ticket becomes part of device-pairing flow (QR or 6-digit). Produces persistent refresh token." We're following it verbatim: ticket → refresh token, no access token rotation. Rationale: the WS connection IS the session; once established and authenticated, per-message token rotation adds complexity without changing the threat model (an attacker with the socket already has everything). If compromise is suspected, revoke the device.

**Streaming resume (Phase E):**
- `inflightRegistry` keys by `resumeToken` (sent in the response metadata before the result). On disconnect, the server does NOT abort the handler promise — it detaches the send target. When the new socket presents the resume token during handshake, the server reattaches the target.
- 5-minute TTL on orphaned in-flight entries. Cleanup runs lazily on each new registry write.
- Client queues resume tokens for in-flight requests in a separate `resumableRequests` map. On reconnect, sends them in the first frame. Pre-existing reject-on-close behaviour is preserved for non-resumable channels.

**Timeout classes (Phase F):**
- **Short (10 s):** health, config get/set, small metadata lookups.
- **Normal (30 s):** most reads/writes, git operations, file ops.
- **Long (120 s):** streaming chat, spec scaffold, retrain trigger, training job status.
- Client and server enforce independently — double-check prevents either side from hanging on a silent peer.

**Desktop bypass (backwards-compat in Phase D):**
When `mobileAccess.enabled === false` OR the request originates from `127.0.0.1` / `::1`, fall through to the legacy single-token path. This preserves every dev workflow. Explicit opt-in to the hardened path is the flag, not the request origin.

**Pairing screen bootstrap (Phase H):**
`vite.web.config.ts` already has `transformIndexHtml`. Extend it to detect a `window.__WEB_PAIRING_REQUIRED__` sentinel (server injects `<script>window.__WEB_PAIRING_REQUIRED__=true</script>` when the request presents no valid token). The pairing screen is a standalone React tree that renders into `#root` first, then on success reloads the page (triggering the main app bundle with the new token). Keeping the pairing screen tiny (< 8 KB gzipped) matters for cellular cold-load.

---

## ESLint split points to anticipate

- `webServer.ts` — currently 327 lines. Phase D adds ~60 lines (middleware branch + refresh-token verify). Extract `authMiddleware.ts` + `pairingMiddleware.ts` to keep under 300.
- `webSocketBridge.ts` — Phases C + D + E all mutate this. Extract `bridgeAuth.ts`, `bridgeCapabilityGate.ts`, `bridgeResume.ts` as Phase D and Phase E land.
- `channelCatalog.ts` — will be long (one entry per IPC channel). Not subject to max-lines since it's pure data, but structure it as a `Record` keyed by channel string for IDE navigation.
- `MobileAccessPane.tsx` — split into `MobileAccessPairingSection.tsx` + `MobileAccessDevicesSection.tsx` up front (don't grow to the limit first).

---

## Risks

- **Capability catalog drift.** New channels added in future waves that forget to register will silently behave as `'desktop-only'` on mobile. Mitigation: Phase C ships a vitest guard that diffs `electron.d.ts` channels against `CHANNEL_CATALOG` and fails the build on unlabelled channels. This is a HARD guard — no allowlist for in-flight channels.
- **Refresh token theft from localStorage.** Mobile browsers can leak localStorage via XSS. Mitigation: token is bound to `deviceFingerprint` on the server; a stolen token used from a different fingerprint is rejected. Also: the capability gate means even a leaked token can't `files:delete` or `pty:spawn`.
- **Resume window lets stale handlers block.** A 5-minute TTL on orphaned in-flight entries is chosen to cover "phone rides in a pocket without signal" scenarios. Longer means more held state; shorter kills legitimate reconnects. Tunable via `mobileAccess.resumeTtlSec` if dogfood shows pain.
- **TLS termination not shipped.** Phase D hardens the **auth** surface but does NOT force WSS. User is responsible for fronting the server with a reverse proxy (nginx / Caddy / Cloudflare Tunnel) for internet-facing deployments. Document this loudly in `docs/mobile-access.md` (Phase I). Wave 33b may integrate `mkcert`-style automatic local CA.
- **Pairing code brute force.** 6 digits = 10^6 combinations. Phase B rejects after 5 wrong attempts per IP per 60-second window (reusing `recordFailedAttempt` infra). Code TTL is 60 s, so brute force is bounded to at most ~83 attempts/second before lockout — well below 10^6.
- **Server restart nukes all in-flight.** Acceptable — user-visible toast "lost connection, please retry". Durable request queues are out of scope.

---

## Acceptance

- With `mobileAccess.enabled: true`, a fresh browser hitting the web URL sees the pairing screen, not the app.
- Desktop Settings → Mobile Access → "Generate Pairing Code" produces a 6-digit code that expires in 60 s.
- Entering the code on the pairing screen establishes a session and loads the app.
- Invoking a `desktop-only` channel (e.g. `files:delete`) over that session fails with `capability-denied` error.
- Invoking a `paired-read` channel (e.g. `files:readFile`) succeeds.
- Revoking the device in Settings closes the socket within 1 s.
- Simulated network drop mid-chat-stream: reconnect within the 5-minute window resumes the stream; after the window, client rejects with `ECONNLOST`.
- Per-call timeouts fire at their class boundary (spec-test via fake timers).
- `npm run build` green; `tsc --noEmit` clean; lint 0 errors; full vitest suite green; `test:mobile` Playwright green against a seeded pairing fixture.

---

## Soak / flip gate

Flipping `mobileAccess.enabled` default `true` requires Wave 33b to have shipped a native (non-wrapper) mobile client capable of pairing. Until then, the flag is manual-opt-in from desktop Settings. No other soak gate.

---

## Per-phase commit message format

`feat: Wave 33a Phase X — short summary`

Examples:
- `feat: Wave 33a Phase A — mobileAccess module skeleton + config schema`
- `feat: Wave 33a Phase C — capability gate + channel catalog`
- `feat: Wave 33a Phase E — streaming resume on reconnect`

Trailer on every commit:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**No `--no-verify`. No ESLint rule relaxation. No push from subagents.** Parent reviews aggregate diff, runs full test suite, and pushes once after Phase I lands.
