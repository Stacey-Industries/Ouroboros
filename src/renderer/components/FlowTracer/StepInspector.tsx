/**
 * StepInspector.tsx — Hover panel showing What/How (per-symbol cache) + Why
 * (per-flow chain-aware cache) for the currently hovered FlowStep.
 *
 * Wave 85 orchestrator-applied integration of Phase 3's `useStepNarration`
 * and Phase 4's `useFlowWhy`. The hooks are pre-built; this component is the
 * UI binding.
 */

import React from 'react';

import type { FlowTrace, Narration, SymbolRef } from '../../../shared/types/flowTracer';
import { useFlowWhy } from './useFlowWhy';
import { useStepNarration } from './useStepNarration';

interface StepInspectorProps {
  flow: FlowTrace;
  hoveredStep: SymbolRef | null;
  hoveredStepId: string | null;
}

export function StepInspector({
  flow,
  hoveredStep,
  hoveredStepId,
}: StepInspectorProps): React.ReactElement {
  const narration = useStepNarration(hoveredStep);
  const why = useFlowWhy(flow);
  return (
    <aside
      className="border-border-semantic bg-surface-panel space-y-2 rounded border p-3 text-xs"
      aria-label="Step inspector"
    >
      <NarrationBody state={narration} />
      <WhyBody hoveredStepId={hoveredStepId} entries={why.entries} loading={why.loading} />
    </aside>
  );
}

function NarrationBody({
  state,
}: {
  state: ReturnType<typeof useStepNarration>;
}): React.ReactElement {
  if (state.status === 'idle')
    return <p className="text-text-semantic-muted">Hover a step to inspect.</p>;
  if (state.status === 'loading')
    return <p className="text-text-semantic-muted">Loading narration…</p>;
  if (state.status === 'miss')
    return <p className="text-text-semantic-muted">Generating narration…</p>;
  if (state.status === 'error')
    return <p className="text-status-error">Narration error: {state.message}</p>;
  if ('stale' in state.narration)
    return <p className="text-text-semantic-muted">Narration regenerating…</p>;
  return <NarrationFields narration={state.narration} />;
}

function NarrationFields({ narration }: { narration: Narration }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Field label="What" value={narration.what} />
      <Field label="How" value={narration.how} />
    </div>
  );
}

function WhyBody({
  hoveredStepId,
  entries,
  loading,
}: {
  hoveredStepId: string | null;
  entries: Map<string, string>;
  loading: boolean;
}): React.ReactElement | null {
  if (!hoveredStepId) return null;
  const why = entries.get(hoveredStepId);
  if (!why) {
    if (loading) return <p className="text-text-semantic-muted text-xs">Why loading…</p>;
    return null;
  }
  return <Field label="Why" value={why} />;
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span className="text-text-semantic-secondary font-semibold">{label}:</span>{' '}
      <span className="text-text-semantic-primary">{value}</span>
    </div>
  );
}
