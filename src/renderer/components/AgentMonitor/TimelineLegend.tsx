/**
 * TimelineLegend.tsx — Color legend for the timeline view.
 */

import React, { memo } from 'react';

import { LEGEND_ITEMS } from './timelineHelpers';

export const Legend = memo(function Legend(): React.ReactElement {
  return (
    <div
      className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-1.5"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      {LEGEND_ITEMS.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1">
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '1px',
              background: color,
              opacity: 0.8,
            }}
          />
          <span className="text-text-semantic-faint" style={{ fontSize: '9px' }}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
});
