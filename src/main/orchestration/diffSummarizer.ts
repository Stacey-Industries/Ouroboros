import { execFile } from 'child_process'
import path from 'path'
import type { DiffFileSummary, DiffSummary } from './types'

const GIT_TIMEOUT_MS = 30_000
const MAX_BUFFER_BYTES = 4 * 1024 * 1024

type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'

export interface DiffModuleSummary {
  module: string
  files: string[]
  additions: number
  deletions: number
  risk: 'low' | 'medium' | 'high'
}

export interface DiffSummarizerResult {
  diff: DiffSummary
  groups: DiffModuleSummary[]
  riskyAreas: string[]
}

export interface DiffSummarizerRequest {
  workspaceRoots: string[]
  comparedAgainst?: string
}

interface ParsedNumstatRow {
  filePath: string
  additions: number
  deletions: number
}

function runGit(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

function getWorkspaceRoot(workspaceRoots: string[]): string {
  return workspaceRoots[0] ?? process.cwd()
}

function parseNumstat(stdout: string): ParsedNumstatRow[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const parts = line.split('\t')
      if (parts.length < 3) {
        return []
      }
      const filePath = normalizeGitPath(parts[2])
      return [{
        filePath,
        additions: parts[0] === '-' ? 0 : Number(parts[0]),
        deletions: parts[1] === '-' ? 0 : Number(parts[1]),
      }]
    })
}

function parseNameStatus(stdout: string): Map<string, DiffStatus> {
  const result = new Map<string, DiffStatus>()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 2) {
      continue
    }
    const rawStatus = parts[0]
    const filePath = normalizeGitPath(parts[parts.length - 1])
    result.set(filePath, toDiffStatus(rawStatus))
  }
  return result
}

function normalizeGitPath(filePath: string): string {
  const renameIndex = filePath.indexOf(' -> ')
  const target = renameIndex === -1 ? filePath : filePath.slice(renameIndex + 4)
  return target.replace(/\\/g, '/')
}

function toDiffStatus(value: string): DiffStatus {
  if (value.startsWith('A')) {
    return 'added'
  }
  if (value.startsWith('D')) {
    return 'deleted'
  }
  if (value.startsWith('R')) {
    return 'renamed'
  }
  if (value.startsWith('M')) {
    return 'modified'
  }
  return 'unknown'
}

function detectRisk(filePath: string): 'low' | 'medium' | 'high' {
  const normalized = filePath.replace(/\\/g, '/')
  if (
    normalized.startsWith('src/main/')
    || normalized.startsWith('src/preload/')
    || normalized === 'package.json'
    || normalized.startsWith('src/main/ipc')
    || normalized.startsWith('electron.vite.config')
  ) {
    return 'high'
  }
  if (normalized.startsWith('src/renderer/')) {
    return 'medium'
  }
  return 'low'
}

function summarizeFile(row: ParsedNumstatRow, statuses: Map<string, DiffStatus>): DiffFileSummary {
  const risk = detectRisk(row.filePath)
  return {
    filePath: row.filePath,
    additions: row.additions,
    deletions: row.deletions,
    summary: buildFileSummary(row, statuses.get(row.filePath) ?? 'unknown', risk),
    risk,
  }
}

function buildFileSummary(row: ParsedNumstatRow, status: DiffStatus, risk: 'low' | 'medium' | 'high'): string {
  return `${status} (${formatDelta(row.additions, row.deletions)})${risk === 'low' ? '' : `, ${risk} risk`}`
}

function formatDelta(additions: number, deletions: number): string {
  return `+${additions}/-${deletions}`
}

function getModuleName(filePath: string): string {
  const parts = filePath.split('/')
  if (parts[0] === 'src' && parts.length >= 2) {
    return parts.slice(0, Math.min(2, parts.length)).join('/')
  }
  return parts[0] || path.basename(filePath)
}

function buildGroups(files: DiffFileSummary[]): DiffModuleSummary[] {
  const groups = new Map<string, DiffModuleSummary>()
  for (const file of files) {
    const module = getModuleName(file.filePath)
    const current = groups.get(module) ?? {
      module,
      files: [],
      additions: 0,
      deletions: 0,
      risk: 'low' as const,
    }
    current.files.push(file.filePath)
    current.additions += file.additions
    current.deletions += file.deletions
    current.risk = highestRisk(current.risk, file.risk ?? 'low')
    groups.set(module, current)
  }
  return Array.from(groups.values()).sort((left, right) => right.files.length - left.files.length)
}

function highestRisk(left: 'low' | 'medium' | 'high', right: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  const order = { low: 0, medium: 1, high: 2 }
  return order[left] >= order[right] ? left : right
}

function buildSummary(files: DiffFileSummary[], groups: DiffModuleSummary[]): string {
  if (files.length === 0) {
    return 'No changed files detected.'
  }
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const topGroups = groups.slice(0, 3).map((group) => `${group.module} (${group.files.length})`)
  const riskyAreas = files.filter((file) => file.risk === 'high').map((file) => file.filePath).slice(0, 3)
  const groupSummary = topGroups.length > 0 ? ` across ${topGroups.join(', ')}` : ''
  const riskSummary = riskyAreas.length > 0 ? ` Risky areas: ${riskyAreas.join(', ')}.` : ''
  return `${files.length} file${files.length === 1 ? '' : 's'} changed (${formatDelta(totalAdditions, totalDeletions)})${groupSummary}.${riskSummary}`
}

function emptyResult(): DiffSummarizerResult {
  return {
    diff: {
      files: [],
      totalFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
      summary: 'No changed files detected.',
    },
    groups: [],
    riskyAreas: [],
  }
}

export class DiffSummarizer {
  async summarize(request: DiffSummarizerRequest): Promise<DiffSummarizerResult> {
    const workspaceRoot = getWorkspaceRoot(request.workspaceRoots)
    const comparedAgainst = request.comparedAgainst ?? 'HEAD'
    try {
      const [numstat, nameStatus] = await Promise.all([
        runGit(workspaceRoot, ['diff', '--numstat', '--find-renames', comparedAgainst]),
        runGit(workspaceRoot, ['diff', '--name-status', '--find-renames', comparedAgainst]),
      ])
      const statuses = parseNameStatus(nameStatus)
      const files = parseNumstat(numstat).map((row) => summarizeFile(row, statuses))
      const groups = buildGroups(files)
      return {
        diff: {
          files,
          totalFiles: files.length,
          totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
          totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
          summary: buildSummary(files, groups),
        },
        groups,
        riskyAreas: files.filter((file) => file.risk === 'high').map((file) => file.filePath),
      }
    } catch {
      return emptyResult()
    }
  }
}

export function createDiffSummarizer(): DiffSummarizer {
  return new DiffSummarizer()
}
