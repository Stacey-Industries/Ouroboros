/**
 * TimeTravelPanel.tsx — Browse and restore workspace states across agent sessions.
 *
 * Shows a vertical timeline of workspace snapshots (session-start, session-end, manual),
 * with the ability to compare any two snapshots or restore to a previous state.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import type { WorkspaceSnapshot } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function truncateHash(hash: string): string {
  return hash.slice(0, 7);
}

function snapshotTypeLabel(type: WorkspaceSnapshot['type']): string {
  switch (type) {
    case 'session-start': return 'Session Start';
    case 'session-end': return 'Session End';
    case 'manual': return 'Manual';
    default: return type;
  }
}

function snapshotTypeColor(type: WorkspaceSnapshot['type']): string {
  switch (type) {
    case 'session-start': return 'var(--accent, #58a6ff)';
    case 'session-end': return '#3fb950';
    case 'manual': return 'var(--text-muted, #8b949e)';
    default: return 'var(--text-muted)';
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'added': return '+';
    case 'deleted': return '-';
    case 'renamed': return 'R';
    default: return 'M';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'added': return '#3fb950';
    case 'deleted': return '#f85149';
    case 'renamed': return '#d29922';
    default: return 'var(--accent, #58a6ff)';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SnapshotNodeProps {
  snapshot: WorkspaceSnapshot;
  isSelected: boolean;
  isCompareFrom: boolean;
  isCompareTo: boolean;
  isHead: boolean;
  onClick: () => void;
}

function SnapshotNode({ snapshot, isSelected, isCompareFrom, isCompareTo, isHead, onClick }: SnapshotNodeProps): React.ReactElement {
  const dotColor = snapshotTypeColor(snapshot.type);
  const borderColor = isSelected ? 'var(--accent)' : isCompareFrom ? '#d29922' : isCompareTo ? '#a371f7' : 'transparent';

  return (
    <button
      onClick={onClick}
      title={`${snapshotTypeLabel(snapshot.type)} - ${formatFullDate(snapshot.timestamp)}\nCommit: ${snapshot.commitHash}\nSession: ${snapshot.sessionLabel || snapshot.sessionId}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        width: '100%',
        padding: '8px 12px',
        background: isSelected ? 'rgba(88, 166, 255, 0.08)' : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${borderColor}`,
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--text)',
        fontFamily: 'var(--font-ui)',
        fontSize: '12px',
        transition: 'background 100ms',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'rgba(128, 128, 128, 0.08)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Timeline dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px', flexShrink: 0, paddingTop: '2px' }}>
        <div
          style={{
            width: isHead ? '10px' : '8px',
            height: isHead ? '10px' : '8px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            border: isHead ? '2px solid var(--text)' : 'none',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: dotColor,
          }}>
            {snapshotTypeLabel(snapshot.type)}
          </span>
          {isHead && (
            <span style={{
              fontSize: '9px',
              fontWeight: 600,
              padding: '0 4px',
              borderRadius: '3px',
              backgroundColor: 'var(--accent)',
              color: 'var(--bg)',
            }}>
              HEAD
            </span>
          )}
          {isCompareFrom && (
            <span style={{ fontSize: '9px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', backgroundColor: '#d29922', color: '#000' }}>FROM</span>
          )}
          {isCompareTo && (
            <span style={{ fontSize: '9px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', backgroundColor: '#a371f7', color: '#000' }}>TO</span>
          )}
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {snapshot.sessionLabel || `Session ${snapshot.sessionId.slice(0, 8)}`}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '10px', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{truncateHash(snapshot.commitHash)}</span>
          <span>{formatTimestamp(snapshot.timestamp)}</span>
          {snapshot.fileCount !== undefined && snapshot.fileCount > 0 && (
            <span>{snapshot.fileCount} file{snapshot.fileCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Confirmation Dialog ──────────────────────────────────────────────────────

interface ConfirmDialogProps {
  snapshot: WorkspaceSnapshot;
  dirtyCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ snapshot, dirtyCount, onConfirm, onCancel }: ConfirmDialogProps): React.ReactElement {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        padding: '20px',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)', fontWeight: 600 }}>
          Restore Workspace State
        </h3>
        <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          This will restore the workspace to commit{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: '11px' }}>
            {truncateHash(snapshot.commitHash)}
          </code>
          {' '}({snapshotTypeLabel(snapshot.type)}).
        </p>
        {dirtyCount > 0 && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '4px',
            backgroundColor: 'rgba(210, 153, 34, 0.1)',
            border: '1px solid rgba(210, 153, 34, 0.3)',
            fontSize: '11px',
            color: '#d29922',
            marginBottom: '12px',
            lineHeight: '1.5',
          }}>
            You have {dirtyCount} uncommitted change{dirtyCount !== 1 ? 's' : ''}. They will be stashed before restoring.
            You can recover them later with <code style={{ fontFamily: 'var(--font-mono)' }}>git stash pop</code>.
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              border: 'none',
              background: '#f85149',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: 'var(--font-ui)',
            }}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export interface TimeTravelPanelProps {
  snapshots: WorkspaceSnapshot[];
  onCreateSnapshot: (label?: string) => Promise<WorkspaceSnapshot | null>;
  onRefreshSnapshots: () => Promise<void>;
  onClose: () => void;
}

export function TimeTravelPanel({
  snapshots,
  onCreateSnapshot,
  onRefreshSnapshots,
  onClose,
}: TimeTravelPanelProps): React.ReactElement {
  const { projectRoot } = useProject();

  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId, setCompareToId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [currentHead, setCurrentHead] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<WorkspaceSnapshot | null>(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sorted by timestamp descending (newest first)
  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) => b.timestamp - a.timestamp);
  }, [snapshots]);

  const selectedSnapshot = useMemo(() => {
    return sortedSnapshots.find((s) => s.id === selectedId) ?? null;
  }, [sortedSnapshots, selectedId]);

  // Fetch current HEAD on mount
  useEffect(() => {
    if (!projectRoot) return;
    void window.electronAPI.git.snapshot(projectRoot).then((r) => {
      if (r.success && r.commitHash) setCurrentHead(r.commitHash);
    }).catch(() => {});
  }, [projectRoot]);

  // Load changed files when a snapshot is selected (diff between it and the previous)
  useEffect(() => {
    if (!projectRoot || !selectedSnapshot) {
      setChangedFiles([]);
      return;
    }

    if (compareMode && compareFromId && compareToId) {
      // Compare mode: diff between the two selected snapshots
      const from = sortedSnapshots.find((s) => s.id === compareFromId);
      const to = sortedSnapshots.find((s) => s.id === compareToId);
      if (!from || !to) return;

      setLoadingFiles(true);
      void window.electronAPI.git.changedFilesBetween(projectRoot, from.commitHash, to.commitHash)
        .then((r) => {
          if (r.success && r.files) setChangedFiles(r.files);
          else setChangedFiles([]);
        })
        .catch(() => setChangedFiles([]))
        .finally(() => setLoadingFiles(false));
      return;
    }

    // Single selection: diff between this snapshot and the previous one
    const idx = sortedSnapshots.findIndex((s) => s.id === selectedId);
    const prevSnapshot = idx < sortedSnapshots.length - 1 ? sortedSnapshots[idx + 1] : null;
    if (!prevSnapshot) {
      setChangedFiles([]);
      return;
    }

    setLoadingFiles(true);
    void window.electronAPI.git.changedFilesBetween(projectRoot, prevSnapshot.commitHash, selectedSnapshot.commitHash)
      .then((r) => {
        if (r.success && r.files) setChangedFiles(r.files);
        else setChangedFiles([]);
      })
      .catch(() => setChangedFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [projectRoot, selectedId, selectedSnapshot, compareMode, compareFromId, compareToId, sortedSnapshots]);

  // Handle snapshot click
  const handleSnapshotClick = useCallback((snapshot: WorkspaceSnapshot) => {
    if (compareMode) {
      // In compare mode: first click = from, second click = to
      if (!compareFromId) {
        setCompareFromId(snapshot.id);
      } else if (!compareToId && snapshot.id !== compareFromId) {
        setCompareToId(snapshot.id);
      } else {
        // Reset compare selection
        setCompareFromId(snapshot.id);
        setCompareToId(null);
      }
      setSelectedId(snapshot.id);
    } else {
      setSelectedId(snapshot.id === selectedId ? null : snapshot.id);
    }
  }, [compareMode, compareFromId, compareToId, selectedId]);

  // Toggle compare mode
  const toggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        // Entering compare mode - reset compare selection
        setCompareFromId(null);
        setCompareToId(null);
        return true;
      }
      // Exiting compare mode
      setCompareFromId(null);
      setCompareToId(null);
      return false;
    });
  }, []);

  // Initiate restore
  const handleRestoreClick = useCallback(async (snapshot: WorkspaceSnapshot) => {
    if (!projectRoot) return;
    try {
      const r = await window.electronAPI.git.dirtyCount(projectRoot);
      setDirtyCount(r.success ? r.count : 0);
    } catch {
      setDirtyCount(0);
    }
    setConfirmRestore(snapshot);
  }, [projectRoot]);

  // Execute restore
  const handleConfirmRestore = useCallback(async () => {
    if (!projectRoot || !confirmRestore) return;
    setRestoring(true);
    try {
      const r = await window.electronAPI.git.restoreSnapshot(projectRoot, confirmRestore.commitHash);
      if (r.success) {
        const parts: string[] = [];
        if (r.branch) {
          parts.push(`Restored to branch ${r.branch}`);
        } else {
          parts.push(`Restored to ${truncateHash(confirmRestore.commitHash)}`);
        }
        if (r.previousBranch) {
          parts.push(`Previous branch: ${r.previousBranch}`);
        }
        if (r.stashRef) {
          parts.push(`Changes stashed as ${r.stashRef}`);
        }
        setStatusMessage(parts.join('. ') + '.');
        // Update HEAD
        setCurrentHead(confirmRestore.commitHash);
      } else {
        setStatusMessage(`Restore failed: ${r.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
    }
  }, [projectRoot, confirmRestore]);

  // Create manual snapshot
  const handleCreateSnapshot = useCallback(async () => {
    setCreatingSnapshot(true);
    try {
      const snapshot = await onCreateSnapshot(snapshotLabel || undefined);
      if (snapshot) {
        setStatusMessage(`Snapshot created: ${truncateHash(snapshot.commitHash)}`);
        setSnapshotLabel('');
        await onRefreshSnapshots();
        // Update HEAD
        setCurrentHead(snapshot.commitHash);
      } else {
        setStatusMessage('Failed to create snapshot.');
      }
    } finally {
      setCreatingSnapshot(false);
    }
  }, [onCreateSnapshot, onRefreshSnapshots, snapshotLabel]);

  // Clear status message after a few seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font-ui)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6.5" />
          <polyline points="8,4 8,8 11,10" />
        </svg>
        <span style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>Time Travel</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {sortedSnapshots.length} snapshot{sortedSnapshots.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.backgroundColor = 'rgba(128,128,128,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button
          onClick={toggleCompareMode}
          title={compareMode ? 'Exit compare mode' : 'Compare two snapshots'}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: compareMode ? 'rgba(88, 166, 255, 0.12)' : 'transparent',
            color: compareMode ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-ui)',
            fontWeight: compareMode ? 600 : 400,
          }}
        >
          {compareMode ? 'Exit Compare' : 'Compare'}
        </button>
        <button
          onClick={() => void onRefreshSnapshots()}
          title="Refresh snapshots"
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Refresh
        </button>
        {compareMode && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {!compareFromId ? 'Select FROM snapshot' : !compareToId ? 'Select TO snapshot' : 'Comparing'}
          </span>
        )}
      </div>

      {/* Create Snapshot */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <input
          type="text"
          placeholder="Snapshot label (optional)"
          value={snapshotLabel}
          onChange={(e) => setSnapshotLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateSnapshot(); }}
          style={{
            flex: 1,
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '11px',
            fontFamily: 'var(--font-ui)',
            outline: 'none',
          }}
        />
        <button
          onClick={() => void handleCreateSnapshot()}
          disabled={creatingSnapshot}
          title="Create a manual snapshot of the current state"
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--bg)',
            cursor: creatingSnapshot ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            opacity: creatingSnapshot ? 0.6 : 1,
          }}
        >
          {creatingSnapshot ? 'Creating...' : 'Snapshot'}
        </button>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div style={{
          padding: '6px 14px',
          fontSize: '11px',
          color: statusMessage.includes('failed') || statusMessage.includes('Failed') ? '#f85149' : '#3fb950',
          backgroundColor: statusMessage.includes('failed') || statusMessage.includes('Failed')
            ? 'rgba(248, 81, 73, 0.08)'
            : 'rgba(63, 185, 80, 0.08)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {statusMessage}
        </div>
      )}

      {/* Main content area: timeline + detail side-by-side */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Timeline */}
        <div style={{
          width: selectedSnapshot || (compareMode && compareFromId && compareToId) ? '55%' : '100%',
          overflowY: 'auto',
          borderRight: selectedSnapshot || (compareMode && compareFromId && compareToId) ? '1px solid var(--border)' : 'none',
          transition: 'width 200ms',
        }}>
          {sortedSnapshots.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              textAlign: 'center',
              gap: '8px',
            }}>
              <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                <circle cx="8" cy="8" r="6.5" />
                <polyline points="8,4 8,8 11,10" />
              </svg>
              <span>No snapshots yet.</span>
              <span style={{ fontSize: '11px' }}>Snapshots are created automatically when agent sessions start and end.</span>
            </div>
          ) : (
            sortedSnapshots.map((snapshot) => (
              <SnapshotNode
                key={snapshot.id}
                snapshot={snapshot}
                isSelected={selectedId === snapshot.id}
                isCompareFrom={compareFromId === snapshot.id}
                isCompareTo={compareToId === snapshot.id}
                isHead={currentHead === snapshot.commitHash}
                onClick={() => handleSnapshotClick(snapshot)}
              />
            ))
          )}
        </div>

        {/* Detail pane */}
        {(selectedSnapshot || (compareMode && compareFromId && compareToId)) && (
          <div style={{
            width: '45%',
            overflowY: 'auto',
            padding: '12px',
          }}>
            {/* Snapshot detail header */}
            {selectedSnapshot && !compareMode && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    {snapshotTypeLabel(selectedSnapshot.type)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    {selectedSnapshot.sessionLabel || `Session ${selectedSnapshot.sessionId.slice(0, 8)}`}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedSnapshot.commitHash}
                    </span>
                    <span>{formatFullDate(selectedSnapshot.timestamp)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void handleRestoreClick(selectedSnapshot)}
                    disabled={restoring || currentHead === selectedSnapshot.commitHash}
                    title={currentHead === selectedSnapshot.commitHash ? 'Already at this commit' : 'Restore workspace to this snapshot'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      background: currentHead === selectedSnapshot.commitHash ? 'var(--bg-tertiary)' : '#f85149',
                      color: currentHead === selectedSnapshot.commitHash ? 'var(--text-muted)' : '#fff',
                      cursor: currentHead === selectedSnapshot.commitHash ? 'default' : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-ui)',
                      opacity: restoring ? 0.6 : 1,
                    }}
                  >
                    {restoring ? 'Restoring...' : currentHead === selectedSnapshot.commitHash ? 'Current' : 'Restore'}
                  </button>
                </div>
              </>
            )}

            {/* Compare mode header */}
            {compareMode && compareFromId && compareToId && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Comparison</div>
                <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                  <span style={{ padding: '1px 4px', borderRadius: '3px', backgroundColor: '#d29922', color: '#000', fontSize: '9px', fontWeight: 600 }}>FROM</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {truncateHash(sortedSnapshots.find((s) => s.id === compareFromId)?.commitHash ?? '')}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                  <span style={{ padding: '1px 4px', borderRadius: '3px', backgroundColor: '#a371f7', color: '#000', fontSize: '9px', fontWeight: 600 }}>TO</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {truncateHash(sortedSnapshots.find((s) => s.id === compareToId)?.commitHash ?? '')}
                  </span>
                </div>
              </div>
            )}

            {/* Changed files list */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Changed Files {changedFiles.length > 0 ? `(${changedFiles.length})` : ''}
            </div>

            {loadingFiles ? (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>Loading...</div>
            ) : changedFiles.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>No file changes detected.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {changedFiles.map((file) => (
                  <div
                    key={file.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 6px',
                      borderRadius: '3px',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: statusColor(file.status),
                      width: '12px',
                      textAlign: 'center',
                      flexShrink: 0,
                    }}>
                      {statusIcon(file.status)}
                    </span>
                    <span style={{
                      flex: 1,
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-secondary)',
                    }}>
                      {file.path}
                    </span>
                    <span style={{ fontSize: '10px', color: '#3fb950', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {file.additions > 0 ? `+${file.additions}` : ''}
                    </span>
                    <span style={{ fontSize: '10px', color: '#f85149', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {file.deletions > 0 ? `-${file.deletions}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmRestore && (
        <ConfirmDialog
          snapshot={confirmRestore}
          dirtyCount={dirtyCount}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </div>
  );
}
