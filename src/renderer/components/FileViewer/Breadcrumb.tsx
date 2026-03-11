import React, { useState, useCallback } from 'react';

export interface BreadcrumbProps {
  filePath: string | null;
  projectRoot: string | null;
  /** Called when a segment is clicked — receives the dir path up to that segment */
  onNavigateToDir?: (dirPath: string) => void;
}

function splitPath(filePath: string): string[] {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean);
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

/**
 * Breadcrumb — displays the current file path as clickable segments.
 *
 * - Normalises Windows backslashes to forward slashes.
 * - Click a directory segment to navigate there in the file list.
 * - Copy button copies the full absolute path to the clipboard.
 * - If a projectRoot is provided, only shows the relative portion.
 */
export function Breadcrumb({
  filePath,
  projectRoot,
  onNavigateToDir,
}: BreadcrumbProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!filePath) return;
    try {
      await navigator.clipboard.writeText(filePath.replace(/\\/g, '/'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may not be available in all contexts
    }
  }, [filePath]);

  if (!filePath) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          height: '100%',
          color: 'var(--text-faint)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
        }}
      >
        No file open
      </div>
    );
  }

  const normalized = filePath.replace(/\\/g, '/');
  const rootNorm = projectRoot?.replace(/\\/g, '/') ?? null;
  const displayPath =
    rootNorm && normalized.startsWith(rootNorm)
      ? normalized.slice(rootNorm.length).replace(/^\//, '')
      : normalized;

  const segments = splitPath(displayPath);

  // Absolute segments for building dir paths passed to onNavigateToDir
  const absoluteSegments = splitPath(normalized);

  function buildDirPath(upToIndex: number): string {
    return '/' + absoluteSegments.slice(0, upToIndex + 1).join('/');
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '0 8px',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
      }}
    >
      {/* Path segments */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          overflow: 'hidden',
          flex: 1,
          minWidth: 0,
        }}
      >
        {segments.map((segment, i) => {
          const isLast = i === segments.length - 1;
          const isDir = !isLast;
          const absIdx = absoluteSegments.length - segments.length + i;

          return (
            <React.Fragment key={`${segment}-${i}`}>
              {isDir ? (
                <button
                  onClick={() => onNavigateToDir?.(buildDirPath(absIdx))}
                  title={`Navigate to ${segment}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0 2px',
                    color: 'var(--text-faint)',
                    cursor: onNavigateToDir ? 'pointer' : 'default',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    borderRadius: '3px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (onNavigateToDir) {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        'var(--text)';
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        'var(--bg-tertiary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text-faint)';
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'transparent';
                  }}
                >
                  {segment}
                </button>
              ) : (
                <span
                  style={{
                    color: 'var(--text)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flexShrink: 1,
                  }}
                >
                  {segment}
                </span>
              )}

              {!isLast && (
                <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
                  <ChevronIcon />
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Copy path button */}
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy full path'}
        aria-label="Copy full file path"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3px',
          background: 'none',
          border: 'none',
          borderRadius: '3px',
          color: copied ? 'var(--success)' : 'var(--text-faint)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'color 100ms ease',
        }}
        onMouseEnter={(e) => {
          if (!copied)
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
        }}
        onMouseLeave={(e) => {
          if (!copied)
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--text-faint)';
        }}
      >
        <CopyIcon />
      </button>
    </div>
  );
}
