// generic_hook.mjs
// Generic Ouroboros hook — forwards any Claude Code event to the IDE wrapped
// as NDJSON with the given --type. Used for events that don't need custom
// main-process handling (TaskCreated, Elicitation, CwdChanged, etc.).
//
// Usage: node generic_hook.mjs --type <event_type>

import {
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
} from './lib/ouroboros.mjs';
import { fingerprintPrompt, writeScratch } from './lib/signals.mjs';

const args = process.argv.slice(2);
const typeIndex = args.indexOf('--type');
if (typeIndex < 0 || typeIndex + 1 >= args.length) process.exit(0);
const type = args[typeIndex + 1];
if (!type) process.exit(0);

if (shouldSkipForNoIde()) process.exit(0);

const { hooksToken } = loadTokens();
if (!hooksToken) process.exit(0);

const stdinData = await readStdin();
let parsed = null;
let sessionId = 'unknown';
if (stdinData.trim()) {
  try {
    parsed = JSON.parse(stdinData);
    if (parsed?.session_id) sessionId = parsed.session_id;
  } catch { /* ignore */ }
}
if (sessionId === 'unknown' && process.env.CLAUDE_SESSION_ID) {
  sessionId = process.env.CLAUDE_SESSION_ID;
}

const payload = {
  type,
  sessionId,
  timestamp: Date.now(),
};
if (parsed) payload.data = parsed;
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

// UserPromptSubmit enrichment: write scratch for time-to-first-tool, attach
// prompt fingerprint to event payload. Uses raw Claude session_id (not
// IDE-routing inferred id) so pre_tool_use can find the scratch reliably.
if (type === 'user_prompt_submit') {
  const correlationId = parsed?.session_id || process.env.CLAUDE_SESSION_ID || 'default';
  writeScratch(correlationId, 'first_prompt_at', payload.timestamp);
  const promptText = parsed?.prompt || parsed?.message || parsed?.text || parsed?.user_prompt;
  const fingerprint = fingerprintPrompt(promptText);
  if (fingerprint) {
    payload.data = { ...(payload.data ?? {}), promptFingerprint: fingerprint };
  }
}

await sendEvent(payload, hooksToken);
process.exit(0);
