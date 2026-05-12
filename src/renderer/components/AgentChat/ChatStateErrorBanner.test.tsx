/**
 * @vitest-environment jsdom
 *
 * ChatStateErrorBanner.test.tsx — Unit tests for the Phase 5 hard-fail banner.
 *
 * Tests:
 *   - renders nothing when threadId is null
 *   - renders nothing before any error fires
 *   - shows error kind and message when onError fires
 *   - "Restart Chat Session" button calls restartSession IPC and clears banner
 *   - "Copy Trace" button writes full error JSON to clipboard
 */

import type { ChatStateErrorPayload } from '@shared/types/chatStateError';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatStateErrorBanner } from './ChatStateErrorBanner';

// ─── Mock API factory ─────────────────────────────────────────────────────────

type OnErrorCb = (err: ChatStateErrorPayload) => void;

function makeMockApi(opts: { restartSuccess?: boolean } = {}) {
  let registeredCb: OnErrorCb | null = null;

  const restartSession = vi.fn().mockResolvedValue({ success: opts.restartSuccess ?? true });

  const onError = vi.fn((_threadId: string, cb: OnErrorCb) => {
    registeredCb = cb;
    return () => {
      registeredCb = null;
    };
  });

  function emitError(err: ChatStateErrorPayload) {
    registeredCb?.(err);
  }

  return { onError, restartSession, emitError };
}

const SAMPLE_ERROR: ChatStateErrorPayload = {
  kind: 'unknown-thread',
  message: 'ChatStateBroadcaster.snapshot: unknown threadId t-abc',
  details: { threadId: 't-abc' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatStateErrorBanner', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function mountWithApi(api: ReturnType<typeof makeMockApi>, threadId: string | null) {
    Object.defineProperty(window, 'electronAPI', {
      value: { chatStateNewPath: api },
      configurable: true,
      writable: true,
    });
    return render(<ChatStateErrorBanner threadId={threadId} />);
  }

  beforeEach(() => {
    // Reset electronAPI between tests
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('renders nothing when threadId is null', () => {
    const api = makeMockApi();
    const { container } = mountWithApi(api, null);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing before any error fires', () => {
    const api = makeMockApi();
    const { container } = mountWithApi(api, 't-abc');
    expect(container.firstChild).toBeNull();
  });

  it('shows error kind and message when onError fires', async () => {
    const api = makeMockApi();
    mountWithApi(api, 't-abc');

    act(() => api.emitError(SAMPLE_ERROR));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/unknown-thread/)).toBeDefined();
    expect(screen.getByText(/unknown threadId t-abc/)).toBeDefined();
  });

  it('calls restartSession and clears banner on Restart click', async () => {
    const api = makeMockApi();
    mountWithApi(api, 't-abc');

    act(() => api.emitError(SAMPLE_ERROR));
    expect(await screen.findByRole('alert')).toBeDefined();

    const restartBtn = screen.getByRole('button', { name: /restart chat session/i });
    await act(async () => {
      fireEvent.click(restartBtn);
      await Promise.resolve(); // settle restartSession promise
    });

    expect(api.restartSession).toHaveBeenCalledWith('t-abc');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('copies full error JSON to clipboard on Copy Trace click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const api = makeMockApi();
    mountWithApi(api, 't-abc');

    act(() => api.emitError(SAMPLE_ERROR));
    expect(await screen.findByRole('alert')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /copy trace/i }));

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(SAMPLE_ERROR, null, 2));
  });
});
