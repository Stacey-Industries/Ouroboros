/**
 * McpStoreSectionDetail.tsx — Detail panel for the MCP Server Store.
 */

import React, { useState } from 'react';

import type { McpRegistryEnvVar, McpRegistryServer } from '../../types/electron';
import type { McpStoreModel } from './mcpStoreModel';
import {
  buildCommand,
  extractShortName,
  formatDate,
  getEnvironmentVariables,
  installButtonStyle,
  mcpExtractShortName,
} from './mcpStoreSectionDetailHelpers';
import {
  alreadyInstalledStyle,
  backButtonStyle,
  detailContainerStyle,
  detailDescriptionStyle,
  detailTitleRowStyle,
  detailTitleStyle,
  detailVersionStyle,
  envVarContainerStyle,
  envVarDescStyle,
  envVarInputStyle,
  envVarLabelStyle,
  envVarRowStyle,
  installAreaStyle,
  metadataContainerStyle,
  metadataLabelStyle,
  metadataRowStyle,
  metadataValueStyle,
  monoLineStyle,
  registryNameStyle,
  runtimeBodyStyle,
  runtimeContainerStyle,
  runtimeLabelStyle,
} from './mcpStoreSectionDetailStyles';
import { SectionLabel } from './settingsStyles';

export { mcpExtractShortName };

function isSensitiveKey(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('key') || lower.includes('secret') || lower.includes('token');
}

function EnvVarRow({
  ev,
  value,
  onChange,
}: {
  ev: McpRegistryEnvVar;
  value: string;
  onChange: (name: string, val: string) => void;
}): React.ReactElement {
  return (
    <div style={envVarRowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label className="text-text-semantic-primary" style={envVarLabelStyle}>
          {ev.name}
        </label>
        {ev.isRequired && (
          <span className="text-status-error" style={{ fontSize: '10px' }}>
            required
          </span>
        )}
      </div>
      {ev.description && (
        <div className="text-text-semantic-muted" style={envVarDescStyle}>
          {ev.description}
        </div>
      )}
      <input
        type={isSensitiveKey(ev.name) ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(ev.name, e.target.value)}
        placeholder={ev.format || `Enter ${ev.name}`}
        className="text-text-semantic-primary"
        style={envVarInputStyle}
      />
    </div>
  );
}

export function ServerEnvironmentVariablesSection({
  envVars,
  envValues,
  onEnvChange,
}: {
  envVars: McpRegistryEnvVar[];
  envValues: Record<string, string>;
  onEnvChange: (name: string, value: string) => void;
}): React.ReactElement {
  return (
    <div style={{ marginTop: '12px' }}>
      <SectionLabel style={{ marginBottom: '6px' }}>Environment Variables</SectionLabel>
      <div style={envVarContainerStyle}>
        {envVars.map((ev) => (
          <EnvVarRow
            key={ev.name}
            ev={ev}
            value={envValues[ev.name] ?? ''}
            onChange={onEnvChange}
          />
        ))}
      </div>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={metadataRowStyle}>
      <span className="text-text-semantic-muted" style={metadataLabelStyle}>
        {label}
      </span>
      <span className="text-text-semantic-primary" style={metadataValueStyle}>
        {value}
      </span>
    </div>
  );
}

function ServerDetailHeader({
  displayName,
  server,
}: {
  displayName: string;
  server: McpRegistryServer;
}): React.ReactElement {
  return (
    <div style={{ marginTop: '12px' }}>
      <div style={detailTitleRowStyle}>
        <span className="text-text-semantic-primary" style={detailTitleStyle}>
          {displayName}
        </span>
        <span className="text-text-semantic-muted" style={detailVersionStyle}>
          v{server.version}
        </span>
      </div>
      {server.name !== displayName && (
        <div className="text-text-semantic-muted" style={registryNameStyle}>
          {server.name}
        </div>
      )}
      {server.description && (
        <p className="text-text-semantic-muted" style={detailDescriptionStyle}>
          {server.description}
        </p>
      )}
    </div>
  );
}

export function ServerMetadataSection({
  server,
  pkg,
}: {
  server: McpRegistryServer;
  pkg?: NonNullable<McpRegistryServer['packages'][0]>;
}): React.ReactElement {
  return (
    <div style={metadataContainerStyle}>
      {pkg && <MetadataRow label="Package" value={`${pkg.registry_type} ${pkg.name}`} />}
      <MetadataRow label="Status" value={server._meta.status} />
      <MetadataRow label="Published" value={formatDate(server._meta.publishedAt)} />
      {server._meta.updatedAt && server._meta.updatedAt !== server._meta.publishedAt && (
        <MetadataRow label="Updated" value={formatDate(server._meta.updatedAt)} />
      )}
    </div>
  );
}

function RuntimeInfo({
  pkg,
}: {
  pkg: NonNullable<McpRegistryServer['packages'][0]>;
}): React.ReactElement {
  const runtime = pkg.runtime;
  const command = buildCommand(pkg);
  return (
    <div style={runtimeBodyStyle}>
      <div className="text-text-semantic-primary" style={monoLineStyle}>
        <span className="text-text-semantic-muted" style={runtimeLabelStyle}>
          Command:
        </span>{' '}
        {command}
      </div>
      {runtime?.args && runtime.args.length > 0 && (
        <div className="text-text-semantic-primary" style={monoLineStyle}>
          <span className="text-text-semantic-muted" style={runtimeLabelStyle}>
            Args:
          </span>{' '}
          {runtime.args.join(' ')}
        </div>
      )}
      {runtime?.env && Object.keys(runtime.env).length > 0 && (
        <div className="text-text-semantic-primary" style={monoLineStyle}>
          <span className="text-text-semantic-muted" style={runtimeLabelStyle}>
            Env:
          </span>{' '}
          {Object.entries(runtime.env)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}
        </div>
      )}
    </div>
  );
}

function ServerInstallSection({
  isInstalled,
  isInstalling,
  onInstall,
}: {
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: (scope: 'global' | 'project') => void;
}): React.ReactElement {
  return (
    <div style={installAreaStyle}>
      {isInstalled ? (
        <div className="text-interactive-accent" style={alreadyInstalledStyle}>
          Already installed
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onInstall('global')}
            disabled={isInstalling}
            style={installButtonStyle(isInstalling)}
          >
            {isInstalling ? 'Installing...' : 'Install Global'}
          </button>
          <button
            onClick={() => onInstall('project')}
            disabled={isInstalling}
            style={installButtonStyle(isInstalling)}
          >
            {isInstalling ? 'Installing...' : 'Install Project'}
          </button>
        </div>
      )}
    </div>
  );
}

