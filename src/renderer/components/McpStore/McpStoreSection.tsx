import React, { useEffect } from 'react';

import { buttonStyle } from '../Settings/settingsStyles';
import { type McpStoreModel, type McpStoreSource, useMcpStoreModel } from './mcpStoreModel';
import { mcpExtractShortName, ServerDetailPanel } from './McpStoreSectionDetail';
import { McpStoreServerCard } from './McpStoreServerCard';

const SOURCE_OPTIONS: Array<{ id: McpStoreSource; label: string; desc: string }> = [
  { id: 'registry', label: 'MCP Registry', desc: 'Official registry' },
  { id: 'npm', label: 'npm', desc: 'npm packages' },
];

interface McpStoreSectionProps {
  onRegisterRefresh?: (fn: () => void) => void;
}

export function McpStoreSection({
  onRegisterRefresh,
}: McpStoreSectionProps = {}): React.ReactElement {
  const model = useMcpStoreModel();

  useEffect(() => {
    onRegisterRefresh?.(model.search);
  }, [onRegisterRefresh, model.search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {model.error && (
        <div role="alert" className="text-status-error" style={errorBannerStyle}>
          {model.error}
        </div>
      )}
      <SourceToggle source={model.source} onSelect={model.setSource} />
      <SearchInput query={model.query} onChange={model.setQuery} />
      {model.selectedServer ? <ServerDetailPanel model={model} /> : <ServerList model={model} />}
    </div>
  );
}

function SourceToggle({
  source,
  onSelect,
}: {
  source: McpStoreSource;
  onSelect: (s: McpStoreSource) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {SOURCE_OPTIONS.map((opt) => {
        const active = opt.id === source;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            title={opt.desc}
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              border: active
                ? '1px solid var(--interactive-accent)'
                : '1px solid var(--border-default)',
              background: active ? 'var(--interactive-accent)' : 'var(--surface-raised)',
              color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 120ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
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
        placeholder="Search MCP servers..."
        className="text-text-semantic-primary"
        style={searchInputStyle}
      />
    </div>
  );
}

function ServerCards({ model }: { model: McpStoreModel }): React.ReactElement {
  return (
    <div style={listContainerStyle}>
      {model.servers.map((server, idx) => (
        <McpStoreServerCard
          key={`${server.name ?? 'server'}-${idx}`}
          server={server}
          isInstalled={model.installedNames.has(mcpExtractShortName(server.name))}
          isLast={idx === model.servers.length - 1}
          onClick={() => model.selectServer(server)}
        />
      ))}
    </div>
  );
}

function ServerList({ model }: { model: McpStoreModel }): React.ReactElement {
  if (model.loading && model.servers.length === 0)
    return (
      <p className="text-text-semantic-muted" style={loadingStyle}>
        Searching {model.source === 'npm' ? 'npm' : 'MCP'} servers...
      </p>
    );
  if (model.servers.length === 0)
    return (
      <div className="text-text-semantic-muted" style={emptyStyle}>
        No servers found.
      </div>
    );
  const hasMore = model.source === 'npm' ? model.npmOffset < model.npmTotal : !!model.nextCursor;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
      <ServerCards model={model} />
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
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

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  fontSize: '12px',
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
const listContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};
