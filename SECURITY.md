# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Ouroboros, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Model

Ouroboros follows Electron security best practices:

- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no Node.js in the renderer process
- `sandbox: true` — full Chromium sandbox enabled
- Content Security Policy (CSP) enforced via response headers
- All user-supplied file paths validated via `assertPathAllowed()`
- `shell.openExternal` protocol-restricted to `http:` and `https:`
