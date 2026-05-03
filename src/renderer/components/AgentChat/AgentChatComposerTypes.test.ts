/**
 * AgentChatComposerTypes.test.ts — unit tests for the pure-logic helpers
 * extracted to AgentChatComposerTypes.ts.
 *
 * The ComposerInputProps type is structural — no runtime test needed.
 * These tests cover the two exported functions.
 */
import { describe, expect, it } from 'vitest';

import { isComposerMentionHighlight, tokenizeComposerHighlights } from './AgentChatComposerTypes';

describe('isComposerMentionHighlight', () => {
  it('matches a bare @ mention', () => {
    expect(isComposerMentionHighlight('@src/lib/foo.ts')).toBe(true);
  });

  it('matches a bracketed @ mention with spaces', () => {
    expect(isComposerMentionHighlight('@[some file with spaces.ts]')).toBe(true);
  });

  it('matches the @@ double-trigger form', () => {
    expect(isComposerMentionHighlight('@@symbol')).toBe(true);
  });

  it('does not match plain text', () => {
    expect(isComposerMentionHighlight('hello')).toBe(false);
  });

  it('does not match a lone @', () => {
    expect(isComposerMentionHighlight('@')).toBe(false);
  });

  it('does not match a slash command', () => {
    expect(isComposerMentionHighlight('/clear')).toBe(false);
  });
});

describe('tokenizeComposerHighlights', () => {
  it('splits a string containing a bare mention into segments', () => {
    const parts = tokenizeComposerHighlights('hello @src/foo.ts world');
    expect(parts.some((p) => p === '@src/foo.ts')).toBe(true);
  });

  it('splits a string containing a bracketed mention', () => {
    const parts = tokenizeComposerHighlights('see @[my file.ts] for details');
    expect(parts.some((p) => p === '@[my file.ts]')).toBe(true);
  });

  it('splits a string containing a slash command', () => {
    const parts = tokenizeComposerHighlights('/clear now');
    expect(parts.some((p) => p === '/clear')).toBe(true);
  });

  it('returns the original string as one segment when no tokens present', () => {
    const parts = tokenizeComposerHighlights('plain text only');
    expect(parts).toEqual(['plain text only']);
  });

  it('handles an empty string', () => {
    const parts = tokenizeComposerHighlights('');
    expect(parts).toEqual(['']);
  });
});
