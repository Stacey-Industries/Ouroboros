/**
 * SubagentPanel.test.tsx — Unit tests for the SubagentPanel component.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubagentRecord } from '../../types/electron';
import { SubagentPanel } from './SubagentPanel';

// jsdom has no layout engine, so the real useVirtualizer would report
// clientHeight=0 and yield an empty getVirtualItems() — the transcript list
// stays blank and assertions like `getByText('Hello subagent')` time out.
// Mirror the canonical pattern used in SessionVirtualList.test.tsx.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: (i: number) => number;
  }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, i) => {
      const size = estimateSize(i);
      const item = { index: i, key: i, start: offset, size };
      offset += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset,
      measureElement: () => undefined,
    };
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SubagentRecord> = {}): SubagentRecord {
  return {
    id: 'sub-1',
    parentSessionId: 'parent-1',
    status: 'running',
    startedAt: Date.now() - 5000,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usdCost: 0.0025,
    messages: [],
    ...overrides,
  };
}

// ─── Mock API ─────────────────────────────────────────────────────────────────

type OnUpdatedCb = (event: { parentSessionId: string }) => void;
let onUpdatedCallback: OnUpdatedCb | null = null;

const mockGet = vi.fn();
const mockCancel = vi.fn();
const mockOnUpdated = vi.fn((cb: OnUpdatedCb) => {
  onUpdatedCallback = cb;
  return vi.fn();
});

const mockToast = vi.fn();
vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  onUpdatedCallback = null;

  Object.defineProperty(window, 'electronAPI', {
    value: {
      subagent: {
        get: mockGet,
        cancel: mockCancel,
        onUpdated: mockOnUpdated,
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('SubagentPanel — loading', () => {
  it('shows loading state while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    expect(screen.getByText(/loading subagent data/i)).toBeTruthy();
  });
});

describe('SubagentPanel — success', () => {
  it('renders task label from record', async () => {
    const record = makeRecord({ taskLabel: 'Run tests' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText('Run tests')).toBeTruthy());
  });

  it('renders status chip', async () => {
    const record = makeRecord({ status: 'completed' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/completed/i)).toBeTruthy());
  });

  it('renders cost when non-zero', async () => {
    const record = makeRecord({ usdCost: 0.0025 });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/\$0\.0025/)).toBeTruthy());
  });

  it('renders "No messages yet." when message list is empty', async () => {
    const record = makeRecord({ messages: [] });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/no messages yet/i)).toBeTruthy());
  });

  it('renders messages in the list', async () => {
    const record = makeRecord({
      messages: [
        { role: 'user', content: 'Hello subagent', at: Date.now() },
        { role: 'assistant', content: 'Hello parent', at: Date.now() + 100 },
      ],
    });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText('Hello subagent')).toBeTruthy());
    expect(screen.getByText('Hello parent')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', async () => {
    const record = makeRecord();
    mockGet.mockResolvedValue({ success: true, record });
    const onClose = vi.fn();
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByLabelText(/close subagent panel/i)).toBeTruthy());
    screen.getByLabelText(/close subagent panel/i).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('SubagentPanel — error states', () => {
  it('shows error when get returns failure', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'Not found' });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeTruthy());
  });

  it('shows error when record is null', async () => {
    mockGet.mockResolvedValue({ success: true, record: null });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeTruthy());
  });

  it('shows error on thrown exception', async () => {
    mockGet.mockRejectedValue(new Error('Network failure'));
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText(/network failure/i)).toBeTruthy());
  });
});

describe('SubagentPanel — cancel button', () => {
  it('shows Cancel button when showCancel=true and status=running', async () => {
    const record = makeRecord({ status: 'running' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" showCancel />);
    await waitFor(() => expect(screen.getByLabelText(/cancel subagent/i)).toBeTruthy());
  });

  it('hides Cancel button when showCancel=false', async () => {
    const record = makeRecord({ status: 'running' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" showCancel={false} />);
    await waitFor(() => expect(screen.queryByLabelText(/cancel subagent/i)).toBeNull());
  });

  it('hides Cancel button when status=completed even with showCancel=true', async () => {
    const record = makeRecord({ status: 'completed' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" showCancel />);
    await waitFor(() => expect(screen.getByText(/completed/i)).toBeTruthy());
    expect(screen.queryByLabelText(/cancel subagent/i)).toBeNull();
  });

  it('calls cancel IPC and shows success toast on click', async () => {
    const record = makeRecord({ status: 'running' });
    mockGet.mockResolvedValue({ success: true, record });
    mockCancel.mockResolvedValue({ success: true });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" showCancel />);
    await waitFor(() => expect(screen.getByLabelText(/cancel subagent/i)).toBeTruthy());
    screen.getByLabelText(/cancel subagent/i).click();
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith({ subagentId: 'sub-1' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Subagent cancelled', 'success'));
  });

  it('shows error toast when cancel IPC fails', async () => {
    const record = makeRecord({ status: 'running' });
    mockGet.mockResolvedValue({ success: true, record });
    mockCancel.mockResolvedValue({ success: false, error: 'Not found' });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" showCancel />);
    await waitFor(() => expect(screen.getByLabelText(/cancel subagent/i)).toBeTruthy());
    screen.getByLabelText(/cancel subagent/i).click();
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Not found', 'error'));
  });
});

describe('SubagentPanel — live updates', () => {
  it('reloads when onUpdated fires for the same parent session', async () => {
    const record = makeRecord({ taskLabel: 'First task' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText('First task')).toBeTruthy());

    const updated = makeRecord({ taskLabel: 'Updated task' });
    mockGet.mockResolvedValue({ success: true, record: updated });

    onUpdatedCallback?.({ parentSessionId: 'parent-1' });
    await waitFor(() => expect(screen.getByText('Updated task')).toBeTruthy());
  });

  it('does not reload when onUpdated fires for a different parent session', async () => {
    const record = makeRecord({ taskLabel: 'My task' });
    mockGet.mockResolvedValue({ success: true, record });
    render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(screen.getByText('My task')).toBeTruthy());

    mockGet.mockClear();
    onUpdatedCallback?.({ parentSessionId: 'other-parent' });
    // give a tick for any potential re-render
    await new Promise((r) => setTimeout(r, 10));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('subscribes and unsubscribes from onUpdated', async () => {
    const record = makeRecord();
    mockGet.mockResolvedValue({ success: true, record });
    const { unmount } = render(<SubagentPanel subagentId="sub-1" parentSessionId="parent-1" />);
    await waitFor(() => expect(mockOnUpdated).toHaveBeenCalledOnce());
    unmount();
    // cleanup fn should have been called (the vi.fn() returned by mockOnUpdated)
    const cleanupFn = mockOnUpdated.mock.results[0].value;
    expect(cleanupFn).toHaveBeenCalled();
  });
});
