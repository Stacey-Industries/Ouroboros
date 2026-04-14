/**
 * loggerQueue.test.ts — Unit tests for EMFILE-resilient retry queue.
 *
 * Uses the injectable `writer` parameter of wrapFileTransport instead of
 * mocking fs, which avoids the ESM non-configurable-namespace limitation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wrapFileTransport } from './loggerQueue';

type WriterCb = (err: NodeJS.ErrnoException | null) => void;
type Writer = (p: string, d: string, o: Record<string, unknown>, cb: WriterCb) => void;

/** Build a minimal mock File matching electron-log's File shape. */
function makeMockFile(content = 'test log line\n') {
  return {
    path: '/fake/main.log',
    writeOptions: { flag: 'a', encoding: 'utf8' } as Record<string, unknown>,
    asyncWriteQueue: [content],
    hasActiveAsyncWriting: false,
    // Placeholder — will be replaced by wrapFileTransport
    nextAsyncWrite: vi.fn(),
  };
}

function makeMockTransport(file: ReturnType<typeof makeMockFile>) {
  return { getFile: () => file };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('wrapFileTransport', () => {
  it('retries and delivers a log line when the first write throws EMFILE', async () => {
    let callCount = 0;
    const writer: Writer = (_p, _d, _o, cb) => {
      callCount += 1;
      if (callCount === 1) {
        cb(Object.assign(new Error('EMFILE'), { code: 'EMFILE' }));
      } else {
        cb(null);
      }
    };

    const file = makeMockFile();
    wrapFileTransport(makeMockTransport(file), writer);

    // Trigger patched nextAsyncWrite (simulates electron-log's async queue drain)
    file.nextAsyncWrite();

    // First attempt fires synchronously in the mock → EMFILE fires → schedules 10ms retry
    await vi.advanceTimersByTimeAsync(10);
    // Second attempt: succeeds
    await vi.runAllTimersAsync();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('does NOT retry non-EMFILE errors', async () => {
    let callCount = 0;
    const writer: Writer = (_p, _d, _o, cb) => {
      callCount += 1;
      cb(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    };

    const file = makeMockFile('should not retry\n');
    wrapFileTransport(makeMockTransport(file), writer);

    file.nextAsyncWrite();

    // Advance past all possible retry windows
    await vi.advanceTimersByTimeAsync(1_200);
    await vi.runAllTimersAsync();

    // Only the single initial attempt — no retries for EACCES
    expect(callCount).toBe(1);
  });

  it('emits exactly ONE console.error on ring-buffer overflow', async () => {
    // Always fail with EMFILE so items pile up in the retry queue
    const writer: Writer = (_p, _d, _o, cb) => {
      cb(Object.assign(new Error('EMFILE'), { code: 'EMFILE' }));
    };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Drive 600 separate files through the transport (> MAX_QUEUE_SIZE=500).
    // Each triggers one EMFILE → one enqueueForRetry call.
    for (let i = 0; i < 600; i++) {
      const file = makeMockFile(`line ${i}\n`);
      wrapFileTransport(makeMockTransport(file), writer);
      file.nextAsyncWrite();
    }

    // Let all the async EMFILE callbacks resolve (writer is sync so they fire immediately)
    await vi.runAllTimersAsync();

    const overflowCalls = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('ring buffer full'),
    );
    // The overflow message fires exactly once (reset only on full drain, which never
    // happens here because writes always fail with EMFILE).
    expect(overflowCalls).toHaveLength(1);
  });
});
