import React from 'react';
import { EmptyState as SharedEmptyState } from '../shared';

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState(): React.ReactElement {
  return (
    <SharedEmptyState
      icon="document"
      title="Select a file to view"
      description="Choose a file from the tree to view its contents here."
    />
  );
}
