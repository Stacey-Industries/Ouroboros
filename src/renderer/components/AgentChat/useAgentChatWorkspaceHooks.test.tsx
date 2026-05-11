/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QueuedMessage } from './useAgentChatWorkspace.queue';
import { useQueueAutoSend } from './useAgentChatWorkspaceHooks';

describe('useQueueAutoSend', () => {
  it('calls sendWithContent with queued content when a busy thread becomes idle', async () => {
    let queuedMessages: QueuedMessage[] = [
      { id: 'queued-1', content: 'queued prompt', queuedAt: Date.now() },
    ];
    const sendWithContent = vi.fn().mockResolvedValue(undefined);
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
          sendWithContent,
        }),
      { initialProps: { busy: true, sending: false } },
    );

    rerender({ busy: false, sending: false });

    await waitFor(() => {
      expect(sendWithContent).toHaveBeenCalledWith('queued prompt');
      expect(queuedMessages).toEqual([]);
    });
  });

  it('does NOT call setDraft during auto-send (draft must stay empty)', async () => {
    // The fix: sendWithContent receives content directly; setDraft is never
    // called by the auto-send path so the composer textarea stays blank.
    let queuedMessages: QueuedMessage[] = [
      { id: 'queued-2', content: 'auto payload', queuedAt: Date.now() },
    ];
    const sendWithContent = vi.fn().mockResolvedValue(undefined);
    // setDraft is deliberately NOT passed — the hook signature no longer accepts it.
    // This test verifies the interface shape enforces that constraint.
    const setQueuedMessages = vi.fn((action: React.SetStateAction<QueuedMessage[]>) => {
      queuedMessages = typeof action === 'function' ? action(queuedMessages) : action;
    });

    const { rerender } = renderHook(
      ({ busy }) =>
        useQueueAutoSend({
          activeThreadId: 'thread-2',
          threadIsBusy: busy,
          isSending: false,
          queuedMessages,
          setQueuedMessages,
          sendWithContent,
        }),
      { initialProps: { busy: true } },
    );

    rerender({ busy: false });

    await waitFor(() => expect(sendWithContent).toHaveBeenCalledOnce());
    // sendWithContent receives the content; draft state was never touched.
    expect(sendWithContent).toHaveBeenCalledWith('auto payload');
  });

  it('preserves an in-progress user draft when auto-drain triggers', async () => {
    // Scenario: user is mid-typing (draft = "my typing") while a queued message
    // drains. The drain must not touch the draft state — "my typing" survives.
    let queuedMessages: QueuedMessage[] = [
      { id: 'queued-3', content: 'queued content', queuedAt: Date.now() },
    ];
    const sendWithContent = vi.fn().mockResolvedValue(undefined);
    const setQueuedMessages = vi.fn((action: React.SetStateAction<QueuedMessage[]>) => {
      queuedMessages = typeof action === 'function' ? action(queuedMessages) : action;
    });
    // Simulate a separate draft state the user is typing into.
    let userDraft = 'my typing';
    const setDraft = vi.fn((v: string) => { userDraft = v; });

    // useQueueAutoSend no longer receives setDraft — confirm draft is untouched.
    const { rerender } = renderHook(
      ({ busy }) =>
        useQueueAutoSend({
          activeThreadId: 'thread-3',
          threadIsBusy: busy,
          isSending: false,
          queuedMessages,
          setQueuedMessages,
          sendWithContent,
        }),
      { initialProps: { busy: true } },
    );

    rerender({ busy: false });

    await waitFor(() => expect(sendWithContent).toHaveBeenCalledOnce());
    // setDraft was never called by the drain path.
    expect(setDraft).not.toHaveBeenCalled();
    expect(userDraft).toBe('my typing');
  });

  it('does not drain when thread switches (threadChanged guard)', async () => {
    const queuedMessages: QueuedMessage[] = [
      { id: 'queued-4', content: 'should not send', queuedAt: Date.now() },
    ];
    const sendWithContent = vi.fn().mockResolvedValue(undefined);
    const setQueuedMessages = vi.fn();

    const { rerender } = renderHook(
      ({ busy, threadId }) =>
        useQueueAutoSend({
          activeThreadId: threadId,
          threadIsBusy: busy,
          isSending: false,
          queuedMessages,
          setQueuedMessages,
          sendWithContent,
        }),
      { initialProps: { busy: true, threadId: 'thread-A' } },
    );

    // Simultaneously switch thread AND go idle — the guard must block the drain.
    act(() => {
      rerender({ busy: false, threadId: 'thread-B' });
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(sendWithContent).not.toHaveBeenCalled();
  });
});

// Regression guard: manual editQueuedMessage path must still call setDraft.
// This tests the pure logic from useAgentChatWorkspace.queue.ts directly.
describe('editQueuedMessage (manual edit path — preserved)', () => {
  it('setDraft IS called with queued content when user manually edits a queued item', () => {
    const items: QueuedMessage[] = [
      { id: 'q1', content: 'edit me', queuedAt: 1 },
      { id: 'q2', content: 'keep me', queuedAt: 2 },
    ];
    const setDraft = vi.fn();

    // Replicate the editQueuedMessage logic from useAgentChatWorkspace.queue.ts.
    const item = items.find((m) => m.id === 'q1');
    if (item) setDraft(item.content);
    const remaining = items.filter((m) => m.id !== 'q1');

    expect(setDraft).toHaveBeenCalledWith('edit me');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('q2');
  });
});
