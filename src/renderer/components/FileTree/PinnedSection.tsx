/**
 * PinnedSection - renders the bookmarked/pinned files section at the top
 * of the file tree. Shows a collapsible list of pinned items with unpin buttons.
 *
 * Extracted from FileTree.tsx.
 */

import React, { useEffect, useState } from 'react';

import { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';

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

const PINNED_SECTION_CSS = `
  .pinned-item-row:hover { background-color: var(--bg-tertiary); }
  .pinned-item-row[data-active="true"],
  .pinned-item-row[data-active="true"]:hover {
    background-color: rgba(var(--accent-rgb, 88, 166, 255), 0.1);
  }
  .pinned-item-row:hover .pinned-unpin-btn { opacity: 1 !important; }
  .pinned-unpin-btn:hover { color: var(--accent); }
`;

const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-muted)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-muted)',
  minHeight: '26px',
};

const headerTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const countBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0 5px',
  borderRadius: '8px',
  lineHeight: '16px',
};

const rowBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  paddingLeft: '20px',
  paddingRight: '8px',
  cursor: 'pointer',
  height: '28px',
  boxSizing: 'border-box',
  userSelect: 'none',
  borderLeft: '2px solid transparent',
};

const dotStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
};

const unpinButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '2px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  opacity: 0,
  transition: 'opacity 150ms',
};

function getPinnedItemName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path;
}

async function resolvePinnedItems(bookmarks: string[]): Promise<PinnedItemInfo[]> {
  return Promise.all(bookmarks.map(async (path) => {
    const result = await window.electronAPI.files.readDir(path);
    return { path, name: getPinnedItemName(path), isDirectory: result.success === true };
  }));
}

function usePinnedItems(bookmarks: string[]): PinnedItemInfo[] {
  const [items, setItems] = useState<PinnedItemInfo[]>([]);

  useEffect(() => {
    if (bookmarks.length === 0) return void setItems([]);
    let cancelled = false;
    void resolvePinnedItems(bookmarks).then((nextItems) => {
      if (!cancelled) setItems(nextItems);
    });
    return () => { cancelled = true; };
  }, [bookmarks]);

  return items;
}

function getRowStyle(isActive: boolean): React.CSSProperties {
  return {
    ...rowBaseStyle,
    backgroundColor: isActive ? 'rgba(var(--accent-rgb, 88, 166, 255), 0.1)' : 'transparent',
    borderLeft: isActive ? '2px solid var(--accent)' : rowBaseStyle.borderLeft,
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
    color: item.isDirectory ? 'var(--text)' : 'var(--text-secondary)',
    fontFamily: item.isDirectory ? 'var(--font-ui)' : 'var(--font-mono)',
    fontWeight: item.isDirectory ? 500 : undefined,
  };
}

function handleHeaderKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  onToggle: () => void
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle();
}

function PinnedChevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-text-semantic-faint"
      style={{ flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
    >
      <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinnedIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="text-interactive-accent" style={{ flexShrink: 0 }}>
      <path d="M9.828 2.172a2 2 0 0 1 2.828 0l1.172 1.172a2 2 0 0 1 0 2.828L11 9l.5 5-3-3-4 4v-1.5L1 11l3-3-3-3 5 .5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinnedSectionHeader({
  expanded,
  count,
  onToggle,
}: {
  expanded: boolean;
  count: number;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <div className="bg-surface-raised" style={headerStyle} onClick={onToggle} role="button" tabIndex={0} onKeyDown={(event) => handleHeaderKeyDown(event, onToggle)} aria-expanded={expanded} aria-label="Toggle Pinned section">
      <PinnedChevron expanded={expanded} />
      <PinnedIcon />
      <span className="text-text-semantic-muted" style={headerTitleStyle}>Pinned</span>
      <span className="text-text-semantic-faint bg-surface-base" style={countBadgeStyle}>{count}</span>
    </div>
  );
}

function PinnedItemIcon({ item }: { item: PinnedItemInfo }): React.ReactElement {
  return item.isDirectory ? <FolderTypeIcon name={item.name} open={false} /> : <FileTypeIcon filename={item.name} />;
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
}): React.ReactElement {
  const isActive = item.path === activeFilePath;

  return (
    <div role="listitem" className="pinned-item-row" data-active={isActive} onClick={() => onFileSelect(item.path)} style={getRowStyle(isActive)} title={item.path}>
      <PinnedItemIcon item={item} />
      <span style={getNameStyle(item)}>{item.name}</span>
      <span className="text-interactive-accent" style={dotStyle} aria-hidden="true">
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
          <circle cx="3" cy="3" r="3" fill="currentColor" />
        </svg>
      </span>
      <button className="pinned-unpin-btn text-text-semantic-faint" onClick={(event) => { event.stopPropagation(); onUnpin(item.path); }} title={`Unpin "${item.name}"`} style={unpinButtonStyle} aria-label={`Unpin ${item.name}`}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
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
}): React.ReactElement {
  return (
    <div role="list" aria-label="Pinned items">
      {items.map((item) => <PinnedItemRow key={item.path} item={item} activeFilePath={activeFilePath} onFileSelect={onFileSelect} onUnpin={onUnpin} />)}
    </div>
  );
}

export function PinnedSection({
  bookmarks,
  activeFilePath,
  onFileSelect,
  onUnpin,
}: PinnedSectionProps): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(true);
  const pinnedItems = usePinnedItems(bookmarks);

  if (bookmarks.length === 0) return null;

  return (
    <div style={sectionStyle}>
      <style>{PINNED_SECTION_CSS}</style>
      <PinnedSectionHeader expanded={isExpanded} count={bookmarks.length} onToggle={() => setIsExpanded((prev) => !prev)} />
      {isExpanded && <PinnedItemsList items={pinnedItems} activeFilePath={activeFilePath} onFileSelect={onFileSelect} onUnpin={onUnpin} />}
    </div>
  );
}
