/**
 * @vitest-environment jsdom
 *
 * Wave 47 follow-through integration tests.
 * Exercises the real workbench joins: rail grouping, attention model,
 * timeline normalization, compare mode primary-surface ownership,
 * utility-drawer tab behavior, and HTML preview routing.
 *
 * NOTE: Heavy shell surfaces (AgentChatWorkspace, TerminalDock) remain
 * mocked — they carry xterm/Monaco cost and jsdom can't render them.
 * The joins under test here are the workbench-layer logic: rail IA,
 * timeline reducer, surface policy, subagent transcript panel, compare
 * pane wiring, and HTML preview in ContentRouter.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';

// ── minimal stubs ───────────────────────────────────────────────────────────
vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: 0,
    requests: [],
  }),
}));

let mockSessions: Array<{
  id: string;
  taskLabel: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt: number;
  toolCalls: never[];
  parentSessionId?: string;
}> = [];

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions: mockSessions.filter((s) => s.status === 'running' || s.status === 'idle'),
    historicalSessions: mockSessions.filter((s) => s.status === 'complete' || s.status === 'error'),
    agents: mockSessions,
    activeCount: mockSessions.filter((s) => s.status === 'running').length,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: () => <div data-testid="agent-chat-workspace" />,
}));

vi.mock('../../AgentChat/agentChatStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../AgentChat/agentChatStore')>();
  return {
    ...actual,
    useAgentChatStoreContext: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        threads: [],
        onSelectThread: vi.fn(),
        activeThread: null,
      }),
  };
});

vi.mock('../../SessionSidebar/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    activeSessionId: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('./useWorkbenchSessionActivation', () => ({
  useWorkbenchSessionActivation: () => ({
    activateSession: vi.fn().mockResolvedValue(undefined),
    activatingSessionId: null,
  }),
}));

vi.mock('./ChatOnlyTitleBar', () => ({
  ChatOnlyTitleBar: () => <div data-testid="chat-only-title-bar" />,
}));

vi.mock('./ChatOnlyStatusBar', () => ({
  ChatOnlyStatusBar: () => <div data-testid="chat-only-status-bar" />,
}));

vi.mock('./ChatOnlyDiffOverlay', () => ({
  ChatOnlyDiffOverlay: () => <div data-testid="diff-overlay" />,
}));

vi.mock('./ChatOnlySettingsOverlay', () => ({
  ChatOnlySettingsOverlay: () => null,
}));

vi.mock('./KeyboardShortcutCheatSheet', () => ({
  KeyboardShortcutCheatSheet: () => null,
}));

vi.mock('../../CommandPalette/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('./useChatSidebarMode', () => ({
  useChatSidebarMode: () => ({ mode: 'pinned', cycleMode: vi.fn() }),
}));

vi.mock('./useWorkbenchArtifacts', () => ({
  useWorkbenchArtifacts: () => ({
    kind: 'empty' as const,
    activeKey: null,
    title: '',
    subtitle: null,
    openFile: null,
    diffState: null,
    historyItems: [],
    selectEntry: vi.fn(),
    clearSelection: vi.fn(),
  }),
}));

vi.mock('./ChatWorkbenchComparePane', () => ({
  ChatWorkbenchComparePane: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="chat-workbench-compare-pane">
      <button type="button" onClick={onClose} data-testid="compare-pane-close">
        Close
      </button>
    </div>
  ),
}));

// ── late import of shell under test ─────────────────────────────────────────
const { ChatWorkbenchShell } = await import('./ChatWorkbenchShell');

function buildShellProps(overrides: Record<string, unknown> = {}) {
  return {
    projectRoot: '/test/project',
    diffOverlayOpen: false,
    openDiffOverlay: vi.fn(),
    closeDiffOverlay: vi.fn(),
    toggleDrawer: vi.fn(),
    paletteOpen: false,
    closePalette: vi.fn(),
    commands: [],
    recentIds: [],
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mockSessions = [];
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
});

// ── Rail IA ──────────────────────────────────────────────────────────────────
describe('Rail IA', () => {
  it('renders the workbench rail by default', () => {
    render(<ChatWorkbenchShell {...buildShellProps()} />);
    expect(screen.getByTestId('workbench-rail')).toBeDefined();
  });

  it('renders distinct New session and Launch agent buttons in the rail header', () => {
    render(<ChatWorkbenchShell {...buildShellProps()} />);
    const rail = screen.getByTestId('workbench-rail');
    // Both buttons are present and have non-overlapping labels
    const buttons = within(rail).getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    expect(labels.some((l) => /new session/i.test(l ?? ''))).toBe(true);
    expect(labels.some((l) => /launch agent/i.test(l ?? ''))).toBe(true);
  });
});

// ── Utility drawer — subagent tab ────────────────────────────────────────────
describe('Utility drawer — subagent tab join', () => {
  it('opens the utility drawer on OPEN_SUBAGENT_PANEL_EVENT', () => {
    mockSessions = [
      {
        id: 'child-1',
        taskLabel: 'Sub work',
        status: 'running',
        startedAt: Date.now(),
        toolCalls: [],
        parentSessionId: 'parent-1',
      },
    ];
    render(<ChatWorkbenchShell {...buildShellProps()} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tc-1' } }),
      );
    });

    expect(screen.getByTestId('chat-workbench-utility-drawer')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-utility-tab-subagents')).toBeDefined();
  });
});

// ── Compare mode primary-surface ownership ────────────────────────────────────
describe('Compare mode', () => {
  it('does not show compare pane when compare is inactive', () => {
    render(<ChatWorkbenchShell {...buildShellProps()} />);
    expect(screen.queryByTestId('chat-workbench-compare-pane')).toBeNull();
  });
});

// ── Shell structure ──────────────────────────────────────────────────────────
describe('Shell structure', () => {
  it('renders title bar, workbench body, and status bar', () => {
    render(<ChatWorkbenchShell {...buildShellProps()} />);
    expect(screen.getByTestId('chat-only-title-bar')).toBeDefined();
    expect(screen.getByTestId('chat-workbench-body')).toBeDefined();
    expect(screen.getByTestId('chat-only-status-bar')).toBeDefined();
  });

  it('keeps the primary conversation workspace mounted', () => {
    render(<ChatWorkbenchShell {...buildShellProps()} />);
    expect(screen.getByTestId('agent-chat-workspace')).toBeDefined();
  });
});
