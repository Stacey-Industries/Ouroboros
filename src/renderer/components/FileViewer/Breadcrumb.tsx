import React, { useCallback, useState } from 'react';

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

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  height: '100%',
  color: 'var(--text-faint)',
  fontSize: '0.75rem',
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
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
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
  padding: '0 2px',
  color: 'var(--text-faint)',
  fontSize: 'inherit',
  fontFamily: 'inherit',
  borderRadius: '3px',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const currentSegmentStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
};

const chevronWrapperStyle: React.CSSProperties = {
  color: 'var(--text-faint)',
  flexShrink: 0,
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
  return {
    segments: splitPath(displayPath),
    absoluteSegments: splitPath(normalizedPath),
  };
}

function buildDirPath(data: BreadcrumbData, segmentIndex: number): string {
  const absoluteIndex = data.absoluteSegments.length - data.segments.length + segmentIndex;
  return `/${data.absoluteSegments.slice(0, absoluteIndex + 1).join('/')}`;
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
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3 2L6 5L3 8"
        stroke="currentColor"
        strokeWidth="1.3"
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

function setDirectoryButtonHoverState(
  target: HTMLButtonElement,
  canNavigate: boolean,
  hovering: boolean,
): void {
  if (!canNavigate) {
    return;
  }

  target.style.color = hovering ? 'var(--text)' : 'var(--text-faint)';
  target.style.backgroundColor = hovering ? 'var(--bg-tertiary)' : 'transparent';
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
      title={`Navigate to ${segment}`}
      style={{ ...directoryButtonStyle, cursor: onNavigateToDir ? 'pointer' : 'default' }}
      onMouseEnter={(e) => {
        setDirectoryButtonHoverState(e.currentTarget, Boolean(onNavigateToDir), true);
      }}
      onMouseLeave={(e) => {
        setDirectoryButtonHoverState(e.currentTarget, Boolean(onNavigateToDir), false);
      }}
    >
      {segment}
    </button>
  );
}

function CurrentSegmentLabel({ segment }: { segment: string }): React.ReactElement {
  return <span style={currentSegmentStyle}>{segment}</span>;
}

function BreadcrumbSegmentItem(props: {
  segment: string;
  index: number;
  data: BreadcrumbData;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { segment, index, data, onNavigateToDir } = props;
  const isLast = index === data.segments.length - 1;

  return (
    <React.Fragment>
      {isLast ? (
        <CurrentSegmentLabel segment={segment} />
      ) : (
        <DirectorySegmentButton
          segment={segment}
          dirPath={buildDirPath(data, index)}
          onNavigateToDir={onNavigateToDir}
        />
      )}
      {!isLast && (
        <span style={chevronWrapperStyle}>
          <ChevronIcon />
        </span>
      )}
    </React.Fragment>
  );
}

function BreadcrumbSegments(props: {
  data: BreadcrumbData;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { data, onNavigateToDir } = props;
  return (
    <div style={segmentsStyle}>
      {data.segments.map((segment, index) => (
        <BreadcrumbSegmentItem
          key={`${segment}-${index}`}
          segment={segment}
          index={index}
          data={data}
          onNavigateToDir={onNavigateToDir}
        />
      ))}
    </div>
  );
}

function setCopyButtonHoverState(target: HTMLButtonElement, copied: boolean, hovering: boolean): void {
  if (copied) {
    return;
  }

  target.style.color = hovering ? 'var(--text)' : 'var(--text-faint)';
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
      style={{ ...copyButtonStyle, color: copied ? 'var(--success)' : 'var(--text-faint)' }}
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
  return <div style={emptyStateStyle}>No file open</div>;
}

function BreadcrumbLayout(props: {
  data: BreadcrumbData;
  copied: boolean;
  onCopy: () => Promise<void>;
  onNavigateToDir?: (dirPath: string) => void;
}): React.ReactElement {
  const { data, copied, onCopy, onNavigateToDir } = props;
  return (
    <div style={containerStyle}>
      <BreadcrumbSegments data={data} onNavigateToDir={onNavigateToDir} />
      <CopyPathButton copied={copied} onCopy={onCopy} />
    </div>
  );
}

/**
 * Breadcrumb - displays the current file path as clickable segments.
 */
export function Breadcrumb({
  filePath,
  projectRoot,
  onNavigateToDir,
}: BreadcrumbProps): React.ReactElement {
  const { copied, handleCopy } = useCopyFeedback(filePath);
  if (!filePath) return <EmptyBreadcrumb />;
  const data = buildBreadcrumbData(filePath, projectRoot);
  return <BreadcrumbLayout data={data} copied={copied} onCopy={handleCopy} onNavigateToDir={onNavigateToDir} />;
}
