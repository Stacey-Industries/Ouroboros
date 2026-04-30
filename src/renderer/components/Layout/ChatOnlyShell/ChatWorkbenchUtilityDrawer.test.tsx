/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';

let approvalRequests = [] as Array<{
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}>;
let diffState: null | {
  sessionId: string;
  snapshotHash: string;
  projectRoot: string;
  files: Array<{
    filePath: string;
    relativePath: string;
    status: 'modified';
    hunks: Array<{
      id: string;
      header: string;
      oldStart: number;
      oldCount: number;
      newStart: number;
      newCount: number;
      lines: string[];
      rawPatch: string;
      decision: 'pending';
    }>;
  }>;
  loading: boolean;
  error: null;
  lastAcceptedBatch: null;
  staleFiles: string[];
  stalePendingOp: null;
} = null;
let currentSessions = [] as Array<{
  id: string;
  taskLabel: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt: number;
  completedAt?: number;
  error?: string;
  toolCalls: Array<{
    id: string;
    toolName: string;
    input: string;
    timestamp: number;
    status: 'pending' | 'success' | 'error';
    output?: string;
  }>;
  parentSessionId?: string;
  inputTokens: number;
  outputTokens: number;
}>;

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({
    pendingCount: approvalRequests.length,
    requests: approvalRequests,
  }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
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

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({
    state: diffState,
    canRollback: false,
    acceptHunk: vi.fn(),
    rejectHunk: vi.fn(),
    acceptAllFile: vi.fn(),
    rejectAllFile: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    rollback: vi.fn(),
    closeReview: vi.fn(),
    confirmStaleOp: vi.fn(),
    dismissStaleOp: vi.fn(),
  }),
}));

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));

vi.mock('../../AgentMonitor', () => ({
  AgentMonitorManager: () => <div data-testid="agent-monitor-manager" />,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  approvalRequests = [];
  diffState = null;
  currentSessions = [];
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
  } as typeof window.electronAPI;
});

describe('ChatWorkbenchUtilityDrawer', () => {
  it('renders timeline activity on the activity tab', () => {
    currentSessions = [
      {
        id: 'session-1',
        taskLabel: 'Primary',
        status: 'running',
        startedAt: 1_000,
        toolCalls: [
          {
            id: 'tool-1',
            toolName: 'Read',
            input: 'src/main.ts',
            timestamp: 2_000,
            status: 'success',
          },
        ],
        inputTokens: 0,
        outputTokens: 0,
      },
    ];

    render(
      <ChatWorkbenchUtilityDrawer activeTab="activity" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('workbench-timeline-panel')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
  });

  it('switches across approvals, review, and monitor tabs', () => {
    approvalRequests = [
      {
        requestId: 'req-1',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        sessionId: 'session-1',
        timestamp: 3_000,
      },
    ];
    diffState = {
      sessionId: 'session-1',
      snapshotHash: 'snap-1',
      projectRoot: '/workspace',
      files: [
        {
          filePath: '/workspace/src/a.ts',
          relativePath: 'src/a.ts',
          status: 'modified',
          hunks: [
            {
              id: 'h1',
              header: '@@',
              oldStart: 1,
              oldCount: 1,
              newStart: 1,
              newCount: 1,
              lines: ['+const a = 1;'],
              rawPatch: '@@',
              decision: 'pending',
            },
          ],
        },
      ],
      loading: false,
      error: null,
      lastAcceptedBatch: null,
      staleFiles: [],
      stalePendingOp: null,
    };
    currentSessions = [
      {
        id: 'child-1',
        taskLabel: 'Investigate',
        status: 'running',
        startedAt: 5_000,
        parentSessionId: 'parent-1',
        toolCalls: [],
        inputTokens: 0,
        outputTokens: 0,
      },
    ];

    const onSelectTab = vi.fn();
    const { rerender } = render(
      <ChatWorkbenchUtilityDrawer
        activeTab="approvals"
        onSelectTab={onSelectTab}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('workbench-approval-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('chat-workbench-utility-tab-review'));
    expect(onSelectTab).toHaveBeenCalledWith('review');

    rerender(
      <ChatWorkbenchUtilityDrawer activeTab="review" onSelectTab={onSelectTab} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('diff-review-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('chat-workbench-utility-tab-monitor'));
    expect(onSelectTab).toHaveBeenCalledWith('monitor');
  });

  it('renders AgentMonitorManager on the monitor tab', () => {
    render(
      <ChatWorkbenchUtilityDrawer activeTab="monitor" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('agent-monitor-manager')).toBeTruthy();
  });
});
