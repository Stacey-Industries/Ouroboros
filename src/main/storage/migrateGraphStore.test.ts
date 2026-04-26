/**
 * migrateGraphStore.test.ts — Smoke tests for migrateGraphStore.ts.
 *
 * Uses an in-memory SQLite-like stub — no real filesystem or DB required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('fs', () => {
  const mod = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
  };
  return { default: mod, ...mod };
});

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

vi.mock('../logger', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

vi.mock('./database', () => ({
  openDatabase: vi.fn(),
  closeDatabase: vi.fn(),
  getSchemaVersion: vi.fn(() => 0),
  setSchemaVersion: vi.fn(),
  runTransaction: vi.fn((_db: unknown, fn: () => void) => fn()),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { migrateGraphStore } from './migrateGraphStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getFs() {
  return (await import('fs')) as unknown as {
    existsSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    renameSync: ReturnType<typeof vi.fn>;
  };
}

async function getDb() {
  return (await import('./database')) as unknown as {
    openDatabase: ReturnType<typeof vi.fn>;
    closeDatabase: ReturnType<typeof vi.fn>;
    getSchemaVersion: ReturnType<typeof vi.fn>;
    setSchemaVersion: ReturnType<typeof vi.fn>;
    runTransaction: ReturnType<typeof vi.fn>;
  };
}

async function getLog() {
  return (await import('../logger')) as { default: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } };
}

function makeMockDb() {
  const ranSql: string[] = [];
  const stmt = { run: vi.fn() };
  return {
    db: {
      prepare: (_sql: string) => { ranSql.push(_sql.trim().slice(0, 60)); return stmt; },
      exec: (_sql: string) => { ranSql.push(_sql.trim().slice(0, 60)); },
    },
    stmt,
    ranSql,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('migrateGraphStore', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns early when graph.json does not exist', async () => {
    const fs = await getFs();
    fs.existsSync.mockReturnValue(false);
    migrateGraphStore('/project');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('returns early when .bak already exists', async () => {
    const fs = await getFs();
    fs.existsSync.mockImplementation(() => true);
    migrateGraphStore('/project');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('returns early when readFileSync throws', async () => {
    const fs = await getFs();
    fs.existsSync.mockImplementation((p: string) => !String(p).endsWith('.bak'));
    fs.readFileSync.mockImplementation(() => { throw new Error('read error'); });
    expect(() => migrateGraphStore('/project')).not.toThrow();
  });

  it('returns early when parsed data has no nodes array', async () => {
    const fs = await getFs();
    const db = await getDb();
    fs.existsSync.mockImplementation((p: string) => !String(p).endsWith('.bak'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ nodes: 'not-an-array', edges: [] }));
    migrateGraphStore('/project');
    expect(db.openDatabase).not.toHaveBeenCalled();
  });

  it('opens DB and runs inserts for valid graph.json', async () => {
    const fs = await getFs();
    const db = await getDb();
    const log = await getLog();
    const { db: mockDb } = makeMockDb();
    fs.existsSync.mockImplementation((p: string) => !String(p).endsWith('.bak'));
    fs.readFileSync.mockReturnValue(JSON.stringify({
      nodes: [{ id: 'n1', type: 'function', name: 'foo', filePath: '/a.ts', line: 1 }],
      edges: [{ source: 'n1', target: 'n2', type: 'calls' }],
    }));
    db.openDatabase.mockReturnValue(mockDb);
    db.getSchemaVersion.mockReturnValue(1); // skip DDL

    migrateGraphStore('/project');

    expect(db.openDatabase).toHaveBeenCalled();
    expect(fs.renameSync).toHaveBeenCalled();
    expect(log.default.info).toHaveBeenCalled();
  });

  it('logs warning when DB open throws', async () => {
    const fs = await getFs();
    const db = await getDb();
    const log = await getLog();
    fs.existsSync.mockImplementation((p: string) => !String(p).endsWith('.bak'));
    fs.readFileSync.mockReturnValue(JSON.stringify({
      nodes: [{ id: 'n1', type: 'f', name: 'f', filePath: '/a.ts', line: 1 }],
      edges: [],
    }));
    db.openDatabase.mockImplementationOnce(() => {
      throw new Error('db open failed');
    });

    migrateGraphStore('/project');
    expect(log.default.warn).toHaveBeenCalledWith(
      expect.stringContaining('Graph store migration failed'),
      expect.any(Error),
    );
  });

  it('runs schema DDL when schemaVersion is 0', async () => {
    const fs = await getFs();
    const db = await getDb();
    const { db: mockDb } = makeMockDb();
    fs.existsSync.mockImplementation((p: string) => !String(p).endsWith('.bak'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ nodes: [], edges: [] }));
    db.getSchemaVersion.mockReturnValue(0);
    db.openDatabase.mockReturnValue(mockDb);

    migrateGraphStore('/project');

    expect(db.setSchemaVersion).toHaveBeenCalledWith(mockDb, 1);
  });
});
