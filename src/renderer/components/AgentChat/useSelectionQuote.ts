/**
 * useSelectionQuote.ts — Hook that wires a "Quote" action to the composer.
 *
 * Returns a `quoteMessage` callback. When called it:
 *  1. Reads window.getSelection().toString() if non-empty.
 *  2. Falls back to the full `messageContent` if selection is empty.
 *  3. Builds a blockquote string via buildQuoteText.
 *  4. Dispatches agent-ide:quote-to-composer so the composer appends it.
 */

import { useCallback } from 'react';

import { buildQuoteText, dispatchQuoteEvent, type QuoteAttribution } from './quoteComposer';

export interface UseSelectionQuoteOptions {
  messageContent: string;
  attribution: QuoteAttribution;
}

export interface UseSelectionQuoteResult {
  /** Call this when the user clicks the Quote button. */
  quoteMessage: () => void;
}

export function useSelectionQuote(options: UseSelectionQuoteOptions): UseSelectionQuoteResult {
  const { messageContent, attribution } = options;

  const quoteMessage = useCallback(() => {
    const selected = window.getSelection()?.toString().trim() ?? '';
    const source = selected.length > 0 ? selected : messageContent;
    const quoteText = buildQuoteText(source, attribution);
    dispatchQuoteEvent(quoteText);
  }, [messageContent, attribution]);

  return { quoteMessage };
}
