import { describe, expect, it } from 'vitest';

import { isComposerMentionHighlight, tokenizeComposerHighlights } from './AgentChatComposerInput';
import { extractMentionQuery, extractSlashQuery } from './AgentChatComposerParts';
import { buildMentionInsertion } from './AgentChatComposerSupport';

describe('extractMentionQuery', () => {
  it('keeps bare @ open for mention selection', () => {
    expect(extractMentionQuery('@', 1)).toBe('');
  });

  it('closes mention mode when whitespace immediately follows @', () => {
    expect(extractMentionQuery('@ hello', 7)).toBeNull();
  });

  it('closes mention mode once the trigger query spans a whitespace boundary', () => {
    // Otherwise the dropdown stays open forever after a completed mention like
    // "@codebase hello" — treating "codebase hello" as a live query and
    // re-searching on every keystroke.
    expect(extractMentionQuery('@codebase hello', 15)).toBeNull();
  });

  it('returns query text when cursor is inside an open bracketed trigger', () => {
    // "@[my fold" with cursor at 9 — user is still typing inside brackets.
    expect(extractMentionQuery('@[my fold', 9)).toBe('my fold');
  });

  it('returns empty string when cursor is right after @[', () => {
    expect(extractMentionQuery('@[', 2)).toBe('');
  });

  it('returns null when a bracketed mention is complete (closing ] before cursor)', () => {
    // "@[my folder]" — the ']' is at index 11, cursor at 12. Trigger closed.
    expect(extractMentionQuery('@[my folder]', 12)).toBeNull();
  });

  it('returns null for completed bracketed mention followed by prose', () => {
    expect(extractMentionQuery('@[my folder] rest', 17)).toBeNull();
  });
});

describe('isComposerMentionHighlight', () => {
  it('does not highlight text after a bare @ followed by space', () => {
    expect(isComposerMentionHighlight('@ hello there')).toBe(false);
  });

  it('still highlights actual mention text', () => {
    expect(isComposerMentionHighlight('@src/file.ts')).toBe(true);
  });

  it('highlights a bracketed mention with spaces', () => {
    expect(isComposerMentionHighlight('@[foo bar]')).toBe(true);
  });

  it('highlights a bracketed mention with leading space inside brackets', () => {
    expect(isComposerMentionHighlight('@[ foo]')).toBe(true);
  });

  it('does not highlight an unclosed bracketed mention', () => {
    // Without the closing ']', this is not a complete token.
    expect(isComposerMentionHighlight('@[foo bar')).toBe(false);
  });
});

describe('tokenizeComposerHighlights', () => {
  it('stops mention highlighting at the first whitespace boundary', () => {
    expect(tokenizeComposerHighlights('@codebase explain this')).toEqual([
      '',
      '@codebase',
      ' explain this',
    ]);
  });

  it('treats a complete bracketed mention as a single token', () => {
    expect(tokenizeComposerHighlights('@[src/My Folder/x.ts] explain')).toEqual([
      '',
      '@[src/My Folder/x.ts]',
      ' explain',
    ]);
  });
});

describe('buildMentionInsertion', () => {
  it('does not double-prefix special mentions that already include @', () => {
    expect(buildMentionInsertion('@codebase')).toBe('@codebase ');
  });

  it('still prefixes regular file mentions', () => {
    expect(buildMentionInsertion('src/file.ts')).toBe('@src/file.ts ');
  });

  it('uses bracketed syntax for paths containing spaces', () => {
    expect(buildMentionInsertion('src/My Folder/file.ts')).toBe('@[src/My Folder/file.ts] ');
  });

  it('uses bracketed syntax for paths with spaces even when path starts with @', () => {
    // e.g. a special mention whose path contains a space
    expect(buildMentionInsertion('@my folder')).toBe('@[my folder] ');
  });
});

describe('extractSlashQuery', () => {
  it('keeps a bare slash open for command selection', () => {
    expect(extractSlashQuery('/', 1)).toBe('');
  });

  it('closes slash mode after the first space', () => {
    expect(extractSlashQuery('/remember this', 14)).toBeNull();
  });
});
