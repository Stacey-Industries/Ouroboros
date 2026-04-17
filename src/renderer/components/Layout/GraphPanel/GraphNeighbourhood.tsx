/**
 * GraphNeighbourhood.tsx — Compact neighbourhood pop-over overlay.
 *
 * Rendered when a node is selected in GraphPanel (or right-clicked in diff
 * review). Shows the selected symbol's immediate callers, callees, and imports
 * as a compact tree overlay.
 *
 * Gated on the `review.enhanced` feature flag (default true). When false the
 * component renders null.
 */

import React from 'react';

import type { GraphNeighbourhoodResult, RawGraphNode } from '../../../types/electron-graph';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphNeighbourhoodProps {
  data: GraphNeighbourhoodResult | null;
  loading: boolean;
  onClose: () => void;
  enabled: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NodeRow({ node, relation }: { node: RawGraphNode; relation: string }): React.ReactElement {
  const fileName = node.filePath.split('/').pop() ?? node.filePath;
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs">
      <span className="shrink-0 text-[10px] text-text-semantic-muted w-12 text-right">{relation}</span>
      <span className="truncate font-mono text-text-semantic-primary">{node.name}</span>
      <span className="ml-auto shrink-0 text-[10px] text-text-semantic-faint">{fileName}</span>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-1 px-3 py-0.5 text-[10px] font-semibold text-text-semantic-muted uppercase tracking-wider bg-surface-inset">
      <span>{label}</span>
      <span className="text-text-semantic-faint">({count})</span>
    </div>
  );
}

function NodeSection({ label, nodes, relation }: { label: string; nodes: RawGraphNode[]; relation: string }): React.ReactElement | null {
  if (nodes.length === 0) return null;
  return (
    <>
      <SectionHeader label={label} count={nodes.length} />
      {nodes.map((node) => <NodeRow key={node.id} node={node} relation={relation} />)}
    </>
  );
}

function NeighbourhoodBody({ data }: { data: GraphNeighbourhoodResult }): React.ReactElement {
  const callers = data.callers ?? [];
  const callees = data.callees ?? [];
  const imports = data.imports ?? [];
  const empty = callers.length === 0 && callees.length === 0 && imports.length === 0;
  return (
    <div className="max-h-80 overflow-y-auto py-1">
      <NodeSection label="Callers" nodes={callers} relation="calls" />
      <NodeSection label="Callees" nodes={callees} relation="calls" />
      <NodeSection label="Imported by" nodes={imports} relation="import" />
      {empty && <div className="px-3 py-4 text-xs text-text-semantic-muted">No neighbours found at this depth.</div>}
    </div>
  );
}

// ── Status content (extracted to reduce complexity) ───────────────────────────

function NeighbourhoodContent({ data, loading }: { data: GraphNeighbourhoodResult | null; loading: boolean }): React.ReactElement | null {
  if (loading) return <div className="px-3 py-4 text-xs text-text-semantic-muted">Loading…</div>;
  if (!data) return null;
  if (!data.success) return <div className="px-3 py-4 text-xs text-status-error">{data.error ?? 'Unknown error'}</div>;
  return <NeighbourhoodBody data={data} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function GraphNeighbourhood({ data, loading, onClose, enabled }: GraphNeighbourhoodProps): React.ReactElement | null {
  if (!enabled) return null;
  return (
    <div
      className="absolute right-3 top-3 z-40 w-72 rounded-lg border border-border-semantic bg-surface-overlay shadow-xl"
      style={{ backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)' }}
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="text-xs font-semibold text-text-semantic-primary">
          {data?.symbol?.name ?? 'Neighbourhood'}
        </span>
        <button className="text-text-semantic-faint hover:text-text-semantic-primary transition-colors" onClick={onClose} aria-label="Close neighbourhood overlay">×</button>
      </div>
      <NeighbourhoodContent data={data} loading={loading} />
    </div>
  );
}
