import React from 'react';
import ReactMarkdown from 'react-markdown';

import type { InstalledVsxExtension } from '../../types/electron';
import { ExtensionStoreCard } from './ExtensionStoreCard';
import {
  type ExtensionStoreModel,
  type ExtensionStoreSource,
  useExtensionStoreModel,
} from './extensionStoreModel';
import { buttonStyle, SectionLabel } from './settingsStyles';

const SOURCE_OPTIONS: Array<{ id: ExtensionStoreSource; label: string; desc: string }> = [
  { id: 'openvsx', label: 'Open VSX', desc: 'Open VSX Registry' },
  { id: 'marketplace', label: 'VS Code Marketplace', desc: 'Visual Studio Marketplace' },
];
const CATEGORY_FILTERS: Array<{ label: string; value: string | null }> = [
  { label: 'All', value: null },
  { label: 'Themes', value: 'Themes' },
  { label: 'Snippets', value: 'Snippets' },
  { label: 'Languages', value: 'Programming Languages' },
];
const PAGE_SIZE = 20;

export function ExtensionStoreSection(): React.ReactElement {
  const model = useExtensionStoreModel();
  return (
    <div style={rootStyle}>
      {model.error && (
        <div role="alert" className="text-status-error" style={errorBannerStyle}>
          {model.error}
        </div>
      )}
      <StoreHeader onRefresh={model.search} />
      <SourceToggle source={model.source} onSelect={model.setSource} />
      <InstalledBanner model={model} />
      <SearchInput query={model.query} onChange={model.setQuery} />
      <CategoryFilter activeFilter={model.categoryFilter} onSelect={model.setCategoryFilter} />
      {model.selectedExtension ? <DetailPanel model={model} /> : <ExtensionList model={model} />}
    </div>
  );
}

function StoreHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div style={headerStyle}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>Extension Store</SectionLabel>
        <p className="text-text-semantic-muted" style={headerTextStyle}>
          Themes, grammars, and snippets from multiple sources
        </p>
      </div>
      <button onClick={onRefresh} className="text-text-semantic-primary" style={buttonStyle}>
        Refresh
      </button>
    </div>
  );
}

