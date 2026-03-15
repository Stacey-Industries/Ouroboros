import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { OpenFile } from './FileViewerManager';
import { FileViewerTabItem } from './FileViewerTabItem';

export interface FileViewerTabsProps {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  onPin?: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
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
  background: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
  fontSize: '10px',
  borderLeft: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
};

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
      style={SCROLL_BUTTON_STYLE}
      onClick={onClick}
      aria-label={`Scroll tabs ${direction}`}
      tabIndex={-1}
    >
      {direction === 'left' ? '\u25C0' : '\u25B6'}
    </button>
  );
}

export function FileViewerTabs({
  files,
  activeIndex,
  onActivate,
  onClose,
  onPin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
}: FileViewerTabsProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [showScrollLeft, setShowScrollLeft] = useState(false);
  const [showScrollRight, setShowScrollRight] = useState(false);

  // Check if scroll buttons are needed
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollLeft(el.scrollLeft > 0);
    setShowScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
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
        {files.map((file, index) => (
          <FileViewerTabItem
            key={file.path}
            file={file}
            isActive={index === activeIndex}
            onActivate={onActivate}
            onClose={onClose}
            onPin={onPin}
            onCloseOthers={onCloseOthers}
            onCloseToRight={onCloseToRight}
            onCloseAll={onCloseAll}
            tabRef={index === activeIndex ? activeTabRef : undefined}
          />
        ))}
      </div>
      <ScrollButton direction="right" onClick={scrollRight} visible={showScrollRight} />
    </div>
  );
}
