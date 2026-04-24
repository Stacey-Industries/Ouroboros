/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkbenchTimelinePanel } from './WorkbenchTimelinePanel';

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({ requests: [], pendingCount: 0 }),
}));

let currentSessions: Array<{
  id: string;
  taskLabel: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt: number;
  completedAt?: number;
  toolCalls: Array<{
    id: string;
    toolName: string;
    input: string;
    timestamp: number;
    status: 'pending' | 'success' | 'error';
  }>;
  inputTokens: number;
  outputTokens: number;
  conversationTurns: Array<{
    type: 'prompt' | 'elicitation' | 'elicitation_result';
    content: string;
    timestamp: number;
  }>;
  compactions: Array<{ preTokens: number; postTokens: number; timestamp: number }>;
  permissionEvents: Array<{
    type: 'request' | 'denied';
    permissionType?: string;
    toolName?: string;
    timestamp: number;
    reason?: string;
  }>;
  loadedRules: Array<{
    filePath: string;
    name: string;
    memoryType: 'User' | 'Project' | 'Local' | 'Managed';
    loadReason: string;
    loadedAt: number;
  }>;
  skillExecutions: Array<{
    skillName: string;
    agentId: string;
    agentType: string;
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    status: 'running' | 'completed' | 'failed';
    lastMessage?: string;
  }>;
  tasks: Array<{
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    createdAt: number;
    completedAt?: number;
  }>;
  parentSessionId?: string;
}> = [];

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({ currentSessions, historicalSessions: [] }),
}));

function renderPanel(): void {
  render(<WorkbenchTimelinePanel />);
}

afterEach(() => {
  cleanup();
  currentSessions = [];
});

describe('WorkbenchTimelinePanel', () => {
  it('renders the derived timeline entries', () => {
    currentSessions = [
      {
        id: 'session-1',
        taskLabel: 'Build feature',
        status: 'complete',
        startedAt: 1_000,
        completedAt: 9_000,
        toolCalls: [
          {
            id: 'tool-1',
            toolName: 'Bash',
            input: 'npm test',
            timestamp: 3_000,
            status: 'success',
          },
        ],
        inputTokens: 0,
        outputTokens: 0,
        conversationTurns: [{ type: 'prompt', content: 'Run the tests', timestamp: 2_000 }],
        compactions: [{ preTokens: 800, postTokens: 600, timestamp: 4_000 }],
        permissionEvents: [
          { type: 'request', permissionType: 'filesystem', toolName: 'Bash', timestamp: 2_500 },
        ],
        loadedRules: [
          {
            filePath: '.claude/rules/testing.md',
            name: 'testing',
            memoryType: 'Project',
            loadReason: 'startup',
            loadedAt: 1_500,
          },
        ],
        skillExecutions: [],
        tasks: [],
      },
    ];

    renderPanel();

    expect(screen.getByTestId('workbench-timeline-panel')).toBeDefined();
    expect(screen.getByText('Timeline')).toBeDefined();
    expect(screen.getByText('Session completed')).toBeDefined();
    expect(screen.getByText('Bash')).toBeDefined();
    expect(screen.getByText('Rule loaded')).toBeDefined();
  });

  it('shows an empty state when there are no sessions', () => {
    renderPanel();
    expect(screen.getByText('No timeline entries yet.')).toBeDefined();
  });
});
