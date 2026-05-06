/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const registerChatSessionMock = vi.fn();
vi.mock('../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    agents: [
      {
        id: 's1',
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
      {
        id: 'unrelated',
        status: 'complete',
        startedAt: 50,
        loadedRules: [
          {
            filePath: '/other/.claude/CLAUDE.md',
            loadReason: 'always',
            loadedAt: 50,
            memoryType: 'User',
            name: 'CLAUDE',
          },
        ],
      },
    ],
    registerChatSession: registerChatSessionMock,
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

  it('falls back to filesystem rules in the Rules tab when no claudeSessionId is set', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        rulesAndSkills: {
          listRuleFiles: vi.fn().mockResolvedValue({
            success: true,
            ruleFiles: [
              {
                id: 'testing',
                scope: 'project',
                filePath: '/p/.claude/rules/testing.md',
                content: '',
                description: '',
              },
            ],
          }),
          onChanged: vi.fn(() => () => undefined),
        },
      },
      writable: true,
      configurable: true,
    });
    render(<ComposerContextPreview />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('testing')).toBeDefined();
  });

  it('reflects pinned file count in the strip label', () => {
    const pinned = [
      { estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' },
    ];
    render(<ComposerContextPreview pinnedFiles={pinned} />);
    const toggle = screen.getByTestId('context-preview-toggle');
    expect(toggle.textContent).toMatch(/file/i);
  });

  it('toggling a file checkbox flips its disabled state', () => {
    const pinned = [
      { estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' },
    ];
    render(<ComposerContextPreview pinnedFiles={pinned} />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Files/i }));
    const cb = screen.getByTestId('context-item-checkbox-file:/p/README.md') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    const cb2 = screen.getByTestId('context-item-checkbox-file:/p/README.md') as HTMLInputElement;
    expect(cb2.checked).toBe(false);
  });

  it('Mentions tab shows items when mentionLabels are provided', () => {
    const mentions = [
      { estimatedTokens: 120, label: 'src/main/main.ts' },
      { estimatedTokens: 80, label: 'src/renderer/App.tsx' },
    ];
    render(<ComposerContextPreview mentionLabels={mentions} />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Mentions/i }));
    expect(screen.getByText('src/main/main.ts')).toBeDefined();
    expect(screen.getByText('src/renderer/App.tsx')).toBeDefined();
  });

  it('Mentions tab is empty when no mentionLabels are provided', () => {
    render(<ComposerContextPreview />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Mentions/i }));
    expect(screen.queryByText('src/main/main.ts')).toBeNull();
  });

  it('Memory tab shows entries when memory IPC returns results', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...window.electronAPI,
        memory: {
          list: vi.fn().mockResolvedValue({
            success: true,
            entries: [
              {
                id: 'constraints',
                title: 'Max subscription',
                description: 'OAuth only',
                section: 'Constraints',
                filePath: '/home/.claude/projects/C--p/memory/constraints.md',
                exists: true,
              },
            ],
          }),
          read: vi.fn().mockResolvedValue({ success: true, content: '' }),
          onChanged: vi.fn(() => () => undefined),
        },
      },
      writable: true,
      configurable: true,
    });

    render(<ComposerContextPreview />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Memory/i }));

    // Wait for IPC promise to resolve and state to update
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Max subscription')).toBeDefined();
  });

  it("Wave 64 — when claudeSessionId matches an agent, popover shows that session's rules", () => {
    render(<ComposerContextPreview claudeSessionId="s1" />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    expect(screen.getByText('testing')).toBeDefined();
  });

  it('Wave 64 — when claudeSessionId does not match, no rules show (no fallback to other agents)', () => {
    render(<ComposerContextPreview claudeSessionId="not-tracked-yet" />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    // Rules tab is the default; with no match, the testing rule should not appear.
    expect(screen.queryByText('testing')).toBeNull();
    expect(screen.queryByText('CLAUDE')).toBeNull();
  });

  it('Wave 64 — registers a chat session when claudeSessionId is unknown to the reducer', () => {
    registerChatSessionMock.mockClear();
    render(<ComposerContextPreview claudeSessionId="brand-new-id" />);
    expect(registerChatSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'brand-new-id' }),
    );
  });

  it('Wave 64 — does NOT register when the session is already in the reducer', () => {
    registerChatSessionMock.mockClear();
    render(<ComposerContextPreview claudeSessionId="s1" />);
    expect(registerChatSessionMock).not.toHaveBeenCalled();
  });

  it('Wave 71 — controlled mode: toggling a file calls setDisabledLocalIds with the file: id', () => {
    const setIds = vi.fn();
    const pinned = [
      { estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' },
    ];
    render(
      <ComposerContextPreview
        pinnedFiles={pinned}
        disabledLocalIds={new Set()}
        setDisabledLocalIds={setIds}
      />,
    );
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Files/i }));
    fireEvent.click(screen.getByTestId('context-item-checkbox-file:/p/README.md'));
    expect(setIds).toHaveBeenCalledTimes(1);
    const updater = setIds.mock.calls[0][0] as (prev: ReadonlySet<string>) => ReadonlySet<string>;
    const next = updater(new Set());
    expect(next.has('file:/p/README.md')).toBe(true);
  });

  it('Wave 71 — controlled mode: disabledLocalIds prop drives checkbox state', () => {
    const pinned = [
      { estimatedTokens: 400, name: 'README.md', path: '/p/README.md', relativePath: 'README.md' },
    ];
    render(
      <ComposerContextPreview
        pinnedFiles={pinned}
        disabledLocalIds={new Set(['file:/p/README.md'])}
        setDisabledLocalIds={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    fireEvent.click(screen.getByRole('tab', { name: /Files/i }));
    const cb = screen.getByTestId('context-item-checkbox-file:/p/README.md') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });
});
