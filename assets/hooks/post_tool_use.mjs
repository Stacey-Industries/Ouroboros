// post_tool_use.mjs
// PostToolUse hook. Forwards tool result to Ouroboros (with duration if known).
// Fire-and-forget — never blocks the model.

import {
  inferSessionId,
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
} from './lib/ouroboros.mjs';
import { detectSensitivePaths, normalizeOutcome } from './lib/signals.mjs';

if (shouldSkipForNoIde()) process.exit(0);

const { hooksToken } = loadTokens();
if (!hooksToken) process.exit(0);

const stdinData = await readStdin();
if (!stdinData.trim()) process.exit(0);

let toolData;
try { toolData = JSON.parse(stdinData); } catch { process.exit(0); }

const sessionId = inferSessionId(toolData);
const toolName = toolData.tool_name || toolData.toolName || 'unknown';

let durationMs = null;
if (process.env.CLAUDE_TOOL_DURATION_MS) {
  const parsed = parseInt(process.env.CLAUDE_TOOL_DURATION_MS, 10);
  if (Number.isFinite(parsed)) durationMs = parsed;
} else if (typeof toolData.duration_ms === 'number') {
  durationMs = toolData.duration_ms;
}

const output = toolData.output ?? toolData.result ?? toolData.response ?? toolData;

const payload = {
  type: 'post_tool_use',
  sessionId,
  toolName,
  output,
  timestamp: Date.now(),
};
if (durationMs !== null) payload.durationMs = durationMs;
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

// Outcome normalization: success flag + errorClass derived from output content
const outcome = normalizeOutcome(toolName, output);
payload.success = outcome.success;
if (outcome.errorClass) payload.errorClass = outcome.errorClass;

// Path sensitivity flag for downstream redaction policy
const toolInput = toolData.tool_input ?? toolData.input;
if (detectSensitivePaths(toolName, toolInput, output)) {
  payload.touchedSensitivePath = true;
}

await sendEvent(payload, hooksToken);
process.exit(0);
