import { describe, expect, it, vi } from 'vitest';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import type { PendingCodexCapture } from './useTerminalSessions.sync.helpers';
import {
  applyTerminalFallbackBind,
  attemptCodexCapture,
  createSessionSnapshot,
  readSessionSnapshot,
} from './useTerminalSessions.sync.helpers';

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'pty-1',
    title: 'Test Terminal',
    status: 'running',
    isClaude: false,
    isCodex: false,
    claudeSessionId: undefined,
    codexThreadId: undefined,
    ...overrides,
  } as TerminalSession;
}

describe('applyTerminalFallbackBind', () => {
  it('binds an unbound terminal to the incoming UUID', () => {
    const sessions: TerminalSession[] = [makeSession({ id: 'pty-a', claudeSessionId: undefined })];
    let captured: TerminalSession[] = sessions;
    const setSessions = vi.fn((updater: (prev: TerminalSession[]) => TerminalSession[]) => {
      captured = updater(sessions);
    });

    applyTerminalFallbackBind('pty-a', 'uuid-1', setSessions);

    expect(setSessions).toHaveBeenCalledOnce();
    expect(captured[0].claudeSessionId).toBe('uuid-1');
  });

  it('rebinds an already-bound terminal when a different UUID arrives', () => {
    const sessions: TerminalSession[] = [makeSession({ id: 'pty-a', claudeSessionId: 'uuid-old' })];
    let captured: TerminalSession[] = sessions;
    const setSessions = vi.fn((updater: (prev: TerminalSession[]) => TerminalSession[]) => {
      captured = updater(sessions);
    });

    applyTerminalFallbackBind('pty-a', 'uuid-new', setSessions);

    expect(setSessions).toHaveBeenCalledOnce();
    expect(captured[0].claudeSessionId).toBe('uuid-new');
  });

  it('skips state update when the same UUID is already bound (idempotent)', () => {
    const sessions: TerminalSession[] = [makeSession({ id: 'pty-a', claudeSessionId: 'uuid-1' })];
    let callCount = 0;
    const setSessions = vi.fn((updater: (prev: TerminalSession[]) => TerminalSession[]) => {
      const result = updater(sessions);
      // Referential equality: same array reference means no state change
      if (result === sessions) callCount += 1;
    });

    applyTerminalFallbackBind('pty-a', 'uuid-1', setSessions);

    // setSessions is always called (React batches this), but the returned
    // array should be the same reference (no actual update)
    expect(setSessions).toHaveBeenCalledOnce();
    expect(callCount).toBe(1);
  });

  it('two terminals each bind to their own UUID — both end up in ownedSet', () => {
    const sessions: TerminalSession[] = [
      makeSession({ id: 'pty-a', claudeSessionId: undefined }),
      makeSession({ id: 'pty-b', claudeSessionId: undefined }),
    ];

    // Simulate terminal A binding uuid-1
    let state = sessions;
    applyTerminalFallbackBind('pty-a', 'uuid-1', (updater) => {
      state = (updater as (prev: TerminalSession[]) => TerminalSession[])(state);
    });

    // Simulate terminal B binding uuid-2
    applyTerminalFallbackBind('pty-b', 'uuid-2', (updater) => {
      state = (updater as (prev: TerminalSession[]) => TerminalSession[])(state);
    });

    const ids = new Set(state.map((s) => s.claudeSessionId).filter(Boolean));
    expect(ids).toContain('uuid-1');
    expect(ids).toContain('uuid-2');
  });

  it('skips when the terminal ID is not found in sessions', () => {
    const sessions: TerminalSession[] = [makeSession({ id: 'pty-a' })];
    let captured: TerminalSession[] = sessions;
    const setSessions = vi.fn((updater: (prev: TerminalSession[]) => TerminalSession[]) => {
      captured = updater(sessions);
    });

    applyTerminalFallbackBind('pty-nonexistent', 'uuid-1', setSessions);

    // No change — unknown terminal ID
    expect(captured).toBe(sessions);
  });
});

describe('createSessionSnapshot', () => {
  it('maps basic session fields to snapshot', () => {
    const session = makeSession({ title: 'My Shell' });
    const snap = createSessionSnapshot(session, '/home/user');
    expect(snap.cwd).toBe('/home/user');
    expect(snap.title).toBe('My Shell');
    expect(snap.isClaude).toBe(false);
    expect(snap.isCodex).toBe(false);
  });

  it('carries claude and codex IDs through', () => {
    const session = makeSession({
      isClaude: true,
      claudeSessionId: 'claude-abc',
      isCodex: false,
      codexThreadId: undefined,
    });
    const snap = createSessionSnapshot(session, '/tmp');
    expect(snap.isClaude).toBe(true);
    expect(snap.claudeSessionId).toBe('claude-abc');
    expect(snap.codexThreadId).toBeUndefined();
  });
});

describe('readSessionSnapshot', () => {
  it('uses cwd from IPC result on success', async () => {
    const session = makeSession({ id: 'pty-2' });
    const mockAPI = {
      pty: { getCwd: vi.fn().mockResolvedValue({ cwd: '/resolved/cwd' }) },
    };
    vi.stubGlobal('window', { electronAPI: mockAPI });

    const snap = await readSessionSnapshot(session);
    expect(snap.cwd).toBe('/resolved/cwd');
    vi.unstubAllGlobals();
  });

  it('falls back to empty cwd on IPC error', async () => {
    const session = makeSession({ id: 'pty-3' });
    const mockAPI = {
      pty: { getCwd: vi.fn().mockRejectedValue(new Error('IPC error')) },
    };
    vi.stubGlobal('window', { electronAPI: mockAPI });

    const snap = await readSessionSnapshot(session);
    expect(snap.cwd).toBe('');
    vi.unstubAllGlobals();
  });
});

describe('attemptCodexCapture', () => {
  it('resolves and removes entry on success', async () => {
    const entry: PendingCodexCapture = { ptyId: 'pty-4', cwd: '/proj', spawnedAt: 100, retries: 0 };
    const pendingRef = { current: [entry] };
    const setSessions = vi.fn();

    const mockAPI = {
      codex: {
        resolveThreadId: vi.fn().mockResolvedValue({ success: true, threadId: 'thread-xyz' }),
      },
    };
    vi.stubGlobal('window', { electronAPI: mockAPI });

    await attemptCodexCapture(entry, pendingRef, setSessions);

    expect(pendingRef.current).toHaveLength(0);
    expect(setSessions).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('increments retries when threadId not yet available', async () => {
    const entry: PendingCodexCapture = { ptyId: 'pty-5', cwd: '/proj', spawnedAt: 100, retries: 0 };
    const pendingRef = { current: [entry] };
    const setSessions = vi.fn();

    const mockAPI = {
      codex: { resolveThreadId: vi.fn().mockResolvedValue({ success: false }) },
    };
    vi.stubGlobal('window', { electronAPI: mockAPI });

    await attemptCodexCapture(entry, pendingRef, setSessions);

    expect(pendingRef.current[0].retries).toBe(1);
    expect(setSessions).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('removes entry after max retries exhausted', async () => {
    const entry: PendingCodexCapture = { ptyId: 'pty-6', cwd: '/proj', spawnedAt: 100, retries: 2 };
    const pendingRef = { current: [entry] };
    const setSessions = vi.fn();

    const mockAPI = {
      codex: { resolveThreadId: vi.fn().mockResolvedValue({ success: false }) },
    };
    vi.stubGlobal('window', { electronAPI: mockAPI });

    await attemptCodexCapture(entry, pendingRef, setSessions);

    expect(pendingRef.current).toHaveLength(0);
    expect(setSessions).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
