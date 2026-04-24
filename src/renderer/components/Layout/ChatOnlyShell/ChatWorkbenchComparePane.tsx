import React from 'react';

import { AgentChatStoreContext } from '../../AgentChat/agentChatStore';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import { useScopedWorkbenchWorkspace } from './useScopedWorkbenchWorkspace';

export interface ChatWorkbenchComparePaneProps {
  projectRoot: string;
  threadId: string;
  sessionId: string;
  projectLabel: string;
  onClose: () => void;
}

interface ComparePaneHeaderProps {
  projectLabel: string;
  sessionId: string;
  onClose: () => void;
}

function ComparePaneHeader({
  projectLabel,
  sessionId,
  onClose,
}: ComparePaneHeaderProps): React.ReactElement {
  return (
    <header className="flex items-center gap-3 border-b border-stroke-default px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
          Compare Session
        </div>
        <div className="mt-1 text-sm text-text-semantic-primary">{projectLabel}</div>
        <div className="text-[11px] text-text-semantic-secondary">
          Inspect-only · session {sessionId.slice(0, 8)}
        </div>
      </div>
      <button
        type="button"
        className="rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        onClick={onClose}
        data-testid="chat-workbench-compare-close"
      >
        Close Compare
      </button>
    </header>
  );
}

export function ChatWorkbenchComparePane({
  projectRoot,
  threadId,
  sessionId,
  projectLabel,
  onClose,
}: ChatWorkbenchComparePaneProps): React.ReactElement {
  const store = useScopedWorkbenchWorkspace();

  return (
    <section
      className="flex min-w-0 flex-1 flex-col border-l border-stroke-default bg-surface-panel/90"
      data-testid="chat-workbench-compare-pane"
    >
      <ComparePaneHeader projectLabel={projectLabel} sessionId={sessionId} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentChatStoreContext.Provider value={store}>
          <AgentChatWorkspace
            projectRoot={projectRoot}
            activeSessionId={sessionId}
            preferredThreadId={threadId}
            readOnly={true}
            variant="chat-only"
          />
        </AgentChatStoreContext.Provider>
      </div>
    </section>
  );
}
