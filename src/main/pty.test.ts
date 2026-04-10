/**
 * pty.test.ts — Unit tests for the pty.ts dispatch layer.
 *
 * Verifies that operations route to either the direct node-pty path or the
 * PtyHost proxy path based on the `usePtyHost` config flag. Mocks both paths
 * so we can assert which one was called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (hoisted so vi.mock factories can reference them) ──

const { configValues, proxyMocks, directPtyMocks } = vi.hoisted(() => {
  return {
    configValues: new Map<string, unknown>(),
    proxyMocks: {
      spawnViaPtyHost: vi.fn(async () => ({ success: true })),
      writeViaPtyHost: vi.fn(() => ({ success: true })),
      resizeViaPtyHost: vi.fn(() => ({ success: true })),
      killViaPtyHost: vi.fn(async () => ({ success: true })),
      getCwdViaPtyHost: vi.fn(async () => ({ success: true, cwd: '/proxy/cwd' })),
      listSessionsViaPtyHost: vi.fn(async () => [
        { id: 's1', cwd: '/x', windowId: 1 },
        { id: 's2', cwd: '/y', windowId: 1 },
      ]),
      getShellStateViaPtyHost: vi.fn(() => ({
        cwd: '/proxy', lastExitCode: 0, lastCommand: null, isExecuting: false,
      })),
      killAllViaPtyHost: vi.fn(async () => undefined),
      killForWindowViaPtyHost: vi.fn(async () => undefined),
      getProxySession: vi.fn(),
    },
    directPtyMocks: {
      spawn: vi.fn(() => ({
        pid: 1, write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
        onData: vi.fn(() => ({ dispose: vi.fn() })),
        onExit: vi.fn(() => ({ dispose: vi.fn() })),
        cols: 80, rows: 24,
      })),
    },
  };
});

vi.mock('./config', () => ({
  getConfigValue: vi.fn((key: string) => configValues.get(key)),
}));

vi.mock('./ptyHost/ptyHostProxy', () => proxyMocks);

vi.mock('./ptyHost/ptyHostProxyRecording', () => ({
  startRecordingViaPtyHost: vi.fn(() => ({ success: true })),
  stopRecordingViaPtyHost: vi.fn(async () => ({ success: true })),
}));

vi.mock('node-pty', () => directPtyMocks);

vi.mock('./ptyEnv', () => ({
  buildShellEnvWithIntegration: vi.fn(() => ({ env: { TERM: 'xterm-256color' }, shellArgs: null })),
  getDefaultArgs: vi.fn(() => []),
  getDefaultShell: vi.fn(() => '/bin/bash'),
  resolveSpawnOptions: vi.fn(() => ({ cwd: '/tmp', cols: 80, rows: 24 })),
}));

vi.mock('./ptyOutputBuffer', () => ({
  terminalOutputBuffer: {
    append: vi.fn(), removeSession: vi.fn(),
    getRecentLines: vi.fn(() => []),
    getAllRecentLines: vi.fn(() => []),
    clear: vi.fn(),
  },
}));

vi.mock('./ptyElectronBatcher', () => ({
  electronBatcher: {
    register: vi.fn(), append: vi.fn(), cleanup: vi.fn(), dispose: vi.fn(),
  },
}));

vi.mock('./web/ptyBatcher', () => ({
  ptyBatcher: {
    append: vi.fn(), removeSession: vi.fn(), dispose: vi.fn(),
  },
}));

vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

vi.mock('./ptyShellIntegration', () => ({
  initShellState: vi.fn(),
  processAndUpdateState: vi.fn((_id: string, data: string) => data),
  removeShellState: vi.fn(),
  getShellState: vi.fn(() => ({
    cwd: '/direct', lastExitCode: 0, lastCommand: null, isExecuting: false,
  })),
}));

vi.mock('./ptyShellReady', () => ({
  writeOnShellReady: vi.fn(),
}));

vi.mock('./extensions', () => ({
  dispatchActivationEvent: vi.fn(async () => undefined),
}));

vi.mock('./ptyRecording', () => ({
  startPtyRecording: vi.fn(() => ({ success: true })),
  stopPtyRecording: vi.fn(async () => ({ success: true })),
}));

vi.mock('./ptySpawn', () => ({
  spawnClaudePty: vi.fn(),
  spawnCodexPty: vi.fn(),
}));

vi.mock('./ptyAgent', () => ({
  spawnAgentPty: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class { id = 1; isDestroyed = (): boolean => false },
}));

// ── Imports (after mocks) ──

import {
  getActiveSessions, getPtyCwd, getShellState, killAllPtySessions, killPty,
  killPtySessionsForWindow, resizePty, spawnPty, startPtyRecording, stopPtyRecording, writeToPty,
} from './pty';
import { startRecordingViaPtyHost, stopRecordingViaPtyHost } from './ptyHost/ptyHostProxyRecording';

// ── Helpers ──

function setFlag(value: boolean): void {
  configValues.set('usePtyHost', value);
}

function makeWin(): { id: number; isDestroyed: () => boolean } {
  return { id: 1, isDestroyed: (): boolean => false };
}

beforeEach(() => {
  configValues.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──

describe('pty.ts dispatch layer', () => {
  describe('with usePtyHost: false (direct path)', () => {
    beforeEach(() => setFlag(false));

    it('spawnPty calls node-pty directly', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = spawnPty('direct-spawn-1', makeWin() as any) as { success: boolean };
      expect(result.success).toBe(true);
      expect(directPtyMocks.spawn).toHaveBeenCalled();
      expect(proxyMocks.spawnViaPtyHost).not.toHaveBeenCalled();
    });

    it('writeToPty does not call proxy', () => {
      // First spawn so a session exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spawnPty('direct-write-1', makeWin() as any);
      writeToPty('direct-write-1', 'data');
      expect(proxyMocks.writeViaPtyHost).not.toHaveBeenCalled();
    });

    it('getShellState returns direct shell state', () => {
      const state = getShellState('s1');
      expect(state?.cwd).toBe('/direct');
      expect(proxyMocks.getShellStateViaPtyHost).not.toHaveBeenCalled();
    });
  });

  describe('with usePtyHost: true (proxy path)', () => {
    beforeEach(() => setFlag(true));

    it('spawnPty routes through proxy', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await spawnPty('proxy-spawn-1', makeWin() as any);
      expect(result.success).toBe(true);
      expect(proxyMocks.spawnViaPtyHost).toHaveBeenCalled();
      expect(directPtyMocks.spawn).not.toHaveBeenCalled();
    });

    it('writeToPty routes through proxy', () => {
      writeToPty('s1', 'echo hi');
      expect(proxyMocks.writeViaPtyHost).toHaveBeenCalledWith('s1', 'echo hi');
    });

    it('resizePty routes through proxy', () => {
      resizePty('s1', 100, 30);
      expect(proxyMocks.resizeViaPtyHost).toHaveBeenCalledWith('s1', 100, 30);
    });

    it('killPty routes through proxy', async () => {
      const result = await killPty('s1');
      expect(result.success).toBe(true);
      expect(proxyMocks.killViaPtyHost).toHaveBeenCalledWith('s1');
    });

    it('killAllPtySessions routes through proxy', async () => {
      await killAllPtySessions();
      expect(proxyMocks.killAllViaPtyHost).toHaveBeenCalled();
    });

    it('killPtySessionsForWindow routes through proxy', async () => {
      await killPtySessionsForWindow(42);
      expect(proxyMocks.killForWindowViaPtyHost).toHaveBeenCalledWith(42);
    });

    it('getActiveSessions routes through proxy and maps to direct shape', async () => {
      const sessions = await getActiveSessions();
      expect(proxyMocks.listSessionsViaPtyHost).toHaveBeenCalled();
      expect(sessions).toEqual([
        { id: 's1', cwd: '/x' },
        { id: 's2', cwd: '/y' },
      ]);
    });

    it('getPtyCwd routes through proxy', async () => {
      const result = await getPtyCwd('s1');
      expect(proxyMocks.getCwdViaPtyHost).toHaveBeenCalledWith('s1');
      expect(result.cwd).toBe('/proxy/cwd');
    });

    it('getShellState returns proxy shell state', () => {
      const state = getShellState('s1');
      expect(state?.cwd).toBe('/proxy');
      expect(proxyMocks.getShellStateViaPtyHost).toHaveBeenCalled();
    });

    it('startPtyRecording errors when proxy session is missing', () => {
      proxyMocks.getProxySession.mockReturnValueOnce(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = startPtyRecording('nope', makeWin() as any);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(startRecordingViaPtyHost).not.toHaveBeenCalled();
    });

    it('startPtyRecording routes through proxy when session exists', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      proxyMocks.getProxySession.mockReturnValueOnce({ win: makeWin() as any, cols: 80, rows: 24 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startPtyRecording('s1', makeWin() as any);
      expect(startRecordingViaPtyHost).toHaveBeenCalled();
    });

    it('stopPtyRecording routes through proxy', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await stopPtyRecording('s1', makeWin() as any);
      expect(stopRecordingViaPtyHost).toHaveBeenCalled();
    });
  });
});
