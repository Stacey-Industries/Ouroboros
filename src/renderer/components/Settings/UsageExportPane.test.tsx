/**
 * UsageExportPane.test.tsx — Wave 37 Phase C
 * @vitest-environment jsdom
 *
 * Tests for UsageExportPane:
 *  - renders all four window picker radio buttons, 24h selected by default
 *  - "Export now" button calls IPC with correct windowStart <= windowEnd
 *  - shows success / error feedback after export
 *  - lastExportInfo readout renders when data is present, absent when null
 */

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock window.electronAPI ──────────────────────────────────────────────────

const mockExportUsage = vi.fn();
const mockLastExportInfo = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    ecosystem: {
      exportUsage: mockExportUsage,
      lastExportInfo: mockLastExportInfo,
      onPromptDiff: vi.fn(() => () => undefined),
    },
  },
});

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import { UsageExportPane } from './UsageExportPane';

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockLastExportInfo.mockResolvedValue({ success: true, info: null });
  mockExportUsage.mockResolvedValue({ success: true, rowsWritten: 0, path: '/tmp/out.jsonl' });
});

afterEach(() => {
  cleanup();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsageExportPane — window picker', () => {
  it('renders all four window radio buttons', () => {
    const { container } = render(<UsageExportPane />);
    expect(within(container).getAllByRole('radio')).toHaveLength(4);
  });

  it('defaults to "24h" selected', () => {
    const { container } = render(<UsageExportPane />);
    const radios = within(container).getAllByRole('radio') as HTMLInputElement[];
    const checked = radios.find((r) => r.checked);
    expect(checked?.value).toBe('24h');
  });
});

describe('UsageExportPane — export button', () => {
  it('calls exportUsage IPC on click', async () => {
    const { container } = render(<UsageExportPane />);
    fireEvent.click(within(container).getByRole('button', { name: /export now/i }));
    await waitFor(() => expect(mockExportUsage).toHaveBeenCalledOnce());
  });

  it('passes windowStart <= windowEnd to IPC', async () => {
    const { container } = render(<UsageExportPane />);
    fireEvent.click(within(container).getByRole('button', { name: /export now/i }));
    await waitFor(() => expect(mockExportUsage).toHaveBeenCalledOnce());
    const [opts] = mockExportUsage.mock.calls[0] as [
      { windowStart: number; windowEnd: number; outputPath: string },
    ];
    expect(opts.windowStart).toBeLessThanOrEqual(opts.windowEnd);
    expect(typeof opts.outputPath).toBe('string');
  });

  it('shows success message containing row count', async () => {
    mockExportUsage.mockResolvedValue({ success: true, rowsWritten: 17, path: '/tmp/out.jsonl' });
    const { container } = render(<UsageExportPane />);
    fireEvent.click(within(container).getByRole('button', { name: /export now/i }));
    // Status row p.text-status-success contains the message
    await waitFor(() => {
      const el = container.querySelector('.text-status-success');
      expect(el?.textContent).toMatch(/17 rows/i);
    });
  });

  it('shows error message on failure', async () => {
    mockExportUsage.mockResolvedValue({ success: false, error: 'parent dir missing' });
    const { container } = render(<UsageExportPane />);
    fireEvent.click(within(container).getByRole('button', { name: /export now/i }));
    await waitFor(() => {
      const el = container.querySelector('.text-status-error');
      expect(el?.textContent).toMatch(/parent dir missing/i);
    });
  });
});

describe('UsageExportPane — lastExportInfo readout', () => {
  it('renders last export path and row count when info present', async () => {
    mockLastExportInfo.mockResolvedValue({
      success: true,
      info: { path: '/tmp/export.jsonl', at: new Date('2026-04-17T10:00:00Z').getTime(), rows: 42 },
    });
    const { container } = render(<UsageExportPane />);
    await waitFor(() => {
      const muted = container.querySelector('.text-text-semantic-muted p, p.text-text-semantic-muted');
      expect(muted).not.toBeNull();
    });
    // The last-export paragraph includes the path and "42 rows"
    const allText = container.textContent ?? '';
    await waitFor(() => expect(container.textContent).toMatch(/export\.jsonl/));
    expect(allText || container.textContent).toMatch(/42/);
  });

  it('does not render last export section when info is null', async () => {
    mockLastExportInfo.mockResolvedValue({ success: true, info: null });
    const { container } = render(<UsageExportPane />);
    await waitFor(() => expect(mockLastExportInfo).toHaveBeenCalled());
    // No "Last export:" text in the document
    expect(container.textContent).not.toMatch(/last export:/i);
  });
});
