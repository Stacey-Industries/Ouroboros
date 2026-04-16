/**
 * FileRefBadge.test.tsx
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileRef } from '../../../shared/FileRefResolver';
import { FileRefBadge } from './FileRefBadge';

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

describe('FileRefBadge', () => {
  it('renders children', () => {
    render(
      <FileRefBadge fileRef={makeRef()}>
        src/foo.ts
      </FileRefBadge>,
    );
    expect(screen.getByText('src/foo.ts')).toBeTruthy();
  });

  it('dispatches agent-ide:open-file with correct filePath on click', () => {
    const received: CustomEvent[] = [];
    window.addEventListener('agent-ide:open-file', (e) => received.push(e as CustomEvent));

    render(
      <FileRefBadge fileRef={makeRef({ path: 'src/foo.ts' })}>
        src/foo.ts
      </FileRefBadge>,
    );
    fireEvent.click(screen.getByRole('button'));

    window.removeEventListener('agent-ide:open-file', (e) => received.push(e as CustomEvent));
    expect(received).toHaveLength(1);
    expect(received[0].detail.filePath).toBe('src/foo.ts');
  });

  it('includes line and col in dispatched event when present', () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener('agent-ide:open-file', handler);

    render(
      <FileRefBadge fileRef={makeRef({ path: 'src/bar.ts', line: 42, col: 7 })}>
        src/bar.ts:42:7
      </FileRefBadge>,
    );
    fireEvent.click(screen.getByRole('button'));

    window.removeEventListener('agent-ide:open-file', handler);
    expect(received[0].detail.line).toBe(42);
    expect(received[0].detail.col).toBe(7);
  });

  it('resolves relative path against projectRoot', () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener('agent-ide:open-file', handler);

    render(
      <FileRefBadge fileRef={makeRef({ path: 'src/foo.ts' })} projectRoot="/workspace/myapp">
        src/foo.ts
      </FileRefBadge>,
    );
    fireEvent.click(screen.getByRole('button'));

    window.removeEventListener('agent-ide:open-file', handler);
    expect(received[0].detail.filePath).toBe('/workspace/myapp/src/foo.ts');
  });

  it('does not prepend projectRoot when path is already absolute', () => {
    const received: CustomEvent[] = [];
    const handler = (e: Event): void => { received.push(e as CustomEvent); };
    window.addEventListener('agent-ide:open-file', handler);

    render(
      <FileRefBadge fileRef={makeRef({ path: '/abs/src/foo.ts' })} projectRoot="/workspace">
        /abs/src/foo.ts
      </FileRefBadge>,
    );
    fireEvent.click(screen.getByRole('button'));

    window.removeEventListener('agent-ide:open-file', handler);
    expect(received[0].detail.filePath).toBe('/abs/src/foo.ts');
  });

  it('sets aria-label without line when line is absent', () => {
    render(
      <FileRefBadge fileRef={makeRef({ path: 'src/baz.ts' })}>baz</FileRefBadge>,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Open file src/baz.ts');
  });

  it('includes line in aria-label when line is present', () => {
    render(
      <FileRefBadge fileRef={makeRef({ path: 'src/baz.ts', line: 10 })}>baz</FileRefBadge>,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Open file src/baz.ts:10');
  });

  describe('hover card delay', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('does not show card immediately on mouseenter', () => {
      render(
        <FileRefBadge fileRef={makeRef()}>foo.ts</FileRefBadge>,
      );
      fireEvent.mouseEnter(screen.getByRole('button'));
      expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeNull();
    });

    it('shows card after 200ms delay', () => {
      render(
        <FileRefBadge fileRef={makeRef()}>foo.ts</FileRefBadge>,
      );
      fireEvent.mouseEnter(screen.getByRole('button'));
      act(() => { vi.advanceTimersByTime(200); });
      expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeTruthy();
    });

    it('hides card on mouseleave and cancels timer', () => {
      render(
        <FileRefBadge fileRef={makeRef()}>foo.ts</FileRefBadge>,
      );
      const btn = screen.getByRole('button');
      fireEvent.mouseEnter(btn);
      act(() => { vi.advanceTimersByTime(200); });
      fireEvent.mouseLeave(btn);
      expect(document.querySelector('[data-testid="citation-hover-card"]')).toBeNull();
    });
  });
});
