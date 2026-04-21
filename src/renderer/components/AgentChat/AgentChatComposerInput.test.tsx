/**
 * @vitest-environment jsdom
 *
 * AgentChatComposerInput.test.tsx — Phase G haptic wiring.
 *
 * Verifies that hapticImpact('light') is called when the SendButton is clicked.
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Haptics mock ─────────────────────────────────────────────────────────────
// vi.hoisted() so the variable is ready when vi.mock factory runs.
const { mockHapticImpact } = vi.hoisted(() => ({
  mockHapticImpact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../web/capacitor', () => ({
  hapticImpact: mockHapticImpact,
}));

vi.mock('rich-textarea', () => ({
  RichTextarea: ({
    children,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    children?: ((value: string) => React.ReactNode) | React.ReactNode;
  }) => {
    const { value = '' } = props;
    return (
      <textarea {...props}>
        {typeof children === 'function' ? children(String(value)) : children}
      </textarea>
    );
  },
}));

import { ComposerInput, SendButton } from './AgentChatComposerInput';

afterEach(() => cleanup());

describe('SendButton — Phase G haptics', () => {
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
    // button is disabled — onClick not called, haptic not called
    expect(mockHapticImpact).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ComposerInput', () => {
  it('closes the slash menu on blur', () => {
    vi.useFakeTimers();
    const onCloseSlashMenu = vi.fn();
    const { getByPlaceholderText } = render(
      <ComposerInput
        canSend={true}
        disabled={false}
        draft="/"
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
        onCloseMentionAutocomplete={vi.fn()}
        onCloseAutocomplete={vi.fn()}
        onCloseSlashMenu={onCloseSlashMenu}
      />,
    );

    fireEvent.blur(getByPlaceholderText('Ask the agent... (/ for commands, @ to mention files)'));
    vi.runAllTimers();

    expect(onCloseSlashMenu).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
