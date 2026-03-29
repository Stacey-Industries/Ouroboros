/**
 * PinnedSection - renders the bookmarked/pinned files section at the top
 * of the file tree. Shows a collapsible list of pinned items with unpin buttons.
 *
 * Extracted from FileTree.tsx.
 */

import React, { useEffect, useState } from 'react';

import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
import {
  countBadgeStyle,
  dotStyle,
  headerStyle,
  headerTitleStyle,
  PINNED_SECTION_CSS,
  PinnedChevron,
  PinnedIcon,
  rowBaseStyle,
  sectionStyle,
  unpinButtonStyle,
} from './PinnedSection.parts';

interface PinnedItemInfo {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface PinnedSectionProps {
  bookmarks: string[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onUnpin: (path: string) => void;
}

function getPinnedItemName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

async function resolvePinnedItems(bookmarks: string[]): Promise<PinnedItemInfo[]> {
  return Promise.all(
    bookmarks.map(async (path) => {
      const result = await window.electronAPI.files.readDir(path);
      return { path, name: getPinnedItemName(path), isDirectory: result.success === true };
    }),
  );
}

function usePinnedItems(bookmarks: string[]): PinnedItemInfo[] {
  const [items, setItems] = useState<PinnedItemInfo[]>([]);

  useEffect(() => {
    if (bookmarks.length === 0) return void setItems([]);
    let cancelled = false;
    void resolvePinnedItems(bookmarks).then((nextItems) => {
      if (!cancelled) setItems(nextItems);
    });
    return () => {
      cancelled = true;
    };
  }, [bookmarks]);

  return items;
}

function getRowStyle(isActive: boolean): React.CSSProperties {
  return {
    ...rowBaseStyle,
    backgroundColor: isActive ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)' : 'transparent',
    borderLeft: isActive ? '2px solid var(--interactive-accent)' : rowBaseStyle.borderLeft,
  };
}

function getNameStyle(item: PinnedItemInfo): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    color: item.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontFamily: item.isDirectory ? 'var(--font-ui)' : 'var(--font-mono)',
    fontWeight: item.isDirectory ? 500 : undefined,
  };
}

function handleHeaderKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  onToggle: () => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle();
}

function PinnedSectionHeader({
  expanded,
  count,
  onToggle,
}: {
  expanded: boolean;
  count: number;
  onToggle: () => void;
}): React.ReactElement<any> {
  return (
    <div
      className="bg-surface-raised"
      style={headerStyle}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => handleHeaderKeyDown(event, onToggle)}
      aria-expanded={expanded}
      aria-label="Toggle Pinned section"
    >
      <PinnedChevron expanded={expanded} />
      <PinnedIcon />
      <span className="text-text-semantic-muted" style={headerTitleStyle}>
        Pinned
      </span>
      <span className="text-text-semantic-faint bg-surface-base" style={countBadgeStyle}>
        {count}
      </span>
    </div>
  );
}

function PinnedItemIcon({ item }: { item: PinnedItemInfo }): React.ReactElement<any> {
  return item.isDirectory ? (
    <FolderTypeIcon name={item.name} open={false} />
  ) : (
    <FileTypeIcon filename={item.name} />
  );
}

function PinnedDot(): React.ReactElement<any> {
  return (
    <span className="text-interactive-accent" style={dotStyle} aria-hidden="true">
      <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
        <circle cx="3" cy="3" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}

function UnpinButton({
  name,
  path,
  onUnpin,
}: {
  name: string;
  path: string;
  onUnpin: (path: string) => void;
}): React.ReactElement<any> {
  return (
    <button
      className="pinned-unpin-btn text-text-semantic-faint"
      onClick={(event) => {
        event.stopPropagation();
        onUnpin(path);
      }}
      title={`Unpin "${name}"`}
      style={unpinButtonStyle}
      aria-label={`Unpin ${name}`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function PinnedItemRow({
  item,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: {
  item: PinnedItemInfo;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onUnpin: (path: string) => void;
}): React.ReactElement<any> {
  const isActive = item.path === activeFilePath;
  return (
    <div
      role="listitem"
      className="pinned-item-row"
      data-active={isActive}
      onClick={() => onFileSelect(item.path)}
      style={getRowStyle(isActive)}
      title={item.path}
    >
      <PinnedItemIcon item={item} />
      <span style={getNameStyle(item)}>{item.name}</span>
      <PinnedDot />
      <UnpinButton name={item.name} path={item.path} onUnpin={onUnpin} />
    </div>
  );
}

function PinnedItemsList({
  items,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: {
  items: PinnedItemInfo[];
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  onUnpin: (path: string) => void;
}): React.ReactElement<any> {
  return (
    <div role="list" aria-label="Pinned items">
      {items.map((item) => (
        <PinnedItemRow
          key={item.path}
          item={item}
          activeFilePath={activeFilePath}
          onFileSelect={onFileSelect}
          onUnpin={onUnpin}
        />
      ))}
    </div>
  );
}

export function PinnedSection({
  bookmarks,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: PinnedSectionProps): React.ReactElement<any> | null {
  const [isExpanded, setIsExpanded] = useState(true);
  const pinnedItems = usePinnedItems(bookmarks);

  if (bookmarks.length === 0) return null;

  return (
    <div style={sectionStyle}>
      <style>{PINNED_SECTION_CSS}</style>
      <PinnedSectionHeader
        expanded={isExpanded}
        count={bookmarks.length}
        onToggle={() => setIsExpanded((prev) => !prev)}
      />
      {isExpanded && (
        <PinnedItemsList
          items={pinnedItems}
          activeFilePath={activeFilePath}
          onFileSelect={onFileSelect}
          onUnpin={onUnpin}
        />
      )}
    </div>
  );
}
