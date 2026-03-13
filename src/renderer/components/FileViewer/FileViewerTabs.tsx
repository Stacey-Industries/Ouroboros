import React, { useRef, useEffect } from 'react';
import type { OpenFile } from './FileViewerManager';
import { FileViewerTabItem } from './FileViewerTabItem';

export interface FileViewerTabsProps {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
}

const TAB_LIST_STYLE = {
  display: 'flex',
  flex: 1,
  overflowX: 'auto',
  overflowY: 'hidden',
  height: '100%',
  scrollbarWidth: 'none',
} as const;

function EmptyTabs(): React.ReactElement {
  return <div style={{ flex: 1, height: '100%' }} aria-hidden="true" />;
}

export function FileViewerTabs({
  files,
  activeIndex,
  onActivate,
  onClose,
}: FileViewerTabsProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeIndex]);

  if (files.length === 0) return <EmptyTabs />;

  return (
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
          tabRef={index === activeIndex ? activeTabRef : undefined}
        />
      ))}
    </div>
  );
}
