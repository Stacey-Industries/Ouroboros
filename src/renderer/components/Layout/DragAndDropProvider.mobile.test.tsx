/**
 * @vitest-environment jsdom
 *
 * DragAndDropProvider.mobile.test.tsx — phone viewport gate for DnD.
 *
 * Wave 41 Phase P: DragAndDropProvider should render children without
 * DndContext when the viewport is 'phone' to avoid swipe-vs-drag conflicts.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let dndContextMounted = false;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: React.PropsWithChildren) => {
    dndContextMounted = true;
    return React.createElement(React.Fragment, null, children);
  },
  DragOverlay: () => null,
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: vi.fn((Cls, opts?: unknown) => ({ sensor: Cls, options: opts ?? {} })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn().mockReturnValue({
    config: { layout: { dragAndDrop: true } },
    isLoading: false,
    error: null,
    set: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockUseViewportBreakpoint = vi.fn().mockReturnValue('desktop');
vi.mock('../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: () => mockUseViewportBreakpoint(),
}));

import { useConfig } from '../../hooks/useConfig';
import { DragAndDropProvider } from './useDragAndDrop';

const mockUseConfig = vi.mocked(useConfig);

afterEach(() => {
  cleanup();
  dndContextMounted = false;
  vi.clearAllMocks();
});

describe('DragAndDropProvider — phone viewport gate', () => {
  it('renders DndContext on desktop viewport (flag on)', () => {
    mockUseViewportBreakpoint.mockReturnValue('desktop');

    render(
      React.createElement(
        DragAndDropProvider,
        null,
        React.createElement('span', { 'data-testid': 'child' }, 'content'),
      ),
    );

    expect(screen.getByTestId('child')).toBeTruthy();
    expect(dndContextMounted).toBe(true);
  });

  it('does NOT render DndContext on phone viewport — children still render', () => {
    mockUseViewportBreakpoint.mockReturnValue('phone');

    render(
      React.createElement(
        DragAndDropProvider,
        null,
        React.createElement('span', { 'data-testid': 'child' }, 'content'),
      ),
    );

    expect(screen.getByTestId('child')).toBeTruthy();
    expect(dndContextMounted).toBe(false);
  });

  it('does NOT render DndContext on tablet viewport — tablet keeps DnD active', () => {
    mockUseViewportBreakpoint.mockReturnValue('tablet');

    render(
      React.createElement(
        DragAndDropProvider,
        null,
        React.createElement('span', { 'data-testid': 'child' }, 'content'),
      ),
    );

    expect(screen.getByTestId('child')).toBeTruthy();
    expect(dndContextMounted).toBe(true);
  });

  it('does NOT render DndContext when dragAndDrop config flag is false', () => {
    mockUseViewportBreakpoint.mockReturnValue('desktop');
    mockUseConfig.mockReturnValueOnce({
      config: { layout: { dragAndDrop: false } } as never,
      isLoading: false,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      React.createElement(
        DragAndDropProvider,
        null,
        React.createElement('span', { 'data-testid': 'child' }, 'content'),
      ),
    );

    expect(screen.getByTestId('child')).toBeTruthy();
    expect(dndContextMounted).toBe(false);
  });
});
