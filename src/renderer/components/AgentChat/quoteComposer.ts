/**
 * quoteComposer.ts — Helpers for building blockquote text from message selections.
 *
 * `buildQuoteText` formats a selected (or full) message excerpt as a markdown
 * blockquote with attribution, ready to prepend to the composer draft.
 *
 * `dispatchQuoteEvent` fires the `agent-ide:quote-to-composer` DOM event that
 * AgentChatComposer listens for to append the quote to the current draft.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuoteAttribution {
  role: 'user' | 'assistant';
  timestamp?: number;
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatAttribution(attr: QuoteAttribution): string {
  const roleLabel = attr.role === 'assistant' ? 'assistant' : 'you';
  if (attr.timestamp == null) return roleLabel;
  const d = new Date(attr.timestamp);
  const datePart = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${roleLabel}, ${datePart}`;
}

/**
 * Build a markdown blockquote string from selected text and attribution.
 *
 * Each line of `selectedText` is prefixed with `> `. The attribution appears
 * on the first line in brackets. A blank line is appended so the composer
 * cursor starts after the quote.
 *
 * Example output:
 *   > [assistant, Apr 15 2026]
 *   > First line of selected text
 *   > Second line
 *
 */
export function buildQuoteText(selectedText: string, attribution: QuoteAttribution): string {
  const attrLine = `> [${formatAttribution(attribution)}]`;
  const lines = selectedText
    .split('\n')
    .map((line) => `> ${line}`);
  return [attrLine, ...lines, '', ''].join('\n');
}

// ── DOM event dispatch ────────────────────────────────────────────────────────

export const QUOTE_EVENT_NAME = 'agent-ide:quote-to-composer';

export interface QuoteEventDetail {
  text: string;
}

/**
 * Dispatch the `agent-ide:quote-to-composer` DOM event.
 * AgentChatComposer (or its parent hook) listens for this and appends `text`
 * to the current draft.
 */
export function dispatchQuoteEvent(text: string): void {
  const detail: QuoteEventDetail = { text };
  window.dispatchEvent(new CustomEvent<QuoteEventDetail>(QUOTE_EVENT_NAME, { detail }));
}
