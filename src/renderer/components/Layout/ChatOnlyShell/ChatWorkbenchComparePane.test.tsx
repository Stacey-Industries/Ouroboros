/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchComparePane } from './ChatWorkbenchComparePane';

vi.mock('../../AgentChat/AgentChatWorkspace', () => ({
  AgentChatWorkspace: ({
    projectRoot,
    activeSessionId,
    preferredThreadId,
    readOnly,
  }: {
    projectRoot: string;
    activeSessionId: string;
    preferredThreadId: string;
    readOnly: boolean;
  }) => (
    <div
      data-testid="agent-chat-workspace"
      data-project-root={projectRoot}
      data-session-id={activeSessionId}
      data-thread-id={preferredThreadId}
      data-read-only={String(readOnly)}
    />
  ),
}));

afterEach(() => cleanup());

describe('ChatWorkbenchComparePane', () => {
  it('renders an inspect-only secondary workspace and closes', () => {
    const onClose = vi.fn();
    render(
      <ChatWorkbenchComparePane
        projectRoot="/workspace/beta"
        threadId="thread-2"
        sessionId="session-2"
        projectLabel="beta"
        onClose={onClose}
      />,
    );

    const workspace = screen.getByTestId('agent-chat-workspace');
    expect(workspace.getAttribute('data-project-root')).toBe('/workspace/beta');
    expect(workspace.getAttribute('data-thread-id')).toBe('thread-2');
    expect(workspace.getAttribute('data-read-only')).toBe('true');

    fireEvent.click(screen.getByTestId('chat-workbench-compare-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
