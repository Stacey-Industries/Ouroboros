/**
 * flowPersistence.ts — Save / load / list FlowTrace objects to disk.
 *
 * Storage locations (relative to workspaceRoot):
 *   .ouroboros/flows/<flowId>.json         — when flowTracer.saveSharedFlows is false (default)
 *   .ouroboros-shared/flows/<flowId>.json  — when flowTracer.saveSharedFlows is true
 *
 * Writes are atomic: write to <file>.tmp then rename over <file>.
 * Matches the credentialStore.ts pattern used elsewhere in this codebase.
 *
 * Decision 10 (wave-85-decisions.md): .ouroboros stays in .gitignore (personal artifacts).
 * .ouroboros-shared/ is NOT gitignored — explicit opt-in for team-shared flows.
 */

import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises';
import path from 'path';

import type { FlowTrace, SavedFlowSummary } from '../../shared/types/flowTracer';
import { getConfigValue } from '../config';
import log from '../logger';

// ── Types stored on disk ─────────────────────────────────────────────────────

interface PersistedFlowRecord {
  id: string;
  title: string;
  savedAt: number;
  flow: FlowTrace;
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function getFlowsDir(workspaceRoot: string, shared: boolean): string {
  const dotDir = shared ? '.ouroboros-shared' : '.ouroboros';
  return path.join(workspaceRoot, dotDir, 'flows');
}

function isSaveSharedFlows(): boolean {
  const setting = getConfigValue('flowTracer' as never) as
    | { saveSharedFlows?: boolean }
    | undefined;
  return setting?.saveSharedFlows === true;
}

function getActiveWorkspaceRoot(): string {
  return (getConfigValue('defaultProjectRoot') as string | undefined) ?? process.cwd();
}

// ── Ensure directory exists (lazy, idempotent) ───────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await mkdir(dir, { recursive: true });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a FlowTrace to disk. Returns the assigned flowId.
 * Atomic write: write to .tmp then rename.
 */
export async function saveFlow(
  flow: FlowTrace,
  title: string,
  workspaceRoot?: string,
): Promise<{ id: string }> {
  const root = workspaceRoot ?? getActiveWorkspaceRoot();
  const shared = isSaveSharedFlows();
  const id = randomUUID();
  const dir = getFlowsDir(root, shared);

  await ensureDir(dir);

  const record: PersistedFlowRecord = { id, title, savedAt: Date.now(), flow };
  const data = JSON.stringify(record, null, 2);
  const filePath = path.join(dir, `${id}.json`);
  const tmpPath = `${filePath}.tmp`;

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(tmpPath, data, 'utf-8');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await rename(tmpPath, filePath);

  log.info('[flowPersistence] saved flow', { id, title, shared });
  return { id };
}

/**
 * List saved flows from both .ouroboros/flows and .ouroboros-shared/flows.
 * Returns lightweight summaries; does NOT load full FlowTrace objects.
 */
export async function listSavedFlows(workspaceRoot?: string): Promise<SavedFlowSummary[]> {
  const root = workspaceRoot ?? getActiveWorkspaceRoot();
  const results: SavedFlowSummary[] = [];

  for (const shared of [false, true]) {
    const dir = getFlowsDir(root, shared);
    let entries: string[];
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      entries = await readdir(dir);
    } catch {
      // Directory doesn't exist yet — normal on first run
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      // Phase 4's flow-Why cache writes to `<flowId>-why.json` in this same
      // directory; those are FlowWhyEntry[] blobs, not saved-flow records.
      if (entry.endsWith('-why.json')) continue;
      const filePath = path.join(dir, entry);
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const raw = await readFile(filePath, 'utf-8');
        const record = JSON.parse(raw) as PersistedFlowRecord;
        results.push({
          id: record.id,
          title: record.title,
          savedAt: record.savedAt,
          layerCount: record.flow.metadata.layerCount,
          source: shared ? 'shared' : 'local',
        });
      } catch (err) {
        log.warn('[flowPersistence] skipping unreadable flow file', { filePath, err });
      }
    }
  }

  // Most-recently-saved first
  results.sort((a, b) => b.savedAt - a.savedAt);
  return results;
}

/**
 * Load a saved FlowTrace by id.
 * Searches both .ouroboros/flows and .ouroboros-shared/flows.
 */
export async function loadFlow(id: string, workspaceRoot?: string): Promise<FlowTrace> {
  const root = workspaceRoot ?? getActiveWorkspaceRoot();

  for (const shared of [false, true]) {
    const filePath = path.join(getFlowsDir(root, shared), `${id}.json`);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const raw = await readFile(filePath, 'utf-8');
      const record = JSON.parse(raw) as PersistedFlowRecord;
      log.info('[flowPersistence] loaded flow', { id, shared });
      return record.flow;
    } catch {
      // Not in this directory — try the other
    }
  }

  throw new Error(`Flow not found: ${id}`);
}

/**
 * Delete a saved flow by id.
 * Searches both locations. Does not throw if the file isn't found.
 */
// DEFERRED-CONSUMER: wave-86 — IPC handler + renderer affordance not yet
// wired. Phase 7 deliberately scoped delete-UI out.
export async function deleteSavedFlow(id: string, workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? getActiveWorkspaceRoot();

  for (const shared of [false, true]) {
    const filePath = path.join(getFlowsDir(root, shared), `${id}.json`);
    try {
      await rm(filePath);
      log.info('[flowPersistence] deleted flow', { id, shared });
      return;
    } catch {
      // Not in this directory — try the other
    }
  }

  log.warn('[flowPersistence] deleteSavedFlow: file not found', { id });
}
