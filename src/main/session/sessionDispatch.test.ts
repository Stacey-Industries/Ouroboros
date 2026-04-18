/**
 * sessionDispatch.test.ts — Smoke tests for the DispatchJob data model.
 *
 * sessionDispatch.ts is types-only; these tests verify the type shapes
 * assemble correctly and that status literals are exhaustive.
 */

import { describe, expect, it } from 'vitest';

import type { DispatchJob, DispatchJobStatus, DispatchRequest } from './sessionDispatch';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    title: 'Test task',
    prompt: 'Do something useful',
    projectPath: '/home/user/project',
    ...overrides,
  };
}

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-uuid-1',
    request: makeRequest(),
    status: 'queued',
    createdAt: '2026-04-17T00:00:00.000Z',
    ...overrides,
  };
}

// ── Status literals ───────────────────────────────────────────────────────────

const ALL_STATUSES: DispatchJobStatus[] = [
  'queued',
  'starting',
  'running',
  'completed',
  'failed',
  'canceled',
];

describe('DispatchJobStatus', () => {
  it('covers all six expected status values', () => {
    expect(ALL_STATUSES).toHaveLength(6);
  });

  it('each status value is a non-empty string', () => {
    for (const s of ALL_STATUSES) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

// ── DispatchRequest ───────────────────────────────────────────────────────────

describe('DispatchRequest', () => {
  it('requires title, prompt, and projectPath', () => {
    const req = makeRequest();
    expect(req.title).toBe('Test task');
    expect(req.prompt).toBe('Do something useful');
    expect(req.projectPath).toBe('/home/user/project');
  });

  it('accepts an optional worktreeName', () => {
    const req = makeRequest({ worktreeName: 'feature/wave-34' });
    expect(req.worktreeName).toBe('feature/wave-34');
  });

  it('worktreeName is absent when not provided', () => {
    const req = makeRequest();
    expect(req.worktreeName).toBeUndefined();
  });
});

// ── DispatchJob ───────────────────────────────────────────────────────────────

describe('DispatchJob', () => {
  it('constructs a minimal queued job', () => {
    const job = makeJob();
    expect(job.id).toBe('job-uuid-1');
    expect(job.status).toBe('queued');
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('optional fields are absent by default', () => {
    const job = makeJob();
    expect(job.startedAt).toBeUndefined();
    expect(job.endedAt).toBeUndefined();
    expect(job.sessionId).toBeUndefined();
    expect(job.error).toBeUndefined();
    expect(job.deviceId).toBeUndefined();
  });

  it('accepts all optional fields when provided', () => {
    const job = makeJob({
      status: 'failed',
      startedAt: '2026-04-17T00:01:00.000Z',
      endedAt: '2026-04-17T00:02:00.000Z',
      sessionId: 'claude-session-abc',
      error: 'timeout',
      deviceId: 'device-iphone-1',
    });
    expect(job.status).toBe('failed');
    expect(job.startedAt).toBeDefined();
    expect(job.endedAt).toBeDefined();
    expect(job.sessionId).toBe('claude-session-abc');
    expect(job.error).toBe('timeout');
    expect(job.deviceId).toBe('device-iphone-1');
  });

  it('each terminal status can be assigned to DispatchJob.status', () => {
    for (const status of ALL_STATUSES) {
      const job = makeJob({ status });
      expect(job.status).toBe(status);
    }
  });
});
