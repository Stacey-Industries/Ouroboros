/**
 * extensionStoreMarketplace.ts — VS Code Marketplace handlers for the extension store.
 *
 * Handles search, detail fetch, and install from the VS Code Marketplace API.
 * Registered by extensionStore.ts.
 */

import { ipcMain } from 'electron';
import os from 'os';
import path from 'path';

import {
  broadcastToWindows,
  getDisabledList,
  getInstalledList,
  InstalledVsxExtension,
  installExtensionFromBuffer,
  setDisabledList,
  VsxExtensionDetail,
} from './extensionStore';

type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type RegisterHandlerFn = (channels: string[], channel: string, handler: IpcHandler) => void;

const MARKETPLACE_BASE = 'https://marketplace.visualstudio.com/_apis/public/gallery';

// ─── Marketplace API types ────────────────────────────────────────────

interface MarketplaceVersion {
  version: string;
  lastUpdated: string;
  assetUri: string;
  files: Array<{ assetType: string; source: string }>;
}

interface MarketplaceExtension {
  publisher: { publisherName: string; displayName: string };
  extensionName: string;
  displayName: string;
  shortDescription: string;
  versions: MarketplaceVersion[];
  statistics: Array<{ statisticName: string; value: number }>;
  categories: string[];
  tags: string[];
}

interface MarketplaceQueryResponse {
  results: Array<{
    extensions: MarketplaceExtension[];
    resultMetadata: Array<{
      metadataType: string;
      metadataItems: Array<{ name: string; count: number }>;
    }>;
  }>;
}

// ─── Shared marketplace helpers ───────────────────────────────────────

function getStatValue(statistics: MarketplaceExtension['statistics'], name: string): number | null {
  return statistics?.find((s) => s.statisticName === name)?.value ?? null;
}

function getLatestVersion(ext: MarketplaceExtension): MarketplaceVersion | undefined {
  return ext.versions?.[0];
}

