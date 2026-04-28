// session_start_spawn_cost.mjs — Wave 52 Phase C
//
// SessionStart hook. Reads spawn metadata from the event payload delivered via
// stdin, computes MCP cost fields from the workspace's .claude/settings.json,
// and enqueues a spawn-cost record for the IDE to drain on next launch.
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
// Dedup: the drain handler reads the existing mcp-spawn-cost.jsonl and skips
// any queued record whose sessionId already appears in it (internal sessions
// emit from both the IDE side and this hook; the IDE-side record wins).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appendToTelemetryQueue } from './lib/telemetryQueueAppend.mjs';

const SURFACE = 'spawn-cost';
const SCHEMA_VERSION = 1;

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
  } catch (err) {
    try {
      process.stderr.write(`[spawn-cost-hook] unexpected error: ${err?.message || err}\n`);
    } catch {
      // Even stderr can be closed. Silent.
    }
  }
}

main().then(() => process.exit(0));
