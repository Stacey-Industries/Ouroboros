import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { SETTINGS_ENTRIES, type SettingsEntry } from './settingsEntries';

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'general' | 'appearance' | 'fonts' | 'terminal' | 'keybindings' | 'hooks' | 'profiles' | 'files' | 'extensions';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'keybindings', label: 'Keybindings' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'files', label: 'Files' },
  { id: 'extensions', label: 'Extensions' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabId | string;
}

// ─── Search helpers ───────────────────────────────────────────────────────────

interface SearchMatch {
  entry: SettingsEntry;
  /** Regions of the label that matched (for highlight) */
  labelRanges: Array<[number, number]>;
}

function searchEntries(query: string): SearchMatch[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return SETTINGS_ENTRIES.flatMap((entry): SearchMatch[] => {
    const label = entry.label.toLowerCase();
    const desc = (entry.description ?? '').toLowerCase();

    // Check if query appears in label or description
    if (!label.includes(q) && !desc.includes(q)) return [];

    // Find all non-overlapping occurrences in the label for highlighting
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

function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<[number, number]>;
}): React.ReactElement {
  if (ranges.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (pos < start) {
      parts.push(<span key={pos}>{text.slice(pos, start)}</span>);
    }
    parts.push(
      <mark
        key={start}
        style={{
          background: 'color-mix(in srgb, var(--accent) 30%, transparent)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) {
    parts.push(<span key={pos}>{text.slice(pos)}</span>);
  }

  return <>{parts}</>;
}

// ─── SettingsModal ────────────────────────────────────────────────────────────

export function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'general',
}: SettingsModalProps): React.ReactElement | null {
  // Narrow the incoming string to a valid TabId, falling back to 'general'
  const resolvedInitialTab: TabId = (TABS.some((t) => t.id === initialTab)
    ? initialTab
    : 'general') as TabId;
  const { config, set } = useConfig();
  const { setTheme, setShowBgGradient } = useTheme();

  // Local draft — copy of config that we edit without persisting until Save
  const [draft, setDraft] = useState<AppConfig | null>(null);
  // The theme / gradient state when the modal opened (to revert on cancel)
  const originalThemeRef = useRef<string | null>(null);
  const originalGradientRef = useRef<boolean>(true);

  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResults = searchEntries(searchQuery);
  const isSearching = searchQuery.trim().length > 0;

  // Animation state
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // ── Open / close animation ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      // Snapshot current config into draft
      if (config) {
        setDraft({ ...config });
        originalThemeRef.current = config.activeTheme;
        originalGradientRef.current = config.showBgGradient ?? true;
      }
      setActiveTab(resolvedInitialTab);
      setSaveError(null);
      setSearchQuery('');
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsMounted(false), 200);
      return () => clearTimeout(timer);
    }
  // resolvedInitialTab is derived from initialTab; depend on initialTab so it re-runs on prop change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, config, initialTab]);

  // ── External settings.json change ─────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const cleanup = window.electronAPI.config.onExternalChange((updatedConfig) => {
      setDraft({ ...updatedConfig });
    });

    return cleanup;
  }, [isOpen]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent): void {
      // If not searching and the user presses a printable char or Ctrl+F, focus search
      if (!isSearching && e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSearching) {
          setSearchQuery('');
        } else {
          handleCancel();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSearching]);

  // ── Draft change handler ───────────────────────────────────────────────────

  const handleChange = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
      // Live-preview gradient toggle without waiting for Save
      if (key === 'showBgGradient') {
        setShowBgGradient(value as boolean);
      }
    },
    [setShowBgGradient],
  );

  // ── Import reload ─────────────────────────────────────────────────────────

  const handleImport = useCallback((imported: AppConfig): void => {
    setDraft({ ...imported });
  }, []);

  // ── Theme preview ──────────────────────────────────────────────────────────

  const handlePreviewTheme = useCallback(
    (themeId: string): void => {
      void setTheme(themeId);
    },
    [setTheme],
  );

  // ── Cancel ────────────────────────────────────────────────────────────────

  function handleCancel(): void {
    // Revert theme and gradient preview to original
    if (originalThemeRef.current) {
      void setTheme(originalThemeRef.current);
    }
    setShowBgGradient(originalGradientRef.current);
    onClose();
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    if (!draft) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const keys = Object.keys(draft) as (keyof AppConfig)[];
      await Promise.all(
        keys.map((key) => set(key, draft[key] as AppConfig[typeof key])),
      );
      // Persist the previewed theme and gradient properly
      if (draft.activeTheme) {
        await setTheme(draft.activeTheme);
      }
      setShowBgGradient(draft.showBgGradient ?? true);
      originalThemeRef.current = draft.activeTheme ?? null;
      originalGradientRef.current = draft.showBgGradient ?? true;

      // Apply font config immediately
      applyFontConfig(draft.fontUI ?? '', draft.fontMono ?? '', draft.fontSizeUI ?? 13);

      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Click outside ─────────────────────────────────────────────────────────

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }

  // ── Navigate to section from search ───────────────────────────────────────

  function handleSearchResultClick(entry: SettingsEntry): void {
    setSearchQuery('');
    setActiveTab(entry.section as TabId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isMounted || !draft) return null;

  const modal = (
    <>
      <style>{KEYFRAMES}</style>

      {/* Overlay */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(2px)',
          padding: '24px',
          animation: isVisible ? 'settings-overlay-in 180ms ease forwards' : 'settings-overlay-out 180ms ease forwards',
        }}
      >
        {/* Dialog card */}
        <div
          role="document"
          style={{
            width: '100%',
            maxWidth: '680px',
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '10px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            animation: isVisible ? 'settings-card-in 180ms ease forwards' : 'settings-card-out 180ms ease forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              Settings
            </h2>
            <button
              onClick={handleCancel}
              aria-label="Close settings"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Search input */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--bg-secondary)',
            }}
          >
            <div style={{ position: 'relative' }}>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                  lineHeight: 1,
                }}
              >
                ⌕
              </span>
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Search settings…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search settings"
                style={{
                  width: '100%',
                  padding: '7px 32px 7px 30px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-ui)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '2px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Tabs — hidden while searching */}
          {!isSearching && (
            <div
              role="tablist"
              aria-label="Settings sections"
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border)',
                padding: '0 12px',
                flexShrink: 0,
                background: 'var(--bg-secondary)',
                overflowX: 'auto',
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`settings-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '10px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                    color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: '13px',
                    fontWeight: activeTab === tab.id ? 500 : 400,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginBottom: '-1px',
                    transition: 'color 150ms ease, border-color 150ms ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Search results panel */}
          {isSearching ? (
            <div
              role="listbox"
              aria-label="Search results"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
              }}
            >
              {searchResults.length === 0 ? (
                <p
                  style={{
                    margin: '32px 0',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                  }}
                >
                  No settings matching &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {searchResults.map((match, idx) => (
                    <button
                      key={idx}
                      role="option"
                      aria-selected={false}
                      onClick={() => handleSearchResultClick(match.entry)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                      }}
                    >
                      {/* Label + section badge row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--text)',
                          }}
                        >
                          <HighlightedText
                            text={match.entry.label}
                            ranges={match.labelRanges}
                          />
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {match.entry.sectionLabel}
                        </span>
                      </div>

                      {/* Description */}
                      {match.entry.description && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            lineHeight: 1.4,
                          }}
                        >
                          {match.entry.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Tab panel */
            <div
              id={`settings-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`settings-tab-${activeTab}`}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 24px',
              }}
            >
              {activeTab === 'general' && (
                <GeneralSection draft={draft} onChange={handleChange} onImport={handleImport} />
              )}
              {activeTab === 'appearance' && (
                <AppearanceSection
                  draft={draft}
                  onChange={handleChange}
                  onPreviewTheme={handlePreviewTheme}
                />
              )}
              {activeTab === 'fonts' && (
                <FontSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'terminal' && (
                <TerminalSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'keybindings' && (
                <KeybindingsSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'hooks' && (
                <HooksSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'profiles' && (
                <ProfilesSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'files' && (
                <FileFilterSection draft={draft} onChange={handleChange} />
              )}
              {activeTab === 'extensions' && (
                <ExtensionsSection />
              )}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--bg-secondary)',
            }}
          >
            {saveError && (
              <span
                role="alert"
                style={{
                  flex: 1,
                  fontSize: '12px',
                  color: 'var(--error)',
                }}
              >
                {saveError}
              </span>
            )}
            <button
              onClick={handleCancel}
              disabled={isSaving}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              style={saveButtonStyle(isSaving)}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  cursor: 'pointer',
};

function saveButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? 'var(--bg-tertiary)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--bg)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const KEYFRAMES = `
  @keyframes settings-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes settings-overlay-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
  @keyframes settings-card-in {
    from { opacity: 0; transform: scale(0.96) translateY(-8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes settings-card-out {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to   { opacity: 0; transform: scale(0.96) translateY(-8px); }
  }
`;
