// session_start_spawn_cost.mjs — Wave 52 Phase C + Wave 53a Phase B
//
// SessionStart hook. Reads spawn metadata from the event payload delivered via
// stdin, computes MCP cost fields from the workspace's .claude/settings.json,
// and enqueues:
//   1. a spawn-cost record (Wave 52) for MCP routing telemetry.
//   2. a spawn-trace record (Wave 53a) for orchestration_traces parity with
//      the IDE-side spawn trace emitted in claudeStreamJsonRunner.ts.
//
// Hook contract:
//   - Input: JSON object on stdin matching Claude Code's SessionStart event.
//   - Output: nothing on stdout; stderr for diagnostics only.
//   - Exit: always 0. Never throws; never blocks the session.
//
// Fields that cannot be determined from the hook (IDE-only context):
//   routingDecision — 'unknown'; IDE path knows actual routing.
//   internalMcpScope — 'unknown'; depends on IDE config at spawn time.
//   transport — 'unknown'; depends on IDE transport config.
//   codemodeEnabled — false; hook can't inspect IDE runtime state.
//   ideSession — false; distinguishes hook-emitted from IDE-emitted records.
//
// Dedup: the spawn-cost drain handler reads the existing mcp-spawn-cost.jsonl
// and skips queued records whose sessionId already appears. The spawn-trace
// drain handler dedupes against orchestration_traces by sessionId. Internal
// sessions emit from both the IDE side and this hook; the IDE-side record
// wins in both cases.
//
// ─── Schema mirror for spawn-trace surface ───────────────────────────────────
// Drain handler: src/main/telemetry/spawnTraceDrainHandler.ts
// Schema source: src/main/telemetry/spawnTraceSchema.ts
// Record shape:  { sessionId: string, argv: string[], cwdHash: string, ts: number }
// Schema version: 1
// Notes:
//   - argv is captured raw here; the drain handler applies the canonical
//     redactArgv from traceBatcher.ts before enqueueing the trace.
//   - cwdHash is SHA-256 of cwd, first 12 hex chars.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appendToTelemetryQueue } from './lib/telemetryQueueAppend.mjs';

const SURFACE = 'spawn-cost';
const SCHEMA_VERSION = 1;

const SPAWN_TRACE_SURFACE = 'spawn-trace';
const SPAWN_TRACE_SCHEMA_VERSION = 1;

/** Read all stdin bytes, resolve with string. Never throws. */
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

/** Parse the MCP server map from the workspace's .claude/settings.json. */
function readWorkspaceMcpServers(cwd) {
  try {
    const settingsPath = join(cwd, '.claude', 'settings.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from event cwd
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed.mcpServers === 'object' && parsed.mcpServers !== null
      ? parsed.mcpServers
      : {};
  } catch {
    return {};
  }
}

/** Compute cost fields from the MCP server map. */
function computeCostFields(servers) {
  const serialized = JSON.stringify(servers);
  const mcpConfigBytes = Buffer.byteLength(serialized, 'utf8');
  const serversIncluded = Object.keys(servers);
  return {
    mcpConfigBytes,
    serverCount: serversIncluded.length,
    tokenEstimate: Math.floor(mcpConfigBytes / 4),
    serversIncluded,
  };
}

/**
 * Build the spawn-trace payload. argv is taken from the event payload if
 * available, falling back to process.argv. Either way it is captured raw —
 * the drain handler runs canonical redaction before persisting.
 */
function buildSpawnTracePayload(event) {
  const sessionId = event.session_id || event.sessionId || 'unknown';
  const cwd = event.cwd || process.cwd();
  const cwdHash = createHash('sha256').update(cwd).digest('hex').slice(0, 12);
  const argv = Array.isArray(event.argv)
    ? event.argv.map(String)
    : Array.isArray(event.launch_args)
      ? event.launch_args.map(String)
      : process.argv.slice();
  return { sessionId, argv, cwdHash, ts: Date.now() };
}

/** Build the spawn-cost payload from the event and workspace. */
function buildPayload(event) {
  const sessionId = event.session_id || event.sessionId || 'unknown';
  const cwd = event.cwd || process.cwd();
  const model = event.model || '';

  const servers = readWorkspaceMcpServers(cwd);
  const cost = computeCostFields(servers);

  return {
    sessionId,
    model,
    routingDecision: 'unknown',
    internalMcpScope: 'unknown',
    transport: 'unknown',
    codemodeEnabled: false,
    ideSession: false,
    ...cost,
  };
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      process.stderr.write('[spawn-cost-hook] stdin parse failed — skipping\n');
      return;
    }

    const payload = buildPayload(event);
    const ok = appendToTelemetryQueue(SURFACE, SCHEMA_VERSION, payload);
    if (!ok) {
      process.stderr.write('[spawn-cost-hook] queue append failed\n');
    }

    // Spawn-trace append is isolated from the cost path — a trace failure
    // must not cause the user-visible spawn-cost path to fail.
    try {
      const tracePayload = buildSpawnTracePayload(event);
      const traceOk = appendToTelemetryQueue(
        SPAWN_TRACE_SURFACE,
        SPAWN_TRACE_SCHEMA_VERSION,
        tracePayload,
      );
      if (!traceOk) {
        process.stderr.write('[spawn-trace-hook] queue append failed\n');
      }
    } catch (traceErr) {
      try {
        process.stderr.write(`[spawn-trace-hook] error: ${traceErr?.message || traceErr}\n`);
      } catch {
        // stderr closed — silent.
      }
    }
  } catch (err) {
    try {
      process.stderr.write(`[spawn-cost-hook] unexpected error: ${err?.message || err}\n`);
    } catch {
      // Even stderr can be closed. Silent.
    }
  }
}

main().then(() => process.exit(0));
