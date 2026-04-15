import type { AppConfig, WindowSession } from '../config';
import log from '../logger';
import { DEFAULT_AGENT_MONITOR_SETTINGS, makeSession, type Session } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

type GetConfig = <K extends keyof AppConfig>(key: K) => AppConfig[K];
type SetConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

export interface MigrationResult {
  migrated: number;
}

export interface AgentMonitorMigrationResult {
  patched: number;
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

// ─── Wave 20 Phase C — add agentMonitorSettings to existing sessions ──────────

export function migrateAgentMonitorSettings(
  getConfig: GetConfig,
  setConfig: SetConfig,
): AgentMonitorMigrationResult {
  const existing = (getConfig('sessionsData') as Session[] | undefined) ?? [];
  if (!Array.isArray(existing) || existing.length === 0) {
    return { patched: 0 };
  }
  let patched = 0;
  const updated = existing.map((session) => {
    if (session.agentMonitorSettings !== undefined) return session;
    patched += 1;
    return { ...session, agentMonitorSettings: { ...DEFAULT_AGENT_MONITOR_SETTINGS } };
  });
  if (patched > 0) {
    setConfig('sessionsData', updated as never);
    log.info(`[sessionMigration] patched agentMonitorSettings on ${patched} session(s)`);
  }
  return { patched };
}
