import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock child_process before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  unlink: vi.fn(),
}));

// threadStore is used by revertToSnapshotWithBridge — mock it
vi.mock('./threadStore', () => ({
  createAgentChatThreadStore: vi.fn(),
}));

import { execFile } from 'child_process';
import { unlink } from 'fs/promises';
import { join } from 'path';

import {
  captureHeadHash,
  gitExecSimple,
  revertToSnapshotWithBridge,
} from './chatOrchestrationBridgeGit';
import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatThreadRecord } from './types';

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const execFileMock = vi.mocked(execFile);
const unlinkMock = vi.mocked(unlink);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate execFile calling its callback with success. */
function mockExecFileSuccess(stdout: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execFileMock.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, stdout, '');
    return {} as ReturnType<typeof execFile>;
  });
}

/** Simulate execFile calling its callback with an error. */
function mockExecFileError(message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execFileMock.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(new Error(message), '', message);
    return {} as ReturnType<typeof execFile>;
  });
}

/** Build a minimal mock AgentChatThreadStore. */
function makeMockThreadStore(thread: AgentChatThreadRecord | null): AgentChatThreadStore {
  return {
    loadThread: vi.fn().mockResolvedValue(thread),
  } as unknown as AgentChatThreadStore;
}

/** Build a minimal AgentChatThreadRecord with the fields used by revertToSnapshotWithBridge. */
function makeThread(
  threadId: string,
  workspaceRoot: string,
  messages: AgentChatThreadRecord['messages'],
): AgentChatThreadRecord {
  return {
    id: threadId,
    workspaceRoot,
    messages,
    status: 'idle',
    createdAt: 0,
    updatedAt: 0,
    title: 'Test thread',
  } as unknown as AgentChatThreadRecord;
}

/** Build an assistant message record with an optional preSnapshotHash. */
function makeMessage(
  id: string,
  preSnapshotHash?: string,
): AgentChatThreadRecord['messages'][0] {
  return {
    id,
    role: 'assistant',
    content: [],
    createdAt: 0,
    orchestration: preSnapshotHash ? { preSnapshotHash } : undefined,
  } as unknown as AgentChatThreadRecord['messages'][0];
}

// ---------------------------------------------------------------------------
// gitExecSimple
// ---------------------------------------------------------------------------

describe('gitExecSimple', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('resolves with stdout on success', async () => {
    mockExecFileSuccess('abc123\n');
    const result = await gitExecSimple(['rev-parse', 'HEAD'], '/repo');
    expect(result).toBe('abc123\n');
  });

  it('calls execFile with "git" and the supplied args', async () => {
    mockExecFileSuccess('');
    await gitExecSimple(['status', '--short'], '/workspace');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['status', '--short'],
      expect.objectContaining({ cwd: '/workspace' }),
      expect.any(Function),
    );
  });

  it('rejects when execFile calls back with an error', async () => {
    mockExecFileError('not a git repository');
    await expect(gitExecSimple(['status'], '/tmp')).rejects.toThrow('not a git repository');
  });

  it('passes a timeout option', async () => {
    mockExecFileSuccess('');
    await gitExecSimple(['log'], '/repo');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// captureHeadHash
// ---------------------------------------------------------------------------

describe('captureHeadHash', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('returns the trimmed hash on success', async () => {
    mockExecFileSuccess('deadbeef1234\n');
    const hash = await captureHeadHash('/repo');
    expect(hash).toBe('deadbeef1234');
  });

  it('returns undefined when git command fails (not a repo)', async () => {
    mockExecFileError('fatal: not a git repository');
    const hash = await captureHeadHash('/tmp/not-a-repo');
    expect(hash).toBeUndefined();
  });

  it('returns undefined when stdout is empty', async () => {
    mockExecFileSuccess('');
    const hash = await captureHeadHash('/repo');
    expect(hash).toBeUndefined();
  });

  it('calls execFile with rev-parse HEAD', async () => {
    mockExecFileSuccess('abc\n');
    await captureHeadHash('/my/workspace');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['rev-parse', 'HEAD'],
      expect.objectContaining({ cwd: '/my/workspace' }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// revertToSnapshotWithBridge — guard conditions
// ---------------------------------------------------------------------------

describe('revertToSnapshotWithBridge — guard conditions', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    unlinkMock.mockReset();
  });

  it('returns error when thread is not found', async () => {
    const store = makeMockThreadStore(null);
    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/thread not found/i);
  });

  it('returns error when message is not found in the thread', async () => {
    const thread = makeThread('thread-1', '/repo', [makeMessage('other-msg')]);
    const store = makeMockThreadStore(thread);
    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'missing-msg');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/message not found/i);
  });

  it('returns error when message has no preSnapshotHash', async () => {
    const thread = makeThread('thread-1', '/repo', [makeMessage('msg-1')]);
    const store = makeMockThreadStore(thread);
    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no snapshot/i);
  });

  it('returns error when the agent is still running (active send for same thread)', async () => {
    const thread = makeThread('thread-1', '/repo', [makeMessage('msg-1', 'abc123')]);
    const store = makeMockThreadStore(thread);
    const activeSends = new Map<string, ActiveStreamContext>([
      ['send-1', { threadId: 'thread-1' } as ActiveStreamContext],
    ]);
    const result = await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/still working/i);
  });

  it('allows revert when active sends belong to a different thread', async () => {
    const thread = makeThread('thread-1', '/repo', [makeMessage('msg-1', 'abc123')]);
    const store = makeMockThreadStore(thread);
    const activeSends = new Map<string, ActiveStreamContext>([
      ['send-1', { threadId: 'thread-OTHER' } as ActiveStreamContext],
    ]);
    // No diff output → no files changed, so it completes without needing unlink
    execFileMock.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, '', ''); // empty diff output
      return {} as ReturnType<typeof execFile>;
    });
    const result = await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// revertToSnapshotWithBridge — single file changes
