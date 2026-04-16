/**
 * MessageActions.test.tsx — Tests for MessageActions component and stripMarkdown helper.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageActions, stripMarkdown } from './MessageActions';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// ── stripMarkdown ─────────────────────────────────────────────────────────────

describe('stripMarkdown', () => {
  it('strips headings', () => {
    expect(stripMarkdown('# Hello\n## World')).toBe('Hello\nWorld');
  });

  it('strips bold and italic', () => {
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
  });

  it('strips code fences', () => {
    expect(stripMarkdown('```ts\nconst x = 1;\n```')).toBe('');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('use `foo()` here')).toBe('use foo() here');
  });

  it('strips bullet lists', () => {
    expect(stripMarkdown('- item one\n- item two')).toBe('item one\nitem two');
  });

  it('strips numbered lists', () => {
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond');
  });

  it('strips links but keeps text', () => {
    expect(stripMarkdown('[Claude](https://claude.ai)')).toBe('Claude');
  });

  it('strips blockquotes', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
  });
});

// ── MessageActions component ──────────────────────────────────────────────────

describe('MessageActions', () => {
  afterEach(() => { cleanup(); });

  const defaultProps = {
    content: '**hello** world',
    showRaw: false,
    onToggleRaw: vi.fn(),
  };

  it('renders Copy MD, Copy Plain, and Raw buttons', () => {
    render(<MessageActions {...defaultProps} />);
    expect(screen.getByTitle('Copy as Markdown')).toBeTruthy();
    expect(screen.getByTitle('Copy as plain text')).toBeTruthy();
    expect(screen.getByTitle('Show raw markdown')).toBeTruthy();
  });

  it('shows "Show rendered markdown" title when showRaw is true', () => {
    render(<MessageActions {...defaultProps} showRaw={true} />);
    expect(screen.getByTitle('Show rendered markdown')).toBeTruthy();
  });

  it('calls clipboard.writeText with raw markdown on Copy MD click', () => {
    render(<MessageActions {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Copy as Markdown'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('**hello** world');
  });

  it('calls clipboard.writeText with stripped text on Copy Plain click', () => {
    render(<MessageActions {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Copy as plain text'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('calls onToggleRaw when Raw button is clicked', () => {
    const onToggleRaw = vi.fn();
    render(<MessageActions {...defaultProps} onToggleRaw={onToggleRaw} />);
    fireEvent.click(screen.getByTitle('Show raw markdown'));
    expect(onToggleRaw).toHaveBeenCalledOnce();
  });

  it('renders reactionsSlot when provided', () => {
    render(
      <MessageActions {...defaultProps} reactionsSlot={<span data-testid="reactions" />} />,
    );
    expect(screen.getByTestId('reactions')).toBeTruthy();
  });
});
