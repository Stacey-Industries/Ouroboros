// session_stop.mjs
// Stop hook. Sends session_stop event so the Agent Monitor marks the session
// as complete. Skips for chat-spawned processes (the bridge tracks those via
// synthetic agent_end events).

import {
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
} from './lib/ouroboros.mjs';

if (process.env.OUROBOROS_CHAT_SESSION === '1') process.exit(0);
if (shouldSkipForNoIde()) process.exit(0);

const { hooksToken } = loadTokens();
if (!hooksToken) process.exit(0);

const stdinData = await readStdin();
let parsed = null;
if (stdinData.trim()) {
  try { parsed = JSON.parse(stdinData); } catch { /* ignore */ }
}

const sessionId = parsed?.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';

const payload = {
  type: 'session_stop',
  sessionId,
  timestamp: Date.now(),
  cwd: process.cwd(),
};
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

await sendEvent(payload, hooksToken);
process.exit(0);
