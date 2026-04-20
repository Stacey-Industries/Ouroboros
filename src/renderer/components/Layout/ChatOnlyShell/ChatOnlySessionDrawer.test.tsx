/**
 * @vitest-environment jsdom
 *
 * ChatOnlySessionDrawer — open/close, backdrop dismiss, Esc dismiss.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlySessionDrawer } from './ChatOnlySessionDrawer';

vi.mock('../../SessionSidebar/SessionSidebar', () => ({
  SessionSidebar: () => <div data-testid="session-sidebar">SessionSidebar</div>,
}));

afterEach(() => cleanup());

describe('ChatOnlySessionDrawer', () => {
  it('renders without throwing', () => {
    const { container } = render(<ChatOnlySessionDrawer open={false} onClose={vi.fn()} />);
    expect(container).toBeDefined();
  });

  it('is translated off-screen when closed', () => {
    render(<ChatOnlySessionDrawer open={false} onClose={vi.fn()} />);
    const drawer = screen.getByTestId('session-drawer');
    expect(drawer.getAttribute('data-open')).toBe('false');
    expect(drawer.className).toContain('-translate-x-full');
  });

  it('is visible when open', () => {
    render(<ChatOnlySessionDrawer open={true} onClose={vi.fn()} />);
    const drawer = screen.getByTestId('session-drawer');
    expect(drawer.getAttribute('data-open')).toBe('true');
    expect(drawer.className).toContain('translate-x-0');
  });

  it('renders SessionSidebar when open', () => {
    render(<ChatOnlySessionDrawer open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('session-sidebar')).toBeDefined();
  });

  it('shows backdrop when open', () => {
    render(<ChatOnlySessionDrawer open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('drawer-backdrop')).toBeDefined();
  });

  it('hides backdrop when closed', () => {
    render(<ChatOnlySessionDrawer open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('drawer-backdrop')).toBeNull();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ChatOnlySessionDrawer open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Esc is pressed while open', () => {
    const onClose = vi.fn();
    render(<ChatOnlySessionDrawer open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Esc when already closed', () => {
    const onClose = vi.fn();
    render(<ChatOnlySessionDrawer open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('drawer has correct ARIA attributes', () => {
    render(<ChatOnlySessionDrawer open={true} onClose={vi.fn()} />);
    const drawer = screen.getByRole('dialog');
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.getAttribute('aria-label')).toBe('Session history');
  });
});
