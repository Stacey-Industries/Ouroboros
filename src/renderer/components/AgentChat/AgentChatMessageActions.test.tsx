/**
 * @vitest-environment jsdom
 *
 * AgentChatMessageActions — smoke tests for Wave 32 Phase E.
 *
 * Covers:
 *   UserMessageActions:
 *     1. Desktop: renders hover toolbar (opacity-0 group-hover wrapper), not ⋯ button.
 *     2. Phone: renders MobileOverflowMenu (⋯ button), not the hover toolbar.
 *     3. Phone: Retry action absent when thread is busy.
 *
 *   AssistantMessageActions:
 *     4. Desktop: renders hover toolbar.
 *     5. Phone: renders MobileOverflowMenu.
 *     6. Phone: Revert / Rewind actions present when snapshot / checkpoint exist.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: vi.fn(),
}));

// RerunMenu is a complex component with IPC deps — stub it out.
vi.mock('./RerunMenu', () => ({
  RerunMenu: () => null,
}));

import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import {
  AssistantMessageActions,
  UserMessageActions,
} from './AgentChatMessageActions';

const mockBreakpoint = useViewportBreakpoint as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Minimal message stubs ─────────────────────────────────────────────────────

function makeUserMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'user',
    content: 'Hello',
    createdAt: Date.now(),
    reactions: [],
    ...overrides,
  } as Parameters<typeof UserMessageActions>[0]['message'];
}

function makeAssistantMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-2',
    threadId: 'thread-1',
    role: 'assistant',
    content: 'Hi there',
    createdAt: Date.now(),
    reactions: [],
    ...overrides,
  } as Parameters<typeof AssistantMessageActions>[0]['message'];
}

const noop = () => { /* noop */ };

// ── UserMessageActions ────────────────────────────────────────────────────────

describe('UserMessageActions', () => {
  it('desktop: renders hover toolbar div, not ⋯ button', () => {
    mockBreakpoint.mockReturnValue('desktop');
    const { container } = render(
      <UserMessageActions
        message={makeUserMsg()}
        isLastUserMessage={true}
        threadStatus="idle"
        onEdit={noop}
        onRetry={noop}
        onBranch={noop}
      />,
    );
    // Hover wrapper has opacity-0 class
    expect(container.querySelector('.opacity-0')).not.toBeNull();
    // No ⋯ overflow button
    expect(
      container.querySelector('button[aria-label="More actions"]'),
    ).toBeNull();
  });

  it('phone: renders ⋯ overflow button, not hover toolbar', () => {
    mockBreakpoint.mockReturnValue('phone');
    const { container } = render(
      <UserMessageActions
        message={makeUserMsg()}
        isLastUserMessage={true}
        threadStatus="idle"
        onEdit={noop}
        onRetry={noop}
        onBranch={noop}
      />,
    );
    expect(
      container.querySelector('button[aria-label="More actions"]'),
    ).not.toBeNull();
    expect(container.querySelector('.opacity-0')).toBeNull();
  });

  it('phone: Retry absent when thread is busy', async () => {
    mockBreakpoint.mockReturnValue('phone');
    const { container } = render(
      <UserMessageActions
        message={makeUserMsg()}
        isLastUserMessage={true}
        threadStatus="running"
        onEdit={noop}
        onRetry={noop}
        onBranch={noop}
      />,
    );
    const trigger = container.querySelector(
      'button[aria-label="More actions"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    await waitFor(() => screen.getByRole('menu'));
    expect(screen.queryByRole('menuitem', { name: /retry/i })).toBeNull();
  });
});

// ── AssistantMessageActions ───────────────────────────────────────────────────

describe('AssistantMessageActions', () => {
  it('desktop: renders hover toolbar div', () => {
    mockBreakpoint.mockReturnValue('desktop');
    const { container } = render(
      <AssistantMessageActions
        message={makeAssistantMsg()}
        onBranch={noop}
      />,
    );
    expect(container.querySelector('.opacity-0')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="More actions"]'),
    ).toBeNull();
  });

  it('phone: renders ⋯ overflow button', () => {
    mockBreakpoint.mockReturnValue('phone');
    const { container } = render(
      <AssistantMessageActions
        message={makeAssistantMsg()}
        onBranch={noop}
      />,
    );
    expect(
      container.querySelector('button[aria-label="More actions"]'),
    ).not.toBeNull();
  });

  it('phone: Revert action present when snapshot exists', async () => {
    mockBreakpoint.mockReturnValue('phone');
    const msg = makeAssistantMsg({
      orchestration: { preSnapshotHash: 'abc123' },
    });
    const onRevert = vi.fn();
    const { container } = render(
      <AssistantMessageActions
        message={msg}
        onBranch={noop}
        onRevert={onRevert}
      />,
    );
    const trigger = container.querySelector(
      'button[aria-label="More actions"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    await waitFor(() => screen.getByRole('menu'));
    const revertItem = screen.getByRole('menuitem', { name: /revert/i });
    fireEvent.click(revertItem);
    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});
