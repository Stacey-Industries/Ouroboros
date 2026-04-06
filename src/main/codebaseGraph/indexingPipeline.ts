/**
 * indexingPipeline.ts — Multi-pass project indexer.
 *
 * Walks a project directory, parses every supported source file with tree-sitter,
 * and populates the SQLite property graph with nodes and edges. Supports incremental
 * reindexing via stat-based fast path + SHA-256 content hash verification.
 *
 * Pass sequence:
 *   0. File Discovery   — walk directory, respect ignores, apply size/count caps
 *   1. Structure Pass   — Project, Folder, File nodes + containment edges
 *   2. Parse Pass       — tree-sitter parse all files -> ParsedFileResult[]
 *   3. Definition Pass  — Function/Class/Interface/Type/Enum/Method/Route nodes
 *   4. Import Pass      — resolve imports, create IMPORTS edges + Package nodes
 *   5. Call Resolution  — resolve call expressions, create CALLS/ASYNC_CALLS edges
 *   6. Finalize         — update file hashes + project stats
 */

import path from 'path';

import { GraphDatabase } from './graphDatabase';
import { callResolutionPass } from './indexingPipelineCallResolution';
import { definitionPass, importPass, parsePass, structurePass } from './indexingPipelinePasses';
import {
  hashFileContent,
  loadIgnoreRules,
  type WalkContext,
  walkDirectory,
} from './indexingPipelineSupport';
import type {
  DiscoveredFile,
  IndexedFile,
  IndexingOptions,
  IndexingProgress,
  IndexingResult,
} from './indexingPipelineTypes';
import { enrichmentPass } from './passes/enrichmentPass';
import { gitCoChangePass, prefetchGitCoChangeData } from './passes/gitCoChangePass';
import { httpLinkPass } from './passes/httpLinkPass';
import { testDetectPass } from './passes/testDetectPass';
import { TreeSitterParser } from './treeSitterParser';

// ─── File Discovery (Pass 0) ─────────────────────────────────────────────────

