import React from 'react';

import { usePinnedContext } from '../../hooks/usePinnedContext';
import { PinnedContextCard } from './PinnedContextCard';

export interface PinnedContextBarProps {
  activeSessionId: string | null;
}

export function PinnedContextBar({
  activeSessionId,
}: PinnedContextBarProps): React.ReactElement | null {
  const { items, dismiss, remove } = usePinnedContext(activeSessionId);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5" data-testid="pinned-context-bar">
      {items.map((item) => (
        <PinnedContextCard
          key={item.id}
          item={item}
          onDismiss={dismiss}
          onRemove={remove}
        />
      ))}
    </div>
  );
}
