/**
 * spawnCostDrainHandler.ts — Wave 52 Phase C
 *
 * Drain handler for the 'spawn-cost' queue surface. Registered at IDE boot
 * via `registerSpawnCostHandler()`; processes records written by the
 * `session_start_spawn_cost.mjs` hook during external Claude Code sessions.
 *
 * Dedup design
 * ────────────
 * For internal sessions (IDE-spawned), both the IDE-side emitter in
 * `scopedMcpConfig.ts` AND the SessionStart hook fire. The IDE-side record
 * is written directly to mcp-spawn-cost.jsonl in real time; by the time the
 * drain runs (on next IDE launch), the IDE-side record is already on disk.
 *
 * Dedup key: `payload.sessionId` (hook) vs `spawnId` in the existing JSONL
 * (IDE side). For internal sessions `spawnId === sessionId` because
 * `ScopedMcpConfigOptions.sessionId` is the Claude Code session ID, the same
 * value the hook reads from the event. So: read the existing JSONL once at
 * handler initialisation, build a Set of known spawnIds, skip any queued
 * record whose sessionId is already in the set.
 *
 * Idempotence: if the drain is interrupted and re-run, the JSONL-presence
 * check ensures the same record is not written twice.
 */

import fs from 'node:fs';

import log from '../../logger';
import { registerSurfaceHandler } from '../../telemetry/telemetryDrain';
import type { QueueRecord } from '../../telemetry/telemetryQueue';
import {
  emitMcpSpawnCost,
  getSpawnCostJsonlPath,
  type McpSpawnCostRecord,
} from './mcpSpawnCostTelemetry';

export const SPAWN_COST_SURFACE = 'spawn-cost';
export const SPAWN_COST_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Payload shape (must match hook script output)
// ---------------------------------------------------------------------------

interface HookSpawnCostPayload {
  sessionId: string;
  model: string;
  routingDecision: string;
  internalMcpScope: string;
  codemodeEnabled: boolean;
  ideSession: boolean;
  mcpConfigBytes: number;
  serverCount: number;
  tokenEstimate: number;
  serversIncluded: string[];
}

// ---------------------------------------------------------------------------
// Dedup helpers
// ---------------------------------------------------------------------------

function extractSpawnId(line: string): string | null {
  try {
    const rec = JSON.parse(line) as Partial<McpSpawnCostRecord>;
    return typeof rec.spawnId === 'string' ? rec.spawnId : null;
  } catch {
    return null;
  }
}

function readExistingSpawnIds(): Set<string> {
  const ids = new Set<string>();
  const jsonlPath = getSpawnCostJsonlPath();
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path under USERPROFILE
    const text = fs.readFileSync(jsonlPath, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const id = extractSpawnId(line);
      if (id) ids.add(id);
    }
  } catch {
    // File absent or unreadable — empty set is correct for a first drain.
  }
  return ids;
}

function isValidPayload(p: unknown): p is HookSpawnCostPayload {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.sessionId === 'string' &&
    typeof obj.mcpConfigBytes === 'number' &&
    typeof obj.serverCount === 'number' &&
    typeof obj.tokenEstimate === 'number' &&
    Array.isArray(obj.serversIncluded)
  );
}

// ---------------------------------------------------------------------------
// Record conversion
// ---------------------------------------------------------------------------

function toMcpRecord(record: QueueRecord, payload: HookSpawnCostPayload): McpSpawnCostRecord {
  return {
    ts: record.ts,
    spawnId: payload.sessionId,
    // Hook-side values for IDE-unknown fields default to safe sentinels.
    routingDecision: (payload.routingDecision as McpSpawnCostRecord['routingDecision']) ?? 'omit',
    internalMcpScope:
      (payload.internalMcpScope as McpSpawnCostRecord['internalMcpScope']) ?? 'never',
    codemodeEnabled: payload.codemodeEnabled,
    mcpConfigBytes: payload.mcpConfigBytes,
    serverCount: payload.serverCount,
    tokenEstimate: payload.tokenEstimate,
    serversIncluded: payload.serversIncluded,
  };
}

// ---------------------------------------------------------------------------
// Handler factory — exported for direct testing without mocking the drain API
// ---------------------------------------------------------------------------

/**
 * Create a standalone handler function with its own dedup set. Tests call
 * this directly with a pre-seeded `existingIds` to verify dedup / emit logic
 * without needing to spy on `registerSurfaceHandler`.
 */
export function createSpawnCostHandler(existingIds: Set<string>) {
  return function handleSpawnCostRecord(record: QueueRecord): void {
    const payload = record.payload;
    if (!isValidPayload(payload)) {
      log.warn('[spawn-cost-drain] invalid payload shape — skipping', record.recordId);
      return;
    }
    if (existingIds.has(payload.sessionId)) {
      log.info(
        '[spawn-cost-drain] dedup: sessionId already in JSONL — skipping',
        payload.sessionId,
      );
      return;
    }
    const mcpRecord = toMcpRecord(record, payload);
    emitMcpSpawnCost(mcpRecord);
    // Track in-memory so duplicate records within the same drain batch are also skipped.
    existingIds.add(payload.sessionId);
    log.info('[spawn-cost-drain] emitted record for session', payload.sessionId);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the spawn-cost drain handler. Call once at IDE boot before
 * `runParityQueueDrain()` fires, so the handler is in place when the drain
 * dispatches records from the 'spawn-cost' surface.
 */
export function registerSpawnCostHandler(): void {
  const existingIds = readExistingSpawnIds();
  log.info('[spawn-cost-drain] loaded', existingIds.size, 'existing spawnIds for dedup');
  registerSurfaceHandler(SPAWN_COST_SURFACE, createSpawnCostHandler(existingIds), [
    SPAWN_COST_SCHEMA_VERSION,
  ]);
}
