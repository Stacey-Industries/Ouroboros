/**
 * routerShadowDrainHandler.ts — Wave 53a Phase C
 *
 * Drain handler for the 'router-shadow' telemetry parity surface. Reads queue
 * records produced by user_prompt_submit_router_shadow.mjs and dispatches
 * them post-hoc via shadowRouteHookEvent so router-decisions.jsonl gains an
 * entry tagged with `postHoc: true` and `weightsVersion: <SHA>`.
 *
 * Dedup: live record beats drain record
 * ──────────────────────────────────────
 * At init we read the existing router-decisions.jsonl once and build a
 * Set<sessionId> of session-time entries (records with no postHoc field, or
 * postHoc !== true). When a drain record's sessionId is in that set, we skip
 * it — the live record already captured the decision with richer context.
 *
 * weightsVersion source
 * ─────────────────────
 * SHA-256 of the classifier weights file content, truncated to 12 hex chars.
 * Probe order at init:
 *   1. {userData}/router-weights-retrained.json (preferred — what classifier
 *      actually loaded if retrain has run)
 *   2. {appPath}/src/main/router/model/router-weights.json (bundled fallback)
 * If neither is readable, weightsVersion is the literal string 'unknown'.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import log from '../logger';
import { registerSurfaceHandler } from '../telemetry/telemetryDrain';
import type { QueueRecord } from '../telemetry/telemetryQueue';
import { shadowRouteHookEvent } from './routerShadow';
import {
  ROUTER_SHADOW_SCHEMA_VERSION,
  ROUTER_SHADOW_SURFACE,
  type RouterShadowRecord,
} from './routerShadowSchema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHTS_HASH_CHARS = 12;
const ROUTER_DECISIONS_FILE = 'router-decisions.jsonl';
const RETRAINED_WEIGHTS_FILE = 'router-weights-retrained.json';
const BUNDLED_WEIGHTS_RELATIVE = 'src/main/router/model/router-weights.json';

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function isValidPayload(p: unknown): p is RouterShadowRecord {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.sessionId === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.cwd === 'string' &&
    typeof obj.ts === 'number'
  );
}

// ---------------------------------------------------------------------------
// weightsVersion resolution
// ---------------------------------------------------------------------------

function safeReadFile(filePath: string): Buffer | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted: derived from app.getPath('userData') / app.getAppPath()
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/** Resolve the path of the classifier weights file currently in effect. */
function resolveWeightsPath(): string | null {
  try {
    const userData = app.getPath('userData');
    const retrained = path.join(userData, RETRAINED_WEIGHTS_FILE);
    if (safeReadFile(retrained) !== null) return retrained;
  } catch {
    // app may not be ready in tests — fall through to bundled
  }
  try {
    const appPath = app.getAppPath();
    const bundled = path.join(appPath, BUNDLED_WEIGHTS_RELATIVE);
    if (safeReadFile(bundled) !== null) return bundled;
  } catch {
    // app may not be ready — caller will get 'unknown'
  }
  return null;
}

/**
 * Compute the weightsVersion fingerprint. Returns 'unknown' when no readable
 * weights file is found. Exported for tests.
 */
export function computeWeightsVersion(weightsPath: string | null): string {
  if (!weightsPath) return 'unknown';
  const buf = safeReadFile(weightsPath);
  if (!buf) return 'unknown';
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, WEIGHTS_HASH_CHARS);
}

// ---------------------------------------------------------------------------
// Live-record set (sessionIds with a session-time router-decisions entry)
// ---------------------------------------------------------------------------

interface LiveEntry {
  sessionId?: unknown;
  postHoc?: unknown;
}

function readLiveSessionIds(decisionsPath: string): Set<string> {
  const set = new Set<string>();
  const buf = safeReadFile(decisionsPath);
  if (!buf) return set;
  const text = buf.toString('utf8');
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    try {
      const obj = JSON.parse(line) as LiveEntry;
      if (obj.postHoc === true) continue;
      if (typeof obj.sessionId === 'string' && obj.sessionId.length > 0) {
        set.add(obj.sessionId);
      }
    } catch {
      // Malformed line — skip; never throw out of init.
    }
  }
  return set;
}

function resolveDecisionsPath(): string | null {
  try {
    return path.join(app.getPath('userData'), ROUTER_DECISIONS_FILE);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler factory — exported for direct testing
// ---------------------------------------------------------------------------

export interface RouterShadowHandlerDeps {
  /** Pre-seeded set of sessionIds that already have a live record. */
  liveSessionIds: Set<string>;
  /** Pre-computed weightsVersion (12-char SHA prefix or 'unknown'). */
  weightsVersion: string;
  /**
   * Override of shadowRouteHookEvent for testing. Production code should pass
   * undefined, which uses the real export.
   */
  dispatch?: typeof shadowRouteHookEvent;
}

function validateRecord(record: QueueRecord): RouterShadowRecord | null {
  if (record.schemaVersion !== ROUTER_SHADOW_SCHEMA_VERSION) {
    log.warn(
      '[router-shadow-drain] unsupported schemaVersion',
      record.schemaVersion,
      record.recordId,
    );
    return null;
  }
  if (!isValidPayload(record.payload)) {
    log.warn('[router-shadow-drain] invalid payload shape — skipping', record.recordId);
    return null;
  }
  return record.payload;
}

/**
 * Create a standalone handler with explicit dependencies. Tests call this
 * directly without going through registerSurfaceHandler.
 */
export function createRouterShadowHandler(deps: RouterShadowHandlerDeps) {
  const dispatch = deps.dispatch ?? shadowRouteHookEvent;
  const { liveSessionIds, weightsVersion } = deps;

  return function handleRouterShadowRecord(record: QueueRecord): void {
    const payload = validateRecord(record);
    if (!payload) return;

    if (liveSessionIds.has(payload.sessionId)) {
      log.info('[router-shadow-drain] dedup: live record exists, skipping', payload.sessionId);
      return;
    }

    dispatch({
      type: 'user_prompt_submit',
      sessionId: payload.sessionId,
      prompt: payload.prompt,
      cwd: payload.cwd,
      postHoc: true,
      weightsVersion,
    });

    // Add to set so subsequent drain records for the same session also skip.
    liveSessionIds.add(payload.sessionId);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the router-shadow drain handler. Call once at IDE boot before
 * runParityQueueDrain() fires. Reads the existing router-decisions.jsonl once
 * to seed the live-record dedup set, and computes the weightsVersion SHA once.
 */
export function registerRouterShadowHandler(): void {
  const decisionsPath = resolveDecisionsPath();
  const liveSessionIds = decisionsPath ? readLiveSessionIds(decisionsPath) : new Set<string>();
  const weightsVersion = computeWeightsVersion(resolveWeightsPath());
  log.info('[router-shadow-drain] handler registered', {
    liveSessions: liveSessionIds.size,
    weightsVersion,
  });
  registerSurfaceHandler(
    ROUTER_SHADOW_SURFACE,
    createRouterShadowHandler({ liveSessionIds, weightsVersion }),
    [ROUTER_SHADOW_SCHEMA_VERSION],
  );
}
