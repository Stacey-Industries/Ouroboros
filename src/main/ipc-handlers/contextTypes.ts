/**
 * contextTypes.ts — Shared types for the project context scanner.
 */

export interface ProjectContext {
  name: string
  language: string
  framework: string | null
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'cargo' | 'pip' | 'go' | 'bun' | null
  entryPoints: string[]
  keyDirs: Array<{ path: string; purpose: string }>
  keyConfigs: string[]
  testFramework: string | null
  buildCommands: Array<{ name: string; command: string }>
  dependencies: Array<{ name: string; version: string }>
  hasClaudeMd: boolean
  detectedPatterns: string[]
}

export interface ContextGenerateOptions {
  includeCommands?: boolean
  includeDeps?: boolean
  includeStructure?: boolean
  maxDeps?: number
}