// ---------------------------------------------------------------------------

describe('revertToSnapshotWithBridge — reverting file changes', () => {
  const WORKSPACE = '/workspace/project';
  const SNAPSHOT = 'deadbeef';

  beforeEach(() => {
    execFileMock.mockReset();
    unlinkMock.mockReset();
  });

  function setupThread(messageId = 'msg-1'): {
    store: AgentChatThreadStore;
    activeSends: Map<string, ActiveStreamContext>;
  } {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage(messageId, SNAPSHOT)]);
    return {
      store: makeMockThreadStore(thread),
      activeSends: new Map(),
    };
  }

  it('returns success with empty revertedFiles when diff output is empty', async () => {
    const { store, activeSends } = setupThread();
    execFileMock.mockImplementation(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, '', '');
      return {} as ReturnType<typeof execFile>;
    });
    const result = await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    expect(result.revertedFiles).toEqual([]);
  });

  it('calls git checkout with snapshot hash and modified file path', async () => {
    const { store, activeSends } = setupThread();
    const callSequence: Array<{ args: string[] }> = [];
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        callSequence.push({ args });
        // First call is diff, second is checkout
        if (args[0] === 'diff') {
          cb(null, `M\tsrc/modified.ts\n`, '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');

    const diffCall = callSequence.find((c) => c.args[0] === 'diff');
    expect(diffCall).toBeDefined();
    expect(diffCall!.args).toContain(SNAPSHOT);

    const checkoutCall = callSequence.find((c) => c.args[0] === 'checkout');
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall!.args).toContain(SNAPSHOT);
    expect(checkoutCall!.args).toContain('src/modified.ts');
  });

  it('includes modified file in revertedFiles', async () => {
    const { store, activeSends } = setupThread();
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') cb(null, 'M\tsrc/file.ts\n', '');
        else cb(null, '', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    expect(result.revertedFiles).toContain('src/file.ts');
    expect(result.restoredToHash).toBe(SNAPSHOT);
  });

  it('calls unlink for files added by the agent (status A)', async () => {
    const { store, activeSends } = setupThread();
    unlinkMock.mockResolvedValue(undefined);
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') cb(null, 'A\tsrc/new-file.ts\n', '');
        else cb(null, '', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    expect(result.revertedFiles).toContain('src/new-file.ts');
    // path.join is used by the source code, so on Windows the path uses backslashes
    expect(unlinkMock).toHaveBeenCalledWith(join(WORKSPACE, 'src/new-file.ts'));
  });

  it('does not call git checkout for newly-added files (status A)', async () => {
    const { store, activeSends } = setupThread();
    unlinkMock.mockResolvedValue(undefined);
    const checkoutArgs: string[][] = [];
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') cb(null, 'A\tsrc/new-file.ts\n', '');
        else {
          if (args[0] === 'checkout') checkoutArgs.push(args);
          cb(null, '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    await revertToSnapshotWithBridge(store, activeSends, 'thread-1', 'msg-1');
    expect(checkoutArgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// revertToSnapshotWithBridge — multiple file changes
// ---------------------------------------------------------------------------

describe('revertToSnapshotWithBridge — multiple file changes', () => {
  const WORKSPACE = '/workspace/project';
  const SNAPSHOT = 'cafebabe';

  beforeEach(() => {
    execFileMock.mockReset();
    unlinkMock.mockReset();
  });

  it('handles a mix of M, D, and A statuses', async () => {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);
    unlinkMock.mockResolvedValue(undefined);

    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') {
          cb(null, ['M\tsrc/a.ts', 'D\tsrc/b.ts', 'A\tsrc/c.ts'].join('\n') + '\n', '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    expect(result.revertedFiles).toContain('src/a.ts'); // modified
    expect(result.revertedFiles).toContain('src/b.ts'); // deleted → restore
    expect(result.revertedFiles).toContain('src/c.ts'); // added → remove
    expect(unlinkMock).toHaveBeenCalledTimes(1);
  });

  it('handles renamed files (status R): restores original, removes new path', async () => {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);
    unlinkMock.mockResolvedValue(undefined);

    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') {
          // R100<TAB>old-name.ts<TAB>new-name.ts
          cb(null, 'R100\told-name.ts\tnew-name.ts\n', '');
        } else {
          cb(null, '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    expect(result.revertedFiles).toContain('old-name.ts'); // restored
    expect(result.revertedFiles).toContain('new-name.ts'); // removed
    expect(unlinkMock).toHaveBeenCalledWith(join(WORKSPACE, 'new-name.ts'));
  });

  it('batches large numbers of files in groups of 50', async () => {
    const BATCH_SIZE = 50;
    const fileCount = 120; // should produce 3 batches: 50, 50, 20
    const diffLines = Array.from({ length: fileCount }, (_, i) => `M\tsrc/file${i}.ts`).join(
      '\n',
    );
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);

    const checkoutCalls: string[][] = [];
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') {
          cb(null, diffLines + '\n', '');
        } else {
          if (args[0] === 'checkout') checkoutCalls.push(args);
          cb(null, '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(true);
    // 3 batches for 120 files
    expect(checkoutCalls).toHaveLength(Math.ceil(fileCount / BATCH_SIZE));
    // First two batches have 50 file args + 'checkout', hash, '--'
    const firstBatchFiles = checkoutCalls[0].filter((a) => a.startsWith('src/'));
    expect(firstBatchFiles).toHaveLength(BATCH_SIZE);
  });
});

// ---------------------------------------------------------------------------
// revertToSnapshotWithBridge — error handling
// ---------------------------------------------------------------------------

describe('revertToSnapshotWithBridge — error handling', () => {
  const WORKSPACE = '/workspace/project'; // used for join() in unlink assertions
  const SNAPSHOT = 'abc123';

  beforeEach(() => {
    execFileMock.mockReset();
    unlinkMock.mockReset();
  });

  it('returns failure result when git diff command fails', async () => {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execFileMock.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(new Error('git: command not found'), '', '');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/revert failed/i);
  });

  it('returns failure result when git checkout fails', async () => {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);

    let callCount = 0;
    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        callCount++;
        if (callCount === 1) {
          // diff call succeeds
          cb(null, 'M\tsrc/file.ts\n', '');
        } else {
          // checkout call fails
          cb(new Error('error: pathspec did not match any file(s)'), '', '');
        }
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/revert failed/i);
  });

  it('still succeeds if unlink fails for added files (warns but continues)', async () => {
    const thread = makeThread('thread-1', WORKSPACE, [makeMessage('msg-1', SNAPSHOT)]);
    const store = makeMockThreadStore(thread);
    // unlink rejects (file already gone)
    unlinkMock.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    execFileMock.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_cmd: any, args: any, _opts: any, cb: any) => {
        if (args[0] === 'diff') cb(null, 'A\tsrc/phantom.ts\n', '');
        else cb(null, '', '');
        return {} as ReturnType<typeof execFile>;
      },
    );

    const result = await revertToSnapshotWithBridge(store, new Map(), 'thread-1', 'msg-1');
    // The unlink failure is a warning, not a hard error — revert itself succeeds
    expect(result.success).toBe(true);
  });
});
