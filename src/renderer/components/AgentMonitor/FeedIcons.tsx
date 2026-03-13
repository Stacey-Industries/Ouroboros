/**
 * FeedIcons.tsx — Icon components for ToolCallFeed rows.
 */

import React, { memo } from 'react';

export const SpinnerIcon = memo(function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="6" cy="6" r="4.5" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="14 8" strokeLinecap="round" />
    </svg>
  );
});

export const SuccessIcon = memo(function SuccessIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

export const ErrorIcon = memo(function ErrorIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 3L9 9M9 3L3 9" stroke="var(--error)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
});

export const RowChevron = memo(function RowChevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease', flexShrink: 0 }}
    >
      <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});
