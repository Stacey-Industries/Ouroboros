import type { AppConfig, WindowSession } from '../config';
import log from '../logger';
import { makeSession, type Session } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

type GetConfig = <K extends keyof AppConfig>(key: K) => AppConfig[K];
type SetConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

export interface MigrationResult {
  migrated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSessionFromWindowSession(ws: WindowSession): Session {
  const projectRoot = ws.projectRoots[0] ?? '';
  const session = makeSession(projectRoot);
  if (ws.bounds) {
    session.bounds = {
      x: ws.bounds.x ?? 0,
      y: ws.bounds.y ?? 0,
      width: ws.bounds.width,
      height: ws.bounds.height,
      isMaximized: ws.bounds.isMaximized,
    };
  }
  return session;
}

// ─── Migration ────────────────────────────────────────────────────────────────

export async function migrateWindowSessionsToSessions(
  getConfig: GetConfig,
  setConfig: SetConfig,
): Promise<MigrationResult> {
  const existing = (getConfig('sessionsData') as Session[] | undefined) ?? [];
  if (existing.length > 0) {
    log.info('[sessionMigration] already migrated — skipping');
    return { migrated: 0 };
  }

  const windowSessions = (getConfig('windowSessions') as WindowSession[] | undefined) ?? [];
  if (!Array.isArray(windowSessions) || windowSessions.length === 0) {
    log.info('[sessionMigration] no windowSessions to migrate');
    return { migrated: 0 };
  }

  const sessions = windowSessions.map(buildSessionFromWindowSession);
  setConfig('sessionsData', sessions as never);
  log.info(`[sessionMigration] migrated ${sessions.length} window session(s)`);
  // NOTE: windowSessions key is intentionally preserved as a deprecated fallback
  // for two releases per Wave 16 migration plan §4.
  return { migrated: sessions.length };
}
