import type { AppConfig } from '../config';
import log from '../logger';
import { DEFAULT_AGENT_MONITOR_SETTINGS, type Session } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

type GetConfig = <K extends keyof AppConfig>(key: K) => AppConfig[K];
type SetConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

export interface AgentMonitorMigrationResult {
  patched: number;
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
