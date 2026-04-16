/**
 * SubagentPanelHost.test.tsx — Unit tests for SubagentPanelHost.
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubagentPanelHost } from './SubagentPanelHost';
import { OPEN_SUBAGENT_EVENT } from './ToolCallRow';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockLiveCount = vi.fn();
const mockOnUpdated = vi.fn(() => vi.fn());

beforeEach(() => {
  vi.clearAllMocks();

  mockGet.mockResolvedValue({ success: false, error: 'not found' });
  mockLiveCount.mockResolvedValue({ success: true, count: 0 });

  Object.defineProperty(window, 'electronAPI', {
    value: {
      subagent: {
        get: mockGet,
        liveCount: mockLiveCount,
        onUpdated: mockOnUpdated,
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dispatchOpenSubagent(toolCallId: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_SUBAGENT_EVENT, { detail: { toolCallId } }),
  );
}

// ─── Feature flag ─────────────────────────────────────────────────────────────

describe('SubagentPanelHost — feature flag', () => {
  it('renders nothing when enabled=false', () => {
    const { container } = render(<SubagentPanelHost enabled={false} />);
    dispatchOpenSubagent('tc-1');
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing before any event is dispatched (enabled=true)', () => {
    const { container } = render(<SubagentPanelHost enabled={true} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─── Opening via DOM event ────────────────────────────────────────────────────

describe('SubagentPanelHost — opens on event', () => {
  it('shows the drawer after OPEN_SUBAGENT_EVENT is dispatched', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-1');
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeTruthy(),
    );
  });

  it('shows unresolvable state when subagent cannot be resolved', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-unresolvable');
    await waitFor(() =>
      expect(screen.getByText(/subagent not found in tracker/i)).toBeTruthy(),
    );
  });

  it('shows the tool call id in the unresolvable state', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-abc-123');
    await waitFor(() =>
      expect(screen.getByText(/tc-abc-123/)).toBeTruthy(),
    );
  });
});

// ─── Closing ─────────────────────────────────────────────────────────────────

describe('SubagentPanelHost — close', () => {
  it('closes when the close button is clicked', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-2');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/close subagent panel/i));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull(),
    );
  });

  it('closes when the backdrop is clicked', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-3');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // backdrop is the sibling div before the dialog
    const backdrop = screen.getByRole('dialog').previousSibling as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull(),
    );
  });
});

// ─── Event listener lifecycle ─────────────────────────────────────────────────

describe('SubagentPanelHost — listener lifecycle', () => {
  it('ignores events with missing toolCallId', async () => {
    const { container } = render(<SubagentPanelHost />);
    window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_EVENT, { detail: {} }));
    await new Promise((r) => setTimeout(r, 10));
    expect(container.firstChild).toBeNull();
  });

  it('stops listening after unmount', async () => {
    const { unmount } = render(<SubagentPanelHost />);
    unmount();
    dispatchOpenSubagent('tc-after-unmount');
    await new Promise((r) => setTimeout(r, 10));
    // no dialog should be mounted — component is gone
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
