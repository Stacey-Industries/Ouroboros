/**
 * windowManagerChatWindow.test.ts — Unit tests for chat-window helpers.
 */

import { describe, expect, it, vi } from 'vitest';

// ManagedWindow stub — only needs the fields the helpers inspect
vi.mock('./windowManager', () => ({}));

import {
  buildChatWindowBounds,
  buildChatWindowUrl,
  CHAT_WINDOW_HEIGHT,
  CHAT_WINDOW_WIDTH,
  isChatWindow,
} from './windowManagerChatWindow';

// ─── buildChatWindowBounds ────────────────────────────────────────────────────

describe('buildChatWindowBounds', () => {
  it('returns the expected default dimensions', () => {
    expect(buildChatWindowBounds()).toEqual({
      width: CHAT_WINDOW_WIDTH,
      height: CHAT_WINDOW_HEIGHT,
    });
  });

  it('width is smaller than a typical full IDE window (1280)', () => {
    expect(buildChatWindowBounds().width).toBeLessThan(1280);
  });
});

// ─── buildChatWindowUrl ───────────────────────────────────────────────────────

describe('buildChatWindowUrl', () => {
  const SESSION = 'sess-abc-123';
  const INDEX = '/out/renderer/index.html';

  it('uses dev-server URL when rendererUrl is provided', () => {
    const url = buildChatWindowUrl(SESSION, 'http://localhost:5173', INDEX);
    expect(url).toContain('http://localhost:5173');
    expect(url).toContain('mode=chat');
    expect(url).toContain(`sessionId=${encodeURIComponent(SESSION)}`);
  });

  it('appends params with ? when dev-server URL has no query string', () => {
    const url = buildChatWindowUrl(SESSION, 'http://localhost:5173', INDEX);
    expect(url).toMatch(/\?mode=chat/);
  });

  it('appends params with & when dev-server URL already has a query string', () => {
    const url = buildChatWindowUrl(SESSION, 'http://localhost:5173?foo=bar', INDEX);
    expect(url).toContain('foo=bar');
    expect(url).toContain('&mode=chat');
  });

  it('falls back to file:// path when rendererUrl is undefined', () => {
    const url = buildChatWindowUrl(SESSION, undefined, INDEX);
    expect(url).toMatch(/^file:\/\//);
    expect(url).toContain(INDEX);
    expect(url).toContain('mode=chat');
    expect(url).toContain(`sessionId=${encodeURIComponent(SESSION)}`);
  });

  it('URI-encodes sessionId characters that need escaping', () => {
    const url = buildChatWindowUrl('id with spaces', undefined, INDEX);
    expect(url).toContain('id%20with%20spaces');
    expect(url).not.toContain('id with spaces');
  });
});

// ─── isChatWindow ─────────────────────────────────────────────────────────────

describe('isChatWindow', () => {
  it('returns true for kind=chat windows', () => {
    const mw = { kind: 'chat' } as Parameters<typeof isChatWindow>[0];
    expect(isChatWindow(mw)).toBe(true);
  });

  it('returns false for kind=main windows', () => {
    const mw = { kind: 'main' } as Parameters<typeof isChatWindow>[0];
    expect(isChatWindow(mw)).toBe(false);
  });

  it('returns false when kind is undefined', () => {
    const mw = {} as Parameters<typeof isChatWindow>[0];
    expect(isChatWindow(mw)).toBe(false);
  });
});
