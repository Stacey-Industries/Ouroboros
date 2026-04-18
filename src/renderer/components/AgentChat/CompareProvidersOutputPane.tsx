/**
 * CompareProvidersOutputPane.tsx — Wave 36 Phase F
 *
 * Single output pane showing one provider's streaming response.
 * Used twice (side-by-side on desktop, stacked on mobile) inside CompareProviders.
 */

import React from 'react';

import type { ProviderPaneState } from '../../hooks/useCompareSession';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProviderPaneState['status'], string> = {
  idle:      'text-text-semantic-muted',
  streaming: 'text-status-info',
  completed: 'text-status-success',
  error:     'text-status-error',
};

function StatusBadge({ status }: { status: ProviderPaneState['status'] }): React.ReactElement {
  return (
    <span className={`text-xs font-medium capitalize ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

const PANE_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0,
  gap: '8px',
};

interface PaneHeaderProps {
  label: string;
  status: ProviderPaneState['status'];
  cost: number | null;
}

function PaneHeader({ label, status, cost }: PaneHeaderProps): React.ReactElement {
  return (
    <div style={PANE_HEADER_STYLE}>
      <span className="text-sm font-semibold text-text-semantic-primary">{label}</span>
      <span className="flex items-center gap-2">
        <StatusBadge status={status} />
        {cost !== null && (
          <span className="text-xs text-text-semantic-muted">
            ${cost.toFixed(4)}
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Output body ──────────────────────────────────────────────────────────────

const OUTPUT_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '12px',
  fontFamily: 'var(--font-editor, monospace)',
  fontSize: '13px',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface CompareProvidersOutputPaneProps {
  providerId: string;
  label: string;
  text: string;
  status: ProviderPaneState['status'];
  cost: number | null;
  completedAt: number | null;
}

export function CompareProvidersOutputPane({
  label,
  text,
  status,
  cost,
}: CompareProvidersOutputPaneProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-panel border border-border-subtle rounded">
      <PaneHeader label={label} status={status} cost={cost} />
      <div style={OUTPUT_STYLE}>
        {text || (
          <span className="text-text-semantic-faint">
            {status === 'idle' ? 'Waiting…' : 'No output yet.'}
          </span>
        )}
      </div>
    </div>
  );
}
