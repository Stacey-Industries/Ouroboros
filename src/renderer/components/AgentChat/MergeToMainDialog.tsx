/**
 * MergeToMainDialog.tsx — Wave 23 Phase D
 *
 * Dialog for merging a side chat's summary into the main thread as a
 * system-role message. Provides an editable summary (heuristic prefill)
 * and a checkbox list to optionally include specific messages verbatim.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useToastContext } from '../../contexts/ToastContext';
import type { AgentChatMessageRecord } from '../../types/electron';

// ── Heuristic summary ─────────────────────────────────────────────────────────

const SUMMARY_MAX_CHARS = 500;

/** First non-empty line of a string, trimmed. */
function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
}

export function buildHeuristicSummary(messages: AgentChatMessageRecord[]): string {
  const lines = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => firstLine(m.content))
    .filter((l) => l.length > 0);

  const joined = lines.join(' — ');
  return joined.length <= SUMMARY_MAX_CHARS
    ? joined
    : `${joined.slice(0, SUMMARY_MAX_CHARS - 1)}…`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MergeToMainDialogProps {
  sideChatId: string;
  parentThreadId: string;
  isOpen: boolean;
  onClose: () => void;
  onMerged?: (messageId: string) => void;
}

// ── Keyboard dismissal ────────────────────────────────────────────────────────

function useDialogKeyboard(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

// ── Thread loading ────────────────────────────────────────────────────────────

function useLoadSideChatMessages(sideChatId: string, isOpen: boolean): {
  messages: AgentChatMessageRecord[];
  loading: boolean;
} {
  const [messages, setMessages] = useState<AgentChatMessageRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    window.electronAPI.agentChat
      .loadThread(sideChatId)
      .then((result) => {
        if (result.success && result.thread) {
          setMessages(result.thread.messages);
        }
      })
      .catch(() => { /* leave empty */ })
      .finally(() => setLoading(false));
  }, [sideChatId, isOpen]);

  return { messages, loading };
}

// ── Message checkbox list ─────────────────────────────────────────────────────

interface MessageRowProps {
  message: AgentChatMessageRecord;
  checked: boolean;
  onToggle: (id: string) => void;
}

function MessageCheckboxRow({ message, checked, onToggle }: MessageRowProps): React.ReactElement {
  const label =
    message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'User' : 'System';
  const preview = message.content.slice(0, 120);

  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(message.id)}
        className="mt-0.5 flex-shrink-0 accent-interactive-accent"
        aria-label={`Include message from ${label}`}
      />
      <span className="min-w-0">
        <span className="mr-1.5 text-xs font-medium text-text-semantic-secondary">{label}</span>
        <span className="text-xs text-text-semantic-muted">
          {preview.length < message.content.length ? `${preview}…` : preview}
        </span>
      </span>
    </label>
  );
}

