import React from 'react';

import type { WorkspaceSnapshot } from '../../types/electron';
import {
  formatFullDate,
  formatTimestamp,
  snapshotTypeColor,
  snapshotTypeLabel,
  truncateHash,
} from './timeTravelUtils';

interface TimelinePanelState {
  selectedId: string | null;
  compareFromId: string | null;
  compareToId: string | null;
  currentHead: string | null;
  handleSnapshotClick: (snapshot: WorkspaceSnapshot) => void;
}

function snapshotTitle(snapshot: WorkspaceSnapshot): string {
  return `${snapshotTypeLabel(snapshot.type)} - ${formatFullDate(snapshot.timestamp)}\nCommit: ${snapshot.commitHash}\nSession: ${snapshot.sessionLabel || snapshot.sessionId}`;
}

function selectedBorderColor(isSelected: boolean, isCompareFrom: boolean, isCompareTo: boolean): string {
  if (isSelected) return 'var(--accent)';
  if (isCompareFrom) return '#d29922';
  if (isCompareTo) return '#a371f7';
  return 'transparent';
}

function SnapshotMarker({ dotColor, isHead }: { dotColor: string; isHead: boolean }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px', flexShrink: 0, paddingTop: '2px' }}>
      <div style={{ width: isHead ? '10px' : '8px', height: isHead ? '10px' : '8px', borderRadius: '50%', backgroundColor: dotColor, border: isHead ? '2px solid var(--text)' : 'none', flexShrink: 0 }} />
    </div>
  );
}

function SnapshotBadges({
  isHead,
  isCompareFrom,
  isCompareTo,
}: {
  isHead: boolean;
  isCompareFrom: boolean;
  isCompareTo: boolean;
}): React.ReactElement {
  return (
    <>
      {isHead && <span className="text-text-semantic-on-accent" style={{ fontSize: '9px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', backgroundColor: 'var(--accent)' }}>HEAD</span>}
      {isCompareFrom && <span style={{ fontSize: '9px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', backgroundColor: '#d29922', color: '#000' }}>FROM</span>}
      {isCompareTo && <span style={{ fontSize: '9px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', backgroundColor: '#a371f7', color: '#000' }}>TO</span>}
    </>
  );
}

function SnapshotMeta({ snapshot }: { snapshot: WorkspaceSnapshot }): React.ReactElement {
  return (
    <div className="text-text-semantic-secondary" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {snapshot.sessionLabel || `Session ${snapshot.sessionId.slice(0, 8)}`}
      <div className="text-text-semantic-muted" style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '10px' }}>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{truncateHash(snapshot.commitHash)}</span>
        <span>{formatTimestamp(snapshot.timestamp)}</span>
        {snapshot.fileCount !== undefined && snapshot.fileCount > 0 && <span>{snapshot.fileCount} file{snapshot.fileCount !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

function SnapshotNode({
  snapshot,
  isSelected,
  isCompareFrom,
  isCompareTo,
  isHead,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot;
  isSelected: boolean;
  isCompareFrom: boolean;
  isCompareTo: boolean;
  isHead: boolean;
  onSelect: (snapshot: WorkspaceSnapshot) => void;
}): React.ReactElement {
  const dotColor = snapshotTypeColor(snapshot.type);
  const borderColor = selectedBorderColor(isSelected, isCompareFrom, isCompareTo);

  return (
    <button
      onClick={() => onSelect(snapshot)}
      title={snapshotTitle(snapshot)}
      className="text-text-semantic-primary"
      style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', padding: '8px 12px', background: isSelected ? 'rgba(88, 166, 255, 0.08)' : 'transparent', border: 'none', borderLeft: `2px solid ${borderColor}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: '12px', transition: 'background 100ms' }}
    >
      <SnapshotMarker dotColor={dotColor} isHead={isHead} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: dotColor }}>{snapshotTypeLabel(snapshot.type)}</span>
          <SnapshotBadges isHead={isHead} isCompareFrom={isCompareFrom} isCompareTo={isCompareTo} />
        </div>
        <SnapshotMeta snapshot={snapshot} />
      </div>
    </button>
  );
}

function EmptyTimelineState(): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontSize: '12px', textAlign: 'center', gap: '8px' }}>
      <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <circle cx="8" cy="8" r="6.5" />
        <polyline points="8,4 8,8 11,10" />
      </svg>
      <span>No snapshots yet.</span>
      <span style={{ fontSize: '11px' }}>Snapshots are created automatically when agent sessions start and end.</span>
    </div>
  );
}

export function TimeTravelTimelinePane({
  snapshots,
  hasDetailPane,
  panel,
}: {
  snapshots: WorkspaceSnapshot[];
  hasDetailPane: boolean;
  panel: TimelinePanelState;
}): React.ReactElement {
  return (
    <div className={hasDetailPane ? 'border-r border-border-semantic' : ''} style={{ width: hasDetailPane ? '55%' : '100%', overflowY: 'auto', transition: 'width 200ms' }}>
      {snapshots.length === 0 ? <EmptyTimelineState /> : snapshots.map((snapshot) => (
        <SnapshotNode
          key={snapshot.id}
          snapshot={snapshot}
          isSelected={panel.selectedId === snapshot.id}
          isCompareFrom={panel.compareFromId === snapshot.id}
          isCompareTo={panel.compareToId === snapshot.id}
          isHead={panel.currentHead === snapshot.commitHash}
          onSelect={panel.handleSnapshotClick}
        />
      ))}
    </div>
  );
}
