/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

// Mock monaco-editor so colorizeElement is a spy — no real monaco runtime in jsdom.
vi.mock('monaco-editor', () => ({
  editor: {
    colorizeElement: vi.fn().mockResolvedValue(undefined),
  },
}));

import { MonacoMobileReadonly } from './MonacoMobileReadonly';

describe('MonacoMobileReadonly', () => {
  it('renders a <pre> with data-monaco-fallback="readonly"', () => {
    const { container } = render(
      <MonacoMobileReadonly content="const x = 1;" language="typescript" monacoTheme="ouroboros" />,
    );
    const pre = container.querySelector('pre[data-monaco-fallback="readonly"]');
    expect(pre).not.toBeNull();
  });

  it('renders the file content inside the <pre>', () => {
    const { container } = render(
      <MonacoMobileReadonly content="hello world" language="plaintext" monacoTheme="ouroboros" />,
    );
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('hello world');
  });

  it('calls monaco.editor.colorizeElement after mount', async () => {
    const monaco = await import('monaco-editor');
    const spy = vi.mocked(monaco.editor.colorizeElement);
    spy.mockClear();

    render(
      <MonacoMobileReadonly content="let y = 2;" language="javascript" monacoTheme="ouroboros" />,
    );

    // Flush the dynamic import + microtask queue
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledOnce();
    });

    const [node, opts] = spy.mock.calls[0];
    expect(node).toBeInstanceOf(HTMLElement);
    expect((opts as { mimeType: string }).mimeType).toBe('javascript');
  });
});
