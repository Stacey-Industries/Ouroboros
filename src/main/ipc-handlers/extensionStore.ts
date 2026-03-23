/**
 * ipc-handlers/extensionStore.ts - IPC handlers for the VSX Extension Store.
 */

import AdmZip from 'adm-zip';
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { getErrorMessage } from '../agentChat/utils';
import { store } from '../config';
import { loadExtensionThemes, type OuroborosTheme } from '../contributions/themeLoader';
import { broadcastToWebClients } from '../web/webServer';
import { registerMarketplaceHandlers } from './extensionStoreMarketplace';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type HandlerSuccess<T extends object = Record<string, never>> = { success: true } & T;
type HandlerFailure = { success: false; error: string };
interface VsxExtensionSummary {
  namespace: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  downloads: number;
  rating: number | null;
  averageRating: number | null;
  timestamp: string;
}
export interface VsxExtensionDetail extends VsxExtensionSummary {
  categories: string[];
  tags: string[];
  repository?: string;
  homepage?: string;
  bugs?: string;
  icon?: string;
  readme?: string;
  allVersions: Record<string, string>;
  files: Record<string, string>;
}
export interface InstalledVsxExtension {
  id: string;
  namespace: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  installPath: string;
  installedAt: string;
  contributes: {
    themes?: Array<{ label: string; uiTheme: string; path: string }>;
    grammars?: Array<{ language: string; scopeName: string; path: string }>;
    snippets?: Array<{ language: string; path: string }>;
    languages?: Array<{ id: string; extensions?: string[]; configuration?: string }>;
  };
}
interface VsxSearchApiResponse {
  totalSize: number;
  offset: number;
  extensions: Array<{
    namespace: string;
    name: string;
    displayName?: string;
    description?: string;
    version: string;
    downloadCount?: number;
    rating?: number | null;
    averageRating?: number | null;
    timestamp?: string;
    [key: string]: unknown;
  }>;
}
interface VsxDetailApiResponse {
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  downloadCount?: number;
  rating?: number | null;
  averageRating?: number | null;
  timestamp?: string;
  categories?: string[];
  tags?: string[];
  repository?: string;
  homepage?: string;
  bugs?: string;
  icon?: string;
  readme?: string;
  allVersions?: Record<string, string>;
  files?: Record<string, string>;
  [key: string]: unknown;
}
interface PackageJsonContributes {
  themes?: Array<{ label?: string; uiTheme?: string; path?: string }>;
  grammars?: Array<{ language?: string; scopeName?: string; path?: string }>;
  snippets?: Array<{ language?: string; path?: string }>;
  languages?: Array<{ id?: string; extensions?: string[]; configuration?: string }>;
}
interface ExtensionPackageJson {
  displayName?: string;
  description?: string;
  version?: string;
  contributes?: PackageJsonContributes;
  [key: string]: unknown;
}