function getMarketplaceIconUrl(ext: MarketplaceExtension): string | undefined {
  const files = getLatestVersion(ext)?.files;
  const iconFile =
    files?.find((f) => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default') ??
    files?.find((f) => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Small');
  return iconFile?.source;
}

function buildVersionMap(versions: MarketplaceVersion[]): Record<string, string> {
  const allVersions: Record<string, string> = {};
  for (const v of versions ?? []) allVersions[v.version] = v.assetUri ?? '';
  return allVersions;
}

function getMarketplaceStats(ext: MarketplaceExtension): {
  installs: number;
  rating: number | null;
} {
  return {
    installs: getStatValue(ext.statistics, 'install') ?? 0,
    rating: getStatValue(ext.statistics, 'averagerating'),
  };
}

function marketplaceToSummary(ext: MarketplaceExtension): VsxExtensionDetail {
  const { installs, rating } = getMarketplaceStats(ext);
  const latestVersion = getLatestVersion(ext);
  return {
    namespace: ext.publisher.publisherName,
    name: ext.extensionName,
    displayName: ext.displayName || ext.extensionName,
    description: ext.shortDescription ?? '',
    version: latestVersion?.version ?? '',
    downloads: installs,
    rating,
    averageRating: rating,
    timestamp: latestVersion?.lastUpdated ?? '',
    categories: ext.categories ?? [],
    tags: ext.tags ?? [],
    icon: getMarketplaceIconUrl(ext),
    readme: undefined,
    allVersions: buildVersionMap(ext.versions),
    files: {},
  };
}

function buildCriteria(
  namespace: string,
  name: string,
  category?: string,
): Array<{ filterType: number; value: string }> {
  const criteria: Array<{ filterType: number; value: string }> = [
    { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
  ];
  if (namespace && name) {
    criteria.push({ filterType: 7, value: `${namespace}.${name}` });
  } else {
    if (namespace.trim()) criteria.push({ filterType: 10, value: namespace.trim() });
    if (category) criteria.push({ filterType: 5, value: category });
  }
  return criteria;
}

function buildMarketplaceQueryBody(
  namespace: string,
  name: string,
  offset: number,
  category?: string,
): object {
  return {
    filters: [
      {
        criteria: buildCriteria(namespace, name, category),
        pageNumber: Math.floor(offset / 20) + 1,
        pageSize: 20,
        sortBy: 4,
        sortOrder: 2,
      },
    ],
    assetTypes: [],
    flags: 0x192,
  };
}

function buildSearchBody(query: string, offset: number, category?: string): object {
  return {
    filters: [
      {
        criteria: buildCriteria(query.trim(), '', category),
        pageNumber: Math.floor(offset / 20) + 1,
        pageSize: 20,
        sortBy: 4,
        sortOrder: 2,
      },
    ],
    assetTypes: [],
    flags: 0x192,
  };
}

async function queryMarketplace(body: object): Promise<MarketplaceQueryResponse> {
  const response = await fetch(`${MARKETPLACE_BASE}/extensionquery`, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=3.0-preview.1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`VS Code Marketplace query failed: ${response.status} ${response.statusText}`);
  return (await response.json()) as MarketplaceQueryResponse;
}

// ─── Handler implementations ──────────────────────────────────────────

async function searchMarketplace(
  query: string,
  offset: number = 0,
  category?: string,
): Promise<{ extensions: VsxExtensionDetail[]; totalSize: number; offset: number }> {
  const data = await queryMarketplace(buildSearchBody(query, offset, category));
  const result = data.results?.[0];
  const extensions = mapMarketplaceExtensions(result?.extensions);
  return { extensions, totalSize: getMarketplaceTotalCount(result, extensions.length), offset };
}

function mapMarketplaceExtensions(
  extensions: MarketplaceExtension[] | undefined,
): VsxExtensionDetail[] {
  return (extensions ?? []).map(marketplaceToSummary);
}

function getMarketplaceTotalCount(
  result: MarketplaceQueryResponse['results'][number] | undefined,
  fallback: number,
): number {
  const totalMeta = result?.resultMetadata?.find((m) => m.metadataType === 'ResultCount');
  return totalMeta?.metadataItems?.find((i) => i.name === 'TotalCount')?.count ?? fallback;
}

async function tryFetchReadme(ext: MarketplaceExtension): Promise<string | undefined> {
  const readmeFile = ext.versions?.[0]?.files?.find(
    (f) => f.assetType === 'Microsoft.VisualStudio.Services.Content.Details',
  );
  if (!readmeFile?.source) return undefined;
  try {
    const resp = await fetch(readmeFile.source, { signal: AbortSignal.timeout(15_000) });
    return resp.ok ? await resp.text() : undefined;
  } catch {
    return undefined;
  }
}

async function getMarketplaceDetails(
  namespace: string,
  name: string,
): Promise<{ extension: VsxExtensionDetail }> {
  const data = await queryMarketplace(buildMarketplaceQueryBody(namespace, name, 0));
  const ext = data.results?.[0]?.extensions?.[0];
  if (!ext) throw new Error(`Extension ${namespace}.${name} not found on VS Code Marketplace.`);
  const detail = marketplaceToSummary(ext);
  detail.readme = await tryFetchReadme(ext);
  return { extension: detail };
}

function resolveTargetVersion(
  ext: MarketplaceExtension,
  version: string | undefined,
): MarketplaceVersion {
  const extensionId = `${ext.publisher.publisherName}.${ext.extensionName}`;
  const targetVersion = version
    ? ext.versions?.find((v) => v.version === version)
    : ext.versions?.[0];
  if (!targetVersion) {
    throw new Error(`Version ${version ?? 'latest'} not found for ${extensionId}.`);
  }
  return targetVersion;
}

function buildVsixDownloadUrl(namespace: string, name: string, version: string): string {
  return `${MARKETPLACE_BASE}/publishers/${encodeURIComponent(namespace)}/vsextensions/${encodeURIComponent(name)}/${encodeURIComponent(version)}/vspackage`;
}

async function downloadMarketplaceVsix(downloadUrl: string): Promise<Buffer> {
  const vsixResponse = await fetch(downloadUrl, { signal: AbortSignal.timeout(15_000) });
  if (!vsixResponse.ok) {
    throw new Error(
      `Failed to download VSIX from Marketplace: ${vsixResponse.status} ${vsixResponse.statusText}`,
    );
  }
  return Buffer.from(await vsixResponse.arrayBuffer());
}

async function installMarketplaceExtension(
  namespace: string,
  name: string,
  version?: string,
): Promise<{ installed: InstalledVsxExtension }> {
  const data = await queryMarketplace(buildMarketplaceQueryBody(namespace, name, 0));
  const ext = data.results?.[0]?.extensions?.[0];
  if (!ext) throw new Error(`Extension ${namespace}.${name} not found on VS Code Marketplace.`);

  const targetVersion = resolveTargetVersion(ext, version);
  const extensionId = `${namespace}.${name}`;
  const existing = getInstalledList();
  const already = existing.find((e) => e.id === extensionId);
  if (already?.version === targetVersion.version) {
    throw new Error(`Extension ${extensionId} v${targetVersion.version} is already installed.`);
  }

  const downloadUrl = buildVsixDownloadUrl(namespace, name, targetVersion.version);
  const buffer = await downloadMarketplaceVsix(downloadUrl);
  const tempPath = path.join(os.tmpdir(), `${extensionId}-${Date.now()}.vsix`);
  const installed = await installExtensionFromBuffer(
    buffer,
    tempPath,
    extensionId,
    namespace,
    name,
    targetVersion.version,
    ext.displayName,
    ext.shortDescription,
    existing,
  );

  // Remove from disabled if present
  const disabled = getDisabledList();
  if (disabled.includes(extensionId)) {
    setDisabledList(disabled.filter((id) => id !== extensionId));
  }
  broadcastToWindows('extensionStore:installed', installed);
  return { installed };
}

// ─── Registration ─────────────────────────────────────────────────────

export function registerMarketplaceHandlers(
  channels: string[],
  registerHandler: RegisterHandlerFn,
): void {
  registerHandler(
    channels,
    'extensionStore:searchMarketplace',
    async (_event, query: string, offset?: number, category?: string) => {
      try {
        return { success: true, ...(await searchMarketplace(query, offset ?? 0, category)) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
  registerHandler(
    channels,
    'extensionStore:getMarketplaceDetails',
    async (_event, namespace: string, name: string) => {
      try {
        return { success: true, ...(await getMarketplaceDetails(namespace, name)) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
  registerHandler(
    channels,
    'extensionStore:installMarketplace',
    async (_event, namespace: string, name: string, version?: string) => {
      try {
        return { success: true, ...(await installMarketplaceExtension(namespace, name, version)) };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );
}
