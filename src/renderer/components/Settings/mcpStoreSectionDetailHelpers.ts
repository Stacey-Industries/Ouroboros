/**
 * mcpStoreSectionDetailHelpers.ts — Pure helper functions for McpStoreSectionDetail.
 */

import type React from 'react';

import type { McpRegistryEnvVar, McpRegistryServer } from '../../types/electron';

export function extractShortName(name: string | undefined): string {
  if (!name) return 'Unknown Server';
  const slashIdx = name.lastIndexOf('/');
  return slashIdx >= 0 ? name.slice(slashIdx + 1) : name;
}

export function mcpExtractShortName(name: string | undefined): string {
  return extractShortName(name);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function buildCommand(pkg: McpRegistryServer['packages'][0]): string {
  switch (pkg.registry_type) {
    case 'npm':
      return `npx -y ${pkg.name}`;
    case 'pypi':
      return `uvx ${pkg.name}`;
    case 'docker':
      return `docker run -i --rm ${pkg.name}`;
    default:
      return pkg.name;
  }
}

export function getEnvironmentVariables(
  pkg?: NonNullable<McpRegistryServer['packages'][0]>,
): McpRegistryEnvVar[] {
  return pkg && 'environmentVariables' in pkg ? (pkg.environmentVariables ?? []) : [];
}

export function installButtonStyle(disabled: boolean): React.CSSProperties {
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
