/**
 * sessionMigration.test.ts — Unit tests for session migration helpers.
 *
 * Note: migrateWindowSessionsToSessions was removed in Wave 79 (windowSessions
 * config key deleted after two-release deprecation window). Tests for that
 * function are no longer relevant.
 */

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../config';
import { migrateAgentMonitorSettings } from './sessionMigration';

// ─── Fake config store ────────────────────────────────────────────────────────

function makeConfigStore(initial: Partial<AppConfig> = {}) {
  const data: Partial<AppConfig> = { ...initial };

  function getConfig<K extends keyof AppConfig>(key: K): AppConfig[K] {
    // eslint-disable-next-line security/detect-object-injection
    return data[key] as AppConfig[K];
  }

  function setConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    // eslint-disable-next-line security/detect-object-injection
    data[key] = value;
  }

  function snapshot(): Partial<AppConfig> {
    return { ...data };
  }

  return { getConfig, setConfig, snapshot };
}

// ─── migrateAgentMonitorSettings ──────────────────────────────────────────────

describe('migrateAgentMonitorSettings — no-op cases', () => {
  it('returns patched:0 when sessionsData is undefined', () => {
    const cfg = makeConfigStore({});
    const result = migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    expect(result.patched).toBe(0);
  });

  it('returns patched:0 when sessionsData is empty', () => {
    const cfg = makeConfigStore({ sessionsData: [] as never });
    const result = migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    expect(result.patched).toBe(0);
  });

  it('does not re-patch sessions that already have agentMonitorSettings', () => {
    const existing = [
      { id: 's1', agentMonitorSettings: { viewMode: 'verbose', inlineEventTypes: [] } },
    ] as never;
    const cfg = makeConfigStore({ sessionsData: existing });
    const result = migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    expect(result.patched).toBe(0);
  });
});

describe('migrateAgentMonitorSettings — patching', () => {
  it('adds default agentMonitorSettings to sessions missing it', () => {
    const cfg = makeConfigStore({
      sessionsData: [{ id: 's1' }, { id: 's2' }] as never,
    });
    const result = migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    expect(result.patched).toBe(2);
    const sessions = cfg.snapshot().sessionsData as Array<{
      agentMonitorSettings: { viewMode: string; inlineEventTypes: string[] };
    }>;
    expect(sessions[0].agentMonitorSettings.viewMode).toBe('normal');
    expect(sessions[0].agentMonitorSettings.inlineEventTypes).toEqual([]);
    expect(sessions[1].agentMonitorSettings.viewMode).toBe('normal');
  });

  it('only patches sessions missing the field, preserving others', () => {
    const cfg = makeConfigStore({
      sessionsData: [
        {
          id: 's1',
          agentMonitorSettings: { viewMode: 'verbose', inlineEventTypes: ['pre_tool_use'] },
        },
        { id: 's2' },
      ] as never,
    });
    const result = migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    expect(result.patched).toBe(1);
    const sessions = cfg.snapshot().sessionsData as Array<{
      id: string;
      agentMonitorSettings: { viewMode: string };
    }>;
    expect(sessions[0].agentMonitorSettings.viewMode).toBe('verbose');
    expect(sessions[1].agentMonitorSettings.viewMode).toBe('normal');
  });

  it('does not write to store when nothing needs patching', () => {
    type SessionLike = {
      id: string;
      agentMonitorSettings: { viewMode: string; inlineEventTypes: string[] };
    };
    const sessions: SessionLike[] = [
      { id: 's1', agentMonitorSettings: { viewMode: 'summary', inlineEventTypes: [] } },
    ];
    const cfg = makeConfigStore({ sessionsData: sessions as unknown as AppConfig['sessionsData'] });
    migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    const snap = cfg.snapshot().sessionsData as unknown as SessionLike[];
    expect(snap[0].agentMonitorSettings.viewMode).toBe('summary');
  });
});
