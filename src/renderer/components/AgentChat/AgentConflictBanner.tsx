/**
 * AgentConflictBanner.tsx — Inline banner shown at the top of an AgentChat
 * thread when another active session is editing overlapping symbols/files.
 *
 * Props:
 *   report    — the AgentConflictReport to display
 *   onDismiss — callback to suppress the banner for this session pair
 *
 * Severity mapping:
 *   blocking → bg-status-error-subtle   / text-status-error
 *   warning  → bg-status-warning-subtle / text-status-warning
 *   info     → bg-surface-inset         / text-text-semantic-secondary
 */

import type { AgentConflictReport } from '@shared/types/agentConflict';
import React from 'react';

export interface AgentConflictBannerProps {
  report: AgentConflictReport;
  onDismiss: (sessionA: string, sessionB: string) => void;
}

function useSeverityClasses(severity: AgentConflictReport['severity']): {
  container: string;
  icon: string;
  text: string;
} {
  if (severity === 'blocking') {
    return {
      container: 'bg-status-error-subtle border border-status-error',
      icon: 'text-status-error',
      text: 'text-status-error',
    };
  }
  if (severity === 'warning') {
    return {
      container: 'bg-status-warning-subtle border border-status-warning',
      icon: 'text-status-warning',
      text: 'text-status-warning',
    };
  }
  return {
    container: 'bg-surface-inset border border-border-subtle',
    icon: 'text-text-semantic-secondary',
    text: 'text-text-semantic-secondary',
  };
}

function buildDescription(report: AgentConflictReport, otherSession: string): string {
  if (report.overlappingSymbols.length > 0) {
    const sym = report.overlappingSymbols[0];
    const extra = report.overlappingSymbols.length > 1
      ? ` (+${report.overlappingSymbols.length - 1} more)`
      : '';
    return `Session ${otherSession} is editing \`${sym.name}\` in ${sym.file}${extra}`;
  }
  const files = report.overlappingFiles;
  if (files.length === 1) {
    return `Session ${otherSession} is also editing ${files[0]}`;
  }
  return `Session ${otherSession} is editing ${files.length} overlapping file(s)`;
}

export function AgentConflictBanner({
  report,
  onDismiss,
}: AgentConflictBannerProps): React.ReactElement {
  const classes = useSeverityClasses(report.severity);
  const otherSession = report.sessionB;
  const description = buildDescription(report, otherSession);

  function handleDismiss(): void {
    onDismiss(report.sessionA, report.sessionB);
  }

  return (
    <div
      className={`flex items-start gap-2 rounded px-3 py-2 text-sm ${classes.container}`}
      role="alert"
      aria-live="polite"
    >
      <span className={`mt-0.5 shrink-0 ${classes.icon}`} aria-hidden="true">
        ⚠
      </span>
      <span className={`flex-1 ${classes.text}`}>{description}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className={`shrink-0 text-xs underline opacity-70 hover:opacity-100 ${classes.text}`}
        aria-label="Dismiss conflict warning"
      >
        Dismiss
      </button>
    </div>
  );
}
