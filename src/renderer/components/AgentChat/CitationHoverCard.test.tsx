/**
 * CitationHoverCard.test.tsx
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileRef } from '../../../shared/FileRefResolver';
import { CitationHoverCard } from './CitationHoverCard';

afterEach(cleanup);

function makeRef(overrides: Partial<FileRef> = {}): FileRef {
  return {
    raw: 'src/foo.ts',
    path: 'src/foo.ts',
    start: 0,
    end: 10,
    ...overrides,
  };
}

function makeAnchorRef(el: HTMLElement | null = null): React.RefObject<HTMLElement | null> {
  const ref = { current: el };
  return ref as React.RefObject<HTMLElement | null>;
}

function installReadFile(
  result: { success: boolean; content?: string; error?: string },
): void {
  Object.defineProperty(window, 'electronAPI', {
    value: { files: { readFile: vi.fn().mockResolvedValue(result) } },
    writable: true,
    configurable: true,
  });
}

describe('CitationHoverCard', () => {
  beforeEach(() => {
    installReadFile({ success: true, content: 'line1\nline2\nline3\nline4\nline5' });
  });

  afterEach(() => {
    // @ts-expect-error -- cleanup global
    delete window.electronAPI;
  });

  it('renders the data-testid sentinel', async () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);

    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeTruthy(),
    );

    document.body.removeChild(anchor);
  });

  it('shows loading state initially', () => {
    // Never resolves during this sync check
    Object.defineProperty(window, 'electronAPI', {
      value: { files: { readFile: vi.fn(() => new Promise(() => { /* pending */ })) } },
      writable: true,
      configurable: true,
    });

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Loading');
  });

  it('renders file snippet after load', async () => {
    installReadFile({ success: true, content: 'alpha\nbeta\ngamma' });

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() => expect(document.body.textContent).toContain('alpha'));
    expect(document.body.textContent).toContain('beta');
    expect(document.body.textContent).toContain('gamma');
  });

  it('shows error state when readFile fails', async () => {
    installReadFile({ success: false, error: 'Permission denied' });

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() =>
      expect(document.body.textContent).toContain('Permission denied'),
    );
  });

  it('shows error when API is unavailable', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {},
      writable: true,
      configurable: true,
    });

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() =>
      expect(document.body.textContent).toContain('unavailable'),
    );
  });

  it('highlights the target line when fileRef.line is set', async () => {
    installReadFile({ success: true, content: 'a\nb\nc\nd\ne' });

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef({ line: 3 })}
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() => expect(document.body.textContent).toContain('c'));
    // The highlighted row gets bg-interactive-selection class
    const highlighted = document.querySelector('.bg-interactive-selection');
    expect(highlighted).toBeTruthy();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef()}
        anchorRef={makeAnchorRef(anchor)}
        onClose={onClose}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeTruthy(),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('dispatches agent-ide:open-file and calls onClose when "Open in editor" clicked', async () => {
    const onClose = vi.fn();
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener('agent-ide:open-file', handler);

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef({ path: 'src/thing.ts', line: 5 })}
        anchorRef={makeAnchorRef(anchor)}
        onClose={onClose}
      />,
    );

    await waitFor(() => screen.getByText('Open in editor'));
    fireEvent.click(screen.getByText('Open in editor'));

    window.removeEventListener('agent-ide:open-file', handler);
    expect(received).toHaveLength(1);
    expect(received[0].detail.filePath).toBe('src/thing.ts');
    expect(received[0].detail.line).toBe(5);
    expect(onClose).toHaveBeenCalled();
  });

  it('resolves relative path against projectRoot', async () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener('agent-ide:open-file', handler);

    const anchor = document.createElement('button');
    render(
      <CitationHoverCard
        fileRef={makeRef({ path: 'src/bar.ts' })}
        projectRoot="/workspace"
        anchorRef={makeAnchorRef(anchor)}
      />,
    );

    await waitFor(() => screen.getByText('Open in editor'));
    fireEvent.click(screen.getByText('Open in editor'));

    window.removeEventListener('agent-ide:open-file', handler);
    expect(received[0].detail.filePath).toBe('/workspace/src/bar.ts');
  });
});
