/**
 * preToolResearchOrchestrator.ts — Fire-and-forget research pre-flight for PreToolUse.
 *
 * Wave 30 Phase D. Called when Claude is about to Edit/Write/MultiEdit a file.
 * Reads the file's imports, evaluates the trigger, and fires research async if
 * indicated. Never blocks the tool call. Never throws.
 */

import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import { getConfigValue } from '../config';
import { getTelemetryStore } from '../telemetry';
import { type CorrectionStore, getCorrectionStore } from './correctionStore';
import { extractImports } from './importExtractor';
import { cacheKey, getResearchCache } from './researchCache';
import { getSnapshot } from './researchSessionState';
import * as researchSubagent from './researchSubagent';
import type { TriggerDecision } from './triggerEvaluator';
import { evaluateTrigger } from './triggerEvaluator';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PreToolResearchInput {
  sessionId: string;
  toolUseId: string;
  /** Absolute path to the target file being edited. */
  filePath: string;
  /** Optional Wave 29.5 trace linkage. */
  correlationId?: string;
  /**
   * Active model ID for the session (e.g. 'claude-sonnet-4-6').
   * Used to resolve per-model training cutoff (Phase J).
   * When absent, getModelCutoffDate falls back to today-180d.
   */
  modelId?: string;
}

// ─── Pending promise registry ─────────────────────────────────────────────────

// Map<sessionId, Promise[]> — consumers (next-turn context builder) can await these.
const pendingBySession = new Map<string, Promise<unknown>[]>();

function addPending(sessionId: string, p: Promise<unknown>): void {
  const list = pendingBySession.get(sessionId) ?? [];
  list.push(p);
  pendingBySession.set(sessionId, list);
}

/** @internal Test-only — inspect pending promises for a session. */
export function getPendingResearchForTests(sessionId: string): Promise<unknown>[] {
  return pendingBySession.get(sessionId) ?? [];
}

/** @internal Test-only — clear all pending state. */
export function resetPendingForTests(): void {
  pendingBySession.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from hook payload (Claude Code tool input), not user-controlled renderer input
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function buildCacheCheck(dbPath: string): (library: string) => boolean {
  return (library: string) => {
    try {
      const cache = getResearchCache(dbPath);
      const key = cacheKey(library, library);
      return cache.get(key) !== null;
    } catch {
      return false;
    }
  };
}

function recordTraceSafe(
  decision: TriggerDecision,
  library: string | undefined,
  correlationId: string | undefined,
): void {
  try {
    const store = getTelemetryStore();
    if (!store) return;
    store.recordTrace({
      id: crypto.randomUUID(),
      traceId: correlationId ?? crypto.randomUUID(),
      sessionId: '',
      phase: 'pre-tool-research-fire',
      payload: { decision, library, correlationId },
    });
  } catch {
    // Swallow — telemetry must never affect the hook pipeline
  }
}

function resolveDbPath(): string {
  try {
    return path.join(app.getPath('userData'), 'research-cache.db');
  } catch {
    return path.join(process.cwd(), 'research-cache.db');
  }
}

function resolveGlobalFlag(): boolean {
  try {
    const cfg = getConfigValue('research' as keyof import('../config').AppConfig) as
      | { auto?: boolean }
      | undefined;
    return cfg?.auto ?? false;
  } catch {
    return false;
  }
}

// ─── Core logic (separated for testability) ───────────────────────────────────

interface OrchestratorDeps {
  readFile?: (p: string) => Promise<string | null>;
  cacheCheck?: (library: string) => boolean;
  runResearch?: typeof researchSubagent.runResearch;
  globalFlag?: boolean;
  /** Injected for tests — defaults to the module-level getCorrectionStore() singleton. */
  correctionStore?: Pick<CorrectionStore, 'getLibraries'>;
}

function mergeEnhancedLibraries(
  sessionId: string,
  stateLibraries: ReadonlySet<string>,
  store: Pick<CorrectionStore, 'getLibraries'>,
): Set<string> {
  const merged = new Set<string>(stateLibraries);
  for (const lib of store.getLibraries(sessionId)) {
    merged.add(lib);
  }
  return merged;
}

interface ResolvedDeps {
  readFile: (p: string) => Promise<string | null>;
  cacheCheckFn: (library: string) => boolean;
  runResearch: typeof researchSubagent.runResearch;
  globalFlag: boolean;
  store: Pick<CorrectionStore, 'getLibraries'>;
}

function resolveDeps(deps: OrchestratorDeps): ResolvedDeps {
  const dbPath = resolveDbPath();
  return {
    readFile: deps.readFile ?? readFileSafe,
    cacheCheckFn: deps.cacheCheck ?? buildCacheCheck(dbPath),
    runResearch: deps.runResearch ?? researchSubagent.runResearch,
    globalFlag: deps.globalFlag ?? resolveGlobalFlag(),
    store: deps.correctionStore ?? getCorrectionStore(),
  };
}

export async function _runOrchestration(
  input: PreToolResearchInput,
  deps: OrchestratorDeps = {},
): Promise<unknown> {
  const { readFile, cacheCheckFn, runResearch, globalFlag, store } = resolveDeps(deps);

  const content = await readFile(input.filePath);
  if (content === null) return null;

  const imports = extractImports(content);
  const sessionFlags = getSnapshot(input.sessionId);
  const enhancedLibraries = mergeEnhancedLibraries(
    input.sessionId,
    sessionFlags.enhancedLibraries,
    store,
  );

  const ctx = {
    dirtyFiles: [{ path: input.filePath, imports }],
    // TODO(wave-30-J): thread modelId from session state once exposed.
    modelId: input.modelId,
    sessionFlags: { mode: sessionFlags.mode, enhancedLibraries },
    cacheCheck: cacheCheckFn,
    globalFlag,
  };

  const decision = evaluateTrigger(ctx);
  if (!decision.fire) return null;

  const library = decision.library ?? '';
  recordTraceSafe(decision, library, input.correlationId);

  return runResearch({ topic: library, library, sessionId: input.sessionId, triggerReason: 'hook' });
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Fire research pre-flight for a PreToolUse event. Fire-and-forget — returns
 * synchronously. Never throws. Stores the returned promise so the next turn's
 * context builder can await-or-skip.
 */
export function maybeFireResearchForPreTool(input: PreToolResearchInput): void {
  const p = _runOrchestration(input).catch(() => null);
  addPending(input.sessionId, p);
}
