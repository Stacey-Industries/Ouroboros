import { readFileSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import type { IndexedRepoFile, RepoIndexSnapshot } from '../orchestration/repoIndexer'
import type { RepoFacts } from '../orchestration/types'
import type { ModuleContextEntry, ModuleIdentity, RepoMap, RepoMapSummary } from './contextLayerTypes'
import { buildCrossModuleDependencies,buildModuleStructuralSummaries, detectModules } from './moduleDetector'

const REPO_MAP_SIZE_CAP_BYTES = 8192
const TRUNCATED_EXPORTS_LIMIT = 5
const MAX_MODULES_AFTER_TRUNCATION = 30
const MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION = 2
const COMPRESSED_EXPORTS_LIMIT = 5

export interface GenerateRepoMapOptions {
  repoFacts: RepoFacts
  repoIndex: RepoIndexSnapshot
  workspaceRoot: string
}

function buildRepoMapFromSummaries(options: {
  workspaceRoot: string
  repoIndex: RepoIndexSnapshot
  allFiles: IndexedRepoFile[]
  moduleEntries: ModuleContextEntry[]
  crossModuleDeps: Array<{ from: string; to: string; weight: number }>
}): RepoMap {
  const { workspaceRoot, repoIndex, allFiles, moduleEntries, crossModuleDeps } = options
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot,
    projectName: detectProjectName(workspaceRoot, repoIndex),
    languages: aggregateLanguages(repoIndex),
    frameworks: detectFrameworks(repoIndex),
    moduleCount: moduleEntries.length,
    totalFileCount: allFiles.length,
    modules: moduleEntries,
    crossModuleDependencies: crossModuleDeps,
  }
}

export function generateRepoMap(options: GenerateRepoMapOptions): RepoMap {
  const { repoFacts, repoIndex, workspaceRoot } = options

  const allFiles = collectAllFiles(repoIndex)
  if (allFiles.length === 0) {
    return buildEmptyRepoMap(workspaceRoot)
  }

  const isMultiRoot = repoIndex.roots.length > 1
  const modules = detectModulesFromRoots(repoIndex, isMultiRoot)
  const gitDiffFiles = new Set(repoFacts.gitDiff.changedFiles.map((entry) => entry.filePath))
  const structuralSummaries = buildModuleStructuralSummaries({
    modules, files: allFiles, workspaceRoot, gitDiffFiles,
  })
  const crossModuleDeps = buildCrossModuleDependencies({
    modules, summaries: structuralSummaries, files: allFiles, workspaceRoot,
  })
  const moduleEntries: ModuleContextEntry[] = structuralSummaries.map((summary) => ({ structural: summary }))

  return enforceSizeCap(buildRepoMapFromSummaries({ workspaceRoot, repoIndex, allFiles, moduleEntries, crossModuleDeps }))
}

export function compressRepoMap(repoMap: RepoMap): RepoMapSummary {
  return {
    projectName: repoMap.projectName,
    languages: repoMap.languages,
    frameworks: repoMap.frameworks,
    moduleCount: repoMap.moduleCount,
    modules: repoMap.modules.map((entry) => ({
      id: entry.structural.module.id,
      label: entry.structural.module.label,
      rootPath: entry.structural.module.rootPath,
      fileCount: entry.structural.fileCount,
      exports: entry.structural.exports.slice(0, COMPRESSED_EXPORTS_LIMIT),
      recentlyChanged: entry.structural.recentlyChanged,
    })),
  }
}

function detectElectronFramework(allFiles: IndexedRepoFile[], relativePaths: Set<string>): boolean {
  const hasElectronStructure =
    allFiles.some((f) => f.relativePath.startsWith('src/main/')) &&
    allFiles.some((f) => f.relativePath.startsWith('src/renderer/')) &&
    allFiles.some((f) => f.relativePath.startsWith('src/preload/'))
  return hasElectronStructure || Array.from(relativePaths).some((p) => p.startsWith('electron.vite.config'))
}

function detectReactFramework(
  allFiles: IndexedRepoFile[],
  detected: string[],
): boolean {
  const tsxCount = allFiles.filter((f) => f.extension === '.tsx').length
  return tsxCount >= 3 &&
    !detected.includes('Next.js') &&
    !detected.includes('Vue') &&
    !detected.includes('Angular')
}

function buildFrameworkChecks(
  allFiles: IndexedRepoFile[],
  relativePaths: Set<string>,
): Array<{ name: string; check: (detected: string[]) => boolean }> {
  const hasExtension = (ext: string): boolean => allFiles.some((file) => file.extension === ext)
  return [
    { name: 'Next.js', check: () => matchesAnyPattern(relativePaths, ['next.config.js', 'next.config.ts', 'next.config.mjs']) },
    { name: 'Vue', check: () => matchesAnyPattern(relativePaths, ['vue.config.js']) || hasExtension('.vue') },
    { name: 'Angular', check: () => matchesAnyPattern(relativePaths, ['angular.json']) },
    { name: 'Electron', check: () => detectElectronFramework(allFiles, relativePaths) },
    { name: 'Vite', check: (d) => matchesAnyGlob(relativePaths, 'vite.config') && !d.includes('Electron') },
    { name: 'React', check: (d) => detectReactFramework(allFiles, d) },
    { name: 'Tailwind CSS', check: () => matchesAnyGlob(relativePaths, 'tailwind.config') },
    { name: 'Svelte', check: () => matchesAnyPattern(relativePaths, ['svelte.config.js', 'svelte.config.ts']) || hasExtension('.svelte') },
    { name: 'Astro', check: () => matchesAnyPattern(relativePaths, ['astro.config.mjs', 'astro.config.ts']) || hasExtension('.astro') },
  ]
}

