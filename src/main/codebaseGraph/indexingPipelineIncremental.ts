/**
 * indexingPipelineIncremental.ts — File discovery and incremental reindex helpers.
 *
 * Extracted from indexingPipeline.ts to satisfy the 300-line file limit.
 * These are module-level helpers used by IndexingPipeline; they have no
 * dependency on the class itself and can be tested in isolation.
 */

import { mapConcurrent } from './concurrency';
import { GraphDatabase } from './graphDatabase';
import {
  hashFileContent,
  loadIgnoreRules,
  type WalkContext,
  walkDirectory,
} from './indexingPipelineSupport';
import type { DiscoveredFile, IndexingOptions } from './indexingPipelineTypes';

// ─── File Discovery (Pass 0) ─────────────────────────────────────────────────

export async function discoverFiles(
  projectRoot: string,
  options: IndexingOptions,
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];
  const ig = await loadIgnoreRules(projectRoot, options.ignorePaths ?? []);
  const ctx: WalkContext = {
    projectRoot,
    ig,
    maxSize: options.maxFileSize ?? 512 * 1024,
    maxFiles: options.maxFiles ?? 10000,
    files,
  };
  await walkDirectory(projectRoot, ctx);
  return files;
}

// ─── Incremental Reindex Logic ────────────────────────────────────────────────

type FileTag =
  | { kind: 'unchanged-stat'; file: DiscoveredFile }
  | { kind: 'unchanged-hash'; file: DiscoveredFile; hash: string }
  | { kind: 'changed'; file: DiscoveredFile };

async function classifyFile(
  db: GraphDatabase,
  projectName: string,
  file: DiscoveredFile,
): Promise<FileTag> {
  const existing = db.getFileHash(projectName, file.relativePath);
  if (
    existing &&
    existing.mtime_ns === Math.floor(file.mtimeMs * 1e6) &&
    existing.size === file.sizeBytes
  ) {
    return { kind: 'unchanged-stat', file };
  }
  const hash = await hashFileContent(file.absolutePath);
  if (existing && existing.content_hash === hash) {
    return { kind: 'unchanged-hash', file, hash };
  }
  return { kind: 'changed', file };
}

export async function filterChangedFiles(
  db: GraphDatabase,
  projectName: string,
  files: DiscoveredFile[],
): Promise<{ changed: DiscoveredFile[]; unchanged: string[] }> {
  const tags = await mapConcurrent(files, (file) => classifyFile(db, projectName, file));
  const changed: DiscoveredFile[] = [];
  const unchanged: string[] = [];

  for (const tag of tags) {
    if (tag.kind === 'unchanged-stat') {
      unchanged.push(tag.file.relativePath);
    } else if (tag.kind === 'unchanged-hash') {
      db.upsertFileHash({
        project: projectName,
        rel_path: tag.file.relativePath,
        content_hash: tag.hash,
        mtime_ns: Math.floor(tag.file.mtimeMs * 1e6),
        size: tag.file.sizeBytes,
      });
      unchanged.push(tag.file.relativePath);
    } else {
      changed.push(tag.file);
    }
  }

  return { changed, unchanged };
}
