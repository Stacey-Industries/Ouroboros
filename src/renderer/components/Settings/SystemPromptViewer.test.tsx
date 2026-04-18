/**
 * SystemPromptViewer.test.tsx — jsdom smoke tests for the viewer component.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemPromptViewer } from './SystemPromptViewer';

// ── Clipboard mock ────────────────────────────────────────────────────────────

const mockWriteText = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SystemPromptViewer', () => {
  const TEXT = 'You are a helpful assistant.\nBe concise.';
  const CAPTURED_AT = new Date('2026-04-17T10:00:00').getTime();

  it('renders the prompt text in a pre element', async () => {
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe(TEXT);
  });

  it('renders a copy button', async () => {
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    expect(screen.getByRole('button', { name: /copy/i })).toBeDefined();
  });

  it('calls clipboard API when copy button clicked', async () => {
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    });
    expect(mockWriteText).toHaveBeenCalledWith(TEXT);
  });

  it('shows Copied! label briefly after copy', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
      await Promise.resolve(); // flush the clipboard promise
    });
    expect(screen.getByRole('button').textContent).toBe('Copied!');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button').textContent).toBe('Copy');
    vi.useRealTimers();
  });

  it('renders captured-at timestamp text', async () => {
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    // The component renders "Captured at <time> (first turn of session)"
    expect(screen.getByText(/captured at/i)).toBeDefined();
  });

  it('does not throw when clipboard API is unavailable', async () => {
    mockWriteText.mockRejectedValue(new Error('no clipboard'));
    await act(async () => {
      render(<SystemPromptViewer capturedAt={CAPTURED_AT} text={TEXT} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    });
    // Should fail silently — component still mounted
    expect(screen.getByRole('button')).toBeDefined();
  });
});
