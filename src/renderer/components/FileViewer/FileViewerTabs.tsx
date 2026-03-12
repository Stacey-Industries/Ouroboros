import React, { useRef, useEffect } from 'react';
import type { OpenFile } from './FileViewerManager';

export interface FileViewerTabsProps {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
}

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 2L8 8M8 2L2 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * FileViewerTabs — horizontal scrolling tab bar for open files.
 *
 * - Click to activate
 * - Click the × button to close
 * - Middle-click (auxclick) to close
 * - Scrolls horizontally when there are many tabs
 * - Shows a dot indicator when a file has been modified on disk
 * - Active tab scrolls into view automatically
 */
export function FileViewerTabs({
  files,
  activeIndex,
  onActivate,
  onClose,
}: FileViewerTabsProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      activeTabRef.current.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [activeIndex]);

  if (files.length === 0) {
    return <div style={{ flex: 1, height: '100%' }} aria-hidden="true" />;
  }

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Open files"
      style={{
        display: 'flex',
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        height: '100%',
        // Hide scrollbar visually but keep scrollability
        scrollbarWidth: 'none',
      }}
    >
      {files.map((file, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={file.path}
            ref={isActive ? activeTabRef : undefined}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={file.path}
            onClick={() => onActivate(file.path)}
            onAuxClick={(e) => {
              // Middle-click closes the tab
              if (e.button === 1) {
                e.preventDefault();
                if (file.isDirty) {
                  const confirmed = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`);
                  if (!confirmed) return;
                }
                onClose(file.path);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onActivate(file.path);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 10px 0 12px',
              height: '100%',
              flexShrink: 0,
              cursor: 'pointer',
              userSelect: 'none',
              borderRight: '1px solid var(--border)',
              borderBottom: isActive
                ? '2px solid var(--accent)'
                : '2px solid transparent',
              backgroundColor: isActive
                ? 'var(--bg)'
                : 'var(--bg-secondary)',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-ui)',
              minWidth: '80px',
              maxWidth: '200px',
              position: 'relative',
              transition: 'background-color 100ms ease, color 100ms ease',
            }}
          >
            {/* Disk-modified indicator */}
            {file.isDirtyOnDisk && (
              <span
                title="File changed on disk"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning)',
                  flexShrink: 0,
                }}
              />
            )}

            {/* Unsaved-edits indicator */}
            {file.isDirty && !file.isDirtyOnDisk && (
              <span
                title="Unsaved changes"
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  flexShrink: 0,
                }}
              />
            )}

            {/* Filename */}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file.name}{file.isDirty ? ' *' : ''}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (file.isDirty) {
                  const confirmed = window.confirm(`"${file.name}" has unsaved changes. Close anyway?`);
                  if (!confirmed) return;
                }
                onClose(file.path);
              }}
              aria-label={`Close ${file.name}`}
              tabIndex={-1}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '3px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
                opacity: isActive ? 1 : 0,
                transition: 'opacity 100ms ease, background-color 100ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--bg-tertiary)';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--text)';
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'transparent';
                (e.currentTarget as HTMLButtonElement).style.color =
                  'var(--text-faint)';
                (e.currentTarget as HTMLButtonElement).style.opacity = isActive
                  ? '1'
                  : '0';
              }}
            >
              <CloseIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}
