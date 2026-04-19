/**
 * ipc-handlers/mcp.ts - IPC handlers for managing MCP server configurations.
 *
 * Reads and writes to:
 *  - ~/.claude/settings.json (global scope)
 *  - <projectRoot>/.claude/settings.json (project scope)
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { store } from '../config';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type McpScope = 'global' | 'project';
type SettingsRecord = Record<string, unknown>;
type ServerMap = Record<string, McpServerConfig>;
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T;
type HandlerFailure = { success: false; error: string };

interface NamedServerArgs {
  name: string;
  scope: McpScope;
  projectRoot?: string;
}

interface ConfiguredServerArgs extends NamedServerArgs {
  config: McpServerConfig;
}

interface ToggleServerArgs extends NamedServerArgs {
  enabled: boolean;
}

interface ServerBuckets {
  mcpServers: ServerMap;
  disabledMcpServers: ServerMap;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  scope: McpScope;
  enabled: boolean;
}

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
  } catch {
    return {};
  }
}

async function writeSettingsFile(filePath: string, data: SettingsRecord): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getGlobalSettingsPath/getProjectSettingsPath
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getGlobalSettingsPath/getProjectSettingsPath
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function extractServers(settings: SettingsRecord, scope: McpScope): McpServerEntry[] {
  const entries: McpServerEntry[] = [];

  for (const [name, config] of Object.entries((settings.mcpServers ?? {}) as ServerMap)) {
    entries.push({ name, config, scope, enabled: true });
  }

  for (const [name, config] of Object.entries((settings.disabledMcpServers ?? {}) as ServerMap)) {
    entries.push({ name, config, scope, enabled: false });
  }

  return entries;
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

function hasProjectRoot(projectRoot?: string): boolean {
  return resolveProjectRoot(projectRoot) !== null;
}

function getScopedSettingsPath(scope: McpScope, projectRoot?: string): string {
  return scope === 'global'
    ? getGlobalSettingsPath()
    : getProjectSettingsPath(resolveProjectRoot(projectRoot) ?? '');
}

async function loadScopedSettings(
  scope: McpScope,
  projectRoot?: string,
): Promise<{ filePath: string; settings: SettingsRecord }> {
  const filePath = getScopedSettingsPath(scope, projectRoot);
  const settings = await readSettingsFile(filePath);
  return { filePath, settings };
}

function getServerMap(
  settings: SettingsRecord,
  key: 'mcpServers' | 'disabledMcpServers',
): ServerMap {
  // eslint-disable-next-line security/detect-object-injection -- key is a typed union literal
  return { ...((settings[key] ?? {}) as ServerMap) };
}

function getServerBuckets(settings: SettingsRecord): ServerBuckets {
  return {
    mcpServers: getServerMap(settings, 'mcpServers'),
    disabledMcpServers: getServerMap(settings, 'disabledMcpServers'),
  };
}

function persistServerBuckets(settings: SettingsRecord, buckets: ServerBuckets): void {
  settings.mcpServers = buckets.mcpServers;
  if (Object.keys(buckets.disabledMcpServers).length > 0) {
    settings.disabledMcpServers = buckets.disabledMcpServers;
    return;
  }

  delete settings.disabledMcpServers;
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

async function getServers(projectRoot?: string): Promise<{ servers: McpServerEntry[] }> {
  const servers = extractServers(await readSettingsFile(getGlobalSettingsPath()), 'global');
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);

  if (resolvedProjectRoot) {
    const projectSettings = await readSettingsFile(getProjectSettingsPath(resolvedProjectRoot));
    servers.push(...extractServers(projectSettings, 'project'));
  }

  return { servers };
}

async function addServer(args: ConfiguredServerArgs): Promise<Record<string, never>> {
  if (args.scope === 'project' && !hasProjectRoot(args.projectRoot)) {
    throw new Error('No project root available for project-scoped server.');
  }

  const { filePath, settings } = await loadScopedSettings(args.scope, args.projectRoot);
  const buckets = getServerBuckets(settings);
  if (buckets.mcpServers[args.name]) {
    throw new Error(`Server "${args.name}" already exists in ${args.scope} scope.`);
  }

  buckets.mcpServers[args.name] = args.config;
  persistServerBuckets(settings, buckets);
  await writeSettingsFile(filePath, settings);
  return {};
}

async function removeServer(args: NamedServerArgs): Promise<Record<string, never>> {
  const { filePath, settings } = await loadScopedSettings(args.scope, args.projectRoot);
  const buckets = getServerBuckets(settings);

  delete buckets.mcpServers[args.name];
  delete buckets.disabledMcpServers[args.name];

  persistServerBuckets(settings, buckets);
  await writeSettingsFile(filePath, settings);
  return {};
}

async function updateServer(args: ConfiguredServerArgs): Promise<Record<string, never>> {
  const { filePath, settings } = await loadScopedSettings(args.scope, args.projectRoot);
  const buckets = getServerBuckets(settings);

  if (buckets.mcpServers[args.name]) {
    buckets.mcpServers[args.name] = args.config;
  } else if (buckets.disabledMcpServers[args.name]) {
    buckets.disabledMcpServers[args.name] = args.config;
  } else {
    throw new Error(`Server "${args.name}" not found in ${args.scope} scope.`);
  }

  persistServerBuckets(settings, buckets);
  await writeSettingsFile(filePath, settings);
  return {};
}

function moveServer(
  source: ServerMap,
  target: ServerMap,
  name: string,
  errorMessage: string,
): void {
  // eslint-disable-next-line security/detect-object-injection -- name is a server name from settings file
  const config = source[name];
  if (!config) throw new Error(errorMessage);

  // eslint-disable-next-line security/detect-object-injection -- name is a server name from settings file
  target[name] = config;
  // eslint-disable-next-line security/detect-object-injection -- name is a server name from settings file
  delete source[name];
}

async function toggleServer(args: ToggleServerArgs): Promise<Record<string, never>> {
  const { filePath, settings } = await loadScopedSettings(args.scope, args.projectRoot);
  const buckets = getServerBuckets(settings);

  if (args.enabled) {
    moveServer(
      buckets.disabledMcpServers,
      buckets.mcpServers,
      args.name,
      `Server "${args.name}" not found in disabled servers.`,
    );
  } else {
    moveServer(
      buckets.mcpServers,
      buckets.disabledMcpServers,
      args.name,
      `Server "${args.name}" not found in enabled servers.`,
    );
  }

  persistServerBuckets(settings, buckets);
  await writeSettingsFile(filePath, settings);
  return {};
}

/**
 * Returns the names of all registered MCP servers (both enabled and disabled)
 * from the global and, optionally, per-project Claude settings files.
 * Used by sessionCrud:setMcpOverrides to validate submitted server IDs.
 */
export async function getRegisteredMcpServerIds(projectRoot?: string): Promise<string[]> {
  const { servers } = await getServers(projectRoot);
  return servers.map((s) => s.name);
}

export function registerMcpHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  void _senderWindow;

  registerHandler(channels, 'mcp:getServers', async (_event, opts?: { projectRoot?: string }) =>
    runHandler(() => getServers(opts?.projectRoot)),
  );
  registerHandler(channels, 'mcp:addServer', async (_event, args: ConfiguredServerArgs) =>
    runHandler(() => addServer(args)),
  );
  registerHandler(channels, 'mcp:removeServer', async (_event, args: NamedServerArgs) =>
    runHandler(() => removeServer(args)),
  );
  registerHandler(channels, 'mcp:updateServer', async (_event, args: ConfiguredServerArgs) =>
    runHandler(() => updateServer(args)),
  );
  registerHandler(channels, 'mcp:toggleServer', async (_event, args: ToggleServerArgs) =>
    runHandler(() => toggleServer(args)),
  );

  return channels;
}
