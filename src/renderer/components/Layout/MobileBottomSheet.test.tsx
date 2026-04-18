/**
 * @vitest-environment jsdom
 *
 * MobileBottomSheet — unit tests for Wave 32 Phase F.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileBottomSheet } from './MobileBottomSheet';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('MobileBottomSheet', () => {
  it('renders null when closed', () => {
    const { container } = render(
      <MobileBottomSheet isOpen={false} onClose={vi.fn()} ariaLabel="Monitor">
        <span>content</span>
      </MobileBottomSheet>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children when open', () => {
    render(
      <MobileBottomSheet isOpen={true} onClose={vi.fn()} ariaLabel="Monitor">
        <span>sheet content</span>
      </MobileBottomSheet>,
    );
    expect(screen.getByText('sheet content')).toBeDefined();
  });

  it('renders a dialog with the provided ariaLabel', () => {
    render(
      <MobileBottomSheet isOpen={true} onClose={vi.fn()} ariaLabel="Monitor">
        <button>close</button>
      </MobileBottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Monitor' })).toBeDefined();
  });

  it('calls onClose when scrim is clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileBottomSheet isOpen={true} onClose={onClose} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    const scrim = document.querySelector('[role="presentation"]') as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <MobileBottomSheet isOpen={true} onClose={onClose} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll when open', () => {
    render(
      <MobileBottomSheet isOpen={true} onClose={vi.fn()} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock body scroll when closed', () => {
    document.body.style.overflow = '';
    render(
      <MobileBottomSheet isOpen={false} onClose={vi.fn()} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('focuses first focusable element when opened', () => {
    render(
      <MobileBottomSheet isOpen={true} onClose={vi.fn()} ariaLabel="Monitor">
        <button data-testid="first-btn">First</button>
        <button>Second</button>
      </MobileBottomSheet>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('first-btn'));
  });

  it('renders a drag handle element', () => {
    const { container } = render(
      <MobileBottomSheet isOpen={true} onClose={vi.fn()} ariaLabel="Monitor">
        <span>content</span>
      </MobileBottomSheet>,
    );
    // drag handle row has aria-hidden="true"
    const handleRow = container.querySelector('[aria-hidden="true"]');
    expect(handleRow).not.toBeNull();
  });

  it('calls onClose on swipe-down past threshold', () => {
    const onClose = vi.fn();
    render(
      <MobileBottomSheet isOpen={true} onClose={onClose} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog, { clientY: 100 });
    fireEvent.pointerUp(dialog, { clientY: 200 }); // delta = 100 > threshold 80
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on small swipe (below threshold)', () => {
    const onClose = vi.fn();
    render(
      <MobileBottomSheet isOpen={true} onClose={onClose} ariaLabel="Monitor">
        <button>btn</button>
      </MobileBottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog, { clientY: 100 });
    fireEvent.pointerUp(dialog, { clientY: 150 }); // delta = 50 < threshold 80
    expect(onClose).not.toHaveBeenCalled();
  });
});
