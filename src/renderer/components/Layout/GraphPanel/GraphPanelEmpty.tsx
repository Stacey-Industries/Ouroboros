/**
 * GraphPanelEmpty.tsx — placeholder shown while the graph is loading or empty.
 */

import React from 'react';

interface GraphPanelEmptyProps {
  loading?: boolean;
}

export function GraphPanelEmpty({ loading = false }: GraphPanelEmptyProps): React.ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-raised text-text-semantic-muted">
      <span className="text-2xl" aria-hidden="true">⬡</span>
      <span className="text-sm">
        {loading ? 'Loading graph…' : 'Graph not available'}
      </span>
      {!loading && (
        <span className="text-xs text-text-semantic-muted">
          Index the project to explore the codebase graph.
        </span>
      )}
    </div>
  );
}
