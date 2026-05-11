/**
 * ChatStateNewPathDebugPanel.tsx — Dev-only debug panel for the new chat
 * orchestration state path (Wave 86 Phase 1).
 *
 * Rendered only when agentChatSettings.chatOrchestration.useNewStateMachine is true.
 * Shows thread status, accumulated text, and the last received diff — enough
 * to smoke-test the walking skeleton without building full chat UI.
 *
 * Not wired into any production layout. Mount from a dev settings panel or
 * temporarily from AgentChat.tsx during local testing.
 */

import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  threadId: string;
}

interface PanelState {
  snapshot: ChatStateSnapshot | null;
  lastDiff: ChatStateDiff | null;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initialState(): PanelState {
  return { snapshot: null, lastDiff: null, error: null };
}

function statusLabel(snapshot: ChatStateSnapshot | null): string {
  if (!snapshot) return '—';
  return snapshot.status;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function usePanelState(threadId: string): PanelState {
  const [state, setState] = useState<PanelState>(initialState);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.chatStateNewPath
      .requestSnapshot(threadId)
      .then((snap) => {
        if (mounted) setState((s) => ({ ...s, snapshot: snap, error: null }));
      })
      .catch((err: unknown) => {
        if (mounted)
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
          }));
      });
    const unsub = window.electronAPI.chatStateNewPath.onStateDiff(threadId, (diff) => {
      if (mounted) setState((s) => ({ ...s, lastDiff: diff }));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [threadId]);

  return state;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatStateNewPathDebugPanel({ threadId }: Props) {
  const state = usePanelState(threadId);
  return (
    <div className="p-3 text-xs font-mono border border-border-semantic rounded bg-surface-inset">
      <div className="text-text-semantic-muted mb-1">[wave-86 debug] thread: {threadId}</div>
      <div>status: {statusLabel(state.snapshot)}</div>
      <div>seq: {state.snapshot?.seq ?? '—'}</div>
      <div>activeTurnId: {state.snapshot?.activeTurnId ?? '—'}</div>
      {state.snapshot?.accumulatedText ? (
        <div className="mt-1 text-text-semantic-secondary truncate">
          text: {state.snapshot.accumulatedText.slice(0, 120)}
        </div>
      ) : null}
      {state.lastDiff ? (
        <div className="mt-1 text-text-semantic-muted">lastDiff.type: {state.lastDiff.type}</div>
      ) : null}
      {state.error ? <div className="mt-1 text-status-error">error: {state.error}</div> : null}
    </div>
  );
}
