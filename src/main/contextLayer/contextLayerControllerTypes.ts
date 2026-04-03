/**
 * contextLayerControllerTypes.ts — Types and git helper for context layer controller.
 * Extracted from contextLayerController.ts to stay under the 300-line limit.
 */

import { execFile } from 'child_process'
import path from 'path'

import type { RepoIndexSnapshot } from '../orchestration/repoIndexer'
import type { ContextPacket, RepoFacts } from '../orchestration/types'
import type { ContextLayerConfig, RepoMap } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Git helper
// ---------------------------------------------------------------------------

/** Returns absolute paths of files changed in the working tree + index. */
export function getGitChangedFiles(workspaceRoot: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile('git', ['status', '--porcelain', '-u'], {
      cwd: workspaceRoot,
      timeout: 5000,
    }, (err, stdout) => {
      if (err) { reject(err); return }
      const files = stdout
        .split('\n')
        .filter((line) => line.length > 3)
        .map((line) => {
          const raw = line.slice(3).split(' -> ').pop()!.trim()
          return path.resolve(path.join(workspaceRoot, raw))
        })
      resolve(files)
    })
  })
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface SymbolIndexEntry {
  name: string
  kind: string
  moduleId: string
  signature?: string
  filePath?: string
  line?: number
}

export interface SymbolIndex {
  size: number
  searchByName: (query: string, limit: number) => SymbolIndexEntry[]
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ContextLayerControllerStatus {
  enabled: boolean
  health: 'healthy' | 'degraded' | 'disabled'
  workspaceRoot: string
  moduleCount: number
  summaryCount: number
  repoMapAge: number | null
}

export interface ContextLayerController {
  enrichPacket(
    packet: ContextPacket,
    goalKeywords: string[],
  ): Promise<{ packet: ContextPacket; injectedModules: string[]; injectedTokens: number }>
  onSessionStart(): void
  onGitCommit(): void
  onFileChange(type: string, filePath: string): void
  /** Called when the working directory of a session changes. */
  onCwdChanged?(newCwd: string): void
  /** Called when a file_changed hook fires — lighter signal than onGitCommit. */
  onFileChanged?(): void
  onConfigChange(config: ContextLayerConfig): Promise<void>
  getStatus(): ContextLayerControllerStatus
  forceRebuild(): Promise<void>
  dispose(): Promise<void>
  switchWorkspace(workspaceRoot: string): Promise<void>
  getRepoMap(): RepoMap | null
  getLastRepoFacts(): RepoFacts | null
  getSymbolIndex(): SymbolIndex
}

export interface InitContextLayerOptions {
  workspaceRoot: string
  buildRepoIndex: (roots: string[]) => Promise<RepoIndexSnapshot>
  config: ContextLayerConfig
}
