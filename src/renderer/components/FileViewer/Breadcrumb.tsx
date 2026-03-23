import React, { useCallback, useMemo, useState } from 'react';

import { FileTypeIcon } from './Breadcrumb.icons';

export interface BreadcrumbProps {
  filePath: string | null;
  projectRoot: string | null;
  /** Called when a segment is clicked - receives the dir path up to that segment */
  onNavigateToDir?: (dirPath: string) => void;
}

interface BreadcrumbData {
  segments: string[];
  absoluteSegments: string[];
}

/** Maximum number of visible segments before truncation kicks in. */
const MAX_VISIBLE_SEGMENTS = 5;

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  height: '100%',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 8px',
  height: '100%',
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const segmentsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  overflow: 'hidden',
  flex: 1,
  minWidth: 0,
};

const directoryButtonStyle: React.CSSProperties = {
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

const currentSegmentStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
};

const chevronWrapperStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
};

const ellipsisStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '0 1px',
  fontSize: 'inherit',
  letterSpacing: '1px',
};

const copyButtonStyle: React.CSSProperties = {
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
function splitPath(filePath: string): string[] {
  return normalizePath(filePath).split('/').filter(Boolean);
}
function buildBreadcrumbData(filePath: string, projectRoot: string | null): BreadcrumbData {
  const normalizedPath = normalizePath(filePath);
  const normalizedRoot = projectRoot ? normalizePath(projectRoot) : null;
  const displayPath =
    normalizedRoot && normalizedPath.startsWith(normalizedRoot)
      ? normalizedPath.slice(normalizedRoot.length).replace(/^\//, '')
      : normalizedPath;
  return { segments: splitPath(displayPath), absoluteSegments: splitPath(normalizedPath) };
}
function buildDirPath(data: BreadcrumbData, segmentIndex: number): string {
  const absoluteIndex = data.absoluteSegments.length - data.segments.length + segmentIndex;
  return `/${data.absoluteSegments.slice(0, absoluteIndex + 1).join('/')}`;
}
function truncateSegments(data: BreadcrumbData): {
  visibleSegments: string[];
  startOffset: number;
  isTruncated: boolean;
} {
  const total = data.segments.length;
  if (total <= MAX_VISIBLE_SEGMENTS)
    return { visibleSegments: data.segments, startOffset: 0, isTruncated: false };
  const startOffset = total - MAX_VISIBLE_SEGMENTS;
  return { visibleSegments: data.segments.slice(startOffset), startOffset, isTruncated: true };
}
function CopyIcon(): React.ReactElement {
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
function ChevronIcon(): React.ReactElement {
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
function useCopyFeedback(filePath: string | null): {
  copied: boolean;
  handleCopy: () => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!filePath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizePath(filePath));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may not be available in all contexts.
    }
  }, [filePath]);

  return { copied, handleCopy };
}

function setDirectoryButtonHoverState(target: HTMLButtonElement, hovering: boolean): void {
  target.style.color = hovering ? 'var(--text-primary)' : 'var(--text-muted)';
  target.style.textDecoration = hovering ? 'underline' : 'none';
}

