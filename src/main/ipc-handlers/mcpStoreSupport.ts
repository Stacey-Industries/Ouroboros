/**
 * mcpStoreSupport.ts — Types, normalizers, and npm search for the MCP Server Store.
 *
 * Extracted from mcpStore.ts to stay under max-lines.
 */

// ─── Raw API response shapes (actual registry format) ────────────────

interface RawRegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  format?: string;
}

interface RawRegistryPackage {
  registryType: 'npm' | 'pypi' | 'docker' | 'oci' | 'mcpb';
  identifier: string;
  version?: string;
  transport?: { type: string };
  environmentVariables?: RawRegistryEnvVar[];
}

export interface RawRegistryServerEntry {
  server: {
    name: string;
    title?: string;
    description?: string;
    version: string;
    packages?: RawRegistryPackage[];
    repository?: { url?: string; source?: string };
    remotes?: Array<{ type: string; url: string }>;
    websiteUrl?: string;
  };
  _meta: Record<
    string,
    {
      status: string;
      publishedAt: string;
      updatedAt: string;
      statusChangedAt?: string;
      isLatest?: boolean;
    }
  >;
}

export interface RawRegistryListResponse {
  servers: RawRegistryServerEntry[];
  metadata?: { nextCursor?: string; count?: number };
}

// ─── Normalized types used by the UI ─────────────────────────────────

export interface McpRegistryPackage {
  registry_type: 'npm' | 'pypi' | 'docker' | 'oci' | 'mcpb';
  name: string;
  version: string;
  runtime?: {
    args?: string[];
    env?: Record<string, string>;
  };
  environmentVariables?: RawRegistryEnvVar[];
}

export interface McpRegistryServer {
  name: string;
  title: string;
  description: string;
  version: string;
  packages: McpRegistryPackage[];
  _meta: {
    status: string;
    publishedAt: string;
    updatedAt: string;
    isLatest?: boolean;
  };
}

// ─── Normalizer: raw API → UI types ─────────────────────────────────

function normalizePackage(raw: RawRegistryPackage): McpRegistryPackage {
  return {
    registry_type: raw.registryType,
    name: raw.identifier,
    version: raw.version ?? '',
    environmentVariables: raw.environmentVariables,
  };
}

export function normalizeServer(entry: RawRegistryServerEntry): McpRegistryServer {
  const s = entry.server;
  const metaValues = Object.values(entry._meta ?? {});
  const meta = metaValues[0] ?? { status: 'active', publishedAt: '', updatedAt: '' };

  return {
    name: s.name ?? '',
    title: s.title ?? '',
    description: s.description ?? '',
    version: s.version ?? '',
    packages: (s.packages ?? []).map(normalizePackage),
    _meta: {
      status: meta.status,
      publishedAt: meta.publishedAt,
      updatedAt: meta.updatedAt,
      isLatest: meta.isLatest,
    },
  };
}

// ─── npm Registry search (secondary source) ──────────────────────────

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      links?: { npm?: string; repository?: string; homepage?: string };
      publisher?: { username: string };
      date?: string;
    };
    score?: { detail?: { popularity?: number } };
  }>;
  total: number;
}

function npmPackageToServer(pkg: NpmSearchResult['objects'][number]['package']): McpRegistryServer {
  return {
    name: pkg.name,
    title: pkg.name,
    description: pkg.description ?? '',
    version: pkg.version,
    packages: [
      {
        registry_type: 'npm' as const,
        name: pkg.name,
        version: pkg.version,
      },
    ],
    _meta: {
      status: 'active',
      publishedAt: pkg.date ?? '',
      updatedAt: pkg.date ?? '',
    },
  };
}

export async function searchNpmServers(
  query: string,
  offset: number = 0,
): Promise<{
  servers: McpRegistryServer[];
  total: number;
}> {
  const searchTerms = query ? `keywords:mcp-server ${query}` : 'keywords:mcp-server';
  const params = new URLSearchParams({
    text: searchTerms,
    size: '20',
    from: String(offset),
  });

  const url = `https://registry.npmjs.org/-/v1/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`npm search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as NpmSearchResult;
  return {
    servers: data.objects.map((obj) => npmPackageToServer(obj.package)),
    total: data.total,
  };
}
