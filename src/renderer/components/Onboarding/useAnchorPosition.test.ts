/**
 * useAnchorPosition.test.ts
 * Wave 38 Phase B — unit tests for the anchor position hook.
 *
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAnchorPosition } from './useAnchorPosition';

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDomRect(rect: Partial<DOMRect>): DOMRect {
  const top = rect.top ?? 100;
  const left = rect.left ?? 50;
  const width = rect.width ?? 200;
  const height = rect.height ?? 40;
  return { top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) };
}

function addAnchor(name: string, rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-tour-anchor', name);
  const domRect = makeDomRect(rect);
  el.getBoundingClientRect = () => domRect;
  document.body.appendChild(el);
  return el;
}

function removeAnchor(name: string): void {
  const el = document.querySelector(`[data-tour-anchor="${name}"]`);
  el?.remove();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAnchorPosition', () => {
  beforeEach(() => {
    // jsdom ResizeObserver stub
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  afterEach(() => {
    removeAnchor('chat');
    removeAnchor('settings-trigger');
  });

  it('returns element rect when anchor is present', () => {
    addAnchor('chat', { top: 100, left: 50, width: 200, height: 40 });
    const { result } = renderHook(() => useAnchorPosition('chat'));
    expect(result.current.isCentered).toBe(false);
    expect(result.current.top).toBe(100);
    expect(result.current.left).toBe(50);
    expect(result.current.width).toBe(200);
    expect(result.current.height).toBe(40);
  });

  it('returns centered fallback when anchor is absent', () => {
    const { result } = renderHook(() => useAnchorPosition('no-such-anchor'));
    expect(result.current.isCentered).toBe(true);
    expect(result.current.top).toBe(400);  // innerHeight / 2
    expect(result.current.left).toBe(640); // innerWidth / 2
    expect(result.current.width).toBe(0);
    expect(result.current.height).toBe(0);
  });

  it('updates position on window resize', () => {
    addAnchor('settings-trigger', { top: 10, left: 10, width: 100, height: 20 });
    const { result } = renderHook(() => useAnchorPosition('settings-trigger'));
    expect(result.current.top).toBe(10);

    // Simulate resize — anchor getBoundingClientRect returns updated values
    const el = document.querySelector('[data-tour-anchor="settings-trigger"]') as HTMLElement;
    el.getBoundingClientRect = () => ({
      top: 20, left: 20, width: 100, height: 20,
      bottom: 40, right: 120, x: 20, y: 20, toJSON: () => ({}),
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.top).toBe(20);
  });

  it('re-resolves when anchorName changes', () => {
    addAnchor('chat', { top: 50 });
    addAnchor('settings-trigger', { top: 750 });

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useAnchorPosition(name),
      { initialProps: { name: 'chat' } },
    );
    expect(result.current.top).toBe(50);

    act(() => { rerender({ name: 'settings-trigger' }); });
    expect(result.current.top).toBe(750);
    expect(result.current.isCentered).toBe(false);
  });
});
