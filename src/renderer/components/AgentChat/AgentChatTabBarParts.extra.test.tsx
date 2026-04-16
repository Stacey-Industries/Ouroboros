/**
 * AgentChatTabBarParts.extra.test.tsx — Wave 23 Phase B (lint refactor)
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { OpenInTerminalButton, resolveRootThread } from './AgentChatTabBarParts.extra';

afterEach(cleanup);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    id: 'thread-1',
    title: 'Thread 1',
    version: 1,
    workspaceRoot: '/project',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    messages: [],
    ...overrides,
  } as AgentChatThreadRecord;
}

// ── resolveRootThread ─────────────────────────────────────────────────────────

describe('resolveRootThread', () => {
  it('returns null when threads is empty and activeThreadId is null', () => {
    expect(resolveRootThread([], null)).toBeNull();
  });

  it('returns first thread when activeThreadId is null', () => {
    const threads = [makeThread({ id: 'a' }), makeThread({ id: 'b' })];
    expect(resolveRootThread(threads, null)?.id).toBe('a');
  });

  it('returns the thread itself when it has no parentThreadId', () => {
    const threads = [makeThread({ id: 'root' })];
    expect(resolveRootThread(threads, 'root')?.id).toBe('root');
  });

  it('walks up the parent chain to find the root', () => {
    const threads = [
      makeThread({ id: 'root' }),
      makeThread({ id: 'child', parentThreadId: 'root' }),
      makeThread({ id: 'grandchild', parentThreadId: 'child' }),
    ];
    expect(resolveRootThread(threads, 'grandchild')?.id).toBe('root');
  });

  it('returns the deepest reachable ancestor when a parent is missing', () => {
    const threads = [
      makeThread({ id: 'child', parentThreadId: 'missing-parent' }),
    ];
    expect(resolveRootThread(threads, 'child')?.id).toBe('child');
  });
});

// ── OpenInTerminalButton ──────────────────────────────────────────────────────

describe('OpenInTerminalButton', () => {
  beforeEach(() => {
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when sessionId is null', () => {
    const { container } = render(
      <OpenInTerminalButton
        linkedSession={{ provider: null, sessionId: null }}
        threadModel={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the Terminal button when sessionId is set', () => {
    render(
      <OpenInTerminalButton
        linkedSession={{ provider: 'claude-code', sessionId: 'sess-123' }}
        threadModel={null}
      />,
    );
    expect(screen.getByTitle('Resume this chat session in an interactive terminal')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
  });

  it('dispatches open-in-terminal event with correct detail on click', () => {
    render(
      <OpenInTerminalButton
        linkedSession={{ provider: 'claude-code', sessionId: 'sess-123' }}
        threadModel="claude-sonnet-4-5"
      />,
    );
    fireEvent.click(screen.getByText('Terminal'));
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
    const event = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.detail.sessionId).toBe('sess-123');
    expect(event.detail.provider).toBe('claude-code');
    expect(event.detail.model).toBe('claude-sonnet-4-5');
  });
});
