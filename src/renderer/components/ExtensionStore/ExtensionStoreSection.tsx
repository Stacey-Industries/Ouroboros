import React, { useEffect } from 'react';

import { buttonStyle } from '../Settings/settingsStyles';
import { ExtensionStoreCard } from './ExtensionStoreCard';
import {
  type ExtensionStoreModel,
  type ExtensionStoreSource,
  useExtensionStoreModel,
} from './extensionStoreModel';
import { DetailPanel } from './ExtensionStoreSectionDetail';
import {
  categoryPillStyle,
  categoryRowStyle,
  emptyStyle,
  errorBannerStyle,
  installedBannerBodyStyle,
  installedBannerHeaderStyle,
  installedBannerStyle,
  installedNameStyle,
  installedSepStyle,
  listContainerStyle,
  listWrapStyle,
  loadingStyle,
  loadMoreWrapStyle,
  rootStyle,
  rowStyle,
  searchIconStyle,
  searchInputStyle,
  searchWrapperStyle,
} from './extensionStoreSectionStyles';

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

interface ExtensionStoreSectionProps {
  onRegisterRefresh?: (fn: () => void) => void;
}

export function ExtensionStoreSection({
  onRegisterRefresh,
}: ExtensionStoreSectionProps = {}): React.ReactElement {
  const model = useExtensionStoreModel();

  useEffect(() => {
    onRegisterRefresh?.(model.search);
  }, [onRegisterRefresh, model.search]);

  return (
    <div style={rootStyle}>
      {model.error && (
        <div role="alert" className="text-status-error" style={errorBannerStyle}>
          {model.error}
        </div>
      )}
      <SourceToggle source={model.source} onSelect={model.setSource} />
      <InstalledBanner model={model} />
      <SearchInput query={model.query} onChange={model.setQuery} />
      <CategoryFilter activeFilter={model.categoryFilter} onSelect={model.setCategoryFilter} />
      {model.selectedExtension ? <DetailPanel model={model} /> : <ExtensionList model={model} />}
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

function ExtensionCards({ model }: { model: ExtensionStoreModel }): React.ReactElement {
  return (
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
      <ExtensionCards model={model} />
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
