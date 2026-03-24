import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { OpenFile } from './FileViewerManager';
import { FileViewerTabItem } from './FileViewerTabItem';
import { OverflowDropdown } from './FileViewerTabs.parts';

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

interface SortedFile {
  file: OpenFile;
  originalIndex: number;
}

function sortFilesWithPinned(files: OpenFile[]): SortedFile[] {
  const pinned: SortedFile[] = [];
  const unpinned: SortedFile[] = [];
  for (let i = 0; i < files.length; i++)
    (files[i].isPinned ? pinned : unpinned).push({ file: files[i], originalIndex: i });
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

function useScrollState(scrollRef: React.RefObject<HTMLDivElement | null>, filesLength: number) {
  const [showScrollLeft, setShowScrollLeft] = useState(false);
  const [showScrollRight, setShowScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollLeft(el.scrollLeft > 0);
    setShowScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    setHasOverflow(el.scrollWidth > el.clientWidth + 1);
  }, [scrollRef]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons);
    const ro = new ResizeObserver(updateScrollButtons);
    ro.observe(el);
    updateScrollButtons();
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      ro.disconnect();
    };
  }, [filesLength, scrollRef, updateScrollButtons]);
  return { showScrollLeft, showScrollRight, hasOverflow, updateScrollButtons };
}

function useFileViewerTabsState(files: OpenFile[], activeIndex: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const sortedFiles = useMemo(() => sortFilesWithPinned(files), [files]);
  const { showScrollLeft, showScrollRight, hasOverflow, updateScrollButtons } = useScrollState(
    scrollRef,
    files.length,
  );
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    requestAnimationFrame(updateScrollButtons);
  }, [activeIndex, updateScrollButtons]);
  return {
    scrollRef,
    activeTabRef,
    sortedFiles,
    showScrollLeft,
    showScrollRight,
    hasOverflow,
    showOverflow,
    scrollLeft: () => {
      if (scrollRef.current) scrollRef.current.scrollLeft -= 150;
    },
    scrollRight: () => {
      if (scrollRef.current) scrollRef.current.scrollLeft += 150;
    },
    toggleOverflow: () => setShowOverflow((prev) => !prev),
    dismissOverflow: () => setShowOverflow(false),
  };
}

function TabList({
  sortedFiles,
  activeIndex,
  activeTabRef,
  scrollRef,
  onActivate,
  onClose,
  onPin,
  onUnpin,
  onTogglePin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
}: {
  sortedFiles: SortedFile[];
  activeIndex: number;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  onPin?: (filePath: string) => void;
  onUnpin?: (filePath: string) => void;
  onTogglePin?: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
}): React.ReactElement {
  return (
    <div ref={scrollRef} role="tablist" aria-label="Open files" style={TAB_LIST_STYLE}>
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
  const {
    scrollRef,
    activeTabRef,
    sortedFiles,
    showScrollLeft,
    showScrollRight,
    hasOverflow,
    showOverflow,
    scrollLeft,
    scrollRight,
    toggleOverflow,
    dismissOverflow,
  } = useFileViewerTabsState(files, activeIndex);
  if (files.length === 0) return <EmptyTabs />;
  return (
    <div style={CONTAINER_STYLE}>
      <ScrollButton direction="left" onClick={scrollLeft} visible={showScrollLeft} />
      <TabList
        sortedFiles={sortedFiles}
        activeIndex={activeIndex}
        activeTabRef={activeTabRef}
        scrollRef={scrollRef}
        onActivate={onActivate}
        onClose={onClose}
        onPin={onPin}
        onUnpin={onUnpin}
        onTogglePin={onTogglePin}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
      />
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
