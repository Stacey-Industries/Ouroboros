import type { RootRepoIndexSnapshot } from './repoIndexer';
import { normalizePathForCompare, takeRecentFiles } from './repoIndexerHelpers';
import { buildGitDiffSummary, buildRecentCommits } from './repoIndexerSupportGit';
import type {
  DiagnosticsFileSummary,
  DiagnosticsSummary,
  GitDiffFileSummary,
  GitDiffSummary,
  RecentEditsSummary,
  RepoFacts,
} from './types';

const MAX_MESSAGES_PER_FILE = 10;
const MAX_MESSAGES_TOTAL = 50;
const SEVERITY_PRIORITY: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 };

export { buildGitDiffSummary, buildRecentCommits };

function mergeFileDiagnostics(
  existing: DiagnosticsFileSummary,
  file: DiagnosticsFileSummary,
): void {
  existing.errors += file.errors;
  existing.warnings += file.warnings;
  existing.infos += file.infos;
  existing.hints += file.hints;
  if (file.messages && file.messages.length > 0) {
    const combined = [...(existing.messages ?? []), ...file.messages];
    combined.sort(
      (left, right) =>
        (SEVERITY_PRIORITY[left.severity] ?? 3) - (SEVERITY_PRIORITY[right.severity] ?? 3) ||
        left.line - right.line,
    );
    existing.messages = combined.slice(0, MAX_MESSAGES_PER_FILE);
  }
}

function applyGlobalMessageCap(files: DiagnosticsFileSummary[]): void {
  let totalMessages = 0;
  for (const file of files) {
    if (!file.messages) continue;
    const remaining = MAX_MESSAGES_TOTAL - totalMessages;
    if (remaining <= 0) {
      file.messages = [];
      continue;
    }
    if (file.messages.length > remaining) file.messages = file.messages.slice(0, remaining);
    totalMessages += file.messages.length;
  }
}

export function aggregateDiagnostics(
  rootSnapshots: RootRepoIndexSnapshot[],
  generatedAt: number,
): DiagnosticsSummary {
  const merged = new Map<string, DiagnosticsFileSummary>();
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.diagnostics.files) {
      const key = normalizePathForCompare(file.filePath);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...file, messages: file.messages ? [...file.messages] : undefined });
        continue;
      }
      mergeFileDiagnostics(existing, file);
    }
  }
  const files = Array.from(merged.values()).sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
  applyGlobalMessageCap(files);
  return {
    files,
    totalErrors: files.reduce((total, file) => total + file.errors, 0),
    totalWarnings: files.reduce((total, file) => total + file.warnings, 0),
    totalInfos: files.reduce((total, file) => total + file.infos, 0),
    totalHints: files.reduce((total, file) => total + file.hints, 0),
    generatedAt,
  };
}

export function aggregateGitDiff(
  rootSnapshots: RootRepoIndexSnapshot[],
  generatedAt: number,
): GitDiffSummary {
  const merged = new Map<string, GitDiffFileSummary>();
  for (const snapshot of rootSnapshots) {
    for (const file of snapshot.gitDiff.changedFiles) {
      merged.set(normalizePathForCompare(file.filePath), file);
    }
  }
  const files = Array.from(merged.values()).sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
  const currentBranch = rootSnapshots.find((s) => s.gitDiff.currentBranch)?.gitDiff.currentBranch;
  return {
    changedFiles: files,
    totalAdditions: files.reduce((total, file) => total + file.additions, 0),
    totalDeletions: files.reduce((total, file) => total + file.deletions, 0),
    changedFileCount: files.length,
    comparedAgainst: files.length > 0 ? 'HEAD' : undefined,
    currentBranch,
    generatedAt,
  };
}

export function aggregateRecentEdits(
  rootSnapshots: RootRepoIndexSnapshot[],
  generatedAt: number,
  maxRecentFiles: number,
): RecentEditsSummary {
  const files = rootSnapshots.flatMap((snapshot) => snapshot.files);
  return { files: takeRecentFiles(files, maxRecentFiles), generatedAt };
}

export function aggregateRepoFacts(
  workspaceRoots: string[],
  rootSnapshots: RootRepoIndexSnapshot[],
  generatedAt: number,
  maxRecentFiles: number,
): RepoFacts {
  const gitDiff = aggregateGitDiff(rootSnapshots, generatedAt);
  const diagnostics = aggregateDiagnostics(rootSnapshots, generatedAt);
  const recentEdits = aggregateRecentEdits(rootSnapshots, generatedAt, maxRecentFiles);
  const recentCommits = rootSnapshots.find((s) => s.recentCommits.length > 0)?.recentCommits;
  return {
    workspaceRoots,
    roots: rootSnapshots.map((snapshot) => snapshot.workspaceFact),
    gitDiff,
    diagnostics,
    recentEdits,
    recentCommits,
  };
}
