import log from '../logger';
import type { Session } from './session';
import { emitSessionActivated, emitSessionArchived, emitSessionCreated } from './sessionLifecycle';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface SessionStore {
  getById(id: string): Session | undefined;
  listAll(): Session[];
  listByProjectRoot(root: string): Session[];
  listActive(): Session[];
  upsert(session: Session): void;
  archive(id: string): void;
  delete(id: string): void;
}

// ─── Store adaptor ────────────────────────────────────────────────────────────

// Config accessors are injected at init time to avoid importing config at
// module load (which is unavailable in test environments).
export interface StoreAdaptor {
  read: () => Session[];
  write: (sessions: Session[]) => void;
}

let singleton: SessionStore | null = null;

// ─── Mutation helpers (module-level to stay within per-function line limit) ───

function applyUpsert(adaptor: StoreAdaptor, session: Session): void {
  const all = adaptor.read();
  const idx = all.findIndex((s) => s.id === session.id);
  const isNew = idx < 0;
  if (isNew) {
    all.push(session);
  } else {
    all.splice(idx, 1, session);
  }
  adaptor.write(all);
  if (isNew) emitSessionCreated(session);
  else emitSessionActivated(session);
}

function applyArchive(adaptor: StoreAdaptor, id: string): void {
  const all = adaptor.read();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) {
    log.warn('[sessionStore] archive: session not found', id);
    return;
  }
  const existing = all.find((_, i) => i === idx);
  if (!existing) return;
  const updated = { ...existing, archivedAt: new Date().toISOString() };
  all.splice(idx, 1, updated);
  adaptor.write(all);
  emitSessionArchived(updated);
}

function applyDelete(adaptor: StoreAdaptor, id: string): void {
  adaptor.write(adaptor.read().filter((s) => s.id !== id));
}

// ─── Store factory ────────────────────────────────────────────────────────────

function buildStore(adaptor: StoreAdaptor): SessionStore {
  function readAll(): Session[] {
    const raw = adaptor.read();
    return Array.isArray(raw) ? raw : [];
  }

  return {
    getById: (id) => readAll().find((s) => s.id === id),
    listAll: () => readAll(),
    listByProjectRoot: (root) => readAll().filter((s) => s.projectRoot === root),
    listActive: () => readAll().filter((s) => s.archivedAt === undefined),
    upsert: (session) => applyUpsert(adaptor, session),
    archive: (id) => applyArchive(adaptor, id),
    delete: (id) => applyDelete(adaptor, id),
  };
}

// ─── Singleton API ────────────────────────────────────────────────────────────

export function initSessionStore(): void {
  if (singleton) return;
  try {
    // Lazy require keeps config out of test environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConfigValue, setConfigValue } = require('../config') as typeof import('../config');
    const adaptor: StoreAdaptor = {
      read: () => (getConfigValue('sessionsData') as Session[] | undefined) ?? [],
      write: (sessions) => setConfigValue('sessionsData', sessions as never),
    };
    singleton = buildStore(adaptor);
    log.info('[sessionStore] initialised');
  } catch (err) {
    log.error('[sessionStore] init failed', err);
  }
}

export function getSessionStore(): SessionStore | null {
  return singleton;
}

export function closeSessionStore(): void {
  if (!singleton) return;
  singleton = null;
  log.info('[sessionStore] closed');
}

// ─── Testable factory (bypasses electron-store) ───────────────────────────────

export function openSessionStore(adaptor: StoreAdaptor): SessionStore {
  return buildStore(adaptor);
}
