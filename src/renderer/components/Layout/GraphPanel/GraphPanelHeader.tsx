/**
 * GraphPanelHeader.tsx — toolbar for the graph panel.
 *
 * Controls: zoom in/out buttons, reset-view button, node name filter input.
 */

import React from 'react';

interface GraphPanelHeaderProps {
  scale: number;
  filter: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFilterChange: (value: string) => void;
}

const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 4,
  border: '1px solid var(--border-semantic)', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, flexShrink: 0,
};

function ToolbarButton({ label, title, onClick, children }: {
  label: string; title: string; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <button style={btnBase} title={title} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function GraphPanelHeader({ scale, filter, onZoomIn, onZoomOut, onResetView, onFilterChange }: GraphPanelHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-border-semantic bg-surface-raised px-2" style={{ height: 36, flexShrink: 0 }}>
      <ToolbarButton label="Zoom in" title="Zoom in" onClick={onZoomIn}>+</ToolbarButton>
      <ToolbarButton label="Zoom out" title="Zoom out" onClick={onZoomOut}>−</ToolbarButton>
      <ToolbarButton label="Reset view" title="Reset view" onClick={onResetView}>⌂</ToolbarButton>
      <span className="text-xs text-text-semantic-muted" style={{ minWidth: 36, textAlign: 'center' }} aria-label={`Zoom level ${Math.round(scale * 100)}%`}>
        {`${Math.round(scale * 100)}%`}
      </span>
      <input type="search" value={filter} onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Filter nodes…" aria-label="Filter nodes by name"
        className="h-6 flex-1 rounded border border-border-subtle bg-surface-inset px-2 text-xs text-text-semantic-primary placeholder:text-text-semantic-faint"
        style={{ minWidth: 0 }}
      />
    </div>
  );
}
