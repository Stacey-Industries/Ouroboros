import React, { memo } from 'react';
import { AgentEventLog } from './AgentEventLog';
import { formatCost, formatTokenCount, estimateCost } from './costCalculator';
import { ToolCallFeed } from './ToolCallFeed';
import { ToolCallTimeline } from './ToolCallTimeline';
import { AgentCardHeaderActions } from './AgentCardHeaderActions';
import {
  CardView,
  ChevronIcon,
  RunningProgress,
  StatusBadge,
  ViewToggle,
  formatDuration,
  getCardContainerStyle,
} from './AgentCardControls';
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

const AgentCardHeader = memo(function AgentCardHeader({
  session,
  expanded,
  isRunning,
  isDone,
  completedCallCount,
  displayDuration,
  onDismiss,
  onToggleNotes,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
  onToggleExpanded,
}: AgentCardHeaderProps): React.ReactElement {
  return (
    <div role="button" tabIndex={0} className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors cursor-pointer" style={{ background: 'transparent' }} onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-tertiary)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }} onClick={onToggleExpanded} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleExpanded(); } }} aria-expanded={expanded}>
      <ChevronIcon open={expanded} />
      <span className="flex-1 min-w-0 text-xs font-medium truncate text-text-semantic-primary" title={session.taskLabel}>
        {session.taskLabel}
      </span>
      <StatusBadge status={session.status} />
      {isRunning ? <RunningProgress startedAt={session.startedAt} completedToolCallCount={completedCallCount} /> : <span className="shrink-0 text-[10px] tabular-nums text-text-semantic-faint">{formatDuration(displayDuration)}</span>}
      <AgentCardHeaderActions session={session} isDone={isDone} onDismiss={onDismiss} onToggleNotes={onToggleNotes} onUpdateNotes={onUpdateNotes} onReviewChanges={onReviewChanges} onReplay={onReplay} />
    </div>
  );
});

function TokenUsageSummary({ session }: { session: AgentSession }): React.ReactElement | null {
  if (session.inputTokens < 1 && session.outputTokens < 1) return null;

  const estimatedCost = estimateCost({
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    model: session.model,
    cacheReadTokens: session.cacheReadTokens,
    cacheWriteTokens: session.cacheWriteTokens,
  }).totalCost;

  const title = `Input: ${session.inputTokens.toLocaleString()} tokens | Output: ${session.outputTokens.toLocaleString()} tokens${session.cacheReadTokens ? ` | Cache read: ${session.cacheReadTokens.toLocaleString()}` : ''}${session.cacheWriteTokens ? ` | Cache write: ${session.cacheWriteTokens.toLocaleString()}` : ''}`;

  return (
    <span className="text-[10px] font-mono flex items-center gap-1.5 text-text-semantic-faint" title={title}>
      <span className="text-text-semantic-muted">{'\u2193'}{formatTokenCount(session.inputTokens)}</span>
      <span className="text-text-semantic-muted">{'\u2191'}{formatTokenCount(session.outputTokens)}</span>
      <span className="text-text-semantic-faint">tokens</span>
      <span className="text-text-semantic-faint">{'\u00b7'}</span>
      <span className="text-interactive-accent">~{formatCost(estimatedCost)}</span>
    </span>
  );
}

function SubagentBadge({ count }: { count: number }): React.ReactElement | null {
  if (count < 1) return null;

  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 text-interactive-accent"
      style={{
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        letterSpacing: '0.02em',
      }}
      title={`Spawned ${count} subagent${count !== 1 ? 's' : ''}`}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M5 1V5M5 5H9M5 5H1M5 5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {count} subagent{count !== 1 ? 's' : ''}
    </span>
  );
}

function AgentCardMeta({ session, childCount }: { session: AgentSession; childCount?: number }): React.ReactElement {
  return (
    <div className="px-6 pb-1 flex items-center gap-2">
      <span className="text-[10px] font-mono text-text-semantic-faint" title={session.id}>
        {session.id.slice(0, 12)}
      </span>
      {session.restored && <span className="text-[9px] px-1 py-0.5 rounded bg-surface-raised text-text-semantic-faint border border-border-semantic" style={{ letterSpacing: '0.02em' }}>restored</span>}
      {childCount !== undefined && childCount > 0 && <SubagentBadge count={childCount} />}
      {session.parentSessionId && <span className="text-[9px] px-1 py-0.5 rounded bg-surface-raised text-text-semantic-faint border border-border-semantic" style={{ letterSpacing: '0.02em' }} title={`Parent: ${session.parentSessionId}`}>subagent</span>}
      <TokenUsageSummary session={session} />
    </div>
  );
}

