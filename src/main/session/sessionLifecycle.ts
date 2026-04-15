import { randomUUID } from 'node:crypto';

import type { HookEventType, HookPayload } from '../hooks';
import { getTelemetryStore } from '../telemetry';
import type { Session } from './session';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// session.created / session.activated / session.archived are internal IDE
// lifecycle events not present in the wire-format HookEventType union.
// We cast through unknown so the telemetry store accepts them.
type LifecycleEventType =
  | 'session.created'
  | 'session.activated'
  | 'session.archived';

function emitLifecycleEvent(
  session: Session,
  eventType: LifecycleEventType,
): void {
  const store = getTelemetryStore();
  if (!store) return;
  const payload: HookPayload = {
    type: eventType as unknown as HookEventType,
    sessionId: session.id,
    correlationId: randomUUID(),
    timestamp: Date.now(),
    data: {
      projectRoot: session.projectRoot,
      worktree: session.worktree,
      worktreePath: session.worktreePath,
    },
  };
  store.record(payload);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function emitSessionCreated(session: Session): void {
  emitLifecycleEvent(session, 'session.created');
}

export function emitSessionActivated(session: Session): void {
  emitLifecycleEvent(session, 'session.activated');
}

export function emitSessionArchived(session: Session): void {
  emitLifecycleEvent(session, 'session.archived');
}
