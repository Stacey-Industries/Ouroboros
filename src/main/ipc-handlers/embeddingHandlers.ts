/**
 * embeddingHandlers.ts — IPC handlers for semantic search.
 *
 * Exposes embedding:search, embedding:status, embedding:reindex
 * to the renderer via the standard handler registration pattern.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import { getConfigValue } from '../config';
import type { IEmbeddingProvider, IEmbeddingStore } from '../embeddings';
import { createEmbeddingStore, createProvider, searchSimilar } from '../embeddings';
import log from '../logger';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

let store: IEmbeddingStore | null = null;
let provider: IEmbeddingProvider | null = null;
let providerCacheKey: string = '';

function ensureStore(projectRoot: string): IEmbeddingStore {
  if (!store) {
    const dbPath = `${projectRoot}/.ouroboros/embeddings.db`;
    store = createEmbeddingStore(dbPath);
  }
  return store;
}

function ensureProvider(): IEmbeddingProvider {
  const providerName = getConfigValue('embeddingProvider') ?? 'local';
  const apiKey = getConfigValue('voyageApiKey') ?? '';
  const cacheKey = `${providerName}:${apiKey ? 'k' : 'n'}`;
  if (!provider || providerCacheKey !== cacheKey) {
    provider = createProvider({ provider: providerName, voyageApiKey: apiKey });
    providerCacheKey = cacheKey;
  }
  return provider;
}

async function handleSearch(_e: unknown, query: string, projectRoot: string, topK = 5) {
  if (getConfigValue('embeddingsEnabled') !== true) {
    return { success: false, error: 'embeddings_disabled' };
  }
  try {
    const s = ensureStore(projectRoot);
    const p = ensureProvider();
    const results = await searchSimilar(query, topK, s, p);
    return { success: true, results };
  } catch (err) {
    log.warn('[embedding:search] failed:', err);
    return { success: false, error: String(err) };
  }
}

function handleStatus(_e: unknown, projectRoot: string) {
  if (getConfigValue('embeddingsEnabled') !== true) {
    return { success: false, error: 'embeddings_disabled' };
  }
  try {
    return { success: true, status: ensureStore(projectRoot).getStatus() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function handleReindex(_e: unknown, projectRoot: string) {
  if (getConfigValue('embeddingsEnabled') !== true) {
    return { success: false, error: 'embeddings_disabled' };
  }
  try {
    const { indexProject } = await import('../embeddings');
    const s = ensureStore(projectRoot);
    const p = ensureProvider();
    const result = await indexProject(projectRoot, {
      store: s,
      provider: p,
      // v1: fixed-window chunking; future work: expose a public graph accessor
      // on GraphController and use it here for AST-aware chunk boundaries.
      getNodesForFile: () => [],
    });
    return { success: true, ...result };
  } catch (err) {
    log.warn('[embedding:reindex] failed:', err);
    return { success: false, error: String(err) };
  }
}

/** SenderWindow accepted for API conformance with other registrars. */
export function registerEmbeddingHandlers(sw: SenderWindow): string[] {
  void sw;
  const channels: string[] = [];
  ipcMain.handle('embedding:search', handleSearch);
  channels.push('embedding:search');
  ipcMain.handle('embedding:status', handleStatus);
  channels.push('embedding:status');
  ipcMain.handle('embedding:reindex', handleReindex);
  channels.push('embedding:reindex');
  return channels;
}

export function closeEmbeddingStore(): void {
  store?.close();
  store = null;
  provider = null;
  providerCacheKey = '';
}
