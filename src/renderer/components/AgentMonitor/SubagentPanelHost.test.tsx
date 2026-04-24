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
let currentSessions = [] as Array<{
  id: string;
  parentSessionId?: string;
  startedAt: number;
  status: 'running' | 'complete' | 'error' | 'idle';
  taskLabel: string;
  toolCalls: Array<unknown>;
}>;

vi.mock('../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions,
    historicalSessions: [],
    agents: currentSessions,
    activeCount: currentSessions.filter((session) => session.status === 'running').length,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));

vi.mock('./SubagentPanel', () => ({
  SubagentPanel: ({
    subagentId,
    parentSessionId,
    onClose,
  }: {
    subagentId: string;
    parentSessionId: string;
    onClose?: () => void;
  }) => (
    <div data-testid="mock-subagent-panel">
      <span>{subagentId}</span>
      <span>{parentSessionId}</span>
      {onClose && (
        <button type="button" aria-label="Close subagent panel" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  currentSessions = [];

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

function dispatchOpenSubagent(
  toolCallId: string,
  extra: Partial<{ parentSessionId: string; timestamp: number }> = {},
): void {
  window.dispatchEvent(new CustomEvent(OPEN_SUBAGENT_EVENT, { detail: { toolCallId, ...extra } }));
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
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('shows unresolvable state when subagent cannot be resolved', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-unresolvable');
    await waitFor(() => expect(screen.getByText(/subagent not found in tracker/i)).toBeTruthy());
  });

  it('shows the tool call id in the unresolvable state', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-abc-123');
    await waitFor(() => expect(screen.getByText(/tc-abc-123/)).toBeTruthy());
  });

  it('resolves the correct child session when parent context and timestamp are provided', async () => {
    currentSessions = [
      {
        id: 'sub-1',
        parentSessionId: 'parent-1',
        startedAt: 1_100,
        status: 'running',
        taskLabel: 'Investigate',
        toolCalls: [],
      },
    ];
    mockGet.mockResolvedValue({
      success: true,
      record: {
        id: 'sub-1',
        parentSessionId: 'parent-1',
        taskLabel: 'Investigate',
        status: 'running',
        startedAt: 1_100,
        endedAt: undefined,
        usdCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        messages: [],
      },
    });

    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-1', { parentSessionId: 'parent-1', timestamp: 1_000 });

    await waitFor(() => expect(screen.getByTestId('mock-subagent-panel')).toBeTruthy());
    expect(screen.getByText('sub-1')).toBeTruthy();
  });

  it('replaces the resolved transcript when a second tool call opens a newer child', async () => {
    currentSessions = [
      {
        id: 'sub-1',
        parentSessionId: 'parent-1',
        startedAt: 1_100,
        status: 'complete',
        taskLabel: 'First',
        toolCalls: [],
      },
      {
        id: 'sub-2',
        parentSessionId: 'parent-1',
        startedAt: 2_100,
        status: 'running',
        taskLabel: 'Second',
        toolCalls: [],
      },
    ];
    mockGet.mockResolvedValue({
      success: true,
      record: {
        id: 'sub-2',
        parentSessionId: 'parent-1',
        taskLabel: 'Second',
        status: 'running',
        startedAt: 2_100,
        endedAt: undefined,
        usdCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        messages: [],
      },
    });

    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-1', { parentSessionId: 'parent-1', timestamp: 1_000 });
    await waitFor(() => expect(screen.getByText('sub-1')).toBeTruthy());

    dispatchOpenSubagent('tc-2', { parentSessionId: 'parent-1', timestamp: 2_000 });
    await waitFor(() => expect(screen.getByText('sub-2')).toBeTruthy());
  });
});

// ─── Closing ─────────────────────────────────────────────────────────────────

describe('SubagentPanelHost — close', () => {
  it('closes when the close button is clicked', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-2');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/close subagent panel/i));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when the backdrop is clicked', async () => {
    render(<SubagentPanelHost />);
    dispatchOpenSubagent('tc-3');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // backdrop is the sibling div before the dialog
    const backdrop = screen.getByRole('dialog').previousSibling as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
