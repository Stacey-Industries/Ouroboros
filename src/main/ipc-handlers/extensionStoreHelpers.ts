/**
 * extensionStoreHelpers.ts — Store accessors, installation, and contribution management.
 *
 * Extracted from extensionStore.ts to keep each file under 300 lines.
 * Network operations (search, details, install from registry) are in extensionStoreApi.ts.
 */

import AdmZip from 'adm-zip';
import { BrowserWindow } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { store } from '../config';
import { loadExtensionThemes, type OuroborosTheme } from '../contributions/themeLoader';
import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';

export interface VsxExtensionSummary {
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

export const EXTENSIONS_DIR = path.join(os.homedir(), '.ouroboros', 'vsx-extensions');

// ─── Store accessors ─────────────────────────────────────────────────────────

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

export function broadcastToWindows(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, data));
  broadcastToWebClients(channel, data);
}

// ─── Installation helpers ─────────────────────────────────────────────────────

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
    log.error(`Failed to parse package.json for ${extensionId}:`, error);
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

export async function uninstallExtension(id: string): Promise<Record<string, never>> {
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

export async function enableContributions(id: string): Promise<Record<string, never>> {
  if (!getInstalledList().some((e) => e.id === id))
    throw new Error(`Extension "${id}" is not installed.`);
  const disabled = getDisabledList();
  if (!disabled.includes(id)) return {};
  setDisabledList(disabled.filter((d) => d !== id));
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: true });
  return {};
}

export async function disableContributions(id: string): Promise<Record<string, never>> {
  if (!getInstalledList().some((e) => e.id === id))
    throw new Error(`Extension "${id}" is not installed.`);
  const disabled = getDisabledList();
  if (disabled.includes(id)) return {};
  setDisabledList([...disabled, id]);
  broadcastToWindows('extensionStore:contributionsChanged', { id, enabled: false });
  return {};
}

export async function getThemeContributions(): Promise<{ themes: OuroborosTheme[] }> {
  const installed = getInstalledList();
  const disabled = new Set(getDisabledList());
  const allThemes: OuroborosTheme[] = [];
  for (const ext of installed) {
    if (disabled.has(ext.id) || !ext.contributes.themes?.length) continue;
    allThemes.push(...(await loadExtensionThemes(ext.id, ext.contributes.themes)));
  }
  return { themes: allThemes };
}