interface MessageListProps {
  messages: AgentChatMessageRecord[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

function MessageCheckboxList({ messages, selectedIds, onToggle }: MessageListProps): React.ReactElement {
  const visible = messages.filter((m) => m.role === 'user' || m.role === 'assistant');

  if (visible.length === 0) {
    return (
      <p className="py-2 text-xs text-text-semantic-muted">No messages to include.</p>
    );
  }

  return (
    <div className="max-h-40 overflow-y-auto rounded border border-border-subtle bg-surface-inset">
      {visible.map((m) => (
        <MessageCheckboxRow
          key={m.id}
          message={m}
          checked={selectedIds.has(m.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// ── Merge action ──────────────────────────────────────────────────────────────

interface MergeActionProps {
  sideChatId: string;
  parentThreadId: string;
  onClose: () => void;
  onMerged?: (messageId: string) => void;
}

function useMergeAction({ sideChatId, parentThreadId, onClose, onMerged }: MergeActionProps): {
  merging: boolean;
  error: string | null;
  handleMerge: (summary: string, includeMessageIds: string[]) => void;
} {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToastContext();

  const handleMerge = useCallback(
    (summary: string, includeMessageIds: string[]) => {
      if (!summary.trim()) return;
      setMerging(true);
      setError(null);
      window.electronAPI.agentChat
        .mergeSideChat({
          sideChatId,
          mainThreadId: parentThreadId,
          summary: summary.trim(),
          includeMessageIds: includeMessageIds.length > 0 ? includeMessageIds : undefined,
        })
        .then((result) => {
          if (result.success && result.systemMessageId) {
            toast('Side chat merged into main thread.', 'success');
            onMerged?.(result.systemMessageId);
            onClose();
          } else {
            setError(result.error ?? 'Merge failed');
          }
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Merge failed'))
        .finally(() => setMerging(false));
    },
    [sideChatId, parentThreadId, onClose, onMerged, toast],
  );

  return { merging, error, handleMerge };
}

// ── Summary textarea ──────────────────────────────────────────────────────────

interface SummaryAreaProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function SummaryTextarea({ value, onChange, disabled }: SummaryAreaProps): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={4}
      className="w-full resize-y rounded border border-border-subtle bg-surface-inset px-2.5 py-1.5 text-sm text-text-semantic-primary outline-none focus:border-interactive-accent disabled:opacity-60"
      placeholder="Summary of side chat findings…"
      aria-label="Side chat summary"
    />
  );
}

// ── Dialog sub-components ─────────────────────────────────────────────────────

function DialogHeader({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
      <h3 id="merge-dialog-title" className="text-sm font-medium text-text-semantic-primary">
        Merge into main thread
      </h3>
      <button
        type="button"
        aria-label="Close merge dialog"
        onClick={onClose}
        className="rounded p-1 text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary"
      >
        ✕
      </button>
    </div>
  );
}

interface FooterProps { merging: boolean; summary: string; onClose: () => void }

function DialogFormFooter({ merging, summary, onClose }: FooterProps): React.ReactElement {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={merging}
        className="rounded px-3 py-1 text-xs text-text-semantic-muted transition-colors hover:text-text-semantic-primary"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={merging || !summary.trim()}
        className="rounded bg-interactive-accent px-3 py-1 text-xs text-text-on-accent transition-opacity disabled:opacity-50"
      >
        {merging ? 'Merging…' : 'Merge'}
      </button>
    </div>
  );
}

// ── Dialog body ───────────────────────────────────────────────────────────────

interface DialogBodyProps {
  messages: AgentChatMessageRecord[];
  loading: boolean;
  merging: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: (summary: string, includeIds: string[]) => void;
}

function useDialogState(messages: AgentChatMessageRecord[]) {
  const [summary, setSummary] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const prefillDone = useRef(false);

  useEffect(() => {
    if (!prefillDone.current && messages.length > 0) {
      setSummary(buildHeuristicSummary(messages));
      prefillDone.current = true;
    }
  }, [messages]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { summary, setSummary, selectedIds, toggleId };
}

function DialogBody({ messages, loading, merging, error, onClose, onMerge }: DialogBodyProps): React.ReactElement {
  const { summary, setSummary, selectedIds, toggleId } = useDialogState(messages);
  const handleSubmit = useCallback(
    (e: React.FormEvent) => { e.preventDefault(); onMerge(summary, Array.from(selectedIds)); },
    [summary, selectedIds, onMerge],
  );
  return (
    <div
      className="flex flex-col rounded-lg border border-border-semantic bg-surface-overlay shadow-lg"
      style={{ width: 520, maxHeight: '80vh' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-dialog-title"
    >
      <DialogHeader onClose={onClose} />
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 overflow-y-auto p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-semantic-secondary">Summary</label>
          {loading
            ? <div className="flex h-20 items-center justify-center text-xs text-text-semantic-muted">Loading…</div>
            : <SummaryTextarea value={summary} onChange={setSummary} disabled={merging} />}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-text-semantic-secondary">Include messages (optional)</p>
          <MessageCheckboxList messages={messages} selectedIds={selectedIds} onToggle={toggleId} />
        </div>
        {error && <p className="text-xs text-status-error" role="alert">{error}</p>}
        <DialogFormFooter merging={merging} summary={summary} onClose={onClose} />
      </form>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MergeToMainDialog({
  sideChatId,
  parentThreadId,
  isOpen,
  onClose,
  onMerged,
}: MergeToMainDialogProps): React.ReactElement | null {
  const { messages, loading } = useLoadSideChatMessages(sideChatId, isOpen);
  const { merging, error, handleMerge } = useMergeAction({ sideChatId, parentThreadId, onClose, onMerged });
  useDialogKeyboard(isOpen, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <DialogBody
        messages={messages}
        loading={loading}
        merging={merging}
        error={error}
        onClose={onClose}
        onMerge={handleMerge}
      />
    </div>,
    document.body,
  );
}
