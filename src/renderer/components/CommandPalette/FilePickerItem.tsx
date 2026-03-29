import React, { memo } from 'react';

import { getFileIcon } from '../FileTree/fileIcons';
import { RangeHighlight } from './HighlightedText';

const ITEM_HEIGHT = 36;
const EMPTY_INDICES: ReadonlyArray<readonly [number, number]> = [];

export interface FilePickerItemProps {
  name: string;
  relativePath: string;
  isSelected: boolean;
  nameIndices: ReadonlyArray<readonly [number, number]>;
  pathIndices: ReadonlyArray<readonly [number, number]>;
  onClick: () => void;
  onMouseEnter: () => void;
}

function getDirectoryPart(relativePath: string): string {
  return relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
}

function getItemStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    borderRadius: '4px',
    margin: '0 4px',
    height: `${ITEM_HEIGHT}px`,
    boxSizing: 'border-box',
    backgroundColor: isSelected ? 'var(--interactive-accent)' : 'transparent',
    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-primary)',
    transition: 'background-color 80ms ease',
    userSelect: 'none',
    minWidth: 0,
  };
}

export const FilePickerItem = memo(function FilePickerItem({
  name,
  relativePath,
  isSelected,
  nameIndices,
  pathIndices,
  onClick,
  onMouseEnter,
}: FilePickerItemProps): React.ReactElement<any> {
  const icon = getFileIcon(name);
  const dirPart = getDirectoryPart(relativePath);
  const highlightedNameIndices = isSelected ? EMPTY_INDICES : nameIndices;
  const highlightedPathIndices = isSelected ? EMPTY_INDICES : pathIndices;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={getItemStyle(isSelected)}
    >
      <ColorDot color={icon.color} dimmed={isSelected} />
      <FileName name={name} indices={highlightedNameIndices} />
      {dirPart && (
        <DirPath dir={dirPart} indices={highlightedPathIndices} isSelected={isSelected} />
      )}
    </div>
  );
});

function ColorDot({ color, dimmed }: { color: string; dimmed: boolean }): React.ReactElement<any> {
  return (
    <span
      style={{
        flexShrink: 0,
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: color,
        opacity: dimmed ? 0.85 : 1,
      }}
    />
  );
}

function FileName({
  name,
  indices,
}: {
  name: string;
  indices: ReadonlyArray<readonly [number, number]>;
}): React.ReactElement<any> {
  return (
    <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}>
      <RangeHighlight text={name} indices={indices} />
    </span>
  );
}

function DirPath({
  dir,
  indices,
  isSelected,
}: {
  dir: string;
  indices: ReadonlyArray<readonly [number, number]>;
  isSelected: boolean;
}): React.ReactElement<any> {
  return (
    <span
      style={{
        flex: 1,
        minWidth: 0,
        fontSize: '12px',
        color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-faint)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <RangeHighlight text={dir} indices={indices} />
    </span>
  );
}
