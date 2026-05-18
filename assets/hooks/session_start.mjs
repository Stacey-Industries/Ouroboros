// session_start.mjs
// SessionStart hook. Sends session_start event so Ouroboros can track the
// Claude session UUID for --resume support. Rotates oversized debug logs
// once per session as a side-effect (best-effort).

import { readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
} from './lib/ouroboros.mjs';

if (process.env.OUROBOROS_CHAT_SESSION === '1') process.exit(0);
if (shouldSkipForNoIde()) { rotateLogs(); process.exit(0); }

const { hooksToken } = loadTokens();
if (!hooksToken) { rotateLogs(); process.exit(0); }

const stdinData = await readStdin();
let parsed = null;
if (stdinData.trim()) {
  try { parsed = JSON.parse(stdinData); } catch { /* ignore */ }
}

const sessionId = parsed?.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';

const payload = {
  type: 'session_start',
  sessionId,
  cwd: process.cwd(),
  timestamp: Date.now(),
};
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;
if (process.env.OUROBOROS_IDE_SESSION === '1') payload.ideSpawned = true;

await sendEvent(payload, hooksToken);
rotateLogs();
process.exit(0);

function rotateLogFile(full, maxBytes) {
  try {
    if (statSync(full).size < maxBytes) return;
    const old = full + '.old';
    try { unlinkSync(old); } catch { /* may not exist */ }
    renameSync(full, old);
  } catch { /* per-file failure non-fatal */ }
}

function rotateLogsInDir(dir, maxBytes) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.log')) continue;
      rotateLogFile(join(dir, e.name), maxBytes);
    }
  } catch { /* dir missing or unreadable */ }
}

function rotateLogs() {
  const MAX_BYTES = 5 * 1024 * 1024;
  const claudeDir = join(homedir(), '.claude');
  rotateLogsInDir(claudeDir, MAX_BYTES);
  rotateLogsInDir(join(claudeDir, 'hooks'), MAX_BYTES);
}
