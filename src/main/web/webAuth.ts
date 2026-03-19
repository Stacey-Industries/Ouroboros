/**
 * webAuth.ts — Token-based authentication for web remote access.
 *
 * Provides token generation, validation, rate limiting, and a login page
 * for the web server. Uses constant-time comparison to prevent timing attacks.
 */

import crypto from 'crypto'

import { getConfigValue, setConfigValue } from '../config'

// ─── Token Management ────────────────────────────────────────────────────────

/**
 * Returns the existing web access token, or generates and persists a new one.
 */
export function getOrCreateWebToken(): string {
  let token = getConfigValue('webAccessToken')
  if (!token) {
    token = crypto.randomBytes(32).toString('hex')
    setConfigValue('webAccessToken', token)
  }
  return token
}

/**
 * Validates a provided token against the stored token using constant-time
 * comparison to prevent timing side-channel attacks.
 */
export function validateToken(provided: string): boolean {
  if (!provided || typeof provided !== 'string') return false

  const expected = getOrCreateWebToken()
  if (provided.length !== expected.length) return false

  try {
    const providedBuf = Buffer.from(provided, 'utf-8')
    const expectedBuf = Buffer.from(expected, 'utf-8')
    return crypto.timingSafeEqual(providedBuf, expectedBuf)
  } catch {
    return false
  }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  firstAttempt: number
}

const failedAttempts = new Map<string, RateLimitEntry>()

const RATE_LIMIT_MAX_ATTEMPTS = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Checks whether an IP address has exceeded the rate limit for failed auth attempts.
 * Also cleans up stale entries older than the rate limit window.
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now()

  // Clean up stale entries
  for (const [key, entry] of failedAttempts) {
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      failedAttempts.delete(key)
    }
  }

  const entry = failedAttempts.get(ip)
  if (!entry) return false

  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.delete(ip)
    return false
  }

  return entry.count >= RATE_LIMIT_MAX_ATTEMPTS
}

/**
 * Records a failed authentication attempt for the given IP address.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now()
  const entry = failedAttempts.get(ip)

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAttempt: now })
  } else {
    entry.count++
  }
}

// ─── Login Page ──────────────────────────────────────────────────────────────

export const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ouroboros IDE</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .container {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      text-align: center;
    }
    .subtitle {
      color: #8b949e;
      text-align: center;
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #c9d1d9;
    }
    input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      border-color: #238636;
      box-shadow: 0 0 0 3px rgba(35, 134, 54, 0.3);
    }
    button {
      width: 100%;
      padding: 0.625rem 1rem;
      background: #238636;
      color: #ffffff;
      border: 1px solid rgba(240, 246, 252, 0.1);
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 0.5rem;
    }
    button:hover { background: #2ea043; }
    button:active { background: #238636; }
    .error {
      color: #f85149;
      font-size: 0.8125rem;
      margin-top: 0.75rem;
      text-align: center;
      min-height: 1.25rem;
    }
    .help {
      color: #8b949e;
      font-size: 0.75rem;
      text-align: center;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Ouroboros IDE</h1>
    <p class="subtitle">Remote Access</p>
    <form id="login-form">
      <div class="form-group">
        <label for="token">Access Token</label>
        <input type="password" id="token" name="token" placeholder="Paste your access token" autocomplete="off" autofocus>
      </div>
      <button type="submit">Connect</button>
      <div class="error" id="error"></div>
    </form>
    <p class="help">Find your token in the IDE console or Settings</p>
  </div>
  <script>
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var token = document.getElementById('token').value.trim();
      if (!token) {
        document.getElementById('error').textContent = 'Please enter a token.';
        return;
      }
      // Redirect to current path with token as query param
      var url = new URL(window.location.href);
      url.searchParams.set('token', token);
      window.location.href = url.toString();
    });
  </script>
</body>
</html>`
