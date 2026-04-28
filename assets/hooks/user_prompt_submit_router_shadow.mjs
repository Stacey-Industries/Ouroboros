// user_prompt_submit_router_shadow.mjs — Wave 53a Phase C
//
// UserPromptSubmit hook. Captures the raw prompt text, cwd, sessionId, and
// timestamp from the Claude Code hook event and appends a record to the
// 'router-shadow' telemetry queue. The IDE drain handler (routerShadowDrainHandler.ts)
// reads the queue at next boot and calls shadowRouteHookEvent post-hoc, so
// external sessions contribute to the router training corpus even when the IDE
// was offline during the session.
//
// Hook contract:
//   - Input: JSON object on stdin matching Claude Code's UserPromptSubmit event.
//   - Output: nothing on stdout; stderr for diagnostics only.
//   - Exit: always 0. Never throws; never blocks the session.
//
// Dedup: The drain handler reads router-decisions.jsonl at init and builds a
// Set<sessionId> of live entries (records where postHoc is absent or false).
// If the IDE was running during the session, a live record already exists and
// the drain record is skipped — live record beats drain record.
//
// ─── Schema mirror for router-shadow surface ─────────────────────────────────
// Drain handler: src/main/router/routerShadowDrainHandler.ts
// Schema source: src/main/router/routerShadowSchema.ts
// Surface name:  router-shadow
// Schema version: 1
// Record shape:
//   {
//     sessionId: string,   // Claude Code session identifier
//     prompt:    string,   // raw user prompt text
//     cwd:       string,   // absolute working directory
//     ts:        number    // unix timestamp ms
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { appendToTelemetryQueue } from './lib/telemetryQueueAppend.mjs';

const SURFACE = 'router-shadow';
const SCHEMA_VERSION = 1;

/** Read all stdin bytes; resolve with string. Never throws. */
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

/** Extract the prompt text from the Claude Code UserPromptSubmit event payload. */
function extractPrompt(event) {
  // Claude Code delivers the prompt in different fields depending on version.
  if (typeof event.prompt === 'string') return event.prompt;
  if (typeof event.message === 'string') return event.message;
  if (typeof event.content === 'string') return event.content;
  return '';
}

/** Build the queue payload from a parsed event object. */
function buildPayload(event) {
  const sessionId = event.session_id || event.sessionId || 'unknown';
  const cwd = event.cwd || process.cwd();
  const prompt = extractPrompt(event);
  return { sessionId, prompt, cwd, ts: Date.now() };
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      process.stderr.write('[router-shadow-hook] stdin parse failed — skipping\n');
      return;
    }

    const payload = buildPayload(event);

    if (!payload.prompt) {
      // Empty prompt — nothing to shadow-route; skip silently.
      return;
    }

    const ok = appendToTelemetryQueue(SURFACE, SCHEMA_VERSION, payload);
    if (!ok) {
      process.stderr.write('[router-shadow-hook] queue append failed\n');
    }
  } catch (err) {
    try {
      process.stderr.write(`[router-shadow-hook] unexpected error: ${err?.message || err}\n`);
    } catch {
      // Even stderr can be closed. Silent.
    }
  }
}

main().then(() => process.exit(0));
