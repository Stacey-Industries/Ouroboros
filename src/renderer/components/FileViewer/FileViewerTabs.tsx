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

interface TabListProps {
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
}: TabListProps): React.ReactElement {
  return (
    <div ref={scrollRef as React.RefObject<HTMLDivElement>} role="tablist" aria-label="Open files" style={TAB_LIST_STYLE}>
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
          tabRef={originalIndex === activeIndex ? (activeTabRef as React.RefObject<HTMLDivElement>) : undefined}
        />
      ))}
    </div>
  );
}

type OverflowButtonProps = {
  hasOverflow: boolean;
  toggleOverflow: () => void;
  showOverflow: boolean;
  files: OpenFile[];
  activeIndex: number;
  onActivate: (f: string) => void;
  dismissOverflow: () => void;
};

function OverflowButton(p: OverflowButtonProps): React.ReactElement | null {
  if (!p.hasOverflow) return null;
  return (
    <>
      <button
        className="text-text-semantic-muted"
        style={OVERFLOW_BUTTON_STYLE}
        onClick={p.toggleOverflow}
        aria-label="Show all tabs"
        tabIndex={-1}
        title="Show all open tabs"
      >
        <ChevronDownIcon />
      </button>
      {p.showOverflow && (
        <OverflowDropdown
          files={p.files}
          activeIndex={p.activeIndex}
          onActivate={p.onActivate}
          onDismiss={p.dismissOverflow}
        />
      )}
    </>
  );
}

export function FileViewerTabs(props: FileViewerTabsProps): React.ReactElement {
  const { files, activeIndex, onActivate } = props;
  const st = useFileViewerTabsState(files, activeIndex);
  if (files.length === 0) return <EmptyTabs />;
  const tabListProps: TabListProps = {
    sortedFiles: st.sortedFiles,
    activeIndex,
    activeTabRef: st.activeTabRef,
    scrollRef: st.scrollRef,
    onActivate: props.onActivate,
    onClose: props.onClose,
    onPin: props.onPin,
    onUnpin: props.onUnpin,
    onTogglePin: props.onTogglePin,
    onCloseOthers: props.onCloseOthers,
    onCloseToRight: props.onCloseToRight,
    onCloseAll: props.onCloseAll,
  };
  const overflowProps: OverflowButtonProps = {
    hasOverflow: st.hasOverflow,
    toggleOverflow: st.toggleOverflow,
    showOverflow: st.showOverflow,
    files,
    activeIndex,
    onActivate,
    dismissOverflow: st.dismissOverflow,
  };
  return (
    <div style={CONTAINER_STYLE}>
      <ScrollButton direction="left" onClick={st.scrollLeft} visible={st.showScrollLeft} />
      <TabList {...tabListProps} />
      <ScrollButton direction="right" onClick={st.scrollRight} visible={st.showScrollRight} />
      <OverflowButton {...overflowProps} />
    </div>
  );
}
