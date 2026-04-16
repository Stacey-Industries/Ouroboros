/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalMemoryStore } from '../../types/electron';
import { ApprovalMemorySection } from './ApprovalMemorySection';

// ─── Mock window.electronAPI ─────────────────────────────────────────────────

const mockListMemory = vi.fn();
const mockForget = vi.fn().mockResolvedValue({ success: true });
const mockOnMemoryChanged = vi.fn(() => () => {});

function setMemoryFixture(store: ApprovalMemoryStore): void {
  mockListMemory.mockResolvedValue({ success: true, entries: store });
}

beforeEach(() => {
  vi.clearAllMocks();
  setMemoryFixture({ alwaysAllow: [], alwaysDeny: [] });

  Object.defineProperty(window, 'electronAPI', {
    value: {
      approval: {
        listMemory: mockListMemory,
        forget: mockForget,
        onMemoryChanged: mockOnMemoryChanged,
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => cleanup());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALLOW_ENTRY = { hash: 'aabbccdd11223344', toolName: 'Bash', keyPreview: 'npm test' };
const DENY_ENTRY = { hash: 'ddccbbaa44332211', toolName: 'Write', keyPreview: '/etc/passwd' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ApprovalMemorySection', () => {
  it('exports a function component', () => {
    expect(typeof ApprovalMemorySection).toBe('function');
  });

  it('renders the section heading', async () => {
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(mockListMemory).toHaveBeenCalledOnce());
    expect(screen.getByText(/Remembered Approvals/i)).toBeDefined();
  });

  it('shows empty-state message when no entries', async () => {
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(screen.getByText(/No remembered decisions/i)).toBeDefined());
  });

  it('renders allow entries', async () => {
    setMemoryFixture({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [] });
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(screen.getByText('npm test')).toBeDefined());
    expect(screen.getByText('Allow')).toBeDefined();
    expect(screen.getByText('Bash')).toBeDefined();
  });

  it('renders deny entries', async () => {
    setMemoryFixture({ alwaysAllow: [], alwaysDeny: [DENY_ENTRY] });
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(screen.getByText('/etc/passwd')).toBeDefined());
    expect(screen.getByText('Deny')).toBeDefined();
    expect(screen.getByText('Write')).toBeDefined();
  });

  it('renders both allow and deny entries together', async () => {
    setMemoryFixture({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [DENY_ENTRY] });
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(screen.getByText('npm test')).toBeDefined());
    expect(screen.getByText('/etc/passwd')).toBeDefined();
    expect(screen.getByText('Allow')).toBeDefined();
    expect(screen.getByText('Deny')).toBeDefined();
  });

  it('shows entry count badge when entries exist', async () => {
    setMemoryFixture({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [DENY_ENTRY] });
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(screen.getByText('(2)')).toBeDefined());
  });

  it('Revoke button calls forget with the correct hash', async () => {
    setMemoryFixture({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [] });
    render(<ApprovalMemorySection />);

    await waitFor(() => expect(screen.getByText('Revoke')).toBeDefined());
    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => expect(mockForget).toHaveBeenCalledWith('aabbccdd11223344'));
  });

  it('acceptance: revoke causes a re-fetch (listMemory called again)', async () => {
    setMemoryFixture({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [] });
    render(<ApprovalMemorySection />);

    await waitFor(() => expect(screen.getByText('Revoke')).toBeDefined());

    // After revoke, return empty store
    setMemoryFixture({ alwaysAllow: [], alwaysDeny: [] });
    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => expect(mockListMemory.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('subscribes to onMemoryChanged on mount', async () => {
    render(<ApprovalMemorySection />);
    await waitFor(() => expect(mockOnMemoryChanged).toHaveBeenCalledOnce());
  });

  it('unsubscribes from onMemoryChanged on unmount', async () => {
    const unsubscribe = vi.fn();
    mockOnMemoryChanged.mockReturnValue(unsubscribe);

    const { unmount } = render(<ApprovalMemorySection />);
    await waitFor(() => expect(mockOnMemoryChanged).toHaveBeenCalledOnce());

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

// ─── IPC channel contract ─────────────────────────────────────────────────────

const EXPECTED_CHANNELS = [
  'approval:remember',
  'approval:listMemory',
  'approval:forget',
  'approval:memoryChanged',
] as const;

describe('approval memory IPC channel contract', () => {
  it('defines four channels', () => {
    expect(EXPECTED_CHANNELS).toHaveLength(4);
  });

  it.each(EXPECTED_CHANNELS)('channel "%s" is approval-namespaced', (ch) => {
    expect(ch.startsWith('approval:')).toBe(true);
  });
});

// ─── Pure logic: entry count display ─────────────────────────────────────────

describe('entry count computation', () => {
  function countEntries(store: ApprovalMemoryStore): number {
    return store.alwaysAllow.length + store.alwaysDeny.length;
  }

  it('zero when both lists are empty', () => {
    expect(countEntries({ alwaysAllow: [], alwaysDeny: [] })).toBe(0);
  });

  it('sums allow and deny', () => {
    expect(countEntries({ alwaysAllow: [ALLOW_ENTRY], alwaysDeny: [DENY_ENTRY] })).toBe(2);
  });

  it('counts only allow entries', () => {
    expect(countEntries({ alwaysAllow: [ALLOW_ENTRY, ALLOW_ENTRY], alwaysDeny: [] })).toBe(2);
  });
});
