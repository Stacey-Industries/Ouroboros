/**
 * ExtensionStoreSection.tsx — Settings section for browsing and installing
 * VS Code extensions (themes, grammars, snippets) from Open VSX.
 */

import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { InstalledVsxExtension } from '../../types/electron';
import { SectionLabel, buttonStyle } from './settingsStyles';
import { ExtensionStoreCard } from './ExtensionStoreCard';
import { type ExtensionStoreModel, useExtensionStoreModel } from './extensionStoreModel';

// ── Constants ────────────────────────────────────────────────────────────

const CATEGORY_FILTERS: Array<{ label: string; value: string | null }> = [
  { label: 'All', value: null },
  { label: 'Themes', value: 'Themes' },
  { label: 'Snippets', value: 'Snippets' },
  { label: 'Languages', value: 'Programming Languages' },
];

const PAGE_SIZE = 20;

// ── Main Component ───────────────────────────────────────────────────────

export function ExtensionStoreSection(): React.ReactElement {
  const model = useExtensionStoreModel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {model.error && <div role="alert" style={errorBannerStyle}>{model.error}</div>}
      <StoreHeader onRefresh={model.search} />
      <InstalledBanner model={model} />
      <SearchInput query={model.query} onChange={model.setQuery} />
      <CategoryFilter activeFilter={model.categoryFilter} onSelect={model.setCategoryFilter} />
      {model.selectedExtension ? (
        <DetailPanel model={model} />
      ) : (
        <ExtensionList model={model} />
      )}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────

function StoreHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>Extension Store</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Themes, grammars, and snippets from Open VSX
        </p>
      </div>
      <div style={{ flexShrink: 0 }}>
        <button onClick={onRefresh} style={buttonStyle}>Refresh</button>
      </div>
    </div>
  );
}

// ── Installed Extensions Banner ──────────────────────────────────────────

