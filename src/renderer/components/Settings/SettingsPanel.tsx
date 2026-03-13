/**
 * SettingsPanel.tsx — Inline settings panel for the centre pane.
 *
 * Reuses all the same section components as SettingsModal, but renders
 * directly as a page instead of a modal overlay. Includes a close button
 * that dispatches 'agent-ide:close-settings'.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { useConfig } from '../../hooks/useConfig';
import { useTheme, applyFontConfig } from '../../hooks/useTheme';
import { GeneralSection } from './GeneralSection';
import { AppearanceSection } from './AppearanceSection';
import { TerminalSection } from './TerminalSection';
import { HooksSection } from './HooksSection';
import { FontSection } from './FontSection';
import { KeybindingsSection } from './KeybindingsSection';
import { ProfilesSection } from './ProfilesSection';
import { FileFilterSection } from './FileFilterSection';
import { ExtensionsSection } from './ExtensionsSection';
import { ClaudeSection } from './ClaudeSection';
import { McpSection } from './McpSection';
import { SETTINGS_ENTRIES, type SettingsEntry } from './settingsEntries';

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'general' | 'appearance' | 'fonts' | 'terminal' | 'claude' | 'keybindings' | 'hooks' | 'profiles' | 'files' | 'extensions' | 'mcp';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'files', label: 'Files' },
  { id: 'extensions', label: 'Extensions' },
  { id: 'mcp', label: 'MCP Servers' },
];

// ─── Search helpers ───────────────────────────────────────────────────────────

interface SearchMatch {
  entry: SettingsEntry;
  labelRanges: Array<[number, number]>;
}

function searchEntries(query: string): SearchMatch[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return SETTINGS_ENTRIES.flatMap((entry): SearchMatch[] => {
    const label = entry.label.toLowerCase();
    const desc = (entry.description ?? '').toLowerCase();
    if (!label.includes(q) && !desc.includes(q)) return [];

    const labelRanges: Array<[number, number]> = [];
    let start = 0;
    while (true) {
      const idx = label.indexOf(q, start);
      if (idx === -1) break;
      labelRanges.push([idx, idx + q.length]);
      start = idx + q.length;
    }

    return [{ entry, labelRanges }];
  });
}

function HighlightedText({ text, ranges }: { text: string; ranges: Array<[number, number]> }): React.ReactElement {
  if (ranges.length === 0) return <span>{text}</span>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (pos < start) parts.push(<span key={pos}>{text.slice(pos, start)}</span>);
    parts.push(
      <mark key={start} style={{ background: 'color-mix(in srgb, var(--accent) 30%, transparent)', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  }
  if (pos < text.length) parts.push(<span key={pos}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SettingsPanelProps {
  onClose: () => void;
}

// ─── SettingsPanel ────────────────────────────────────────────────────────────

export function SettingsPanel({ onClose }: SettingsPanelProps): React.ReactElement | null {
  const { config, set } = useConfig();
  const { setTheme, setShowBgGradient } = useTheme();

  const [draft, setDraft] = useState<AppConfig | null>(null);
  const originalThemeRef = useRef<string | null>(null);
  const originalGradientRef = useRef<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResults = searchEntries(searchQuery);
  const isSearching = searchQuery.trim().length > 0;

  // Snapshot config into draft on mount and when config changes
  useEffect(() => {
    if (config) {
      setDraft({ ...config });
      originalThemeRef.current = config.activeTheme;
      originalGradientRef.current = config.showBgGradient ?? true;
    }
  }, [config]);

  // External settings.json changes
  useEffect(() => {
    const cleanup = window.electronAPI.config.onExternalChange((updatedConfig) => {
      setDraft({ ...updatedConfig });
    });
    return cleanup;
  }, []);

  const handleChange = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      if (key === 'showBgGradient') setShowBgGradient(value as boolean);
    },
    [setShowBgGradient],
  );

  const handleImport = useCallback((imported: AppConfig): void => {
    setDraft({ ...imported });
  }, []);

  const handlePreviewTheme = useCallback(
    (themeId: string): void => { void setTheme(themeId); },
    [setTheme],
  );

  function handleCancel(): void {
    if (originalThemeRef.current) void setTheme(originalThemeRef.current);
    setShowBgGradient(originalGradientRef.current);
    onClose();
  }

  async function handleSave(): Promise<void> {
    if (!draft) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const keys = Object.keys(draft) as (keyof AppConfig)[];
      await Promise.all(keys.map((key) => set(key, draft[key] as AppConfig[typeof key])));
      if (draft.activeTheme) await setTheme(draft.activeTheme);
      setShowBgGradient(draft.showBgGradient ?? true);
      originalThemeRef.current = draft.activeTheme ?? null;
      originalGradientRef.current = draft.showBgGradient ?? true;
      applyFontConfig(draft.fontUI ?? '', draft.fontMono ?? '', draft.fontSizeUI ?? 13);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleSearchResultClick(entry: SettingsEntry): void {
    setSearchQuery('');
    setActiveTab(entry.section as TabId);
  }

  if (!draft) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Settings</h2>
        <button
          onClick={handleCancel}
          aria-label="Close settings"
          style={{
            width: '28px', height: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '6px', border: 'none', background: 'transparent',
            color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
        <div style={{ position: 'relative' }}>
          <span aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none', lineHeight: 1 }}>
            ⌕
          </span>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '7px 32px 7px 30px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1, padding: '2px' }}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {!isSearching && (
        <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 12px', flexShrink: 0, background: 'var(--bg-secondary)', overflowX: 'auto' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px', background: 'none', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
                fontSize: '13px', fontWeight: activeTab === tab.id ? 500 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: '-1px',
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isSearching ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {searchResults.length === 0 ? (
            <p style={{ margin: '32px 0', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              No settings matching "{searchQuery}"
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {searchResults.map((match, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSearchResultClick(match.entry)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 14px',
                    borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                      <HighlightedText text={match.entry.label} ranges={match.labelRanges} />
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', flexShrink: 0 }}>
                      {match.entry.sectionLabel}
                    </span>
                  </div>
                  {match.entry.description && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{match.entry.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
          {activeTab === 'general' && <GeneralSection draft={draft} onChange={handleChange} onImport={handleImport} />}
          {activeTab === 'appearance' && <AppearanceSection draft={draft} onChange={handleChange} onPreviewTheme={handlePreviewTheme} />}
          {activeTab === 'fonts' && <FontSection draft={draft} onChange={handleChange} />}
          {activeTab === 'terminal' && <TerminalSection draft={draft} onChange={handleChange} />}
          {activeTab === 'claude' && <ClaudeSection draft={draft} onChange={handleChange} />}
          {activeTab === 'keybindings' && <KeybindingsSection draft={draft} onChange={handleChange} />}
          {activeTab === 'hooks' && <HooksSection draft={draft} onChange={handleChange} />}
          {activeTab === 'profiles' && <ProfilesSection draft={draft} onChange={handleChange} />}
          {activeTab === 'files' && <FileFilterSection draft={draft} onChange={handleChange} />}
          {activeTab === 'extensions' && <ExtensionsSection />}
          {activeTab === 'mcp' && <McpSection />}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--border)',
          flexShrink: 0, background: 'var(--bg-secondary)',
        }}
      >
        {saveError && <span role="alert" style={{ flex: 1, fontSize: '12px', color: 'var(--error)' }}>{saveError}</span>}
        <button
          onClick={handleCancel}
          disabled={isSaving}
          style={{
            padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none',
            background: isSaving ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: isSaving ? 'var(--text-muted)' : 'var(--bg)',
            fontSize: '13px', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
