import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computePromptHash, createRouterLogger } from './routerLogger';
import type { RoutingLogEntry } from './routerTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

function logPath(): string {
  return path.join(tmpDir, 'router-decisions.jsonl');
}

function makeEntry(promptPreview = 'fix the bug'): RoutingLogEntry {
  return {
    timestamp: new Date().toISOString(),
    promptPreview,
    promptHash: computePromptHash(promptPreview),
    tier: 'SONNET',
    model: 'claude-sonnet-4-6',
    routedBy: 'rule',
    rule: 'S1',
    confidence: 0.9,
    latencyMs: 12,
    layer1Result: { tier: 'SONNET', rule: 'S1', confidence: 'HIGH' },
    layer2Result: null,
    layer3Result: null,
    override: null,
  };
}

function readLines(): RoutingLogEntry[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is os.tmpdir() derived
  const raw = fs.readFileSync(logPath(), 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RoutingLogEntry);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-log-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createRouterLogger', () => {
  it('log() writes a valid JSON line to the file', () => {
    const logger = createRouterLogger(tmpDir);
    logger.log(makeEntry());
    logger.close();

    const lines = readLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].tier).toBe('SONNET');
    expect(lines[0].model).toBe('claude-sonnet-4-6');
    expect(lines[0].override).toBeNull();
  });

  it('logOverride() includes a non-null override field', () => {
    const logger = createRouterLogger(tmpDir);
    logger.logOverride('SONNET', 'claude-opus-4-6', 'please review this carefully');
    logger.close();

    const lines = readLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].override).not.toBeNull();
    expect(lines[0].override?.userChosenModel).toBe('claude-opus-4-6');
    expect(lines[0].override?.routerSuggestedTier).toBe('SONNET');
  });

  it('multiple log() calls append rather than overwrite', () => {
    const logger = createRouterLogger(tmpDir);
    logger.log(makeEntry('first prompt'));
    logger.log(makeEntry('second prompt'));
    logger.log(makeEntry('third prompt'));
    logger.close();

    const lines = readLines();
    expect(lines).toHaveLength(3);
    expect(lines[0].promptPreview).toBe('first prompt');
    expect(lines[1].promptPreview).toBe('second prompt');
    expect(lines[2].promptPreview).toBe('third prompt');
  });

  it('promptHash is deterministic — same prompt produces same hash', () => {
    const prompt = 'please refactor the auth module';
    const hash1 = computePromptHash(prompt);
    const hash2 = computePromptHash(prompt);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('promptHash differs for different prompts', () => {
    expect(computePromptHash('prompt A')).not.toBe(computePromptHash('prompt B'));
  });
});
