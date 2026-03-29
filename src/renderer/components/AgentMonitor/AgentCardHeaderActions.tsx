import React from 'react';

import { ActionIconButton, DismissButton } from './AgentCardControls';
import { ExportButton } from './AgentCardControlsParts';
import type { AgentSession } from './types';

interface AgentCardHeaderActionsProps {
  session: AgentSession;
  isDone: boolean;
  onDismiss: (id: string) => void;
  onToggleNotes: () => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
}

function BookmarkIcon({ filled }: { filled: boolean }): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M2 1h6v8L5 7 2 9V1z" />
    </svg>
  );
}

function NotesIcon(): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M1 2h8M1 5h5M1 8h6" strokeLinecap="round" />
    </svg>
  );
}

function ReplayIcon(): React.ReactElement<any> {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2 1.5l6.5 3.5-6.5 3.5z" />
    </svg>
  );
}

function ReviewIcon(): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <path d="M1 3h8M1 5h4M6 5l2 2-2 2M1 7h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookmarkAction({
  session,
  onUpdateNotes,
}: {
  session: AgentSession;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
}): React.ReactElement<any> | null {
  if (!onUpdateNotes) return null;

  return (
    <ActionIconButton
      title={session.bookmarked ? 'Remove bookmark' : 'Bookmark this session'}
      ariaLabel={session.bookmarked ? 'Remove bookmark' : 'Bookmark session'}
      color={session.bookmarked ? 'var(--interactive-accent)' : 'var(--text-faint)'}
      onClick={(event) => {
        event.stopPropagation();
        onUpdateNotes(session.id, session.notes ?? '', !session.bookmarked);
      }}
    >
      <BookmarkIcon filled={Boolean(session.bookmarked)} />
    </ActionIconButton>
  );
}

function NotesAction({
  session,
  isDone,
  onToggleNotes,
  onUpdateNotes,
}: {
  session: AgentSession;
  isDone: boolean;
  onToggleNotes: () => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
}): React.ReactElement<any> | null {
  if (!onUpdateNotes || (!isDone && !session.restored)) return null;

  return (
    <ActionIconButton
      title="Add/edit notes"
      ariaLabel="Toggle notes"
      color={session.notes ? 'var(--interactive-accent)' : 'var(--text-faint)'}
      onClick={(event) => {
        event.stopPropagation();
        onToggleNotes();
      }}
    >
      <NotesIcon />
    </ActionIconButton>
  );
}

function ReplayAction({
  session,
  isDone,
  onReplay,
}: {
  session: AgentSession;
  isDone: boolean;
  onReplay?: (sessionId: string) => void;
}): React.ReactElement<any> | null {
  if (!isDone || session.toolCalls.length < 1 || !onReplay) return null;

  return (
    <ActionIconButton
      title="Replay this session step by step"
      ariaLabel="Replay session"
      color="var(--text-faint)"
      hoverColor="var(--interactive-accent)"
      onClick={(event) => {
        event.stopPropagation();
        onReplay(session.id);
      }}
    >
      <ReplayIcon />
    </ActionIconButton>
  );
}

function ReviewChangesAction({
  session,
  isDone,
  onReviewChanges,
}: {
  session: AgentSession;
  isDone: boolean;
  onReviewChanges?: (sessionId: string) => void;
}): React.ReactElement<any> | null {
  if (!isDone || !session.snapshotHash || !onReviewChanges) return null;

  return (
    <ActionIconButton
      title="Review changes made by this agent"
      ariaLabel="Review changes"
      color="var(--text-faint)"
      hoverColor="var(--interactive-accent)"
      onClick={(event) => {
        event.stopPropagation();
        onReviewChanges(session.id);
      }}
    >
      <ReviewIcon />
    </ActionIconButton>
  );
}

export function AgentCardHeaderActions({
  session,
  isDone,
  onDismiss,
  onToggleNotes,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
}: AgentCardHeaderActionsProps): React.ReactElement<any> {
  return (
    <>
      <BookmarkAction session={session} onUpdateNotes={onUpdateNotes} />
      <NotesAction
        session={session}
        isDone={isDone}
        onToggleNotes={onToggleNotes}
        onUpdateNotes={onUpdateNotes}
      />
      <ReplayAction session={session} isDone={isDone} onReplay={onReplay} />
      <ReviewChangesAction session={session} isDone={isDone} onReviewChanges={onReviewChanges} />
      {(isDone || session.restored) && <ExportButton session={session} />}
      {isDone && <DismissButton sessionId={session.id} onDismiss={onDismiss} />}
    </>
  );
}
