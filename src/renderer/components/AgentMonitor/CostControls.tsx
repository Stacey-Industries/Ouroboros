/**
 * CostControls.tsx — Date range selector and clear button for CostDashboard.
 */

import React, { memo, useState, useCallback } from 'react';
import type { DateRange } from './costHelpers';

interface ControlsProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  onClearHistory: () => void;
  entryCount: number;
}

const RANGES: { key: DateRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export const Controls = memo(function Controls({
  range,
  onRangeChange,
  onClearHistory,
  entryCount,
}: ControlsProps): React.ReactElement {
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = useCallback(() => {
    if (confirmClear) {
      onClearHistory();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, onClearHistory]);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      <RangeSelector range={range} onRangeChange={onRangeChange} />
      <span className="flex-1" />
      <span className="text-[10px] tabular-nums text-text-semantic-faint" style={{ fontFamily: 'var(--font-mono)' }}>
        {entryCount} entries
      </span>
      {entryCount > 0 && <ClearButton confirmClear={confirmClear} onClick={handleClear} />}
    </div>
  );
});

function RangeSelector({ range, onRangeChange }: { range: DateRange; onRangeChange: (r: DateRange) => void }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onRangeChange(r.key)}
          className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
          style={{
            background: range === r.key ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
            color: range === r.key ? 'var(--accent)' : 'var(--text-faint)',
            border: range === r.key ? '1px solid var(--accent)' : '1px solid transparent',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ClearButton({ confirmClear, onClick }: { confirmClear: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
      style={{
        background: confirmClear ? 'color-mix(in srgb, var(--error) 20%, transparent)' : 'transparent',
        color: confirmClear ? 'var(--error)' : 'var(--text-faint)',
        border: confirmClear ? '1px solid var(--error)' : '1px solid var(--border)',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {confirmClear ? 'Confirm Clear' : 'Clear History'}
    </button>
  );
}
