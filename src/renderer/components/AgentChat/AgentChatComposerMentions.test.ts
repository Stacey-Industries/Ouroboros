import { describe, expect, it } from 'vitest';

import { isComposerMentionHighlight } from './AgentChatComposerInput';
import { extractMentionQuery } from './AgentChatComposerParts';

describe('extractMentionQuery', () => {
  it('keeps bare @ open for mention selection', () => {
    expect(extractMentionQuery('@', 1)).toBe('');
  });

  it('closes mention mode when whitespace immediately follows @', () => {
    expect(extractMentionQuery('@ hello', 7)).toBeNull();
  });

  it('still allows spaces later in a typed path', () => {
    expect(extractMentionQuery('@src/My Folder', 14)).toBe('src/My Folder');
  });
});

describe('isComposerMentionHighlight', () => {
  it('does not highlight text after a bare @ followed by space', () => {
    expect(isComposerMentionHighlight('@ hello there')).toBe(false);
  });

  it('still highlights actual mention text', () => {
    expect(isComposerMentionHighlight('@src/file.ts')).toBe(true);
  });
});
