import React, { useState } from 'react'

import type { McpRegistryEnvVar, McpRegistryServer } from '../../types/electron'
import { type McpStoreModel, type McpStoreSource, useMcpStoreModel } from './mcpStoreModel'
import { McpStoreServerCard } from './McpStoreServerCard'
import { buttonStyle, SectionLabel } from './settingsStyles'

const SOURCE_OPTIONS: Array<{ id: McpStoreSource; label: string; desc: string }> = [
  { id: 'registry', label: 'MCP Registry', desc: 'Official registry' },
  { id: 'npm', label: 'npm', desc: 'npm packages' },
]

export function McpStoreSection(): React.ReactElement {
  const model = useMcpStoreModel()
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{model.error && <div role="alert" className="text-status-error" style={errorBannerStyle}>{model.error}</div>}<StoreHeader onRefresh={model.search} /><SourceToggle source={model.source} onSelect={model.setSource} /><SearchInput query={model.query} onChange={model.setQuery} />{model.selectedServer ? <ServerDetailPanel model={model} /> : <ServerList model={model} />}</div>
}

function StoreHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div><SectionLabel style={{ marginBottom: '4px' }}>MCP Server Store</SectionLabel><p className="text-text-semantic-muted" style={{ fontSize: '12px', margin: 0 }}>Discover and install MCP servers from multiple sources.</p></div><div style={{ flexShrink: 0 }}><button onClick={onRefresh} className="text-text-semantic-primary" style={buttonStyle}>Refresh</button></div></div>
}

function SourceToggle({ source, onSelect }: { source: McpStoreSource; onSelect: (s: McpStoreSource) => void }): React.ReactElement {
  return <div style={{ display: 'flex', gap: '6px' }}>{SOURCE_OPTIONS.map((opt) => { const active = opt.id === source; return <button key={opt.id} onClick={() => onSelect(opt.id)} title={opt.desc} style={{ padding: '4px 10px', borderRadius: '12px', border: active ? '1px solid var(--accent)' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--bg-tertiary)', color: active ? 'var(--text-on-accent)' : 'var(--text-muted)', fontSize: '11px', fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all 120ms ease', whiteSpace: 'nowrap' }}>{opt.label}</button> })}</div>
}

function SearchInput({ query, onChange }: { query: string; onChange: (q: string) => void }): React.ReactElement {
  return <div style={searchWrapperStyle}><span className="text-text-semantic-muted" style={searchIconStyle}>&#x2315;</span><input type="text" value={query} onChange={(e) => onChange(e.target.value)} placeholder="Search MCP servers..." className="text-text-semantic-primary" style={searchInputStyle} /></div>
}

function ServerList({ model }: { model: McpStoreModel }): React.ReactElement {
  if (model.loading && model.servers.length === 0) return <p className="text-text-semantic-muted" style={loadingStyle}>Searching {model.source === 'npm' ? 'npm' : 'MCP'} servers...</p>
  if (model.servers.length === 0) return <div className="text-text-semantic-muted" style={emptyStyle}>No servers found.</div>
  const hasMore = model.source === 'npm' ? model.npmOffset < model.npmTotal : !!model.nextCursor
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}><div style={listContainerStyle}>{model.servers.map((server, idx) => <McpStoreServerCard key={`${server.name ?? 'server'}-${idx}`} server={server} isInstalled={model.installedNames.has(mcpExtractShortName(server.name))} isLast={idx === model.servers.length - 1} onClick={() => model.selectServer(server)} />)}</div>{hasMore && <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}><button onClick={model.loadMore} className="text-text-semantic-primary" style={buttonStyle}>Load More</button></div>}</div>
}

function ServerDetailPanel({ model }: { model: McpStoreModel }): React.ReactElement {
  const server = model.selectedServer!
  const displayName = server.title || extractShortName(server.name)
  const isInstalled = model.installedNames.has(mcpExtractShortName(server.name))
  const isInstalling = model.installInProgress === server.name
  const pkg = server.packages?.[0]
  const envVars = getEnvironmentVariables(pkg)
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const handleEnvChange = (name: string, value: string): void => setEnvValues((prev) => ({ ...prev, [name]: value }))
  const handleInstall = (scope: 'global' | 'project'): void => {
    const envOverrides: Record<string, string> = {}
    for (const ev of envVars) {
      const val = envValues[ev.name]?.trim()
      if (val) envOverrides[ev.name] = val
    }
    model.install(server, scope, Object.keys(envOverrides).length > 0 ? envOverrides : undefined)
  }

  return <div style={detailContainerStyle}>
    <button onClick={model.clearSelection} className="text-interactive-accent" style={backButtonStyle}>&larr; Back to results</button>
    <ServerDetailHeader displayName={displayName} server={server} />
    <ServerMetadataSection server={server} pkg={pkg} />
    {pkg?.runtime && <ServerRuntimeSection pkg={pkg} />}
    {envVars.length > 0 && !isInstalled && <ServerEnvironmentVariablesSection envVars={envVars} envValues={envValues} onEnvChange={handleEnvChange} />}
    <ServerInstallSection isInstalled={isInstalled} isInstalling={isInstalling} onInstall={handleInstall} />
  </div>
}

