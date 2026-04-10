/**
 * workspaceTrust.ts — Minimal workspace trust gate.
 *
 * Binary trusted/restricted model. When a project root is not in the
 * trusted list, restricted mode disables:
 * - Hook installation
 * - Extension loading
 * - Claude auto-launch
 * - MCP server config writes
 *
 * Trusted paths are persisted in electron-store as `trustedWorkspaces`.
 */

import path from 'path';

import { getConfigValue, setConfigValue } from './config';
import log from './logger';

export type TrustLevel = 'trusted' | 'restricted';

function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getTrustedPaths(): string[] {
  return (getConfigValue('trustedWorkspaces') ?? []).map(normalizePath);
}

/** Check if a workspace path is trusted. */
export function isWorkspaceTrusted(workspacePath: string): boolean {
  const normalized = normalizePath(workspacePath);
  return getTrustedPaths().includes(normalized);
}

/** Get the trust level for a workspace path. */
export function getWorkspaceTrustLevel(workspacePath: string): TrustLevel {
  return isWorkspaceTrusted(workspacePath) ? 'trusted' : 'restricted';
}

/** Add a path to the trusted workspaces list. */
export function trustWorkspace(workspacePath: string): void {
  const normalized = normalizePath(workspacePath);
  const current = getTrustedPaths();
  if (current.includes(normalized)) return;

  const raw = getConfigValue('trustedWorkspaces') ?? [];
  setConfigValue('trustedWorkspaces', [...raw, workspacePath]);
  log.info(`[WorkspaceTrust] Trusted: ${workspacePath}`);
}

/** Remove a path from the trusted workspaces list. */
export function untrustWorkspace(workspacePath: string): void {
  const normalized = normalizePath(workspacePath);
  const raw = getConfigValue('trustedWorkspaces') ?? [];
  const filtered = raw.filter((p) => normalizePath(p) !== normalized);
  setConfigValue('trustedWorkspaces', filtered);
  log.info(`[WorkspaceTrust] Untrusted: ${workspacePath}`);
}

/**
 * Check trust level for a set of roots (multi-root workspace).
 * Least-privilege: if ANY root is untrusted, the window is restricted.
 */
export function getWindowTrustLevel(roots: string[]): TrustLevel {
  if (roots.length === 0) return 'restricted';
  return roots.every(isWorkspaceTrusted) ? 'trusted' : 'restricted';
}
