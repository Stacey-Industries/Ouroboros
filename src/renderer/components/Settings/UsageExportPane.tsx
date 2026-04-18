/**
 * UsageExportPane.tsx — Wave 37 Phase C
 *
 * Settings pane for exporting cost-history as JSONL.
 * Composes: window picker, output path input, export button, status row,
 * and a "last export" readout from ecosystem:lastExportInfo.
 *
 * Business logic extracted to useUsageExport() to keep the root component
 * under the 40-line ESLint limit. No hardcoded colours — design tokens only.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { LastExportInfo } from '../../types/electron-ecosystem';
import { SectionLabel } from './settingsStyles';

// ─── Types ───────────────────────────────────────────────────────────────────

type WindowOption = '24h' | '7d' | '30d' | 'all';
interface ExportStatus { kind: 'idle' | 'busy' | 'ok' | 'err'; message?: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const WINDOW_OPTIONS: Array<{ id: WindowOption; label: string }> = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d',  label: 'Last 7d'  },
  { id: '30d', label: 'Last 30d' },
  { id: 'all', label: 'All'      },
];

function windowBounds(opt: WindowOption): { windowStart: number; windowEnd: number } {
  const now = Date.now();
  const starts: Record<WindowOption, number> = {
    '24h': now - MS_PER_DAY, '7d': now - 7 * MS_PER_DAY,
    '30d': now - 30 * MS_PER_DAY, 'all': 0,
  };
  return { windowStart: starts[opt], windowEnd: now };
}

function defaultOutputPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `usage-export-${ts}.jsonl`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

function useUsageExport() {
  const [windowOpt, setWindowOpt] = useState<WindowOption>('24h');
  const [outputPath, setOutputPath] = useState(defaultOutputPath);
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' });
  const [lastExport, setLastExport] = useState<LastExportInfo | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    window.electronAPI.ecosystem.lastExportInfo()
      .then((res) => { if (mountedRef.current && res.success) setLastExport(res.info ?? null); })
      .catch(() => undefined);
    return () => { mountedRef.current = false; };
  }, []);

  const handleExport = useCallback(async () => {
    setStatus({ kind: 'busy' });
    const resolvedPath = outputPath.trim() || defaultOutputPath();
    try {
      const res = await window.electronAPI.ecosystem.exportUsage(
        { ...windowBounds(windowOpt), outputPath: resolvedPath },
      );
      if (!mountedRef.current) return;
      if (res.success) {
        setStatus({ kind: 'ok', message: `${res.rowsWritten} rows written to ${res.path}` });
        setLastExport({ path: res.path, at: Date.now(), rows: res.rowsWritten });
      } else {
        setStatus({ kind: 'err', message: res.error });
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setStatus({ kind: 'err', message: err instanceof Error ? err.message : String(err) });
    }
  }, [windowOpt, outputPath]);

  return { windowOpt, setWindowOpt, outputPath, setOutputPath, status, lastExport, handleExport };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WindowPicker(
  { value, onChange }: { value: WindowOption; onChange: (v: WindowOption) => void },
): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {WINDOW_OPTIONS.map((opt) => (
        <label key={opt.id} aria-label={opt.label}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input checked={value === opt.id} name="usage-window" onChange={() => onChange(opt.id)}
            type="radio" value={opt.id} />
          <span className="text-text-semantic-primary">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function ExportStatusRow({ status }: { status: ExportStatus }): React.ReactElement | null {
  if (status.kind === 'idle') return null;
  if (status.kind === 'busy') {
    return <p className="text-text-semantic-muted" style={{ fontSize: 12, marginTop: 8 }}>Exporting…</p>;
  }
  const cls = status.kind === 'ok' ? 'text-status-success' : 'text-status-error';
  return <p className={cls} style={{ fontSize: 12, marginTop: 8 }}>{status.message}</p>;
}

function LastExportReadout({ info }: { info: LastExportInfo | null }): React.ReactElement | null {
  if (!info) return null;
  const date = new Date(info.at).toLocaleString();
  return (
    <p className="text-text-semantic-muted" style={{ fontSize: 12, marginTop: 8 }}>
      Last export: <span className="text-text-semantic-primary">{info.path}</span>
      {' '}— {date}, {info.rows} rows
    </p>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export function UsageExportPane(): React.ReactElement {
  const { windowOpt, setWindowOpt, outputPath, setOutputPath, status, lastExport, handleExport } =
    useUsageExport();

  return (
    <div style={{ padding: '16px 0', maxWidth: 540 }}>
      <SectionLabel>Export Usage Data</SectionLabel>
      <p className="text-text-semantic-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Exports cost history as newline-delimited JSON (JSONL). One session per line.
      </p>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Time window</SectionLabel>
        <WindowPicker onChange={setWindowOpt} value={windowOpt} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <SectionLabel>Output file path</SectionLabel>
        <input className="text-text-semantic-primary" onChange={(e) => setOutputPath(e.target.value)}
          placeholder="Absolute path or filename" style={inputStyle} type="text" value={outputPath} />
        <p className="text-text-semantic-muted" style={{ fontSize: 11, marginTop: 4 }}>
          Must be an absolute path. Parent directory must exist.
        </p>
      </div>
      <button className="text-text-semantic-primary" disabled={status.kind === 'busy'}
        onClick={handleExport} style={exportButtonStyle} type="button">
        {status.kind === 'busy' ? 'Exporting…' : 'Export now'}
      </button>
      <ExportStatusRow status={status} />
      <LastExportReadout info={lastExport} />
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', background: 'var(--surface-inset)',
  border: '1px solid var(--border-semantic)', borderRadius: 4,
  color: 'var(--text-semantic-primary)', fontSize: 13, boxSizing: 'border-box',
};

const exportButtonStyle: React.CSSProperties = {
  padding: '7px 16px', background: 'var(--interactive-accent)',
  border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer',
};
