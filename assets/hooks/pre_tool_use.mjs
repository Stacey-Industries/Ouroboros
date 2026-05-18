// pre_tool_use.mjs
// PreToolUse hook. Sends pre_tool_use event to Ouroboros and waits for an
// approval decision (via ouroboros-tools pipe primary, file-poll fallback).
// Exits 0 to approve, 2 with reason on stderr to reject. Approves by default
// when Ouroboros is unreachable.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  inferSessionId,
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
  waitForApproval,
} from './lib/ouroboros.mjs';
import { consumeScratch, detectSensitivePaths } from './lib/signals.mjs';

const APPROVALS_DIR = join(homedir(), '.ouroboros', 'approvals');
const POLL_INTERVAL_MS = 500;
const MAX_POLL_MS = 15000;

if (shouldSkipForNoIde()) process.exit(0);

const { hooksToken, toolToken } = loadTokens();
if (!hooksToken) process.exit(0);

const stdinData = await readStdin();
if (!stdinData.trim()) process.exit(0);

let toolInput;
try { toolInput = JSON.parse(stdinData); } catch { process.exit(0); }

const requestId = randomBytes(8).toString('hex');
const sessionId = inferSessionId(toolInput);
const toolName = toolInput.tool_name || toolInput.toolName || 'unknown';

// tool_use_id is the stable per-call identifier Claude Code includes in both
// PreToolUse and PostToolUse stdin. Use it as toolCallId so the main-process
// correlation pairing (hooksCorrelationPairing.ts) can match pre↔post.
// Fall back to requestId (random) when absent so older Claude Code versions
// still work; pairing will degrade gracefully in that case.
const toolUseId = toolInput.tool_use_id || null;

const payload = {
  type: 'pre_tool_use',
  sessionId,
  toolName,
  input: toolInput,
  requestId,
  cwd: process.cwd(),
  timestamp: Date.now(),
};
if (toolUseId) {
  payload.toolCallId = toolUseId;
} else {
  // Degraded mode: no tool_use_id from Claude Code — pairing will use requestId
  // which won't match post_tool_use (different event). Warn so the log is clear.
  payload.toolCallId = requestId;
  if (process.env.OUROBOROS_DEBUG === '1') {
    process.stderr.write('[ouroboros] pre_tool_use: tool_use_id absent — diff-review pairing degraded\n');
  }
}
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

// Path sensitivity flag: defensive marker for downstream redaction policy
if (detectSensitivePaths(toolName, toolInput.tool_input ?? toolInput, null)) {
  payload.touchedSensitivePath = true;
}

// Time-to-first-tool: written by UserPromptSubmit, consumed on first tool call
// of the turn. Uses raw Claude session_id for stable cross-event correlation
// (not the IDE-routing inferred id, which can be 'unknown' for chat sessions).
const correlationId = toolInput.session_id || toolInput.sessionId
  || process.env.CLAUDE_SESSION_ID || 'default';
const promptAtRaw = consumeScratch(correlationId, 'first_prompt_at');
if (promptAtRaw) {
  const promptAt = parseInt(promptAtRaw, 10);
  if (Number.isFinite(promptAt)) {
    const delta = payload.timestamp - promptAt;
    if (delta >= 0 && delta < 600000) payload.timeToFirstToolMs = delta;
  }
}

const sent = await sendEvent(payload, hooksToken);
if (!sent) process.exit(0);

let decision = null;
let reason = null;
let message = null;

if (toolToken) {
  const result = await waitForApproval(toolToken, requestId, MAX_POLL_MS);
  decision = result.decision;
  reason = result.reason;
  message = result.message;
}

if (decision === null) {
  ({ decision, reason, message } = await pollResponseFile({
    responsePath: join(APPROVALS_DIR, requestId + '.response'),
    maxMs: MAX_POLL_MS,
    intervalMs: POLL_INTERVAL_MS,
    decision, reason, message,
  }));
}

async function pollResponseFile({ responsePath, maxMs, intervalMs, decision, reason, message }) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (existsSync(responsePath)) {
      const parsed = tryReadResponse(responsePath);
      if (parsed) return { decision: parsed.decision, reason: parsed.reason || null, message: parsed.message || null };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { decision, reason, message };
}

function tryReadResponse(responsePath) {
  try {
    const text = readFileSync(responsePath, 'utf8');
    const resp = JSON.parse(text);
    try { unlinkSync(responsePath); } catch { /* best-effort cleanup */ }
    return resp;
  } catch {
    // partial write — wait and retry
    return null;
  }
}

if (decision === 'reject') {
  process.stderr.write(reason || 'Rejected by user in Ouroboros IDE');
  process.exit(2);
}

// Warn: tool proceeds (exit 0) but advisory message is surfaced to the agent
// via structured JSON stdout — the documented Claude Code hook protocol for
// agent-visible context. See roadmap/wave-76-warn-hooks/wave-76-decisions.md.
if (decision === 'approve' && message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { permissionDecision: 'allow' },
    systemMessage: message,
  }));
}

process.exit(0);
