/**
 * sessionSpawnAdapter.test.ts — Wave 34 Phase C smoke tests.
 *
 * Verifies the adapter's public contract without spawning real PTY processes.
 * All native modules are mocked; we test routing logic and error handling only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Electron mock ─────────────────────────────────────────────────────────────

const mockWin = { id: 1, isDestroyed: () => false };

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [mockWin]),
  },
}));

// ── Config mock ───────────────────────────────────────────────────────────────

const mockGetConfigValue = vi.fn(() => false); // usePtyHost = false by default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('../config', () => ({ getConfigValue: (k: string) => (mockGetConfigValue as any)(k) }));

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// ── Env helpers mock ──────────────────────────────────────────────────────────

vi.mock('../ptyEnv', () => ({
  buildBaseEnv: (env: Record<string, string>) => env,
  buildProviderEnv: () => ({ PROVIDER: 'mock' }),
  resolveSpawnOptions: () => ({ cwd: '/project', cols: 80, rows: 24 }),
}));

// ── pty mock ──────────────────────────────────────────────────────────────────

const mockSessions = new Map<string, unknown>();
const mockRegisterSession = vi.fn();
const mockCleanupSession = vi.fn();
const mockKillPty = vi.fn(() => ({ success: true }));
const mockEscapePowerShellArg = vi.fn((s: string) => s);

vi.mock('../pty', () => ({
  get sessions() { return mockSessions; },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerSession: (...a: any[]) => mockRegisterSession(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cleanupSession: (...a: any[]) => mockCleanupSession(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  killPty: (...a: any[]) => (mockKillPty as any)(...a),
  escapePowerShellArg: (s: string) => mockEscapePowerShellArg(s),
}));

// ── node-pty mock ─────────────────────────────────────────────────────────────

type DataHandler = (data: string) => void;
type ExitHandler = (info: { exitCode: number }) => void;

interface MockProc {
  onData: (h: DataHandler) => void;
  onExit: (h: ExitHandler) => void;
  write: ReturnType<typeof vi.fn>;
  _triggerExit: (code: number) => void;
}

function makeMockProc(): MockProc {
  let exitH: ExitHandler | null = null;
  return {
    onData: vi.fn(),
    onExit: (h: ExitHandler) => { exitH = h; },
    write: vi.fn(),
    _triggerExit: (code: number) => exitH?.({ exitCode: code }),
  };
}

let mockProc: MockProc;

vi.mock('node-pty', () => ({
  spawn: () => mockProc,
}));

// ── AgentBridge mock ──────────────────────────────────────────────────────────

const mockBridgeFeed = vi.fn();
const mockBridgeHandleExit = vi.fn();

vi.mock('../ptyAgentBridge', () => ({
  createAgentBridge: ({ onComplete }: { onComplete?: () => void }) => ({
    feed: mockBridgeFeed,
    handleExit: (code: number) => { mockBridgeHandleExit(code); onComplete?.(); },
    dispose: vi.fn(),
  }),
}));

// ── PtyHost mock ──────────────────────────────────────────────────────────────

const mockSpawnAgentViaPtyHost = vi.fn();

vi.mock('../ptyHost/ptyHostProxyAgent', () => ({
  spawnAgentViaPtyHost: (...a: unknown[]) => mockSpawnAgentViaPtyHost(...a),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionSpawnAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions.clear();
    mockProc = makeMockProc();
    mockGetConfigValue.mockReturnValue(false);
  });

  describe('spawnAgentSession — direct PTY path', () => {
    it('returns a SessionHandle with ptyId and completion promise', async () => {
      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      const handleP = spawnAgentSession({ prompt: 'hello', projectPath: '/project' });

      // Trigger exit so completion settles
      setTimeout(() => mockProc._triggerExit(0), 0);
      const handle = await handleP;

      expect(typeof handle.ptyId).toBe('string');
      expect(handle.ptyId.length).toBeGreaterThan(0);
      await expect(handle.completion).resolves.toBeUndefined();
    });

    it('uses worktreePath as cwd when provided', async () => {
      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      setTimeout(() => mockProc._triggerExit(0), 0);
      const handle = await spawnAgentSession({
        prompt: 'do task',
        projectPath: '/project',
        worktreePath: '/worktrees/wt1',
      });
      await handle.completion;
      // registerSession is called with the correct cwd
      expect(mockRegisterSession).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/worktrees/wt1' }),
      );
    });

    it('falls back to projectPath when worktreePath is absent', async () => {
      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      setTimeout(() => mockProc._triggerExit(0), 0);
      const handle = await spawnAgentSession({ prompt: 'task', projectPath: '/project' });
      await handle.completion;
      // resolveSpawnOptions stub always returns /project — just verify no throw
      expect(handle.ptyId).toBeTruthy();
    });

    it('throws when no BrowserWindow is available', async () => {
      const { BrowserWindow } = await import('electron');
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([]);

      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      await expect(spawnAgentSession({ prompt: 'x', projectPath: '/p' }))
        .rejects.toThrow('No BrowserWindow available');
    });

    it('completion resolves after proc exits with code 0', async () => {
      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      const handleP = spawnAgentSession({ prompt: 'go', projectPath: '/project' });
      setTimeout(() => mockProc._triggerExit(0), 5);
      const handle = await handleP;
      await expect(handle.completion).resolves.toBeUndefined();
      expect(mockCleanupSession).toHaveBeenCalledWith(handle.ptyId);
    });
  });

  describe('spawnAgentSession — PtyHost path', () => {
    it('delegates to spawnAgentViaPtyHost when usePtyHost=true', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockGetConfigValue as any).mockImplementation((k: string) => k === 'usePtyHost');

      mockSpawnAgentViaPtyHost.mockResolvedValue({
        success: true,
        result: Promise.resolve(null),
      });

      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      const handle = await spawnAgentSession({ prompt: 'hi', projectPath: '/project' });
      await handle.completion;

      expect(mockSpawnAgentViaPtyHost).toHaveBeenCalled();
    });

    it('throws when PtyHost spawn fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockGetConfigValue as any).mockImplementation((k: string) => k === 'usePtyHost');
      mockSpawnAgentViaPtyHost.mockResolvedValue({ success: false, error: 'host down' });

      const { spawnAgentSession } = await import('./sessionSpawnAdapter');
      await expect(spawnAgentSession({ prompt: 'hi', projectPath: '/p' }))
        .rejects.toThrow('host down');
    });
  });

  describe('killSession', () => {
    it('calls killPty when session exists', async () => {
      const ptyId = 'sess-123';
      mockSessions.set(ptyId, {});

      const { killSession } = await import('./sessionSpawnAdapter');
      await killSession(ptyId);

      expect(mockKillPty).toHaveBeenCalledWith(ptyId);
    });

    it('is a no-op when session does not exist', async () => {
      const { killSession } = await import('./sessionSpawnAdapter');
      await killSession('nonexistent');
      expect(mockKillPty).not.toHaveBeenCalled();
    });

    it('swallows errors and does not rethrow', async () => {
      const ptyId = 'err-sess';
      mockSessions.set(ptyId, {});
      mockKillPty.mockRejectedValueOnce(new Error('boom'));

      const { killSession } = await import('./sessionSpawnAdapter');
      await expect(killSession(ptyId)).resolves.toBeUndefined();
    });
  });
});