function InstalledBanner({ model }: { model: ExtensionStoreModel }): React.ReactElement | null {
  const installed = Array.from(model.installedMap.values());
  if (installed.length === 0) return null;

  return (
    <div style={installedBannerStyle}>
      <div style={installedBannerHeaderStyle}>
        Installed ({installed.length})
      </div>
      <div style={installedBannerBodyStyle}>
        {installed.map((ext, idx) => (
          <React.Fragment key={ext.id}>
            {idx > 0 && <span style={installedSepStyle}>{' \u00b7 '}</span>}
            <span
              role="button"
              tabIndex={0}
              onClick={() => model.selectExtension(ext.namespace, ext.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  model.selectExtension(ext.namespace, ext.name);
              }}
              style={installedNameStyle}
            >
              {ext.displayName || ext.name}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Search Input ─────────────────────────────────────────────────────────

function SearchInput({ query, onChange }: { query: string; onChange: (q: string) => void }): React.ReactElement {
  return (
    <div style={searchWrapperStyle}>
      <span style={searchIconStyle}>&#x2315;</span>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search extensions..."
        style={searchInputStyle}
      />
    </div>
  );
}

// ── Category Filter ──────────────────────────────────────────────────────

function CategoryFilter({
  activeFilter,
  onSelect,
}: {
  activeFilter: string | null;
  onSelect: (cat: string | null) => void;
}): React.ReactElement {
  return (
    <div style={categoryRowStyle}>
      {CATEGORY_FILTERS.map((cat) => {
        const isActive = cat.value === activeFilter;
        return (
          <button
            key={cat.label}
            onClick={() => onSelect(cat.value)}
            style={categoryPillStyle(isActive)}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Extension List ───────────────────────────────────────────────────────

function ExtensionList({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  if (model.loading && model.extensions.length === 0) {
    return <p style={loadingStyle}>Searching extensions...</p>;
  }

  if (model.extensions.length === 0) {
    return <div style={emptyStyle}>No extensions found.</div>;
  }

  const hasMore = model.totalSize > model.offset + PAGE_SIZE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
      <div style={listContainerStyle}>
        {model.extensions.map((ext, idx) => {
          const extId = `${ext.namespace}.${ext.name}`;
          return (
            <ExtensionStoreCard
              key={extId}
              extension={ext}
              isInstalled={model.installedMap.has(extId)}
              isDisabled={model.disabledIds.has(extId)}
              isLast={idx === model.extensions.length - 1}
              onClick={() => model.selectExtension(ext.namespace, ext.name)}
            />
          );
        })}
      </div>
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
          <button onClick={model.loadMore} style={buttonStyle}>
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────────

function DetailPanel({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  const ext = model.selectedExtension!;
  const extId = `${ext.namespace}.${ext.name}`;
  const isInstalled = model.installedMap.has(extId);
  const isDisabled = model.disabledIds.has(extId);
  const isInstalling = model.installInProgress === extId;
  const installedData = model.installedMap.get(extId);

  return (
    <div style={detailContainerStyle}>
      {/* Back button */}
      <button onClick={model.clearSelection} style={backButtonStyle}>
        &larr; Back to results
      </button>

      {/* Header with icon */}
      <div style={{ marginTop: '12px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        {ext.icon ? (
          <img src={ext.icon} alt="" style={iconStyle} />
        ) : (
          <div style={iconPlaceholderStyle}>
            {getCategoryEmoji(ext.categories)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={detailTitleRowStyle}>
            <span style={detailTitleStyle}>{ext.displayName || ext.name}</span>
            <span style={detailVersionStyle}>v{ext.version}</span>
          </div>
          <div style={publisherStyle}>{ext.namespace}</div>
          {ext.description && (
            <p style={detailDescriptionStyle}>{ext.description}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={statsRowStyle}>
        <span style={statStyle}>{formatDownloads(ext.downloads)} downloads</span>
        {ext.averageRating != null && (
          <span style={statStyle}>{'\u2605'} {ext.averageRating.toFixed(1)}</span>
        )}
      </div>

      {/* Metadata */}
      <div style={metadataContainerStyle}>
        {ext.categories && ext.categories.length > 0 && (
          <MetadataRow label="Categories" value={ext.categories.join(', ')} />
        )}
        {ext.repository && (
          <MetadataRow label="Repository">
            <a
              href={ext.repository}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI?.openExternalLink?.(ext.repository!);
              }}
            >
              {ext.repository}
            </a>
          </MetadataRow>
        )}
      </div>

      {/* Contributions summary */}
      {installedData && (
        <ContributionsSummary installed={installedData} />
      )}

      {/* Action buttons */}
      <div style={installAreaStyle}>
        {!isInstalled ? (
          <button
            onClick={() => model.install(ext.namespace, ext.name)}
            disabled={isInstalling}
            style={accentButtonStyle(isInstalling)}
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => model.toggleEnabled(extId)}
              style={buttonStyle}
            >
              {isDisabled ? 'Enable' : 'Disable'}
            </button>
            <button
              onClick={() => model.uninstall(extId)}
              style={dangerButtonStyle}
            >
              Uninstall
            </button>
          </div>
        )}
      </div>

      {/* README */}
      {ext.readme && (
        <ReadmeSection readme={ext.readme} />
      )}
    </div>
  );
}

// ── Metadata Row ─────────────────────────────────────────────────────────

function MetadataRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={metadataRowStyle}>
      <span style={metadataLabelStyle}>{label}</span>
      {children ?? <span style={metadataValueStyle}>{value}</span>}
    </div>
  );
}

// ── Contributions Summary ────────────────────────────────────────────────

function ContributionsSummary({ installed }: { installed: InstalledVsxExtension }): React.ReactElement | null {
  const { contributes } = installed;
  if (!contributes) return null;

  const items: string[] = [];
  if (contributes.themes && contributes.themes.length > 0) {
    items.push(`${contributes.themes.length} color theme${contributes.themes.length !== 1 ? 's' : ''}`);
  }
  if (contributes.grammars && contributes.grammars.length > 0) {
    items.push(`${contributes.grammars.length} grammar${contributes.grammars.length !== 1 ? 's' : ''}`);
  }
  if (contributes.snippets && contributes.snippets.length > 0) {
    items.push(`${contributes.snippets.length} snippet file${contributes.snippets.length !== 1 ? 's' : ''}`);
  }
  if (contributes.languages && contributes.languages.length > 0) {
    items.push(`${contributes.languages.length} language${contributes.languages.length !== 1 ? 's' : ''}`);
  }

  if (items.length === 0) return null;

  return (
    <div style={contributionsContainerStyle}>
      <SectionLabel style={{ marginBottom: '6px' }}>Contributions</SectionLabel>
      <div style={contributionsBodyStyle}>
        {items.map((item) => (
          <div key={item} style={contributionItemStyle}>{item}</div>
        ))}
      </div>
    </div>
  );
}

// ── README Section ───────────────────────────────────────────────────────

function ReadmeSection({ readme }: { readme: string }): React.ReactElement {
  const [readmeHtml, setReadmeHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const parsed = await marked.parse(readme);
        const sanitized = DOMPurify.sanitize(parsed);
        if (!cancelled) setReadmeHtml(sanitized);
      } catch {
        if (!cancelled) setReadmeHtml('<p>Failed to render README.</p>');
      }
    })();
    return () => { cancelled = true; };
  }, [readme]);

  if (!readmeHtml) return <></>;

  return (
    <div style={readmeContainerStyle}>
      <SectionLabel style={{ marginBottom: '8px' }}>README</SectionLabel>
      <div
        style={readmeBodyStyle}
        className="ext-store-readme"
        dangerouslySetInnerHTML={{ __html: readmeHtml }}
      />
    </div>
  );
}

// ── Utility Functions ────────────────────────────────────────────────────

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getCategoryEmoji(categories?: string[]): string {
  if (!categories || categories.length === 0) return '\u{1F4E6}'; // package
  const first = categories[0].toLowerCase();
  if (first.includes('theme')) return '\u{1F3A8}'; // palette
  if (first.includes('snippet')) return '\u{2702}'; // scissors
  if (first.includes('language') || first.includes('programming')) return '\u{1F4DD}'; // memo
  if (first.includes('linter') || first.includes('formatter')) return '\u{1F9F9}'; // broom
  return '\u{1F4E6}'; // package
}

// ── Styles ───────────────────────────────────────────────────────────────

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
  fontSize: '12px',
  color: 'var(--error)',
};

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  textAlign: 'center',
};

const loadingStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const searchWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10px',
  fontSize: '14px',
  color: 'var(--text-muted)',
  pointerEvents: 'none',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px 8px 30px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text)',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

const categoryRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
};

function categoryPillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: '12px',
    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
    color: isActive ? 'var(--bg)' : 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
  };
}

const listContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
};

const installedBannerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
};

const installedBannerHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '6px',
};

const installedBannerBodyStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text)',
  lineHeight: '1.6',
};

const installedSepStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
};

const installedNameStyle: React.CSSProperties = {
  color: 'var(--accent)',
  cursor: 'pointer',
  fontWeight: 500,
};

const detailContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const backButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 8px',
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 500,
};

const iconStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '8px',
  objectFit: 'cover',
  flexShrink: 0,
};

const iconPlaceholderStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '8px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  flexShrink: 0,
};

const detailTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: 'var(--text)',
};

const detailVersionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const publisherStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  marginTop: '2px',
};

const detailDescriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  lineHeight: '1.5',
  margin: '8px 0 0 0',
};

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  marginTop: '8px',
  paddingLeft: '62px', // align with text after icon
};

const statStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontWeight: 500,
};

const metadataContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '12px',
  padding: '10px 12px',
  borderRadius: '6px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
};

const metadataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '12px',
};

const metadataLabelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  minWidth: '80px',
  fontWeight: 500,
};

const metadataValueStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  textDecoration: 'none',
  wordBreak: 'break-all',
};

const contributionsContainerStyle: React.CSSProperties = {
  marginTop: '12px',
};

const contributionsBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
};

const contributionItemStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text)',
};

const installAreaStyle: React.CSSProperties = {
  marginTop: '16px',
};

function accentButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? 'var(--bg-tertiary)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--bg)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg))',
  color: 'var(--error)',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const readmeContainerStyle: React.CSSProperties = {
  marginTop: '16px',
};

const readmeBodyStyle: React.CSSProperties = {
  maxHeight: '400px',
  overflowY: 'auto',
  padding: '12px 14px',
  borderRadius: '6px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  fontSize: '13px',
  lineHeight: '1.6',
  color: 'var(--text)',
  fontFamily: 'var(--font-ui)',
  wordBreak: 'break-word',
};
