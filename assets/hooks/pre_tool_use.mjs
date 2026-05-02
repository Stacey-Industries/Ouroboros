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

const payload = {
  type: 'pre_tool_use',
  sessionId,
  toolName,
  input: toolInput,
  requestId,
  timestamp: Date.now(),
};
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
  // Fallback: poll for approval response file. Used when the tool pipe is
  // unreachable (older IDE, pipe not started, no toolToken). Matches pre-pipe
  // behavior exactly.
  const responsePath = join(APPROVALS_DIR, requestId + '.response');
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    if (existsSync(responsePath)) {
      try {
        const text = readFileSync(responsePath, 'utf8');
        const resp = JSON.parse(text);
        try { unlinkSync(responsePath); } catch { /* best-effort cleanup */ }
        decision = resp.decision;
        reason = resp.reason || null;
        message = resp.message || null;
        break;
      } catch {
        // partial write — wait and retry
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
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
