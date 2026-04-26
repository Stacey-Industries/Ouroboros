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
import type { StartupHistoryRecord, StartupMark } from '../../types/electron';
import {
  lastPhaseMs,
  phaseLabel,
  relativeMs,
  type RuntimeMetricsSectionProps,
  secondsAgo,
  type StartupTimingsSectionProps,
  totalMs,
} from './SettingsPerformancePanelHelpers';
import {
  cellStyle,
  chevronStyle,
  descStyle,
  hintStyle,
  historyToggleStyle,
  inlineLinkStyle,
  metricLabelStyle,
  metricRowStyle,
  metricsGridStyle,
  metricValueStyle,
  sectionStyle,
  tableStyle,
  thStyle,
  totalRowStyle,
  updatedStyle,
} from './SettingsPerformancePanelStyles';
import { SectionLabel } from './settingsStyles';

// ── Startup Timings ────────────────────────────────────────────────────────

function TimingRow({ mark, relMs }: { mark: StartupMark; relMs: number }): React.ReactElement {
  return (
    <tr>
      <td className="text-text-semantic-primary" style={cellStyle}>
        {phaseLabel(mark.phase)}
      </td>
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
      <td className="text-text-semantic-primary" style={{ ...cellStyle, fontWeight: 600 }}>
        Total
      </td>
      <td
        className="text-text-semantic-secondary"
        style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}
      >
        {ms.toFixed(1)} ms
      </td>
      <td style={cellStyle} />
    </tr>
  );
}

function TimingsTable({
  timings,
  isComplete,
}: {
  timings: StartupMark[];
  isComplete: boolean;
}): React.ReactElement {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle }}>
            Phase
          </th>
          <th
            className="text-text-semantic-muted"
            style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}
          >
            From start
          </th>
          <th
            className="text-text-semantic-muted"
            style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}
          >
            Delta
          </th>
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

function StartupTimingsSection({
  timings,
  isComplete,
  onReload,
}: StartupTimingsSectionProps): React.ReactElement {
  return (
    <section style={sectionStyle}>
      <SectionLabel>Startup Timings</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Time elapsed between app-launch milestones. Collected once per session.
      </p>
      {timings.length === 0 && (
        <p className="text-text-semantic-faint" style={hintStyle}>
          No timing marks collected yet.{' '}
          <button
            type="button"
            className="text-text-semantic-secondary"
            style={inlineLinkStyle}
            onClick={onReload}
          >
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

function MetricRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={metricRowStyle}>
      <span className="text-text-semantic-secondary" style={metricLabelStyle}>
        {label}
      </span>
      <span className="text-text-semantic-primary" style={metricValueStyle}>
        {value}
      </span>
    </div>
  );
}

function RuntimeMetricsSection({
  metrics,
  lastUpdated,
}: RuntimeMetricsSectionProps): React.ReactElement {
  return (
    <section style={sectionStyle}>
      <SectionLabel>Runtime Metrics</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Live memory and CPU snapshot. Refreshed every 5 seconds.
      </p>
      {metrics === null && (
        <p className="text-text-semantic-faint" style={hintStyle}>
          Waiting for first sample…
        </p>
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
      {sign}
      {diff.toFixed(0)} ms
    </td>
  );
}

function HistoryRow({
  rec,
  index,
  records,
}: {
  rec: StartupHistoryRecord;
  index: number;
  records: StartupHistoryRecord[];
}): React.ReactElement {
  const ms = lastPhaseMs(rec);
  const prevMs = index > 0 ? lastPhaseMs(records[index - 1]) : undefined;
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
}

function HistoryTable({ records }: { records: StartupHistoryRecord[] }): React.ReactElement {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th className="text-text-semantic-muted" style={{ ...cellStyle, ...thStyle }}>
            Time
          </th>
          <th
            className="text-text-semantic-muted"
            style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}
          >
            Total ms
          </th>
          <th
            className="text-text-semantic-muted"
            style={{ ...cellStyle, ...thStyle, textAlign: 'right' }}
          >
            vs prev
          </th>
        </tr>
      </thead>
      <tbody>
        {records.map((rec, i) => (
          <HistoryRow key={rec.ts} rec={rec} index={i} records={records} />
        ))}
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
            Total startup duration per launch. Green = faster by &gt;50 ms, red = slower by &gt;50
            ms.
          </p>
          {isLoading && (
            <p className="text-text-semantic-faint" style={hintStyle}>
              Loading…
            </p>
          )}
          {!isLoading && records.length === 0 && (
            <p className="text-text-semantic-faint" style={hintStyle}>
              No history yet.
            </p>
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
