/**
 * codemodeManager.ts — Public API for the Code Mode lifecycle.
 *
 * Wave 53k file-targeting fix. The real work is split across:
 *   - `codemodeManagerFiles.ts` — paths, atomic JSON I/O, restoration record
 *   - `codemodeManagerScopes.ts` — global/project enable + restore helpers
 *
 * Phase B″: project-scope disable now removes the entry from `<root>/.mcp.json`
 * (destructive write) rather than toggling a flag. Empirical reason: Claude
 * Code v2.1.122 on Windows ignored both `--strict-mcp-config` and
 * `disabledMcpjsonServers` for `.mcp.json` discovery, so the agent kept seeing
 * the un-multiplexed ouroboros tools. Crash safety comes from the on-disk
 * restoration file (`~/.claude/codemode-managed.json`) plus self-healing on
 * enable.
 *
 * This file holds the stable public surface (`enableCodeMode`,
 * `disableCodeMode`, `getMcpServers`, `getCodeModeStatus`, `isCodeModeEnabled`)
 * and the small amount of in-process state we still keep in memory.
 */

import fs from 'fs/promises';

import log from '../logger';
import {
  augmentProxyServers,
  deleteRestorationFile,
  getProjectEntry,
  getProjectsMap,
  isProjectServerEnabled,
  type McpServerConfig,
  PROXY_CONFIG_PATH,
  readJsonTolerant,
  readRestorationFile,
  userClaudeJsonPath,
  writeProxyConfig,
  writeRestorationFile,
} from './codemodeManagerFiles';
import {
  applyGlobalEnable,
  applyProjectEnable,
  readGlobalServers,
  readProjectServerMap,
  restoreGlobal,
  restoreProject,
  rollbackEmptyEnable,
} from './codemodeManagerScopes';
import type { CodeModeStatusResult } from './types';

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  scope: 'global' | 'project';
  enabled: boolean;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let codemodeEnabled = false;
let proxiedServerNames: string[] = [];
let generatedTypesCache = '';

// ─── Server discovery ────────────────────────────────────────────────────────

function collectGlobalEntries(servers: Record<string, McpServerConfig>): McpServerEntry[] {
  const out: McpServerEntry[] = [];
  for (const [name, config] of Object.entries(servers)) {
    if (name === '__codemode_proxy') continue;
    out.push({ name, config, scope: 'global', enabled: true });
  }
  return out;
}

async function collectProjectEntries(projectRoot: string): Promise<McpServerEntry[]> {
  const servers = await readProjectServerMap(projectRoot);
  const claudeJson = await readJsonTolerant(userClaudeJsonPath(), '~/.claude.json');
  const entry = getProjectEntry(getProjectsMap(claudeJson), projectRoot);
  return Object.entries(servers).map(([name, config]) => ({
    name,
    config,
    scope: 'project' as const,
    enabled: isProjectServerEnabled(name, entry),
  }));
}

export async function getMcpServers(projectRoot?: string): Promise<McpServerEntry[]> {
  const global = collectGlobalEntries(await readGlobalServers());
  if (!projectRoot) return global;
  return [...global, ...(await collectProjectEntries(projectRoot))];
}

// ─── Crash recovery ──────────────────────────────────────────────────────────

/**
 * If a restoration file from a prior crashed enable still exists, apply it
 * before starting a fresh enable. Belt-and-suspenders: also catches the case
 * where a previous IDE process exited mid-enable and left the user's config
 * in the half-managed state.
 */
// Wave 60 Phase E: removed `stripOuroborosFromProject`. The Wave 53l
// Phase A+ guard was needed because the bridge baked a port into the
// stashed entry's args; restoring a stale entry would inject a dead
// port. Wave 60's standalone is portless and stable across sessions,
// so restoring the ouroboros entry is now safe (and correct — the IDE's
// fresh injection will idempotently overwrite it on next startup).

async function maybeRestoreFromCrash(): Promise<void> {
  const record = await readRestorationFile();
  if (!record) return;
  log.warn('[codemode] stale restoration file detected — recovering from prior crashed enable');
  try {
    await restoreGlobal(record.global ?? {});
    await restoreProject(record.project ?? {});
  } finally {
    await deleteRestorationFile();
  }
}

