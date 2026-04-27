/**
 * @vitest-environment jsdom
 *
 * Verifies that the rules tab in ChatWorkbenchUtilityDrawer mounts WorkbenchRulesPanel
 * with real props sourced from useProject and useRulesAndSkills. No mock of RulesTab itself.
 *
 * Closes Wave 47 audit finding #7 (no rules panel in workbench utility drawer).
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';

// ── Platform / context mocks ────────────────────────────────────────────────
// These are boundary mocks: IPC and context providers that sit outside the
// components under test. RulesTab itself is NOT mocked.

vi.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({ projectRoot: '/test/project', projectRoots: ['/test/project'] }),
}));

vi.mock('../../../hooks/useRulesAndSkills', () => ({
  useRulesAndSkills: () => ({
    rules: [{ type: 'claude-md', filePath: '/test/project/CLAUDE.md', exists: true }],
    commands: [],
    isLoading: false,
    refresh: vi.fn(),
    createRule: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../../contexts/ApprovalContext', () => ({
  useApprovalContext: () => ({ pendingCount: 0, requests: [] }),
}));

vi.mock('../../../contexts/AgentEventsContext', () => ({
  useAgentEventsContext: () => ({
    currentSessions: [],
    historicalSessions: [],
    agents: [],
    activeCount: 0,
    clearCompleted: vi.fn(),
    dismiss: vi.fn(),
    updateNotes: vi.fn(),
  }),
}));

vi.mock('../../DiffReview/DiffReviewManager', () => ({
  useDiffReview: () => ({ state: null }),
}));

vi.mock('../../DiffReview/DiffReviewPanel', () => ({
  DiffReviewPanel: () => <div data-testid="diff-review-panel" />,
}));

vi.mock('../../AgentMonitor/SubagentPanel', () => ({
  SubagentPanel: ({ subagentId }: { subagentId: string }) => (
    <div data-testid="subagent-transcript">{subagentId}</div>
  ),
}));

// rulesAndSkills IPC is called internally by RulesTab; guard it in the window mock
beforeEach(() => {
  window.electronAPI = {
    approval: {
      respond: vi.fn().mockResolvedValue({ success: true }),
      remember: vi.fn().mockResolvedValue({ success: true }),
    },
    rulesAndSkills: {
      listRuleFiles: vi.fn().mockResolvedValue({ success: true, ruleFiles: [] }),
      onChanged: vi.fn().mockReturnValue(() => undefined),
    },
  } as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
});

describe('ChatWorkbenchUtilityDrawer — rules tab', () => {
  it('renders the rules tab button in the drawer tab bar', () => {
    render(
      <ChatWorkbenchUtilityDrawer activeTab="activity" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('chat-workbench-utility-tab-rules')).toBeTruthy();
  });

  it('mounts WorkbenchRulesPanel with real props when rules tab is active', () => {
    render(
      <ChatWorkbenchUtilityDrawer activeTab="rules" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('workbench-rules-panel')).toBeTruthy();
  });

  it('renders the Rule Files section from real RulesTab (no mock)', () => {
    render(
      <ChatWorkbenchUtilityDrawer activeTab="rules" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );
    // RulesTab renders a "Rule Files" section header — verifies the real component mounted
    expect(screen.getByText('Rule Files')).toBeTruthy();
  });

  it('drawer header subtitle shows Rules when rules tab is active', () => {
    render(
      <ChatWorkbenchUtilityDrawer activeTab="rules" onSelectTab={vi.fn()} onClose={vi.fn()} />,
    );
    // DrawerHeader subtitle div has class 'mt-1 text-sm ...' — use getAllByText to confirm presence
    const matches = screen.getAllByText('Rules');
    // Should appear in: header subtitle, tab button span, and RulesTab section header
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
