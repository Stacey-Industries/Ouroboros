/**
 * AgentChatComposerSubcomponents.test.tsx
 *
 * Smoke tests for the three sub-components extracted in Wave 81 Phase D.
 * These components are thin wrappers that pass props; the tests verify:
 *   - They render without throwing
 *   - ComposerMenusSection routes onSlashSelect to the imperative ref when populated (Lexical path)
 *   - ComposerMenusSection falls through to handlers.handleSlashSelect when ref is null (legacy path)
 */
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import React, { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComposerState } from './AgentChatComposer';
import type { AgentChatComposerProps } from './AgentChatComposer';
import {
  ComposerBody,
  ComposerInputSection,
  ComposerMenusSection,
} from './AgentChatComposerSubcomponents';

// ---------------------------------------------------------------------------
// Minimal stubs — only the fields each component actually reads
// ---------------------------------------------------------------------------

function makeHandlers() {
  return {
    handleFileSelect: vi.fn(),
    handleMentionSelect: vi.fn(),
    handleSlashSelect: vi.fn(),
    handleChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handlePaste: vi.fn(),
  };
}

function makeAttachmentHandlers() {
  return {
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    handlePickImage: vi.fn(),
    handleRemoveAttachment: vi.fn(),
    isDragging: false,
    handlePaste: vi.fn(),
  };
}

function makeState(overrides: Partial<ComposerState> = {}): ComposerState {
  return {
    textareaRef: createRef(),
    lastSyncedDraft: { current: '' },
    selectedIndex: 0,
    mentionQuery: null,
    isMentionAutocompleteOpen: false,
    slashQuery: null,
    isSlashMenuOpen: false,
    useMentionSystem: false,
    attachmentHandlers: makeAttachmentHandlers() as unknown as ComposerState['attachmentHandlers'],
    slashCommands: [],
    slashSelectHandlerRef: { current: null },
    onSlashStateChange: vi.fn(),
    closeAutocomplete: vi.fn(),
    closeMentionAutocomplete: vi.fn(),
    closeSlashMenu: vi.fn(),
    handlers: makeHandlers() as unknown as ComposerState['handlers'],
    ...overrides,
  };
}

function makeComposerProps(
  overrides: Partial<AgentChatComposerProps> = {},
): AgentChatComposerProps {
  return {
    canSend: true,
    disabled: false,
    draft: '',
    isSending: false,
    threadIsBusy: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  } as AgentChatComposerProps;
}

// ---------------------------------------------------------------------------
// Mocks for heavy dependencies
// ---------------------------------------------------------------------------

vi.mock('./AgentChatComposerParts', () => ({
  ComposerMenus: (p: Record<string, unknown>) => (
    <div data-testid="composer-menus">
      <button onClick={() => (p.onSlashSelect as (c: { id: string }) => void)({ id: 'clear' })}>
        select-slash
      </button>
    </div>
  ),
  ComposerInput: () => <div data-testid="composer-input" />,
  AttachmentChipsBar: () => <div data-testid="attachment-chips" />,
}));

vi.mock('./AgentChatContextBar', () => ({
  AgentChatContextBar: () => <div data-testid="context-bar" />,
}));

vi.mock('./MentionChip', () => ({
  MentionChipsBar: () => <div data-testid="mention-chips" />,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComposerMenusSection', () => {
  afterEach(() => cleanup());

  it('renders without throwing', () => {
    const { getByTestId } = render(
      <ComposerMenusSection state={makeState()} composerProps={makeComposerProps()} />,
    );
    expect(getByTestId('composer-menus')).toBeTruthy();
  });

  it('routes onSlashSelect to slashSelectHandlerRef.current when populated (Lexical path)', () => {
    const lexicalHandler = vi.fn();
    const legacyHandler = vi.fn();
    const ref = { current: lexicalHandler };
    const handlers = { ...makeHandlers(), handleSlashSelect: legacyHandler };
    const state = makeState({
      slashSelectHandlerRef: ref,
      handlers: handlers as unknown as ComposerState['handlers'],
    });
    const { getByText } = render(
      <ComposerMenusSection state={state} composerProps={makeComposerProps()} />,
    );
    fireEvent.click(getByText('select-slash'));
    expect(lexicalHandler).toHaveBeenCalledWith({ id: 'clear' });
    expect(legacyHandler).not.toHaveBeenCalled();
  });

  it('falls through to handlers.handleSlashSelect when ref.current is null (legacy path)', () => {
    const legacyHandler = vi.fn();
    const handlers = { ...makeHandlers(), handleSlashSelect: legacyHandler };
    const state = makeState({
      slashSelectHandlerRef: { current: null },
      handlers: handlers as unknown as ComposerState['handlers'],
    });
    const { getByText } = render(
      <ComposerMenusSection state={state} composerProps={makeComposerProps()} />,
    );
    fireEvent.click(getByText('select-slash'));
    expect(legacyHandler).toHaveBeenCalledWith({ id: 'clear' });
  });
});

describe('ComposerInputSection', () => {
  afterEach(() => cleanup());

  it('renders without throwing', () => {
    const { getByTestId } = render(
      <ComposerInputSection state={makeState()} composerProps={makeComposerProps()} />,
    );
    expect(getByTestId('composer-input')).toBeTruthy();
  });
});

describe('ComposerBody', () => {
  afterEach(() => cleanup());

  it('renders without throwing', () => {
    const { getByTestId } = render(
      <ComposerBody state={makeState()} composerProps={makeComposerProps()} />,
    );
    expect(getByTestId('context-bar')).toBeTruthy();
    expect(getByTestId('attachment-chips')).toBeTruthy();
  });

  it('shows MentionChipsBar only when useMentionSystem is true', () => {
    const { rerender, queryByTestId, getByTestId } = render(
      <ComposerBody
        state={makeState({ useMentionSystem: false })}
        composerProps={makeComposerProps()}
      />,
    );
    expect(queryByTestId('mention-chips')).toBeNull();
    rerender(
      <ComposerBody
        state={makeState({ useMentionSystem: true })}
        composerProps={makeComposerProps()}
      />,
    );
    expect(getByTestId('mention-chips')).toBeTruthy();
  });
});
