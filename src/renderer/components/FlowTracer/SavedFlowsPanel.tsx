/**
 * SavedFlowsPanel.tsx — Display panel for saved FlowTrace summaries.
 *
 * Standalone component; not yet wired into FlowTracerView.tsx.
 * Integration (save/load buttons + this panel inside FlowTracerView) is left
 * for the orchestrator to apply post-merge once Phases 2, 3, and 7 land.
 *
 * Wave 85 Phase 7.
 */

import React, { useEffect } from 'react';

import type { FlowTrace, SavedFlowSummary } from '../../../../shared/types/flowTracer';
import { useFlowPersistence } from './useFlowPersistence';

interface SavedFlowsPanelProps {
  onLoadFlow: (flow: FlowTrace) => void;
}

interface FlowRowProps {
  summary: SavedFlowSummary;
  disabled: boolean;
  onLoad: (id: string) => void;
}

function FlowRow({ summary, disabled, onLoad }: FlowRowProps): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onLoad(summary.id)}
      className="bg-surface-panel hover:bg-surface-hover border-border-subtle flex flex-col rounded border px-3 py-2 text-left transition-colors"
    >
      <span className="text-text-semantic-primary text-sm font-medium">{summary.title}</span>
      <span className="text-text-semantic-muted mt-0.5 text-xs">
        {summary.source === 'shared' ? 'shared · ' : ''}
        {new Date(summary.savedAt).toLocaleDateString()}
      </span>
    </button>
  );
}

export function SavedFlowsPanel({ onLoadFlow }: SavedFlowsPanelProps): React.ReactElement {
  const { savedFlows, status, refreshSavedFlows, loadFlow } = useFlowPersistence();

  useEffect(() => {
    void refreshSavedFlows();
  }, [refreshSavedFlows]);

  async function handleLoad(id: string): Promise<void> {
    const flow = await loadFlow(id);
    if (flow) onLoadFlow(flow);
  }

  if (savedFlows.length === 0) {
    return (
      <div className="text-text-semantic-muted p-4 text-sm">
        No saved flows yet. Save a flow to revisit it later.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="text-text-semantic-secondary mb-1 text-xs font-semibold uppercase tracking-wide">
        Saved flows
      </div>
      {savedFlows.map((s) => (
        <FlowRow key={s.id} summary={s} disabled={status.kind === 'loading'} onLoad={handleLoad} />
      ))}
      {status.kind === 'error' && (
        <div className="text-status-error mt-1 text-xs">{status.message}</div>
      )}
    </div>
  );
}
