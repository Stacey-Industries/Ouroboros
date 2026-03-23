/**
 * ipc-handlers/mcpStore.ts - IPC handlers for the MCP Server Store.
 *
 * Fetches from the Official MCP Registry (https://registry.modelcontextprotocol.io)
 * and installs servers by writing to Claude Code settings files.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { store } from '../config';
import {
  type McpRegistryPackage,
  type McpRegistryServer,
  normalizeServer,
  type RawRegistryListResponse,
  type RawRegistryServerEntry,
  searchNpmServers,
} from './mcpStoreSupport';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type SettingsRecord = Record<string, unknown>;
type ServerMap = Record<string, McpServerConfig>;
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T;
type HandlerFailure = { success: false; error: string };

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1';

// ─── Settings helpers (mirrored from mcp.ts) ─────────────────────────

function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function getProjectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json');
}

async function readSettingsFile(filePath: string): Promise<SettingsRecord> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getGlobalSettingsPath/getProjectSettingsPath
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as SettingsRecord;
  } catch (error: unknown) {
    // File not found is expected — return empty settings for first-time use
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    ) {
      return {};
    }
    // Other errors (parse failures, permission errors) should not silently return empty —
    // that would cause data loss when the settings are written back.
    console.error(`[mcpStore] Failed to read settings file ${filePath}:`, error);
    throw error;
  }
}

async function writeSettingsFile(filePath: string, data: SettingsRecord): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getGlobalSettingsPath/getProjectSettingsPath
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getGlobalSettingsPath/getProjectSettingsPath
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getStoredProjectRoot(): string | null {
  try {
    const roots: string[] = store.get('multiRoots', []);
    if (roots.length > 0) return roots[0];

    const defaultRoot: string = store.get('defaultProjectRoot', '');
    return defaultRoot || null;
  } catch {
    return null;
  }
}

function resolveProjectRoot(projectRoot?: string): string | null {
  return projectRoot ?? getStoredProjectRoot();
}

async function runHandler<T extends object>(
  action: () => Promise<T>,
): Promise<HandlerSuccess<T> | HandlerFailure> {
  try {
    return { success: true, ...(await action()) };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function registerHandler(channels: string[], channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

// ─── Registry helpers ─────────────────────────────────────────────────

function extractShortName(registryName: string): string {
  // "io.github.user/server-name" → "server-name"
  const slashIdx = registryName.lastIndexOf('/');
  if (slashIdx >= 0) return registryName.slice(slashIdx + 1);
  // Fallback: last dot-segment  "com.example.server" → "server"
  const dotIdx = registryName.lastIndexOf('.');
  if (dotIdx >= 0) return registryName.slice(dotIdx + 1);
  return registryName;
}

function getCommandAndPrefix(registryType: string): { command: string; prefix: string[] } {
  if (registryType === 'pypi') return { command: 'uvx', prefix: [] };
  if (registryType === 'docker') return { command: 'docker', prefix: ['run', '-i', '--rm'] };
  return { command: 'npx', prefix: ['-y'] };
}

function packageToConfig(pkg: McpRegistryPackage): McpServerConfig {
  const runtimeArgs = pkg.runtime?.args ?? [];
  const env = pkg.runtime?.env;
  const { command, prefix } = getCommandAndPrefix(pkg.registry_type);
  const config: McpServerConfig = {
    command,
    args: [...prefix, pkg.name, ...runtimeArgs],
  };
  if (env && Object.keys(env).length > 0) config.env = env;
  return config;
}

// ─── Handler implementations ──────────────────────────────────────────

async function searchServers(
  query: string,
  cursor?: string,
): Promise<{
  servers: McpRegistryServer[];
  nextCursor?: string;
}> {
  const params = new URLSearchParams({ limit: '20' });
  if (query) params.set('search', query);
  if (cursor) params.set('cursor', cursor);

  const url = `${REGISTRY_BASE}/servers?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Registry search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as RawRegistryListResponse;
  return {
    servers: (data.servers ?? []).map(normalizeServer),
    nextCursor: data.metadata?.nextCursor,
  };
}

async function getServerDetails(name: string): Promise<{ server: McpRegistryServer }> {
  const url = `${REGISTRY_BASE}/servers/${encodeURIComponent(name)}/versions/latest`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`);
  }

  // Detail endpoint returns a single entry in the same wrapped format
  const raw = (await response.json()) as RawRegistryServerEntry;
  return { server: normalizeServer(raw) };
}

function resolveSettingsPath(scope: 'global' | 'project'): string {
  if (scope === 'project' && !resolveProjectRoot()) {
    throw new Error('No project root available for project-scoped installation.');
  }
  return scope === 'global'
    ? getGlobalSettingsPath()
    : getProjectSettingsPath(resolveProjectRoot() ?? '');
}

async function addServerToSettings(
  filePath: string,
  shortName: string,
  config: McpServerConfig,
): Promise<void> {
  const settings = await readSettingsFile(filePath);
  const mcpServers = { ...((settings.mcpServers ?? {}) as ServerMap) };

  // eslint-disable-next-line security/detect-object-injection -- shortName derived from extractShortName
  if (mcpServers[shortName]) {
    throw new Error(`Server "${shortName}" already exists.`);
  }

  // eslint-disable-next-line security/detect-object-injection -- shortName derived from extractShortName
  mcpServers[shortName] = config;
  settings.mcpServers = mcpServers;
  await writeSettingsFile(filePath, settings);
}

async function installServer(
  server: McpRegistryServer,
  scope: 'global' | 'project',
  envOverrides?: Record<string, string>,
): Promise<Record<string, never>> {
  if (!server.packages || server.packages.length === 0) {
    throw new Error('Server has no installable packages.');
  }

  const pkg = server.packages[0];
  const config = packageToConfig(pkg);

  if (envOverrides && Object.keys(envOverrides).length > 0) {
    config.env = { ...(config.env ?? {}), ...envOverrides };
  }

  const filePath = resolveSettingsPath(scope);
  await addServerToSettings(filePath, extractShortName(server.name), config);
  return {};
}

async function getInstalledServerNames(): Promise<{ names: string[] }> {
  const names = new Set<string>();

  // Global settings
  const globalSettings = await readSettingsFile(getGlobalSettingsPath());
  for (const name of Object.keys((globalSettings.mcpServers ?? {}) as ServerMap)) {
    names.add(name);
  }
  for (const name of Object.keys((globalSettings.disabledMcpServers ?? {}) as ServerMap)) {
    names.add(name);
  }

  // Project settings
  const projectRoot = resolveProjectRoot();
  if (projectRoot) {
    const projectSettings = await readSettingsFile(getProjectSettingsPath(projectRoot));
    for (const name of Object.keys((projectSettings.mcpServers ?? {}) as ServerMap)) {
      names.add(name);
    }
    for (const name of Object.keys((projectSettings.disabledMcpServers ?? {}) as ServerMap)) {
      names.add(name);
    }
  }

  return { names: [...names] };
}

// ─── Registration ─────────────────────────────────────────────────────

export function registerMcpStoreHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  void _senderWindow;

  registerHandler(channels, 'mcpStore:search', async (_event, query: string, cursor?: string) =>
    runHandler(() => searchServers(query, cursor)),
  );

  registerHandler(channels, 'mcpStore:getDetails', async (_event, name: string) =>
    runHandler(() => getServerDetails(name)),
  );

  registerHandler(
    channels,
    'mcpStore:install',
    async (
      _event,
      server: McpRegistryServer,
      scope: 'global' | 'project',
      envOverrides?: Record<string, string>,
    ) => runHandler(() => installServer(server, scope, envOverrides)),
  );

  registerHandler(channels, 'mcpStore:getInstalled', async () =>
    runHandler(() => getInstalledServerNames()),
  );

  registerHandler(channels, 'mcpStore:searchNpm', async (_event, query: string, offset?: number) =>
    runHandler(() => searchNpmServers(query, offset)),
  );

  return channels;
}