function SourceToggle({
  source,
  onSelect,
}: {
  source: ExtensionStoreSource;
  onSelect: (s: ExtensionStoreSource) => void;
}): React.ReactElement {
  return (
    <div style={rowStyle}>
      {SOURCE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          title={opt.desc}
          style={categoryPillStyle(opt.id === source)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function InstalledBanner({ model }: { model: ExtensionStoreModel }): React.ReactElement | null {
  const installed = Array.from(model.installedMap.values());
  if (installed.length === 0) return null;
  return (
    <div style={installedBannerStyle}>
      <div className="text-text-semantic-muted" style={installedBannerHeaderStyle}>
        Installed ({installed.length})
      </div>
      <div className="text-text-semantic-primary" style={installedBannerBodyStyle}>
        {installed.map((ext, idx) => (
          <React.Fragment key={ext.id}>
            {idx > 0 && (
              <span className="text-text-semantic-muted" style={installedSepStyle}>
                {' · '}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={() => model.selectExtension(ext.namespace, ext.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  model.selectExtension(ext.namespace, ext.name);
              }}
              className="text-interactive-accent"
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

function SearchInput({
  query,
  onChange,
}: {
  query: string;
  onChange: (q: string) => void;
}): React.ReactElement {
  return (
    <div style={searchWrapperStyle}>
      <span className="text-text-semantic-muted" style={searchIconStyle}>
        &#x2315;
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search extensions..."
        className="text-text-semantic-primary"
        style={searchInputStyle}
      />
    </div>
  );
}

function CategoryFilter({
  activeFilter,
  onSelect,
}: {
  activeFilter: string | null;
  onSelect: (cat: string | null) => void;
}): React.ReactElement {
  return (
    <div style={categoryRowStyle}>
      {CATEGORY_FILTERS.map((cat) => (
        <button
          key={cat.label}
          onClick={() => onSelect(cat.value)}
          style={categoryPillStyle(cat.value === activeFilter)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

function ExtensionList({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  if (model.loading && model.extensions.length === 0)
    return (
      <p className="text-text-semantic-muted" style={loadingStyle}>
        Searching extensions...
      </p>
    );
  if (model.extensions.length === 0)
    return (
      <div className="text-text-semantic-muted" style={emptyStyle}>
        No extensions found.
      </div>
    );
  const hasMore = model.totalSize > model.offset + PAGE_SIZE;
  return (
    <div style={listWrapStyle}>
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
        <div style={loadMoreWrapStyle}>
          <button
            onClick={model.loadMore}
            className="text-text-semantic-primary"
            style={buttonStyle}
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  const ext = model.selectedExtension!;
  const extId = `${ext.namespace}.${ext.name}`;
  const installedData = model.installedMap.get(extId);
  const isInstalled = model.installedMap.has(extId);
  const isDisabled = model.disabledIds.has(extId);
  const isInstalling = model.installInProgress === extId;
  return (
    <div style={detailContainerStyle}>
      <button
        onClick={model.clearSelection}
        className="text-interactive-accent"
        style={backButtonStyle}
      >
        &larr; Back to results
      </button>
      <ExtensionDetailHeader ext={ext} />
      <ExtensionStats ext={ext} />
      <ExtensionMetadata ext={ext} />
      <ExtensionActions
        ext={ext}
        extId={extId}
        isDisabled={isDisabled}
        isInstalled={isInstalled}
        isInstalling={isInstalling}
        model={model}
      />
      {installedData && <ContributionsSummary installed={installedData} />}{' '}
      {ext.readme && <ReadmeSection readme={ext.readme} />}
    </div>
  );
}

function ExtensionDetailHeader({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
    <div style={headerRowStyle}>
      {ext.icon ? (
        <img src={ext.icon} alt="" style={iconStyle} />
      ) : (
        <div style={iconPlaceholderStyle}>{getCategoryEmoji(ext.categories)}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={detailTitleRowStyle}>
          <span className="text-text-semantic-primary" style={detailTitleStyle}>
            {ext.displayName || ext.name}
          </span>
          <span className="text-text-semantic-muted" style={detailVersionStyle}>
            v{ext.version}
          </span>
        </div>
        <div className="text-text-semantic-muted" style={publisherStyle}>
          {ext.namespace}
        </div>
        {ext.description && (
          <p className="text-text-semantic-muted" style={detailDescriptionStyle}>
            {ext.description}
          </p>
        )}
      </div>
    </div>
  );
}

function ExtensionStats({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
    <div style={statsRowStyle}>
      <span className="text-text-semantic-muted" style={statStyle}>
        {formatDownloads(ext.downloads)} downloads
      </span>
      {ext.averageRating != null && (
        <span className="text-text-semantic-muted" style={statStyle}>
          {'\u2605'} {ext.averageRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function ExtensionMetadata({
  ext,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
}): React.ReactElement {
  return (
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
            className="text-interactive-accent"
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
  );
}

function ExtensionActions({
  ext,
  extId,
  isInstalled,
  isDisabled,
  isInstalling,
  model,
}: {
  ext: NonNullable<ExtensionStoreModel['selectedExtension']>;
  extId: string;
  isInstalled: boolean;
  isDisabled: boolean;
  isInstalling: boolean;
  model: ExtensionStoreModel;
}): React.ReactElement {
  return (
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
        <div style={actionButtonRowStyle}>
          <button
            onClick={() => model.toggleEnabled(extId)}
            className="text-text-semantic-primary"
            style={buttonStyle}
          >
            {isDisabled ? 'Enable' : 'Disable'}
          </button>
          <button
            onClick={() => model.uninstall(extId)}
            className="text-status-error"
            style={dangerButtonStyle}
          >
            Uninstall
          </button>
        </div>
      )}
    </div>
  );
}

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
      <span className="text-text-semantic-muted" style={metadataLabelStyle}>
        {label}
      </span>
      {children ?? (
        <span className="text-text-semantic-primary" style={metadataValueStyle}>
          {value}
        </span>
      )}
    </div>
  );
}

function ContributionsSummary({
  installed,
}: {
  installed: InstalledVsxExtension;
}): React.ReactElement | null {
  const items = summarizeContributions(installed);
  if (items.length === 0) return null;
  return (
    <div style={contributionsContainerStyle}>
      <SectionLabel style={{ marginBottom: '6px' }}>Contributions</SectionLabel>
      <div style={contributionsBodyStyle}>
        {items.map((item) => (
          <div key={item} className="text-text-semantic-primary" style={contributionItemStyle}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadmeSection({ readme }: { readme: string }): React.ReactElement {
  return (
    <div style={readmeContainerStyle}>
      <SectionLabel style={{ marginBottom: '8px' }}>README</SectionLabel>
      <div style={readmeBodyStyle} className="ext-store-readme text-text-semantic-primary">
        <ReactMarkdown>{readme}</ReactMarkdown>
      </div>
    </div>
  );
}

function summarizeContributions(installed: InstalledVsxExtension): string[] {
  const contributes = installed.contributes;
  if (!contributes) return [];
  const parts: Array<[number | undefined, string]> = [
    [contributes.themes?.length, 'color theme'],
    [contributes.grammars?.length, 'grammar'],
    [contributes.snippets?.length, 'snippet file'],
    [contributes.languages?.length, 'language'],
  ];
  return parts.flatMap(([count, label]) =>
    count ? [`${count} ${label}${count !== 1 ? 's' : ''}`] : [],
  );
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function getCategoryEmoji(categories?: string[]): string {
  if (!categories || categories.length === 0) return '\u{1F4E6}';
  const first = categories[0].toLowerCase();
  if (first.includes('theme')) return '\u{1F3A8}';
  if (first.includes('snippet')) return '\u{2702}';
  if (first.includes('language') || first.includes('programming')) return '\u{1F4DD}';
  if (first.includes('linter') || first.includes('formatter')) return '\u{1F9F9}';
  return '\u{1F4E6}';
}

const rootStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const headerTextStyle: React.CSSProperties = { fontSize: '12px', margin: 0 };
const rowStyle: React.CSSProperties = { display: 'flex', gap: '6px' };
const categoryRowStyle: React.CSSProperties = { display: 'flex', gap: '6px', flexWrap: 'wrap' };
const listWrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0px' };
const loadMoreWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: '12px',
};
const listContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};
const installedBannerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};
const installedBannerHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '6px',
};
const installedBannerBodyStyle: React.CSSProperties = { fontSize: '12px', lineHeight: '1.6' };
const installedSepStyle: React.CSSProperties = {};
const installedNameStyle: React.CSSProperties = { cursor: 'pointer', fontWeight: 500 };
const searchWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};
const searchIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10px',
  fontSize: '14px',
  pointerEvents: 'none',
};
const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px 8px 30px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-panel)',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};
const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontStyle: 'italic',
  textAlign: 'center',
};
const loadingStyle: React.CSSProperties = { fontSize: '12px' };
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
  fontSize: '12px',
  cursor: 'pointer',
  fontWeight: 500,
};
const headerRowStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'flex',
  gap: '14px',
  alignItems: 'flex-start',
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
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-default)',
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
const detailTitleStyle: React.CSSProperties = { fontSize: '16px', fontWeight: 600 };
const detailVersionStyle: React.CSSProperties = { fontSize: '12px' };
const publisherStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  marginTop: '2px',
};
const detailDescriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '8px 0 0 0',
};
const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  marginTop: '8px',
  paddingLeft: '62px',
};
const statStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 500 };
const metadataContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '12px',
  padding: '10px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
const metadataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '12px',
};
const metadataLabelStyle: React.CSSProperties = { minWidth: '80px', fontWeight: 500 };
const metadataValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};
const linkStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  textDecoration: 'none',
  wordBreak: 'break-all',
};
const contributionsContainerStyle: React.CSSProperties = { marginTop: '12px' };
const contributionsBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
};
const contributionItemStyle: React.CSSProperties = { fontSize: '12px' };
const installAreaStyle: React.CSSProperties = { marginTop: '16px' };
function accentButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? 'var(--surface-raised)' : 'var(--interactive-accent)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };
}
function categoryPillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: '12px',
    border: isActive ? '1px solid var(--interactive-accent)' : '1px solid var(--border-default)',
    background: isActive ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: isActive ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 120ms ease',
    whiteSpace: 'nowrap',
  };
}
const dangerButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-base))',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const readmeContainerStyle: React.CSSProperties = { marginTop: '16px' };
const readmeBodyStyle: React.CSSProperties = {
  maxHeight: '400px',
  overflowY: 'auto',
  padding: '12px 14px',
  borderRadius: '6px',
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-default)',
  fontSize: '13px',
  lineHeight: '1.6',
  fontFamily: 'var(--font-ui)',
  wordBreak: 'break-word',
};
