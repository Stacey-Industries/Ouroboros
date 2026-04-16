/**
 * ApprovalMemorySection.tsx — Settings UI for reviewing and revoking remembered
 * approval decisions (Wave 26 Phase E).
 *
 * Lists all persisted allow/deny entries with a Revoke button per row.
 * Refreshes when the approval:memoryChanged push event fires.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ApprovalMemoryEntry, ApprovalMemoryStore } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

// ─── Styles ───────────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'middle',
};

const badgeBase: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
};

const allowBadgeStyle: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--status-success-subtle)',
  color: 'var(--status-success)',
};

const denyBadgeStyle: React.CSSProperties = {
  ...badgeBase,
  background: 'var(--status-error-subtle)',
  color: 'var(--status-error)',
};

const revokeBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '11px',
  cursor: 'pointer',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px',
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: '12px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-raised)',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MemoryRow({
  entry,
  decision,
  onRevoke,
}: {
  entry: ApprovalMemoryEntry;
  decision: 'allow' | 'deny';
  onRevoke: (hash: string) => void;
}): React.ReactElement {
  return (
    <tr>
      <td style={tdStyle}>
        <span style={decision === 'allow' ? allowBadgeStyle : denyBadgeStyle}>
          {decision === 'allow' ? 'Allow' : 'Deny'}
        </span>
      </td>
      <td style={tdStyle}>
        <span className="text-text-semantic-primary" style={{ fontFamily: 'var(--font-mono)' }}>
          {entry.toolName}
        </span>
      </td>
      <td style={{ ...tdStyle, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span className="text-text-semantic-muted" title={entry.keyPreview}>
          {entry.keyPreview}
        </span>
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <button
          style={revokeBtnStyle}
          onClick={() => onRevoke(entry.hash)}
          aria-label={`Revoke ${decision} rule for ${entry.toolName}: ${entry.keyPreview}`}
        >
          Revoke
        </button>
      </td>
    </tr>
  );
}

function MemoryTable({
  memory,
  onRevoke,
}: {
  memory: ApprovalMemoryStore;
  onRevoke: (hash: string) => void;
}): React.ReactElement {
  const total = memory.alwaysAllow.length + memory.alwaysDeny.length;

  if (total === 0) {
    return (
      <div style={emptyStyle}>No remembered decisions. Use Allow Always or Deny Always on a tool prompt to save one.</div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Decision</th>
            <th style={thStyle}>Tool</th>
            <th style={thStyle}>Command / Path</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {memory.alwaysAllow.map((e) => (
            <MemoryRow key={e.hash} entry={e} decision="allow" onRevoke={onRevoke} />
          ))}
          {memory.alwaysDeny.map((e) => (
            <MemoryRow key={e.hash} entry={e} decision="deny" onRevoke={onRevoke} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

const EMPTY_MEMORY: ApprovalMemoryStore = { alwaysAllow: [], alwaysDeny: [] };

/** Load the approval memory from IPC and update state. */
async function loadMemory(
  setMemory: React.Dispatch<React.SetStateAction<ApprovalMemoryStore>>,
): Promise<void> {
  const result = await window.electronAPI.approval.listMemory();
  if (result.success && result.entries) {
    setMemory(result.entries);
  }
}

export function ApprovalMemorySection(): React.ReactElement {
  const [memory, setMemory] = useState<ApprovalMemoryStore>(EMPTY_MEMORY);

  const refresh = useCallback(() => {
    void loadMemory(setMemory);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.electronAPI.approval.onMemoryChanged(refresh);
    return unsub;
  }, [refresh]);

  async function handleRevoke(hash: string): Promise<void> {
    await window.electronAPI.approval.forget(hash);
    // onMemoryChanged will fire and refresh, but also refresh immediately
    refresh();
  }

  const total = memory.alwaysAllow.length + memory.alwaysDeny.length;

  return (
    <section data-testid="approval-memory-section">
      <SectionLabel>
        Remembered Approvals
        {total > 0 && (
          <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px' }}>
            ({total})
          </span>
        )}
      </SectionLabel>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', marginBottom: '10px' }}>
        Commands and files you have chosen to always allow or always deny. Revoke an entry to prompt again on next use.
      </p>
      <MemoryTable memory={memory} onRevoke={(hash) => void handleRevoke(hash)} />
    </section>
  );
}