const OPENVSX_BASE = 'https://open-vsx.org/api';
export const EXTENSIONS_DIR = path.join(os.homedir(), '.ouroboros', 'vsx-extensions');

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
export function broadcastToWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, data));
  broadcastToWebClients(channel, data);
}
export function getInstalledList(): InstalledVsxExtension[] {
  return store.get('installedVsxExtensions' as never, [] as never) as InstalledVsxExtension[];
}
export function setInstalledList(list: InstalledVsxExtension[]): void {
  store.set('installedVsxExtensions' as never, list as never);
}
export function getDisabledList(): string[] {
  return store.get('disabledVsxExtensions' as never, [] as never) as string[];
}
export function setDisabledList(list: string[]): void {
  store.set('disabledVsxExtensions' as never, list as never);
}
function extractNamespace(ns: unknown): string {
  if (typeof ns === 'string') return ns;
  if (ns && typeof ns === 'object' && 'name' in ns) return String((ns as { name: unknown }).name);
  return '';
}
function toSummary(raw: VsxSearchApiResponse['extensions'][number]): VsxExtensionSummary {
  return {
    namespace: extractNamespace(raw.namespace),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    description: raw.description ?? '',
    version: raw.version,
    downloads: raw.downloadCount ?? 0,
    rating: raw.rating ?? null,
    averageRating: raw.averageRating ?? null,
    timestamp: raw.timestamp ?? '',
  };
}
function toDetailBase(raw: VsxDetailApiResponse): VsxExtensionSummary {
  return {
    namespace: extractNamespace(raw.namespace),
    name: raw.name,
    displayName: raw.displayName ?? raw.name,
    description: raw.description ?? '',
    version: raw.version,
    downloads: raw.downloadCount ?? 0,
    rating: raw.rating ?? null,
    averageRating: raw.averageRating ?? null,
    timestamp: raw.timestamp ?? '',
  };
}
function toDetail(raw: VsxDetailApiResponse): VsxExtensionDetail {
  return {
    ...toDetailBase(raw),
    categories: raw.categories ?? [],
    tags: raw.tags ?? [],
    repository: raw.repository,
    homepage: raw.homepage,
    bugs: raw.bugs,
    icon: raw.icon,
    readme: raw.readme,
    allVersions: raw.allVersions ?? {},
    files: raw.files ?? {},
  };
}

function buildContributes(
  rawContributes: PackageJsonContributes,
  extensionRoot: string,
): InstalledVsxExtension['contributes'] {
  const contributes: InstalledVsxExtension['contributes'] = {};
  if (rawContributes.themes?.length)
    contributes.themes = rawContributes.themes
      .filter((t) => t.label && t.path)
      .map((t) => ({
        label: t.label!,
        uiTheme: t.uiTheme ?? 'vs-dark',
        path: path.join(extensionRoot, t.path!),
      }));
  if (rawContributes.grammars?.length)
    contributes.grammars = rawContributes.grammars
      .filter((g) => g.language && g.scopeName && g.path)
      .map((g) => ({
        language: g.language!,
        scopeName: g.scopeName!,
        path: path.join(extensionRoot, g.path!),
      }));
  if (rawContributes.snippets?.length)
    contributes.snippets = rawContributes.snippets
      .filter((s) => s.language && s.path)
      .map((s) => ({ language: s.language!, path: path.join(extensionRoot, s.path!) }));
  if (rawContributes.languages?.length)
    contributes.languages = rawContributes.languages
      .filter((l) => l.id)
      .map((l) => ({
        id: l.id!,
        ...(l.extensions ? { extensions: l.extensions } : {}),
        ...(l.configuration ? { configuration: path.join(extensionRoot, l.configuration) } : {}),
      }));
  return contributes;
}

