/** Type definitions for the extension store subsystem. */

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
    iconThemes?: Array<{ id: string; label: string; path: string }>;
    productIconThemes?: Array<{ id: string; label: string; path: string }>;
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

export interface PackageJsonContributes {
  themes?: Array<{ label?: string; uiTheme?: string; path?: string }>;
  iconThemes?: Array<{ id?: string; label?: string; path?: string }>;
  productIconThemes?: Array<{ id?: string; label?: string; path?: string }>;
  grammars?: Array<{ language?: string; scopeName?: string; path?: string }>;
  snippets?: Array<{ language?: string; path?: string }>;
  languages?: Array<{ id?: string; extensions?: string[]; configuration?: string }>;
}

export interface ExtensionPackageJson {
  displayName?: string;
  description?: string;
  version?: string;
  contributes?: PackageJsonContributes;
  [key: string]: unknown;
}
