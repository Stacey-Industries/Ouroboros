/**
 * mcpSpawnCostTelemetry.ts — Wave 51 Phase D
 *
 * Per-spawn MCP token-cost telemetry. Emits one JSONL record per scoped
 * MCP config build to `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl`.
 *
 * The token estimate is `bytes / 4` — a coarse approximation that avoids
 * pulling a real tokenizer into the main process. Good enough to compare
 * routing decisions against each other; not a substitute for true counts.
 *
 * Mirrors the pattern in `src/main/hooksGraphUsageTap.ts` (Wave 48/50):
 * open-append-close, tolerant of write failures (log.warn but never throw).
 *
 * The rollup script at `scripts/measure-mcp-token-cost.ts` consumes this
 * file and produces median + p25/p75 by routing decision.
 */

import fs from 'fs';
import path from 'path';

import log from '../../logger';
import type { RoutingDecision } from './internalMcpRoutingPolicy';

export type InternalMcpScopeName = 'always' | 'task-gated' | 'never';
export type McpTransportName = 'sse' | 'stdio';

export interface McpSpawnCostRecord {
  /** Wall-clock millis at emission. */
  ts: number;
  /** Spawn-scoped identifier (typically the orchestration session/request id). */
  spawnId: string;
  /** Final per-spawn ouroboros routing outcome (post-downgrade). */
  routingDecision: RoutingDecision;
  /** Wave 48 scope config in effect for this spawn. */
  internalMcpScope: InternalMcpScopeName;
  /** Configured ouroboros transport (Phase B). */
  transport: McpTransportName;
  /** `codemode.enabled` flag at the time of the spawn. */
  codemodeEnabled: boolean;
  /** Byte length of `JSON.stringify(mcpServers)` written to the temp config. */
  mcpConfigBytes: number;
  /** Number of MCP servers in the final settings (excluding ouroboros when routed). */
  serverCount: number;
  /** Token estimate — `bytes / 4`, documented approximation. */
  tokenEstimate: number;
  /** Server names in the final config; helps post-hoc attribution. */
  serversIncluded: string[];
}

function telemetryDir(): string {
  return path.join(process.env.USERPROFILE || process.env.HOME || '.', '.ouroboros', 'telemetry');
}

function ensureDir(dir: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry dir
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    log.warn('[mcp-spawn-cost] mkdir failed:', err);
    return false;
  }
}

/**
 * Append one telemetry record. Never throws; failures are logged at warn.
 *
 * Also exported as a non-blocking call site — callers should not `await`
 * its completion when on the critical spawn path. The internal `appendFile`
 * is async and silent on success.
 */
export function emitMcpSpawnCost(record: McpSpawnCostRecord): void {
  const dir = telemetryDir();
  if (!ensureDir(dir)) return;
  const filePath = path.join(dir, 'mcp-spawn-cost.jsonl');
  const line = JSON.stringify(record) + '\n';
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path under USERPROFILE
    fs.appendFile(filePath, line, (err) => {
      if (err) log.warn('[mcp-spawn-cost] append failed:', err);
    });
  } catch (err) {
    log.warn('[mcp-spawn-cost] write failed:', err);
  }
}

/**
 * Computes the cost-side fields from the final MCP server map. Centralized so
 * the call site stays a one-liner and the math (bytes / 4) is documented in
 * one place.
 */
export function computeMcpCostFields(servers: Record<string, unknown>): {
  mcpConfigBytes: number;
  serverCount: number;
  tokenEstimate: number;
  serversIncluded: string[];
} {
  const serialized = JSON.stringify(servers);
  const mcpConfigBytes = Buffer.byteLength(serialized, 'utf8');
  const serversIncluded = Object.keys(servers);
  // Token estimate uses bytes / 4 — coarse but consistent across spawns.
  // True tokenization would require pulling a tokenizer into main; not worth
  // it for relative comparisons over a soak window.
  const tokenEstimate = Math.round(mcpConfigBytes / 4);
  return {
    mcpConfigBytes,
    serverCount: serversIncluded.length,
    tokenEstimate,
    serversIncluded,
  };
}
