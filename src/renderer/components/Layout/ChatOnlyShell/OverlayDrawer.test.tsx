/**
 * @vitest-environment jsdom
 *
 * OverlayDrawer — Wave 89 Phase 2 primitive tests.
 *
 * Contract verified:
 * - Renders nothing visible when closed.
 * - Renders drawer + backdrop when open.
 * - Clicking the backdrop calls onClose.
 * - Pressing Escape (with drawer open) calls onClose.
 * - Escape pressed in a sibling element OUTSIDE the drawer does NOT call onClose
 *   when the drawer is closed (proves non-modal scoping).
 * - `width` prop is reflected as the drawer's inline width.
 * - `onWidthChange` fires when the handle is dragged.
 * - When `onWidthChange` is absent, the handle does not render.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayDrawer } from './OverlayDrawer';

afterEach(cleanup);

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderDrawer(
  props: Partial<React.ComponentProps<typeof OverlayDrawer>> = {},
): ReturnType<typeof render> {
  return render(
    <OverlayDrawer
      open={false}
      onClose={vi.fn()}
      width={380}
      dataTestId="test-drawer"
      {...props}
    >
      <div data-testid="drawer-child">content</div>
    </OverlayDrawer>,
  );
}

// ─── visibility ───────────────────────────────────────────────────────────────

describe('OverlayDrawer visibility', () => {
  it('does not render the backdrop when open is false', () => {
    renderDrawer({ open: false });
    expect(screen.queryByTestId('overlay-drawer-backdrop')).toBeNull();
  });

  it('renders the drawer container when open is false (offscreen via transform)', () => {
    renderDrawer({ open: false });
    const drawer = screen.getByTestId('test-drawer');
    expect(drawer).toBeTruthy();
    // Closed state carries translate-x-full — verified by class presence
    expect(drawer.className).toContain('translate-x-full');
  });

  it('renders the backdrop when open is true', () => {
    renderDrawer({ open: true });
    expect(screen.getByTestId('overlay-drawer-backdrop')).toBeTruthy();
  });

  it('applies translate-x-0 when open is true', () => {
    renderDrawer({ open: true });
    const drawer = screen.getByTestId('test-drawer');
    expect(drawer.className).toContain('translate-x-0');
    expect(drawer.className).not.toContain('translate-x-full');
  });
});

// ─── backdrop click ───────────────────────────────────────────────────────────

describe('OverlayDrawer backdrop click', () => {
  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    fireEvent.click(screen.getByTestId('overlay-drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the drawer content is clicked', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    fireEvent.click(screen.getByTestId('drawer-child'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── Escape key ───────────────────────────────────────────────────────────────

describe('OverlayDrawer Escape key', () => {
  it('calls onClose when Escape is pressed while the drawer is open', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when Escape is pressed while the drawer is closed', () => {
    const onClose = vi.fn();
    renderDrawer({ open: false, onClose });
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose when a non-Escape key is pressed while open', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    fireEvent.keyDown(window, { key: 'Enter', bubbles: true });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── non-modal scoping ────────────────────────────────────────────────────────

describe('OverlayDrawer non-modal scope', () => {
  it('does not fire onClose when Escape is pressed in a sibling and drawer is closed', () => {
    const onClose = vi.fn();

    const { container } = render(
      <div>
        <input data-testid="sibling-input" />
        <OverlayDrawer open={false} onClose={onClose} width={380}>
          <div>content</div>
        </OverlayDrawer>
      </div>,
    );

    const sibling = container.querySelector('[data-testid="sibling-input"]') as HTMLInputElement;
    sibling.focus();
    fireEvent.keyDown(sibling, { key: 'Escape', bubbles: true });

    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── width prop ───────────────────────────────────────────────────────────────

describe('OverlayDrawer width prop', () => {
  it('renders the drawer at the specified pixel width', () => {
    renderDrawer({ open: true, width: 520 });
    const drawer = screen.getByTestId('test-drawer');
    expect(drawer.style.width).toBe('520px');
  });

  it('positions the backdrop to stop at the left edge of the drawer', () => {
    renderDrawer({ open: true, width: 400 });
    const backdrop = screen.getByTestId('overlay-drawer-backdrop');
    // The backdrop's `right` style equals the drawer width so it covers
    // only the area to the left of the drawer.
    expect(backdrop.style.right).toBe('400px');
  });
});

// ─── width handle ─────────────────────────────────────────────────────────────

describe('OverlayDrawer width handle', () => {
  beforeEach(() => {
    // jsdom does not implement getBoundingClientRect — stub it.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 380,
      height: 600,
      top: 0,
      left: 620,
      right: 1000,
      bottom: 600,
      x: 620,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the drag handle when onWidthChange is provided', () => {
    renderDrawer({ open: true, onWidthChange: vi.fn() });
    expect(screen.getByTestId('overlay-drawer-handle')).toBeTruthy();
  });

  it('does not render the drag handle when onWidthChange is absent', () => {
    renderDrawer({ open: true });
    expect(screen.queryByTestId('overlay-drawer-handle')).toBeNull();
  });

  it('calls onWidthChange with the new width when the handle is dragged', () => {
    const onWidthChange = vi.fn();
    renderDrawer({ open: true, width: 380, onWidthChange });

    const handle = screen.getByTestId('overlay-drawer-handle');

    // Simulate: pointerDown at x=500, then pointerMove to x=460 (dragging left
    // = growing the drawer by 40px → new width = 380 + 40 = 420).
    fireEvent.pointerDown(handle, { clientX: 500, bubbles: true });
    fireEvent.pointerMove(window, { clientX: 460 });
    fireEvent.pointerUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(420);
  });

  it('clamps the new width to a minimum of 120px', () => {
    const onWidthChange = vi.fn();
    renderDrawer({ open: true, width: 380, onWidthChange });

    const handle = screen.getByTestId('overlay-drawer-handle');

    // Drag far right — startWidth(380) + (500 - 1000) = -120 → clamped to 120
    fireEvent.pointerDown(handle, { clientX: 500, bubbles: true });
    fireEvent.pointerMove(window, { clientX: 1000 });
    fireEvent.pointerUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(120);
  });
});
