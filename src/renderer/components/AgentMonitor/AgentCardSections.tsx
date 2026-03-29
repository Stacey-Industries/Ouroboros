import React, { memo } from 'react';

import {
  CardView,
  ChevronIcon,
  formatDuration,
  getCardContainerStyle,
  RunningProgress,
  StatusBadge,
} from './AgentCardControls';
import { AgentCardHeaderActions } from './AgentCardHeaderActions';
import {
  AgentCardExpandedContent,
  AgentCardMeta,
  SessionErrorBanner,
  SessionNotesEditor,
  SessionNotesPreview,
} from './AgentCardSectionsParts';
import type { AgentSession, ToolCallEvent } from './types';

interface AgentCardLayoutProps {
  session: AgentSession;
  expanded: boolean;
  showLog: boolean;
  showNotes: boolean;
  notesDraft: string;
  cardView: CardView;
  childCount?: number;
  isRunning: boolean;
  isDone: boolean;
  completedCallCount: number;
  displayDuration: number;
  latestCall?: ToolCallEvent;
  onDismiss: (id: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
  onToggleExpanded: () => void;
  onToggleLog: () => void;
  onToggleNotes: () => void;
  onNotesDraftChange: (value: string) => void;
  onSaveNotes?: () => void;
  onCardViewChange: (view: CardView) => void;
}

interface AgentCardHeaderProps {
  session: AgentSession;
  expanded: boolean;
  isRunning: boolean;
  isDone: boolean;
  completedCallCount: number;
  displayDuration: number;
  onDismiss: (id: string) => void;
  onToggleNotes: () => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
  onToggleExpanded: () => void;
}

function HeaderClickArea({
  session,
  expanded,
  onToggleExpanded,
}: {
  session: AgentSession;
  expanded: boolean;
  onToggleExpanded: () => void;
}): React.ReactElement<any> {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
      style={{ background: 'transparent' }}
      onClick={onToggleExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleExpanded();
        }
      }}
      aria-expanded={expanded}
    >
      <ChevronIcon open={expanded} />
      <span
        className="flex-1 min-w-0 text-xs font-medium truncate text-text-semantic-primary"
        title={session.taskLabel}
      >
        {session.taskLabel}
      </span>
    </div>
  );
}

function HeaderStatus({
  session,
  isRunning,
  isDone,
  completedCallCount,
  displayDuration,
  onDismiss,
  onToggleNotes,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
}: Omit<AgentCardHeaderProps, 'expanded' | 'onToggleExpanded'>): React.ReactElement<any> {
  return (
    <>
      <StatusBadge status={session.status} />
      {isRunning ? (
        <RunningProgress
          startedAt={session.startedAt}
          completedToolCallCount={completedCallCount}
        />
      ) : (
        <span className="shrink-0 text-[10px] tabular-nums text-text-semantic-faint">
          {formatDuration(displayDuration)}
        </span>
      )}
      <AgentCardHeaderActions
        session={session}
        isDone={isDone}
        onDismiss={onDismiss}
        onToggleNotes={onToggleNotes}
        onUpdateNotes={onUpdateNotes}
        onReviewChanges={onReviewChanges}
        onReplay={onReplay}
      />
    </>
  );
}

const AgentCardHeader = memo(function AgentCardHeader(
  props: AgentCardHeaderProps,
): React.ReactElement<any> {
  return (
    <div
      className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors"
      style={{ background: 'transparent' }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
    >
      <HeaderClickArea
        session={props.session}
        expanded={props.expanded}
        onToggleExpanded={props.onToggleExpanded}
      />
      <HeaderStatus {...props} />
    </div>
  );
});

function SessionNotes({
  session,
  showNotes,
  notesDraft,
  onNotesDraftChange,
  onSaveNotes,
}: {
  session: AgentSession;
  showNotes: boolean;
  notesDraft: string;
  onNotesDraftChange: (value: string) => void;
  onSaveNotes?: () => void;
}): React.ReactElement<any> | null {
  if (showNotes && onSaveNotes) {
    return (
      <SessionNotesEditor
        notesDraft={notesDraft}
        onNotesDraftChange={onNotesDraftChange}
        onSaveNotes={onSaveNotes}
      />
    );
  }
  if (!showNotes && session.notes) {
    return <SessionNotesPreview notes={session.notes} />;
  }
  return null;
}

function AgentCardBody(props: AgentCardLayoutProps): React.ReactElement<any> {
  const {
    session,
    expanded,
    showLog,
    showNotes,
    notesDraft,
    cardView,
    latestCall,
    isRunning,
    childCount,
  } = props;
  return (
    <>
      <AgentCardMeta session={session} childCount={childCount} />
      <SessionErrorBanner error={session.status === 'error' ? session.error : undefined} />
      <SessionNotes
        session={session}
        showNotes={showNotes}
        notesDraft={notesDraft}
        onNotesDraftChange={props.onNotesDraftChange}
        onSaveNotes={props.onSaveNotes}
      />
      <AgentCardExpandedContent
        session={session}
        expanded={expanded}
        cardView={cardView}
        showLog={showLog}
        latestCall={latestCall}
        isRunning={isRunning}
        onToggleLog={props.onToggleLog}
        onCardViewChange={props.onCardViewChange}
      />
    </>
  );
}

export const AgentCardLayout = memo(function AgentCardLayout(
  props: AgentCardLayoutProps,
): React.ReactElement<any> {
  const {
    session,
    expanded,
    isRunning,
    isDone,
    completedCallCount,
    displayDuration,
    onDismiss,
    onUpdateNotes,
    onReviewChanges,
    onReplay,
    onToggleExpanded,
    onToggleNotes,
  } = props;
  return (
    <div className="border-b" style={getCardContainerStyle(session.status)}>
      <AgentCardHeader
        session={session}
        expanded={expanded}
        isRunning={isRunning}
        isDone={isDone}
        completedCallCount={completedCallCount}
        displayDuration={displayDuration}
        onDismiss={onDismiss}
        onToggleNotes={onToggleNotes}
        onUpdateNotes={onUpdateNotes}
        onReviewChanges={onReviewChanges}
        onReplay={onReplay}
        onToggleExpanded={onToggleExpanded}
      />
      <AgentCardBody {...props} />
    </div>
  );
});