function DirectorySegmentButton(props: {
  segment: string;
  dirPath: string;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { segment, dirPath, onNavigateToDir } = props;
  return (
    <button
      onClick={() => onNavigateToDir?.(dirPath)}
      title={`Reveal ${dirPath}`}
      className="text-text-semantic-muted"
      style={directoryButtonStyle}
      onMouseEnter={(e) => {
        setDirectoryButtonHoverState(e.currentTarget, true);
      }}
      onMouseLeave={(e) => {
        setDirectoryButtonHoverState(e.currentTarget, false);
      }}
    >
      {segment}
    </button>
  );
}

function CurrentSegmentLabel({ segment }: { segment: string }): React.ReactElement {
  return (
    <span className="text-text-semantic-primary" style={currentSegmentStyle}>
      <FileTypeIcon filename={segment} />
      {segment}
    </span>
  );
}

function ChevronSeparator(): React.ReactElement {
  return (
    <span className="text-text-semantic-faint" style={chevronWrapperStyle}>
      <ChevronIcon />
    </span>
  );
}

function EllipsisBadge(): React.ReactElement {
  return (
    <span className="text-text-semantic-faint" style={ellipsisStyle} title="Path truncated">
      ...
    </span>
  );
}

function BreadcrumbSegmentItem(props: {
  segment: string;
  /** The segment's index in the *original* (un-truncated) segments array. */
  originalIndex: number;
  totalSegments: number;
  data: BreadcrumbData;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { segment, originalIndex, totalSegments, data, onNavigateToDir } = props;
  const isLast = originalIndex === totalSegments - 1;

  return (
    <React.Fragment>
      {isLast ? (
        <CurrentSegmentLabel segment={segment} />
      ) : (
        <>
          <DirectorySegmentButton
            segment={segment}
            dirPath={buildDirPath(data, originalIndex)}
            onNavigateToDir={onNavigateToDir}
          />
          <ChevronSeparator />
        </>
      )}
    </React.Fragment>
  );
}

function BreadcrumbSegments(props: {
  data: BreadcrumbData;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { data, onNavigateToDir } = props;
  const { visibleSegments, startOffset, isTruncated } = useMemo(
    () => truncateSegments(data),
    [data],
  );

  return (
    <div style={segmentsStyle}>
      {isTruncated && (
        <>
          <EllipsisBadge />
          <ChevronSeparator />
        </>
      )}
      {visibleSegments.map((segment, visibleIndex) => {
        const originalIndex = startOffset + visibleIndex;
        return (
          <BreadcrumbSegmentItem
            key={`${segment}-${originalIndex}`}
            segment={segment}
            originalIndex={originalIndex}
            totalSegments={data.segments.length}
            data={data}
            onNavigateToDir={onNavigateToDir}
          />
        );
      })}
    </div>
  );
}

function setCopyButtonHoverState(
  target: HTMLButtonElement,
  copied: boolean,
  hovering: boolean,
): void {
  if (!copied) target.style.color = hovering ? 'var(--text-primary)' : 'var(--text-faint)';
}

function CopyPathButton(props: {
  copied: boolean;
  onCopy: () => Promise<void>;
}): React.ReactElement {
  const { copied, onCopy } = props;
  return (
    <button
      onClick={() => {
        void onCopy();
      }}
      title={copied ? 'Copied!' : 'Copy full path'}
      aria-label="Copy full file path"
      style={{ ...copyButtonStyle, color: copied ? 'var(--status-success)' : 'var(--text-faint)' }}
      onMouseEnter={(e) => {
        setCopyButtonHoverState(e.currentTarget, copied, true);
      }}
      onMouseLeave={(e) => {
        setCopyButtonHoverState(e.currentTarget, copied, false);
      }}
    >
      <CopyIcon />
    </button>
  );
}

function EmptyBreadcrumb(): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={emptyStateStyle}>
      No file open
    </div>
  );
}

function BreadcrumbLayout(props: {
  data: BreadcrumbData;
  copied: boolean;
  onCopy: () => Promise<void>;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { data, copied, onCopy, onNavigateToDir } = props;
  return (
    <div className="text-text-semantic-muted" style={containerStyle}>
      <BreadcrumbSegments data={data} onNavigateToDir={onNavigateToDir} />
      <CopyPathButton copied={copied} onCopy={onCopy} />
    </div>
  );
}

export function Breadcrumb({
  filePath,
  projectRoot,
  onNavigateToDir,
}: BreadcrumbProps): React.ReactElement {
  const { copied, handleCopy } = useCopyFeedback(filePath);
  if (!filePath) return <EmptyBreadcrumb />;
  return (
    <BreadcrumbLayout
      data={buildBreadcrumbData(filePath, projectRoot)}
      copied={copied}
      onCopy={handleCopy}
      onNavigateToDir={onNavigateToDir}
    />
  );
}