function ServerDetailHeader({ displayName, server }: { displayName: string; server: McpRegistryServer }): React.ReactElement {
  return <div style={{ marginTop: '12px' }}><div style={detailTitleRowStyle}><span className="text-text-semantic-primary" style={detailTitleStyle}>{displayName}</span><span className="text-text-semantic-muted" style={detailVersionStyle}>v{server.version}</span></div>{server.name !== displayName && <div className="text-text-semantic-muted" style={registryNameStyle}>{server.name}</div>}{server.description && <p className="text-text-semantic-muted" style={detailDescriptionStyle}>{server.description}</p>}</div>
}

function ServerMetadataSection({ server, pkg }: { server: McpRegistryServer; pkg?: NonNullable<McpRegistryServer['packages'][0]> }): React.ReactElement {
  return <div style={metadataContainerStyle}>{pkg && <MetadataRow label="Package" value={`${pkg.registry_type} ${pkg.name}`} />}<MetadataRow label="Status" value={server._meta.status} /><MetadataRow label="Published" value={formatDate(server._meta.publishedAt)} />{server._meta.updatedAt && server._meta.updatedAt !== server._meta.publishedAt && <MetadataRow label="Updated" value={formatDate(server._meta.updatedAt)} />}</div>
}

function ServerRuntimeSection({ pkg }: { pkg: NonNullable<McpRegistryServer['packages'][0]> }): React.ReactElement {
  return <div style={runtimeContainerStyle}><SectionLabel style={{ marginBottom: '6px' }}>Runtime Config</SectionLabel><RuntimeInfo pkg={pkg} /></div>
}

function ServerEnvironmentVariablesSection({
  envVars, envValues, onEnvChange,
}: {
  envVars: McpRegistryEnvVar[]
  envValues: Record<string, string>
  onEnvChange: (name: string, value: string) => void
}): React.ReactElement {
  return <div style={{ marginTop: '12px' }}><SectionLabel style={{ marginBottom: '6px' }}>Environment Variables</SectionLabel><div style={envVarContainerStyle}>{envVars.map((ev) => <div key={ev.name} style={envVarRowStyle}><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><label className="text-text-semantic-primary" style={envVarLabelStyle}>{ev.name}</label>{ev.isRequired && <span className="text-status-error" style={{ fontSize: '10px' }}>required</span>}</div>{ev.description && <div className="text-text-semantic-muted" style={envVarDescStyle}>{ev.description}</div>}<input type={ev.name.toLowerCase().includes('key') || ev.name.toLowerCase().includes('secret') || ev.name.toLowerCase().includes('token') ? 'password' : 'text'} value={envValues[ev.name] ?? ''} onChange={(e) => onEnvChange(ev.name, e.target.value)} placeholder={ev.format || `Enter ${ev.name}`} className="text-text-semantic-primary" style={envVarInputStyle} /></div>)}</div></div>
}

function ServerInstallSection({ isInstalled, isInstalling, onInstall }: { isInstalled: boolean; isInstalling: boolean; onInstall: (scope: 'global' | 'project') => void }): React.ReactElement {
  return <div style={installAreaStyle}>{isInstalled ? <div className="text-interactive-accent" style={alreadyInstalledStyle}>Already installed</div> : <div style={{ display: 'flex', gap: '8px' }}><button onClick={() => onInstall('global')} disabled={isInstalling} style={installButtonStyle(isInstalling)}>{isInstalling ? 'Installing...' : 'Install Global'}</button><button onClick={() => onInstall('project')} disabled={isInstalling} style={installButtonStyle(isInstalling)}>{isInstalling ? 'Installing...' : 'Install Project'}</button></div>}</div>
}

function MetadataRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return <div style={metadataRowStyle}><span className="text-text-semantic-muted" style={metadataLabelStyle}>{label}</span><span className="text-text-semantic-primary" style={metadataValueStyle}>{value}</span></div>
}

