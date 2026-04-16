/**
 * SubagentPanel.tsx — Wave 27 Phase B + C
 *
 * Transcript view for a single subagent session. Shows spawn time, cost,
 * status, parent linkage, and a virtualized message list.
 *
 * Phase C adds: Cancel button (shown when status=running and showCancel=true),
 * wired to subagent:cancel IPC with toast feedback via useToastContext.
 *
 * Subscribe to subagent:updated IPC to stay live.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { SubagentRecord } from '../../types/electron';
import { SubagentStatusChip } from './SubagentStatusChip';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SubagentPanelProps {
  subagentId: string;
  parentSessionId: string;
  onClose?: () => void;
  /** When true, shows Cancel button for running subagents (agentic.subagentUx gate). */
  showCancel?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(startedAt: number, endedAt: number | undefined): string {
  const end = endedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  record: SubagentRecord;
  onClose?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
}

interface CancelBtnProps { onCancel: () => void; cancelling?: boolean }

function CancelButton({ onCancel, cancelling }: CancelBtnProps): React.ReactElement {
  return (
    <button
      className="text-[10px] px-1.5 py-0.5 rounded transition-colors text-status-error"
      onClick={onCancel}
      aria-label="Cancel subagent"
      disabled={cancelling}
      style={{
        background: 'var(--status-error-subtle)',
        border: '1px solid var(--status-error)',
        cursor: cancelling ? 'not-allowed' : 'pointer',
        opacity: cancelling ? 0.6 : 1,
      }}
    >
      {cancelling ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}

function SubagentPanelHeader({ record, onClose, onCancel, cancelling }: HeaderProps): React.ReactElement {
  const canCancel = onCancel && record.status === 'running';
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-border-semantic flex-shrink-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-text-semantic-primary truncate">
            {record.taskLabel ?? 'Subagent'}
          </span>
          <SubagentStatusChip status={record.status} />
        </div>
        <SubagentMetaRow record={record} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canCancel && <CancelButton onCancel={onCancel} cancelling={cancelling} />}
        {onClose && (
          <button
            className="text-text-semantic-muted hover:text-text-semantic-primary transition-colors"
            onClick={onClose}
            aria-label="Close subagent panel"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function SubagentMetaRow({ record }: { record: SubagentRecord }): React.ReactElement {
  return (
    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
      <span className="text-[10px] text-text-semantic-muted tabular-nums">
        {formatTime(record.startedAt)}
      </span>
      <span className="text-[10px] text-text-semantic-muted tabular-nums">
        {formatDuration(record.startedAt, record.endedAt)}
      </span>
      {record.usdCost > 0 && (
        <span className="text-[10px] text-text-semantic-muted tabular-nums">
          {formatCost(record.usdCost)}
        </span>
      )}
      {record.inputTokens > 0 && (
        <span className="text-[10px] text-text-semantic-faint tabular-nums">
          {(record.inputTokens + record.outputTokens).toLocaleString()} tok
        </span>
      )}
    </div>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────────

interface MessageRowProps {
  role: string;
  content: string;
  at: number;
}

function SubagentMessageRow({ role, content, at }: MessageRowProps): React.ReactElement {
  const isUser = role === 'user';
  return (
    <div
      className="px-3 py-2 border-b border-border-subtle"
      style={{ background: isUser ? 'var(--surface-raised)' : 'var(--surface-base)' }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: isUser ? 'var(--interactive-accent)' : 'var(--text-secondary)' }}
        >
          {role}
        </span>
        <span className="text-[10px] text-text-semantic-faint tabular-nums">
          {formatTime(at)}
        </span>
      </div>
      <p
        className="text-[11px] leading-relaxed text-text-semantic-primary whitespace-pre-wrap break-words m-0 selectable"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {content}
      </p>
    </div>
  );
}

// ─── Virtualized message list ──────────────────────────────────────────────────

interface MessageListProps {
  messages: SubagentRecord['messages'];
}

function SubagentMessageList({ messages }: MessageListProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-text-semantic-faint italic">
        No messages yet.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const msg = messages[item.index];
          return (
            <div
              key={item.index}
              style={{ position: 'absolute', top: item.start, left: 0, right: 0 }}
              ref={virtualizer.measureElement}
              data-index={item.index}
            >
              <SubagentMessageRow role={msg.role} content={msg.content} at={msg.at} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Empty + error states ─────────────────────────────────────────────────────

function LoadingState(): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center text-[11px] text-text-semantic-muted">
      Loading subagent data…
    </div>
  );
}

function ErrorState({ error }: { error: string }): React.ReactElement {
  return (
    <div className="flex-1 flex items-center justify-center text-[11px] text-status-error px-4 text-center">
      {error}
    </div>
  );
}

// ─── Data hook ────────────────────────────────────────────────────────────────

interface UseSubagentDataResult {
  record: SubagentRecord | null;
  loading: boolean;
  error: string | null;
}

function useSubagentData(
  subagentId: string,
  parentSessionId: string,
): UseSubagentDataResult {
  const [record, setRecord] = useState<SubagentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const api = window.electronAPI.subagent;
      const result = await api.get({ subagentId });
      if (!result.success) {
        setError(result.error ?? 'Failed to load subagent');
        return;
      }
      setRecord(result.record ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [subagentId]);

  useEffect(() => {
    void load();
    const api = window.electronAPI.subagent;
    return api.onUpdated((event) => {
      if (event.parentSessionId === parentSessionId) void load();
    });
  }, [load, parentSessionId]);

  return { record, loading, error };
}

// ─── Cancel hook ──────────────────────────────────────────────────────────────

function useSubagentCancel(subagentId: string): {
  cancelling: boolean;
  handleCancel: () => void;
} {
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToastContext();

  const handleCancel = useCallback(() => {
    setCancelling(true);
    window.electronAPI.subagent.cancel({ subagentId })
      .then((result) => {
        if (result.success) {
          toast('Subagent cancelled', 'success');
        } else {
          toast(result.error ?? 'Failed to cancel subagent', 'error');
        }
      })
      .catch(() => { toast('Failed to cancel subagent', 'error'); })
      .finally(() => { setCancelling(false); });
  }, [subagentId, toast]);

  return { cancelling, handleCancel };
}

// ─── Panel body ───────────────────────────────────────────────────────────────

interface PanelBodyProps {
  subagentId: string;
  loading: boolean;
  error: string | null;
  record: SubagentRecord | null;
  onClose?: () => void;
  onCancel?: () => void;
  cancelling: boolean;
}

function SubagentPanelBody({
  subagentId, loading, error, record, onClose, onCancel, cancelling,
}: PanelBodyProps): React.ReactElement {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!record) return <ErrorState error={`Subagent '${subagentId}' not found.`} />;
  return (
    <>
      <SubagentPanelHeader record={record} onClose={onClose} onCancel={onCancel} cancelling={cancelling} />
      <SubagentMessageList messages={record.messages} />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SubagentPanel({
  subagentId,
  parentSessionId,
  onClose,
  showCancel,
}: SubagentPanelProps): React.ReactElement {
  const { record, loading, error } = useSubagentData(subagentId, parentSessionId);
  const { cancelling, handleCancel } = useSubagentCancel(subagentId);

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-surface-base border-l border-border-semantic"
      aria-label="Subagent transcript"
      role="region"
    >
      <SubagentPanelBody
        subagentId={subagentId}
        loading={loading}
        error={error}
        record={record}
        onClose={onClose}
        onCancel={showCancel ? handleCancel : undefined}
        cancelling={cancelling}
      />
    </div>
  );
}
