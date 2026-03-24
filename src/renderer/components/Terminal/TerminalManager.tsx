import React from 'react';

import { EmptyState } from '../shared';
import { ActiveTerminalContent } from './TerminalManagerContent';
import { useTerminalManagerState } from './TerminalManagerState';
import type { TerminalSession } from './TerminalTabs';

export interface TerminalManagerProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onRestart: (id: string) => void;
  onClose: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onSpawn: () => void;
  recordingSessions?: Set<string>;
  onToggleRecording?: (sessionId: string) => void;
  onSplit?: (sessionId: string) => void;
  onCloseSplit?: (sessionId: string) => void;
}

const NOOP = (): void => {};

function TerminalManagerShell({
  activeContent,
  isEmpty,
  onSpawn,
}: {
  activeContent: React.ReactNode;
  isEmpty: boolean;
  onSpawn: () => void;
}): React.ReactElement {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--term-bg, var(--surface-base))' }}
    >
      <div className="relative flex-1 min-h-0">
        {activeContent}
        {isEmpty && (
          <EmptyState
            icon="terminal"
            title="No terminals open"
            description="Open a terminal to run commands in your project."
            action={{ label: 'New Terminal', onClick: onSpawn }}
          />
        )}
      </div>
    </div>
  );
}

function buildActiveContent(
  props: TerminalManagerProps,
  state: ReturnType<typeof useTerminalManagerState>,
): React.ReactNode {
  const { activeSession, allSessionIds, syncInput, handleToggleSync } = state;
  if (!activeSession) return null;
  return (
    <div className="absolute inset-0">
      <ActiveTerminalContent
        session={activeSession}
        isActive
        onTitleChange={props.onTitleChange}
        onRestart={props.onRestart}
        onClose={props.onClose}
        onSplit={props.onSplit}
        onCloseSplit={props.onCloseSplit ?? NOOP}
        recordingSessions={props.recordingSessions}
        onToggleRecording={props.onToggleRecording}
        syncInput={syncInput}
        allSessionIds={allSessionIds}
        onToggleSync={handleToggleSync}
      />
    </div>
  );
}

export function TerminalManager(props: TerminalManagerProps): React.ReactElement {
  const state = useTerminalManagerState(props.sessions, props.activeSessionId);
  return (
    <TerminalManagerShell
      activeContent={buildActiveContent(props, state)}
      isEmpty={props.sessions.length === 0}
      onSpawn={props.onSpawn}
    />
  );
}
