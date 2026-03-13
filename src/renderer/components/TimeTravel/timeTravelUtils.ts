import type { WorkspaceSnapshot } from '../../types/electron';

export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface SnapshotSelectionState {
  selectedId: string | null;
  compareFromId: string | null;
  compareToId: string | null;
  compareMode: boolean;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function truncateHash(hash: string): string {
  return hash.slice(0, 7);
}

export function snapshotTypeLabel(type: WorkspaceSnapshot['type']): string {
  if (type === 'session-start') return 'Session Start';
  if (type === 'session-end') return 'Session End';
  if (type === 'manual') return 'Manual';
  return type;
}

export function snapshotTypeColor(type: WorkspaceSnapshot['type']): string {
  if (type === 'session-start') return 'var(--accent, #58a6ff)';
  if (type === 'session-end') return '#3fb950';
  if (type === 'manual') return 'var(--text-muted, #8b949e)';
  return 'var(--text-muted)';
}

export function statusIcon(status: string): string {
  if (status === 'added') return '+';
  if (status === 'deleted') return '-';
  if (status === 'renamed') return 'R';
  return 'M';
}

export function statusColor(status: string): string {
  if (status === 'added') return '#3fb950';
  if (status === 'deleted') return '#f85149';
  if (status === 'renamed') return '#d29922';
  return 'var(--accent, #58a6ff)';
}

export function buildRestoreStatusMessage(
  result: { branch?: string; previousBranch?: string; stashRef?: string },
  commitHash: string,
): string {
  const parts = [result.branch ? `Restored to branch ${result.branch}` : `Restored to ${truncateHash(commitHash)}`];
  if (result.previousBranch) parts.push(`Previous branch: ${result.previousBranch}`);
  if (result.stashRef) parts.push(`Changes stashed as ${result.stashRef}`);
  return `${parts.join('. ')}.`;
}

export function getNextSelectionState(
  snapshotId: string,
  state: SnapshotSelectionState,
): Omit<SnapshotSelectionState, 'compareMode'> {
  if (!state.compareMode) {
    return {
      selectedId: snapshotId === state.selectedId ? null : snapshotId,
      compareFromId: state.compareFromId,
      compareToId: state.compareToId,
    };
  }

  if (!state.compareFromId) {
    return { selectedId: snapshotId, compareFromId: snapshotId, compareToId: null };
  }

  if (!state.compareToId && snapshotId !== state.compareFromId) {
    return { selectedId: snapshotId, compareFromId: state.compareFromId, compareToId: snapshotId };
  }

  return { selectedId: snapshotId, compareFromId: snapshotId, compareToId: null };
}

export function isFailureStatusMessage(statusMessage: string): boolean {
  const normalized = statusMessage.toLowerCase();
  return normalized.includes('failed') || normalized.includes('error');
}
