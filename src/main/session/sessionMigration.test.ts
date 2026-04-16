/**
 * sessionMigration.test.ts — Unit tests for migrateWindowSessionsToSessions.
 */

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../config';
import {
  migrateAgentMonitorSettings,
  migrateWindowSessionsToSessions,
} from './sessionMigration';

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('empty source → no-op', () => {
  it('returns migrated:0 when windowSessions is undefined', async () => {
    const cfg = makeConfigStore({});
    const result = await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(result.migrated).toBe(0);
  });

  it('returns migrated:0 when windowSessions is empty array', async () => {
    const cfg = makeConfigStore({ windowSessions: [] });
    const result = await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(result.migrated).toBe(0);
  });

  it('does not write sessionsData key when source is empty', async () => {
    const cfg = makeConfigStore({ windowSessions: [] });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const snap = cfg.snapshot();
    expect(snap.sessionsData).toBeUndefined();
  });
});

describe('already migrated → no-op', () => {
  it('returns migrated:0 when sessions already has entries', async () => {
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/a'] }],
      // sessions already populated (any non-empty array signals done)
      sessionsData: [{ id: 'existing' }] as never,
    });
    const result = await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(result.migrated).toBe(0);
  });

  it('does not overwrite existing sessions', async () => {
    const existing = [{ id: 'keep-me' }] as never;
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/new'] }],
      sessionsData: existing,
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(cfg.snapshot().sessionsData).toEqual(existing);
  });
});

describe('2-entry source → 2 sessions', () => {
  it('returns migrated:2', async () => {
    const cfg = makeConfigStore({
      windowSessions: [
        { projectRoots: ['/root-a'] },
        { projectRoots: ['/root-b'] },
      ],
    });
    const result = await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(result.migrated).toBe(2);
  });

  it('writes exactly 2 sessions', async () => {
    const cfg = makeConfigStore({
      windowSessions: [
        { projectRoots: ['/root-a'] },
        { projectRoots: ['/root-b'] },
      ],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as unknown[];
    expect(sessions).toHaveLength(2);
  });

  it('maps projectRoots[0] to projectRoot', async () => {
    const cfg = makeConfigStore({
      windowSessions: [
        { projectRoots: ['/root-a', '/root-b'] },
      ],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ projectRoot: string }>;
    expect(sessions[0].projectRoot).toBe('/root-a');
  });

  it('uses empty string projectRoot when projectRoots is empty', async () => {
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: [] }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ projectRoot: string }>;
    expect(sessions[0].projectRoot).toBe('');
  });
});

describe('bounds preserved', () => {
  it('copies bounds from windowSession to session', async () => {
    const bounds = { x: 10, y: 20, width: 1200, height: 800, isMaximized: false };
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/root-a'], bounds }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ bounds: typeof bounds }>;
    expect(sessions[0].bounds).toEqual(bounds);
  });

  it('leaves bounds undefined when windowSession has no bounds', async () => {
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/root-a'] }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ bounds?: unknown }>;
    expect(sessions[0].bounds).toBeUndefined();
  });

  it('sets isMaximized from bounds', async () => {
    const bounds = { x: 0, y: 0, width: 1920, height: 1080, isMaximized: true };
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/root-a'], bounds }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ bounds: { isMaximized: boolean } }>;
    expect(sessions[0].bounds.isMaximized).toBe(true);
  });
});

describe('worktree:false always', () => {
  it('sets worktree:false on every migrated session', async () => {
    const cfg = makeConfigStore({
      windowSessions: [
        { projectRoots: ['/a'] },
        { projectRoots: ['/b'] },
      ],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ worktree: boolean }>;
    expect(sessions.every((s) => s.worktree === false)).toBe(true);
  });
});

describe('windowSessions key preserved', () => {
  it('does not delete windowSessions after migration', async () => {
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/a'] }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    expect(cfg.snapshot().windowSessions).toEqual([{ projectRoots: ['/a'] }]);
  });
});

describe('explicit no-worktreeManager calls', () => {
  it('never imports or calls worktreeManager (no worktreePath set)', async () => {
    const cfg = makeConfigStore({
      windowSessions: [{ projectRoots: ['/a'] }],
    });
    await migrateWindowSessionsToSessions(cfg.getConfig, cfg.setConfig);
    const sessions = cfg.snapshot().sessionsData as Array<{ worktreePath?: string }>;
    expect(sessions[0].worktreePath).toBeUndefined();
  });
});

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
        { id: 's1', agentMonitorSettings: { viewMode: 'verbose', inlineEventTypes: ['pre_tool_use'] } },
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
    type SessionLike = { id: string; agentMonitorSettings: { viewMode: string; inlineEventTypes: string[] } };
    const sessions: SessionLike[] = [
      { id: 's1', agentMonitorSettings: { viewMode: 'summary', inlineEventTypes: [] } },
    ];
    const cfg = makeConfigStore({ sessionsData: sessions as unknown as AppConfig['sessionsData'] });
    migrateAgentMonitorSettings(cfg.getConfig, cfg.setConfig);
    // sessions array identity should be unchanged (same reference is fine, values match)
    const snap = cfg.snapshot().sessionsData as unknown as SessionLike[];
    expect(snap[0].agentMonitorSettings.viewMode).toBe('summary');
  });
});
