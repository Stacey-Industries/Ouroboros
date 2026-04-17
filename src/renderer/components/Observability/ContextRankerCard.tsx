/**
 * ContextRankerCard.tsx — Dashboard card for context ranker observability
 * (Wave 31 Phase F).
 *
 * Shows: weight version, last retrain timestamp (relative), held-out AUC,
 * and top-5 feature importance list.
 *
 * Design tokens only — no hex/rgb/rgba values.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ContextRankerDashboard } from '../../types/electron-workspace';

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: ContextRankerDashboard };

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return isoString;
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-semantic-muted">{label}</span>
      <span className="font-mono tabular-nums text-text-semantic-secondary">{value}</span>
    </div>
  );
}

function FeatureBar({ name, weight, maxAbs }: {
  name: string;
  weight: number;
  maxAbs: number;
}): React.ReactElement {
  const pct = maxAbs > 0 ? Math.round((Math.abs(weight) / maxAbs) * 100) : 0;
  const isNeg = weight < 0;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-32 truncate text-right text-[10px] text-text-semantic-muted">
        {name}
      </span>
      <div className="relative h-2 w-24 rounded-full bg-surface-inset">
        <div
          className="absolute left-0 top-0 h-2 rounded-full"
          style={{
            width: `${pct}%`,
            background: isNeg ? 'var(--status-error)' : 'var(--interactive-accent)',
          }}
        />
      </div>
      <span className="w-10 text-right font-mono text-[10px] text-text-semantic-secondary">
        {weight > 0 ? '+' : ''}{weight.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Dashboard content ────────────────────────────────────────────────────────

function RankerBody({ data }: { data: ContextRankerDashboard }): React.ReactElement {
  const maxAbs = Math.max(...data.topFeatures.map((f) => Math.abs(f.weight)), 0.01);

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard title="Weights">
        <InfoRow label="version" value={data.version} />
        <InfoRow label="retrained" value={relativeTime(data.trainedAt)} />
      </MetricCard>

      <MetricCard title="Performance">
        {data.auc !== null ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-text-semantic-primary">
              {data.auc.toFixed(3)}
            </span>
            <span className="text-xs text-text-semantic-muted">AUC</span>
          </div>
        ) : (
          <div className="text-xs italic text-text-semantic-muted">
            No AUC — bundled defaults
          </div>
        )}
      </MetricCard>

      <div className="col-span-2 rounded-lg border border-border-subtle bg-surface-panel p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-semantic-muted">
          Top Features
        </div>
        {data.topFeatures.map((f) => (
          <FeatureBar key={f.name} name={f.name} weight={f.weight} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  );
}

// ─── State-driven content ─────────────────────────────────────────────────────

function RankerContent({ state }: { state: FetchState }): React.ReactElement {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-text-semantic-muted">
        Loading…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-status-error-subtle bg-status-error-subtle p-3">
        <div className="text-xs font-medium text-status-error">
          Failed to load ranker data
        </div>
        <div className="mt-1 font-mono text-[10px] text-text-semantic-muted">
          {state.message}
        </div>
      </div>
    );
  }
  return <RankerBody data={state.data} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContextRankerCard(): React.ReactElement {
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await window.electronAPI.context.getRankerDashboard();
      if (result.success) {
        setState({ status: 'ok', data: result.dashboard });
      } else {
        setState({ status: 'error', message: result.error });
      }
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-semantic-primary">
      <div className="flex items-center justify-between border-b border-border-semantic bg-surface-panel px-3 py-2">
        <span className="text-xs font-medium text-text-semantic-primary">Context Ranker</span>
        <button
          onClick={() => void load()}
          className="rounded px-2 py-0.5 text-xs text-text-semantic-muted hover:bg-surface-raised hover:text-text-semantic-primary"
        >
          Refresh
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <RankerContent state={state} />
      </div>
    </div>
  );
}