async function discoverFiles(
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

async function filterChangedFiles(
  db: GraphDatabase,
  projectName: string,
  files: DiscoveredFile[],
): Promise<{ changed: DiscoveredFile[]; unchanged: string[] }> {
  const changed: DiscoveredFile[] = [];
  const unchanged: string[] = [];

  for (const file of files) {
    const existing = db.getFileHash(projectName, file.relativePath);

    if (
      existing &&
      existing.mtime_ns === Math.floor(file.mtimeMs * 1e6) &&
      existing.size === file.sizeBytes
    ) {
      unchanged.push(file.relativePath);
      continue;
    }

    const hash = await hashFileContent(file.absolutePath);
    if (existing && existing.content_hash === hash) {
      db.upsertFileHash({
        project: projectName,
        rel_path: file.relativePath,
        content_hash: hash,
        mtime_ns: Math.floor(file.mtimeMs * 1e6),
        size: file.sizeBytes,
      });
      unchanged.push(file.relativePath);
      continue;
    }

    changed.push(file);
  }

  return { changed, unchanged };
}

// ─── Pipeline Orchestrator ────────────────────────────────────────────────────

export class IndexingPipeline {
  private db: GraphDatabase;
  private parser: TreeSitterParser;

  constructor(db: GraphDatabase, parser: TreeSitterParser) {
    this.db = db;
    this.parser = parser;
  }

  private async runAllPasses(
    ctx: { projectName: string; projectRoot: string },
    indexedFiles: IndexedFile[],
    structureFiles: DiscoveredFile[],
    report: (phase: string) => void,
  ): Promise<void> {
    const { projectName, projectRoot } = ctx;

    // Pre-fetch async data before entering the synchronous SQLite transaction.
    // better-sqlite3 transactions are synchronous — no async calls allowed inside.
    report('git_prefetch');
    const gitCommitFiles = await prefetchGitCoChangeData(projectRoot);

    this.db.transaction(() => {
      report('structure');
      structurePass(this.db, projectName, projectRoot, structureFiles);
      report('definitions');
      definitionPass(this.db, projectName, indexedFiles);
      report('imports');
      importPass(this.db, projectName, indexedFiles, structureFiles);
      report('calls');
      callResolutionPass(this.db, projectName, indexedFiles);
      report('http_links');
      httpLinkPass(this.db, projectName, indexedFiles);
      report('test_detection');
      testDetectPass(this.db, projectName, indexedFiles);
      report('enrichment');
      enrichmentPass(this.db, projectName);
      report('git_history');
      gitCoChangePass(this.db, projectName, gitCommitFiles);
    });
  }

  private finalizeIndex(
    projectName: string,
    options: IndexingOptions,
    indexedFiles: IndexedFile[],
  ): { nodesCreated: number; edgesCreated: number } {
    for (const file of indexedFiles) {
      this.db.upsertFileHash({
        project: projectName,
        rel_path: file.relativePath,
        content_hash: file.contentHash,
        mtime_ns: Math.floor(file.mtimeMs * 1e6),
        size: file.sizeBytes,
      });
    }
    const nodesCreated = this.db.getNodeCount(projectName);
    const edgesCreated = this.db.getEdgeCount(projectName);
    this.db.upsertProject({
      name: projectName,
      root_path: options.projectRoot,
      indexed_at: Date.now(),
      node_count: nodesCreated,
      edge_count: edgesCreated,
    });
    return { nodesCreated, edgesCreated };
  }

  private async discoverAndResolve(
    options: IndexingOptions,
    projectName: string,
    progress: IndexingProgress,
  ): Promise<{
    allFiles: DiscoveredFile[];
    filesToProcess: DiscoveredFile[];
    isIncrementalRun: boolean;
  }> {
    const allFiles = await discoverFiles(options.projectRoot, options);
    progress.filesTotal = allFiles.length;
    const isIncremental = options.incremental !== false;
    const { filesToProcess, isIncrementalRun } = await this.resolveFilesToProcess(
      isIncremental,
      projectName,
      allFiles,
    );
    this.db.upsertProject({
      name: projectName,
      root_path: options.projectRoot,
      indexed_at: Date.now(),
      node_count: 0,
      edge_count: 0,
    });
    return { allFiles, filesToProcess, isIncrementalRun };
  }

  private async runIndex(
    options: IndexingOptions,
    projectName: string,
    report: (phase: string) => void,
    progress: IndexingProgress,
  ): Promise<IndexingResult> {
    const startTime = progress.startedAt;

    report('discovery');
    const { allFiles, filesToProcess, isIncrementalRun } = await this.discoverAndResolve(
      options,
      projectName,
      progress,
    );

    report('parsing');
    const indexedFiles = await parsePass(this.parser, filesToProcess, (processed) => {
      progress.filesProcessed = processed;
      report('parsing');
    });

    const structureFiles = isIncrementalRun ? filesToProcess : allFiles;
    await this.runAllPasses(
      { projectName, projectRoot: options.projectRoot },
      indexedFiles,
      structureFiles,
      report,
    );
    report('finalizing');
    const { nodesCreated, edgesCreated } = this.finalizeIndex(projectName, options, indexedFiles);

    return {
      projectName,
      success: true,
      filesIndexed: indexedFiles.length,
      filesSkipped: allFiles.length - filesToProcess.length,
      nodesCreated,
      edgesCreated,
      errors: progress.errors,
      durationMs: Date.now() - startTime,
      incremental: isIncrementalRun,
    };
  }

  private buildIndexProgress(startTime: number, errors: string[]): IndexingProgress {
    return {
      phase: 'discovery',
      filesTotal: 0,
      filesProcessed: 0,
      nodesCreated: 0,
      edgesCreated: 0,
      errors,
      startedAt: startTime,
      elapsedMs: 0,
    };
  }

  async index(options: IndexingOptions): Promise<IndexingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const projectName =
      options.projectName ??
      path
        .basename(options.projectRoot)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');
    const progress = this.buildIndexProgress(startTime, errors);
    const report = (phase: string): void => {
      progress.phase = phase;
      progress.elapsedMs = Date.now() - startTime;
      progress.errors = errors;
      options.onProgress?.(progress);
    };

    try {
      return await this.runIndex(options, projectName, report, progress);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        projectName,
        success: false,
        filesIndexed: 0,
        filesSkipped: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        errors,
        durationMs: Date.now() - startTime,
        incremental: false,
      };
    }
  }

  private pruneDeletedFiles(projectName: string, allFiles: DiscoveredFile[]): void {
    const diskPaths = new Set(allFiles.map((f) => f.relativePath));
    for (const hash of this.db.getAllFileHashes(projectName)) {
      if (!diskPaths.has(hash.rel_path)) {
        this.db.deleteNodesByFile(projectName, hash.rel_path);
        this.db.deleteFileHash(projectName, hash.rel_path);
      }
    }
  }

  private async resolveFilesToProcess(
    isIncremental: boolean,
    projectName: string,
    allFiles: DiscoveredFile[],
  ): Promise<{ filesToProcess: DiscoveredFile[]; isIncrementalRun: boolean }> {
    if (isIncremental && this.db.getProject(projectName)) {
      const { changed } = await filterChangedFiles(this.db, projectName, allFiles);
      const isIncrementalRun = changed.length < allFiles.length;

      if (isIncrementalRun) {
        for (const file of changed) this.db.deleteNodesByFile(projectName, file.relativePath);
        this.pruneDeletedFiles(projectName, allFiles);
      }

      return { filesToProcess: changed, isIncrementalRun };
    }

    this.db.deleteProject(projectName);
    return { filesToProcess: allFiles, isIncrementalRun: false };
  }
}
