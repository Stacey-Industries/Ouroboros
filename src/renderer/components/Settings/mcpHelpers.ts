/**
 * mcpHelpers.ts — Types and helpers for MCP section.
 */

import type React from 'react';

import type { McpServerConfig,McpServerEntry } from '../../types/electron';

export interface EnvRow {
  key: string;
  value: string;
}

export interface ServerFormState {
  name: string;
  command: string;
  args: string;
  url: string;
  envRows: EnvRow[];
  scope: 'global' | 'project';
}

export const EMPTY_FORM: ServerFormState = {
  name: '', command: '', args: '', url: '', envRows: [], scope: 'global',
};

export function formToConfig(form: ServerFormState): McpServerConfig {
  const config: McpServerConfig = {};
  if (form.command.trim()) config.command = form.command;

  const args = form.args.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (args.length > 0) config.args = args;

  const env: Record<string, string> = {};
  for (const row of form.envRows) {
    const k = row.key.trim();
    if (k) env[k] = row.value;
  }
  if (Object.keys(env).length > 0) config.env = env;
  if (form.url.trim()) config.url = form.url.trim();

  return config;
}

export function configToForm(name: string, entry: McpServerEntry): ServerFormState {
  return {
    name,
    command: entry.config.command ?? '',
    args: (entry.config.args ?? []).join(' '),
    url: entry.config.url ?? '',
    envRows: Object.entries(entry.config.env ?? {}).map(([key, value]) => ({ key, value })),
    scope: entry.scope,
  };
}

export function summarizeArgs(args?: string[]): string {
  if (!args || args.length === 0) return '';
  const joined = args.join(' ');
  return joined.length > 60 ? joined.slice(0, 57) + '...' : joined;
}

export const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500,
};

export const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '4px',
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontSize: '12px', fontFamily: 'var(--font-ui)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

export const smallBtnStyle: React.CSSProperties = {
  padding: '3px 8px', borderRadius: '4px',
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontSize: '11px',
  cursor: 'pointer', whiteSpace: 'nowrap',
};
