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
import {
  type ExtensionIconThemeData,
  type ExtensionProductIconThemeData,
  loadExtensionIconThemes,
  loadExtensionProductIconThemes,
} from '../contributions/iconThemeLoader';
import { loadExtensionThemes, type OuroborosTheme } from '../contributions/themeLoader';
import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';

export type { InstalledVsxExtension, InstallFromBufferOptions, VsxExtensionDetail, VsxExtensionSummary } from './extensionStoreTypes';
import type { ExtensionPackageJson, InstalledVsxExtension, InstallFromBufferOptions, PackageJsonContributes } from './extensionStoreTypes';

export const EXTENSIONS_DIR = path.join(os.homedir(), '.ouroboros', 'vsx-extensions');

function resolveLocalizedString(
  value: string | undefined,
  bundle: Record<string, string>,
): string | undefined {
  if (!value) return value;
  const match = /^%([^%]+)%$/.exec(value.trim());
  if (!match) return value;
  return bundle[match[1]] ?? value;
}

async function readLocalizationBundle(extensionRoot: string): Promise<Record<string, string>> {
  const bundlePath = path.join(extensionRoot, 'package.nls.json');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- extensionRoot is derived from validated extension archive contents
    return JSON.parse(await fs.readFile(bundlePath, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

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
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (!w.isDestroyed()) w.webContents.send(channel, data);
    } catch {
      // Render frame disposed — skip this window
    }
  }
  broadcastToWebClients(channel, data);
}

// ─── Installation helpers ─────────────────────────────────────────────────────

function buildThemeContributions(raw: PackageJsonContributes, root: string, bundle: Record<string, string>): InstalledVsxExtension['contributes'] {
  const c: InstalledVsxExtension['contributes'] = {};
  if (raw.themes?.length) c.themes = raw.themes.filter((t) => t.label && t.path).map((t) => ({ label: resolveLocalizedString(t.label!, bundle) ?? t.label!, uiTheme: t.uiTheme ?? 'vs-dark', path: path.join(root, t.path!) }));
  if (raw.iconThemes?.length) c.iconThemes = raw.iconThemes.filter((t) => t.id && t.label && t.path).map((t) => ({ id: t.id!, label: resolveLocalizedString(t.label!, bundle) ?? t.label!, path: path.join(root, t.path!) }));
  if (raw.productIconThemes?.length) c.productIconThemes = raw.productIconThemes.filter((t) => t.id && t.label && t.path).map((t) => ({ id: t.id!, label: resolveLocalizedString(t.label!, bundle) ?? t.label!, path: path.join(root, t.path!) }));
  return c;
}

function buildCodeContributions(raw: PackageJsonContributes, root: string): InstalledVsxExtension['contributes'] {
  const c: InstalledVsxExtension['contributes'] = {};
  if (raw.grammars?.length) c.grammars = raw.grammars.filter((g) => g.language && g.scopeName && g.path).map((g) => ({ language: g.language!, scopeName: g.scopeName!, path: path.join(root, g.path!) }));
  if (raw.snippets?.length) c.snippets = raw.snippets.filter((s) => s.language && s.path).map((s) => ({ language: s.language!, path: path.join(root, s.path!) }));
  if (raw.languages?.length) c.languages = raw.languages.filter((l) => l.id).map((l) => ({ id: l.id!, ...(l.extensions ? { extensions: l.extensions } : {}), ...(l.configuration ? { configuration: path.join(root, l.configuration) } : {}) }));
  return c;
}

function buildContributes(rawContributes: PackageJsonContributes, extensionRoot: string, localizationBundle: Record<string, string>): InstalledVsxExtension['contributes'] {
  return { ...buildThemeContributions(rawContributes, extensionRoot, localizationBundle), ...buildCodeContributions(rawContributes, extensionRoot) };
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

async function rehydrateInstalledEntry(
  entry: InstalledVsxExtension,
): Promise<InstalledVsxExtension> {
  try {
    const extensionRoot = path.join(entry.installPath, 'extension');
    const pkgJsonPath = path.join(extensionRoot, 'package.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- extensionRoot comes from an installed extension record
    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as ExtensionPackageJson;
    const localizationBundle = await readLocalizationBundle(extensionRoot);
    return {
      ...entry,
      displayName:
        resolveLocalizedString(pkgJson.displayName, localizationBundle) ?? entry.displayName,
      description:
        resolveLocalizedString(pkgJson.description, localizationBundle) ?? entry.description,
      contributes: buildContributes(pkgJson.contributes ?? {}, extensionRoot, localizationBundle),
    };
  } catch {
    return entry;
  }
}

export async function refreshInstalledListFromDisk(): Promise<InstalledVsxExtension[]> {
  const installed = getInstalledList();
  const refreshed = await Promise.all(installed.map((entry) => rehydrateInstalledEntry(entry)));
  setInstalledList(refreshed);
  return refreshed;
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
    const localizationBundle = await readLocalizationBundle(extensionRoot);
    const contributes = buildContributes(pkgJson.contributes ?? {}, extensionRoot, localizationBundle);
    const installed: InstalledVsxExtension = {
      id: extensionId,
      namespace,
      name,
      displayName:
        resolveLocalizedString(pkgJson.displayName, localizationBundle) ?? displayName ?? name,
      version,
      description:
        resolveLocalizedString(pkgJson.description, localizationBundle) ?? description ?? '',
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
  const installed = await refreshInstalledListFromDisk();
  const disabled = new Set(getDisabledList());
  const allThemes: OuroborosTheme[] = [];
  for (const ext of installed) {
    if (disabled.has(ext.id) || !ext.contributes.themes?.length) continue;
    allThemes.push(...(await loadExtensionThemes(ext.id, ext.contributes.themes)));
  }
  return { themes: allThemes };
}

export async function getIconThemeContributions(): Promise<{ iconThemes: ExtensionIconThemeData[] }> {
  const installed = await refreshInstalledListFromDisk();
  const disabled = new Set(getDisabledList());
  const allIconThemes: ExtensionIconThemeData[] = [];
  for (const ext of installed) {
    if (disabled.has(ext.id) || !ext.contributes.iconThemes?.length) continue;
    allIconThemes.push(...(await loadExtensionIconThemes(ext.id, ext.contributes.iconThemes)));
  }
  return { iconThemes: allIconThemes };
}

export async function getProductIconThemeContributions(): Promise<{
  productIconThemes: ExtensionProductIconThemeData[];
}> {
  const installed = await refreshInstalledListFromDisk();
  const disabled = new Set(getDisabledList());
  const allProductIconThemes: ExtensionProductIconThemeData[] = [];
  for (const ext of installed) {
    if (disabled.has(ext.id) || !ext.contributes.productIconThemes?.length) continue;
    allProductIconThemes.push(
      ...(await loadExtensionProductIconThemes(ext.id, ext.contributes.productIconThemes)),
    );
  }
  return { productIconThemes: allProductIconThemes };
}
