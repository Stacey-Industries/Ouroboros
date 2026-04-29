/**
 * gitExec.test.ts — smoke coverage for the portable git wrapper.
 *
 * The wrapper itself is a thin `execFile` shim — meaningful coverage is
 * the constants are correct and the function shape is what callers expect.
 * Real git subprocess invocation is exercised by the IDE's git operations
 * tests; we don't duplicate that here.
 */

import { describe, expect, it } from 'vitest';

import { GIT_TIMEOUT_MS, gitExec, gitStdout, MB } from './gitExec';

describe('constants', () => {
  it('GIT_TIMEOUT_MS is 30 seconds', () => {
    expect(GIT_TIMEOUT_MS).toBe(30_000);
  });

  it('MB is 1024 * 1024', () => {
    expect(MB).toBe(1024 * 1024);
  });
});

describe('gitExec', () => {
  it('returns a Promise (function shape contract)', () => {
    // Calling with empty args + invalid cwd will reject — we only verify
    // the return type is thenable, not the rejection behavior.
    const result = gitExec([], { cwd: '/definitely/not/a/git/repo/zzz' });
    expect(result).toBeInstanceOf(Promise);
    // Swallow the rejection so vitest doesn't flag an unhandled rejection.
    result.catch(() => undefined);
  });
});

describe('gitStdout', () => {
  it('returns a Promise that resolves to a string for a real repo', async () => {
    // The test process runs at the repo root, so `git rev-parse HEAD` works.
    const out = await gitStdout(process.cwd(), ['rev-parse', 'HEAD']);
    expect(typeof out).toBe('string');
    expect(out.trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});
