/**
 * providerHandlers.test.ts — smoke tests for the provider IPC registrar.
 *
 * Verifies that registerProviderHandlers binds the expected channels.
 * This is a mechanical extraction from ipc.ts — no logic change, just
 * confirming the channel names are still registered after the move.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../auth/secureKeyStore', () => ({
  hasSecureKey: vi.fn().mockResolvedValue(false),
}));

vi.mock('../codex', () => ({
  listCodexModels: vi.fn().mockReturnValue([]),
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn().mockReturnValue({}),
}));

vi.mock('../providers', () => ({
  getAllProviders: vi.fn().mockReturnValue([]),
}));

vi.mock('../providers/claudeSessionProvider', () => ({
  ClaudeSessionProvider: vi.fn().mockImplementation(() => ({
    checkAvailability: vi.fn().mockResolvedValue({ available: false }),
  })),
}));

vi.mock('../providers/codexSessionProvider', () => ({
  CodexSessionProvider: vi.fn().mockImplementation(() => ({
    checkAvailability: vi.fn().mockResolvedValue({ available: false }),
  })),
}));

vi.mock('../providers/geminiSessionProvider', () => ({
  GeminiSessionProvider: vi.fn().mockImplementation(() => ({
    checkAvailability: vi.fn().mockResolvedValue({ available: false }),
  })),
}));

vi.mock('../ptyCodexCapture', () => ({
  resolveCodexThreadId: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
      removeHandler: (ch: string) => handlers.delete(ch),
      _handlers: handlers,
    },
  };
});

import { registerProviderHandlers } from './providerHandlers';

const EXPECTED_CHANNELS = [
  'providers:list',
  'providers:getSlots',
  'providers:checkAllAvailability',
  'codex:listModels',
  'codex:resolveThreadId',
];

describe('registerProviderHandlers', () => {
  let channels: string[];

  beforeEach(() => {
    channels = [];
    registerProviderHandlers(channels);
  });

  afterEach(() => {
    // no cleanup needed — ipcMain mock is in-memory
  });

  it('pushes all expected channel names into the channels array', () => {
    for (const ch of EXPECTED_CHANNELS) {
      expect(channels).toContain(ch);
    }
  });

  it('registers exactly the expected number of channels', () => {
    expect(channels.length).toBe(EXPECTED_CHANNELS.length);
  });
});