async function readPackageJson(
  pkgJsonPath: string,
  extensionId: string,
  targetDir: string,
): Promise<ExtensionPackageJson> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from EXTENSIONS_DIR + validated extension ID
    return JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as ExtensionPackageJson;
  } catch (error) {
    console.error(`[extensionStore] Failed to parse package.json for ${extensionId}:`, error);
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Extension ${extensionId} has an invalid or missing package.json and cannot be installed.`,
    );
  }
}

async function extractAndParse(
  tempPath: string,
  extensionId: string,
): Promise<{ pkgJson: ExtensionPackageJson; targetDir: string; extensionRoot: string }> {
  const targetDir = path.join(EXTENSIONS_DIR, extensionId);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- targetDir derived from EXTENSIONS_DIR + validated extension ID
  await fs.mkdir(targetDir, { recursive: true });
  const zip = new AdmZip(tempPath);
  zip.extractAllTo(targetDir, true);
  const extensionRoot = path.join(targetDir, 'extension');
  return {
    pkgJson: await readPackageJson(
      path.join(extensionRoot, 'package.json'),
      extensionId,
      targetDir,
    ),
    targetDir,
    extensionRoot,
  };
}

function updateInstalledRegistry(
  extensionId: string,
  installed: InstalledVsxExtension,
  existing: InstalledVsxExtension[],
): void {
  const updatedList = existing.filter((e) => e.id !== extensionId);
  updatedList.push(installed);
  setInstalledList(updatedList);
  const disabled = getDisabledList();
  if (disabled.includes(extensionId)) setDisabledList(disabled.filter((id) => id !== extensionId));
}

async function searchExtensions(
  query: string,
  offset: number,
): Promise<{ extensions: VsxExtensionSummary[]; totalSize: number; offset: number }> {
  const params = new URLSearchParams({
    query,
    size: '20',
    offset: String(offset),
    sortBy: 'downloadCount',
  });
  const response = await fetch(`${OPENVSX_BASE}/-/search?${params.toString()}`);
  if (!response.ok)
    throw new Error(`Open VSX search failed: ${response.status} ${response.statusText}`);
  const data = (await response.json()) as VsxSearchApiResponse;
  return {
    extensions: (data.extensions ?? []).map(toSummary),
    totalSize: data.totalSize ?? 0,
    offset: data.offset ?? 0,
  };
}

async function getExtensionDetails(
  namespace: string,
  name: string,
): Promise<{ extension: VsxExtensionDetail }> {
  const response = await fetch(
    `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  );
  if (!response.ok)
    throw new Error(`Open VSX detail fetch failed: ${response.status} ${response.statusText}`);
  return { extension: toDetail((await response.json()) as VsxDetailApiResponse) };
}

async function fetchVsixDetail(
  namespace: string,
  name: string,
  version?: string,
): Promise<VsxDetailApiResponse> {
  const url = version
    ? `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    : `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  const resp = await fetch(url);
  if (!resp.ok)
    throw new Error(`Failed to fetch extension details: ${resp.status} ${resp.statusText}`);
  return (await resp.json()) as VsxDetailApiResponse;
}

async function downloadVsix(
  downloadUrl: string,
  extensionId: string,
): Promise<{ buffer: Buffer; tempPath: string }> {
  const vsixResponse = await fetch(downloadUrl);
  if (!vsixResponse.ok)
    throw new Error(`Failed to download VSIX: ${vsixResponse.status} ${vsixResponse.statusText}`);
  const buffer = Buffer.from(await vsixResponse.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `${extensionId}-${Date.now()}.vsix`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath derived from os.tmpdir() + sanitised extension ID
  await fs.writeFile(tempPath, buffer);
  return { buffer, tempPath };
}

export interface InstallFromBufferOptions {
  buffer: Buffer;
  tempPath: string;
  extensionId: string;
  namespace: string;
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  existing: InstalledVsxExtension[];
}
export async function installExtensionFromBuffer(
  options: InstallFromBufferOptions,
): Promise<InstalledVsxExtension> {
  const {
    buffer,
    tempPath,
    extensionId,
    namespace,
    name,
    version,
    displayName,
    description,
    existing,
  } = options;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath derived from os.tmpdir() + sanitised extension ID
    await fs.writeFile(tempPath, buffer);
    const { pkgJson, targetDir, extensionRoot } = await extractAndParse(tempPath, extensionId);
    const contributes = buildContributes(pkgJson.contributes ?? {}, extensionRoot);
    const installed: InstalledVsxExtension = {
      id: extensionId,
      namespace,
      name,
      displayName: pkgJson.displayName ?? displayName ?? name,
      version,
      description: pkgJson.description ?? description ?? '',
      installPath: targetDir,
      installedAt: new Date().toISOString(),
      contributes,
    };
    updateInstalledRegistry(extensionId, installed, existing);
    broadcastToWindows('extensionStore:installed', installed);
    return installed;
  } finally {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath derived from os.tmpdir() + sanitised extension ID
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function installExtension(
  namespace: string,
  name: string,
  version?: string,
): Promise<{ installed: InstalledVsxExtension }> {
  const detail = await fetchVsixDetail(namespace, name, version);
  const downloadUrl = detail.files?.['download'];
  if (!downloadUrl) throw new Error(`No download URL found for ${namespace}.${name}`);
  const extensionId = `${namespace}.${name}`;
  const existing = getInstalledList();
  const already = existing.find((e) => e.id === extensionId);
  if (already?.version === detail.version)
    throw new Error(`Extension ${extensionId} v${detail.version} is already installed.`);
  const { buffer, tempPath } = await downloadVsix(String(downloadUrl), extensionId);
  return {
    installed: await installExtensionFromBuffer({
      buffer,
      tempPath,
      extensionId,
      namespace,
      name,
      version: detail.version,
      displayName: detail.displayName,
      description: detail.description,
      existing,
    }),
  };
}

async function uninstallExtension(id: string): Promise<Record<string, never>> {
  const existing = getInstalledList();
  const entry = existing.find((e) => e.id === id);
  if (!entry) throw new Error(`Extension "${id}" is not installed.`);
  try {
    await fs.rm(entry.installPath, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
  setInstalledList(existing.filter((e) => e.id !== id));
  const disabled = getDisabledList();
  if (disabled.includes(id)) setDisabledList(disabled.filter((d) => d !== id));
  broadcastToWindows('extensionStore:uninstalled', { id });
  return {};
}

async function getInstalledExtensions(): Promise<{ extensions: InstalledVsxExtension[] }> {
  return { extensions: getInstalledList() };
}
async function enableContributions(id: string): Promise<Record<string, never>> {
  if (!getInstalledList().some((e) => e.id === id))
    throw new Error(`Extension "${id}" is not installed.`);
  const disabled = getDisabledList();
  if (!disabled.includes(id)) return {};
  setDisabledList(disabled.filter((d) => d !== id));
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: true });
  return {};
}

async function disableContributions(id: string): Promise<Record<string, never>> {
  if (!getInstalledList().some((e) => e.id === id))
    throw new Error(`Extension "${id}" is not installed.`);
  const disabled = getDisabledList();
  if (disabled.includes(id)) return {};
  setDisabledList([...disabled, id]);
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: false });
  return {};
}

