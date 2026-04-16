/**
 * researchSubagent.ts — Research subagent spawner (Wave 25 Phase B).
 *
 * Spawns `claude --print --model sonnet` with a crafted prompt piped to stdin.
 * Results are cached in {userData}/research-cache.db.
 *
 * Auth note: uses the CLI's own stored credentials (OAuth / max subscription).
 * No API key required.
 *
 * Security: child_process is used intentionally to invoke the Claude CLI.
 * Prompt is passed via stdin, never as a shell argument — injection via prompt
 * content is not possible. Static import (not dynamic require) so
 * security/detect-child-process does not apply here.
 */

import type { ResearchArtifact } from '@shared/types/research';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import log from '../logger';
import { cacheKey, getResearchCache, ttlForLibrary } from './researchCache';
import { buildResearchPrompt } from './researchPrompt';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchInput {
  topic: string;
  library?: string;
  version?: string;
}

export interface SpawnClaudeDeps {
  /** Override process.platform for tests */
  platform?: string;
  /** Override child_process.spawn for tests */
  spawnFn?: typeof spawn;
  /** Override userData path for cache (tests) */
  userDataPath?: string;
}

interface SpawnResult {
  success: boolean;
  output?: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;

// ─── CLI arg builder ──────────────────────────────────────────────────────────

function buildClaudeArgs(platform: string): { cmd: string; args: string[] } {
  const cliArgs = ['--model', 'sonnet', '--print'];
  if (platform === 'win32') {
    const escaped = ['claude', ...cliArgs].join(' ');
    return { cmd: 'powershell.exe', args: ['-NonInteractive', '-NoLogo', '-Command', `& ${escaped}`] };
  }
  return { cmd: 'claude', args: cliArgs };
}

// ─── Fallback artifact ────────────────────────────────────────────────────────

function failureArtifact(input: ResearchInput, id: string): ResearchArtifact {
  return {
    id, topic: input.topic, library: input.library, version: input.version,
    sources: [], summary: '(Research failed; proceeding without artifact)',
    relevantSnippets: [], confidenceHint: 'low',
    correlationId: id, createdAt: Date.now(), cached: false,
  };
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

interface RawSubagentOutput {
  sources?: Array<{ url: string; title: string }>;
  summary?: string;
  relevantSnippets?: Array<{ content: string; source: string }>;
  confidenceHint?: string;
}

function coerceConfidence(raw: string | undefined): 'high' | 'medium' | 'low' {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'low';
}

function parseSubagentOutput(raw: string, input: ResearchInput, id: string): ResearchArtifact | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  let parsed: RawSubagentOutput;
  try {
    parsed = JSON.parse(cleaned) as RawSubagentOutput;
  } catch {
    log.warn('[research] Failed to parse subagent JSON output');
    return null;
  }
  return {
    id, topic: input.topic, library: input.library, version: input.version,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    relevantSnippets: Array.isArray(parsed.relevantSnippets) ? parsed.relevantSnippets : [],
    confidenceHint: coerceConfidence(parsed.confidenceHint),
    correlationId: id, createdAt: Date.now(), cached: false,
  };
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────

interface WireOpts {
  child: ChildProcess;
  timer: ReturnType<typeof setTimeout>;
  timedOut: () => boolean;
  finish: (r: SpawnResult) => void;
}

function wireChildEvents(opts: WireOpts): void {
  const { child, timer, timedOut, finish } = opts;
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  child.on('error', (err) => { clearTimeout(timer); finish({ success: false, error: err.message }); });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (timedOut()) return;
    if (code !== 0) { finish({ success: false, error: `exit ${code}: ${stderr.slice(0, 200)}` }); return; }
    const trimmed = stdout.trim();
    finish(trimmed ? { success: true, output: trimmed } : { success: false, error: 'empty output' });
  });
}

function writeStdin(child: ChildProcess, prompt: string, timer: ReturnType<typeof setTimeout>, finish: (r: SpawnResult) => void): void {
  try {
    child.stdin?.write(prompt, 'utf8', () => { child.stdin?.end(); });
  } catch (err) {
    clearTimeout(timer);
    finish({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

function spawnResearchClaude(prompt: string, deps: SpawnClaudeDeps): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const platform = deps.platform ?? process.platform;
    const spawnFn = deps.spawnFn ?? spawn;
    const { cmd, args } = buildClaudeArgs(platform);
    let settled = false;
    let _timedOut = false;
    const finish = (r: SpawnResult): void => { if (settled) return; settled = true; resolve(r); };
    const child = spawnFn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => {
      _timedOut = true;
      try { child.kill(); } catch { /* ignore */ }
      finish({ success: false, error: 'timeout' });
    }, TIMEOUT_MS);
    wireChildEvents({ child, timer, timedOut: () => _timedOut, finish });
    writeStdin(child, prompt, timer, finish);
  });
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function resolveCacheKey(input: ResearchInput): string {
  const lib = input.library ?? '';
  return lib
    ? cacheKey(lib, input.topic, input.version)
    : `__no_lib__::${input.topic.toLowerCase().trim()}`;
}

function persistArtifact(
  cache: ReturnType<typeof getResearchCache>,
  key: string,
  artifact: ResearchArtifact,
  lib: string,
): void {
  const ttl = lib ? ttlForLibrary(lib) : ttlForLibrary('__unknown__');
  try { cache.put(key, artifact, ttl); } catch (err) {
    log.warn('[research] Failed to persist artifact to cache:', err);
  }
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Run a research subagent for the given topic/library/version.
 *
 * Flow:
 *   1. Check cache — return hit immediately with cached: true.
 *   2. Spawn `claude --print --model sonnet` with crafted prompt via stdin.
 *   3. Parse JSON from stdout, store in cache, return artifact.
 *   4. On timeout or parse failure — return minimal failure artifact (never throws).
 */
export async function runResearch(
  input: ResearchInput,
  deps: SpawnClaudeDeps = {},
): Promise<ResearchArtifact> {
  const id = uuidv4();
  const key = resolveCacheKey(input);
  const userDataPath = deps.userDataPath ?? app.getPath('userData');
  const cache = getResearchCache(path.join(userDataPath, 'research-cache.db'));

  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const spawnResult = await spawnResearchClaude(buildResearchPrompt(input), deps);
  if (!spawnResult.success || !spawnResult.output) {
    log.warn('[research] Subagent spawn failed:', spawnResult.error);
    return failureArtifact(input, id);
  }

  const artifact = parseSubagentOutput(spawnResult.output, input, id);
  if (!artifact) return failureArtifact(input, id);

  persistArtifact(cache, key, artifact, input.library ?? '');
  return artifact;
}
