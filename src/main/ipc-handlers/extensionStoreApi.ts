/**
 * extensionStoreApi.ts — Open VSX Registry network operations.
 *
 * Extracted from extensionStoreHelpers.ts to keep each file under 300 lines.
 */

import os from 'os';
import path from 'path';

import {
  getInstalledList,
  type InstalledVsxExtension,
  installExtensionFromBuffer,
  type VsxExtensionDetail,
  type VsxExtensionSummary,
} from './extensionStoreHelpers';

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

const OPENVSX_BASE = 'https://open-vsx.org/api';

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

export function toDetail(raw: VsxDetailApiResponse): VsxExtensionDetail {
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

export async function searchExtensions(
  query: string,
  offset: number,
): Promise<{ extensions: VsxExtensionSummary[]; totalSize: number; offset: number }> {
  const params = new URLSearchParams({ query, size: '20', offset: String(offset), sortBy: 'downloadCount' });
  const response = await fetch(`${OPENVSX_BASE}/-/search?${params.toString()}`);
  if (!response.ok)
    throw new Error(`Open VSX search failed: ${response.status} ${response.statusText}`);
  const data = (await response.json()) as VsxSearchApiResponse;
  return { extensions: (data.extensions ?? []).map(toSummary), totalSize: data.totalSize ?? 0, offset: data.offset ?? 0 };
}

export async function getExtensionDetails(
  namespace: string,
  name: string,
): Promise<{ extension: VsxExtensionDetail }> {
  const response = await fetch(`${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
  if (!response.ok)
    throw new Error(`Open VSX detail fetch failed: ${response.status} ${response.statusText}`);
  return { extension: toDetail((await response.json()) as VsxDetailApiResponse) };
}

async function fetchVsixDetail(namespace: string, name: string, version?: string): Promise<VsxDetailApiResponse> {
  const url = version
    ? `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    : `${OPENVSX_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  const resp = await fetch(url);
  if (!resp.ok)
    throw new Error(`Failed to fetch extension details: ${resp.status} ${resp.statusText}`);
  return (await resp.json()) as VsxDetailApiResponse;
}

async function downloadVsix(downloadUrl: string, extensionId: string): Promise<{ buffer: Buffer; tempPath: string }> {
  const vsixResponse = await fetch(downloadUrl);
  if (!vsixResponse.ok)
    throw new Error(`Failed to download VSIX: ${vsixResponse.status} ${vsixResponse.statusText}`);
  const buffer = Buffer.from(await vsixResponse.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `${extensionId}-${Date.now()}.vsix`);
  return { buffer, tempPath };
}

export async function installExtension(
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
      buffer, tempPath, extensionId, namespace, name,
      version: detail.version, displayName: detail.displayName, description: detail.description, existing,
    }),
  };
}
