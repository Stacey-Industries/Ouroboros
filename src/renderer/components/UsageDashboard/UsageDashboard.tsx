/**
 * UsageDashboard — top-level usage dashboard panel.
 *
 * Composes TimeRangeSelector, UsageSummaryCards, and ThreadCostTable
 * into a scrollable panel mounted as a special view in CentrePaneConnected.
 */

import React from 'react';

import { ThreadCostTable } from './ThreadCostTable';
import { TimeRangeSelector } from './TimeRangeSelector';
import { UsageSummaryCards } from './UsageSummaryCards';
import { useDashboardData } from './useDashboardData';

// ─── Loading / error states ───────────────────────────────────────────────────

function LoadingState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-16 text-text-semantic-muted text-sm">
      Loading usage data…
    </div>
  );
}

function ErrorState({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-16 text-status-error text-sm">
      {message}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsageDashboard(): React.ReactElement {
  const { rollup, threads, loading, error, timeRange, setTimeRange } =
    useDashboardData();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <h2 className="text-sm font-semibold text-text-semantic-primary">
          Usage Dashboard
        </h2>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && (
          <>
            <UsageSummaryCards rollup={rollup} />
            <ThreadCostTable threads={threads} />
          </>
        )}
      </div>
    </div>
  );
}
