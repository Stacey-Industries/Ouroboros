/**
 * @vitest-environment jsdom
 *
 * useDragAndDrop — unit tests for Wave 28 Phase A.
 * Tests the hook logic in isolation and DragAndDropProvider render behaviour.
 */

import { cleanup, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock useConfig so tests control what config returns without IPC
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn(),
}));

// Mock @dnd-kit/core so tests don't need a DOM with pointer events
const capturedSensors: unknown[] = [];
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: React.PropsWithChildren) => children,
  DragOverlay: () => null,
  PointerSensor: class PointerSensor {},
  TouchSensor: class TouchSensor {},
  useSensor: vi.fn((Cls, opts?: unknown) => ({ sensor: Cls, options: opts ?? {} })),
  useSensors: vi.fn((...sensors: unknown[]) => {
    capturedSensors.length = 0;
    capturedSensors.push(...sensors);
    return sensors;
  }),
}));

import { PointerSensor, TouchSensor, useSensor } from '@dnd-kit/core';
import { useConfig } from '../../hooks/useConfig';
import { useDragAndDrop, useLayoutSensors } from './useDragAndDrop';

const mockUseConfig = vi.mocked(useConfig);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useDragAndDrop', () => {
  it('returns enabled:true when layout.dragAndDrop is true', () => {
    mockUseConfig.mockReturnValue({
      config: { layout: { dragAndDrop: true } } as never,
      isLoading: false,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useDragAndDrop());
    expect(result.current.enabled).toBe(true);
  });

  it('returns enabled:false when layout.dragAndDrop is false', () => {
    mockUseConfig.mockReturnValue({
      config: { layout: { dragAndDrop: false } } as never,
      isLoading: false,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useDragAndDrop());
    expect(result.current.enabled).toBe(false);
  });

  it('defaults to enabled:true when config is null (before load)', () => {
    mockUseConfig.mockReturnValue({
      config: null,
      isLoading: true,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useDragAndDrop());
    expect(result.current.enabled).toBe(true);
  });

  it('defaults to enabled:true when layout key is absent from config', () => {
    mockUseConfig.mockReturnValue({
      config: {} as never,
      isLoading: false,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useDragAndDrop());
    expect(result.current.enabled).toBe(true);
  });

  it('defaults to enabled:true when layout.dragAndDrop is undefined', () => {
    mockUseConfig.mockReturnValue({
      config: { layout: {} } as never,
      isLoading: false,
      error: null,
      set: vi.fn(),
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useDragAndDrop());
    expect(result.current.enabled).toBe(true);
  });
});

describe('useLayoutSensors', () => {
  const mockUseSensor = vi.mocked(useSensor);

  it('includes both PointerSensor and TouchSensor', () => {
    renderHook(() => useLayoutSensors());
    const sensorClasses = mockUseSensor.mock.calls.map((call) => call[0]);
    expect(sensorClasses).toContain(PointerSensor);
    expect(sensorClasses).toContain(TouchSensor);
  });

  it('configures TouchSensor with 500ms delay', () => {
    renderHook(() => useLayoutSensors());
    const touchCall = mockUseSensor.mock.calls.find((call) => call[0] === TouchSensor);
    expect(touchCall).toBeDefined();
    const opts = touchCall?.[1] as { activationConstraint: { delay: number; tolerance: number } };
    expect(opts.activationConstraint.delay).toBe(500);
  });

  it('configures TouchSensor with 5px tolerance for finger jitter', () => {
    renderHook(() => useLayoutSensors());
    const touchCall = mockUseSensor.mock.calls.find((call) => call[0] === TouchSensor);
    const opts = touchCall?.[1] as { activationConstraint: { delay: number; tolerance: number } };
    expect(opts.activationConstraint.tolerance).toBe(5);
  });
});
