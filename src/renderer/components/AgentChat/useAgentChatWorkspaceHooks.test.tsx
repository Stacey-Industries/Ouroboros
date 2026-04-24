/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QueuedMessage } from './useAgentChatWorkspace.queue';
import { useQueueAutoSend } from './useAgentChatWorkspaceHooks';

describe('useQueueAutoSend', () => {
  it('auto-sends the restored queued draft when a busy thread becomes idle', async () => {
    let queuedMessages: QueuedMessage[] = [
      { id: 'queued-1', content: 'queued prompt', queuedAt: Date.now() },
    ];
    const setDraft = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const setQueuedMessages = vi.fn((action: React.SetStateAction<QueuedMessage[]>) => {
      queuedMessages = typeof action === 'function' ? action(queuedMessages) : action;
    });

    const { rerender } = renderHook(
      ({ busy, sending }) =>
        useQueueAutoSend({
          activeThreadId: 'thread-1',
          threadIsBusy: busy,
          isSending: sending,
          queuedMessages,
          setQueuedMessages,
          setDraft,
          sendMessage,
        }),
      { initialProps: { busy: true, sending: false } },
    );

    rerender({ busy: false, sending: false });

    await waitFor(() => {
      expect(setDraft).toHaveBeenCalledWith('queued prompt');
      expect(sendMessage).toHaveBeenCalledOnce();
      expect(queuedMessages).toEqual([]);
    });
  });
});
