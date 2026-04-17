/**
 * ResearchDashboard.tsx — Dev-facing research metrics dashboard (Wave 30 Phase H).
 *
 * Three time-range tabs (7d / 30d / All). Cards: invocations, cache hit rate,
 * latency, outcomes, correlation, corrections. Inline SVG bar charts — no
 * external charting dependency.
 *
 * Design tokens only — no hex/rgb/rgba values.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ResearchDashboardMetrics } from '../../types/electron-research';

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | 'all';

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; metrics: ResearchDashboardMetrics };

// ─── Range tab bar ────────────────────────────────────────────────────────────

const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

interface RangeBarProps {
  active: Range;
  onSelect: (r: Range) => void;
}

function RangeBar({ active, onSelect }: RangeBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 border-b border-border-semantic px-3 py-1.5">
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={`rounded px-2.5 py-0.5 text-xs transition-colors ${
            active === r.id
              ? 'bg-interactive-accent text-text-on-accent'
              : 'text-text-semantic-muted hover:text-text-semantic-primary'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── Inline SVG bar chart ─────────────────────────────────────────────────────

interface BarDatum {
  label: string;
  value: number;
}

const BAR_H = 10;
const BAR_GAP = 4;
const LABEL_W = 80;
const CHART_W = 160;

interface BarRowProps { datum: BarDatum; index: number; maxValue: number }

function BarRow({ datum, index, maxValue }: BarRowProps): React.ReactElement {
  const y = index * (BAR_H + BAR_GAP);
  const barWidth = maxValue > 0 ? Math.round((datum.value / maxValue) * CHART_W) : 0;
  return (
    <g>
      <text
        x={LABEL_W - 4}
        y={y + BAR_H - 1}
        textAnchor="end"
        className="fill-current text-text-semantic-muted"
        style={{ fontSize: 9, fill: 'var(--text-semantic-muted)' }}
      >
        {datum.label}
      </text>
      <rect
        x={LABEL_W}
        y={y}
        width={barWidth}
        height={BAR_H}
        rx={2}
        style={{ fill: 'var(--interactive-accent-subtle)' }}
      />
      <text
        x={LABEL_W + barWidth + 4}
        y={y + BAR_H - 1}
        style={{ fontSize: 9, fill: 'var(--text-semantic-secondary)' }}
      >
        {datum.value}
      </text>
    </g>
  );
}

function BarChart({ data, maxValue }: { data: BarDatum[]; maxValue: number }): React.ReactElement {
  const totalH = data.length * (BAR_H + BAR_GAP);
  return (
    <svg width={LABEL_W + CHART_W + 32} height={Math.max(totalH, 20)} className="mt-1">
      {data.map((d, i) => (
        <BarRow key={d.label} datum={d} index={i} maxValue={maxValue} />
      ))}
    </svg>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-panel p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-semantic-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function BigNumber({ value, label }: { value: string | number; label?: string }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl font-bold tabular-nums text-text-semantic-primary">
        {value}
      </span>
      {label && (
        <span className="text-xs text-text-semantic-muted">{label}</span>
      )}
    </div>
  );
}

function SubStat({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-semantic-muted">{label}</span>
      <span className="tabular-nums text-text-semantic-secondary">{value}</span>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function InvocationsCard({ inv }: { inv: ResearchDashboardMetrics['invocations'] }): React.ReactElement {
  const triggerData: BarDatum[] = [
    { label: 'hook', value: inv.byTrigger.hook },
    { label: 'fact-claim', value: inv.byTrigger['fact-claim'] },
    { label: 'slash', value: inv.byTrigger.slash },
    { label: 'correction', value: inv.byTrigger.correction },
    { label: 'other', value: inv.byTrigger.other },
  ];
  const maxTrigger = Math.max(...triggerData.map((d) => d.value), 1);

  return (
    <MetricCard title="Invocations">
      <BigNumber value={inv.total} label="total" />
      <BarChart data={triggerData} maxValue={maxTrigger} />
    </MetricCard>
  );
}

function CacheCard({ inv }: { inv: ResearchDashboardMetrics['invocations'] }): React.ReactElement {
  const pct = Math.round(inv.cacheHitRate * 100);
  const color = pct >= 50 ? 'var(--status-success)' : 'var(--status-warning)';

  return (
    <MetricCard title="Cache Hit Rate">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {pct}%
        </span>
      </div>
    </MetricCard>
  );
}

function LatencyCard({ inv }: { inv: ResearchDashboardMetrics['invocations'] }): React.ReactElement {
  return (
    <MetricCard title="Latency">
      <BigNumber value={Math.round(inv.avgLatencyMs)} label="ms avg" />
      <SubStat label="p95" value={`${Math.round(inv.p95LatencyMs)} ms`} />
    </MetricCard>
  );
}

function OutcomesCard({ out }: { out: ResearchDashboardMetrics['outcomes'] }): React.ReactElement {
  const pct = Math.round(out.acceptanceRate * 100);
  const barData: BarDatum[] = [
    { label: 'accepted', value: out.accepted },
    { label: 'reverted', value: out.reverted },
    { label: 'unknown', value: out.unknown },
  ];
  const maxOut = Math.max(out.total, 1);

  return (
    <MetricCard title="Outcomes">
      <BigNumber value={out.total} label="total" />
      <div className="mt-1 text-xs text-text-semantic-muted">
        Acceptance: <span className="font-semibold text-text-semantic-primary">{pct}%</span>
      </div>
      <BarChart data={barData} maxValue={maxOut} />
    </MetricCard>
  );
}

function CorrelationCard({ corr }: { corr: ResearchDashboardMetrics['correlated'] }): React.ReactElement {
  const fpPct = Math.round(corr.falsePositiveRate * 100);
  const fpColor = fpPct < 15 ? 'var(--status-success)' : 'var(--status-error)';

  return (
    <MetricCard title="Correlation">
      <BigNumber value={corr.firedCount} label="fired" />
      <SubStat label="outcome-correlated" value={corr.outcomeCorrelatedCount} />
      <SubStat label="false positives" value={corr.falsePositiveCount} />
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-text-semantic-muted">FP rate</span>
        <span className="font-semibold tabular-nums" style={{ color: fpColor }}>
          {fpPct}%
        </span>
      </div>
    </MetricCard>
  );
}

function CorrectionsCard({ corr }: { corr: ResearchDashboardMetrics['corrections'] }): React.ReactElement {
  return (
    <MetricCard title="Corrections">
      <BigNumber value={corr.total} label="captured" />
      <SubStat label="unique libraries" value={corr.enhancedLibrariesCount} />
    </MetricCard>
  );
}

// ─── Body content (state-driven) ─────────────────────────────────────────────

function DashboardBody({ state }: { state: FetchState }): React.ReactElement {
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-text-semantic-muted">
        Loading metrics…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-status-error-subtle bg-status-error-subtle p-3">
        <div className="text-xs font-medium text-status-error">Failed to load metrics</div>
        <div className="mt-1 font-mono text-[10px] text-text-semantic-muted">{state.message}</div>
      </div>
    );
  }
  if (state.metrics.invocations.total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-text-semantic-muted">
        No research invocations recorded for this period.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <InvocationsCard inv={state.metrics.invocations} />
      <CacheCard inv={state.metrics.invocations} />
      <LatencyCard inv={state.metrics.invocations} />
      <OutcomesCard out={state.metrics.outcomes} />
      <CorrelationCard corr={state.metrics.correlated} />
      <CorrectionsCard corr={state.metrics.corrections} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ResearchDashboard(): React.ReactElement {
  const [range, setRange] = useState<Range>('7d');
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  const load = useCallback(async (r: Range) => {
    setState({ status: 'loading' });
    try {
      const result = await window.electronAPI.research.getDashboardMetrics(r);
      if (result.success) {
        setState({ status: 'ok', metrics: result.metrics });
      } else {
        setState({ status: 'error', message: result.error });
      }
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => { void load(range); }, [range, load]);

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-semantic-primary">
      <div className="flex items-center justify-between border-b border-border-semantic bg-surface-panel px-3 py-2">
        <span className="text-xs font-medium text-text-semantic-primary">Research Metrics</span>
        <button
          onClick={() => void load(range)}
          className="rounded px-2 py-0.5 text-xs text-text-semantic-muted hover:bg-surface-raised hover:text-text-semantic-primary"
        >
          Refresh
        </button>
      </div>
      <RangeBar active={range} onSelect={setRange} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DashboardBody state={state} />
      </div>
    </div>
  );
}
