import type { IpcResult } from './electron-foundation'

export interface McpRegistryEnvVar {
  name: string
  description?: string
  isRequired?: boolean
  format?: string
}

export interface McpRegistryPackage {
  registry_type: 'npm' | 'pypi' | 'docker' | 'oci' | 'mcpb'
  name: string
  version: string
  runtime?: {
    args?: string[]
    env?: Record<string, string>
  }
  environmentVariables?: McpRegistryEnvVar[]
}

export interface McpRegistryServer {
  name: string
  title: string
  description: string
  version: string
  packages: McpRegistryPackage[]
  _meta: {
    status: 'active' | 'deprecated' | 'deleted'
    publishedAt: string
    updatedAt: string
    isLatest?: boolean
  }
}

export interface McpRegistryListResponse {
  servers: McpRegistryServer[]
  next_cursor?: string
}

export interface McpStoreAPI {
  search: (query: string, cursor?: string) => Promise<IpcResult & { servers?: McpRegistryServer[]; nextCursor?: string }>
  searchNpm: (query: string, offset?: number) => Promise<IpcResult & { servers?: McpRegistryServer[]; total?: number }>
  getServerDetails: (name: string) => Promise<IpcResult & { server?: McpRegistryServer }>
  installServer: (server: McpRegistryServer, scope: 'global' | 'project', envOverrides?: Record<string, string>) => Promise<IpcResult>
  getInstalledServerNames: () => Promise<IpcResult & { names?: string[] }>
}
