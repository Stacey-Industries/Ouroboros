/**
 * SettingsPerformancePanel.tsx — Performance diagnostics settings section.
 *
 * Two sections:
 *   1. Startup timings — phase table with deltas; polls until all 5 marks present.
 *   2. Runtime metrics — live heap/CPU snapshot, refreshed every 5 s.
 */

import React, { useState } from 'react';

import { useRuntimeMetrics } from '../../hooks/useRuntimeMetrics';
import { useStartupHistory } from '../../hooks/useStartupHistory';
import { useStartupTimings } from '../../hooks/useStartupTimings';
import type { RuntimeMetrics, StartupHistoryRecord, StartupMark } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

// ── Startup Timings ────────────────────────────────────────────────────────

function phaseLabel(phase: StartupMark['phase']): string {
  const labels: Record<StartupMark['phase'], string> = {
    'app-ready':              'App ready',
    'window-ready':           'Window ready',
    'ipc-ready':              'IPC ready',
    'services-ready':         'Services ready',
    'renderer-bundle-loaded': 'Renderer bundle loaded',
    'react-root-created':     'React root created',
    'first-render':           'First render',
  };
  return labels[phase] ?? phase;
}

function relativeMs(timings: StartupMark[], index: number): number {
  if (timings.length === 0 || index >= timings.length) return 0;
  const first = BigInt(timings[0].tsNs);
  const current = BigInt(timings[index].tsNs);
  return Number(current - first) / 1e6;
}

function totalMs(timings: StartupMark[]): number {
  if (timings.length < 2) return 0;
  const first = BigInt(timings[0].tsNs);
  const last = BigInt(timings[timings.length - 1].tsNs);
  return Number(last - first) / 1e6;
}

function TimingRow({ mark, relMs }: { mark: StartupMark; relMs: number }): React.ReactElement {
  return (
    <tr>
      <td className="text-text-semantic-primary" style={cellStyle}>{phaseLabel(mark.phase)}</td>
      <td className="text-text-semantic-secondary" style={{ ...cellStyle, textAlign: 'right' }}>
        {relMs.toFixed(1)} ms
      </td>
      <td className="text-text-semantic-muted" style={{ ...cellStyle, textAlign: 'right' }}>
        +{mark.deltaMs.toFixed(1)} ms
      </td>
    </tr>
  );
}

function TotalRow({ ms }: { ms: number }): React.ReactElement {
  return (
    <tr style={totalRowStyle}>
      <td className="text-text-semantic-primary" style={{ ...cellStyle, fontWeight: 600 }}>Total</td>
      <td className="text-text-semantic-secondary" style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>
        {ms.toFixed(1)} ms
      </td>
      <td style={cellStyle} />
    </tr>
  );
}

interface StartupTimingsSectionProps {
  timings: StartupMark[];
  isComplete: boolean;
  onReload: () => void;
}

function TimingsTable({ timings, isComplete }: { timings: StartupMark[]; isComplete: boolean }): React.ReactElement {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle }}>Phase</th>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}>From start</th>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}>Delta</th>
        </tr>
      </thead>
      <tbody>
        {timings.map((mark, i) => (
          <TimingRow key={mark.phase} mark={mark} relMs={relativeMs(timings, i)} />
        ))}
        {isComplete && <TotalRow ms={totalMs(timings)} />}
      </tbody>
    </table>
  );
}

function StartupTimingsSection({ timings, isComplete, onReload }: StartupTimingsSectionProps): React.ReactElement {
  return (
    <section style={sectionStyle}>
      <SectionLabel>Startup Timings</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Time elapsed between app-launch milestones. Collected once per session.
      </p>
      {timings.length === 0 && (
        <p className="text-text-semantic-faint" style={hintStyle}>
          No timing marks collected yet.{' '}
          <button type="button" className="text-text-semantic-secondary" style={inlineLinkStyle} onClick={onReload}>
            Refresh
          </button>
        </p>
      )}
      {timings.length > 0 && timings.length < 7 && (
        <p className="text-text-semantic-faint" style={hintStyle}>
          Collecting… ({timings.length}/7 marks)
        </p>
      )}
      {timings.length > 0 && <TimingsTable timings={timings} isComplete={isComplete} />}
    </section>
  );
}

// ── Runtime Metrics ────────────────────────────────────────────────────────

function secondsAgo(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / 1000);
}

function MetricRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={metricRowStyle}>
      <span className="text-text-semantic-secondary" style={metricLabelStyle}>{label}</span>
      <span className="text-text-semantic-primary" style={metricValueStyle}>{value}</span>
    </div>
  );
}

interface RuntimeMetricsSectionProps {
  metrics: RuntimeMetrics | null;
  lastUpdated: Date | null;
}

