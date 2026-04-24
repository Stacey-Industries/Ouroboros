/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalProvider, useApprovalContext } from './ApprovalContext';

const approvalDialogMock = vi.hoisted(() => ({
  ApprovalDialog: vi.fn(() => <div data-testid="approval-dialog" />),
}));

vi.mock('../components/AgentMonitor/ApprovalDialog', () => approvalDialogMock);

function Consumer(): React.ReactElement {
  const { pendingCount } = useApprovalContext();
  return <div data-testid="approval-count">{pendingCount}</div>;
}

describe('ApprovalProvider', () => {
  it('keeps approval state without mounting the full-screen approval dialog', async () => {
    let onRequest: ((request: never) => void) | null = null;
    Object.defineProperty(window, 'electronAPI', {
      value: {
        approval: {
          onRequest: vi.fn((callback) => {
            onRequest = callback;
            return vi.fn();
          }),
          onResolved: vi.fn(() => vi.fn()),
        },
      },
      configurable: true,
      writable: true,
    });

    render(
      <ApprovalProvider>
        <Consumer />
      </ApprovalProvider>,
    );

    onRequest?.({
      requestId: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      sessionId: 'session-1',
      timestamp: Date.now(),
    } as never);

    await waitFor(() => expect(screen.getByTestId('approval-count').textContent).toBe('1'));
    expect(screen.queryByTestId('approval-dialog')).toBeNull();
    expect(approvalDialogMock.ApprovalDialog).not.toHaveBeenCalled();
  });
});
