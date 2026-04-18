/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

// Mock monaco-editor so colorizeElement never touches the real runtime.
vi.mock('monaco-editor', () => ({
  editor: {
    colorizeElement: vi.fn().mockResolvedValue(undefined),
  },
}));

import { MonacoMobileFallback } from './MonacoMobileFallback';

describe('MonacoMobileFallback — readonly path', () => {
  it('renders a <pre> with data-monaco-fallback="readonly"', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/foo.ts"
        content="const x = 1;"
        language="typescript"
        readOnly={true}
      />,
    );
    const pre = container.querySelector('pre[data-monaco-fallback="readonly"]');
    expect(pre).not.toBeNull();
  });

  it('displays the file content inside the <pre>', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/foo.ts"
        content="hello readonly"
        language="plaintext"
        readOnly={true}
      />,
    );
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('hello readonly');
  });

  it('does not render a textarea in readonly mode', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/foo.ts"
        content="x"
        language="plaintext"
        readOnly={true}
      />,
    );
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('renders the chrome with a disabled Open in desktop button', () => {
    render(
      <MonacoMobileFallback
        filePath="/src/foo.ts"
        content=""
        language="plaintext"
        readOnly={true}
      />,
    );
    const btn = screen.getByRole('button', { name: /open in desktop/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});

describe('MonacoMobileFallback — editable path', () => {
  it('renders a <textarea> with data-monaco-fallback="editable"', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/bar.ts"
        content="let y = 2;"
        language="typescript"
        readOnly={false}
      />,
    );
    const ta = container.querySelector('textarea[data-monaco-fallback="editable"]');
    expect(ta).not.toBeNull();
  });

  it('does not render a <pre> in editable mode', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/bar.ts"
        content="x"
        language="plaintext"
        readOnly={false}
      />,
    );
    expect(container.querySelector('pre')).toBeNull();
  });

  it('fires onChange with the new value when user edits', () => {
    const onChange = vi.fn();
    render(
      <MonacoMobileFallback
        filePath="/src/bar.ts"
        content="old content"
        language="typescript"
        readOnly={false}
        onChange={onChange}
      />,
    );
    const ta = screen.getByRole('textbox');
    fireEvent.change(ta, { target: { value: 'new content' } });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('new content');
  });

  it('textarea has font-size 16px (iOS zoom prevention)', () => {
    const { container } = render(
      <MonacoMobileFallback
        filePath="/src/bar.ts"
        content=""
        language="plaintext"
        readOnly={false}
      />,
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.style.fontSize).toBe('16px');
  });
});
