import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionFolder {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
  order: number;
}

export interface FolderStoreAdaptor {
  read: () => SessionFolder[];
  write: (folders: SessionFolder[]) => void;
}

export interface FolderStore {
  listAll(): SessionFolder[];
  upsert(folder: SessionFolder): void;
  delete(id: string): void;
  addSession(folderId: string, sessionId: string): void;
  removeSession(folderId: string, sessionId: string): void;
  moveSessionBetweenFolders(
    fromId: string | null,
    toId: string | null,
    sessionId: string,
  ): void;
  getFolderForSession(sessionId: string): SessionFolder | null;
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────

function readSafe(adaptor: FolderStoreAdaptor): SessionFolder[] {
  const raw = adaptor.read();
  return Array.isArray(raw) ? raw : [];
}

function applyUpsert(adaptor: FolderStoreAdaptor, folder: SessionFolder): void {
  const all = readSafe(adaptor);
  const idx = all.findIndex((f) => f.id === folder.id);
  if (idx < 0) {
    all.push(folder);
  } else {
    all.splice(idx, 1, folder);
  }
  adaptor.write(all);
}

function applyDelete(adaptor: FolderStoreAdaptor, id: string): void {
  adaptor.write(readSafe(adaptor).filter((f) => f.id !== id));
}

function applyAddSession(
  adaptor: FolderStoreAdaptor,
  folderId: string,
  sessionId: string,
): void {
  const all = readSafe(adaptor);
  const idx = all.findIndex((f) => f.id === folderId);
  if (idx < 0) {
    log.warn('[folderStore] addSession: folder not found', folderId);
    return;
  }
  // eslint-disable-next-line security/detect-object-injection -- idx is a numeric array index from findIndex
  const folder = all[idx];
  if (!folder) return;
  if (folder.sessionIds.includes(sessionId)) return;
  all.splice(idx, 1, { ...folder, sessionIds: [...folder.sessionIds, sessionId] });
  adaptor.write(all);
}

function applyRemoveSession(
  adaptor: FolderStoreAdaptor,
  folderId: string,
  sessionId: string,
): void {
  const all = readSafe(adaptor);
  const idx = all.findIndex((f) => f.id === folderId);
  if (idx < 0) return;
  // eslint-disable-next-line security/detect-object-injection -- idx is a numeric array index from findIndex
  const folder = all[idx];
  if (!folder) return;
  all.splice(idx, 1, {
    ...folder,
    sessionIds: folder.sessionIds.filter((id) => id !== sessionId),
  });
  adaptor.write(all);
}

function applyMoveSession(
  adaptor: FolderStoreAdaptor,
  fromId: string | null,
  toId: string | null,
  sessionId: string,
): void {
  if (fromId !== null) applyRemoveSession(adaptor, fromId, sessionId);
  if (toId !== null) applyAddSession(adaptor, toId, sessionId);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function buildStore(adaptor: FolderStoreAdaptor): FolderStore {
  return {
    listAll: () => readSafe(adaptor),
    upsert: (folder) => applyUpsert(adaptor, folder),
    delete: (id) => applyDelete(adaptor, id),
    addSession: (folderId, sessionId) => applyAddSession(adaptor, folderId, sessionId),
    removeSession: (folderId, sessionId) => applyRemoveSession(adaptor, folderId, sessionId),
    moveSessionBetweenFolders: (fromId, toId, sessionId) =>
      applyMoveSession(adaptor, fromId, toId, sessionId),
    getFolderForSession: (sessionId) =>
      readSafe(adaptor).find((f) => f.sessionIds.includes(sessionId)) ?? null,
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: FolderStore | null = null;

export function initFolderStore(): void {
  if (singleton) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConfigValue, setConfigValue } = require('../config') as typeof import('../config');
    const adaptor: FolderStoreAdaptor = {
      read: () => (getConfigValue('sessionFolders') as SessionFolder[] | undefined) ?? [],
      write: (folders) => setConfigValue('sessionFolders', folders as never),
    };
    singleton = buildStore(adaptor);
    log.info('[folderStore] initialised');
  } catch (err) {
    log.error('[folderStore] init failed', err);
  }
}

export function getFolderStore(): FolderStore | null {
  return singleton;
}

export function closeFolderStore(): void {
  if (!singleton) return;
  singleton = null;
  log.info('[folderStore] closed');
}

// ─── Testable factory (bypasses electron-store) ───────────────────────────────

export function openFolderStore(adaptor: FolderStoreAdaptor): FolderStore {
  return buildStore(adaptor);
}
