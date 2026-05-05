import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendConsoleEntry,
  type ConsoleEntry,
  REPRO_OUTPUT_DIR_ENV,
  type ReproSummary,
  writeReproSummary,
} from './reproArtifacts';

describe('reproArtifacts', () => {
  let tmpDir: string;

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('REPRO_OUTPUT_DIR_ENV', () => {
    it('should be the correct env var name', () => {
      expect(REPRO_OUTPUT_DIR_ENV).toBe('PW_REPRO_OUTPUT_DIR');
    });
  });

  describe('appendConsoleEntry', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-artifacts-test-'));
    });

    it('should append a single entry to console.jsonl', () => {
      const entry: ConsoleEntry = {
        ts: '2026-05-05T12:00:00Z',
        type: 'log',
        text: 'test message',
      };

      appendConsoleEntry(tmpDir, entry);

      const filePath = path.join(tmpDir, 'console.jsonl');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(entry);
    });

    it('should append multiple entries as separate lines', () => {
      const entry1: ConsoleEntry = {
        ts: '2026-05-05T12:00:00Z',
        type: 'log',
        text: 'first',
      };

      const entry2: ConsoleEntry = {
        ts: '2026-05-05T12:00:01Z',
        type: 'warn',
        text: 'second',
      };

      appendConsoleEntry(tmpDir, entry1);
      appendConsoleEntry(tmpDir, entry2);

      const filePath = path.join(tmpDir, 'console.jsonl');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(entry1);
      expect(JSON.parse(lines[1])).toEqual(entry2);
    });

    it('should preserve location field when present', () => {
      const entry: ConsoleEntry = {
        ts: '2026-05-05T12:00:00Z',
        type: 'error',
        text: 'test error',
        location: { url: 'http://example.com', line: 10, column: 5 },
      };

      appendConsoleEntry(tmpDir, entry);

      const filePath = path.join(tmpDir, 'console.jsonl');
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(entry);
      expect(parsed.location).toEqual({ url: 'http://example.com', line: 10, column: 5 });
    });

    it('should omit location field when not present', () => {
      const entry: ConsoleEntry = {
        ts: '2026-05-05T12:00:00Z',
        type: 'info',
        text: 'test info',
      };

      appendConsoleEntry(tmpDir, entry);

      const filePath = path.join(tmpDir, 'console.jsonl');
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed).toEqual(entry);
      expect(parsed.location).toBeUndefined();
    });

    it('should produce valid line-delimited JSON that parses successfully', () => {
      const entries: ConsoleEntry[] = [
        { ts: '2026-05-05T12:00:00Z', type: 'log', text: 'msg1' },
        { ts: '2026-05-05T12:00:01Z', type: 'warn', text: 'msg2' },
        { ts: '2026-05-05T12:00:02Z', type: 'error', text: 'msg3' },
      ];

      entries.forEach((e) => appendConsoleEntry(tmpDir, e));

      const filePath = path.join(tmpDir, 'console.jsonl');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      const parsed = lines.map((line) => JSON.parse(line));

      expect(parsed).toHaveLength(3);
      expect(parsed).toEqual(entries);
    });
  });

  describe('writeReproSummary', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repro-artifacts-test-'));
    });

    it('should write a valid ReproSummary to summary.json', () => {
      const summary: ReproSummary = {
        name: 'test-slug',
        startedAt: '2026-05-05T12:00:00Z',
        finishedAt: '2026-05-05T12:00:05Z',
        durationMs: 5000,
        passed: true,
        screenshots: ['screenshot-01.png'],
        consoleTranscriptPath: 'console.jsonl',
        tracePath: 'trace.zip',
        testFile: 'e2e/_repro-test.spec.ts',
      };

      writeReproSummary(tmpDir, summary);

      const filePath = path.join(tmpDir, 'summary.json');
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(summary);
    });

    it('should round-trip with all fields preserved', () => {
      const summary: ReproSummary = {
        name: 'myslug',
        startedAt: '2026-05-05T13:30:15.123Z',
        finishedAt: '2026-05-05T13:30:45.456Z',
        durationMs: 30333,
        passed: false,
        screenshots: ['screenshot-01.png', 'screenshot-02.png'],
        consoleTranscriptPath: 'console.jsonl',
        tracePath: 'trace.zip',
        testFile: 'e2e/_repro-myslug.spec.ts',
      };

      writeReproSummary(tmpDir, summary);

      const filePath = path.join(tmpDir, 'summary.json');
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe(summary.name);
      expect(parsed.startedAt).toBe(summary.startedAt);
      expect(parsed.finishedAt).toBe(summary.finishedAt);
      expect(parsed.durationMs).toBe(summary.durationMs);
      expect(parsed.passed).toBe(summary.passed);
      expect(parsed.screenshots).toEqual(summary.screenshots);
      expect(parsed.consoleTranscriptPath).toBe(summary.consoleTranscriptPath);
      expect(parsed.tracePath).toBe(summary.tracePath);
      expect(parsed.testFile).toBe(summary.testFile);
    });

    it('should preserve tracePath as null when specified', () => {
      const summary: ReproSummary = {
        name: 'test-slug',
        startedAt: '2026-05-05T12:00:00Z',
        finishedAt: '2026-05-05T12:00:05Z',
        durationMs: 5000,
        passed: true,
        screenshots: ['screenshot-01.png'],
        consoleTranscriptPath: 'console.jsonl',
        tracePath: null,
        testFile: 'e2e/_repro-test.spec.ts',
      };

      writeReproSummary(tmpDir, summary);

      const filePath = path.join(tmpDir, 'summary.json');
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.tracePath).toBeNull();
    });

    it('should format JSON with 2-space indentation', () => {
      const summary: ReproSummary = {
        name: 'test',
        startedAt: '2026-05-05T12:00:00Z',
        finishedAt: '2026-05-05T12:00:01Z',
        durationMs: 1000,
        passed: true,
        screenshots: [],
        consoleTranscriptPath: 'console.jsonl',
        tracePath: null,
        testFile: 'test.spec.ts',
      };

      writeReproSummary(tmpDir, summary);

      const filePath = path.join(tmpDir, 'summary.json');
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for 2-space indentation pattern (multiline so ^ matches line starts)
      expect(content).toMatch(/^ {2}"/m);
    });
  });
});
