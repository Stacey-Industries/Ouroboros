/**
 * crashReporter.redact.test.ts — Phase K: extended redaction + webhook scheme tests.
 *
 * Covers:
 *   - Non-\Users\ Windows paths (D:\Projects\alice\) are redacted
 *   - sk-* API key strings in stack traces are redacted
 *   - JWT-shaped strings in stack traces are redacted
 *   - http: webhook URL is rejected by default
 *   - http: webhook URL is accepted when allowInsecure is true
 */

import https from 'https';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
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
// redactPaths — extended Windows path coverage
// ---------------------------------------------------------------------------

describe('redactPaths — extended Windows paths (Phase K)', () => {
  it('redacts D:\\Projects\\alice\\ path', () => {
    const input = 'Error at D:\\Projects\\alice\\src\\app.ts:12';
    const result = redactPaths(input);
    expect(result).not.toContain('alice');
    expect(result).toContain('~\\');
  });

  it('redacts C:\\AppData\\Local\\Temp\\ path', () => {
    const input = 'at C:\\AppData\\Local\\Temp\\foo.ts:3';
    const result = redactPaths(input);
    expect(result).not.toContain('AppData');
    expect(result).toContain('~\\');
  });

  it('redacts 1-level Windows path', () => {
    const input = 'E:\\workspace\\index.ts';
    const result = redactPaths(input);
    expect(result).not.toContain('workspace');
    expect(result).toContain('~\\');
  });

  it('redacts 3-level Windows path', () => {
    const input = 'F:\\a\\b\\c\\file.ts';
    const result = redactPaths(input);
    expect(result).not.toContain('\\a\\b\\c\\');
    expect(result).toContain('~\\');
  });
});

// ---------------------------------------------------------------------------
// redactPaths — token / secret scrubbing
// ---------------------------------------------------------------------------

describe('redactPaths — API key and JWT redaction (Phase K)', () => {
  it('redacts sk-ant-* API key in stack trace', () => {
    const input = 'Error: unauthorized sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890 used';
    const result = redactPaths(input);
    expect(result).not.toContain('sk-ant-api03');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts sk-* generic API key', () => {
    const input = 'at callApi sk-test-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc:5';
    const result = redactPaths(input);
    expect(result).not.toContain('sk-test-');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts JWT-shaped string in stack trace', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const input = `authorization header: Bearer ${jwt}`;
    const result = redactPaths(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('does not corrupt non-secret stack frames', () => {
    const input = 'Error: boom\n    at Object.<anonymous> (src/main/app.ts:10:5)';
    const result = redactPaths(input);
    expect(result).toContain('Error: boom');
    expect(result).toContain('app.ts:10:5');
  });
});

// ---------------------------------------------------------------------------
// Webhook scheme restriction (Phase K)
// ---------------------------------------------------------------------------

describe('webhook scheme restriction (Phase K)', () => {
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
    vi.mocked(fakeReq.on).mockClear();
    vi.mocked(fakeReq.write).mockClear();
    vi.mocked(fakeReq.end).mockClear();
  });

  afterEach(() => {
    onSpy.mockRestore();
    requestSpy.mockRestore();
    // eslint-disable-next-line security/detect-object-injection -- k is from Object.keys, not user input
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  });

  it('rejects http: webhook URL by default (allowInsecure absent)', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: 'http://insecure.example.com/crash' },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test-http-blocked'));
    await Promise.resolve();

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('rejects http: webhook URL when allowInsecure is false', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: 'http://insecure.example.com/crash', allowInsecure: false },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test-http-blocked-false'));
    await Promise.resolve();

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('accepts https: webhook URL by default', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: 'https://secure.example.com/crash' },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test-https-ok'));
    await Promise.resolve();

    expect(requestSpy).toHaveBeenCalledWith(
      'https://secure.example.com/crash',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Function),
    );
  });

  it('accepts http: webhook URL when allowInsecure is true', async () => {
    mockGetConfigValue.mockReturnValue({
      crashReports: { enabled: true, webhookUrl: 'http://debug.local/crash', allowInsecure: true },
    } as never);

    initialiseCrashReporter();
    listeners['uncaughtException'][0](new Error('test-http-allowed'));
    await Promise.resolve();

    expect(requestSpy).toHaveBeenCalledWith(
      'http://debug.local/crash',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Function),
    );
  });
});
