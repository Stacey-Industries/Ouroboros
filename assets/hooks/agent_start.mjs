// agent_start.mjs
// SubagentStart telemetry hook. Sends agent_start event with task label and
// metadata. Skips fast for chat-spawned processes and sessions with no path
// to an IDE.

import { randomBytes } from 'node:crypto';

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

const subagentSessionId = agentData.session_id || agentData.sessionId;
const sessionId = subagentSessionId || ('subagent-' + randomBytes(6).toString('hex'));

const parentSessionId = process.env.CLAUDE_SESSION_ID;
const model = agentData.model_id || agentData.model;
const prompt = agentData.prompt || agentData.message || agentData.task;

const payload = {
  type: 'agent_start',
  sessionId,
  taskLabel: buildTaskLabel(prompt),
  timestamp: Date.now(),
  cwd: process.cwd(),
};
if (parentSessionId) payload.parentSessionId = parentSessionId;
if (prompt) payload.prompt = prompt;
if (model) payload.model = model;
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;
if (process.env.OUROBOROS_IDE_SESSION === '1') payload.ideSpawned = true;

await sendEvent(payload, hooksToken, { timeoutMs: 250 });
process.exit(0);

function buildTaskLabel(p) {
  if (!p) return 'Sub-agent';
  const trimmed = String(p).replace(/\s+/g, ' ').trim();
  return trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed;
}
