/**
 * MobileAccessDiagnosticsSection.tsx — Timeout stats collapsible section.
 *
 * Wave 33a Phase G. Shows Phase F per-class timeout counters (short/normal/long).
 * Fetches on expand; refresh button re-fetches.
 */

import React, { useCallback, useState } from 'react';

import type { TimeoutStatsResult } from '../../types/electron-mobile-access';
import { SectionLabel } from './settingsStyles';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stats = NonNullable<TimeoutStatsResult['stats']>;

// ── useDiagnosticsStats ───────────────────────────────────────────────────────

function useDiagnosticsStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.mobileAccess.getTimeoutStats();
      if (result.success && result.stats) {
        setStats(result.stats);
      } else {
        setError(result.error ?? 'Failed to fetch stats');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, error, fetchStats };
}

// ── StatRow ───────────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
      <span className="text-text-semantic-muted">{label}</span>
      <span className={value > 0 ? 'text-status-warning' : 'text-text-semantic-primary'} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

// ── DiagnosticsBody ───────────────────────────────────────────────────────────

interface DiagnosticsBodyProps {
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function DiagnosticsBody({ stats, loading, error, onRefresh }: DiagnosticsBodyProps): React.ReactElement {
  return (
    <div style={{ marginTop: '12px' }}>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginBottom: '8px' }}>
        Timeout events per call class since process start (Phase F counters).
      </p>
      {loading && <p className="text-text-semantic-muted" style={{ fontSize: '12px' }}>Loading…</p>}
      {error && <p className="text-status-error" style={{ fontSize: '12px' }}>{error}</p>}
      {stats && !loading && (
        <>
          <StatRow label="Short (10 s)" value={stats.short} />
          <StatRow label="Normal (30 s)" value={stats.normal} />
          <StatRow label="Long (120 s)" value={stats.long} />
        </>
      )}
      <button disabled={loading} onClick={onRefresh} style={refreshBtnStyle(loading)} type="button">
        Refresh
      </button>
    </div>
  );
}

// ── MobileAccessDiagnosticsSection ────────────────────────────────────────────

export function MobileAccessDiagnosticsSection(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { stats, loading, error, fetchStats } = useDiagnosticsStats();

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) void fetchStats();
      return !prev;
    });
  }, [fetchStats]);

  return (
    <section>
      <button aria-expanded={open} aria-labelledby="diag-section-label" onClick={handleToggle} style={disclosureBtnStyle} type="button">
        <span id="diag-section-label"><SectionLabel style={{ marginBottom: 0 }}>Diagnostics</SectionLabel></span>
        <span style={{ fontSize: '10px', marginLeft: '8px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <DiagnosticsBody error={error} loading={loading} stats={stats} onRefresh={() => void fetchStats()} />}
    </section>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const disclosureBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
};

function refreshBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    marginTop: '10px',
    padding: '6px 12px',
    minHeight: '44px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: 'var(--surface-raised)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}
