/**
 * GeneralSemanticSearchSubsection.tsx — Semantic search settings.
 *
 * Toggle embedding-based codebase search and view index status.
 * Placed in GeneralSection after LspSubsection.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

interface IndexStatus {
  totalChunks: number;
  totalFiles: number;
  lastIndexedAt: number;
}

function useSemanticSearchState(enabled: boolean) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const fetchStatus = useCallback(() => {
    window.electronAPI?.embedding?.getStatus?.('')
      .then((r) => { if (r.success && r.status) setStatus(r.status); })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    if (!enabled) { setStatus(null); return; }
    fetchStatus();
  }, [enabled, fetchStatus]);

  const handleReindex = useCallback(() => {
    setReindexing(true);
    window.electronAPI?.embedding?.reindex?.('')
      .then(() => fetchStatus())
      .finally(() => setReindexing(false));
  }, [fetchStatus]);

  return { status, reindexing, handleReindex };
}

function SemanticToggle({ enabled, onChange }: {
  enabled: boolean; onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div style={toggleRowStyle}>
      <div style={{ flex: 1 }}>
        <label className="text-text-semantic-primary" style={labelStyle}>Enable Semantic Search</label>
        <p className="text-text-semantic-faint" style={hintStyle}>Builds a vector index of your code.</p>
      </div>
      <ToggleSwitch label="Enable Semantic Search" checked={enabled} onChange={onChange} />
    </div>
  );
}

function ProviderDropdown({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={toggleRowStyle}>
      <div style={{ flex: 1 }}>
        <label className="text-text-semantic-primary" style={labelStyle}>Provider</label>
        <p className="text-text-semantic-faint" style={hintStyle}>
          Local: free, private, on-device. Voyage: cloud, higher quality, requires API key.
        </p>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="local">Local (Xenova)</option>
        <option value="voyage">Voyage AI</option>
      </select>
    </div>
  );
}

function VoyageKeyInput({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label className="text-text-semantic-primary" style={labelStyle}>Voyage API Key</label>
      <p className="text-text-semantic-faint" style={hintStyle}>
        Get one at voyageai.com. Stored locally in config.
      </p>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="pa-..." style={inputStyle} />
    </div>
  );
}

export function SemanticSearchSubsection({ draft, onChange }: Props): React.ReactElement {
  const enabled = draft.embeddingsEnabled === true;
  const providerValue = draft.embeddingProvider ?? 'local';
  const voyageKey = draft.voyageApiKey ?? '';
  const { status, reindexing, handleReindex } = useSemanticSearchState(enabled);
  return (
    <section style={{ marginTop: '24px' }}>
      <SectionLabel>Semantic Search</SectionLabel>
      <p className="text-text-semantic-muted" style={descStyle}>
        Index your codebase for semantic search. Powers @codebase mentions in chat.
      </p>
      <SemanticToggle enabled={enabled}
        onChange={(v) => onChange('embeddingsEnabled', v)} />
      {enabled && <ProviderDropdown value={providerValue}
        onChange={(v) => onChange('embeddingProvider', v as 'local' | 'voyage')} />}
      {enabled && providerValue === 'voyage' && <VoyageKeyInput value={voyageKey}
        onChange={(v) => onChange('voyageApiKey', v)} />}
      {enabled && status && <StatusDisplay status={status} />}
      {enabled && <ReindexButton reindexing={reindexing} onClick={handleReindex} />}
    </section>
  );
}

function StatusDisplay({ status }: { status: IndexStatus }): React.ReactElement {
  const lastStr = status.lastIndexedAt
    ? new Date(status.lastIndexedAt).toLocaleTimeString()
    : 'never';
  return (
    <div className="text-text-semantic-muted" style={statusStyle}>
      {status.totalChunks} chunks from {status.totalFiles} files — last indexed {lastStr}
    </div>
  );
}

function ReindexButton({ reindexing, onClick }: {
  reindexing: boolean; onClick: () => void;
}): React.ReactElement {
  return (
    <button type="button" className="text-text-semantic-primary"
      style={reindexBtnStyle} disabled={reindexing} onClick={onClick}>
      {reindexing ? 'Reindexing...' : 'Reindex Now'}
    </button>
  );
}

const descStyle: React.CSSProperties = { fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 };
const toggleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' };
const labelStyle: React.CSSProperties = { fontSize: '13px', display: 'block' };
const hintStyle: React.CSSProperties = { fontSize: '11px', margin: '2px 0 0' };
const statusStyle: React.CSSProperties = { fontSize: '11px', marginBottom: '12px' };
const reindexBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
  border: '1px solid var(--border-default)', background: 'var(--surface-raised)',
};
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '6px', fontSize: '12px',
  border: '1px solid var(--border-default)', background: 'var(--surface-raised)',
  color: 'var(--text-default)', minWidth: '160px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '12px',
  border: '1px solid var(--border-default)', background: 'var(--surface-raised)',
  color: 'var(--text-default)', fontFamily: 'var(--font-mono)',
  marginTop: '4px', boxSizing: 'border-box',
};
