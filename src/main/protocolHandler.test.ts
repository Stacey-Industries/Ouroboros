/**
 * protocolHandler.test.ts — argv parsing + dispatch logic.
 *
 * The Electron app / BrowserWindow integration is covered by manual smoke
 * tests; here we exercise the pure helpers.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { on: vi.fn(), setAsDefaultProtocolClient: vi.fn() },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null),
  },
}));

vi.mock('./logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractPermalinkFromArgv } from './protocolHandler';

describe('extractPermalinkFromArgv', () => {
  it('returns null when no argv entry is a thread:// URL', () => {
    expect(extractPermalinkFromArgv(['node', 'main.js', '--flag'])).toBeNull();
  });

  it('returns parsed permalink for thread:// argv entry', () => {
    expect(extractPermalinkFromArgv(['electron', 'thread://abc#msg=m1'])).toEqual({
      threadId: 'abc',
      messageId: 'm1',
    });
  });

  it('ignores non-string entries', () => {
    const weird = [123 as unknown as string, null as unknown as string, 'thread://xyz'];
    expect(extractPermalinkFromArgv(weird)).toEqual({ threadId: 'xyz' });
  });

  it('returns the first valid permalink when multiple exist', () => {
    const argv = ['thread://first', 'thread://second'];
    expect(extractPermalinkFromArgv(argv)).toEqual({ threadId: 'first' });
  });

  it('returns null for malformed thread:// entry', () => {
    expect(extractPermalinkFromArgv(['thread://'])).toBeNull();
  });
});
