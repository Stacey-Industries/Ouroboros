/**
 * AgentChatComposer.helpers.test.ts — Smoke tests for the prop builders.
 */
import { describe, expect, it } from 'vitest';

import { buildChatOnlyContextPreviewProps, toMentionLabels } from './AgentChatComposer.helpers';

describe('toMentionLabels', () => {
  it('returns empty when mentions is undefined', () => {
    expect(toMentionLabels(undefined)).toEqual([]);
  });
  it('maps each mention to its label + estimatedTokens', () => {
    const mentions = [{ key: 'a', label: 'foo.ts', estimatedTokens: 12 }] as never;
    expect(toMentionLabels(mentions)).toEqual([{ label: 'foo.ts', estimatedTokens: 12 }]);
  });
});

describe('buildChatOnlyContextPreviewProps', () => {
  it('threads disabledLocalIds and setDisabledLocalIds through to the popover prop bag', () => {
    const setIds = (): void => undefined;
    const composerProps = {
      pinnedFiles: [],
      mentions: undefined,
      disabledLocalIds: new Set(['file:/x.ts']),
      setDisabledLocalIds: setIds,
    } as never;
    const props = buildChatOnlyContextPreviewProps({
      composerProps,
      chatOverrides: undefined,
      settingsModel: undefined,
      claudeSessionId: undefined,
      mentionLabels: [],
    });
    expect(props.disabledLocalIds?.has('file:/x.ts')).toBe(true);
    expect(props.setDisabledLocalIds).toBe(setIds);
  });
});
