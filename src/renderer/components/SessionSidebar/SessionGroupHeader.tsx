/**
 * SessionGroupHeader — group heading rendered above a set of session rows
 * that share the same project root directory (Wave 20 Phase A).
 */

import React from 'react';

export interface SessionGroupHeaderProps {
  /** Basename of the project root directory. */
  projectName: string;
  /** Number of sessions in this group. */
  count: number;
}

export function SessionGroupHeader({
  projectName,
  count,
}: SessionGroupHeaderProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 select-none"
      role="rowgroup"
      aria-label={`Project: ${projectName}`}
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider text-text-semantic-muted truncate flex-1"
        title={projectName}
      >
        {projectName}
      </span>
      <span
        className="text-xs text-text-semantic-faint tabular-nums"
        aria-label={`${count} session${count === 1 ? '' : 's'}`}
      >
        {count}
      </span>
    </div>
  );
}
