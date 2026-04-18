/**
 * crashReporter.test.ts — Unit tests for Wave 38 Phase F crash reporter.
 *
 * Covers:
 *   - redactPaths: homedir, Windows drive+Users, Unix /Users/ patterns
 *   - writeCrashRecord called on uncaughtException / unhandledRejection
 *   - Webhook POST gated on config.platform.crashReports.enabled
 *   - initialiseCrashReporter is idempotent (only registers handlers once)
 */

import https from 'https';
import os from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('./config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./crashReporterStorage', () => ({
  writeCrashRecord: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getConfigValue } from './config';
import { _resetForTests, initialiseCrashReporter, redactPaths } from './crashReporter';
import { writeCrashRecord } from './crashReporterStorage';

const mockGetConfigValue = vi.mocked(getConfigValue);
const mockWriteCrashRecord = vi.mocked(writeCrashRecord);

// ---------------------------------------------------------------------------
// redactPaths
// ---------------------------------------------------------------------------

describe('redactPaths', () => {
  it('replaces os.homedir() with ~', () => {
    const home = os.homedir();
    const input = `Error at ${home}/projects/foo/bar.ts:10`;
    const result = redactPaths(input);
    expect(result).not.toContain(home);
    expect(result).toContain('~');
  });

  it('replaces Windows C:\\Users\\username\\ with ~\\', () => {
    const input = 'Error at C:\\Users\\johndoe\\projects\\foo.ts:5';
    const result = redactPaths(input);
    expect(result).not.toContain('C:\\Users\\johndoe\\');
    expect(result).toContain('~\\');
  });

  it('replaces /Users/username/ with ~/', () => {
    const input = 'Error at /Users/janedoe/code/app.ts:3';
    const result = redactPaths(input);
    expect(result).not.toContain('/Users/janedoe/');
    expect(result).toContain('~/');
  });

  it('replaces multiple occurrences in one string', () => {
    const home = os.homedir();
    const input = `${home}/a.ts and ${home}/b.ts`;
    const result = redactPaths(input);
    expect(result).not.toContain(home);
    expect(result.split('~').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('leaves non-path strings unchanged', () => {
    const input = 'Error: something went wrong';
    expect(redactPaths(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// initialiseCrashReporter — handler registration
// ---------------------------------------------------------------------------

describe('initialiseCrashReporter', () => {
  let onSpy: ReturnType<typeof vi.spyOn>;
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  beforeEach(() => {
    _resetForTests();
    mockWriteCrashRecord.mockClear();
    mockGetConfigValue.mockReturnValue(undefined as never);

    onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: unknown) => {
      const key = event as string;
      // eslint-disable-next-line security/detect-object-injection -- key is a known process event name, not user input
      listeners[key] = listeners[key] ?? [];
      // eslint-disable-next-line security/detect-object-injection -- key is a known process event name, not user input
      listeners[key].push(listener as (...args: unknown[]) => void);
      return process;
    }) as never);
  });

  afterEach(() => {
    onSpy.mockRestore();
    // eslint-disable-next-line security/detect-object-injection -- k is from Object.keys, not user input
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('registers uncaughtException handler', () => {
    initialiseCrashReporter();
    expect(listeners['uncaughtException']).toHaveLength(1);
  });

  it('registers unhandledRejection handler', () => {
    initialiseCrashReporter();
    expect(listeners['unhandledRejection']).toHaveLength(1);
  });

  it('is idempotent — calling twice does not double-register', () => {
    initialiseCrashReporter();
    initialiseCrashReporter();
    expect(listeners['uncaughtException']).toHaveLength(1);
  });

  it('calls writeCrashRecord when uncaughtException fires', async () => {
    initialiseCrashReporter();
    const handler = listeners['uncaughtException'][0];
    handler(new Error('boom'));
    // Allow microtask queue to flush
    await Promise.resolve();
    expect(mockWriteCrashRecord).toHaveBeenCalledOnce();
    const [record] = mockWriteCrashRecord.mock.calls[0];
    expect(record.message).toContain('boom');
    expect(record.stack).toContain('boom');
  });

  it('calls writeCrashRecord when unhandledRejection fires', async () => {
    initialiseCrashReporter();
    const handler = listeners['unhandledRejection'][0];
    handler(new Error('rejection'));
    await Promise.resolve();
    expect(mockWriteCrashRecord).toHaveBeenCalledOnce();
    const [record] = mockWriteCrashRecord.mock.calls[0];
    expect(record.message).toContain('rejection');
  });

  it('redacts homedir from stack trace in written record', async () => {
    initialiseCrashReporter();
    const home = os.homedir();
    const err = new Error('path error');
    err.stack = `Error: path error\n    at ${home}/src/foo.ts:10:5`;
    const handler = listeners['uncaughtException'][0];
    handler(err);
    await Promise.resolve();
    const [record] = mockWriteCrashRecord.mock.calls[0];
    expect(record.stack).not.toContain(home);
    expect(record.stack).toContain('~');
  });
});

// ---------------------------------------------------------------------------
// Webhook upload gate
// ---------------------------------------------------------------------------

describe('webhook upload', () => {
  let onSpy: ReturnType<typeof vi.spyOn>;
  let requestSpy: ReturnType<typeof vi.spyOn>;
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  const fakeReq = {
    on: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
  };

  beforeEach(() => {
    _resetForTests();
    mockWriteCrashRecord.mockClear();

    onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, listener: unknown) => {
      const key = event as string;
      // eslint-disable-next-line security/detect-object-injection -- key is a known process event name, not user input
      listeners[key] = listeners[key] ?? [];
      // eslint-disable-next-line security/detect-object-injection -- key is a known process event name, not user input
      listeners[key].push(listener as (...args: unknown[]) => void);
      return process;
    }) as never);

    requestSpy = vi.spyOn(https, 'request').mockReturnValue(fakeReq as never);
  });

  afterEach(() => {
    onSpy.mockRestore();
    requestSpy.mockRestore();
    // eslint-disable-next-line security/detect-object-injection -- k is from Object.keys, not user input
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    vi.mocked(fakeReq.on).mockClear();
    vi.mocked(fakeReq.write).mockClear();
    vi.mocked(fakeReq.end).mockClear();
  });

  it('does NOT post when crashReports.enabled is false', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: false, webhookUrl: 'https://example.com/hook' },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test'));
    await Promise.resolve();

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('does NOT post when enabled but webhookUrl is empty', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: '' },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test'));
    await Promise.resolve();

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('POSTs when enabled is true and webhookUrl is set', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: 'https://hooks.example.com/crash' },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('webhook test'));
    await Promise.resolve();

    expect(requestSpy).toHaveBeenCalledWith(
      'https://hooks.example.com/crash',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Function),
    );
    expect(fakeReq.write).toHaveBeenCalled();
    expect(fakeReq.end).toHaveBeenCalled();
  });
});
