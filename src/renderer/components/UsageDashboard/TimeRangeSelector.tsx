/**
 * TimeRangeSelector — dropdown for selecting the dashboard time window.
 */

import React from 'react';

import type { TimeRangeKey } from './useDashboardData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeRangeSelectorProps {
  value: TimeRangeKey;
  onChange: (range: TimeRangeKey) => void;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const OPTIONS: Array<{ key: TimeRangeKey; label: string }> = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TimeRangeKey)}
      className="bg-surface-raised border border-border-subtle rounded px-2 py-1 text-sm text-text-semantic-secondary focus:outline-none focus:border-border-accent"
      aria-label="Time range"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
