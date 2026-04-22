/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentChatApprovalBanner } from './AgentChatApprovalBanner';

const approvalContextMock = vi.hoisted(() => ({
  useApprovalContext: vi.fn(),
}));

vi.mock('../../contexts/ApprovalContext', () => approvalContextMock);

const mockRespond = vi.fn().mockResolvedValue({ success: true });
const mockRemember = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  vi.clearAllMocks();
  approvalContextMock.useApprovalContext.mockReturnValue({ pendingCount: 0, requests: [] });
  Object.defineProperty(window, 'electronAPI', {
    value: {
      approval: {
        respond: mockRespond,
        remember: mockRemember,
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => cleanup());

describe('AgentChatApprovalBanner', () => {
  it('renders nothing when no request matches the active chat session', () => {
    approvalContextMock.useApprovalContext.mockReturnValue({
      pendingCount: 1,
      requests: [
        {
          requestId: 'req-1',
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
          sessionId: 'session-other',
          timestamp: Date.now(),
        },
      ],
    });

    const { container } = render(<AgentChatApprovalBanner sessionIds={['session-chat']} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the matching approval request and queued count', () => {
    approvalContextMock.useApprovalContext.mockReturnValue({
      pendingCount: 2,
      requests: [
        {
          requestId: 'req-1',
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
          sessionId: 'session-chat',
          timestamp: Date.now(),
        },
        {
          requestId: 'req-2',
          toolName: 'Write',
          toolInput: { file_path: '/tmp/a.ts' },
          sessionId: 'session-chat',
          timestamp: Date.now(),
        },
      ],
    });

    render(<AgentChatApprovalBanner sessionIds={['session-chat']} />);
    expect(screen.getByText('Approval required')).toBeDefined();
    expect(screen.getByText('Bash')).toBeDefined();
    expect(screen.getByTestId('agent-chat-approval-preview').textContent).toContain('npm test');
    expect(screen.getByText('+1 more queued')).toBeDefined();
  });

  it('routes approve and remember actions through the existing approval API', async () => {
    approvalContextMock.useApprovalContext.mockReturnValue({
      pendingCount: 1,
      requests: [
        {
          requestId: 'req-1',
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
          sessionId: 'session-chat',
          timestamp: Date.now(),
        },
      ],
    });

    render(<AgentChatApprovalBanner sessionIds={['session-chat']} />);
    fireEvent.click(screen.getByText('Allow always'));

    await waitFor(() => expect(mockRemember).toHaveBeenCalledOnce());
    expect(mockRemember).toHaveBeenCalledWith('Bash', 'npm test', 'allow');
    expect(mockRespond).toHaveBeenCalledWith('req-1', 'approve');
  });
});
