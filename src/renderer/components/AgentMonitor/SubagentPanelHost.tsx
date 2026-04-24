/**
 * SubagentPanelHost.tsx — Wave 27 Phase B
 *
 * Listens for the `agent-ide:open-subagent-panel` DOM CustomEvent
 * (dispatched by ToolCallRow when a Task tool call is clicked), then looks up
 * the matching subagent by toolCallId and renders SubagentPanel in an overlay
 * drawer pinned to the right side of the monitor pane.
 *
 * Mount once — inside AgentMonitorManagerContent or any containing pane.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { OPEN_SUBAGENT_PANEL_EVENT } from '../../hooks/appEventNames';
import { SubagentPanel } from './SubagentPanel';

// Re-export so ToolCallRow.tsx can import from here if preferred
export const OPEN_SUBAGENT_EVENT = OPEN_SUBAGENT_PANEL_EVENT;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenSubagentPanelDetail {
  toolCallId: string;
  parentSessionId?: string;
  timestamp?: number;
}

interface ResolvedSubagent {
  subagentId: string;
  parentSessionId: string;
}

let lastOpenedSubagentDetail: OpenSubagentPanelDetail | null = null;
let openSubagentCacheListenerAttached = false;

function ensureOpenSubagentCacheListener(): void {
  if (openSubagentCacheListenerAttached || typeof window === 'undefined') return;
  window.addEventListener(OPEN_SUBAGENT_EVENT, ((event: Event) => {
    const detail = (event as CustomEvent<OpenSubagentPanelDetail>).detail;
    if (!detail?.toolCallId) return;
    lastOpenedSubagentDetail = detail;
  }) as EventListener);
  openSubagentCacheListenerAttached = true;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

export function resolveByToolCallId(
  detail: OpenSubagentPanelDetail,
  sessions: Array<{ id: string; parentSessionId?: string; startedAt: number }>,
): ResolvedSubagent | null {
  if (!detail.parentSessionId) return null;

  const candidates = sessions.filter(
    (session) => session.parentSessionId === detail.parentSessionId,
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return {
      subagentId: candidates[0].id,
      parentSessionId: detail.parentSessionId,
    };
  }

  if (typeof detail.timestamp === 'number') {
    const nearest = candidates
      .filter((session) => session.startedAt >= detail.timestamp!)
      .sort(
        (left, right) => left.startedAt - detail.timestamp! - (right.startedAt - detail.timestamp!),
      )[0];
    if (nearest) {
      return {
        subagentId: nearest.id,
        parentSessionId: detail.parentSessionId,
      };
    }
  }

  return {
    subagentId: candidates.sort((left, right) => right.startedAt - left.startedAt)[0].id,
    parentSessionId: detail.parentSessionId,
  };
}

export function consumeLastOpenedSubagentDetail(): OpenSubagentPanelDetail | null {
  ensureOpenSubagentCacheListener();
  const detail = lastOpenedSubagentDetail;
  lastOpenedSubagentDetail = null;
  return detail;
}

ensureOpenSubagentCacheListener();

// ─── Drawer overlay ───────────────────────────────────────────────────────────

interface DrawerProps {
  record: ResolvedSubagent | null;
  toolCallId: string;
  onClose: () => void;
  showCancel: boolean;
}

function SubagentDrawer({
  record,
  toolCallId,
  onClose,
  showCancel,
}: DrawerProps): React.ReactElement {
  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col w-80 bg-surface-base border-l border-border-semantic shadow-lg"
      role="dialog"
      aria-label="Subagent transcript drawer"
      aria-modal="true"
    >
      {record ? (
        <SubagentPanel
          subagentId={record.subagentId}
          parentSessionId={record.parentSessionId}
          onClose={onClose}
          showCancel={showCancel}
        />
      ) : (
        <UnresolvableState toolCallId={toolCallId} onClose={onClose} />
      )}
    </div>
  );
}

function UnresolvableState({
  toolCallId,
  onClose,
}: {
  toolCallId: string;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-semantic flex-shrink-0">
        <span className="text-[12px] font-semibold text-text-semantic-primary">
          Subagent transcript
        </span>
        <button
          className="text-text-semantic-muted hover:text-text-semantic-primary"
          onClick={onClose}
          aria-label="Close subagent panel"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[11px] text-text-semantic-muted">Subagent not found in tracker.</span>
        <span className="text-[10px] text-text-semantic-faint break-all">
          Tool call: {toolCallId}
        </span>
        <span className="text-[10px] text-text-semantic-faint italic">
          The subagent may have already completed and been evicted, or the tracker tap is not yet
          wired for this session type.
        </span>
      </div>
    </div>
  );
}

// ─── Open overlay ─────────────────────────────────────────────────────────────

interface OverlayProps {
  resolved: ResolvedSubagent | null;
  toolCallId: string;
  onClose: () => void;
  showCancel: boolean;
}

function SubagentOverlay({
  resolved,
  toolCallId,
  onClose,
  showCancel,
}: OverlayProps): React.ReactElement {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'var(--surface-overlay)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <SubagentDrawer
        record={resolved}
        toolCallId={toolCallId}
        onClose={onClose}
        showCancel={showCancel}
      />
    </>
  );
}

// ─── Main host component ──────────────────────────────────────────────────────

export interface SubagentPanelHostProps {
  /** When false the entire host is disabled (feature flag off). */
  enabled?: boolean;
  /** All current session IDs visible in the monitor — used to scope queries. */
  sessionIds?: string[];
}

export function SubagentPanelHost({
  enabled = true,
}: SubagentPanelHostProps): React.ReactElement | null {
  const { currentSessions } = useAgentEventsContext();
  const [open, setOpen] = useState(false);
  const [toolCallId, setToolCallId] = useState('');
  const [resolved, setResolved] = useState<ResolvedSubagent | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setToolCallId('');
    setResolved(null);
  }, []);

  const handleOpen = useCallback(
    async (detail: OpenSubagentPanelDetail) => {
      setToolCallId(detail.toolCallId);
      setOpen(true);
      setResolved(resolveByToolCallId(detail, currentSessions));
    },
    [currentSessions],
  );

  useEffect(() => {
    if (!enabled) return;
    function onEvent(e: Event): void {
      const detail = (e as CustomEvent<OpenSubagentPanelDetail>).detail;
      if (!detail?.toolCallId) return;
      void handleOpen(detail);
    }
    window.addEventListener(OPEN_SUBAGENT_EVENT, onEvent);
    return () => window.removeEventListener(OPEN_SUBAGENT_EVENT, onEvent);
  }, [enabled, handleOpen]);

  if (!enabled || !open) return null;
  return (
    <SubagentOverlay
      resolved={resolved}
      toolCallId={toolCallId}
      onClose={handleClose}
      showCancel={enabled}
    />
  );
}
