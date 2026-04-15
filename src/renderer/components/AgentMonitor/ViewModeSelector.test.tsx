/**
 * ViewModeSelector.test.tsx — Unit tests for the ViewModeSelector component.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewModeSelector } from './ViewModeSelector';

// ─── electronAPI stub ─────────────────────────────────────────────────────────

const mockRecord = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: { telemetry: { record: mockRecord } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ViewModeSelector — rendering', () => {
  it('renders all three mode buttons', () => {
    render(<ViewModeSelector value="normal" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /verbose/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /normal/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /summary/i })).toBeTruthy();
  });

  it('marks the active mode button as pressed', () => {
    render(<ViewModeSelector value="summary" onChange={vi.fn()} />);
    const summaryBtn = screen.getByRole('button', { name: /summary/i });
    expect(summaryBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks inactive mode buttons as not pressed', () => {
    render(<ViewModeSelector value="normal" onChange={vi.fn()} />);
    const verboseBtn = screen.getByRole('button', { name: /verbose/i });
    const summaryBtn = screen.getByRole('button', { name: /summary/i });
    expect(verboseBtn.getAttribute('aria-pressed')).toBe('false');
    expect(summaryBtn.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ViewModeSelector — onChange', () => {
  it('calls onChange when a different mode is clicked', () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="normal" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /verbose/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('verbose');
  });

  it('does not call onChange when the active mode is clicked again', () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="normal" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /normal/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange with summary when summary is clicked', () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="verbose" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /summary/i }));
    expect(onChange).toHaveBeenCalledWith('summary');
  });
});

describe('ViewModeSelector — telemetry', () => {
  it('fires telemetry record on mode change', async () => {
    render(<ViewModeSelector value="normal" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /verbose/i }));
    // allow microtask flush
    await Promise.resolve();
    expect(mockRecord).toHaveBeenCalledWith({
      kind: 'agent_monitor.view_mode',
      data: { viewMode: 'verbose' },
    });
  });

  it('does not fire telemetry when active mode clicked', async () => {
    render(<ViewModeSelector value="normal" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /normal/i }));
    await Promise.resolve();
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
