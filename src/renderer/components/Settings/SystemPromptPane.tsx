/**
 * SystemPromptPane.tsx — Settings → System Prompt (read-only) orchestrator.
 *
 * Wave 37 Phase A. Composes the session picker and prompt viewer.
 * No config draft needed — this pane is purely observational.
 * Uses design tokens only — no hardcoded colors.
 */

import React, { useCallback, useEffect, useState } from 'react';

import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
} from './claudeSectionContentStyles';
import { SectionLabel } from './settingsStyles';
import { SystemPromptSessionPicker } from './SystemPromptSessionPicker';
import { SystemPromptViewer } from './SystemPromptViewer';

// ── Types ─────────────────────────────────────────────────────────────────────

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'captured'; text: string; capturedAt: number }
  | { status: 'not-yet-captured' }
  | { status: 'unavailable'; reason: string };

// ── Styles ────────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = { marginTop: '16px' };

const statusStyle: React.CSSProperties = {
  marginTop: '12px',
  fontSize: '13px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusMessage({ state }: { state: FetchState }): React.ReactElement | null {
  if (state.status === 'loading') return <p style={statusStyle}>Loading&hellip;</p>;
  if (state.status === 'not-yet-captured') {
    return <p style={statusStyle}>Send a message in this session to populate.</p>;
  }
  if (state.status === 'unavailable') {
    return <p style={statusStyle}>System prompt unavailable ({state.reason}).</p>;
  }
  return null;
}

function PaneHeader(): React.ReactElement {
  return (
    <div>
      <SectionLabel>System Prompt (read-only)</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
        The resolved system prompt that Claude Code is using for the selected session.
        Captured from the first stream-json event of the session.
      </p>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useSystemPromptFetch(): {
  fetchState: FetchState;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
} {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' });

  const fetchPrompt = useCallback(async (sessionId: string) => {
    setFetchState({ status: 'loading' });
    try {
      const result = await window.electronAPI.sessions.getSystemPrompt(sessionId);
      if (result.success) {
        setFetchState({ status: 'captured', text: result.text, capturedAt: result.capturedAt });
      } else if (result.reason === 'not-yet-captured') {
        setFetchState({ status: 'not-yet-captured' });
      } else {
        setFetchState({ status: 'unavailable', reason: result.reason });
      }
    } catch {
      setFetchState({ status: 'unavailable', reason: 'fetch error' });
    }
  }, []);

  useEffect(() => {
    if (selectedId) void fetchPrompt(selectedId);
    else setFetchState({ status: 'idle' });
  }, [selectedId, fetchPrompt]);

  return { fetchState, selectedId, setSelectedId };
}

// ── SystemPromptPane ──────────────────────────────────────────────────────────

export function SystemPromptPane(): React.ReactElement {
  const { fetchState, selectedId, setSelectedId } = useSystemPromptFetch();

  return (
    <div style={claudeSectionRootStyle}>
      <PaneHeader />
      <div style={bodyStyle}>
        <SystemPromptSessionPicker onSelect={setSelectedId} selectedId={selectedId} />
        <StatusMessage state={fetchState} />
        {fetchState.status === 'captured' && (
          <SystemPromptViewer capturedAt={fetchState.capturedAt} text={fetchState.text} />
        )}
      </div>
    </div>
  );
}
