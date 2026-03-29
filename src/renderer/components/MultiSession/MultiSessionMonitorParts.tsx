import React from 'react';

import { formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';
import type { AgentSession } from '../AgentMonitor/types';
import type { BatchStats, GridLayout } from './multiSessionMonitorModel';
import { SessionCell } from './MultiSessionMonitorParts.cell';

export { CompactToolCall } from './MultiSessionMonitorParts.cell';

function updateCloseButtonColor(button: HTMLButtonElement, hover: boolean): void {
  button.style.color = hover ? 'var(--text-primary)' : 'var(--text-faint)';
}

function PanelGridIcon(): React.ReactElement<any> {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="text-interactive-accent"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="5" height="6" rx="1" />
      <rect x="10" y="1" width="5" height="6" rx="1" />
      <rect x="1" y="9" width="5" height="6" rx="1" />
      <rect x="10" y="9" width="5" height="6" rx="1" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HeaderCloseButton({ onClick }: { onClick: () => void }): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded p-1 transition-colors text-text-semantic-faint"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(event) => updateCloseButtonColor(event.currentTarget, true)}
      onMouseLeave={(event) => updateCloseButtonColor(event.currentTarget, false)}
      title="Exit multi-session view"
      aria-label="Exit multi-session view"
    >
      <CloseIcon />
    </button>
  );
}

export function MonitorHeader({
  completed,
  onClose,
  total,
}: {
  completed: number;
  onClose: () => void;
  total: number;
}): React.ReactElement<any> {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2 border-b border-border-semantic">
      <PanelGridIcon />
      <span className="flex-1 text-xs font-semibold text-text-semantic-primary">
        Multi-Session Monitor
      </span>
      <span className="text-[10px] tabular-nums text-text-semantic-faint">
        {completed}/{total} complete
      </span>
      <HeaderCloseButton onClick={onClose} />
    </div>
  );
}

export function SessionGrid({
  batchLabels,
  batchSessions,
  gridLayout,
  onViewFull,
}: {
  batchLabels: string[];
  batchSessions: Array<AgentSession | null>;
  gridLayout: GridLayout;
  onViewFull: () => void;
}): React.ReactElement<any> {
  return (
    <div
      className="min-h-0 flex-1 p-2"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridLayout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
        gap: '6px',
      }}
    >
      {batchLabels.map((label, index) => (
        <SessionCell
          key={`${label}-${index}`}
          label={label}
          onViewFull={onViewFull}
          session={batchSessions[index]}
        />
      ))}
    </div>
  );
}

function FooterMetric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  valueColor: string;
}): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-semantic-faint">{label}</span>
      <span className="text-[11px]" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

function TokenMetric({ stats }: { stats: BatchStats }): React.ReactElement<any> {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-semantic-faint">Tokens:</span>
      <span className="font-mono text-[11px] tabular-nums text-text-semantic-muted">
        {formatTokenCount(stats.totalInputTokens + stats.totalOutputTokens)}
      </span>
      <span className="text-[10px] text-text-semantic-faint">
        ({formatTokenCount(stats.totalInputTokens)} in / {formatTokenCount(stats.totalOutputTokens)}{' '}
        out)
      </span>
    </div>
  );
}

export function MonitorFooter({ stats }: { stats: BatchStats }): React.ReactElement<any> {
  return (
    <div className="flex flex-shrink-0 items-center gap-4 px-3 py-2 border-t border-border-semantic bg-surface-panel">
      <FooterMetric
        label="Total cost:"
        value={`~${formatCost(stats.totalCost)}`}
        valueColor="var(--interactive-accent)"
      />
      <FooterMetric
        label="Sessions:"
        value={`${stats.completed}/${stats.total}`}
        valueColor={stats.completed === stats.total ? 'var(--status-success)' : 'var(--text-muted)'}
      />
      <TokenMetric stats={stats} />
    </div>
  );
}
