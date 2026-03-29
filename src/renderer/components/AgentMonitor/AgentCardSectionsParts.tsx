import React from 'react';

import { type CardView, ViewToggle } from './AgentCardControls';
import { AgentCardMeta } from './AgentCardSectionsViews';
import { AgentEventLog } from './AgentEventLog';
import { ToolCallFeed } from './ToolCallFeed';
import { ToolCallTimeline } from './ToolCallTimeline';
import type { AgentSession, ToolCallEvent } from './types';

export { AgentCardMeta };

interface SessionNotesEditorProps {
  notesDraft: string;
  onNotesDraftChange: (value: string) => void;
  onSaveNotes: () => void;
}

const NOTES_TEXTAREA_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: '11px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  resize: 'vertical',
  minHeight: '36px',
  lineHeight: 1.5,
  boxSizing: 'border-box',
};

export function SessionNotesEditor({
  notesDraft,
  onNotesDraftChange,
  onSaveNotes,
}: SessionNotesEditorProps): React.ReactElement<any> {
  return (
    <div className="mx-2.5 mb-2 p-2 rounded bg-surface-raised border border-border-semantic">
      <textarea
        value={notesDraft}
        onChange={(event) => onNotesDraftChange(event.target.value)}
        onBlur={onSaveNotes}
        placeholder="Add notes about this session..."
        rows={2}
        style={NOTES_TEXTAREA_STYLE}
      />
    </div>
  );
}

export function SessionNotesPreview({ notes }: { notes: string }): React.ReactElement<any> {
  return (
    <div className="mx-6 mb-1.5 text-[10px] italic truncate text-text-semantic-muted" title={notes}>
      {notes}
    </div>
  );
}

export function SessionErrorBanner({ error }: { error?: string }): React.ReactElement<any> | null {
  if (!error) return null;
  return (
    <div
      className="mx-2.5 mb-2 px-2 py-1.5 rounded text-[11px] selectable text-status-error"
      style={{
        background: 'color-mix(in srgb, var(--status-error) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--status-error) 20%, transparent)',
      }}
    >
      {error}
    </div>
  );
}

export function EventLogSection({
  session,
  showLog,
  onToggleLog,
}: {
  session: AgentSession;
  showLog: boolean;
  onToggleLog: () => void;
}): React.ReactElement<any> {
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <button
        onClick={onToggleLog}
        className="w-full px-3 py-1 text-[10px] text-left transition-colors text-text-semantic-faint"
        onMouseEnter={(event) => {
          event.currentTarget.style.color = 'var(--text-muted)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = 'var(--text-faint)';
        }}
      >
        {showLog ? '\u25b2 Hide log' : '\u25bc Show event log'}
      </button>
      {showLog && <AgentEventLog toolCalls={session.toolCalls} sessionId={session.id} />}
    </div>
  );
}

export function ExpandedToolView({
  session,
  cardView,
  showLog,
  isRunning,
  onToggleLog,
}: {
  session: AgentSession;
  cardView: CardView;
  showLog: boolean;
  isRunning: boolean;
  onToggleLog: () => void;
}): React.ReactElement<any> {
  return (
    <div>
      {cardView === 'feed' ? (
        <ToolCallFeed toolCalls={session.toolCalls} />
      ) : (
        <ToolCallTimeline
          toolCalls={session.toolCalls}
          sessionStartedAt={session.startedAt}
          sessionRunning={isRunning}
        />
      )}
      {session.toolCalls.length > 0 && (
        <EventLogSection session={session} showLog={showLog} onToggleLog={onToggleLog} />
      )}
    </div>
  );
}

export function CollapsedPreview({
  latestCall,
}: {
  latestCall?: ToolCallEvent;
}): React.ReactElement<any> | null {
  if (!latestCall) return null;
  return (
    <div
      className="px-6 pb-2 text-[10px] truncate text-text-semantic-faint"
      title={`${latestCall.toolName}: ${latestCall.input}`}
    >
      <span className="text-text-semantic-muted">{latestCall.toolName}</span> {latestCall.input}
    </div>
  );
}

export function ViewToggleBar({
  cardView,
  onCardViewChange,
}: {
  cardView: CardView;
  onCardViewChange: (view: CardView) => void;
}): React.ReactElement<any> {
  return (
    <div
      className="flex items-center justify-end px-3 py-1 gap-2"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <ViewToggle view={cardView} onChange={onCardViewChange} />
    </div>
  );
}

export function AgentCardExpandedContent({
  session,
  expanded,
  cardView,
  showLog,
  latestCall,
  isRunning,
  onToggleLog,
  onCardViewChange,
}: {
  session: AgentSession;
  expanded: boolean;
  cardView: CardView;
  showLog: boolean;
  latestCall?: ToolCallEvent;
  isRunning: boolean;
  onToggleLog: () => void;
  onCardViewChange: (view: CardView) => void;
}): React.ReactElement<any> {
  if (!expanded) return <CollapsedPreview latestCall={latestCall} />;
  return (
    <div>
      {session.toolCalls.length > 0 && (
        <ViewToggleBar cardView={cardView} onCardViewChange={onCardViewChange} />
      )}
      <ExpandedToolView
        session={session}
        cardView={cardView}
        showLog={showLog}
        isRunning={isRunning}
        onToggleLog={onToggleLog}
      />
    </div>
  );
}
