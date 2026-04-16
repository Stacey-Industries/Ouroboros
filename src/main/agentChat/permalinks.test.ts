/**
 * permalinks.test.ts — unit tests for the thread:// URL scheme.
 */

import { describe, expect, it } from 'vitest';

import { buildPermalink, parsePermalink } from './permalinks';

describe('buildPermalink', () => {
  it('builds thread-only permalink', () => {
    expect(buildPermalink('abc')).toBe('thread://abc');
  });

  it('builds thread + message permalink', () => {
    expect(buildPermalink('abc', 'm1')).toBe('thread://abc#msg=m1');
  });

  it('URL-encodes thread id with reserved characters', () => {
    expect(buildPermalink('a/b c')).toBe('thread://a%2Fb%20c');
  });

  it('URL-encodes message id with reserved characters', () => {
    expect(buildPermalink('t', 'a/b c')).toBe('thread://t#msg=a%2Fb%20c');
  });
});

describe('parsePermalink', () => {
  it('parses thread-only permalink', () => {
    expect(parsePermalink('thread://abc')).toEqual({ threadId: 'abc' });
  });

  it('parses thread + message permalink', () => {
    expect(parsePermalink('thread://abc#msg=m1')).toEqual({ threadId: 'abc', messageId: 'm1' });
  });

  it('decodes URL-encoded thread and message ids', () => {
    expect(parsePermalink('thread://a%2Fb%20c#msg=x%2Fy')).toEqual({
      threadId: 'a/b c',
      messageId: 'x/y',
    });
  });

  it('returns null for non-thread scheme', () => {
    expect(parsePermalink('https://example.com')).toBeNull();
    expect(parsePermalink('foo://abc')).toBeNull();
  });

  it('returns null for empty thread id', () => {
    expect(parsePermalink('thread://')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parsePermalink(null as unknown as string)).toBeNull();
    expect(parsePermalink(undefined as unknown as string)).toBeNull();
  });

  it('ignores unknown fragments', () => {
    expect(parsePermalink('thread://abc#foo=bar')).toEqual({ threadId: 'abc' });
  });

  it('ignores empty msg fragment', () => {
    expect(parsePermalink('thread://abc#msg=')).toEqual({ threadId: 'abc' });
  });

  it('round-trips build → parse for complex ids', () => {
    const built = buildPermalink('thread id with spaces/slashes', 'msg-xyz-123');
    expect(parsePermalink(built)).toEqual({
      threadId: 'thread id with spaces/slashes',
      messageId: 'msg-xyz-123',
    });
  });

  it('handles malformed URL encoding gracefully', () => {
    expect(parsePermalink('thread://a%ZZb')).toBeNull();
  });
});
