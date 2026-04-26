import React from 'react';

import { panelStyle } from './orchestrationUi';
export { SessionHistoryItem } from './TaskSessionHistorySections.parts';

export function SessionHistoryIntro(): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
        Session history
      </div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Inspect previous orchestration attempts and switch the detail view between saved sessions.
      </div>
    </div>
  );
}

export function SessionHistoryEmptyState(): React.ReactElement {
  return (
    <div
      className="rounded-lg border px-4 py-5 text-[13px]"
      style={{ ...panelStyle(), color: 'var(--text-muted)' }}
    >
      No orchestration sessions have been saved for the active project root yet.
    </div>
  );
}