function SessionErrorBanner({ error }: { error?: string }): React.ReactElement | null {
  if (!error) return null;

  return (
    <div className="mx-2.5 mb-2 px-2 py-1.5 rounded text-[11px] selectable text-status-error" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--error) 20%, transparent)' }}>
      {error}
    </div>
  );
}

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
}): React.ReactElement | null {
  if (showNotes && onSaveNotes) {
    return (
      <div className="mx-2.5 mb-2 p-2 rounded bg-surface-raised border border-border-semantic">
        <textarea value={notesDraft} onChange={(event) => onNotesDraftChange(event.target.value)} onBlur={onSaveNotes} placeholder="Add notes about this session..." rows={2} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '11px', fontFamily: 'var(--font-ui)', outline: 'none', resize: 'vertical', minHeight: '36px', lineHeight: 1.5, boxSizing: 'border-box' }} />
      </div>
    );
  }

  if (!showNotes && session.notes) {
    return (
      <div className="mx-6 mb-1.5 text-[10px] italic truncate text-text-semantic-muted" title={session.notes}>
        {session.notes}
      </div>
    );
  }

  return null;
}

function CollapsedPreview({ latestCall }: { latestCall?: ToolCallEvent }): React.ReactElement | null {
  if (!latestCall) return null;

  return (
    <div className="px-6 pb-2 text-[10px] truncate text-text-semantic-faint" title={`${latestCall.toolName}: ${latestCall.input}`}>
      <span className="text-text-semantic-muted">{latestCall.toolName}</span>
      {' '}
      {latestCall.input}
    </div>
  );
}

function EventLogSection({
  session,
  showLog,
  onToggleLog,
}: {
  session: AgentSession;
  showLog: boolean;
  onToggleLog: () => void;
}): React.ReactElement {
  return (
    <div style={{ borderTop: '1px solid var(--border-muted)' }}>
      <button onClick={onToggleLog} className="w-full px-3 py-1 text-[10px] text-left transition-colors text-text-semantic-faint" onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--text-muted)'; }} onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--text-faint)'; }}>
        {showLog ? '\u25b2 Hide log' : '\u25bc Show event log'}
      </button>
      {showLog && <AgentEventLog toolCalls={session.toolCalls} sessionId={session.id} />}
    </div>
  );
}

function AgentCardExpandedContent({
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
}): React.ReactElement {
  if (!expanded) return <CollapsedPreview latestCall={latestCall} />;

  return (
    <div>
      {session.toolCalls.length > 0 && <div className="flex items-center justify-end px-3 py-1 gap-2" style={{ borderBottom: '1px solid var(--border-muted)' }}><ViewToggle view={cardView} onChange={onCardViewChange} /></div>}
      {cardView === 'feed' ? <ToolCallFeed toolCalls={session.toolCalls} /> : <ToolCallTimeline toolCalls={session.toolCalls} sessionStartedAt={session.startedAt} sessionRunning={isRunning} />}
      {session.toolCalls.length > 0 && <EventLogSection session={session} showLog={showLog} onToggleLog={onToggleLog} />}
    </div>
  );
}

export const AgentCardLayout = memo(function AgentCardLayout({
  session,
  expanded,
  showLog,
  showNotes,
  notesDraft,
  cardView,
  childCount,
  isRunning,
  isDone,
  completedCallCount,
  displayDuration,
  latestCall,
  onDismiss,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
  onToggleExpanded,
  onToggleLog,
  onToggleNotes,
  onNotesDraftChange,
  onSaveNotes,
  onCardViewChange,
}: AgentCardLayoutProps): React.ReactElement {
  return (
    <div className="border-b" style={getCardContainerStyle(session.status)}>
      <AgentCardHeader session={session} expanded={expanded} isRunning={isRunning} isDone={isDone} completedCallCount={completedCallCount} displayDuration={displayDuration} onDismiss={onDismiss} onToggleNotes={onToggleNotes} onUpdateNotes={onUpdateNotes} onReviewChanges={onReviewChanges} onReplay={onReplay} onToggleExpanded={onToggleExpanded} />
      <AgentCardMeta session={session} childCount={childCount} />
      <SessionErrorBanner error={session.status === 'error' ? session.error : undefined} />
      <SessionNotes session={session} showNotes={showNotes} notesDraft={notesDraft} onNotesDraftChange={onNotesDraftChange} onSaveNotes={onSaveNotes} />
      <AgentCardExpandedContent session={session} expanded={expanded} cardView={cardView} showLog={showLog} latestCall={latestCall} isRunning={isRunning} onToggleLog={onToggleLog} onCardViewChange={onCardViewChange} />
    </div>
  );
});
