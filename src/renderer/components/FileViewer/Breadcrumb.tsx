import React, { useCallback, useMemo, useState } from 'react';

import {
  ChevronSeparator,
  CopyPathButton,
  CurrentSegmentLabel,
  DirectorySegmentButton,
  EllipsisBadge,
} from './Breadcrumb.parts';

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

function useCopyFeedback(filePath: string | null): {
  copied: boolean;
  handleCopy: () => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    if (!filePath) return;
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

function BreadcrumbSegmentItem(props: {
  segment: string;
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
