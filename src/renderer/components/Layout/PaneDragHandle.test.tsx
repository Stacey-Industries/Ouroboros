/**
 * @vitest-environment jsdom
 *
 * PaneDragHandle — unit tests for Wave 28 Phase A.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock useDragAndDrop so tests control the enabled flag
// ---------------------------------------------------------------------------
vi.mock('./useDragAndDrop', () => ({
  useDragAndDrop: vi.fn(),
  DragAndDropProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock @dnd-kit/core — useDraggable returns minimal stable refs
vi.mock('@dnd-kit/core', () => ({
  useDraggable: vi.fn(() => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
  DndContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { useDraggable } from '@dnd-kit/core';

import { PaneDragHandle } from './PaneDragHandle';
import { useDragAndDrop } from './useDragAndDrop';

const mockUseDragAndDrop = vi.mocked(useDragAndDrop);
const mockUseDraggable = vi.mocked(useDraggable);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PaneDragHandle', () => {
  it('renders a button with the correct aria-label when enabled', () => {
    mockUseDragAndDrop.mockReturnValue({ enabled: true });
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
      node: { current: null },
      over: null,
      active: null,
      transform: null,
    } as never);

    render(<PaneDragHandle slotId="terminal" />);

    const btn = screen.getByRole('button', { name: 'Drag to rearrange pane' });
    expect(btn).toBeDefined();
  });

  it('returns null (renders nothing) when DnD is disabled', () => {
    mockUseDragAndDrop.mockReturnValue({ enabled: false });

    const { container } = render(<PaneDragHandle slotId="terminal" />);
    expect(container.firstChild).toBeNull();
  });

  it('passes the slotId as the draggable id to useDraggable', () => {
    mockUseDragAndDrop.mockReturnValue({ enabled: true });
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
      node: { current: null },
      over: null,
      active: null,
      transform: null,
    } as never);

    render(<PaneDragHandle slotId="editorContent" />);

    expect(mockUseDraggable).toHaveBeenCalledWith({ id: 'editorContent' });
  });

  it('button is keyboard-focusable (tabIndex not negative)', () => {
    mockUseDragAndDrop.mockReturnValue({ enabled: true });
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
      node: { current: null },
      over: null,
      active: null,
      transform: null,
    } as never);

    render(<PaneDragHandle slotId="sidebar" />);

    const btn = screen.getByRole('button', { name: 'Drag to rearrange pane' });
    const tabIndex = Number(btn.getAttribute('tabindex') ?? '0');
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('applies reduced opacity class while dragging', () => {
    mockUseDragAndDrop.mockReturnValue({ enabled: true });
    mockUseDraggable.mockReturnValue({
      attributes: { role: 'button', tabIndex: 0 },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: true,
      node: { current: null },
      over: null,
      active: null,
      transform: null,
    } as never);

    render(<PaneDragHandle slotId="terminal" />);

    const btn = screen.getByRole('button', { name: 'Drag to rearrange pane' });
    expect(btn.className).toContain('opacity-50');
  });
});
