// instructions_loaded.mjs
// InstructionsLoaded hook. Forwards rule/CLAUDE.md load events to the IDE.

import {
  loadTokens,
  readStdin,
  sendEvent,
  shouldSkipForNoIde,
} from './lib/ouroboros.mjs';

if (shouldSkipForNoIde()) process.exit(0);

const { hooksToken } = loadTokens();
if (!hooksToken) process.exit(0);

const stdinData = await readStdin();
if (!stdinData.trim()) process.exit(0);

let parsed;
try { parsed = JSON.parse(stdinData); } catch { process.exit(0); }
if (!parsed) process.exit(0);

const sessionId = parsed.session_id || process.env.CLAUDE_SESSION_ID || 'unknown';

const input = {
  file_path: parsed.file_path || '',
  memory_type: parsed.memory_type || 'Project',
  load_reason: parsed.load_reason || 'unknown',
};
if (Array.isArray(parsed.globs) && parsed.globs.length > 0) {
  input.globs = parsed.globs;
}

const payload = {
  type: 'instructions_loaded',
  sessionId,
  timestamp: Date.now(),
  input,
};
if (process.env.OUROBOROS_INTERNAL === '1') payload.internal = true;

await sendEvent(payload, hooksToken);
process.exit(0);
