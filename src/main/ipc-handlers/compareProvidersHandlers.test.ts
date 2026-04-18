/**
 * compareProvidersHandlers.test.ts — Wave 36 Phase F
 *
 * Tests for compareProviders:start and compareProviders:cancel IPC handlers.
 * Mocks the provider registry and electron so no real PTY sessions are spawned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock ─────────────────────────────────────────────────────────────

const mockHandle = vi.fn();
vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}));

// ─── Provider registry mock ────────────────────────────────────────────────────

const mockSpawnA = vi.fn();
const mockSpawnB = vi.fn();
const mockCancelA = vi.fn().mockResolvedValue(undefined);
const mockCancelB = vi.fn().mockResolvedValue(undefined);
const mockOnEventA = vi.fn().mockReturnValue(() => { /* cleanup */ });
const mockOnEventB = vi.fn().mockReturnValue(() => { /* cleanup */ });

const mockProviderA = {
  id: 'claude', label: 'Claude', binary: 'claude',
  checkAvailability: vi.fn(), spawn: mockSpawnA, send: vi.fn(),
  cancel: mockCancelA, onEvent: mockOnEventA,
};

const mockProviderB = {
  id: 'codex', label: 'Codex', binary: 'codex',
  checkAvailability: vi.fn(), spawn: mockSpawnB, send: vi.fn(),
  cancel: mockCancelB, onEvent: mockOnEventB,
};

vi.mock('../providers/providerRegistry', () => ({
  getSessionProvider: (id: string) => {
    if (id === 'claude') return mockProviderA;
    if (id === 'codex') return mockProviderB;
    return null;
  },
}));

vi.mock('../windowManager', () => ({
  getAllActiveWindows: () => [],
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Handle helpers ────────────────────────────────────────────────────────────

function makeHandle(providerId: string, idx: number) {
  return {
    id: `handle-${providerId}-${idx}`, providerId,
    ptySessionId: `pty-${idx}`, startedAt: Date.now(), status: 'ready' as const,
  };
}

/** Invoke a registered ipcMain handler by channel name */
async function invokeHandler(channel: string, args: unknown): Promise<unknown> {
  const call = mockHandle.mock.calls.find(([ch]) => ch === channel);
  if (!call) throw new Error(`No handler registered for: ${channel}`);
  const handler = call[1] as (_event: unknown, args: unknown) => Promise<unknown>;
  return handler(null, args);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('compareProvidersHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnA.mockResolvedValue(makeHandle('claude', 1));
    mockSpawnB.mockResolvedValue(makeHandle('codex', 2));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerCompareProvidersHandlers', () => {
    it('registers compareProviders:start and compareProviders:cancel channels', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      const channels = registerCompareProvidersHandlers();
      expect(channels).toContain('compareProviders:start');
      expect(channels).toContain('compareProviders:cancel');
    });

    it('registers exactly 2 channels', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      const channels = registerCompareProvidersHandlers();
      expect(channels).toHaveLength(2);
    });
  });

  describe('compareProviders:start', () => {
    it('spawns two providers and returns compareId + sessions', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:start', {
        prompt: 'hello', projectPath: '/proj', providerIds: ['claude', 'codex'],
      }) as { success: boolean; compareId: string; sessions: unknown[] };

      expect(result.success).toBe(true);
      expect(result.compareId).toBeTruthy();
      expect(result.sessions).toHaveLength(2);
      expect(mockSpawnA).toHaveBeenCalledTimes(1);
      expect(mockSpawnB).toHaveBeenCalledTimes(1);
    });

    it('returns failure when prompt is missing', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:start', {
        prompt: '', projectPath: '/proj', providerIds: ['claude', 'codex'],
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/prompt/i);
    });

    it('returns failure when providerIds length is wrong', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:start', {
        prompt: 'hi', projectPath: '/proj', providerIds: ['claude'],
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/providerIds/i);
    });

    it('returns failure for unknown provider id', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:start', {
        prompt: 'hi', projectPath: '/proj', providerIds: ['claude', 'unknown-provider'],
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
    });
  });

  describe('compareProviders:cancel', () => {
    it('returns failure when compareId is missing', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:cancel', {}) as { success: boolean; error: string };
      expect(result.success).toBe(false);
    });

    it('returns failure for unknown compareId', async () => {
      vi.resetModules();
      const { registerCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      registerCompareProvidersHandlers();

      const result = await invokeHandler('compareProviders:cancel', { compareId: 'nonexistent' }) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('cleanupCompareProvidersHandlers', () => {
    it('exports a cleanup function that does not throw', async () => {
      vi.resetModules();
      const { cleanupCompareProvidersHandlers } = await import('./compareProvidersHandlers');
      expect(cleanupCompareProvidersHandlers).toBeTypeOf('function');
      expect(() => cleanupCompareProvidersHandlers()).not.toThrow();
    });
  });
});
