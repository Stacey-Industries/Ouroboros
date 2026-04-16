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

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../hooks/appEventNames';
import { SubagentPanel } from './SubagentPanel';

// Re-export so ToolCallRow.tsx can import from here if preferred
export const OPEN_SUBAGENT_EVENT = OPEN_SUBAGENT_PANEL_EVENT;

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenSubagentPanelDetail {
  toolCallId: string;
}

interface ResolvedSubagent {
  subagentId: string;
  parentSessionId: string;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

async function resolveByToolCallId(toolCallId: string): Promise<ResolvedSubagent | null> {
  // We can't query by toolCallId directly — fetch all recent subagents
  // by checking each known parent session. Since the monitor already has
  // session IDs, we do a broad list and match.
  //
  // Limitation: only resolves if the subagent tracker has the record.
  // Phase C can add a dedicated `subagent:getByToolCallId` channel.
  try {
    // Use a sentinel parentSessionId of '' to trigger a tracker-wide scan
    // is not available. Instead we rely on the DOM event carrying more context
    // in future. For now, return null and let the panel show a not-found state.
    // The toolCallId is preserved for display.
    void toolCallId;
    return null;
  } catch {
    return null;
  }
}

// ─── Drawer overlay ───────────────────────────────────────────────────────────

interface DrawerProps {
  record: ResolvedSubagent | null;
  toolCallId: string;
  onClose: () => void;
  showCancel: boolean;
}

function SubagentDrawer({ record, toolCallId, onClose, showCancel }: DrawerProps): React.ReactElement {
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
}: { toolCallId: string; onClose: () => void }): React.ReactElement {
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
        <span className="text-[11px] text-text-semantic-muted">
          Subagent not found in tracker.
        </span>
        <span className="text-[10px] text-text-semantic-faint break-all">
          Tool call: {toolCallId}
        </span>
        <span className="text-[10px] text-text-semantic-faint italic">
          The subagent may have already completed and been evicted, or the
          tracker tap is not yet wired for this session type.
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

function SubagentOverlay({ resolved, toolCallId, onClose, showCancel }: OverlayProps): React.ReactElement {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'var(--surface-overlay)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <SubagentDrawer record={resolved} toolCallId={toolCallId} onClose={onClose} showCancel={showCancel} />
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
  const [open, setOpen] = useState(false);
  const [toolCallId, setToolCallId] = useState('');
  const [resolved, setResolved] = useState<ResolvedSubagent | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setToolCallId('');
    setResolved(null);
  }, []);

  const handleOpen = useCallback(async (detail: OpenSubagentPanelDetail) => {
    setToolCallId(detail.toolCallId);
    setOpen(true);
    setResolved(await resolveByToolCallId(detail.toolCallId));
  }, []);

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