function buildEnvOverrides(
  envVars: McpRegistryEnvVar[],
  envValues: Record<string, string>,
): Record<string, string> | undefined {
  const overrides: Record<string, string> = {};
  for (const ev of envVars) {
    const val = envValues[ev.name]?.trim();
    if (val) overrides[ev.name] = val;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function ServerDetailPanel({ model }: { model: McpStoreModel }): React.ReactElement {
  const server = model.selectedServer!;
  const displayName = server.title || extractShortName(server.name);
  const isInstalled = model.installedNames.has(mcpExtractShortName(server.name));
  const isInstalling = model.installInProgress === server.name;
  const pkg = server.packages?.[0];
  const envVars = getEnvironmentVariables(pkg);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const handleEnvChange = (name: string, value: string): void =>
    setEnvValues((prev) => ({ ...prev, [name]: value }));
  const handleInstall = (scope: 'global' | 'project'): void =>
    model.install(server, scope, buildEnvOverrides(envVars, envValues));
  return (
    <div style={detailContainerStyle}>
      <button
        onClick={model.clearSelection}
        className="text-interactive-accent"
        style={backButtonStyle}
      >
        &larr; Back to results
      </button>
      <ServerDetailHeader displayName={displayName} server={server} />
      <ServerMetadataSection server={server} pkg={pkg} />
      {pkg?.runtime && (
        <div style={runtimeContainerStyle}>
          <SectionLabel style={{ marginBottom: '6px' }}>Runtime Config</SectionLabel>
          <RuntimeInfo pkg={pkg} />
        </div>
      )}
      {envVars.length > 0 && !isInstalled && (
        <ServerEnvironmentVariablesSection
          envVars={envVars}
          envValues={envValues}
          onEnvChange={handleEnvChange}
        />
      )}
      <ServerInstallSection
        isInstalled={isInstalled}
        isInstalling={isInstalling}
        onInstall={handleInstall}
      />
    </div>
  );
}
