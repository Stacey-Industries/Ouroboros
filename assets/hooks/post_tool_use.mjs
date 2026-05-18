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
try {
  toolData = JSON.parse(stdinData);
} catch {
  process.exit(0);
}

const sessionId = inferSessionId(toolData);
const toolName = toolData.tool_name || toolData.toolName || 'unknown';

// tool_use_id is the stable per-call identifier Claude Code includes in both
// PreToolUse and PostToolUse stdin. Forward it as toolCallId so the main-process
// correlation pairing (hooksCorrelationPairing.ts) can match this post event to
// its corresponding pre_tool_use snapshot. Without this the diff-review stash
// key never matches and the review panel never opens.
const toolUseId = toolData.tool_use_id || null;

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
  cwd: process.cwd(),
  timestamp: Date.now(),
};
if (durationMs !== null) payload.durationMs = durationMs;
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;
if (toolUseId) {
  payload.toolCallId = toolUseId;
} else if (process.env.OUROBOROS_DEBUG === '1') {
  process.stderr.write('[ouroboros] post_tool_use: tool_use_id absent — diff-review pairing degraded\n');
}

// Outcome normalization: success flag + errorClass derived from output content
const outcome = normalizeOutcome(toolName, output);
payload.success = outcome.success;
if (outcome.errorClass) payload.errorClass = outcome.errorClass;

// Path sensitivity flag for downstream redaction policy
const toolInput = toolData.tool_input ?? toolData.input;
if (detectSensitivePaths(toolName, toolInput, output)) {
  payload.touchedSensitivePath = true;
}

// Forward file path(s) for write-class tools so the main-process diff-review
// tap can correlate pre/post snapshots without re-parsing tool input there.
if (toolName === 'Write' || toolName === 'Edit') {
  if (toolInput?.file_path) payload.filePath = toolInput.file_path;
} else if (toolName === 'MultiEdit') {
  if (Array.isArray(toolInput?.edits)) {
    payload.filePaths = toolInput.edits.map((e) => e.file_path).filter(Boolean);
  }
}

await sendEvent(payload, hooksToken);
process.exit(0);
