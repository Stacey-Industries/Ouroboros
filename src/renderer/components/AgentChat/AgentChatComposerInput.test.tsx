/**
 * @vitest-environment jsdom
 *
 * AgentChatComposerInput.test.tsx — ComposerInput + SendButton.
 *
 * Wave 81 Phase F: Lexical is the only composer engine. The rich-textarea
 * mock is gone; LexicalChatComposer is stubbed so ComposerInput tests stay
 * focused on the chrome (Send / Stop / Queue / haptics). End-to-end Lexical
 * behavior is covered by the lexicalComposer/ test suite.
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHapticImpact } = vi.hoisted(() => ({
  mockHapticImpact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../web/capacitor', () => ({
  hapticImpact: mockHapticImpact,
}));

vi.mock('./lexicalComposer/LexicalChatComposer', () => ({
  LexicalChatComposer: () => <div data-testid="lexical-composer-stub" aria-label="composer stub" />,
}));

import { ComposerInput, SendButton } from './AgentChatComposerInput';

afterEach(() => cleanup());

describe('SendButton — haptics', () => {
  beforeEach(() => {
    mockHapticImpact.mockClear();
  });

  it('calls hapticImpact("light") when clicked and canSend is true', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SendButton canSend={true} isSending={false} willQueue={false} onClick={onClick} />,
    );
    fireEvent.click(getByRole('button'));
    expect(mockHapticImpact).toHaveBeenCalledWith('light');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire hapticImpact when button is disabled (canSend=false)', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <SendButton canSend={false} isSending={false} willQueue={false} onClick={onClick} />,
    );
    fireEvent.click(getByRole('button'));
    expect(mockHapticImpact).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ComposerInput', () => {
  it('mounts the Lexical composer stub', () => {
    const { getByTestId } = render(
      <ComposerInput
        canSend={true}
        disabled={false}
        draft=""
        handleChange={vi.fn()}
        handleDragLeave={vi.fn()}
        handleDragOver={vi.fn()}
        handleDrop={vi.fn()}
        handleKeyDown={vi.fn()}
        handlePaste={vi.fn()}
        isSending={false}
        onSubmit={vi.fn(async () => undefined)}
        threadIsBusy={false}
        textareaRef={{ current: null }}
        useMentionSystem={true}
      />,
    );
    expect(getByTestId('lexical-composer-stub')).toBeDefined();
  });

  it('shows queue-send button instead of stop when busy and draft can be queued', () => {
    const { getByTitle, queryByLabelText } = render(
      <ComposerInput
        canSend={true}
        disabled={false}
        draft="queue this"
        handleChange={vi.fn()}
        handleDragLeave={vi.fn()}
        handleDragOver={vi.fn()}
        handleDrop={vi.fn()}
        handleKeyDown={vi.fn()}
        handlePaste={vi.fn()}
        isSending={false}
        onStop={vi.fn(async () => undefined)}
        onSubmit={vi.fn(async () => undefined)}
        threadIsBusy={true}
        textareaRef={{ current: null }}
        useMentionSystem={true}
      />,
    );

    expect(getByTitle('Queue message')).toBeDefined();
    expect(queryByLabelText('Stop the agent')).toBeNull();
  });

  it('shows stop button when busy and there is nothing to queue', () => {
    const { getByLabelText, queryByTitle } = render(
      <ComposerInput
        canSend={false}
        disabled={false}
        draft=""
        handleChange={vi.fn()}
        handleDragLeave={vi.fn()}
        handleDragOver={vi.fn()}
        handleDrop={vi.fn()}
        handleKeyDown={vi.fn()}
        handlePaste={vi.fn()}
        isSending={false}
        onStop={vi.fn(async () => undefined)}
        onSubmit={vi.fn(async () => undefined)}
        threadIsBusy={true}
        textareaRef={{ current: null }}
        useMentionSystem={true}
      />,
    );

    expect(getByLabelText('Stop the agent')).toBeDefined();
    expect(queryByTitle('Queue message')).toBeNull();
  });
});