// ─── Enable Code Mode ─────────────────────────────────────────────────────────

function partitionByScope(
  entries: McpServerEntry[],
  serverNames: string[],
): { global: string[]; project: string[] } {
  const lookup = new Map<string, 'global' | 'project'>();
  for (const e of entries) lookup.set(e.name, e.scope);
  const result: { global: string[]; project: string[] } = { global: [], project: [] };
  for (const name of serverNames) {
    const scope = lookup.get(name);
    if (scope === 'global') result.global.push(name);
    else if (scope === 'project') result.project.push(name);
  }
  return result;
}

async function applyEnable(
  serverNames: string[],
  projectRoot?: string,
): Promise<{
  proxied: Record<string, McpServerConfig>;
  globalBackup: Record<string, McpServerConfig>;
  projectBackup: Record<string, McpServerConfig>;
}> {
  const allServers = await getMcpServers(projectRoot);
  const partitioned = partitionByScope(allServers, serverNames);
  const globalResult = await applyGlobalEnable(partitioned.global);
  const projectResult = projectRoot
    ? await applyProjectEnable(projectRoot, partitioned.project)
    : { proxiedConfigs: {}, backup: {} };
  return {
    proxied: { ...globalResult.proxiedConfigs, ...projectResult.proxiedConfigs },
    globalBackup: globalResult.backup,
    projectBackup: projectResult.backup,
  };
}

export async function enableCodeMode(
  serverNames: string[],
  _scope: 'global' | 'project',
  projectRoot?: string,
): Promise<{ success: boolean; error?: string }> {
  if (codemodeEnabled) {
    return { success: false, error: 'Code Mode is already enabled. Disable it first.' };
  }
  try {
    await maybeRestoreFromCrash();
    const { proxied, globalBackup, projectBackup } = await applyEnable(serverNames, projectRoot);
    const proxiedNames = Object.keys(proxied);
    if (proxiedNames.length === 0) {
      await rollbackEmptyEnable();
      return { success: false, error: 'None of the requested MCP servers were found in settings.' };
    }
    const proxyServers = augmentProxyServers(proxied);
    await writeProxyConfig(proxyServers);
    await writeRestorationFile({
      version: 2,
      global: globalBackup,
      project:
        Object.keys(projectBackup).length > 0 && projectRoot
          ? { [projectRoot]: projectBackup }
          : {},
      proxiedNames: Object.keys(proxyServers),
      activeProjectRoot: projectRoot,
    });
    codemodeEnabled = true;
    proxiedServerNames = proxiedNames;
    generatedTypesCache = '';
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Disable Code Mode ────────────────────────────────────────────────────────

async function cleanupProxyTempConfig(): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known module constant
    await fs.unlink(PROXY_CONFIG_PATH);
  } catch {
    /* non-fatal */
  }
}

export async function disableCodeMode(): Promise<{ success: boolean; error?: string }> {
  if (!codemodeEnabled) {
    return { success: false, error: 'Code Mode is not currently enabled.' };
  }
  try {
    const record = await readRestorationFile();
    await restoreGlobal(record?.global ?? {});
    await restoreProject(record?.project ?? {});
    await deleteRestorationFile();
    await cleanupProxyTempConfig();

    codemodeEnabled = false;
    proxiedServerNames = [];
    generatedTypesCache = '';
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Status queries ───────────────────────────────────────────────────────────

export function getCodeModeStatus(): CodeModeStatusResult {
  return {
    enabled: codemodeEnabled,
    proxiedServers: [...proxiedServerNames],
    generatedTypes: generatedTypesCache,
  };
}

export function isCodeModeEnabled(): boolean {
  return codemodeEnabled;
}

// Internal — for tests only.
export function __resetCodemodeState(): void {
  codemodeEnabled = false;
  proxiedServerNames = [];
  generatedTypesCache = '';
}

// Re-export McpServerConfig for external consumers (claudeCodeMode and ipc).
export type { McpServerConfig };
