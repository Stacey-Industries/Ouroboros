/**
 * useChatWindowMode.test.ts — Unit tests for chat-window query parsing.
 */

import { describe, expect, it } from 'vitest';

import { __testing } from './useChatWindowMode';

const { parseChatWindowQuery } = __testing;

describe('parseChatWindowQuery', () => {
  it('returns isChatWindow=false for an empty search string', () => {
    expect(parseChatWindowQuery('')).toEqual({ isChatWindow: false, sessionId: null });
  });

  it('returns isChatWindow=true for ?mode=chat', () => {
    const result = parseChatWindowQuery('?mode=chat&sessionId=abc');
    expect(result.isChatWindow).toBe(true);
    expect(result.sessionId).toBe('abc');
  });

  it('returns isChatWindow=false when mode is something other than chat', () => {
    expect(parseChatWindowQuery('?mode=ide').isChatWindow).toBe(false);
    expect(parseChatWindowQuery('?mode=').isChatWindow).toBe(false);
  });

  it('returns sessionId=null when sessionId is missing or empty', () => {
    expect(parseChatWindowQuery('?mode=chat').sessionId).toBeNull();
    expect(parseChatWindowQuery('?mode=chat&sessionId=').sessionId).toBeNull();
  });

  it('URL-decodes sessionId correctly', () => {
    const result = parseChatWindowQuery('?mode=chat&sessionId=id%20with%20spaces');
    expect(result.sessionId).toBe('id with spaces');
  });

  it('ignores unrelated query params', () => {
    const result = parseChatWindowQuery('?foo=bar&mode=chat&sessionId=x&baz=qux');
    expect(result.isChatWindow).toBe(true);
    expect(result.sessionId).toBe('x');
  });
});
