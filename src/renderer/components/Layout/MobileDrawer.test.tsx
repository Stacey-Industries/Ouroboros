/**
 * @vitest-environment jsdom
 *
 * MobileDrawer — unit tests for Wave 32 Phase F.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileDrawer } from './MobileDrawer';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('MobileDrawer', () => {
  it('renders null when closed', () => {
    const { container } = render(
      <MobileDrawer isOpen={false} onClose={vi.fn()} ariaLabel="File tree">
        <span>content</span>
      </MobileDrawer>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children when open', () => {
    render(
      <MobileDrawer isOpen={true} onClose={vi.fn()} ariaLabel="File tree">
        <span>drawer content</span>
      </MobileDrawer>,
    );
    expect(screen.getByText('drawer content')).toBeDefined();
  });

  it('renders a dialog with the provided ariaLabel', () => {
    render(
      <MobileDrawer isOpen={true} onClose={vi.fn()} ariaLabel="File tree">
        <button>close</button>
      </MobileDrawer>,
    );
    expect(screen.getByRole('dialog', { name: 'File tree' })).toBeDefined();
  });

  it('calls onClose when scrim is clicked', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer isOpen={true} onClose={onClose} ariaLabel="File tree">
        <button>btn</button>
      </MobileDrawer>,
    );
    const scrim = document.querySelector('[role="presentation"]') as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer isOpen={true} onClose={onClose} ariaLabel="File tree">
        <button>btn</button>
      </MobileDrawer>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll when open', () => {
    render(
      <MobileDrawer isOpen={true} onClose={vi.fn()} ariaLabel="File tree">
        <button>btn</button>
      </MobileDrawer>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock body scroll when closed', () => {
    document.body.style.overflow = '';
    render(
      <MobileDrawer isOpen={false} onClose={vi.fn()} ariaLabel="File tree">
        <button>btn</button>
      </MobileDrawer>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('focuses first focusable element when opened', () => {
    render(
      <MobileDrawer isOpen={true} onClose={vi.fn()} ariaLabel="File tree">
        <button data-testid="first-btn">First</button>
        <button>Second</button>
      </MobileDrawer>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('first-btn'));
  });
});
