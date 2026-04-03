import type {
  ExtensionIconDefinition,
  ExtensionIconThemeAssociations,
  ExtensionIconThemeData,
} from '../../types/electron';

type IconKind = 'file' | 'folder' | 'folderExpanded' | 'rootFolder' | 'rootFolderExpanded';

function normalize(name: string): string {
  return name.toLowerCase();
}

function getVariantAssociations(
  theme: ExtensionIconThemeData,
  appearance: 'light' | 'highContrast' | 'default',
): ExtensionIconThemeAssociations | undefined {
  if (appearance === 'light') return theme.light;
  if (appearance === 'highContrast') return theme.highContrast;
  return undefined;
}

function getMatchingExtensions(filename: string): string[] {
  const lower = normalize(filename);
  const parts = lower.split('.');
  if (parts.length <= 1) return [];

  const matches: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    matches.push(parts.slice(index).join('.'));
  }
  return matches;
}

function getDefinition(theme: ExtensionIconThemeData, iconId: string | undefined): ExtensionIconDefinition | null {
  if (!iconId) return null;
  return theme.iconDefinitions[iconId] ?? null;
}

function getIconId(
  theme: ExtensionIconThemeData,
  appearance: 'light' | 'highContrast' | 'default',
  key: keyof ExtensionIconThemeAssociations,
  name: string,
): string | undefined {
  const baseMap = theme[key];
  const variantMap = getVariantAssociations(theme, appearance)?.[key];
  return variantMap?.[normalize(name)] ?? baseMap?.[normalize(name)];
}

export function resolveFileIconUri(
  theme: ExtensionIconThemeData,
  filename: string,
  appearance: 'light' | 'highContrast' | 'default',
): ExtensionIconDefinition | null {
  const fileNameIconId = getIconId(theme, appearance, 'fileNames', filename);
  if (fileNameIconId) return getDefinition(theme, fileNameIconId);

  for (const extension of getMatchingExtensions(filename)) {
    const extensionIconId = getIconId(theme, appearance, 'fileExtensions', extension);
    if (extensionIconId) return getDefinition(theme, extensionIconId);
  }

  return getDefinition(theme, theme.file);
}

export interface ResolveFolderIconUriOptions {
  theme: ExtensionIconThemeData;
  folderName: string;
  open: boolean;
  appearance: 'light' | 'highContrast' | 'default';
  isRoot?: boolean;
}

export function resolveFolderIconUri({
  theme,
  folderName,
  open,
  appearance,
  isRoot = false,
}: ResolveFolderIconUriOptions): ExtensionIconDefinition | null {
  const associationKey = isRoot
    ? open
      ? 'rootFolderNamesExpanded'
      : 'rootFolderNames'
    : open
      ? 'folderNamesExpanded'
      : 'folderNames';
  const matchedIconId = getIconId(theme, appearance, associationKey, folderName);
  if (matchedIconId) return getDefinition(theme, matchedIconId);

  const fallbackKind: IconKind = isRoot
    ? open
      ? 'rootFolderExpanded'
      : 'rootFolder'
    : open
      ? 'folderExpanded'
      : 'folder';
  return getDefinition(theme, theme[fallbackKind]);
}

export function resolveIconThemeAppearance(
  activeThemeId: string,
): 'light' | 'highContrast' | 'default' {
  if (activeThemeId === 'light') return 'light';
  if (activeThemeId === 'high-contrast') return 'highContrast';
  return 'default';
}
