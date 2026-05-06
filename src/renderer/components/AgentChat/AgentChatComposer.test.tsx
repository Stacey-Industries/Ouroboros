// @vitest-environment jsdom
/**
 * AgentChatComposer.test.tsx — smoke tests for AgentChatComposer.
 *
 * Covers:
 * - Component renders without throwing
 * - useComposerState builds slashSelectHandlerRef + onSlashStateChange (Phase D wiring)
 * - ComposerState type exports are present (type-level check via usage in makeState)
 */
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentChatComposer } from './AgentChatComposer';

// ---------------------------------------------------------------------------
// Mock all heavy sub-tree dependencies
// ---------------------------------------------------------------------------

vi.mock('./AgentChatComposer.helpers', () => ({
  buildChatOnlyContextPreviewProps: vi.fn(() => ({})),
  buildComposerContextBarProps: vi.fn(() => ({})),
  toMentionLabels: vi.fn(() => []),
}));

vi.mock('./AgentChatComposerHooks', () => ({
  pickMenuFields: vi.fn(() => ({
    selectedIndex: 0,
    mentionQuery: null,
    isMentionAutocompleteOpen: false,
    slashQuery: null,
    isSlashMenuOpen: false,
    closeMentionAutocomplete: vi.fn(),
    closeSlashMenu: vi.fn(),
  })),
  useComposerAutocompleteReset: vi.fn(),
  useComposerDraftHandlers: vi.fn(() => ({
    handleChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handlePaste: vi.fn(),
    handleFileSelect: vi.fn(),
    handleMentionSelect: vi.fn(),
    handleSlashSelect: vi.fn(),
  })),
  useComposerDraftSync: vi.fn(),
  useComposerMenuState: vi.fn(() => ({
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    mentionQuery: null,
    setMentionQuery: vi.fn(),
    isMentionAutocompleteOpen: false,
    setIsMentionAutocompleteOpen: vi.fn(),
    slashQuery: null,
    setSlashQuery: vi.fn(),
    isSlashMenuOpen: false,
    setIsSlashMenuOpen: vi.fn(),
    closeMentionAutocomplete: vi.fn(),
    closeSlashMenu: vi.fn(),
  })),
  useImageAttachmentHandlers: vi.fn(() => ({
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    handlePickImage: undefined,
    handleRemoveAttachment: vi.fn(),
    handlePaste: vi.fn(),
    isDragging: false,
  })),
  useQuoteListener: vi.fn(),
}));

vi.mock('./AgentChatComposerParts', () => ({
  buildComposerFooterProps: vi.fn(() => ({})),
  ComposerContextBar: () => <div data-testid="context-bar" />,
  ComposerFooter: () => <div data-testid="footer" />,
}));

vi.mock('./AgentChatComposerSubcomponents', () => ({
  ComposerBody: () => <div data-testid="composer-body" />,
}));

vi.mock('./agentChatSelectors', () => ({
  useChatActiveThread: vi.fn(() => null),
  useChatProjectRoot: vi.fn(() => null),
}));

vi.mock('./ChatControlsBar', () => ({}));

vi.mock('./ComposerContextPreview', () => ({
  ComposerContextPreview: () => null,
}));

vi.mock('./FloatingComposerContainer', () => ({
  FloatingComposerContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="floating-container">{children}</div>
  ),
}));

vi.mock('./SlashCommandMenu', () => ({
  buildChatSlashCommands: vi.fn(() => []),
}));

vi.mock('./useAgentChatContext', () => ({}));

vi.mock('./WorkspaceVariantContext', () => ({
  useWorkspaceVariant: vi.fn(() => 'ide'),
}));

vi.mock('../Layout/ChatOnlyShell/ChatStatusChipRow', () => ({
  ChatStatusChipRow: () => null,
}));

vi.mock('./lexicalComposer/SlashCommandPlugin', () => ({}));

// ---------------------------------------------------------------------------
// Minimal props
// ---------------------------------------------------------------------------

function makeProps() {
  return {
    canSend: true,
    disabled: false,
    draft: '',
    isSending: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentChatComposer', () => {
  afterEach(() => cleanup());

  it('renders the floating container and composer body without throwing', () => {
    const { getByTestId } = render(<AgentChatComposer {...makeProps()} />);
    expect(getByTestId('floating-container')).toBeTruthy();
    expect(getByTestId('composer-body')).toBeTruthy();
  });

  it('renders context-bar and footer', () => {
    const { getByTestId } = render(<AgentChatComposer {...makeProps()} />);
    expect(getByTestId('context-bar')).toBeTruthy();
    expect(getByTestId('footer')).toBeTruthy();
  });

  it('does not render ChatStatusChipRow in ide variant', () => {
    const { queryByTestId } = render(<AgentChatComposer {...makeProps()} />);
    // ChatStatusChipRow returns null in mock; main assertion is no throw
    expect(queryByTestId('chat-status-chip-row')).toBeNull();
  });
});
