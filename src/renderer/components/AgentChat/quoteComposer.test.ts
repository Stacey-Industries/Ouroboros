/**
 * quoteComposer.test.ts
 * @vitest-environment jsdom
 *
 * Tests for buildQuoteText and dispatchQuoteEvent.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildQuoteText,
  dispatchQuoteEvent,
  QUOTE_EVENT_NAME,
} from './quoteComposer';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── buildQuoteText ────────────────────────────────────────────────────────────

describe('buildQuoteText', () => {
  it('prefixes each line of selected text with > ', () => {
    const result = buildQuoteText('hello\nworld', { role: 'assistant' });
    expect(result).toContain('> hello');
    expect(result).toContain('> world');
  });

  it('includes attribution on the first line', () => {
    const result = buildQuoteText('text', { role: 'assistant' });
    expect(result).toMatch(/^> \[assistant/);
  });

  it('includes user role label for user messages', () => {
    const result = buildQuoteText('text', { role: 'user' });
    expect(result).toMatch(/> \[you/);
  });

  it('includes formatted date when timestamp provided', () => {
    // Use a fixed epoch: Apr 15 2026 UTC
    const ts = new Date('2026-04-15T12:00:00Z').getTime();
    const result = buildQuoteText('hi', { role: 'assistant', timestamp: ts });
    expect(result).toMatch(/Apr 15, 2026/);
  });

  it('omits date when timestamp is undefined', () => {
    const result = buildQuoteText('hi', { role: 'assistant' });
    expect(result).not.toMatch(/\d{4}/);
    expect(result).toContain('[assistant]');
  });

  it('appends a trailing blank line so cursor lands after the quote', () => {
    const result = buildQuoteText('line', { role: 'assistant' });
    expect(result.endsWith('\n\n')).toBe(true);
  });

  it('handles single-line selections without splitting', () => {
    const result = buildQuoteText('single line', { role: 'user' });
    const contentLines = result.split('\n').filter((l) => l.startsWith('> single'));
    expect(contentLines).toHaveLength(1);
  });

  it('handles multi-line selections preserving order', () => {
    const result = buildQuoteText('a\nb\nc', { role: 'assistant' });
    const idx = (s: string): number => result.indexOf(s);
    expect(idx('> a')).toBeLessThan(idx('> b'));
    expect(idx('> b')).toBeLessThan(idx('> c'));
  });
});

// ── dispatchQuoteEvent ────────────────────────────────────────────────────────

describe('dispatchQuoteEvent', () => {
  it('dispatches agent-ide:quote-to-composer on window', () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener(QUOTE_EVENT_NAME, handler);

    dispatchQuoteEvent('hello quote');

    window.removeEventListener(QUOTE_EVENT_NAME, handler);
    expect(received).toHaveLength(1);
    expect((received[0] as CustomEvent<{ text: string }>).detail.text).toBe('hello quote');
  });

  it('passes the text verbatim in event detail', () => {
    let detail: { text: string } | null = null;
    const handler = (e: Event): void => {
      detail = (e as CustomEvent<{ text: string }>).detail;
    };
    window.addEventListener(QUOTE_EVENT_NAME, handler);

    const text = '> nested blockquote\nwith newlines';
    dispatchQuoteEvent(text);

    window.removeEventListener(QUOTE_EVENT_NAME, handler);
    expect((detail as { text: string } | null)?.text).toBe(text);
  });
});
