/**
 * PerformanceOverlay.tsx — Fixed bottom-left overlay showing live perf metrics.
 *
 * Toggled via Ctrl+Shift+P keyboard shortcut (handled in App.tsx).
 * Shows: heap memory, frame time, IPC latency.
 */

import React from 'react';

import { usePerformance } from '../../hooks/usePerformance';

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface PerformanceOverlayProps {
  visible: boolean;
}

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '36px',
  left: '8px',
  zIndex: 9000,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  padding: '8px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.8)',
  lineHeight: '1.6',
  minWidth: '160px',
  pointerEvents: 'none',
  userSelect: 'none',
};

const OVERLAY_TITLE_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: '4px',
};

function PerformanceMetrics({
  snap,
}: {
  snap: ReturnType<typeof usePerformance>;
}): React.ReactElement<any> {
  const fps = snap.frameTimeMs > 0 ? Math.round(1000 / snap.frameTimeMs) : 0;

  return (
    <>
      <MetricRow label="Heap" value={`${fmtMB(snap.heapUsed)} / ${fmtMB(snap.heapTotal)}`} />
      <MetricRow label="RSS" value={fmtMB(snap.rss)} />
      <MetricRow
        label="Frame"
        value={snap.frameTimeMs > 0 ? `${snap.frameTimeMs} ms (${fps} fps)` : '—'}
        warn={snap.frameTimeMs > 20}
      />
      <MetricRow
        label="IPC"
        value={snap.ipcLatencyMs !== null ? `${snap.ipcLatencyMs} ms` : '—'}
        warn={snap.ipcLatencyMs !== null && snap.ipcLatencyMs > 20}
      />
    </>
  );
}

export function PerformanceOverlay({ visible }: PerformanceOverlayProps): React.ReactElement<any> | null {
  const snap = usePerformance(visible);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Performance metrics"
      style={OVERLAY_STYLE}
    >
      <div style={OVERLAY_TITLE_STYLE}>Performance</div>
      <PerformanceMetrics snap={snap} />
    </div>
  );
}

function MetricRow({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ color: warn ? '#f97583' : 'rgba(255,255,255,0.85)' }}>{value}</span>
    </div>
  );
}
