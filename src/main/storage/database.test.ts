import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './database';
import {
  closeDatabase,
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
  tableExists,
} from './database';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
  return path.join(dir, 'test.db');
}

let db: Database | null = null;

afterEach(() => {
  closeDatabase(db);
  db = null;
});

describe('openDatabase', () => {
  it('creates parent directories and opens a database', () => {
    const dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('sets WAL journal mode', () => {
    db = openDatabase(tmpDbPath());
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('wal');
  });

  it('sets busy_timeout', () => {
    db = openDatabase(tmpDbPath());
    const row = db.prepare('PRAGMA busy_timeout').get() as Record<string, number>;
    // The key name varies by better-sqlite3 version; check the first value
    const value = Object.values(row)[0];
    expect(value).toBe(5000);
  });
});

describe('closeDatabase', () => {
  it('closes without error', () => {
    db = openDatabase(tmpDbPath());
    expect(() => closeDatabase(db)).not.toThrow();
    db = null;
  });

  it('handles null/undefined gracefully', () => {
    expect(() => closeDatabase(null)).not.toThrow();
    expect(() => closeDatabase(undefined)).not.toThrow();
  });
});

describe('runTransaction', () => {
  it('commits on success', () => {
    db = openDatabase(tmpDbPath());
    db.exec('CREATE TABLE t (v INTEGER)');

    runTransaction(db, () => {
      db!.prepare('INSERT INTO t VALUES (1)').run();
      db!.prepare('INSERT INTO t VALUES (2)').run();
    });

    const rows = db.prepare('SELECT * FROM t').all();
    expect(rows).toHaveLength(2);
  });

  it('rolls back on error', () => {
    db = openDatabase(tmpDbPath());
    db.exec('CREATE TABLE t (v INTEGER)');

    expect(() =>
      runTransaction(db!, () => {
        db!.prepare('INSERT INTO t VALUES (1)').run();
        throw new Error('deliberate');
      }),
    ).toThrow('deliberate');

    const rows = db.prepare('SELECT * FROM t').all();
    expect(rows).toHaveLength(0);
  });
});

describe('tableExists', () => {
  it('returns false for non-existent table', () => {
    db = openDatabase(tmpDbPath());
    expect(tableExists(db, 'nope')).toBe(false);
  });

  it('returns true for existing table', () => {
    db = openDatabase(tmpDbPath());
    db.exec('CREATE TABLE yes (v INTEGER)');
    expect(tableExists(db, 'yes')).toBe(true);
  });
});

describe('schema version', () => {
  it('defaults to 0', () => {
    db = openDatabase(tmpDbPath());
    expect(getSchemaVersion(db)).toBe(0);
  });

  it('set and get', () => {
    db = openDatabase(tmpDbPath());
    setSchemaVersion(db, 42);
    expect(getSchemaVersion(db)).toBe(42);
  });
});
