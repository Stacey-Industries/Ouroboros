/**
 * @vitest-environment jsdom
 *
 * useTerminalSetupCleanup — Phase 2 regression tests
 *
 * These tests verify cleanup contracts for timers and observers:
 *   1. Single mount/unmount cycles clear all timer refs
 *   2. ResizeObserver is disconnected on unmount
 *   3. 100-cycle stress test detects no leaked handles
 *   4. Cleanup is idempotent (calling twice is safe)
 *   5. Mid-cycle timers are cleared if unmount fires before timeout completes
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies that useTerminalSetup imports
vi.mock('./terminalAddonManifest', () => ({
  TERMINAL_ADDONS: [],
}));

vi.mock('./terminalRegistry', () => ({
  registerTerminal: vi.fn(),
  unregisterTerminal: vi.fn(),
}));

import type {
  AttachedTerminalDisposables,
  TerminalSetupLifecycleContext,
} from './useTerminalSetup.shared';
import { cleanupTerminalSetup } from './useTerminalSetupCleanup';

function createMockTerminal() {
  return {
    dispose: vi.fn(),
    rows: 24,
    cols: 80,
  } as unknown as import('@xterm/xterm').Terminal;
}

function createMockDisposables(): AttachedTerminalDisposables {
  return {
    filePathLink: { dispose: vi.fn() },
    oscFg: { dispose: vi.fn() },
    oscBg: { dispose: vi.fn() },
    oscCursor: { dispose: vi.fn() },
    titleD: { dispose: vi.fn() },
    dataCleanup: vi.fn(),
    inputD: { dispose: vi.fn() },
    histKeyD: { dispose: vi.fn() },
    selD: { dispose: vi.fn() },
    ro: {
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    } as unknown as ResizeObserver,
    clickHandler: vi.fn(),
    mouseUpHandler: vi.fn(),
  };
}

function createMockContext(sessionId: string): TerminalSetupLifecycleContext {
  return {
    sessionId,
    refs: {
      containerRef: { current: null },
      terminalRef: { current: null },
      fitAddonRef: { current: null },
      searchAddonRef: { current: null },
      shellIntegrationAddonRef: { current: null },
      progressAddonRef: { current: null },
      serializeAddonRef: { current: null },
      isReadyRef: { current: false },
      webglAddonRef: { current: null },
      webglFailedRef: { current: false },
    },
    callbacks: {
      setPendingPaste: vi.fn(),
      setShowSearch: vi.fn(),
      setRichInputActive: vi.fn(),
      setShowCmdSearch: vi.fn(),
      setCmdHistory: vi.fn(),
      setSelectionTooltip: vi.fn(),
    },
    completionState: {} as never,
    historyRefs: {} as never,
    suggestionControls: {} as never,
    handleTabCompletionRef: { current: null },
    syncInputRef: { current: false },
    allSessionIdsRef: { current: [] },
    projectRootRef: { current: null },
    commandBlocksRef: { current: {} as never },
    runtimeRefs: {
      rafIdRef: { current: 0 },
      resizeDebounceRef: { current: null },
      clickCountRef: { current: 0 },
      clickResetTimerRef: { current: null },
      osc133EnabledRef: { current: null },
      osc133GraceTimerRef: { current: null },
      osc133FirstOutputRef: { current: false },
      currentBlockRef: { current: null },
      blockDecorationDisposablesRef: { current: [] },
      writeBufferRef: { current: '' },
      writeRafRef: { current: 0 },
      pendingOsc133Ref: { current: [] },
    },
    fit: vi.fn(),
  };
}

function createMockContainer(): HTMLDivElement {
  return document.createElement('div');
}

describe('useTerminalSetupCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('single mount/unmount cycles', () => {
    it('clears resizeDebounceRef on unmount', () => {
      const context = createMockContext('session-1');
      const mockTimer = vi.fn();
      context.runtimeRefs.resizeDebounceRef.current = setTimeout(mockTimer, 100);
      expect(context.runtimeRefs.resizeDebounceRef.current).not.toBe(null);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(context.runtimeRefs.resizeDebounceRef.current).toBe(null);
    });

    it('clears osc133GraceTimerRef on unmount', () => {
      const context = createMockContext('session-2');
      const mockTimer = vi.fn();
      context.runtimeRefs.osc133GraceTimerRef.current = setTimeout(mockTimer, 100);
      expect(context.runtimeRefs.osc133GraceTimerRef.current).not.toBe(null);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(context.runtimeRefs.osc133GraceTimerRef.current).toBe(null);
    });

    it('clears clickResetTimerRef on unmount', () => {
      const context = createMockContext('session-3');
      const mockTimer = vi.fn();
      context.runtimeRefs.clickResetTimerRef.current = setTimeout(mockTimer, 100);
      expect(context.runtimeRefs.clickResetTimerRef.current).not.toBe(null);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(context.runtimeRefs.clickResetTimerRef.current).toBe(null);
    });

    it('disconnects ResizeObserver on unmount', () => {
      const context = createMockContext('session-4');
      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(disposables.ro.disconnect).toHaveBeenCalled();
    });
  });

  describe('100-cycle stress test', () => {
    it('mount/unmount × 100 leaves no leaked timers', () => {
      for (let i = 0; i < 100; i++) {
        const context = createMockContext(`session-${i}`);
        context.runtimeRefs.resizeDebounceRef.current = setTimeout(() => {}, 50);
        context.runtimeRefs.osc133GraceTimerRef.current = setTimeout(() => {}, 100);
        context.runtimeRefs.clickResetTimerRef.current = setTimeout(() => {}, 75);

        const term = createMockTerminal();
        const disposables = createMockDisposables();
        const container = createMockContainer();

        cleanupTerminalSetup(context, container, term, disposables);

        expect(context.runtimeRefs.resizeDebounceRef.current).toBe(null);
        expect(context.runtimeRefs.osc133GraceTimerRef.current).toBe(null);
        expect(context.runtimeRefs.clickResetTimerRef.current).toBe(null);
      }

      // After 100 cycles, pending timers should be zero
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('cleanup idempotency', () => {
    it('calling cleanup twice does not throw', () => {
      const context = createMockContext('session-5');
      context.runtimeRefs.resizeDebounceRef.current = setTimeout(() => {}, 100);
      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      expect(() => {
        cleanupTerminalSetup(context, container, term, disposables);
        cleanupTerminalSetup(context, container, term, disposables);
      }).not.toThrow();

      expect(context.runtimeRefs.resizeDebounceRef.current).toBe(null);
    });
  });

  describe('mid-cycle timer cancellation', () => {
    it('clears resizeDebounceRef if unmount fires before timeout completes', () => {
      const context = createMockContext('session-6');
      const mockTimer = vi.fn();
      context.runtimeRefs.resizeDebounceRef.current = setTimeout(mockTimer, 100);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      // Unmount before timeout (which would occur at 100ms)
      vi.advanceTimersByTime(50);
      cleanupTerminalSetup(context, container, term, disposables);

      // Advance past the timeout — mock should NOT have been called
      vi.advanceTimersByTime(100);
      expect(mockTimer).not.toHaveBeenCalled();
      expect(context.runtimeRefs.resizeDebounceRef.current).toBe(null);
    });

    it('clears osc133GraceTimerRef if unmount fires before timeout completes', () => {
      const context = createMockContext('session-7');
      const mockTimer = vi.fn();
      context.runtimeRefs.osc133GraceTimerRef.current = setTimeout(mockTimer, 500);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      // Unmount before timeout completes
      vi.advanceTimersByTime(100);
      cleanupTerminalSetup(context, container, term, disposables);

      // Advance to where the timeout would have fired
      vi.advanceTimersByTime(500);
      expect(mockTimer).not.toHaveBeenCalled();
      expect(context.runtimeRefs.osc133GraceTimerRef.current).toBe(null);
    });
  });

  describe('animation frame cleanup', () => {
    it('cancels pending animation frames on unmount', () => {
      const context = createMockContext('session-8');
      const mockRaf = vi.fn();
      context.runtimeRefs.rafIdRef.current = requestAnimationFrame(mockRaf);
      expect(context.runtimeRefs.rafIdRef.current).not.toBe(0);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(context.runtimeRefs.rafIdRef.current).toBe(0);
    });

    it('cancels pending write animation frames on unmount', () => {
      const context = createMockContext('session-9');
      const mockRaf = vi.fn();
      context.runtimeRefs.writeRafRef.current = requestAnimationFrame(mockRaf);
      expect(context.runtimeRefs.writeRafRef.current).not.toBe(0);

      const term = createMockTerminal();
      const disposables = createMockDisposables();
      const container = createMockContainer();

      cleanupTerminalSetup(context, container, term, disposables);

      expect(context.runtimeRefs.writeRafRef.current).toBe(0);
    });
  });
});
