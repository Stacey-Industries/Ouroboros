# Mobile Access

## Overview

Mobile Access lets you connect a phone or tablet to a running Ouroboros desktop instance over your local network. Once paired, the mobile browser renders the full IDE UI — chat, file viewer, git status, diagnostics — via the same WebSocket bridge used by the desktop web-mode. No native app is required; any modern mobile browser works.

Mobile Access is **off by default** and opt-in per installation. It is designed for LAN use. Exposing the server to the public internet requires a reverse-proxy front-end that terminates TLS (see [Network setup](#network-setup)).

## Enabling it

1. Open **Settings** → **Mobile Access**.
2. Toggle **Enable Mobile Access** on.
3. The web server starts listening (default port 7890). The pairing button becomes active.

Disabling the toggle stops accepting new paired sessions. Existing sessions are closed within one second.

## Pairing a device

### On the desktop

1. Settings → Mobile Access → **Generate Pairing Code**.
2. A 6-digit code and QR code are displayed. The code expires in **60 seconds**.

### On the mobile device

1. Connect to the same Wi-Fi network as the desktop.
2. Open the web URL shown in Settings (e.g. `http://192.168.1.42:7890`) in a mobile browser.
3. The **Pair this device** screen appears automatically when no valid session is detected.
4. Enter the 6-digit code (or scan the QR code if your browser supports it).
5. Optionally enter a device name (e.g. "Cole's iPhone 14") for identification in Settings.
6. Tap **Pair**. On success the full IDE loads immediately.

The pairing exchange issues a long-lived refresh token that is stored in `localStorage` and sent as a `Bearer` token on every subsequent WebSocket connection. You do not need to re-pair unless you clear browser storage or the device is revoked.

## Capability matrix

Channels are classified into four capability classes. The class determines what a paired mobile client is allowed to invoke.

| Class | Description | Example channels |
|---|---|---|
| `always` | No auth required. Public metadata and health. | `app:getVersion`, `config:get`, `perf:ping` |
| `paired-read` | Authenticated paired device, read-only. | `files:readFile`, `files:readDir`, `git:status`, `git:diff`, `agentChat:listThreads`, `agentChat:loadThread` |
| `paired-write` | Authenticated paired device, writes scoped to project roots. | `agentChat:sendMessage`, `agentChat:createThread`, `checkpoint:create`, `files:writeFile`, `git:commit` |
| `desktop-only` | Blocked for all mobile clients. Fail-closed. | `files:delete`, `files:rename`, `pty:spawn`, `pty:spawnClaude`, `window:new`, `auth:logout`, `config:set` |

The default for any channel not listed in the catalog is `desktop-only`. New IPC channels must be explicitly added to `src/main/mobileAccess/channelCatalog*.ts` or they remain blocked on mobile. A vitest guard (`channelCatalogCoverage.test.ts`) enforces this invariant and fails the test suite if unlabelled channels are detected.

## Revoking a device

1. Settings → Mobile Access → **Paired Devices**.
2. Find the device by its label and last-seen timestamp.
3. Click **Revoke**. The desktop closes any open WebSocket connections for that device within one second and removes the refresh token hash from the config store.

After revocation the device's refresh token is invalid. The next request from that device returns a `401` and the pairing screen is shown again.

## Network setup

### LAN (default, recommended)

No additional configuration is needed. The server binds to all interfaces on the configured port (default 7890). Both the desktop and mobile device must be on the same LAN. The URL is shown in Settings → Mobile Access.

### Public internet — reverse proxy (recommended)

The Ouroboros web server does **not** terminate TLS. Exposing raw HTTP to the internet is a security risk. Front it with a reverse proxy that handles HTTPS:

**nginx example:**
```nginx
server {
    listen 443 ssl;
    server_name your-hostname.example.com;

    ssl_certificate     /etc/letsencrypt/live/your-hostname/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-hostname/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7890;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**Caddy example:**
```caddyfile
your-hostname.example.com {
    reverse_proxy localhost:7890
}
```

**Cloudflare Tunnel:**  
Run `cloudflared tunnel --url http://localhost:7890` after authenticating with `cloudflared login`. Cloudflare terminates TLS automatically.

### Port forwarding + DDNS (advanced — use at your own risk)

If you cannot use a reverse proxy, you can forward port 7890 from your router to the desktop machine and use a DDNS service (e.g. DuckDNS, No-IP) to get a stable hostname. This exposes unencrypted HTTP to the internet — anyone who intercepts the traffic can read your refresh tokens and session data. Do not use this approach unless you understand and accept the risks.

## Security model

- **Short-lived pairing tickets.** The 6-digit code has a 60-second TTL and is single-use. Brute force is bounded by a rate limiter (10 wrong attempts per IP per 15-minute window) plus the TTL; the worst-case brute-force window allows far fewer than 10^6 guesses.

- **Long-lived refresh tokens.** After pairing, the device holds a 256-bit random token (`crypto.randomBytes(32)`). The desktop stores only the SHA-256 hash (`base64url`). The raw token is never written to disk. Tokens have no expiry — revocation is the only path to invalidation.

- **Capability gate fails closed.** Every IPC channel that has not been explicitly listed as `paired-read`, `paired-write`, or `always` is blocked for mobile clients. A bug in a new feature that forgets to register its channels cannot accidentally grant mobile access.

- **Device fingerprinting.** The QR payload includes a SHA-256 fingerprint of the desktop's install ID. The mobile client can detect when the host/port changes to a different machine (MITM indicator).

- **Backwards compatibility.** When `mobileAccess.enabled` is `false` (the default), the server falls through to the legacy single-token path used for LAN dev workflows. Existing `webAccessToken` cookies remain valid for localhost connections.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Code expired" on the pairing screen | The 60-second ticket TTL elapsed before entry. | Go back to Settings → Mobile Access → Generate a new code and enter it immediately. |
| "Rate limited — try again later." | More than 5 wrong codes were submitted from the same IP in under 60 seconds. | Wait 60 seconds and try again with the correct code. |
| "Invalid code." | The code was mistyped or a code from a previous session was reused. | Codes are 6 digits (zero-padded). Generate a fresh code and re-enter. |
| "Code already used." | The code was redeemed by another device or a duplicate submission. | Generate a new code. |
| Connection drops frequently | The WS connection is timing out or the network is unstable. | The client reconnects with exponential backoff (1 s → 30 s). If the gap is under 5 minutes, in-flight requests resume automatically. Longer gaps require retrying the request. |
| Desktop Settings shows "last seen: never" | The device has not made a successful authenticated request yet. | Re-pair if the refresh token was cleared from browser storage. |
| "Mobile access is not enabled." (404 from /api/pair) | The `mobileAccess.enabled` flag is off. | Settings → Mobile Access → toggle on. |
