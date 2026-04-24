/**
 * AgentCard.tsx - Card for a single agent session.
 */

import React, { memo, useState } from 'react';

import { CardView, useElapsedMs } from './AgentCardControls';
import { AgentCardLayout } from './AgentCardSections';
import type { AgentSession, ToolCallEvent } from './types';

export interface AgentCardProps {
  session: AgentSession;
  onDismiss: (id: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
  /** Number of direct child (subagent) sessions spawned by this session. */
  childCount?: number;
}

interface AgentCardDerivedState {
  isRunning: boolean;
  isDone: boolean;
  displayDuration: number;
  completedCallCount: number;
  latestCall?: ToolCallEvent;
}

function getAgentCardDerivedState(session: AgentSession, elapsedMs: number): AgentCardDerivedState {
  const isRunning = session.status === 'running';
  const completedAt = session.completedAt ?? session.startedAt + elapsedMs;

  return {
    isRunning,
    isDone: session.status === 'complete' || session.status === 'error',
    displayDuration: isRunning ? elapsedMs : completedAt - session.startedAt,
    completedCallCount: session.toolCalls.filter((toolCall) => toolCall.status !== 'pending')
      .length,
    latestCall: session.toolCalls[session.toolCalls.length - 1],
  };
}

function useAgentCardLocalState(session: AgentSession) {
  const [expanded, setExpanded] = useState(session.status === 'running');
  const [showLog, setShowLog] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(session.notes ?? '');
  const [cardView, setCardView] = useState<CardView>('feed');
  return { expanded, setExpanded, showLog, setShowLog, showNotes, setShowNotes, notesDraft, setNotesDraft, cardView, setCardView };
}

export const AgentCard = memo(function AgentCard({
  session,
  onDismiss,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
  childCount,
}: AgentCardProps): React.ReactElement<unknown> {
  const ls = useAgentCardLocalState(session);
  const derivedState = getAgentCardDerivedState(
    session,
    useElapsedMs(session.startedAt, session.status === 'running'),
  );

  return (
    <AgentCardLayout
      session={session}
      expanded={ls.expanded}
      showLog={ls.showLog}
      showNotes={ls.showNotes}
      notesDraft={ls.notesDraft}
      cardView={ls.cardView}
      childCount={childCount}
      onDismiss={onDismiss}
      onUpdateNotes={onUpdateNotes}
      onReviewChanges={onReviewChanges}
      onReplay={onReplay}
      onToggleExpanded={() => ls.setExpanded((v) => !v)}
      onToggleLog={() => ls.setShowLog((v) => !v)}
      onToggleNotes={() => ls.setShowNotes((v) => !v)}
      onNotesDraftChange={ls.setNotesDraft}
      onSaveNotes={
        onUpdateNotes
          ? () => onUpdateNotes(session.id, ls.notesDraft, session.bookmarked)
          : undefined
      }
      onCardViewChange={ls.setCardView}
      {...derivedState}
    />
  );
});
