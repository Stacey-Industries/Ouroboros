import fs from 'fs/promises';
import path from 'path';

export interface ExtensionIconThemeAssociations {
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  rootFolderNames?: Record<string, string>;
  rootFolderNamesExpanded?: Record<string, string>;
}

export interface ExtensionIconFontDefinition {
  id: string;
  family: string;
  srcPath: string;
  weight?: string;
  style?: string;
  size?: string;
}

export interface ExtensionIconDefinition {
  iconPath?: string;
  fontCharacter?: string;
  fontColor?: string;
  fontId?: string;
}

export interface ExtensionIconThemeData extends ExtensionIconThemeAssociations {
  id: string;
  extensionId: string;
  label: string;
  iconDefinitions: Record<string, ExtensionIconDefinition>;
  fonts: ExtensionIconFontDefinition[];
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  hidesExplorerArrows?: boolean;
  light?: ExtensionIconThemeAssociations;
  highContrast?: ExtensionIconThemeAssociations;
}

export interface ExtensionProductIconThemeData {
  id: string;
  extensionId: string;
  label: string;
  iconDefinitions: Record<string, ExtensionIconDefinition>;
  fonts: ExtensionIconFontDefinition[];
}

interface IconThemeJson extends ExtensionIconThemeAssociations {
  fonts?: Array<{
    id?: string;
    src?: Array<{ path?: string; format?: string }>;
    weight?: string;
    style?: string;
    size?: string;
  }>;
  iconDefinitions?: Record<
    string,
    { iconPath?: string; fontCharacter?: string; fontColor?: string; fontId?: string }
  >;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  hidesExplorerArrows?: boolean;
  light?: ExtensionIconThemeAssociations;
  highContrast?: ExtensionIconThemeAssociations;
}

interface ProductIconThemeJson {
  fonts?: IconThemeJson['fonts'];
  iconDefinitions?: IconThemeJson['iconDefinitions'];
}

/** Advance past a line comment, returning the new index. */
function skipLineComment(input: string, start: number): number {
  let i = start;
  while (i < input.length && input.charAt(i) !== '\n') i += 1;
  return i;
}

/** Advance past a block comment, returning the index after the closing star-slash. */
function skipBlockComment(input: string, start: number): number {
  let i = start + 2;
  while (i < input.length && !(input.charAt(i) === '*' && input.charAt(i + 1) === '/')) i += 1;
  return i + 1;
}

interface StringState { inString: boolean; escaped: boolean }

/** Process one character while inside a JSON string literal. Returns the updated state. */
function advanceStringChar(ch: string, state: StringState): StringState {
  const nextEscaped = !state.escaped && ch === '\\';
  const closed = !state.escaped && ch === '"';
  return { inString: !closed, escaped: nextEscaped };
}

function stripJsonComments(input: string): string {
  let result = '';
  const st: StringState = { inString: false, escaped: false };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charAt(i);
    const nx = input.charAt(i + 1);

    if (st.inString) {
      result += ch;
      Object.assign(st, advanceStringChar(ch, st));
      continue;
    }
    if (ch === '"') { st.inString = true; result += ch; continue; }
    if (ch === '/' && nx === '/') { i = skipLineComment(input, i); if (i < input.length) result += input.charAt(i); continue; }
    if (ch === '/' && nx === '*') { i = skipBlockComment(input, i); continue; }
    result += ch;
  }
  return result;
}

/** Check if a comma at `index` is trailing (followed only by whitespace then `}` or `]`). */
function isTrailingComma(input: string, index: number): boolean {
  let la = index + 1;
  while (la < input.length && /\s/.test(input.charAt(la))) la += 1;
  const next = input.charAt(la);
  return next === '}' || next === ']';
}

function stripTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charAt(i);

    if (inString) {
      result += ch;
      escaped = !escaped && ch === '\\';
      if (!escaped && ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; continue; }
    if (ch === ',' && isTrailingComma(input, i)) continue;
    result += ch;
  }
  return result;
}

