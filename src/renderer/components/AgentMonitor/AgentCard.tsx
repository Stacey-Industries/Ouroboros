/**
 * AgentCard.tsx - Card for a single agent session.
 */

import React, { memo, useState } from 'react';
import { AgentCardLayout } from './AgentCardSections';
import { CardView, useElapsedMs } from './AgentCardControls';
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
    completedCallCount: session.toolCalls.filter((toolCall) => toolCall.status !== 'pending').length,
    latestCall: session.toolCalls[session.toolCalls.length - 1],
  };
}

export const AgentCard = memo(function AgentCard({
  session,
  onDismiss,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
  childCount,
}: AgentCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(session.status === 'running');
  const [showLog, setShowLog] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(session.notes ?? '');
  const [cardView, setCardView] = useState<CardView>('feed');
  const derivedState = getAgentCardDerivedState(session, useElapsedMs(session.startedAt, session.status === 'running'));

  return (
    <AgentCardLayout
      session={session}
      expanded={expanded}
      showLog={showLog}
      showNotes={showNotes}
      notesDraft={notesDraft}
      cardView={cardView}
      childCount={childCount}
      onDismiss={onDismiss}
      onUpdateNotes={onUpdateNotes}
      onReviewChanges={onReviewChanges}
      onReplay={onReplay}
      onToggleExpanded={() => setExpanded((value) => !value)}
      onToggleLog={() => setShowLog((value) => !value)}
      onToggleNotes={() => setShowNotes((value) => !value)}
      onNotesDraftChange={setNotesDraft}
      onSaveNotes={onUpdateNotes ? () => onUpdateNotes(session.id, notesDraft, session.bookmarked) : undefined}
      onCardViewChange={setCardView}
      {...derivedState}
    />
  );
});