async function getThemeContributions(): Promise<{ themes: OuroborosTheme[] }> {
  const installed = getInstalledList();
  const disabled = new Set(getDisabledList());
  const allThemes: OuroborosTheme[] = [];
  for (const ext of installed) {
    if (disabled.has(ext.id) || !ext.contributes.themes?.length) continue;
    allThemes.push(...(await loadExtensionThemes(ext.id, ext.contributes.themes)));
  }
  return { themes: allThemes };
}

export function registerExtensionStoreHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];
  registerHandler(
    channels,
    'extensionStore:search',
    async (_event, query: string, offset?: number) =>
      runHandler(() => searchExtensions(query, offset ?? 0)),
  );
  registerHandler(
    channels,
    'extensionStore:getDetails',
    async (_event, namespace: string, name: string) =>
      runHandler(() => getExtensionDetails(namespace, name)),
  );
  registerHandler(
    channels,
    'extensionStore:install',
    async (_event, namespace: string, name: string, version?: string) =>
      runHandler(() => installExtension(namespace, name, version)),
  );
  registerHandler(channels, 'extensionStore:uninstall', async (_event, id: string) =>
    runHandler(() => uninstallExtension(id)),
  );
  registerHandler(channels, 'extensionStore:getInstalled', async () =>
    runHandler(() => getInstalledExtensions()),
  );
  registerHandler(channels, 'extensionStore:enableContributions', async (_event, id: string) =>
    runHandler(() => enableContributions(id)),
  );
  registerHandler(channels, 'extensionStore:disableContributions', async (_event, id: string) =>
    runHandler(() => disableContributions(id)),
  );
  registerHandler(channels, 'extensionStore:getThemeContributions', async () =>
    runHandler(() => getThemeContributions()),
  );
  registerMarketplaceHandlers(channels, registerHandler);
  return channels;
}
