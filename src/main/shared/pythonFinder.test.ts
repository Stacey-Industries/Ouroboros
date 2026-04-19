/**
 * pythonFinder.test.ts — Unit tests for the shared Python binary finder.
 *
 * These tests mirror the existing coverage from the two now-unified callers:
 * router/retrainTrigger.test.ts and orchestration/contextRetrainTriggerHelpers.test.ts
 */

import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

// ── Module mock for node:child_process ────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function freshModule() {
  vi.resetModules();
  const cp = await import('node:child_process');
  const mod = await import('./pythonFinder');
  return { execFileMock: cp.execFile as unknown as ReturnType<typeof vi.fn>, ...mod };
}

type ExecFileCb = (err: Error | null) => void;

function makeExecFileImpl(successBins: Set<string>) {
  return (...args: unknown[]): void => {
    const cb = args[args.length - 1] as ExecFileCb;
    const bin = args[0] as string;
    if (successBins.has(bin)) cb(null);
    else cb(new Error(`${bin}: not found`));
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('findPython', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns the first successful binary candidate', async () => {
    const { execFileMock, findPython } = await freshModule();
    execFileMock.mockImplementation(makeExecFileImpl(new Set(['python3'])));

    const result = await findPython();
    expect(result).toBe('python3');
  });

  it('tries next candidate if first fails', async () => {
    const { execFileMock, findPython } = await freshModule();
    execFileMock.mockImplementation(makeExecFileImpl(new Set(['python'])));

    const result = await findPython();
    expect(result).toBe('python');
  });

  it('returns null when no candidate is found', async () => {
    const { execFileMock, findPython } = await freshModule();
    execFileMock.mockImplementation(makeExecFileImpl(new Set()));

    const result = await findPython();
    expect(result).toBeNull();
  });

  it('caches the result on subsequent calls', async () => {
    const { execFileMock, findPython } = await freshModule();
    execFileMock.mockImplementation(makeExecFileImpl(new Set(['python3'])));

    const first = await findPython();
    const callsAfterFirst = execFileMock.mock.calls.length;
    const second = await findPython();
    const callsAfterSecond = execFileMock.mock.calls.length;

    expect(first).toBe('python3');
    expect(second).toBe('python3');
    expect(callsAfterSecond).toBe(callsAfterFirst); // no new probes on cache hit
  });

  it('resetPythonCache clears the cache', async () => {
    const { execFileMock, findPython, resetPythonCache } = await freshModule();
    execFileMock.mockImplementation(makeExecFileImpl(new Set(['python3'])));

    await findPython();
    const callsBefore = execFileMock.mock.calls.length;

    resetPythonCache();
    await findPython();
    const callsAfter = execFileMock.mock.calls.length;

    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});
