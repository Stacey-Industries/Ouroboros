/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';

import type { MentionItem } from './MentionAutocomplete';
import { selectComposerMention } from './AgentChatComposerSupport';

function makeTextarea(value: string, cursor: number): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setSelectionRange(cursor, cursor);
  return textarea;
}

describe('selectComposerMention', () => {
  it('records the selected mention and avoids double-@ insertion for special mentions', () => {
    const textarea = makeTextarea('@cod', 4);
    const onChange = vi.fn();
    const onAddMention = vi.fn();
    const mention: MentionItem = {
      type: 'codebase',
      key: '@codebase',
      label: 'codebase',
      path: '@codebase',
      estimatedTokens: 1000,
    };

    selectComposerMention(
      {
        textareaRef: { current: textarea },
        lastSyncedDraft: { current: textarea.value },
        onChange,
        onAddMention,
        setMentionQuery: vi.fn(),
        setIsMentionAutocompleteOpen: vi.fn(),
      },
      mention,
    );

    expect(onChange).toHaveBeenCalledWith('@codebase ');
    expect(onAddMention).toHaveBeenCalledWith(mention);
    expect(textarea.value).toBe('@codebase ');
  });
});
