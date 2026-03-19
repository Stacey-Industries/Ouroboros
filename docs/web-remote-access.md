# Web Remote Access

## Overview

The Ouroboros IDE runs a web server alongside the Electron app on port 7890 (configurable). Any browser can connect and use the full IDE UI -- terminals, file tree, editor, agent chat, everything. The web client uses the same React renderer as the Electron window, communicating over WebSocket instead of Electron IPC. Token authentication (64 hex chars, 256-bit entropy) protects all access.

## Finding Your Access Token

The server logs its URL to the Electron console on startup. Open DevTools (Ctrl+Shift+I) and look for:

```
[web] Server listening on http://localhost:7890
```

You can also find the token stored as `webAccessToken` in the electron-store config file. The token persists across restarts. To regenerate, delete the `webAccessToken` entry from config and restart.

## Option 1: Tailscale (Recommended)

Tailscale creates an encrypted WireGuard mesh network between your devices. Combined with token auth, this provides two layers of security with zero configuration of firewalls or port forwarding.

### Prerequisites

- Tailscale installed and running on both your PC and your remote device (phone, tablet, laptop)
- Both devices signed into the same Tailscale account (same tailnet)

### Find Your PC and Connect

Run `tailscale status` to see your machine name and 100.x.x.x IP. Then open:

```
http://my-desktop:7890?token=YOUR_TOKEN
```

MagicDNS is enabled by default, so the short hostname works. Alternatives:

```
http://my-desktop.tailnet-name.ts.net:7890?token=YOUR_TOKEN
http://100.64.0.1:7890?token=YOUR_TOKEN
```

Use `tailscale ip -4` to get your exact 100.x.x.x address. After your first visit, the token is stored in a browser cookie -- bookmark the plain `http://my-desktop:7890` URL for future use.

### Why Tailscale Is Recommended

- No port forwarding, no firewall rules, no DNS setup
- WireGuard encryption + token auth = two security layers
- Works across NATs, cellular networks, and different WiFi networks

## Option 2: Cloudflare Tunnel

For a public HTTPS URL accessible from anywhere without Tailscale.

### Quick Tunnel (Temporary)

No account needed. Gives you a temporary `*.trycloudflare.com` URL that lasts until you stop the command:

```bash
cloudflared tunnel --url http://localhost:7890
```

The command prints a URL like `https://random-words.trycloudflare.com`. Open that URL and enter your token on the login page. The tunnel disappears when you stop the command.

### Persistent Tunnel (Custom Domain)

Requires a Cloudflare account and a domain managed by Cloudflare:

```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create ouroboros-ide
cloudflared tunnel route dns ouroboros-ide ide.yourdomain.com

# Run the tunnel (each time)
cloudflared tunnel run --url http://localhost:7890 ouroboros-ide
```

Your IDE is then available at `https://ide.yourdomain.com`. Cloudflare handles TLS termination and provides DDoS protection. You can layer Cloudflare Access on top for additional auth controls.

## Option 3: Direct LAN Access

For devices on the same local network (same WiFi or wired network).

Find your PC's local IP with `ipconfig` (Windows) or `ifconfig` (macOS/Linux), then open:

```
http://192.168.1.100:7890?token=YOUR_TOKEN
```

Limitations: both devices must be on the same network, traffic is unencrypted HTTP, and your local IP may change with DHCP.

## Mobile Tips

- Use **landscape mode** for the best terminal experience
- **iOS Safari:** tap Share > Add to Home Screen for app-like full-screen
- **Android Chrome:** three-dot menu > Add to Home Screen
- Keyboard shortcuts may not work on mobile -- use the agent chat interface instead
- Terminal input works with on-screen keyboard; long-press to paste

## Changing the Port

The default port is 7890. Change it in Settings under `webAccessPort` (valid range: 1024--65535), then restart the IDE. Or edit the config file directly: `"webAccessPort": 8080`.

## Troubleshooting

| Problem                                  | Solution                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection refused**                   | Ensure the Electron app is running on the host machine. Check that the port is correct.                                               |
| **Login page appears / "Invalid token"** | Check the IDE console for the current token. Tokens are case-sensitive; copy the full 64-character string.                            |
| **WebSocket disconnects**                | Network interruption. The IDE auto-reconnects with exponential backoff -- wait a few seconds.                                         |
| **Slow terminal output**                 | Expected on mobile or high-latency networks. PTY output is batched at 60fps to reduce overhead.                                       |
| **Port already in use**                  | Another process is using port 7890. Change the port in Settings or stop the conflicting process.                                      |
| **Tailscale: cannot connect**            | Run `tailscale status` on both devices. Ensure both are online and on the same tailnet. Try the 100.x.x.x IP instead of the hostname. |
| **Cloudflare Tunnel: 502 error**         | The tunnel is running but the IDE is not. Start the Electron app first, then the tunnel.                                              |
| **Page loads but UI is blank**           | Hard-refresh (Ctrl+Shift+R) to clear cached assets after an IDE update.                                                               |

## Security Considerations

- **Never disable token authentication.** The token is the primary access control for the web interface.
- **Tailscale + token** is the recommended minimum security posture. Tailscale encrypts the network; the token authenticates the user.
- **Cloudflare Tunnel** adds TLS encryption and Cloudflare's network protections. Consider adding Cloudflare Access policies for team use.
- **Direct LAN** should only be used on trusted networks. The connection is unencrypted HTTP.
- The access token is 64 hex characters (256 bits), generated with `crypto.randomBytes`.
- **Rate limiting:** 10 failed authentication attempts from the same IP trigger a 15-minute lockout.
- The token is stored in an HttpOnly cookie after first use, so it does not appear in URLs or browser history after the initial connection.
