/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import { WorkbenchApprovalPrompt } from './WorkbenchApprovalPrompt';

const mockRespond = vi.fn().mockResolvedValue({ success: true });
const mockRemember = vi.fn().mockResolvedValue({ success: true });

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-1',
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
    sessionId: 'session-background',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-background',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-04-23T00:00:00.000Z',
    projectRoot: '/workspace/background',
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: 'session-background' },
    ...overrides,
  };
}

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-background',
    workspaceRoot: '/workspace/background',
    createdAt: 1,
    updatedAt: 2,
    title: 'Background chat',
    status: 'running',
    messages: [],
    latestOrchestration: { provider: 'codex', sessionId: 'session-background' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: { approval: { respond: mockRespond, remember: mockRemember } },
    configurable: true,
    writable: true,
  });
});

afterEach(() => cleanup());

describe('WorkbenchApprovalPrompt', () => {
  it('renders a compact prompt for background approvals', () => {
    render(
      <WorkbenchApprovalPrompt
        requests={[makeApproval()]}
        activeSessionIds={['session-active']}
        sessions={[makeSession()]}
        threads={[makeThread()]}
        onSelectSession={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(screen.getByTestId('workbench-background-approval-prompt')).toBeDefined();
    expect(screen.getByText('Approval required')).toBeDefined();
    expect(screen.getByTestId('workbench-background-approval-preview').textContent).toContain(
      'npm test',
    );
  });

  it('does not render when the approval belongs to the active chat session', () => {
    const { container } = render(
      <WorkbenchApprovalPrompt
        requests={[makeApproval({ sessionId: 'session-active' })]}
        activeSessionIds={['session-active']}
        sessions={[makeSession({ id: 'session-active' })]}
        threads={[]}
        onSelectSession={vi.fn()}
        onSelectThread={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('can select the background session and approve the request', async () => {
    const onSelectSession = vi.fn();
    render(
      <WorkbenchApprovalPrompt
        requests={[makeApproval()]}
        activeSessionIds={['session-active']}
        sessions={[makeSession()]}
        threads={[makeThread()]}
        onSelectSession={onSelectSession}
        onSelectThread={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Open approval session'));
    expect(onSelectSession).toHaveBeenCalledWith('session-background');

    fireEvent.click(screen.getByText('Allow once'));
    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith('req-1', 'approve'));
  });
});
