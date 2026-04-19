/**
 * @vitest-environment jsdom
 *
 * useDragAndDrop.keyboard.test.ts — KeyboardSensor wiring in useLayoutSensors.
 *
 * Verifies that Wave 41 Phase P's keyboard accessibility addition:
 * - KeyboardSensor is included in the sensor list
 * - It is configured with sortableKeyboardCoordinates
 * - useLayoutSensors exposes three sensors total (Pointer + Touch + Keyboard)
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: React.PropsWithChildren) => children,
  DragOverlay: () => null,
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: vi.fn((Cls, opts?: unknown) => ({ sensor: Cls, options: opts ?? {} })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(() => ({ x: 0, y: 0 })),
}));

vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn().mockReturnValue({ config: null, isLoading: true, error: null, set: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: vi.fn().mockReturnValue('desktop'),
}));

import { KeyboardSensor, PointerSensor, TouchSensor, useSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import React from 'react';

import { useLayoutSensors } from './useDragAndDrop';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useLayoutSensors — keyboard accessibility', () => {
  it('registers three sensors (Pointer, Touch, Keyboard)', () => {
    renderHook(() => useLayoutSensors());
    const registeredClasses = vi.mocked(useSensor).mock.calls.map((c) => c[0]);
    expect(registeredClasses).toHaveLength(3);
    expect(registeredClasses).toContain(PointerSensor);
    expect(registeredClasses).toContain(TouchSensor);
    expect(registeredClasses).toContain(KeyboardSensor);
  });

  it('configures KeyboardSensor with sortableKeyboardCoordinates coordinator', () => {
    renderHook(() => useLayoutSensors());
    const kbCall = vi.mocked(useSensor).mock.calls.find((c) => c[0] === KeyboardSensor);
    expect(kbCall).toBeDefined();
    const opts = kbCall![1] as { coordinateGetter: unknown };
    expect(opts.coordinateGetter).toBe(sortableKeyboardCoordinates);
  });

  it('KeyboardSensor is the last sensor (registered after Pointer and Touch)', () => {
    renderHook(() => useLayoutSensors());
    const classes = vi.mocked(useSensor).mock.calls.map((c) => c[0]);
    expect(classes[2]).toBe(KeyboardSensor);
  });
});
