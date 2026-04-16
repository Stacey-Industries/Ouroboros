/**
 * useSelectionQuote.test.ts
 * @vitest-environment jsdom
 *
 * Tests for useSelectionQuote: selection-based quoting, fallback to full
 * message content, and DOM event dispatch.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUOTE_EVENT_NAME } from './quoteComposer';
import { useSelectionQuote } from './useSelectionQuote';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureQuoteEvent(): { events: CustomEvent[]; cleanup: () => void } {
  const events: CustomEvent[] = [];
  const handler = (e: Event): void => { events.push(e as CustomEvent); };
  window.addEventListener(QUOTE_EVENT_NAME, handler);
  return { events, cleanup: () => window.removeEventListener(QUOTE_EVENT_NAME, handler) };
}

function mockSelection(text: string): void {
  vi.spyOn(window, 'getSelection').mockReturnValue({
    toString: () => text,
  } as Selection);
}

// ── Uses window selection when non-empty ──────────────────────────────────────

describe('useSelectionQuote — selected text', () => {
  it('uses selected text when selection is non-empty', () => {
    mockSelection('selected snippet');
    const { events, cleanup } = captureQuoteEvent();

    const { result } = renderHook(() =>
      useSelectionQuote({ messageContent: 'full content', attribution: { role: 'assistant' } }),
    );
    result.current.quoteMessage();

    cleanup();
    expect(events).toHaveLength(1);
    const detail = (events[0] as CustomEvent<{ text: string }>).detail;
    expect(detail.text).toContain('> selected snippet');
    expect(detail.text).not.toContain('full content');
  });

  it('dispatches the blockquote prefixed text', () => {
    mockSelection('some text');
    const { events, cleanup } = captureQuoteEvent();

    const { result } = renderHook(() =>
      useSelectionQuote({ messageContent: 'full', attribution: { role: 'user' } }),
    );
    result.current.quoteMessage();

    cleanup();
    const text = (events[0] as CustomEvent<{ text: string }>).detail.text;
    expect(text).toMatch(/^> \[you/);
    expect(text).toContain('> some text');
  });
});

// ── Falls back to full content when selection is empty ────────────────────────

describe('useSelectionQuote — fallback to full content', () => {
  it('uses full messageContent when selection is empty', () => {
    mockSelection('');
    const { events, cleanup } = captureQuoteEvent();

    const { result } = renderHook(() =>
      useSelectionQuote({ messageContent: 'full message body', attribution: { role: 'assistant' } }),
    );
    result.current.quoteMessage();

    cleanup();
    const text = (events[0] as CustomEvent<{ text: string }>).detail.text;
    expect(text).toContain('> full message body');
  });

  it('uses full content when getSelection returns null', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    const { events, cleanup } = captureQuoteEvent();

    const { result } = renderHook(() =>
      useSelectionQuote({ messageContent: 'fallback text', attribution: { role: 'assistant' } }),
    );
    result.current.quoteMessage();

    cleanup();
    const text = (events[0] as CustomEvent<{ text: string }>).detail.text;
    expect(text).toContain('> fallback text');
  });
});

// ── Attribution forwarding ────────────────────────────────────────────────────

describe('useSelectionQuote — attribution', () => {
  it('includes timestamp in attribution when provided', () => {
    mockSelection('');
    // Midday UTC so local-time display stays on Apr 15 in all UTC±12 timezones
    const ts = new Date('2026-04-15T12:00:00Z').getTime();
    const { events, cleanup } = captureQuoteEvent();

    const { result } = renderHook(() =>
      useSelectionQuote({
        messageContent: 'hi',
        attribution: { role: 'assistant', timestamp: ts },
      }),
    );
    result.current.quoteMessage();

    cleanup();
    const text = (events[0] as CustomEvent<{ text: string }>).detail.text;
    expect(text).toMatch(/Apr 15, 2026/);
  });
});
