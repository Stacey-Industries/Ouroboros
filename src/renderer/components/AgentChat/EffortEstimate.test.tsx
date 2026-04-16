/**
 * @vitest-environment jsdom
 *
 * EffortEstimate.test.tsx — Unit tests for the EffortEstimate composer pill.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EffortEstimate } from './EffortEstimate';

// ─── Mock window.electronAPI ─────────────────────────────────────────────────

const mockEstimate = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      profileCrud: {
        estimate: mockEstimate,
      },
    },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EffortEstimate', () => {
  it('renders nothing when profileId is null', () => {
    const { container } = render(
      <EffortEstimate profileId={null} contextTokens={1000} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when profileId is undefined', () => {
    const { container } = render(
      <EffortEstimate profileId={undefined} contextTokens={1000} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while estimate is loading', () => {
    mockEstimate.mockReturnValue(new Promise(() => undefined)); // never resolves
    const { container } = render(
      <EffortEstimate profileId="p1" contextTokens={1000} />,
    );
    // Before debounce fires — still nothing
    expect(container.firstChild).toBeNull();
  });

  it('shows formatted estimate after debounce resolves', async () => {
    mockEstimate.mockResolvedValue({
      success: true,
      estimatedMs: 3200,
      estimatedUsd: 0.024,
    });

    render(<EffortEstimate profileId="p1" contextTokens={5000} />);

    // Fire debounce timer, then flush the resolved promise microtasks
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const pill = screen.getByTitle(/estimated latency/i);
    expect(pill.textContent).toContain('3.2s');
    expect(pill.textContent).toContain('$0.02');
  });

  it('formats sub-millisecond values correctly', async () => {
    mockEstimate.mockResolvedValue({
      success: true,
      estimatedMs: 500,
      estimatedUsd: 0.00045,
    });

    render(<EffortEstimate profileId="p2" contextTokens={100} />);

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    const pill = screen.getByTitle(/estimated latency/i);
    expect(pill.textContent).toContain('500ms');
    expect(pill.textContent).toContain('<$0.001');
  });

  it('hides pill when IPC returns success: false', async () => {
    mockEstimate.mockResolvedValue({ success: false, error: 'not found' });

    const { container } = render(
      <EffortEstimate profileId="missing" contextTokens={1000} />,
    );

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(container.firstChild).toBeNull();
  });

  it('calls estimate with correct profileId and contextTokens', async () => {
    mockEstimate.mockResolvedValue({
      success: true,
      estimatedMs: 2000,
      estimatedUsd: 0.01,
    });

    render(<EffortEstimate profileId="abc" contextTokens={9876} />);

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(mockEstimate).toHaveBeenCalledWith({
      profileId: 'abc',
      contextTokens: 9876,
    });
  });
});