function parseJsonc(raw: string): IconThemeJson {
  const withoutBom = raw.replace(/^\uFEFF/, '');
  return JSON.parse(stripTrailingCommas(stripJsonComments(withoutBom))) as IconThemeJson;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeAssociations(
  value: ExtensionIconThemeAssociations | undefined,
): ExtensionIconThemeAssociations | undefined {
  if (!value) return undefined;
  return {
    fileExtensions: value.fileExtensions,
    fileNames: value.fileNames,
    folderNames: value.folderNames,
    folderNamesExpanded: value.folderNamesExpanded,
    rootFolderNames: value.rootFolderNames,
    rootFolderNamesExpanded: value.rootFolderNamesExpanded,
  };
}

function resolveFonts(
  fonts: IconThemeJson['fonts'],
  iconThemeJsonPath: string,
  extensionId: string,
  themeSlug: string,
): ExtensionIconFontDefinition[] {
  const iconThemeDir = path.dirname(iconThemeJsonPath);
  return (fonts ?? [])
    .filter((font) => font.id && font.src?.[0]?.path)
    .map((font) => ({
      id: font.id!,
      family: `ext-icon-${extensionId}-${themeSlug}-${font.id!}`,
      srcPath: path.resolve(iconThemeDir, font.src![0].path!),
      weight: font.weight,
      style: font.style,
      size: font.size,
    }));
}

/** Resolve a single icon definition entry. */
function resolveOneIcon(
  definition: { iconPath?: string; fontCharacter?: string; fontColor?: string; fontId?: string },
  iconThemeDir: string,
  defaultFontId: string | undefined,
): ExtensionIconDefinition {
  const entry: ExtensionIconDefinition = {};
  if (definition.iconPath) entry.iconPath = path.resolve(iconThemeDir, definition.iconPath);
  if (definition.fontCharacter) entry.fontCharacter = definition.fontCharacter;
  if (definition.fontColor) entry.fontColor = definition.fontColor;
  const fontId = definition.fontId ?? defaultFontId;
  if (fontId) entry.fontId = fontId;
  return entry;
}

function resolveIconDefinitions(
  definitions: IconThemeJson['iconDefinitions'],
  iconThemeJsonPath: string,
  fonts: ExtensionIconFontDefinition[],
): Record<string, ExtensionIconDefinition> {
  const iconThemeDir = path.dirname(iconThemeJsonPath);
  const resolved = new Map<string, ExtensionIconDefinition>();
  const defaultFontId = fonts[0]?.id;

  for (const [iconId, definition] of Object.entries(definitions ?? {})) {
    if (!definition) continue;
    resolved.set(iconId, resolveOneIcon(definition, iconThemeDir, defaultFontId));
  }
  return Object.fromEntries(resolved);
}

export async function loadExtensionIconThemes(
  extensionId: string,
  iconThemeContributions: Array<{ id: string; label: string; path: string }>,
): Promise<ExtensionIconThemeData[]> {
  const themes: ExtensionIconThemeData[] = [];

  for (const contribution of iconThemeContributions) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from validated extension contribution metadata
      const raw = await fs.readFile(contribution.path, 'utf-8');
      const themeJson = parseJsonc(raw);
      const themeSlug = slugify(contribution.id || contribution.label);
      const fonts = resolveFonts(themeJson.fonts, contribution.path, extensionId, themeSlug);
      themes.push({
        id: `icon:${extensionId}:${themeSlug}`,
        extensionId,
        label: contribution.label,
        iconDefinitions: resolveIconDefinitions(themeJson.iconDefinitions, contribution.path, fonts),
        fonts,
        file: themeJson.file,
        folder: themeJson.folder,
        folderExpanded: themeJson.folderExpanded,
        rootFolder: themeJson.rootFolder,
        rootFolderExpanded: themeJson.rootFolderExpanded,
        hidesExplorerArrows: themeJson.hidesExplorerArrows,
        fileExtensions: themeJson.fileExtensions,
        fileNames: themeJson.fileNames,
        folderNames: themeJson.folderNames,
        folderNamesExpanded: themeJson.folderNamesExpanded,
        rootFolderNames: themeJson.rootFolderNames,
        rootFolderNamesExpanded: themeJson.rootFolderNamesExpanded,
        light: normalizeAssociations(themeJson.light),
        highContrast: normalizeAssociations(themeJson.highContrast),
      });
    } catch {
      // Ignore malformed icon theme contributions.
    }
  }

  return themes;
}

export async function loadExtensionProductIconThemes(
  extensionId: string,
  productIconThemeContributions: Array<{ id: string; label: string; path: string }>,
): Promise<ExtensionProductIconThemeData[]> {
  const themes: ExtensionProductIconThemeData[] = [];

  for (const contribution of productIconThemeContributions) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from validated extension contribution metadata
      const raw = await fs.readFile(contribution.path, 'utf-8');
      const themeJson = parseJsonc(raw) as ProductIconThemeJson;
      const themeSlug = slugify(contribution.id || contribution.label);
      const fonts = resolveFonts(themeJson.fonts, contribution.path, extensionId, themeSlug);
      themes.push({
        id: `product-icon:${extensionId}:${themeSlug}`,
        extensionId,
        label: contribution.label,
        iconDefinitions: resolveIconDefinitions(themeJson.iconDefinitions, contribution.path, fonts),
        fonts,
      });
    } catch {
      // Ignore malformed product icon theme contributions.
    }
  }

  return themes;
}
