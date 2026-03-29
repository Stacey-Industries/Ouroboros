import React from 'react';

import { FileTypeIcon } from './Breadcrumb.icons';

export const directoryButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '1px 3px',
  fontSize: 'inherit',
  fontFamily: 'inherit',
  borderRadius: '3px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'color 100ms ease',
};

export const currentSegmentStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
};

export const copyButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px',
  background: 'none',
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'color 100ms ease',
};

export function CopyIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2 8.5H1.5C1.224 8.5 1 8.276 1 8V1.5C1 1.224 1.224 1 1.5 1H8C8.276 1 8.5 1.224 8.5 1.5V2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronIcon(): React.ReactElement<any> {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2.5 1.5L5 4L2.5 6.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronSeparator(): React.ReactElement<any> {
  return (
    <span
      className="text-text-semantic-faint"
      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
    >
      <ChevronIcon />
    </span>
  );
}

export function EllipsisBadge(): React.ReactElement<any> {
  return (
    <span
      className="text-text-semantic-faint"
      style={{ flexShrink: 0, padding: '0 1px', fontSize: 'inherit', letterSpacing: '1px' }}
      title="Path truncated"
    >
      ...
    </span>
  );
}

function setDirectoryButtonHoverState(target: HTMLButtonElement, hovering: boolean): void {
  target.style.color = hovering ? 'var(--text-primary)' : 'var(--text-muted)';
  target.style.textDecoration = hovering ? 'underline' : 'none';
}

export function DirectorySegmentButton(props: {
  segment: string;
  dirPath: string;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement<any> {
  const { segment, dirPath, onNavigateToDir } = props;
  return (
    <button
      onClick={() => onNavigateToDir?.(dirPath)}
      title={`Reveal ${dirPath}`}
      className="text-text-semantic-muted"
      style={directoryButtonStyle}
      onMouseEnter={(e) => setDirectoryButtonHoverState(e.currentTarget, true)}
      onMouseLeave={(e) => setDirectoryButtonHoverState(e.currentTarget, false)}
    >
      {segment}
    </button>
  );
}

export function CurrentSegmentLabel({ segment }: { segment: string }): React.ReactElement<any> {
  return (
    <span className="text-text-semantic-primary" style={currentSegmentStyle}>
      <FileTypeIcon filename={segment} />
      {segment}
    </span>
  );
}

function setCopyButtonHoverState(
  target: HTMLButtonElement,
  copied: boolean,
  hovering: boolean,
): void {
  if (!copied) target.style.color = hovering ? 'var(--text-primary)' : 'var(--text-faint)';
}

export function CopyPathButton(props: {
  copied: boolean;
  onCopy: () => Promise<void>;
}): React.ReactElement<any> {
  const { copied, onCopy } = props;
  return (
    <button
      onClick={() => {
        void onCopy();
      }}
      title={copied ? 'Copied!' : 'Copy full path'}
      aria-label="Copy full file path"
      style={{ ...copyButtonStyle, color: copied ? 'var(--status-success)' : 'var(--text-faint)' }}
      onMouseEnter={(e) => setCopyButtonHoverState(e.currentTarget, copied, true)}
      onMouseLeave={(e) => setCopyButtonHoverState(e.currentTarget, copied, false)}
    >
      <CopyIcon />
    </button>
  );
}
