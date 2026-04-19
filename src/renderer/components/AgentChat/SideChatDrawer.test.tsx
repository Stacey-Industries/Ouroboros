/**
 * SideChatDrawer.test.tsx — Wave 23 Phase C
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SideChatDrawer } from './SideChatDrawer';

// Wave 41 E.4 — AgentChatConversation requires AgentEventsProvider context; mock
// it in unit tests for SideChatDrawer which only exercises the tab/header UI.
vi.mock('./AgentChatConversation', () => ({
  AgentChatConversation: () => <div data-testid="agent-chat-conversation" />,
}));

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultProps(overrides: Partial<React.ComponentProps<typeof SideChatDrawer>> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    sideChats: [],
    activeSideChatId: null,
    onSelect: vi.fn(),
    onCloseTab: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SideChatDrawer', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<SideChatDrawer {...defaultProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the drawer dialog when open', () => {
    render(<SideChatDrawer {...defaultProps()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('shows empty state message when open with no side chats', () => {
    render(<SideChatDrawer {...defaultProps()} />);
    expect(screen.getByText(/Ctrl[+];/)).toBeDefined();
  });

  it('renders a tab for each side chat', () => {
    render(
      <SideChatDrawer
        {...defaultProps({
          sideChats: ['side-1', 'side-2'],
          activeSideChatId: 'side-1',
        })}
      />,
    );
    expect(screen.getByText('Side chat 1')).toBeDefined();
    expect(screen.getByText('Side chat 2')).toBeDefined();
  });

  it('calls onSelect when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SideChatDrawer
        {...defaultProps({
          sideChats: ['side-1', 'side-2'],
          activeSideChatId: 'side-1',
          onSelect,
        })}
      />,
    );
    fireEvent.click(screen.getByText('Side chat 2'));
    expect(onSelect).toHaveBeenCalledWith('side-2');
  });

  it('calls onCloseTab when the close button on a tab is clicked', () => {
    const onCloseTab = vi.fn();
    render(
      <SideChatDrawer
        {...defaultProps({
          sideChats: ['side-1'],
          activeSideChatId: 'side-1',
          onCloseTab,
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close Side chat 1'));
    expect(onCloseTab).toHaveBeenCalledWith('side-1');
  });

  it('calls onClose when the header close button is clicked', () => {
    const onClose = vi.fn();
    render(<SideChatDrawer {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByLabelText('Close side chat drawer'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<SideChatDrawer {...defaultProps({ onClose })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    render(<SideChatDrawer {...defaultProps({ onClose })} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<SideChatDrawer {...defaultProps({ onClose })} />);
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
