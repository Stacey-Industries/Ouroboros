/**
 * moduleDetectorUtils.ts — Pure utility functions for module detection.
 * Extracted from moduleDetector.ts to stay under the 300-line limit.
 */

import path from 'path'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_FLAT_GROUP_PREFIX_LENGTH = 3
export const MIN_FILES_FOR_FOLDER_MODULE = 2
export const MIN_FILES_FOR_FLAT_GROUP = 2
export const MIN_SIGNIFICANT_FILE_SIZE = 2000
export const MAX_DEPTH_BELOW_SRC = 3

export const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.rb', '.php',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.cs', '.kt', '.swift', '.vue', '.svelte', '.astro',
])

export const CONFIG_FILE_BASENAMES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintignore',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierignore',
  '.gitignore', '.editorconfig',
  'vite.config.ts', 'vitest.config.ts',
  'jest.config.ts', 'jest.config.js',
  'tailwind.config.ts', 'tailwind.config.js',
  'postcss.config.js', 'postcss.config.cjs',
])

export const CONFIG_FILE_PREFIXES = [
  'electron.vite.config', 'tsconfig', '.eslintrc', '.prettierrc',
  'vite.config', 'vitest.config', 'jest.config', 'tailwind.config', 'postcss.config',
]

export const TEST_FILE_PATTERN = /\.(test|spec)\.[^.]+$/

// ---------------------------------------------------------------------------
// String conversion utilities
// ---------------------------------------------------------------------------

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function toLabel(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function normalizeSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/** Normalize separators before dirname so backslashes work on all platforms. */
export function normalizedDirname(filePath: string): string {
  return normalizeSeparators(path.dirname(normalizeSeparators(filePath)))
}

export function basenameWithoutExtension(relativePath: string): string {
  const basename = path.basename(relativePath)
  if (basename.endsWith('.d.ts')) return basename.slice(0, -5)
  const dotIndex = basename.lastIndexOf('.')
  return dotIndex > 0 ? basename.slice(0, dotIndex) : basename
}

export function longestCommonPrefix(a: string, b: string): string {
  const maxLen = Math.min(a.length, b.length)
  let i = 0
  // eslint-disable-next-line security/detect-object-injection -- i is a bounded numeric index, not user-controlled input
  while (i < maxLen && a[i] === b[i]) i++
  return a.slice(0, i)
}

// ---------------------------------------------------------------------------
// File classification utilities
// ---------------------------------------------------------------------------

export function isSourceFile(extension: string): boolean {
  return SOURCE_EXTENSIONS.has(extension)
}

export function isTestFile(relativePath: string): boolean {
  return TEST_FILE_PATTERN.test(relativePath)
}

export function isWithinDepthLimit(relDir: string): boolean {
  const parts = relDir.split('/')
  const srcIndex = parts.indexOf('src')
  if (srcIndex === -1) return parts.length <= MAX_DEPTH_BELOW_SRC
  const depthBelowSrc = parts.length - srcIndex - 1
  return depthBelowSrc <= MAX_DEPTH_BELOW_SRC
}

export function isConfigFile(basename: string): boolean {
  if (CONFIG_FILE_BASENAMES.has(basename)) return true
  const lowerBasename = basename.toLowerCase()
  for (const prefix of CONFIG_FILE_PREFIXES) {
    if (lowerBasename.startsWith(prefix.toLowerCase())) return true
  }
  return false
}

export function getParentDirName(rootPath: string): string | null {
  const parts = normalizeSeparators(rootPath).split('/')
  if (parts.length < 2) return null
  return parts[parts.length - 2] || null
}

// ---------------------------------------------------------------------------
// Module ID deduplication and cap enforcement
// ---------------------------------------------------------------------------

import type { ModuleIdentity } from './contextLayerTypes'

const MAX_MODULES = 50
const PATTERN_PRIORITY: Record<string, number> = { 'feature-folder': 3, config: 2, 'flat-group': 1, 'single-file': 0 }

export function deduplicateModuleIds(modules: ModuleIdentity[]): void {
  const idCounts = new Map<string, number>()
  for (const mod of modules) idCounts.set(mod.id, (idCounts.get(mod.id) ?? 0) + 1)

  for (const [id, count] of idCounts) {
    if (count <= 1) continue
    const duplicates = modules.filter((m) => m.id === id)
    for (const mod of duplicates) {
      const parentDir = getParentDirName(mod.rootPath)
      if (parentDir) { mod.id = `${toKebabCase(parentDir)}-${mod.id}`; mod.label = `${toLabel(parentDir)} ${mod.label}` }
    }
    const updatedIds = new Map<string, number>()
    for (const mod of modules) {
      const existingCount = updatedIds.get(mod.id) ?? 0
      if (existingCount > 0) mod.id = `${mod.id}-${existingCount + 1}`
      updatedIds.set(mod.id, existingCount + 1)
    }
  }
}

export function enforceModuleCap(modules: ModuleIdentity[]): void {
  if (modules.length <= MAX_MODULES) return
  modules.sort((left, right) => {
    const lp = PATTERN_PRIORITY[left.pattern] ?? 0
    const rp = PATTERN_PRIORITY[right.pattern] ?? 0
    return rp - lp || left.id.localeCompare(right.id)
  })
  const keep = modules.slice(0, MAX_MODULES - 1)
  const hasOther = keep.some((m) => m.id === 'other')
  modules.length = 0
  modules.push(...keep)
  if (!hasOther) modules.push({ id: 'other', label: 'Other', rootPath: '.', pattern: 'flat-group' })
}

export function hasAnyPrefixGroup(files: { relativePath: string }[]): boolean {
  if (files.length < 2) return false
  const basenames = files.map((f) => basenameWithoutExtension(f.relativePath))
  for (const a of basenames) {
    for (const b of basenames) {
      if (a === b) continue
      const prefix = longestCommonPrefix(a, b)
      if (prefix.length >= MIN_FLAT_GROUP_PREFIX_LENGTH) return true
    }
  }
  return false
}
