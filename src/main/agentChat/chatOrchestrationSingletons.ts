/**
 * chatOrchestrationSingletons.ts — Shared module-level singletons for the new
 * chat orchestration state path (Wave 86).
 *
 * Previously declared inline in chatStateNewPath.ts. Extracted here so both
 * chatStateNewPath.ts (IPC handler) and the DualEmitOrchestrator startup wiring
 * can share the SAME instances — preventing two divergent registries.
 *
 * Decision 10: feature-flag removed (Wave 86); singletons are always active.
 * Decision 5: SQLite is authoritative; persistence failures must NOT kill
 *             in-flight runtime state — every persistence call is wrapped.
 *
 * Wave 87 Phase 1: threadStore is lazy-initialized at the singleton level, so
 * a static import is safe everywhere (no module-eval-time Electron access).
 */

import path from 'node:path';

import { openDatabase } from '../storage/database';
import { ChatPersistenceLayer } from './chatPersistenceLayer';
import { ChatStateBroadcaster } from './chatStateBroadcaster';
import { EventNormalizer } from './eventNormalizer';
import { IdentityRegistry } from './identityRegistry';
import { getDefaultAgentChatThreadStoreDir } from './threadStore';

// ─── Singletons ───────────────────────────────────────────────────────────────

export const registry = new IdentityRegistry();
export const normalizer = new EventNormalizer(registry);
export const broadcaster = new ChatStateBroadcaster();

/** Lazily opened on first use. Accepts an optional override for the db path
 *  so tests can inject without touching app.getPath('userData'). */
let _persistence: ChatPersistenceLayer | null = null;
let _dbPathOverride: string | null = null;

function resolveDbPath(): string {
  if (_dbPathOverride) return _dbPathOverride;
  return path.join(getDefaultAgentChatThreadStoreDir(), 'threads.db');
}

export function getPersistence(): ChatPersistenceLayer {
  if (!_persistence) {
    const db = openDatabase(resolveDbPath());
    _persistence = new ChatPersistenceLayer(db);
  }
  return _persistence;
}

/** Test helpers — reset state between test cases. */
export function clearPersistenceForTest(): void {
  _persistence = null;
}

export function setDbPathForTest(dbPath: string): void {
  _dbPathOverride = dbPath;
  _persistence = null;
}

export function clearDbPathOverrideForTest(): void {
  _dbPathOverride = null;
  _persistence = null;
}
