import { describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../../types/electron';
import type { AgentSession } from '../../AgentMonitor/types';
import type { DiffReviewState } from '../../DiffReview/types';
import { buildWorkbenchTimelineEntries } from './useWorkbenchTimeline';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    taskLabel: 'Primary session',
    status: 'running',
    startedAt: 1_000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-1',
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
    sessionId: 'session-1',
    timestamp: 4_000,
    ...overrides,
  };
}

function makeDiffState(overrides: Partial<DiffReviewState> = {}): DiffReviewState {
  return {
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
    ...overrides,
  };
}

describe('buildWorkbenchTimelineEntries', () => {
  it('includes approval and review milestones beside session activity', () => {
    const entries = buildWorkbenchTimelineEntries(
      [
        makeSession({
          id: 'parent-1',
          taskLabel: 'Parent',
          status: 'error',
          startedAt: 1_000,
          completedAt: 4_500,
          error: 'Provider crashed',
          toolCalls: [
            {
              id: 'tool-1',
              toolName: 'Read',
              input: 'src/main.ts',
              timestamp: 2_000,
              status: 'success',
            },
          ],
        }),
        makeSession({
          id: 'child-1',
          taskLabel: 'Child',
          status: 'running',
          startedAt: 3_500,
          parentSessionId: 'parent-1',
        }),
      ],
      {
        approvalRequests: [makeApproval()],
        diffReviewState: makeDiffState(),
        now: 5_000,
      },
    );

    expect(entries.map((entry) => entry.kind)).toEqual([
      'review',
      'session',
      'approval',
      'session',
      'tool',
      'session',
    ]);
  });

  it('surfaces failure and approval detail text', () => {
    const entries = buildWorkbenchTimelineEntries(
      [
        makeSession({
          id: 'session-2',
          taskLabel: 'Broken session',
          status: 'error',
          startedAt: 1_000,
          completedAt: 1_500,
          error: 'Command failed',
          toolCalls: [
            {
              id: 'tool-2',
              toolName: 'Bash',
              input: 'npm run lint',
              timestamp: 1_250,
              status: 'error',
              output: 'exit code 1',
            },
          ],
        }),
      ],
      {
        approvalRequests: [makeApproval({ toolInput: { command: 'git push origin main' } })],
        now: 2_000,
      },
    );

    expect(entries.find((entry) => entry.title === 'Session failed')?.detail).toContain(
      'Command failed',
    );
    expect(entries.find((entry) => entry.kind === 'approval')?.detail).toContain(
      'git push origin main',
    );
  });
});
