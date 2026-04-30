/* eslint-disable security/detect-non-literal-fs-filename -- test file; all paths derived from os.tmpdir() */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CoachLogEntry, createCoachLogger } from './coachLogger';

// ─── Temp dir setup ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-logger-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createCoachLogger', () => {
  it('returns an object with log and close methods', () => {
    const logger = createCoachLogger(tmpDir);
    expect(logger).toHaveProperty('log');
    expect(logger).toHaveProperty('close');
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.close).toBe('function');
    logger.close();
  });

  it('writes a single JSONL line with newline terminator', () => {
    const logger = createCoachLogger(tmpDir);
    const entry: CoachLogEntry = {
      timestamp: '2026-04-29T10:00:00Z',
      sessionId: 'sess-123',
      nudgeId: 'nudge-456',
      patternId: 'pattern-789',
      escalation: 'soft',
      toolCall: { tool: 'Read', input: { file_path: '/tmp/test.ts' } },
      outcome: 'pending',
    };

    logger.log(entry);
    logger.close();

    const logPath = path.join(tmpDir, 'delegation-coach.jsonl');
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines.at(0) ?? '{}');
    expect(parsed).toEqual(entry);
    expect(content.endsWith('\n')).toBe(true);
  });

  it('appends multiple log calls to the same file', () => {
    const logger = createCoachLogger(tmpDir);

    const entries: CoachLogEntry[] = [
      {
        timestamp: '2026-04-29T10:00:00Z',
        sessionId: 'sess-1',
        nudgeId: 'nudge-1',
        patternId: 'pattern-1',
        escalation: 'soft',
        toolCall: { tool: 'Read', input: {} },
        outcome: 'pending',
      },
      {
        timestamp: '2026-04-29T10:01:00Z',
        sessionId: 'sess-1',
        nudgeId: 'nudge-2',
        patternId: 'pattern-2',
        escalation: 'acknowledgment',
        toolCall: { tool: 'Edit', input: {} },
        outcome: 'taken',
      },
      {
        timestamp: '2026-04-29T10:02:00Z',
        sessionId: 'sess-2',
        nudgeId: 'nudge-3',
        patternId: 'pattern-1',
        escalation: 'hard',
        toolCall: { tool: 'Bash', input: {} },
        outcome: 'ignored',
      },
    ];

    entries.forEach((entry) => logger.log(entry));
    logger.close();

    const logPath = path.join(tmpDir, 'delegation-coach.jsonl');
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(3);
    lines.forEach((line, index) => {
      const parsed = JSON.parse(line);

      expect(parsed).toEqual(entries.at(index));
    });
  });

  it('rotates file when size exceeds 10 MB', () => {
    const logger = createCoachLogger(tmpDir);

    // Rotation is checked at the START of each writeLine, so we need at least
    // two log() calls: the first writes the oversized payload (file becomes
    // >10MB), the second triggers the size check → rename → fresh file.
    const largePayload = 'x'.repeat(11 * 1024 * 1024);
    const bigEntry: CoachLogEntry = {
      timestamp: '2026-04-29T10:00:00Z',
      sessionId: 'sess-123',
      nudgeId: 'nudge-1',
      patternId: 'pattern-789',
      escalation: 'soft',
      toolCall: { tool: 'Read', input: {} },
      outcome: 'pending',
      meta: { payload: largePayload },
    };
    const smallEntry: CoachLogEntry = {
      timestamp: '2026-04-29T10:00:01Z',
      sessionId: 'sess-123',
      nudgeId: 'nudge-2',
      patternId: 'pattern-789',
      escalation: 'soft',
      toolCall: { tool: 'Edit', input: {} },
      outcome: 'pending',
    };

    logger.log(bigEntry); // file grows past threshold
    logger.log(smallEntry); // pre-write check triggers rotation

    const logPath = path.join(tmpDir, 'delegation-coach.jsonl');
    const files = fs.readdirSync(tmpDir);

    // Both the rotated archive and the fresh main file should exist.
    expect(files.length).toBeGreaterThanOrEqual(2);
    const rotatedFile = files.find((f) => f.match(/delegation-coach\.\d{4}-\d{2}-\d{2}\.jsonl/));
    expect(rotatedFile).toBeDefined();

    // Fresh main file holds only the second entry (no carry-over from rotation).
    expect(fs.existsSync(logPath)).toBe(true);
    const newContent = fs.readFileSync(logPath, 'utf8');
    const newLines = newContent
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    expect(newLines).toHaveLength(1);
    expect(JSON.parse(newLines[0]).nudgeId).toBe('nudge-2');

    logger.close();
  });

  it('close releases the file descriptor; subsequent log reopens', () => {
    const logger = createCoachLogger(tmpDir);
    const entry: CoachLogEntry = {
      timestamp: '2026-04-29T10:00:00Z',
      sessionId: 'sess-123',
      nudgeId: 'nudge-456',
      patternId: 'pattern-789',
      escalation: 'soft',
      toolCall: { tool: 'Read', input: {} },
      outcome: 'pending',
    };

    logger.log(entry);
    logger.close();

    // Log again after close — should reopen
    logger.log(entry);
    logger.close();

    const logPath = path.join(tmpDir, 'delegation-coach.jsonl');
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');

    // Both entries should be present
    expect(lines).toHaveLength(2);
    lines.forEach((line) => {
      const parsed = JSON.parse(line);
      expect(parsed).toEqual(entry);
    });
  });

  it('preserves all entry fields including optional meta', () => {
    const logger = createCoachLogger(tmpDir);
    const entry: CoachLogEntry = {
      timestamp: '2026-04-29T10:00:00Z',
      sessionId: 'sess-123',
      nudgeId: 'nudge-456',
      patternId: 'pattern-789',
      escalation: 'hard',
      toolCall: { tool: 'Edit', input: { file_path: '/src/foo.ts', new_string: 'bar' } },
      outcome: 'bypassed',
      meta: { reason: 'subagent-active', confidence: 0.85 },
    };

    logger.log(entry);
    logger.close();

    const logPath = path.join(tmpDir, 'delegation-coach.jsonl');
    const content = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());

    expect(parsed.meta).toEqual({ reason: 'subagent-active', confidence: 0.85 });
    expect(parsed.toolCall.input.file_path).toBe('/src/foo.ts');
  });
});
