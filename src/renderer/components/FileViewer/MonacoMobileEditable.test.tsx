/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

import { MonacoMobileEditable } from './MonacoMobileEditable';

describe('MonacoMobileEditable', () => {
  it('renders a textarea with data-monaco-fallback="editable"', () => {
    const { container } = render(
      <MonacoMobileEditable content="const x = 1;" />,
    );
    const ta = container.querySelector('textarea[data-monaco-fallback="editable"]');
    expect(ta).not.toBeNull();
  });

  it('displays the provided content in the textarea', () => {
    render(<MonacoMobileEditable content="hello world" />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('hello world');
  });

  it('sets font-size to 16px (iOS auto-zoom prevention)', () => {
    const { container } = render(<MonacoMobileEditable content="" />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.style.fontSize).toBe('16px');
  });

  it('sets spellcheck attribute to false', () => {
    const { container } = render(<MonacoMobileEditable content="" />);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    // jsdom reflects React's spellCheck={false} as the attribute string "false"
    expect(ta.getAttribute('spellcheck')).toBe('false');
  });

  it('calls onChange with the new value when the user types', () => {
    const onChange = vi.fn();
    render(<MonacoMobileEditable content="old" onChange={onChange} />);
    const ta = screen.getByRole('textbox');
    fireEvent.change(ta, { target: { value: 'new value' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('new value');
  });

  it('renders the phone edit mode info chip', () => {
    const { container } = render(<MonacoMobileEditable content="" />);
    expect(container.textContent).toContain('Phone edit mode');
  });
});
