/**
 * jobRunner.test.ts — smoke tests for the job runner.
 *
 * Tests the store-update behavior of createJobRunner by mocking the
 * entire spawnJob layer via ptyAgentBridge + ptyEnv.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;
// Callback registry so tests can drive the mock bridge
let bridgeOnComplete: ((res: { result?: string } | null, exitCode: number) => void) | null = null;
let bridgeOnEvent: ((e: unknown) => void) | null = null;

// Stub process.platform to 'linux' so jobRunner uses import() instead of require()
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-runner-test-'));
  bridgeOnComplete = null;
  bridgeOnEvent = null;

  // Force linux path so buildClaudeArgs avoids require('../pty')
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

  vi.resetModules();

  vi.doMock('electron', () => ({
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    app: { getPath: vi.fn(() => os.tmpdir()) },
  }));

  vi.doMock('../logger', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));

  vi.doMock('../config', () => ({
    getConfigValue: vi.fn(() => false), // usePtyHost = false
  }));

  vi.doMock('../ptyEnv', () => ({
    buildBaseEnv: vi.fn((e: Record<string, string>) => e),
    buildProviderEnv: vi.fn(() => ({})),
    resolveSpawnOptions: vi.fn(() => ({ cols: 80, rows: 24, cwd: tmpDir })),
  }));

  const mockPtyProc = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
  };

  vi.doMock('node-pty', () => ({
    default: { spawn: vi.fn(() => mockPtyProc) },
    spawn: vi.fn(() => mockPtyProc),
  }));

  vi.doMock('../pty', () => ({
    escapePowerShellArg: (s: string) => `"${s}"`,
    registerSession: vi.fn(),
    cleanupSession: vi.fn(),
    sessions: new Map(),
    killPty: vi.fn(),
  }));

  // Bridge mock — captures callbacks and exposes them for tests to drive
  vi.doMock('../ptyAgentBridge', () => ({
    createAgentBridge: vi.fn((opts: {
      sessionId: string;
      onEvent: (e: unknown) => void;
      onComplete: (res: { result?: string } | null, exitCode: number) => void;
    }) => {
      bridgeOnComplete = opts.onComplete;
      bridgeOnEvent = opts.onEvent;
      return {
        feed: vi.fn(),
        handleExit: (code: number) => opts.onComplete(null, code),
      };
    }),
  }));
});

afterEach(() => {
  // Restore original platform
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
  vi.resetModules();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* Windows file lock */ }
});

describe('createJobRunner', () => {
  it('completes successfully and sets status to done', async () => {
    const { createJobStore } = await import('./jobStore');
    const { createJobRunner } = await import('./jobRunner');

    const store = createJobStore(path.join(tmpDir, 'jobs.db'));
    const job = store.createJob({ projectRoot: tmpDir, prompt: 'echo hello' });

    const onComplete = vi.fn();
    const runner = createJobRunner({ job, store, onComplete });

    const startPromise = runner.start();
    // Wait for async imports inside spawnJob
    await new Promise((r) => setTimeout(r, 30));

    // Drive the bridge to completion
    expect(bridgeOnComplete).not.toBeNull();
    bridgeOnComplete!({ result: 'Done: created file.txt' }, 0);
    await startPromise;

    const final = store.getJob(job.id);
    expect(final?.status).toBe('done');
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
    store.close();
  });

  it('captures sessionId from the first stream-json event', async () => {
    const { createJobStore } = await import('./jobStore');
    const { createJobRunner } = await import('./jobRunner');

    const store = createJobStore(path.join(tmpDir, 'jobs2.db'));
    const job = store.createJob({ projectRoot: tmpDir, prompt: 'test' });

    const runner = createJobRunner({ job, store });
    const startPromise = runner.start();
    await new Promise((r) => setTimeout(r, 30));

    // Fire a stream-json event with session_id
    bridgeOnEvent!({ type: 'system', subtype: 'init', session_id: 'my-session-id-xyz' });
    bridgeOnComplete!({ result: 'ok' }, 0);
    await startPromise;

    const final = store.getJob(job.id);
    expect(final?.sessionId).toBe('my-session-id-xyz');
    store.close();
  });

  it('marks job as error when PTY exits with non-zero code', async () => {
    const { createJobStore } = await import('./jobStore');
    const { createJobRunner } = await import('./jobRunner');

    const store = createJobStore(path.join(tmpDir, 'jobs3.db'));
    const job = store.createJob({ projectRoot: tmpDir, prompt: 'bad cmd' });

    const runner = createJobRunner({ job, store });
    const startPromise = runner.start();
    await new Promise((r) => setTimeout(r, 30));

    bridgeOnComplete!(null, 1);
    await startPromise;

    const final = store.getJob(job.id);
    expect(final?.status).toBe('error');
    expect(final?.exitCode).toBe(1);
    store.close();
  });

  it('cancel sets status to cancelled before PTY completes', async () => {
    const { createJobStore } = await import('./jobStore');
    const { createJobRunner } = await import('./jobRunner');

    const store = createJobStore(path.join(tmpDir, 'jobs4.db'));
    const job = store.createJob({ projectRoot: tmpDir, prompt: 'long task' });

    const onComplete = vi.fn();
    const runner = createJobRunner({ job, store, onComplete });

    void runner.start();
    await new Promise((r) => setTimeout(r, 30));

    await runner.cancel();

    const final = store.getJob(job.id);
    expect(final?.status).toBe('cancelled');
    store.close();
  });
});
