/**
 * extensionStoreContributions.ts — Theme and icon-theme contribution loaders.
 *
 * Extracted from extensionStoreHelpers.ts to keep that file under 300 lines.
 */

import {
  type ExtensionIconThemeData,
  type ExtensionProductIconThemeData,
  loadExtensionIconThemes,
  loadExtensionProductIconThemes,
} from '../contributions/iconThemeLoader';
import { loadExtensionThemes, type OuroborosTheme } from '../contributions/themeLoader';
import { getDisabledList, refreshInstalledListFromDisk } from './extensionStoreHelpers';

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

export async function getIconThemeContributions(): Promise<{
  iconThemes: ExtensionIconThemeData[];
}> {
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
