/**
 * @vitest-environment jsdom
 *
 * System2IndexProgress.test.tsx — unit tests for the System 2 initial-index
 * progress toast component.
 *
 * Verifies:
 * - subscribes on mount, unsubscribes on unmount
 * - renders nothing when no progress event received
 * - renders progress indicator when a 'start' + 'progress' event arrives
 * - hides on 'complete' event
 * - hides on 'error' event
 */

import { act,cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { System2IndexProgressEvent } from '../../types/electron';
import { System2IndexProgress } from './System2IndexProgress';

type ProgressCallback = (event: System2IndexProgressEvent) => void;
type OnIndexProgress = (cb: ProgressCallback) => () => void;
type WindowRecord = Record<string, unknown>;

afterEach(() => {
  cleanup();
  delete (window as unknown as WindowRecord).electronAPI;
});

function makeElectronAPI(onIndexProgress?: OnIndexProgress) {
  return {
    system2: {
      onIndexProgress: onIndexProgress ?? (vi.fn(() => vi.fn()) as unknown as OnIndexProgress),
    },
  };
}

describe('System2IndexProgress', () => {
  let capturedCallback: ProgressCallback | null = null;
  let unsubscribeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedCallback = null;
    unsubscribeSpy = vi.fn();
    const onIndexProgress: OnIndexProgress = (cb) => {
      capturedCallback = cb;
      return unsubscribeSpy as unknown as () => void;
    };
    (window as unknown as WindowRecord).electronAPI = makeElectronAPI(onIndexProgress);
  });

  it('renders nothing when no progress event has been received', () => {
    const { container } = render(<System2IndexProgress />);
    expect(container.firstChild).toBeNull();
  });

  it('subscribes to onIndexProgress on mount', () => {
    render(<System2IndexProgress />);
    expect(capturedCallback).not.toBeNull();
  });

  it('calls the unsubscribe function on unmount', () => {
    const { unmount } = render(<System2IndexProgress />);
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledOnce();
  });

  it('shows a progress indicator after a start event', () => {
    render(<System2IndexProgress />);

    act(() => {
      capturedCallback?.({
        kind: 'start',
        projectName: 'my-project',
        projectRoot: '/projects/my-project',
        reason: 'first-launch',
      });
    });

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText(/Indexing my-project/i)).toBeDefined();
  });

  it('updates the file counts after a progress event', () => {
    render(<System2IndexProgress />);

    act(() => {
      capturedCallback?.({
        kind: 'start',
        projectName: 'my-project',
        projectRoot: '/projects/my-project',
        reason: 'first-launch',
      });
    });
    act(() => {
      capturedCallback?.({
        kind: 'progress',
        projectName: 'my-project',
        phase: 'parsing',
        filesProcessed: 42,
        filesTotal: 100,
        elapsedMs: 1500,
      });
    });

    expect(screen.getByText(/42 \/ 100/)).toBeDefined();
  });

  it('hides on a complete event', () => {
    render(<System2IndexProgress />);

    act(() => {
      capturedCallback?.({
        kind: 'start',
        projectName: 'my-project',
        projectRoot: '/projects/my-project',
        reason: 'first-launch',
      });
    });
    act(() => {
      capturedCallback?.({
        kind: 'complete',
        projectName: 'my-project',
        filesIndexed: 100,
        nodesCreated: 500,
        durationMs: 3000,
      });
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hides on an error event', () => {
    render(<System2IndexProgress />);

    act(() => {
      capturedCallback?.({
        kind: 'start',
        projectName: 'my-project',
        projectRoot: '/projects/my-project',
        reason: 'first-launch',
      });
    });
    act(() => {
      capturedCallback?.({
        kind: 'error',
        projectName: 'my-project',
        message: 'worker crashed',
      });
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing when system2 API is absent (system2.enabled=false)', () => {
    (window as unknown as WindowRecord).electronAPI = {};
    const { container } = render(<System2IndexProgress />);
    expect(container.firstChild).toBeNull();
  });
});
