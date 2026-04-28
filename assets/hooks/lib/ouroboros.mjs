// ouroboros.mjs — shared utilities for Ouroboros IDE hook scripts.
// Provides token loading (disk-first, env fallback), pipe/TCP send transport,
// stdin reading, address parsing, session-ID inference, and the approval.wait
// flow used by pre_tool_use.

// ─── Schema mirror for hook-events surface ────────────────────────────────────
// Drain handler: src/main/telemetry/hookEventsDrainHandler.ts
// Schema source: src/main/telemetry/hookEventsSchema.ts
// Record shape (must match HookEventRecord exactly):
//   { eventType: string, sessionId: string, eventId: string, payload: object }
// Schema version: 1
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { appendToTelemetryQueue } from './telemetryQueueAppend.mjs';

const PIPE_PATH = '\\\\.\\pipe\\agent-ide-hooks';
const TOOL_PIPE_PATH = '\\\\.\\pipe\\ouroboros-tools';
const DEFAULT_TIMEOUT_MS = 800;

export function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

export function getTokenFilePath() {
  if (process.env.OUROBOROS_TOKEN_FILE) return process.env.OUROBOROS_TOKEN_FILE;
  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      return join(process.env.APPDATA, 'Ouroboros', 'session-tokens.json');
    }
    return null;
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Ouroboros', 'session-tokens.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdg, 'Ouroboros', 'session-tokens.json');
}

export function loadTokens() {
  let hooksToken = process.env.OUROBOROS_HOOKS_TOKEN || '';
  let toolToken = process.env.OUROBOROS_TOOL_TOKEN || '';
  const path = getTokenFilePath();
  if (path && existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.hooksToken) hooksToken = data.hooksToken;
      if (data.toolToken) toolToken = data.toolToken;
    } catch { /* ignore parse errors */ }
  }
  return { hooksToken, toolToken };
}

export function parseAddress() {
  let host = '127.0.0.1';
  let port = 3333;
  const addr = process.env.OUROBOROS_HOOKS_ADDRESS;
  if (!addr) return { host, port };
  if (/^\d+$/.test(addr)) return { host, port: parseInt(addr, 10) };
  const m = addr.match(/^(.+):(\d+)$/);
  if (m) return { host: m[1], port: parseInt(m[2], 10) };
  return { host, port };
}

// For chat sessions: hooks.ts inferSessionId() maps 'unknown' to the synthetic
// session created by the chat bridge, since the CLI session ID differs from
// the stream-json session ID the bridge uses.
export function inferSessionId(parsed) {
  if (process.env.OUROBOROS_CHAT_SESSION === '1') return 'unknown';
  if (parsed?.session_id) return parsed.session_id;
  if (parsed?.sessionId) return parsed.sessionId;
  return process.env.CLAUDE_SESSION_ID || 'unknown';
}

// Fast-exit guard. External terminal sessions (no IDE env vars, no token file)
// bail in ~3ms instead of paying the pipe-connect-then-fail timeout. The token
// file check covers the cross-restart grace window where env vars are stale
// but disk tokens are fresh.
export function shouldSkipForNoIde() {
  if (process.env.OUROBOROS_HOOKS_ADDRESS || process.env.OUROBOROS_HOOKS_TOKEN) return false;
  const path = getTokenFilePath();
  if (path && existsSync(path)) return false;
  return true;
}

function trySendOnce(target, authBytes, payloadBytes, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    let connected = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    let sock;
    try {
      sock = createConnection(target);
    } catch {
      finish(false);
      return;
    }
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => {
      connected = true;
      try {
        sock.write(authBytes);
        sock.write(payloadBytes, () => sock.end());
      } catch {
        sock.destroy();
        finish(false);
      }
    });
    sock.on('timeout', () => { sock.destroy(); finish(false); });
    sock.on('error', () => { sock.destroy(); finish(false); });
    sock.on('close', () => finish(connected));
  });
}

export async function sendEvent(payload, hooksToken, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const authBytes = Buffer.from(JSON.stringify({ auth: hooksToken }) + '\n', 'utf8');
  const payloadBytes = Buffer.from(JSON.stringify(payload) + '\n', 'utf8');
  const piped = await trySendOnce({ path: PIPE_PATH }, authBytes, payloadBytes, timeoutMs);
  if (piped) return true;
  const { host, port } = parseAddress();
  const ok = await trySendOnce({ host, port }, authBytes, payloadBytes, timeoutMs);
  if (ok) return true;

  // Write-on-fail JSONL fallback: IDE pipe was unreachable.
  // Only fires when both pipe and TCP sends fail — never on success.
  try {
    const sessionId = inferSessionId(payload);
    const eventId = (typeof payload.eventId === 'string' && payload.eventId) || randomUUID();
    appendToTelemetryQueue('hook-events', 1, {
      eventType: payload.type,
      sessionId,
      eventId,
      payload,
    });
  } catch {
    // Hook helpers must never throw — stderr only.
    try {
      process.stderr.write('[ouroboros] telemetry queue fallback failed\n');
    } catch { /* even stderr can be closed */ }
  }
  return false;
}

// approval.wait over ouroboros-tools pipe. Returns { decision, reason } where
// decision is 'approve' | 'reject' | null (null = pipe unavailable / timeout).
export function waitForApproval(toolToken, requestId, waitMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (decision, reason) => {
      if (!done) { done = true; resolve({ decision, reason }); }
    };
    let sock;
    try {
      sock = createConnection({ path: TOOL_PIPE_PATH });
    } catch {
      finish(null, null);
      return;
    }
    sock.setTimeout(waitMs + 2000);
    let buf = '';
    sock.on('connect', () => {
      try {
        sock.write(JSON.stringify({ auth: toolToken }) + '\n');
        sock.write(JSON.stringify({
          id: 'aw-' + requestId,
          method: 'approval.wait',
          params: { requestId, timeoutMs: waitMs },
        }) + '\n');
      } catch {
        sock.destroy();
        finish(null, null);
      }
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      try {
        const resp = JSON.parse(line);
        const inner = resp.result || resp;
        if (inner?.decision) {
          finish(inner.decision, inner.reason || null);
        } else {
          finish(null, null);
        }
      } catch {
        finish(null, null);
      }
      sock.end();
    });
    sock.on('timeout', () => { sock.destroy(); finish(null, null); });
    sock.on('error', () => { sock.destroy(); finish(null, null); });
    sock.on('close', () => finish(null, null));
  });
}
