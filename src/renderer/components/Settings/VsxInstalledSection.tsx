/**
 * VsxInstalledSection.tsx — Shows VSX extensions installed via the Extension Store
 * in the Extensions settings tab. Bridges the store↔settings gap.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { VSX_EXTENSIONS_CHANGED_EVENT } from '../../hooks/appEventNames';
import { EXTENSION_THEMES_CHANGED_EVENT } from '../../hooks/useExtensionThemes';
import type { InstalledVsxExtension } from '../../types/electron';
import { SectionLabel, smallButtonStyle } from './settingsStyles';

export function VsxInstalledSection(): React.ReactElement {
  const { extensions, disabledIds, loading, refresh, toggleEnabled, uninstall } = useVsxInstalled();

  return (
    <section>
      <SectionLabel>Store Extensions</SectionLabel>
      <VsxBody
        extensions={extensions}
        disabledIds={disabledIds}
        loading={loading}
        onToggle={toggleEnabled}
        onUninstall={uninstall}
        onRefresh={refresh}
      />
    </section>
  );
}

interface VsxBodyProps {
  extensions: InstalledVsxExtension[];
  disabledIds: Set<string>;
  loading: boolean;
  onToggle: (id: string) => void;
  onUninstall: (id: string) => void;
  onRefresh: () => void;
}

function VsxBody({ extensions, disabledIds, loading, onToggle, onUninstall, onRefresh }: VsxBodyProps): React.ReactElement {
  if (loading) return <p className="text-text-semantic-muted" style={mutedStyle}>Loading store extensions...</p>;
  if (extensions.length === 0) return <div className="text-text-semantic-muted" style={emptyStyle}>No store extensions installed.</div>;

  return (
    <div style={listStyle}>
      {extensions.map((ext, idx) => (
        <VsxRow key={ext.id} ext={ext} isDisabled={disabledIds.has(ext.id)} isLast={idx === extensions.length - 1} onToggle={onToggle} onUninstall={onUninstall} />
      ))}
      <div style={footerStyle}>
        <button onClick={onRefresh} className="text-text-semantic-primary" style={smallButtonStyle}>Refresh</button>
      </div>
    </div>
  );
}

function VsxRow({ ext, isDisabled, isLast, onToggle, onUninstall }: {
  ext: InstalledVsxExtension; isDisabled: boolean; isLast: boolean;
  onToggle: (id: string) => void; onUninstall: (id: string) => void;
}): React.ReactElement {
  const contributions = summarizeContributions(ext);

  return (
    <div style={rowStyle(isLast)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameRowStyle}>
          <span className="text-text-semantic-primary" style={nameStyle}>{ext.displayName || ext.name}</span>
          <span className="text-text-semantic-muted" style={versionStyle}>v{ext.version}</span>
          {isDisabled && <span style={disabledBadge}>Disabled</span>}
        </div>
        {ext.description && <div className="text-text-semantic-muted" style={descStyle}>{ext.description}</div>}
        {contributions && <div className="text-text-semantic-muted" style={contribStyle}>{contributions}</div>}
      </div>
      <div style={controlsStyle}>
        <button onClick={() => onToggle(ext.id)} style={smallButtonStyle}>{isDisabled ? 'Enable' : 'Disable'}</button>
        <button onClick={() => onUninstall(ext.id)} className="text-status-error" style={smallButtonStyle}>Uninstall</button>
      </div>
    </div>
  );
}

function summarizeContributions(ext: InstalledVsxExtension): string {
  const parts: string[] = [];
  if (ext.contributes.themes?.length) parts.push(`${ext.contributes.themes.length} theme${ext.contributes.themes.length > 1 ? 's' : ''}`);
  if (ext.contributes.grammars?.length) parts.push(`${ext.contributes.grammars.length} grammar${ext.contributes.grammars.length > 1 ? 's' : ''}`);
  if (ext.contributes.snippets?.length) parts.push(`${ext.contributes.snippets.length} snippet${ext.contributes.snippets.length > 1 ? 's' : ''}`);
  if (ext.contributes.languages?.length) parts.push(`${ext.contributes.languages.length} language${ext.contributes.languages.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ── Hook ─────────────────────────────────────────────────────────────────

function useVsxInstalled(): {
  extensions: InstalledVsxExtension[];
  disabledIds: Set<string>;
  loading: boolean;
  refresh: () => void;
  toggleEnabled: (id: string) => void;
  uninstall: (id: string) => void;
} {
  const [extensions, setExtensions] = useState<InstalledVsxExtension[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!window.electronAPI?.extensionStore) return;
    setLoading(true);
    void (async () => {
      try {
        const result = await window.electronAPI.extensionStore.getInstalled();
        if (result.success && result.extensions) setExtensions(result.extensions);
        // Load disabled IDs from config
        const disabled = await window.electronAPI.config.get('disabledVsxExtensions');
        if (Array.isArray(disabled)) setDisabledIds(new Set(disabled as string[]));
      } catch { /* non-critical */ }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh when store installs/uninstalls/toggles
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(VSX_EXTENSIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(VSX_EXTENSIONS_CHANGED_EVENT, handler);
  }, [refresh]);

  const toggleEnabled = useCallback((id: string) => {
    if (!window.electronAPI?.extensionStore) return;
    const isDisabled = disabledIds.has(id);
    void (async () => {
      const result = isDisabled
        ? await window.electronAPI.extensionStore.enableContributions(id)
        : await window.electronAPI.extensionStore.disableContributions(id);
      if (result.success) {
        setDisabledIds((prev) => {
          const next = new Set(prev);
          if (isDisabled) next.delete(id); else next.add(id);
          return next;
        });
        window.dispatchEvent(new CustomEvent(EXTENSION_THEMES_CHANGED_EVENT));
      }
    })();
  }, [disabledIds]);

  const uninstall = useCallback((id: string) => {
    if (!window.electronAPI?.extensionStore) return;
    void (async () => {
      const result = await window.electronAPI.extensionStore.uninstall(id);
      if (result.success) {
        setExtensions((prev) => prev.filter((e) => e.id !== id));
        setDisabledIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        window.dispatchEvent(new CustomEvent(EXTENSION_THEMES_CHANGED_EVENT));
      }
    })();
  }, []);

  return { extensions, disabledIds, loading, refresh, toggleEnabled, uninstall };
}

// ── Styles ───────────────────────────────────────────────────────────────

const mutedStyle: React.CSSProperties = { fontSize: '12px' };

const emptyStyle: React.CSSProperties = {
  padding: '16px', borderRadius: '6px', border: '1px dashed var(--border)',
  background: 'var(--bg-tertiary)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center',
};

const listStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden',
};

const footerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', padding: '6px 10px',
  borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)',
};

function rowStyle(isLast: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', gap: '12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  };
}

const nameRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const nameStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600 };
const versionStyle: React.CSSProperties = { fontSize: '11px' };
const descStyle: React.CSSProperties = { fontSize: '11px', marginTop: '2px', lineHeight: 1.4 };
const contribStyle: React.CSSProperties = { fontSize: '10px', marginTop: '3px', fontStyle: 'italic' };
const controlsStyle: React.CSSProperties = { display: 'flex', gap: '6px', flexShrink: 0 };

const disabledBadge: React.CSSProperties = {
  fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
  background: 'color-mix(in srgb, var(--text-muted) 20%, var(--bg-tertiary))',
  color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase',
};
