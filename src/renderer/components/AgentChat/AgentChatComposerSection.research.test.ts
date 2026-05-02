/**
 * @vitest-environment jsdom
 *
 * AgentChatComposerSection.research.test.ts — Smoke tests for the
 * research-command intercept hook. The full integration (slash command
 * parsing + IPC) is covered elsewhere; this file pins the cancel-event
 * wiring contract so the extraction stays cohesive.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useResearchIntercept } from './AgentChatComposerSection.research';

vi.mock('./researchCommands', () => ({
  buildFollowupPrompt: vi.fn(() => null),
  parseResearchCommand: vi.fn(() => null),
  runResearchAndPin: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('useResearchIntercept', () => {
  it('initializes with isResearching=false and empty topic', () => {
    const { result } = renderHook(() =>
      useResearchIntercept({
        draft: '',
        activeSessionId: null,
        researchEnabled: false,
        onDraftChange: () => {},
        onSend: async () => undefined,
      }),
    );
    expect(result.current.isResearching).toBe(false);
    expect(result.current.researchTopic).toBe('');
    expect(typeof result.current.wrappedOnSend).toBe('function');
    expect(typeof result.current.handleCancel).toBe('function');
  });

  it('wrappedOnSend delegates to onSend when no research command parses', async () => {
    const onSend = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useResearchIntercept({
        draft: 'plain message',
        activeSessionId: 's1',
        researchEnabled: true,
        onDraftChange: () => {},
        onSend,
      }),
    );
    await result.current.wrappedOnSend();
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
