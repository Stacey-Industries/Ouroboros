/**
 * @vitest-environment jsdom
 *
 * DroppableSlot — unit tests for Wave 28 Phase B.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @dnd-kit/core — useDroppable returns minimal stable state
// ---------------------------------------------------------------------------
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
}));

import { useDroppable } from '@dnd-kit/core';

import { DroppableSlot } from './DroppableSlot';

const mockUseDroppable = vi.mocked(useDroppable);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DroppableSlot', () => {
  it('renders children unchanged when not hovered', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    render(
      <DroppableSlot slotName="editorContent">
        <span data-testid="child">content</span>
      </DroppableSlot>,
    );

    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('shows drop indicator element when isOver is true', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    const { container } = render(
      <DroppableSlot slotName="terminalContent">
        <span>child</span>
      </DroppableSlot>,
    );

    const indicator = container.querySelector('[data-drop-indicator="center"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.className).toContain('border-border-accent');
  });

  it('does NOT show drop indicator when isOver is false', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    const { container } = render(
      <DroppableSlot slotName="sidebarContent">
        <span>child</span>
      </DroppableSlot>,
    );

    const indicator = container.querySelector('[data-drop-indicator="center"]');
    expect(indicator).toBeNull();
  });

  it('passes slotName as the droppable id to useDroppable', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    render(
      <DroppableSlot slotName="agentCards">
        <span>child</span>
      </DroppableSlot>,
    );

    expect(mockUseDroppable).toHaveBeenCalledWith({ id: 'agentCards' });
  });

  it('sets aria-dropeffect="move" on wrapper when isOver is true', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    const { container } = render(
      <DroppableSlot slotName="sidebarHeader">
        <span>child</span>
      </DroppableSlot>,
    );

    const wrapper = container.querySelector('[data-droppable-slot="sidebarHeader"]');
    expect(wrapper?.getAttribute('aria-dropeffect')).toBe('move');
  });

  it('sets aria-dropeffect="none" on wrapper when not hovered', () => {
    mockUseDroppable.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
      over: null,
      active: null,
      rect: { current: null },
      node: { current: null },
    } as never);

    const { container } = render(
      <DroppableSlot slotName="editorTabBar">
        <span>child</span>
      </DroppableSlot>,
    );

    const wrapper = container.querySelector('[data-droppable-slot="editorTabBar"]');
    expect(wrapper?.getAttribute('aria-dropeffect')).toBe('none');
  });
});
