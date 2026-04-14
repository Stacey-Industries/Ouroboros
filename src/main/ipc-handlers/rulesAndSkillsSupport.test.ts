/**
 * rulesAndSkillsSupport.test.ts — Smoke tests for registerClaudeSettingsHandlers.
 *
 * Verifies that the three claudeSettings channels are registered and that
 * each handler delegates to the correct settingsManager function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../rulesAndSkills/settingsManager', () => ({
  readClaudeSettings: vi.fn().mockResolvedValue({ theme: 'dark' }),
  readClaudeSettingsKey: vi.fn().mockResolvedValue('dark'),
  writeClaudeSettingsKey: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => Promise<unknown>;

async function loadModule() {
  const mod = await import('./rulesAndSkillsSupport');
  const { ipcMain } = await import('electron');
  return { mod, ipcMain };
}

function captureHandlers(): Record<string, HandlerFn> {
  const map: Record<string, HandlerFn> = {};
  return map;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerClaudeSettingsHandlers', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('registers all three claudeSettings channels', async () => {
    const { mod, ipcMain } = await loadModule();
    const channels: string[] = [];
    mod.registerClaudeSettingsHandlers(channels);

    expect(channels).toContain('claudeSettings:read');
    expect(channels).toContain('claudeSettings:readKey');
    expect(channels).toContain('claudeSettings:writeKey');
    expect((ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0])).toEqual(
      expect.arrayContaining(['claudeSettings:read', 'claudeSettings:readKey', 'claudeSettings:writeKey']),
    );
  });

  it('claudeSettings:read calls readClaudeSettings and returns settings', async () => {
    const { mod, ipcMain } = await loadModule();
    const handlers = captureHandlers();
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      // eslint-disable-next-line security/detect-object-injection -- ch is an IPC channel name from test fixtures
      (ch: string, fn: HandlerFn) => { handlers[ch] = fn; },
    );
    mod.registerClaudeSettingsHandlers([]);

    const result = await handlers['claudeSettings:read']?.({}, 'global');
    expect(result).toEqual({ success: true, settings: { theme: 'dark' } });
  });

  it('claudeSettings:readKey calls readClaudeSettingsKey and returns value', async () => {
    const { mod, ipcMain } = await loadModule();
    const handlers = captureHandlers();
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      // eslint-disable-next-line security/detect-object-injection -- ch is an IPC channel name from test fixtures
      (ch: string, fn: HandlerFn) => { handlers[ch] = fn; },
    );
    mod.registerClaudeSettingsHandlers([]);

    const result = await handlers['claudeSettings:readKey']?.({}, 'global', 'theme');
    expect(result).toEqual({ success: true, value: 'dark' });
  });

  it('claudeSettings:writeKey calls writeClaudeSettingsKey and returns success', async () => {
    const { mod, ipcMain } = await loadModule();
    const handlers = captureHandlers();
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      // eslint-disable-next-line security/detect-object-injection -- ch is an IPC channel name from test fixtures
      (ch: string, fn: HandlerFn) => { handlers[ch] = fn; },
    );
    mod.registerClaudeSettingsHandlers([]);

    const result = await handlers['claudeSettings:writeKey']?.({}, { scope: 'global', key: 'theme', value: 'light' });
    expect(result).toEqual({ success: true });
  });

  it('returns { success: false, error } when readClaudeSettings throws', async () => {
    const { mod, ipcMain } = await loadModule();
    const { readClaudeSettings } = await import('../rulesAndSkills/settingsManager');
    (readClaudeSettings as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk error'));

    const handlers = captureHandlers();
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
      // eslint-disable-next-line security/detect-object-injection -- ch is an IPC channel name from test fixtures
      (ch: string, fn: HandlerFn) => { handlers[ch] = fn; },
    );
    mod.registerClaudeSettingsHandlers([]);

    const result = await handlers['claudeSettings:read']?.({}, 'global');
    expect(result).toEqual({ success: false, error: 'disk error' });
  });
});
