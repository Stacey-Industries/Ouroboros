/**
 * SystemPromptSessionPicker.tsx — Session dropdown for the system-prompt pane.
 *
 * Wave 37 Phase A. Lists active PTY sessions via pty:listSessions and lets
 * the user pick one. Calls onSelect(sessionId) when selection changes.
 * Uses design tokens only — no hardcoded colors.
 */

import React, { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveSession {
  id: string;
  cwd?: string;
}

interface SystemPromptSessionPickerProps {
  selectedId: string | null;
  onSelect: (sessionId: string | null) => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '8px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '5px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
};

const refreshButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  flexShrink: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessionLabel(s: ActiveSession): string {
  if (s.cwd) {
    const parts = s.cwd.replace(/\\/g, '/').split('/');
    return `${s.id.slice(0, 8)} — ${parts[parts.length - 1] ?? s.cwd}`;
  }
  return s.id.slice(0, 8);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>No active sessions found.</span>
      <button onClick={onRefresh} style={refreshButtonStyle} type="button">
        Refresh
      </button>
    </div>
  );
}

function SessionSelect({
  sessions,
  selectedId,
  onSelect,
  onRefresh,
}: {
  sessions: ActiveSession[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
}): React.ReactElement {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    onSelect(e.target.value || null);
  }

  return (
    <div style={rowStyle}>
      <span style={labelStyle}>Session:</span>
      <select
        aria-label="Select session"
        onChange={handleChange}
        style={selectStyle}
        value={selectedId ?? ''}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>{sessionLabel(s)}</option>
        ))}
      </select>
      <button
        aria-label="Refresh session list"
        onClick={onRefresh}
        style={refreshButtonStyle}
        type="button"
      >
        ↺
      </button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SystemPromptSessionPicker({
  selectedId,
  onSelect,
}: SystemPromptSessionPickerProps): React.ReactElement {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await window.electronAPI.pty.listSessions();
      const list = Array.isArray(result) ? (result as ActiveSession[]) : [];
      setSessions(list);
      if (list.length > 0 && selectedId === null) onSelect(list[0].id);
    } catch {
      setSessions([]);
    }
  }, [selectedId, onSelect]);

  useEffect(() => { void load(); }, [load]);

  if (sessions.length === 0) {
    return <EmptyState onRefresh={() => void load()} />;
  }

  return (
    <SessionSelect
      onRefresh={() => void load()}
      onSelect={onSelect}
      selectedId={selectedId}
      sessions={sessions}
    />
  );
}
