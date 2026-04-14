/**
 * backgroundJobs/jobStore.ts — SQLite CRUD for the background_jobs table.
 *
 * Uses the existing database.ts WAL-mode foundation.
 * subscribeChanges() provides an in-process event emitter for status changes.
 */

import type { BackgroundJob, BackgroundJobRequest } from '@shared/types/backgroundJob';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import path from 'path';

import type { Database } from '../storage/database';
import {
  getSchemaVersion,
  openDatabase,
  setSchemaVersion,
} from '../storage/database';

// ── Schema ────────────────────────────────────────────────────────────────────

function ensureSchema(db: Database): void {
  if (getSchemaVersion(db) >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      projectRoot TEXT NOT NULL,
      prompt TEXT NOT NULL,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      completedAt TEXT,
      exitCode INTEGER,
      sessionId TEXT,
      resultSummary TEXT,
      errorMessage TEXT,
      costUsd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_bgjobs_status ON background_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_bgjobs_root ON background_jobs(projectRoot);
    CREATE INDEX IF NOT EXISTS idx_bgjobs_created ON background_jobs(createdAt DESC);
  `);
  setSchemaVersion(db, 1);
}

// ── Row mapper ────────────────────────────────────────────────────────────────

type JobRow = {
  id: string; projectRoot: string; prompt: string; label: string | null;
  status: string; createdAt: string; startedAt: string | null;
  completedAt: string | null; exitCode: number | null; sessionId: string | null;
  resultSummary: string | null; errorMessage: string | null; costUsd: number | null;
};

function rowToJob(row: JobRow): BackgroundJob {
  return {
    id: row.id,
    projectRoot: row.projectRoot,
    prompt: row.prompt,
    ...(row.label != null ? { label: row.label } : {}),
    status: row.status as BackgroundJob['status'],
    createdAt: row.createdAt,
    ...(row.startedAt != null ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt != null ? { completedAt: row.completedAt } : {}),
    ...(row.exitCode != null ? { exitCode: row.exitCode } : {}),
    ...(row.sessionId != null ? { sessionId: row.sessionId } : {}),
    ...(row.resultSummary != null ? { resultSummary: row.resultSummary } : {}),
    ...(row.errorMessage != null ? { errorMessage: row.errorMessage } : {}),
    ...(row.costUsd != null ? { costUsd: row.costUsd } : {}),
  };
}

// ── JobStore interface ────────────────────────────────────────────────────────

export type ChangeCallback = (jobId: string, changes: Partial<BackgroundJob>) => void;

export interface JobStore {
  createJob(req: BackgroundJobRequest): BackgroundJob;
  getJob(id: string): BackgroundJob | null;
  updateJob(id: string, changes: Partial<BackgroundJob>): void;
  listJobs(projectRoot?: string): BackgroundJob[];
  deleteCompleted(): void;
  reconcileInterrupted(): void;
  subscribeChanges(cb: ChangeCallback): () => void;
  close(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

function buildJobUpdateSql(changes: Partial<BackgroundJob>): { sql: string; values: unknown[] } {
  const keys = Object.keys(changes) as Array<keyof BackgroundJob>;
  const setClauses = keys.map((k) => `${k} = ?`).join(', ');
  // eslint-disable-next-line security/detect-object-injection -- keys are enumerated from BackgroundJob type via Object.keys
  const values = keys.map((k) => { const v = changes[k]; return v === undefined ? null : v; });
  return { sql: `UPDATE background_jobs SET ${setClauses} WHERE id = ?`, values };
}

function makeJobCrud(db: Database, notify: (id: string, ch: Partial<BackgroundJob>) => void) {
  function createJob(req: BackgroundJobRequest): BackgroundJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id,
      projectRoot: req.projectRoot,
      prompt: req.prompt,
      ...(req.label != null ? { label: req.label } : {}),
      status: 'queued',
      createdAt: now,
    };
    db.prepare(
      `INSERT INTO background_jobs (id, projectRoot, prompt, label, status, createdAt) VALUES (?, ?, ?, ?, 'queued', ?)`,
    ).run(id, req.projectRoot, req.prompt, req.label ?? null, now);
    notify(id, job);
    return job;
  }

  function getJob(id: string): BackgroundJob | null {
    const row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  function updateJob(id: string, changes: Partial<BackgroundJob>): void {
    const keys = Object.keys(changes) as Array<keyof BackgroundJob>;
    if (keys.length === 0) return;
    const { sql, values } = buildJobUpdateSql(changes);
    db.prepare(sql).run(...values, id);
    notify(id, changes);
  }

  function listJobs(projectRoot?: string): BackgroundJob[] {
    const rows = projectRoot
      ? (db.prepare('SELECT * FROM background_jobs WHERE projectRoot = ? ORDER BY createdAt DESC').all(projectRoot) as JobRow[])
      : (db.prepare('SELECT * FROM background_jobs ORDER BY createdAt DESC').all() as JobRow[]);
    return rows.map(rowToJob);
  }

  return { createJob, getJob, updateJob, listJobs };
}

export function createJobStore(dbPath?: string): JobStore {
  const resolvedPath = dbPath ?? path.join(app.getPath('userData'), 'background-jobs.db');
  const db = openDatabase(resolvedPath);
  ensureSchema(db);

  const listeners = new Set<ChangeCallback>();
  function notify(jobId: string, changes: Partial<BackgroundJob>): void {
    for (const cb of listeners) cb(jobId, changes);
  }

  const crud = makeJobCrud(db, notify);

  function deleteCompleted(): void {
    db.prepare(`DELETE FROM background_jobs WHERE status IN ('done','error','cancelled')`).run();
  }

  function reconcileInterrupted(): void {
    db.prepare(
      `UPDATE background_jobs SET status = 'error',
       errorMessage = 'interrupted: process exited before completion', completedAt = ?
       WHERE status = 'running'`,
    ).run(new Date().toISOString());
  }

  function subscribeChanges(cb: ChangeCallback): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  return {
    ...crud,
    deleteCompleted,
    reconcileInterrupted,
    subscribeChanges,
    close: () => db.close(),
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _store: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!_store) _store = createJobStore();
  return _store;
}

export function closeJobStore(): void {
  _store?.close();
  _store = null;
}
