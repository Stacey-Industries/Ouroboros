import React, { useCallback } from 'react';

import { SESSION_SWITCH_EVENT } from '../../../hooks/appEventNames';
import { WorkbenchSessionRow } from './WorkbenchSessionRow';
import {
  type UseWorkbenchSessionsOptions,
  useWorkbenchSessions,
} from './useWorkbenchSessions';

export interface WorkbenchRailProps extends UseWorkbenchSessionsOptions {
  onSelectSession?: (sessionId: string) => void;
  onCreateSession?: () => void;
  title?: string;
}

function EmptyState({ isLoading }: { isLoading: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-sm text-text-semantic-muted">
        {isLoading ? 'Loading sessions…' : 'No sessions yet.'}
      </p>
      {!isLoading && (
        <p className="mt-1 text-xs text-text-semantic-faint">
          Session-first workbench rail scaffolding will appear here when mounted.
        </p>
      )}
    </div>
  );
}

export function WorkbenchRail({
  onSelectSession,
  onCreateSession,
  title = 'Workbench',
  ...options
}: WorkbenchRailProps): React.ReactElement {
  const { items, isLoading } = useWorkbenchSessions(options);

  const handleSelectSession = useCallback((sessionId: string) => {
    if (onSelectSession) {
      onSelectSession(sessionId);
      return;
    }
    window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
  }, [onSelectSession]);

  return (
    <aside
      className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-r border-stroke-default bg-surface-panel/95"
      data-testid="workbench-rail"
    >
      <div className="flex items-center justify-between gap-3 border-b border-stroke-default px-3 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
            {title}
          </div>
          <p className="mt-1 text-xs text-text-semantic-secondary">
            {items.length} session{items.length === 1 ? '' : 's'}
          </p>
        </div>
        {onCreateSession && (
          <button
            type="button"
            className="rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
            onClick={onCreateSession}
          >
            New
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState isLoading={isLoading} />
        ) : (
          items.map((item) => (
            <WorkbenchSessionRow
              key={item.id}
              item={item}
              onSelect={handleSelectSession}
            />
          ))
        )}
      </div>
    </aside>
  );
}
