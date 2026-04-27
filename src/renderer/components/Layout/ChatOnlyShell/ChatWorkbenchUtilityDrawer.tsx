import React, { useCallback } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { OPEN_FILE_EVENT } from '../../../hooks/appEventNames';
import { useRulesAndSkills } from '../../../hooks/useRulesAndSkills';
import { RulesTab } from '../../AgentChat/RulesTab';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { DiffReviewPanel } from '../../DiffReview/DiffReviewPanel';
import { SubagentTranscriptPanel } from './SubagentTranscriptPanel';
import type { ChatWorkbenchUtilityTab } from './useChatWorkbenchLayout';
import { useWorkbenchTimeline } from './useWorkbenchTimeline';
import { WorkbenchApprovalPanel } from './WorkbenchApprovalPanel';
import { WorkbenchTimelinePanel } from './WorkbenchTimelinePanel';

export interface ChatWorkbenchUtilityDrawerProps {
  activeTab: ChatWorkbenchUtilityTab;
  onSelectTab: (tab: ChatWorkbenchUtilityTab) => void;
  onClose: () => void;
}

function tabLabel(tab: ChatWorkbenchUtilityTab): string {
  if (tab === 'approvals') return 'Approvals';
  if (tab === 'review') return 'Review';
  if (tab === 'rules') return 'Rules';
  if (tab === 'subagents') return 'Subagents';
  return 'Timeline';
}

function useTabCounts(): Record<ChatWorkbenchUtilityTab, number> {
  const { counts } = useWorkbenchTimeline();
  return {
    approvals: counts.approvals,
    review: counts.review,
    rules: 0,
    subagents: counts.subagents,
    activity: counts.activity,
  };
}

function TabButton({
  tab,
  activeTab,
  count,
  onSelect,
}: {
  tab: ChatWorkbenchUtilityTab;
  activeTab: ChatWorkbenchUtilityTab;
  count: number;
  onSelect: (tab: ChatWorkbenchUtilityTab) => void;
}): React.ReactElement {
  const active = tab === activeTab;
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-surface-panel text-text-semantic-primary'
          : 'bg-transparent text-text-semantic-secondary hover:bg-surface-hover'
      }`}
      onClick={() => {
        onSelect(tab);
      }}
      data-testid={`chat-workbench-utility-tab-${tab}`}
    >
      <span>{tabLabel(tab)}</span>
      {count > 0 && (
        <span className="rounded-full bg-surface-panel px-1.5 py-0.5 text-[10px]">{count}</span>
      )}
    </button>
  );
}

function EmptyReviewState(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      No diff review is pending.
    </div>
  );
}

function ReviewPanel(): React.ReactElement {
  const {
    state,
    canRollback,
    acceptHunk,
    rejectHunk,
    acceptAllFile,
    rejectAllFile,
    acceptAll,
    rejectAll,
    rollback,
    closeReview,
    confirmStaleOp,
    dismissStaleOp,
  } = useDiffReview();

  if (!state) return <EmptyReviewState />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="workbench-review-panel"
    >
      <DiffReviewPanel
        state={state}
        canRollback={canRollback}
        enhancedEnabled={true}
        onAcceptHunk={acceptHunk}
        onRejectHunk={rejectHunk}
        onAcceptAllFile={acceptAllFile}
        onRejectAllFile={rejectAllFile}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
        onRollback={rollback}
        onClose={closeReview}
        onConfirmStaleOp={confirmStaleOp}
        onDismissStaleOp={dismissStaleOp}
      />
    </div>
  );
}

function openFileInEditor(filePath: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_FILE_EVENT, { detail: { filePath } }));
}

function WorkbenchRulesPanel(): React.ReactElement {
  const { projectRoot } = useProject();
  const { rules, createRule } = useRulesAndSkills(projectRoot);
  const handleCreateRule = useCallback(
    async (type: 'claude-md' | 'agents-md'): Promise<void> => {
      await createRule(type);
    },
    [createRule],
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="workbench-rules-panel"
    >
      <RulesTab
        rules={rules}
        onOpenFile={openFileInEditor}
        onCreateRule={handleCreateRule}
        projectRoot={projectRoot}
      />
    </div>
  );
}

function DrawerContent({ activeTab }: { activeTab: ChatWorkbenchUtilityTab }): React.ReactElement {
  if (activeTab === 'approvals') return <WorkbenchApprovalPanel />;
  if (activeTab === 'review') return <ReviewPanel />;
  if (activeTab === 'rules') return <WorkbenchRulesPanel />;
  if (activeTab === 'subagents') return <SubagentTranscriptPanel />;
  return <WorkbenchTimelinePanel />;
}

interface DrawerHeaderProps {
  activeTab: ChatWorkbenchUtilityTab;
  onClose: () => void;
}

function DrawerHeader({ activeTab, onClose }: DrawerHeaderProps): React.ReactElement {
  return (
    <header className="flex items-center gap-2 border-b border-border-semantic px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
          Utility Drawer
        </div>
        <div className="mt-1 text-sm text-text-semantic-primary">{tabLabel(activeTab)}</div>
      </div>
      <button
        type="button"
        className="rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        onClick={onClose}
        data-testid="chat-workbench-utility-close"
      >
        Close
      </button>
    </header>
  );
}

const DRAWER_TABS: ChatWorkbenchUtilityTab[] = [
  'activity',
  'approvals',
  'review',
  'rules',
  'subagents',
];

export function ChatWorkbenchUtilityDrawer({
  activeTab,
  onSelectTab,
  onClose,
}: ChatWorkbenchUtilityDrawerProps): React.ReactElement {
  const counts = useTabCounts();
  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col border-l border-border-semantic bg-surface-panel/95"
      data-testid="chat-workbench-utility-drawer"
    >
      <DrawerHeader activeTab={activeTab} onClose={onClose} />
      <div className="flex flex-wrap gap-2 border-b border-border-semantic-subtle px-3 py-2">
        {DRAWER_TABS.map((tab) => (
          <TabButton
            key={tab}
            tab={tab}
            activeTab={activeTab}
            count={counts[tab]}
            onSelect={onSelectTab}
          />
        ))}
      </div>
      <DrawerContent activeTab={activeTab} />
    </aside>
  );
}