function RuntimeInfo({ pkg }: { pkg: NonNullable<McpRegistryServer['packages'][0]> }): React.ReactElement {
  const runtime = pkg.runtime
  const command = buildCommand(pkg)
  return <div style={runtimeBodyStyle}><div className="text-text-semantic-primary" style={monoLineStyle}><span className="text-text-semantic-muted" style={runtimeLabelStyle}>Command:</span> {command}</div>{runtime?.args && runtime.args.length > 0 && <div className="text-text-semantic-primary" style={monoLineStyle}><span className="text-text-semantic-muted" style={runtimeLabelStyle}>Args:</span> {runtime.args.join(' ')}</div>}{runtime?.env && Object.keys(runtime.env).length > 0 && <div className="text-text-semantic-primary" style={monoLineStyle}><span className="text-text-semantic-muted" style={runtimeLabelStyle}>Env:</span>{' '}{Object.entries(runtime.env).map(([k, v]) => `${k}=${v}`).join(', ')}</div>}</div>
}

function extractShortName(name: string | undefined): string {
  if (!name) return 'Unknown Server'
  const slashIdx = name.lastIndexOf('/')
  return slashIdx >= 0 ? name.slice(slashIdx + 1) : name
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return iso }
}

function buildCommand(pkg: McpRegistryServer['packages'][0]): string {
  switch (pkg.registry_type) {
    case 'npm': return `npx -y ${pkg.name}`
    case 'pypi': return `uvx ${pkg.name}`
    case 'docker': return `docker run -i --rm ${pkg.name}`
    default: return pkg.name
  }
}

function getEnvironmentVariables(pkg?: NonNullable<McpRegistryServer['packages'][0]>): McpRegistryEnvVar[] {
  return pkg && 'environmentVariables' in pkg ? pkg.environmentVariables ?? [] : []
}

const errorBannerStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--error)', background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))', fontSize: '12px' }
const emptyStyle: React.CSSProperties = { padding: '16px', borderRadius: '6px', border: '1px dashed var(--border)', background: 'var(--bg-tertiary)', fontSize: '12px', fontStyle: 'italic', textAlign: 'center' }
const loadingStyle: React.CSSProperties = { fontSize: '12px' }
const searchWrapperStyle: React.CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center' }
const searchIconStyle: React.CSSProperties = { position: 'absolute', left: '10px', fontSize: '14px', pointerEvents: 'none' }
const searchInputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px 8px 30px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }
const listContainerStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }
const detailContainerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' }
const backButtonStyle: React.CSSProperties = { alignSelf: 'flex-start', padding: '4px 8px', border: 'none', background: 'transparent', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }
const detailTitleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: '10px' }
const detailTitleStyle: React.CSSProperties = { fontSize: '16px', fontWeight: 600 }
const detailVersionStyle: React.CSSProperties = { fontSize: '12px' }
const registryNameStyle: React.CSSProperties = { fontSize: '11px', fontFamily: 'var(--font-mono)', marginTop: '2px' }
const detailDescriptionStyle: React.CSSProperties = { fontSize: '12px', lineHeight: '1.5', margin: '8px 0 0 0' }
const metadataContainerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', padding: '10px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }
const metadataRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }
const metadataLabelStyle: React.CSSProperties = { minWidth: '70px', fontWeight: 500 }
const metadataValueStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '11px' }
const runtimeContainerStyle: React.CSSProperties = { marginTop: '12px' }
const runtimeBodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '3px', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }
const monoLineStyle: React.CSSProperties = { fontSize: '11px', fontFamily: 'var(--font-mono)' }
const runtimeLabelStyle: React.CSSProperties = { fontWeight: 500 }
const installAreaStyle: React.CSSProperties = { marginTop: '16px' }
function installButtonStyle(disabled: boolean): React.CSSProperties { return { padding: '7px 14px', borderRadius: '6px', border: 'none', background: disabled ? 'var(--bg-tertiary)' : 'var(--accent)', color: disabled ? 'var(--text-muted)' : 'var(--text-on-accent)', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1, whiteSpace: 'nowrap' } }
const envVarContainerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }
const envVarRowStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '3px' }
const envVarLabelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)' }
const envVarDescStyle: React.CSSProperties = { fontSize: '11px', lineHeight: '1.4' }
const envVarInputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: '11px', fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' }
const alreadyInstalledStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', background: 'color-mix(in srgb, var(--accent) 15%, var(--bg))', fontSize: '12px', fontWeight: 600 }
