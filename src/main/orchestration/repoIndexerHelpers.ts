import { createHash } from 'crypto';
import path from 'path';

import {
  getAllImportableExtensions,
  getStrategyForLanguage,
} from '../contextLayer/languageStrategies';
import { readTextSafe } from '../ipc-handlers/contextDetectors';
import type {
  IndexedRepoDirectory,
  IndexedRepoFile,
  IndexedRepoFileDiagnostics,
  RootRepoIndexSnapshot,
} from './repoIndexer';
import type { DiagnosticsFileSummary, DiagnosticsSummary } from './types';

export function normalizePathForCompare(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function toRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

export function detectExtension(name: string): string {
  if (name.endsWith('.d.ts')) return '.d.ts';
  return path.extname(name).toLowerCase();
}

export function toIndexedDiagnostics(summary: DiagnosticsFileSummary): IndexedRepoFileDiagnostics {
  const total = summary.errors + summary.warnings + summary.infos + summary.hints;
  return {
    errors: summary.errors,
    warnings: summary.warnings,
    infos: summary.infos,
    hints: summary.hints,
    total,
  };
}

export function takeRecentFiles(files: IndexedRepoFile[], maxRecentFiles: number): string[] {
  return [...files]
    .sort(
      (left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path),
    )
    .slice(0, maxRecentFiles)
    .map((file) => file.path);
}

export function summarizeLanguages(files: IndexedRepoFile[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.language === 'unknown') continue;
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language);
}

export function emptyDiagnosticsSummary(generatedAt: number): DiagnosticsSummary {
  return { files: [], totalErrors: 0, totalWarnings: 0, totalInfos: 0, totalHints: 0, generatedAt };
}

export function normalizeWorkspaceRoots(workspaceRoots: string[]): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const root of workspaceRoots) {
    if (typeof root !== 'string' || root.trim() === '') continue;
    const resolved = path.resolve(root);
    const key = normalizePathForCompare(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(resolved);
  }
  return roots;
}

export function buildRootLookupKey(rootPath: string, stateKey: string | undefined): string {
  return `${normalizePathForCompare(rootPath)}::${stateKey ?? ''}`;
}

export function buildWorkspaceLookupKey(
  workspaceRoots: string[],
  workspaceStateKey?: string,
): string | null {
  if (!workspaceStateKey) return null;
  return buildRootLookupKey(workspaceRoots.join('|'), workspaceStateKey);
}

export function createWorkspaceStateKey(rootSnapshots: RootRepoIndexSnapshot[]): string {
  const hash = createHash('sha1');
  for (const snapshot of [...rootSnapshots].sort((left, right) =>
    left.rootPath.localeCompare(right.rootPath),
  )) {
    hash.update(`${normalizePathForCompare(snapshot.rootPath)}|${snapshot.stateKey}`);
  }
  return hash.digest('hex');
}

export function createRootStateKey(input: {
  rootPath: string;
  fileCount: number;
  directoryCount: number;
  files: IndexedRepoFile[];
  directories: IndexedRepoDirectory[];
  gitDiff: {
    changedFiles: Array<{ filePath: string; status: string; additions: number; deletions: number }>;
  };
  diagnostics: DiagnosticsSummary;
}): string {
  const hash = createHash('sha1');
  hash.update(normalizePathForCompare(input.rootPath));
  hash.update(`files:${input.fileCount}|dirs:${input.directoryCount}`);
  for (const file of input.files) {
    hash.update(
      `${file.relativePath}|${file.modifiedAt}|${file.size}|${file.language}|${file.imports.join(',')}`,
    );
    if (file.diagnostics) {
      hash.update(
        `|diag:${file.diagnostics.errors},${file.diagnostics.warnings},${file.diagnostics.infos},${file.diagnostics.hints}`,
      );
    }
  }
  for (const directory of input.directories) {
    hash.update(`${directory.relativePath}|${directory.modifiedAt}`);
  }
  for (const changedFile of input.gitDiff.changedFiles) {
    hash.update(
      `${changedFile.filePath}|${changedFile.status}|${changedFile.additions}|${changedFile.deletions}`,
    );
  }
  for (const diagnostic of input.diagnostics.files) {
    hash.update(
      `${diagnostic.filePath}|${diagnostic.errors}|${diagnostic.warnings}|${diagnostic.infos}|${diagnostic.hints}`,
    );
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.d.ts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json', '.md': 'markdown', '.mdx': 'markdown',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.rb': 'ruby', '.php': 'php', '.sql': 'sql',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.kt': 'kotlin', '.swift': 'swift',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.prisma': 'prisma', '.graphql': 'graphql', '.gql': 'graphql',
  '.proto': 'proto',
};

export const LANGUAGE_BY_BASENAME: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
};

export function detectLanguage(filePath: string): string {
  const basename = path.basename(filePath);
  const ext = detectExtension(basename);
  // eslint-disable-next-line security/detect-object-injection -- constants, not user-controlled
  return LANGUAGE_BY_BASENAME[basename] ?? LANGUAGE_BY_EXTENSION[ext] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

const IMPORTABLE_EXTENSIONS_CACHE: Set<string> = getAllImportableExtensions();

function extractQuotedSpecifier(text: string): string | null {
  const firstSingle = text.indexOf("'");
  const firstDouble = text.indexOf('"');
  const start =
    firstSingle >= 0 && (firstDouble < 0 || firstSingle < firstDouble) ? firstSingle : firstDouble;
  if (start < 0) return null;
  const quote = text.charAt(start);
  const end = text.indexOf(quote, start + 1);
  if (end < 0) return null;
  return text.slice(start + 1, end);
}

function addQuotedSpecifierFromSegment(segment: string, imports: Set<string>): void {
  const specifier = extractQuotedSpecifier(segment);
  if (specifier) imports.add(specifier);
}

function collectImportsFromLine(trimmed: string, imports: Set<string>): void {
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('import ') || lower.startsWith('export ')) {
    const fromIndex = lower.lastIndexOf(' from ');
    if (fromIndex >= 0) {
      addQuotedSpecifierFromSegment(trimmed.slice(fromIndex + ' from '.length), imports);
    }
  }
  const requireIndex = lower.indexOf('require(');
  if (requireIndex >= 0) {
    addQuotedSpecifierFromSegment(trimmed.slice(requireIndex + 'require('.length), imports);
  }
  const importIndex = lower.indexOf('import(');
  if (importIndex >= 0) {
    addQuotedSpecifierFromSegment(trimmed.slice(importIndex + 'import('.length), imports);
  }
}

function parseImportsFromContent(content: string, language: string): Set<string> {
  const strategy = getStrategyForLanguage(language);
  if (strategy) return new Set(strategy.extractImports(content));
  const imports = new Set<string>();
  for (const line of content.split('\n')) collectImportsFromLine(line.trimStart(), imports);
  return imports;
}

export async function extractImports(filePath: string, maxImportBytes: number): Promise<string[]> {
  if (!IMPORTABLE_EXTENSIONS_CACHE.has(detectExtension(filePath))) return [];
  const content = await readTextSafe(filePath, maxImportBytes);
  if (!content) return [];
  return Array.from(parseImportsFromContent(content, detectLanguage(filePath))).sort((l, r) => l.localeCompare(r));
}
