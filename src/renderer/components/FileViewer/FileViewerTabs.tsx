import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { OpenFile } from './FileViewerManager';
import { FileViewerTabItem } from './FileViewerTabItem';

export interface FileViewerTabsProps {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  onPin?: (filePath: string) => void;
  onUnpin?: (filePath: string) => void;
  onTogglePin?: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  overflow: 'hidden',
  position: 'relative',
  minWidth: 0,
};

const TAB_LIST_STYLE: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  overflowX: 'auto',
  overflowY: 'hidden',
  height: '100%',
  scrollbarWidth: 'none',
  scrollBehavior: 'smooth',
};

const SCROLL_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '100%',
  border: 'none',
  background: 'var(--surface-panel)',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
  fontSize: '10px',
  borderLeft: '1px solid var(--border-semantic)',
  borderRight: '1px solid var(--border-semantic)',
};

const OVERFLOW_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '100%',
  border: 'none',
  background: 'var(--surface-panel)',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
  fontSize: '10px',
  borderLeft: '1px solid var(--border-semantic)',
};

const OVERFLOW_DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 10000,
  minWidth: '180px',
  maxWidth: '300px',
  maxHeight: '300px',
  overflowY: 'auto',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  padding: '4px 0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const OVERFLOW_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  padding: '4px 12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface SortedFile {
  file: OpenFile;
  /** Original index in the files array (before sorting) */
  originalIndex: number;
}

/**
 * Sort files so pinned tabs come first, preserving relative order within each group.
 */
function sortFilesWithPinned(files: OpenFile[]): SortedFile[] {
  const pinned: SortedFile[] = [];
  const unpinned: SortedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const entry = { file: files[i], originalIndex: i };
    if (files[i].isPinned) {
      pinned.push(entry);
    } else {
      unpinned.push(entry);
    }
  }
  return [...pinned, ...unpinned];
}

function EmptyTabs(): React.ReactElement {
  return <div style={{ flex: 1, height: '100%' }} aria-hidden="true" />;
}

function ScrollButton({
  direction,
  onClick,
  visible,
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  visible: boolean;
}): React.ReactElement | null {
  if (!visible) return null;
  return (
    <button
      className="text-text-semantic-muted"
      style={SCROLL_BUTTON_STYLE}
      onClick={onClick}
      aria-label={`Scroll tabs ${direction}`}
      tabIndex={-1}
    >
      {direction === 'left' ? '\u25C0' : '\u25B6'}
    </button>
  );
}

function ChevronDownIcon(): React.ReactElement {
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
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OverflowDropdown({
  files,
  activeIndex,
  onActivate,
  onDismiss,
}: {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onDismiss: () => void;
}): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onDismiss]);

  return (
    <div ref={menuRef} style={OVERFLOW_DROPDOWN_STYLE}>
      {files.map((file, index) => (
        <button
          key={file.path}
          style={{
            ...OVERFLOW_ITEM_STYLE,
            fontWeight: index === activeIndex ? 600 : 'normal',
            color: index === activeIndex ? 'var(--interactive-accent)' : 'var(--text)',
            fontStyle: file.isPreview ? 'italic' : 'normal',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-raised)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
          onClick={() => {
            onActivate(file.path);
            onDismiss();
          }}
        >
          {file.isPinned && (
            <svg width="8" height="8" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M10.5 2.5L13.5 5.5L10 9L11 13L8 10L5 13L6 9L2.5 5.5L5.5 2.5L8 5L10.5 2.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          {file.isDirty && (
            <span style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'var(--interactive-accent)',
              flexShrink: 0,
            }} />
          )}
        </button>
      ))}
    </div>
  );
}

export function FileViewerTabs({
  files,
  activeIndex,
  onActivate,
  onClose,
  onPin,
  onUnpin,
  onTogglePin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
}: FileViewerTabsProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [showScrollLeft, setShowScrollLeft] = useState(false);
  const [showScrollRight, setShowScrollRight] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Sort files: pinned first, then unpinned
  const sortedFiles = useMemo(() => sortFilesWithPinned(files), [files]);

  // Check if scroll buttons are needed
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollLeft(el.scrollLeft > 0);
    const overflowing = el.scrollWidth > el.clientWidth + 1;
    setShowScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    setHasOverflow(overflowing);
  }, []);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    // Re-check scroll buttons after scrolling
    requestAnimationFrame(updateScrollButtons);
  }, [activeIndex, updateScrollButtons]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons);
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(el);
    updateScrollButtons();
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, [files.length, updateScrollButtons]);

  const scrollLeft = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft -= 150;
  }, []);

  const scrollRight = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft += 150;
  }, []);

  const toggleOverflow = useCallback(() => {
    setShowOverflow((prev) => !prev);
  }, []);

  const dismissOverflow = useCallback(() => {
    setShowOverflow(false);
  }, []);

  if (files.length === 0) return <EmptyTabs />;

  return (
    <div style={CONTAINER_STYLE}>
      <ScrollButton direction="left" onClick={scrollLeft} visible={showScrollLeft} />
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open files"
        style={TAB_LIST_STYLE}
      >
        {sortedFiles.map(({ file, originalIndex }) => (
          <FileViewerTabItem
            key={file.path}
            file={file}
            isActive={originalIndex === activeIndex}
            onActivate={onActivate}
            onClose={onClose}
            onPin={onPin}
            onUnpin={onUnpin}
            onTogglePin={onTogglePin}
            onCloseOthers={onCloseOthers}
            onCloseToRight={onCloseToRight}
            onCloseAll={onCloseAll}
            tabRef={originalIndex === activeIndex ? activeTabRef : undefined}
          />
        ))}
      </div>
      <ScrollButton direction="right" onClick={scrollRight} visible={showScrollRight} />
      {hasOverflow && (
        <button
          className="text-text-semantic-muted"
          style={OVERFLOW_BUTTON_STYLE}
          onClick={toggleOverflow}
          aria-label="Show all tabs"
          tabIndex={-1}
          title="Show all open tabs"
        >
          <ChevronDownIcon />
        </button>
      )}
      {showOverflow && (
        <OverflowDropdown
          files={files}
          activeIndex={activeIndex}
          onActivate={onActivate}
          onDismiss={dismissOverflow}
        />
      )}
    </div>
  );
}
