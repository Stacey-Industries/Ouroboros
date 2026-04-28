// telemetryQueueAppend.mjs — Wave 52 Phase B
//
// Hook-side helper for appending records to the telemetry parity queue.
// Pure Node built-ins only — no electron, no main-process imports. Loaded by
// hook subprocesses that may run with the IDE offline.
//
// Wire format (MUST stay byte-compatible with src/main/telemetry/telemetryQueue.ts):
//   {
//     "recordId":      string  (UUID v4),
//     "ts":            number  (ms since epoch),
//     "surface":       string  (sink name; routes to handler),
//     "schemaVersion": number  (per-surface; drain skips unknown),
//     "payload":       any     (surface-specific record body)
//   }
//
// The IDE-side drain reads exactly what this writes, so changing the shape
// here without also changing telemetryQueue.ts will break parity drains.
//
// Never throws — failures are written to stderr only, so a misconfigured queue
// dir cannot break the user's terminal session.

import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getQueueDir() {
  const home = process.env.USERPROFILE || process.env.HOME || homedir() || '.';
  return join(home, '.ouroboros', 'telemetry', 'queue');
}

function safeSurface(surface) {
  return String(surface).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Append one record to ~/.ouroboros/telemetry/queue/<surface>.jsonl.
 * Synchronous; fast (small writes); never throws.
 *
 * @param {string} surface
 * @param {number} schemaVersion
 * @param {unknown} payload
 * @returns {boolean} true on success, false on any handled error
 */
export function appendToTelemetryQueue(surface, schemaVersion, payload) {
  try {
    const dir = getQueueDir();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${safeSurface(surface)}.jsonl`);
    const record = {
      recordId: randomUUID(),
      ts: Date.now(),
      surface,
      schemaVersion,
      payload,
    };
    appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
    return true;
  } catch (err) {
    // Hook output is not user-facing — stderr is the right channel.
    try {
      process.stderr.write(`[telemetry-queue] append failed: ${err?.message || err}\n`);
    } catch {
      // Even stderr can fail (closed pipe). Silent at this point.
    }
    return false;
  }
}
