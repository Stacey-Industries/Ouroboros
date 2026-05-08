/**
 * FlowTracerView.tsx — Walking skeleton view for the Flow Tracer panel.
 *
 * Wave 85 Phase 1: gallery of canonical flows + Canvas2D swimlane on select.
 * Narration carries [stub] markers until Phase 2.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CanonicalFlow,
  FlowEdge,
  FlowStep,
  FlowTrace,
} from '../../../../shared/types/flowTracer';

// ── Data hook ─────────────────────────────────────────────────────────────────

type GalleryState =
  | { status: 'loading' }
  | { status: 'ready'; flows: CanonicalFlow[] }
  | { status: 'error'; message: string };

function useCanonicalFlows(): GalleryState {
  const [state, setState] = useState<GalleryState>({ status: 'loading' });
  useEffect(() => {
    window.electronAPI.flowTracer
      .listFlows()
      .then((flows) => setState({ status: 'ready', flows }))
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
  }, []);
  return state;
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function drawLanes(
  ctx: CanvasRenderingContext2D,
  layers: string[],
  laneH: number,
  w: number,
): void {
  layers.forEach((layer, li) => {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; // hardcoded: canvas2d — CSS tokens unavailable in bitmap context
    ctx.fillRect(0, li * laneH, w, laneH);
    ctx.fillStyle = '#888'; // hardcoded: canvas2d — CSS tokens unavailable in bitmap context
    ctx.font = '11px monospace';
    ctx.fillText(layer, 6, li * laneH + 16);
  });
}

interface DrawOpts {
  ctx: CanvasRenderingContext2D;
  steps: FlowStep[];
  layers: string[];
  laneH: number;
  stepW: number;
}

function drawStepNodes({ ctx, steps, layers, laneH, stepW }: DrawOpts): void {
  steps.forEach((step, si) => {
    const li = layers.indexOf(step.layer);
    const cx = (si + 1) * stepW;
    const cy = li * laneH + laneH / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#4f8'; // hardcoded: canvas2d — CSS tokens unavailable in bitmap context
    ctx.fill();
    ctx.fillStyle = '#000'; // hardcoded: canvas2d — CSS tokens unavailable in bitmap context
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(si + 1), cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

function drawEdges({
  ctx,
  steps,
  layers,
  laneH,
  stepW,
  edges,
}: DrawOpts & { edges: FlowEdge[] }): void {
  edges.forEach((edge) => {
    const from = steps.find((s) => s.id === edge.from);
    const to = steps.find((s) => s.id === edge.to);
    if (!from || !to) return;
    const fi = steps.indexOf(from);
    const ti = steps.indexOf(to);
    ctx.beginPath();
    ctx.moveTo((fi + 1) * stepW, layers.indexOf(from.layer) * laneH + laneH / 2);
    ctx.lineTo((ti + 1) * stepW, layers.indexOf(to.layer) * laneH + laneH / 2);
    ctx.strokeStyle = edge.kind === 'boundary' ? '#f59e0b' : 'rgba(255,255,255,0.25)'; // hardcoded: canvas2d — CSS tokens unavailable in bitmap context
    ctx.lineWidth = edge.kind === 'boundary' ? 2 : 1;
    ctx.stroke();
  });
}

function drawSwimlane(canvas: HTMLCanvasElement, trace: FlowTrace): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const layers = [...new Set(trace.steps.map((s) => s.layer))];
  const laneH = Math.floor(height / Math.max(layers.length, 1));
  const stepW = Math.floor(width / Math.max(trace.steps.length + 1, 2));
  drawLanes(ctx, layers, laneH, width);
  drawEdges(ctx, trace.edges, trace.steps, layers, laneH, stepW);
  drawStepNodes(ctx, trace.steps, layers, laneH, stepW);
}

// ── Swimlane canvas component ─────────────────────────────────────────────────

function SwimlaneCanvas({ trace }: { trace: FlowTrace }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawSwimlane(ref.current, trace);
  }, [trace]);
  return (
    <canvas
      ref={ref}
      width={800}
      height={200}
      style={{ width: '100%', height: 200, display: 'block' }}
      aria-label="Flow trace swimlane"
    />
  );
}

// ── Step list ─────────────────────────────────────────────────────────────────

function StepList({ trace }: { trace: FlowTrace }): React.ReactElement {
  return (
    <ol className="mt-2 space-y-1 text-xs font-mono">
      {trace.steps.map((step, i) => (
        <li key={step.id} className="flex gap-2 items-start">
          <span className="text-text-semantic-muted w-5 shrink-0">{i + 1}.</span>
          <span className="text-text-semantic-secondary">[{step.layer}]</span>
          <span className="text-text-semantic-primary truncate">{step.symbol}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Flow tile ─────────────────────────────────────────────────────────────────

function FlowTile({
  flow,
  onSelect,
  loading,
}: {
  flow: CanonicalFlow;
  onSelect: (f: CanonicalFlow) => void;
  loading: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(flow)}
      disabled={loading}
      className="w-full text-left p-3 rounded border border-border-semantic hover:border-border-accent bg-surface-panel hover:bg-surface-raised transition-colors"
    >
      <div className="text-sm font-medium text-text-semantic-primary">{flow.title}</div>
      <div className="mt-1 text-xs text-text-semantic-muted">
        {flow.layers.join(' → ')} · ~{flow.estimatedSteps} steps
      </div>
    </button>
  );
}

// ── Trace result section ──────────────────────────────────────────────────────

type TraceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; trace: FlowTrace }
  | { status: 'error'; message: string };

function TraceResult({ state }: { state: TraceState }): React.ReactElement | null {
  if (state.status === 'loading')
    return <p className="text-xs text-text-semantic-muted">Tracing…</p>;
  if (state.status === 'error')
    return <p className="text-xs text-status-error">Trace error: {state.message}</p>;
  if (state.status === 'ready') {
    return (
      <div className="flex flex-col gap-2 border border-border-semantic rounded p-3">
        <h3 className="text-sm font-medium text-text-semantic-primary">{state.trace.title}</h3>
        <SwimlaneCanvas trace={state.trace} />
        <StepList trace={state.trace} />
      </div>
    );
  }
  return null;
}

// ── Gallery section ───────────────────────────────────────────────────────────

function Gallery({
  state,
  onSelect,
  traceLoading,
}: {
  state: GalleryState;
  onSelect: (f: CanonicalFlow) => void;
  traceLoading: boolean;
}): React.ReactElement | null {
  if (state.status === 'loading')
    return <p className="text-xs text-text-semantic-muted">Loading flows…</p>;
  if (state.status === 'error')
    return <p className="text-xs text-status-error">Error: {state.message}</p>;
  return (
    <div className="flex flex-col gap-2">
      {state.flows.map((flow) => (
        <FlowTile key={flow.title} flow={flow} onSelect={onSelect} loading={traceLoading} />
      ))}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function FlowTracerView(): React.ReactElement {
  const galleryState = useCanonicalFlows();
  const [traceState, setTraceState] = useState<TraceState>({ status: 'idle' });

  const handleSelect = useCallback((flow: CanonicalFlow) => {
    setTraceState({ status: 'loading' });
    window.electronAPI.flowTracer
      .runTrace(flow.entryPoint)
      .then((trace) => setTraceState({ status: 'ready', trace }))
      .catch((err: unknown) =>
        setTraceState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-semantic-primary">Flow Tracer</h2>
        <p className="text-xs text-text-semantic-muted mt-0.5">
          Select a flow to trace its path through the codebase layers.
        </p>
      </div>
      <Gallery
        state={galleryState}
        onSelect={handleSelect}
        traceLoading={traceState.status === 'loading'}
      />
      <TraceResult state={traceState} />
    </div>
  );
}
