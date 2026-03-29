/**
 * RightSidebarTabs icon components — extracted to keep RightSidebarTabs.tsx under 300 lines.
 */

import React from 'react';

export function HistoryIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v5h5" />
      <path d="M3.51 10a7 7 0 1 0 .13-7.13L1 4" />
      <polyline points="8 4 8 8 11 10" />
    </svg>
  );
}

export function PlusIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

export function GearIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2" />
    </svg>
  );
}

export function BackArrowIcon(): React.ReactElement<any> {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MonitorIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="10" rx="1.5" />
      <path d="M5 15h6M8 12v3" />
    </svg>
  );
}

export function GitIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="13" />
      <path d="M11 5C11 8 6 8 6 10" />
      <circle cx="6" cy="3" r="1.5" fill="currentColor" />
      <circle cx="6" cy="13" r="1.5" fill="currentColor" />
      <circle cx="11" cy="5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function AnalyticsIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="9" width="3" height="5" rx="0.5" />
      <rect x="6" y="5" width="3" height="9" rx="0.5" />
      <rect x="11" y="2" width="3" height="12" rx="0.5" />
    </svg>
  );
}

export function MemoryIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1a5 5 0 0 1 5 5c0 1.8-1 3.2-2.1 4.3S9 12.5 9 14H7c0-1.5-.4-2.5-1.9-3.7A5 5 0 0 1 8 1z" />
      <path d="M6.5 15h3" />
      <path d="M7 14h2" />
    </svg>
  );
}

export function RulesIcon(): React.ReactElement<any> {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M6 5h4M6 8h4M6 11h2" />
    </svg>
  );
}
