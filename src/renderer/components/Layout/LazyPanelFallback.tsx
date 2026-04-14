/**
 * LazyPanelFallback — minimal Suspense fallback for lazily-loaded panels.
 *
 * Intentionally blank to avoid FOUC. Uses design tokens.
 */

import React from 'react';

export function LazyPanelFallback(): React.ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-panel text-text-semantic-muted">
      <span className="text-xs">Loading…</span>
    </div>
  );
}
