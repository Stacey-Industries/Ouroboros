/**
 * McpStoreSection.tsx — Settings section for browsing and installing MCP servers
 * from the Official MCP Registry.
 */

import React, { useState } from 'react';

import type { McpRegistryEnvVar,McpRegistryServer } from '../../types/electron';
import { extractShortName as mcpExtractShortName,type McpStoreModel, type McpStoreSource, useMcpStoreModel } from './mcpStoreModel';
import { McpStoreServerCard } from './McpStoreServerCard';
import { buttonStyle,SectionLabel } from './settingsStyles';

const SOURCE_OPTIONS: Array<{ id: McpStoreSource; label: string; desc: string }> = [
  { id: 'registry', label: 'MCP Registry', desc: 'Official registry' },
  { id: 'npm', label: 'npm', desc: 'npm packages' },
];

export function McpStoreSection(): React.ReactElement {
  const model = useMcpStoreModel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {model.error && <div role="alert" style={errorBannerStyle}>{model.error}</div>}
      <StoreHeader onRefresh={model.search} />
      <SourceToggle source={model.source} onSelect={model.setSource} />
      <SearchInput query={model.query} onChange={model.setQuery} />
      {model.selectedServer ? (
        <ServerDetailPanel model={model} />
      ) : (
        <ServerList model={model} />
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function StoreHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>MCP Server Store</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Discover and install MCP servers from multiple sources.
        </p>
      </div>
      <div style={{ flexShrink: 0 }}>
        <button onClick={onRefresh} style={buttonStyle}>Refresh</button>
      </div>
    </div>
  );
}

// ── Source Toggle ───────────────────────────────────────────────────────

function SourceToggle({ source, onSelect }: { source: McpStoreSource; onSelect: (s: McpStoreSource) => void }): React.ReactElement {
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
              border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: active ? 'var(--bg)' : 'var(--text-muted)',
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

// ── Search Input ────────────────────────────────────────────────────────

function SearchInput({ query, onChange }: { query: string; onChange: (q: string) => void }): React.ReactElement {
  return (
    <div style={searchWrapperStyle}>
      <span style={searchIconStyle}>&#x2315;</span>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search MCP servers..."
        style={searchInputStyle}
      />
    </div>
  );
}

// ── Server List ─────────────────────────────────────────────────────────

function ServerList({ model }: { model: McpStoreModel }): React.ReactElement {
  if (model.loading && model.servers.length === 0) {
    return <p style={loadingStyle}>Searching {model.source === 'npm' ? 'npm' : 'MCP'} servers...</p>;
  }

  if (model.servers.length === 0) {
    return <div style={emptyStyle}>No servers found.</div>;
  }

  const hasMore = model.source === 'npm'
    ? model.npmOffset < model.npmTotal
    : !!model.nextCursor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
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

// ── Server Detail Panel ─────────────────────────────────────────────────

function ServerDetailPanel({ model }: { model: McpStoreModel }): React.ReactElement {
  const server = model.selectedServer!;
  const displayName = server.title || extractShortName(server.name);
  const isInstalled = model.installedNames.has(mcpExtractShortName(server.name));
  const isInstalling = model.installInProgress === server.name;
  const pkg = server.packages?.[0];
  const envVars: McpRegistryEnvVar[] = (pkg as any)?.environmentVariables ?? [];
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  const handleEnvChange = (name: string, value: string): void => {
    setEnvValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleInstall = (scope: 'global' | 'project'): void => {
    const envOverrides: Record<string, string> = {};
    for (const ev of envVars) {
      const val = envValues[ev.name]?.trim();
      if (val) envOverrides[ev.name] = val;
    }
    model.install(server, scope, Object.keys(envOverrides).length > 0 ? envOverrides : undefined);
  };

  return (
    <div style={detailContainerStyle}>
      {/* Back button */}
      <button onClick={model.clearSelection} style={backButtonStyle}>
        &larr; Back to results
      </button>

      {/* Header */}
      <div style={{ marginTop: '12px' }}>
        <div style={detailTitleRowStyle}>
          <span style={detailTitleStyle}>{displayName}</span>
          <span style={detailVersionStyle}>v{server.version}</span>
        </div>
        {server.name !== displayName && (
          <div style={registryNameStyle}>{server.name}</div>
        )}
        {server.description && (
          <p style={detailDescriptionStyle}>{server.description}</p>
        )}
      </div>

      {/* Metadata */}
      <div style={metadataContainerStyle}>
        {pkg && (
          <MetadataRow label="Package" value={`${pkg.registry_type} ${pkg.name}`} />
        )}
        <MetadataRow label="Status" value={server._meta.status} />
        <MetadataRow label="Published" value={formatDate(server._meta.publishedAt)} />
        {server._meta.updatedAt && server._meta.updatedAt !== server._meta.publishedAt && (
          <MetadataRow label="Updated" value={formatDate(server._meta.updatedAt)} />
        )}
      </div>

      {/* Runtime config */}
      {pkg?.runtime && (
        <div style={runtimeContainerStyle}>
          <SectionLabel style={{ marginBottom: '6px' }}>Runtime Config</SectionLabel>
          <RuntimeInfo pkg={pkg} />
        </div>
      )}

      {/* Environment Variables */}
      {envVars.length > 0 && !isInstalled && (
        <div style={{ marginTop: '12px' }}>
          <SectionLabel style={{ marginBottom: '6px' }}>Environment Variables</SectionLabel>
          <div style={envVarContainerStyle}>
            {envVars.map((ev) => (
              <div key={ev.name} style={envVarRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <label style={envVarLabelStyle}>{ev.name}</label>
                  {ev.isRequired && <span style={{ color: 'var(--error)', fontSize: '10px' }}>required</span>}
                </div>
                {ev.description && (
                  <div style={envVarDescStyle}>{ev.description}</div>
                )}
                <input
                  type={ev.name.toLowerCase().includes('key') || ev.name.toLowerCase().includes('secret') || ev.name.toLowerCase().includes('token') ? 'password' : 'text'}
                  value={envValues[ev.name] ?? ''}
                  onChange={(e) => handleEnvChange(ev.name, e.target.value)}
                  placeholder={ev.format || `Enter ${ev.name}`}
                  style={envVarInputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Install buttons or installed badge */}
      <div style={installAreaStyle}>
        {isInstalled ? (
          <div style={alreadyInstalledStyle}>Already installed</div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleInstall('global')}
              disabled={isInstalling}
              style={installButtonStyle(isInstalling)}
            >
              {isInstalling ? 'Installing...' : 'Install Global'}
            </button>
            <button
              onClick={() => handleInstall('project')}
              disabled={isInstalling}
              style={installButtonStyle(isInstalling)}
            >
              {isInstalling ? 'Installing...' : 'Install Project'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metadata Row helper ─────────────────────────────────────────────────

function MetadataRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={metadataRowStyle}>
      <span style={metadataLabelStyle}>{label}</span>
      <span style={metadataValueStyle}>{value}</span>
    </div>
  );
}

// ── Runtime Info helper ─────────────────────────────────────────────────

function RuntimeInfo({ pkg }: { pkg: NonNullable<McpRegistryServer['packages'][0]> }): React.ReactElement {
  const runtime = pkg.runtime;
  const command = buildCommand(pkg);

  return (
    <div style={runtimeBodyStyle}>
      <div style={monoLineStyle}>
        <span style={runtimeLabelStyle}>Command:</span> {command}
      </div>
      {runtime?.args && runtime.args.length > 0 && (
        <div style={monoLineStyle}>
          <span style={runtimeLabelStyle}>Args:</span> {runtime.args.join(' ')}
        </div>
      )}
      {runtime?.env && Object.keys(runtime.env).length > 0 && (
        <div style={monoLineStyle}>
          <span style={runtimeLabelStyle}>Env:</span>{' '}
          {Object.entries(runtime.env).map(([k, v]) => `${k}=${v}`).join(', ')}
        </div>
      )}
    </div>
  );
}

// ── Utility functions ───────────────────────────────────────────────────

function extractShortName(name: string | undefined): string {
  if (!name) return 'Unknown Server';
  const slashIdx = name.lastIndexOf('/');
  return slashIdx >= 0 ? name.slice(slashIdx + 1) : name;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function buildCommand(pkg: McpRegistryServer['packages'][0]): string {
  switch (pkg.registry_type) {
    case 'npm': return `npx -y ${pkg.name}`;
    case 'pypi': return `uvx ${pkg.name}`;
    case 'docker': return `docker run -i --rm ${pkg.name}`;
    default: return pkg.name;
  }
}

// ── Styles ──────────────────────────────────────────────────────────────

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

const listContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
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

const registryNameStyle: React.CSSProperties = {
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
  minWidth: '70px',
  fontWeight: 500,
};

const metadataValueStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const runtimeContainerStyle: React.CSSProperties = {
  marginTop: '12px',
};

const runtimeBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
};

const monoLineStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text)',
};

const runtimeLabelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontWeight: 500,
};

const installAreaStyle: React.CSSProperties = {
  marginTop: '16px',
};

function installButtonStyle(disabled: boolean): React.CSSProperties {
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

const envVarContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '6px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
};

const envVarRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
};

const envVarLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
};

const envVarDescStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  lineHeight: '1.4',
};

const envVarInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

const alreadyInstalledStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'color-mix(in srgb, var(--accent) 15%, var(--bg))',
  color: 'var(--accent)',
  fontSize: '12px',
  fontWeight: 600,
};
