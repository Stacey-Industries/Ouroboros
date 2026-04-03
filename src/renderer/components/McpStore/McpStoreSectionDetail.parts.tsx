/**
 * McpStoreSectionDetail.parts.tsx — Sub-components extracted to keep the main file under 300 lines.
 */

import React from 'react';

import type { McpRegistryServer } from '../../types/electron';
import { buildCommand, formatDate } from './mcpStoreSectionDetailHelpers';
import {
  metadataContainerStyle,
  metadataLabelStyle,
  metadataRowStyle,
  metadataValueStyle,
  monoLineStyle,
  runtimeBodyStyle,
  runtimeLabelStyle,
} from './mcpStoreSectionDetailStyles';

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

export function RuntimeInfo({
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