export function detectFrameworks(repoIndex: RepoIndexSnapshot): string[] {
  const allFiles = collectAllFiles(repoIndex)
  const relativePaths = new Set(allFiles.map((file) => file.relativePath.toLowerCase()))
  const checks = buildFrameworkChecks(allFiles, relativePaths)

  const detected: string[] = []
  for (const { name, check } of checks) {
    if (check(detected)) detected.push(name)
  }
  return detected.sort((left, right) => left.localeCompare(right))
}

export function detectProjectName(workspaceRoot: string, repoIndex: RepoIndexSnapshot): string {
  for (const root of repoIndex.roots) {
    const packageJsonFile = root.files.find(
      (file) => file.relativePath === 'package.json'
    )
    if (packageJsonFile) {
      const name = readPackageJsonNameSync(packageJsonFile.path)
      if (name) {
        return name
      }
    }
  }

  return path.basename(workspaceRoot)
}

async function readPackageJsonNameAsync(filePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from repoIndexer's trusted file listing
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      return parsed.name.trim()
    }
  } catch {
    // Fall through to null
  }
  return null
}

export async function detectProjectNameAsync(workspaceRoot: string, repoIndex: RepoIndexSnapshot): Promise<string> {
  for (const root of repoIndex.roots) {
    const packageJsonFile = root.files.find((file) => file.relativePath === 'package.json')
    if (packageJsonFile) {
      const name = await readPackageJsonNameAsync(packageJsonFile.path)
      if (name) return name
    }
  }
  return path.basename(workspaceRoot)
}

function readPackageJsonNameSync(filePath: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes from repoIndexer's trusted file listing
    const content = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      return parsed.name.trim()
    }
  } catch {
    // Ignore read/parse errors
  }
  return null
}

function collectAllFiles(repoIndex: RepoIndexSnapshot): IndexedRepoFile[] {
  return repoIndex.roots.flatMap((root) => root.files)
}

function detectModulesFromRoots(repoIndex: RepoIndexSnapshot, isMultiRoot: boolean): ModuleIdentity[] {
  if (!isMultiRoot) {
    const root = repoIndex.roots[0]
    return root ? detectModules(root.files, root.rootPath) : []
  }

  const allModules: ModuleIdentity[] = []
  for (const root of repoIndex.roots) {
    const rootBasename = path.basename(root.rootPath)
    const rootModules = detectModules(root.files, root.rootPath)
    for (const mod of rootModules) {
      allModules.push({
        ...mod,
        id: `${rootBasename}/${mod.id}`,
        label: `${rootBasename}: ${mod.label}`,
      })
    }
  }

  return allModules.sort((left, right) => left.id.localeCompare(right.id))
}

function aggregateLanguages(repoIndex: RepoIndexSnapshot): string[] {
  const counts = new Map<string, number>()
  for (const root of repoIndex.roots) {
    for (const language of root.workspaceFact.languages) {
      counts.set(language, (counts.get(language) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language)
}

function buildEmptyRepoMap(workspaceRoot: string): RepoMap {
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot,
    projectName: path.basename(workspaceRoot),
    languages: [],
    frameworks: [],
    moduleCount: 0,
    totalFileCount: 0,
    modules: [],
    crossModuleDependencies: [],
  }
}

function enforceSizeCap(repoMap: RepoMap): RepoMap {
  let serialized = JSON.stringify(repoMap)
  if (serialized.length <= REPO_MAP_SIZE_CAP_BYTES) {
    return repoMap
  }

  // Step 1: Truncate exports to first 5 entries, drop imports entirely
  const trimmedModules = repoMap.modules.map((entry) => ({
    structural: {
      ...entry.structural,
      exports: entry.structural.exports.slice(0, TRUNCATED_EXPORTS_LIMIT),
      imports: [],
    },
    ai: entry.ai,
  }))

  // Step 2: Drop low-weight cross-module dependencies
  const trimmedDeps = repoMap.crossModuleDependencies.filter(
    (dep) => dep.weight >= MIN_DEPENDENCY_WEIGHT_AFTER_TRUNCATION
  )

  let trimmed: RepoMap = {
    ...repoMap,
    modules: trimmedModules,
    crossModuleDependencies: trimmedDeps,
  }

  serialized = JSON.stringify(trimmed)
  if (serialized.length <= REPO_MAP_SIZE_CAP_BYTES) {
    return trimmed
  }

  // Step 3: Truncate modules to top 30 by fileCount (largest first)
  const sortedModules = [...trimmedModules]
    .sort((left, right) => right.structural.fileCount - left.structural.fileCount)
    .slice(0, MAX_MODULES_AFTER_TRUNCATION)

  const remainingModuleIds = new Set(sortedModules.map((entry) => entry.structural.module.id))
  const filteredDeps = trimmedDeps.filter(
    (dep) => remainingModuleIds.has(dep.from) && remainingModuleIds.has(dep.to)
  )

  trimmed = {
    ...trimmed,
    modules: sortedModules,
    moduleCount: sortedModules.length,
    crossModuleDependencies: filteredDeps,
  }

  return trimmed
}

function matchesAnyPattern(relativePaths: Set<string>, patterns: string[]): boolean {
  return patterns.some((pattern) => relativePaths.has(pattern))
}

function matchesAnyGlob(relativePaths: Set<string>, prefix: string): boolean {
  return Array.from(relativePaths).some((p) => p.startsWith(prefix))
}