function RuntimeMetricsSection({ metrics, lastUpdated }: RuntimeMetricsSectionProps): React.ReactElement {
  return (
    <section style={sectionStyle}>
      <SectionLabel>Runtime Metrics</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Live memory and CPU snapshot. Refreshed every 5 seconds.
      </p>
      {metrics === null && (
        <p className="text-text-semantic-faint" style={hintStyle}>Waiting for first sample…</p>
      )}
      {metrics !== null && (
        <div style={metricsGridStyle}>
          <MetricRow label="Heap used" value={`${metrics.heapUsedMb.toFixed(1)} MB`} />
          <MetricRow label="Heap total" value={`${metrics.heapTotalMb.toFixed(1)} MB`} />
          <MetricRow label="External" value={`${metrics.externalMb.toFixed(1)} MB`} />
          {metrics.cpuPercent !== undefined && (
            <MetricRow label="CPU" value={`${metrics.cpuPercent.toFixed(1)}%`} />
          )}
        </div>
      )}
      {lastUpdated !== null && (
        <p className="text-text-semantic-faint" style={updatedStyle}>
          Updated {secondsAgo(lastUpdated)}s ago
        </p>
      )}
    </section>
  );
}

// ── Startup History ────────────────────────────────────────────────────────

function lastPhaseMs(record: StartupHistoryRecord): number {
  if (record.timings.length === 0) return 0;
  return record.timings[record.timings.length - 1].deltaMs;
}

function DeltaCell({ curr, prev }: { curr: number; prev: number | undefined }): React.ReactElement {
  if (prev === undefined) return <td style={cellStyle} />;
  const diff = curr - prev;
  const isFaster = diff < -50;
  const isSlower = diff > 50;
  const cls = isFaster
    ? 'text-status-success'
    : isSlower
      ? 'text-status-error'
      : 'text-text-semantic-muted';
  const sign = diff > 0 ? '+' : '';
  return (
    <td className={cls} style={{ ...cellStyle, textAlign: 'right' }}>
      {sign}{diff.toFixed(0)} ms
    </td>
  );
}

function HistoryTable({ records }: { records: StartupHistoryRecord[] }): React.ReactElement {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle }}>Time</th>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}>Total ms</th>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}>vs prev</th>
        </tr>
      </thead>
      <tbody>
        {records.map((rec, i) => {
          const ms = lastPhaseMs(rec);
          const prevMs = i > 0 ? lastPhaseMs(records[i - 1]) : undefined;
          return (
            <tr key={rec.ts}>
              <td className="text-text-semantic-primary" style={cellStyle}>
                {new Date(rec.ts).toLocaleString()}
              </td>
              <td className="text-text-semantic-secondary" style={{ ...cellStyle, textAlign: 'right' }}>
                {ms.toFixed(0)} ms
              </td>
              <DeltaCell curr={ms} prev={prevMs} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StartupHistorySection(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { records, isLoading, reload } = useStartupHistory(20);

  function toggleOpen(): void {
    if (!open) reload();
    setOpen((v) => !v);
  }

  return (
    <section style={sectionStyle}>
      <button
        type="button"
        onClick={toggleOpen}
        className="text-text-semantic-primary"
        style={historyToggleStyle}
      >
        <SectionLabel>Startup history (last 20 launches)</SectionLabel>
        <span style={chevronStyle}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <p className="text-text-semantic-muted" style={descStyle}>
            Total startup duration per launch. Green = faster by &gt;50 ms, red = slower by &gt;50 ms.
          </p>
          {isLoading && (
            <p className="text-text-semantic-faint" style={hintStyle}>Loading…</p>
          )}
          {!isLoading && records.length === 0 && (
            <p className="text-text-semantic-faint" style={hintStyle}>No history yet.</p>
          )}
          {!isLoading && records.length > 0 && <HistoryTable records={records} />}
        </>
      )}
    </section>
  );
}

// ── Root panel ─────────────────────────────────────────────────────────────

export function SettingsPerformancePanel(): React.ReactElement {
  const { timings, isComplete, reload } = useStartupTimings();
  const { metrics, lastUpdated } = useRuntimeMetrics();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <StartupTimingsSection timings={timings} isComplete={isComplete} onReload={reload} />
      <RuntimeMetricsSection metrics={metrics} lastUpdated={lastUpdated} />
      <StartupHistorySection />
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const descStyle: React.CSSProperties = { fontSize: '12px', lineHeight: 1.5, margin: '0 0 8px' };
const hintStyle: React.CSSProperties = { fontSize: '12px', margin: 0 };
const inlineLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: '12px', textDecoration: 'underline',
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: '12px',
};
const cellStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid var(--border-subtle)',
};
const thStyle: React.CSSProperties = {
  fontWeight: 600, fontSize: '11px', textAlign: 'left',
};
const totalRowStyle: React.CSSProperties = {
  borderTop: '2px solid var(--border-default)',
};
const metricsGridStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '6px',
};
const metricRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  fontSize: '12px',
};
const metricLabelStyle: React.CSSProperties = { fontSize: '12px' };
const metricValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '12px', fontVariantNumeric: 'tabular-nums',
};
const updatedStyle: React.CSSProperties = { fontSize: '11px', margin: '4px 0 0' };
const historyToggleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', background: 'none', border: 'none', padding: 0,
  cursor: 'pointer', textAlign: 'left',
};
const chevronStyle: React.CSSProperties = { fontSize: '10px', marginLeft: '8px' };
