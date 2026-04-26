// agent_end.mjs
// SubagentStop telemetry hook. Sends agent_end event with cost/error if known.
// Skips fast for chat-spawned processes (chat bridge tracks those via
// synthetic monitor events) and for sessions with no path to an IDE.

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
let agentData = {};
try { if (stdinData.trim()) agentData = JSON.parse(stdinData); } catch { /* ignore */ }

const sessionId = agentData.session_id || agentData.sessionId
  || process.env.CLAUDE_SESSION_ID || 'unknown';

const payload = {
  type: 'agent_end',
  sessionId,
  timestamp: Date.now(),
  cwd: process.cwd(),
};
if (agentData.error) payload.error = agentData.error;
if (agentData.cost_usd) payload.costUsd = agentData.cost_usd;
else if (agentData.cost) payload.costUsd = agentData.cost;
if (process.env.CLAUDE_SESSION_ID) payload.parentSessionId = process.env.CLAUDE_SESSION_ID;
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

await sendEvent(payload, hooksToken, { timeoutMs: 250 });
process.exit(0);
