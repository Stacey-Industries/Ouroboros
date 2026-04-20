/**
 * @vitest-environment jsdom
 *
 * ChatOnlyStatusBar — smoke tests.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatOnlyStatusBar } from './ChatOnlyStatusBar';

vi.mock('../../../hooks/useGitBranch', () => ({
  useGitBranch: () => ({ branch: 'main' }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({ currentSessions: [], historicalSessions: [] }),
}));

afterEach(() => cleanup());

describe('ChatOnlyStatusBar', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />,
    );
    expect(container).toBeDefined();
  });

  it('shows git branch', () => {
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.getByText('main')).toBeDefined();
  });

  it('hides diff button when pending count is 0', () => {
    render(<ChatOnlyStatusBar projectRoot="/test/project" onOpenDiffOverlay={vi.fn()} />);
    expect(screen.queryByTestId('diff-review-button')).toBeNull();
  });
});
