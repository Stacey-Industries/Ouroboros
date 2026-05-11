// @vitest-environment jsdom
/**
 * Wave86SmokeHarness.test.tsx — gating + send-trigger smoke tests for the
 * Phase 1 walking-skeleton debug surface.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock window.electronAPI ──────────────────────────────────────────────────

const mockSendMessage = vi.fn();
const mockRequestSnapshot = vi.fn(() => Promise.resolve(null));
const mockOnStateDiff = vi.fn(() => vi.fn());

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    chatStateNewPath: {
      sendMessage: mockSendMessage,
      requestSnapshot: mockRequestSnapshot,
      onStateDiff: mockOnStateDiff,
    },
  },
});

// ─── Mock useConfig ───────────────────────────────────────────────────────────

const mockConfig = {
  current: { agentChatSettings: { chatOrchestration: { useNewStateMachine: true } } },
};

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({ config: mockConfig.current }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { Wave86SmokeHarness } from './Wave86SmokeHarness';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setFlag(on: boolean): void {
  mockConfig.current = on
    ? { agentChatSettings: { chatOrchestration: { useNewStateMachine: true } } }
    : ({} as never);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Wave86SmokeHarness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnStateDiff.mockReturnValue(vi.fn());
    mockSendMessage.mockResolvedValue({ success: true, turnId: 't-fake' });
    setFlag(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when feature flag is off', () => {
    setFlag(false);
    const { container } = render(<Wave86SmokeHarness projectRoot="/tmp" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders controls and debug panel when flag is on', () => {
    render(<Wave86SmokeHarness projectRoot="/tmp" />);
    expect(screen.getByText('[wave-86 smoke]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New thread' })).toBeTruthy();
    expect(screen.getByLabelText('smoke message')).toBeTruthy();
  });

  it('Send button dispatches sendMessage with threadId, content, cwd', async () => {
    render(<Wave86SmokeHarness projectRoot="/tmp/proj" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const call = mockSendMessage.mock.calls[0][0];
    expect(call.content).toBe('hello');
    expect(call.cwd).toBe('/tmp/proj');
    expect(call.threadId).toMatch(/^wave86-smoke-/);
  });

  it('surfaces failure status when sendMessage rejects', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('boom'));
    render(<Wave86SmokeHarness projectRoot="/tmp" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it('surfaces failure when projectRoot is null', async () => {
    render(<Wave86SmokeHarness projectRoot={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/no projectRoot/)).toBeTruthy();
  });

  it('New thread button cycles to a different threadId', async () => {
    render(<Wave86SmokeHarness projectRoot="/tmp" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    const firstThreadId = mockSendMessage.mock.calls[0][0].threadId;
    mockSendMessage.mockClear();
    // Wait at least 1ms so Date.now()-based id differs.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2));
      fireEvent.click(screen.getByRole('button', { name: 'New thread' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });
    const secondThreadId = mockSendMessage.mock.calls[0][0].threadId;
    expect(secondThreadId).not.toBe(firstThreadId);
  });
});
