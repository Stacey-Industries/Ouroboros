import type { BrowserWindow } from 'electron';
import path from 'path';

import {
  buildPrompt,
  type ClaudeMdGenerationResult,
  type ClaudeMdGenerationStatus,
  discoverDirectories,
  getChangedDirectories,
  spawnClaude,
  toForwardSlash,
  writeClaudeMd,
} from './claudeMdGeneratorSupport';
import { getConfigValue, setConfigValue } from './config';
import log from './logger';
import { broadcastToWebClients } from './web/webServer';

export type { ClaudeMdGenerationResult, ClaudeMdGenerationStatus };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOLDOWN_MS = 180_000; // Ignore triggers for 3min after generation completes
const SPAWN_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 5000;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;

let status: ClaudeMdGenerationStatus = {
  running: false,
};

let lastCompletedAt = 0;

function loadCooldownTimestamp(): number {
  try {
    const settings = getConfigValue('claudeMdSettings');
    return ((settings as unknown as Record<string, unknown>)._lastCompletedAt as number) ?? 0;
  } catch {
    return 0;
  }
}

function saveCooldownTimestamp(ts: number): void {
  try {
    const settings = getConfigValue('claudeMdSettings');
    setConfigValue('claudeMdSettings', { ...settings, _lastCompletedAt: ts } as typeof settings);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function broadcastStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('claudeMd:statusChange', status);
  }
  broadcastToWebClients('claudeMd:statusChange', status);
}

function updateStatus(patch: Partial<ClaudeMdGenerationStatus>): void {
  status = { ...status, ...patch };
  broadcastStatus();
}

// ---------------------------------------------------------------------------
// Skip-check helpers (reduce complexity in generateForDirectory)
// ---------------------------------------------------------------------------

function makeResult(
  relPath: string,
  filePath: string,
  resultStatus: ClaudeMdGenerationResult['status'],
  error?: string,
): ClaudeMdGenerationResult {
  return { dirPath: relPath, filePath: toForwardSlash(filePath), status: resultStatus, error };
}

function isExcluded(relPath: string, excludeDirs: string[]): boolean {
  return excludeDirs.some((exclude) => relPath.startsWith(exclude) || relPath === exclude);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initClaudeMdGenerator(win: BrowserWindow): void {
  mainWindow = win;
  lastCompletedAt = loadCooldownTimestamp();
  log.info('Generator initialized');
}

async function spawnClaudeWithRetry(prompt: string, model: string): Promise<string | undefined> {
  let lastErr: string | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await spawnClaude(prompt, model);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      const isRateLimit = /rate|429/i.test(lastErr);
      if (!isRateLimit || attempt === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }
  throw new Error(lastErr);
}

export async function generateForDirectory(
  projectRoot: string,
  dirPath: string,
): Promise<ClaudeMdGenerationResult> {
  const relPath = toForwardSlash(path.relative(projectRoot, dirPath));
  const filePath = path.join(dirPath, 'CLAUDE.md');

  const settings = getConfigValue('claudeMdSettings');
  if (!settings.enabled) return makeResult(relPath, filePath, 'skipped');
  if (isExcluded(relPath, settings.excludeDirs || []))
    return makeResult(relPath, filePath, 'skipped');

  updateStatus({ currentDir: relPath });

  try {
    const generated = await spawnClaudeWithRetry(
      await buildPrompt(dirPath, projectRoot),
      settings.model || 'sonnet',
    );
    if (!generated || generated.length < 10) {
      log.info(`claudeMd: ${relPath} → skipped`);
      return makeResult(relPath, filePath, 'skipped');
    }
    const writeStatus = await writeClaudeMd(filePath, generated);
    log.info(`claudeMd: ${relPath} → ${writeStatus}`);
    return makeResult(relPath, filePath, writeStatus);
  } catch (err) {
    const lastErr = err instanceof Error ? err.message : String(err);
    log.info(`claudeMd: ${relPath} → error: ${lastErr}`);
    return makeResult(relPath, filePath, 'error', lastErr);
  }
}

// ---------------------------------------------------------------------------
// generateClaudeMd — split into helpers to stay under complexity/line limits
// ---------------------------------------------------------------------------

function shouldSkipGeneration(): boolean {
  if (status.running) return true;
  if (Date.now() - lastCompletedAt < COOLDOWN_MS) return true;
  return !getConfigValue('claudeMdSettings').enabled;
}

async function collectCandidateDirs(projectRoot: string): Promise<string[]> {
  const settings = getConfigValue('claudeMdSettings');
  const allDirs: string[] = [];

  if (settings.generateRoot) {
    allDirs.push(projectRoot);
  }

  if (settings.generateSubdirs) {
    try {
      allDirs.push(...(await discoverDirectories(path.join(projectRoot, 'src'))));
    } catch {
      log.info('Could not discover directories under src/');
    }
  }

  return allDirs;
}

function filterToChangedDirs(allDirs: string[], changedDirs: Set<string>): string[] {
  if (changedDirs.size === 0) return allDirs;
  const filtered = allDirs.filter((d) => {
    for (const changed of changedDirs) {
      if (changed.startsWith(d) || d.startsWith(changed)) return true;
    }
    return false;
  });
  return filtered.length > 0 ? filtered : allDirs;
}

async function resolveTargetDirs(
  projectRoot: string,
  allDirs: string[],
  fullSweep: boolean,
): Promise<string[]> {
  if (fullSweep) return allDirs;
  const changedDirs = await getChangedDirectories(projectRoot);
  return filterToChangedDirs(allDirs, changedDirs);
}

async function processDirectories(
  projectRoot: string,
  targetDirs: string[],
): Promise<ClaudeMdGenerationResult[]> {
  const results: ClaudeMdGenerationResult[] = [];
  updateStatus({ progress: { completed: 0, total: targetDirs.length } });

  for (const [i, dir] of targetDirs.entries()) {
    results.push(await generateForDirectory(projectRoot, dir));
    updateStatus({ progress: { completed: i + 1, total: targetDirs.length } });
    if (i < targetDirs.length - 1) {
      await new Promise((r) => setTimeout(r, SPAWN_DELAY_MS));
    }
  }

  return results;
}

function finalizeGeneration(results: ClaudeMdGenerationResult[]): void {
  lastCompletedAt = Date.now();
  saveCooldownTimestamp(lastCompletedAt);
  updateStatus({
    running: false,
    currentDir: undefined,
    progress: undefined,
    lastRun: { timestamp: Date.now(), results },
  });
}

export async function generateClaudeMd(
  projectRoot: string,
  options?: { fullSweep?: boolean },
): Promise<ClaudeMdGenerationResult[]> {
  if (shouldSkipGeneration()) return [];

  updateStatus({ running: true, progress: { completed: 0, total: 0 } });
  const results: ClaudeMdGenerationResult[] = [];

  try {
    const allDirs = await collectCandidateDirs(projectRoot);
    const targetDirs = await resolveTargetDirs(projectRoot, allDirs, options?.fullSweep ?? false);
    results.push(...(await processDirectories(projectRoot, targetDirs)));
  } catch (err) {
    log.info(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    finalizeGeneration(results);
  }

  return results;
}

export function getGenerationStatus(): ClaudeMdGenerationStatus {
  return { ...status };
}
