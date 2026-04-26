import type { RuntimeMetrics, StartupHistoryRecord, StartupMark } from '../../types/electron';

export interface StartupTimingsSectionProps {
  timings: StartupMark[];
  isComplete: boolean;
  onReload: () => void;
}

export interface RuntimeMetricsSectionProps {
  metrics: RuntimeMetrics | null;
  lastUpdated: Date | null;
}

export function phaseLabel(phase: StartupMark['phase']): string {
  const labels: Record<StartupMark['phase'], string> = {
    'app-ready': 'App ready',
    'window-ready': 'Window ready',
    'ipc-ready': 'IPC ready',
    'services-ready': 'Services ready',
    'renderer-bundle-loaded': 'Renderer bundle loaded',
    'react-root-created': 'React root created',
    'first-render': 'First render',
  };
  return labels[phase] ?? phase;
}

export function relativeMs(timings: StartupMark[], index: number): number {
  if (timings.length === 0 || index >= timings.length) return 0;
  const first = BigInt(timings[0].tsNs);
  const current = BigInt(timings[index].tsNs);
  return Number(current - first) / 1e6;
}

export function totalMs(timings: StartupMark[]): number {
  if (timings.length < 2) return 0;
  const first = BigInt(timings[0].tsNs);
  const last = BigInt(timings[timings.length - 1].tsNs);
  return Number(last - first) / 1e6;
}

export function secondsAgo(date: Date): number {
  return Math.round((Date.now() - date.getTime()) / 1000);
}

export function lastPhaseMs(record: StartupHistoryRecord): number {
  if (record.timings.length === 0) return 0;
  return record.timings[record.timings.length - 1].deltaMs;
}
