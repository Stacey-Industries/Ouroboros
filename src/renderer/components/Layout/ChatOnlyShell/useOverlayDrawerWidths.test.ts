/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadOverlayWidths,
  saveOverlayWidths,
  useOverlayDrawerWidths,
} from './useOverlayDrawerWidths';

const PERSIST_KEY = 'agent-ide:dock-persistence';

describe('loadOverlayWidths', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when storage is empty', () => {
    const result = loadOverlayWidths();
    expect(result.overlayDrawerWidth).toBe(380);
    expect(result.artifactOverlayWidth).toBe(480);
  });

  it('reads persisted values from storage', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        terminalDockSlots: { primary: 160, secondary: 100 },
        overlayDrawerWidth: 420,
        artifactOverlayWidth: 550,
      }),
    );
    const result = loadOverlayWidths();
    expect(result.overlayDrawerWidth).toBe(420);
    expect(result.artifactOverlayWidth).toBe(550);
  });

  it('falls back to defaults when storage JSON is corrupt', () => {
    localStorage.setItem(PERSIST_KEY, 'not-json');
    const result = loadOverlayWidths();
    expect(result.overlayDrawerWidth).toBe(380);
    expect(result.artifactOverlayWidth).toBe(480);
  });
});

describe('saveOverlayWidths', () => {
  beforeEach(() => localStorage.clear());

  it('writes overlayDrawerWidth without clobbering other keys', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        terminalDockSlots: { primary: 200, secondary: 120 },
        overlayDrawerWidth: 380,
        artifactOverlayWidth: 480,
      }),
    );
    saveOverlayWidths({ overlayDrawerWidth: 450 });
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved.overlayDrawerWidth).toBe(450);
    expect(saved.artifactOverlayWidth as number).toBe(480);
    // legacy key must be absent
    expect(Object.prototype.hasOwnProperty.call(saved, 'dockHeight')).toBe(false);
  });

  it('writes artifactOverlayWidth without clobbering other keys', () => {
    saveOverlayWidths({ artifactOverlayWidth: 600 });
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved.artifactOverlayWidth).toBe(600);
    expect(saved.overlayDrawerWidth).toBe(380);
  });

  it('drops the legacy dockHeight key on write', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ dockHeight: 280, overlayDrawerWidth: 380, artifactOverlayWidth: 480 }),
    );
    saveOverlayWidths({ overlayDrawerWidth: 400 });
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(saved, 'dockHeight')).toBe(false);
    expect(saved.overlayDrawerWidth).toBe(400);
  });
});

describe('useOverlayDrawerWidths', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default widths on cold boot', () => {
    const { result } = renderHook(() => useOverlayDrawerWidths());
    expect(result.current.overlayDrawerWidth).toBe(380);
    expect(result.current.artifactOverlayWidth).toBe(480);
  });

  it('setOverlayDrawerWidth updates state and persists to storage', () => {
    const { result } = renderHook(() => useOverlayDrawerWidths());
    act(() => {
      result.current.setOverlayDrawerWidth(440);
    });
    expect(result.current.overlayDrawerWidth).toBe(440);
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved.overlayDrawerWidth).toBe(440);
  });

  it('setArtifactOverlayWidth updates state and persists to storage', () => {
    const { result } = renderHook(() => useOverlayDrawerWidths());
    act(() => {
      result.current.setArtifactOverlayWidth(520);
    });
    expect(result.current.artifactOverlayWidth).toBe(520);
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as Record<string, unknown>;
    expect(saved.artifactOverlayWidth).toBe(520);
  });

  it('persisted width is loaded on next mount (simulates reload)', () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        terminalDockSlots: { primary: 160, secondary: 100 },
        overlayDrawerWidth: 430,
        artifactOverlayWidth: 510,
      }),
    );
    const { result } = renderHook(() => useOverlayDrawerWidths());
    expect(result.current.overlayDrawerWidth).toBe(430);
    expect(result.current.artifactOverlayWidth).toBe(510);
  });
});
