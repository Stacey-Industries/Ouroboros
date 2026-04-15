/**
 * sessionTrash.ts — Soft-delete trash directory for archived sessions.
 *
 * When a session is archived, a full JSON snapshot is written to
 * {userData}/session-trash/{sessionId}.json for a 7-day grace period.
 *
 * `restoreFromTrash` re-upserts the session without archivedAt and deletes
 * the trash file.
 *
 * Note: This module performs disk I/O and depends on `electron.app` at
 * runtime.  Unit tests should inject the trashDir via the exported factory.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { Session } from './session';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrashAdaptor {
  trashDir: string;
  readJson: (filePath: string) => Promise<Session | null>;
  writeJson: (filePath: string, session: Session) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  listFiles: (dir: string) => Promise<string[]>;
  ensureDir: (dir: string) => Promise<void>;
}

// ─── Default adaptor (production) ────────────────────────────────────────────

function getDefaultTrashDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), 'session-trash');
}

async function defaultReadJson(filePath: string): Promise<Session | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function defaultWriteJson(filePath: string, session: Session): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

async function defaultDeleteFile(filePath: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.unlink(filePath);
  } catch {
    // Already deleted — ignore
  }
}

async function defaultListFiles(dir: string): Promise<string[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

async function defaultEnsureDir(dir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.mkdir(dir, { recursive: true });
}

function makeDefaultAdaptor(): TrashAdaptor {
  const trashDir = getDefaultTrashDir();
  return {
    trashDir,
    readJson: defaultReadJson,
    writeJson: defaultWriteJson,
    deleteFile: defaultDeleteFile,
    listFiles: defaultListFiles,
    ensureDir: defaultEnsureDir,
  };
}

// ─── Trash operations ─────────────────────────────────────────────────────────

function trashFilePath(adaptor: TrashAdaptor, sessionId: string): string {
  return path.join(adaptor.trashDir, `${sessionId}.json`);
}

export async function writeToTrash(
  session: Session,
  adaptor: TrashAdaptor = makeDefaultAdaptor(),
): Promise<void> {
  try {
    await adaptor.ensureDir(adaptor.trashDir);
    await adaptor.writeJson(trashFilePath(adaptor, session.id), session);
    log.info('[sessionTrash] written', session.id);
  } catch (err) {
    log.error('[sessionTrash] writeToTrash failed', err);
  }
}

export async function restoreFromTrash(
  sessionId: string,
  onRestore: (session: Session) => void,
  adaptor: TrashAdaptor = makeDefaultAdaptor(),
): Promise<boolean> {
  const filePath = trashFilePath(adaptor, sessionId);
  const session = await adaptor.readJson(filePath);
  if (!session) {
    log.warn('[sessionTrash] restore: no trash file for', sessionId);
    return false;
  }
  const restored: Session = { ...session, archivedAt: undefined };
  onRestore(restored);
  await adaptor.deleteFile(filePath);
  log.info('[sessionTrash] restored', sessionId);
  return true;
}

export async function deleteFromTrash(
  sessionId: string,
  adaptor: TrashAdaptor = makeDefaultAdaptor(),
): Promise<void> {
  await adaptor.deleteFile(trashFilePath(adaptor, sessionId));
}

export async function listTrashFiles(
  adaptor: TrashAdaptor = makeDefaultAdaptor(),
): Promise<string[]> {
  return adaptor.listFiles(adaptor.trashDir);
}
