/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    agents: [
      {
        sessionId: 's1',
        status: 'running',
        startedAt: 100,
        loadedRules: [
          {
            filePath: '/p/.claude/rules/testing.md',
            globs: ['*.test.ts'],
            loadReason: 'glob match',
            loadedAt: 100,
            memoryType: 'Project',
            name: 'testing',
          },
        ],
        skillExecutions: [
          {
            agentId: 'agent-1',
            agentType: 'sonnet-implementer',
            completedAt: 200,
            durationMs: 100,
            skillName: 'implement-feature',
            startedAt: 100,
            status: 'completed',
          },
        ],
      },
    ],
  }),
}));

import { ComposerContextPreview } from './ComposerContextPreview';

afterEach(cleanup);

describe('ComposerContextPreview', () => {
  it('renders the strip toggle by default', () => {
    render(<ComposerContextPreview />);
    expect(screen.getByTestId('context-preview-toggle')).toBeDefined();
  });

  it('clicking the strip opens the popover', () => {
    render(<ComposerContextPreview />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    expect(screen.getByTestId('context-preview-popover')).toBeDefined();
  });

  it('shows the active rule from the running agent in the Rules tab', () => {
    render(<ComposerContextPreview />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    expect(screen.getByText('testing')).toBeDefined();
  });

  it('reflects pinned file count in the strip label', () => {
    const pinned = [{ estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' }];
    render(<ComposerContextPreview pinnedFiles={pinned} />);
    const toggle = screen.getByTestId('context-preview-toggle');
    expect(toggle.textContent).toMatch(/file/i);
  });

  it('toggling a file checkbox flips its disabled state', () => {
    const pinned = [{ estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' }];
    render(<ComposerContextPreview pinnedFiles={pinned} />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Files/i }));
    const cb = screen.getByTestId('context-item-checkbox-file:/p/README.md') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    const cb2 = screen.getByTestId('context-item-checkbox-file:/p/README.md') as HTMLInputElement;
    expect(cb2.checked).toBe(false);
  });
});
