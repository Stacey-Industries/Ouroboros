/**
 * offlineDispatchQueue.test.ts — Wave 34 Phase G.
 *
 * Covers: enqueue, cap at 10, list, drain (happy + partial fail + duplicate),
 * clearOfflineDispatch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── localStorage stub ─────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => { delete store[k]; }); },
};

vi.stubGlobal('localStorage', localStorageMock);

// ── crypto.randomUUID stub ────────────────────────────────────────────────────

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// ── Import under test ─────────────────────────────────────────────────────────

import {
  clearOfflineDispatch,
  drainOfflineDispatches,
  enqueueOfflineDispatch,
  listOfflineDispatches,
} from './offlineDispatchQueue';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_REQUEST = {
  title: 'Fix bug',
  prompt: 'Please fix it',
  projectPath: '/projects/myapp',
};

beforeEach(() => {
  localStorageMock.clear();
  uuidCounter = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── enqueueOfflineDispatch ────────────────────────────────────────────────────

describe('enqueueOfflineDispatch', () => {
  it('returns a QueuedOfflineDispatch with id, queuedAt, and request', async () => {
    const result = await enqueueOfflineDispatch(SAMPLE_REQUEST);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.id).toBeTruthy();
    expect(result.queuedAt).toBeTruthy();
    expect(result.request.title).toBe('Fix bug');
  });

  it('sets clientRequestId on the stored request', async () => {
    const result = await enqueueOfflineDispatch(SAMPLE_REQUEST);
    if ('error' in result) throw new Error('expected success');
    expect(result.request.clientRequestId).toBeTruthy();
  });

  it('returns queue-full when 10 entries are queued', async () => {
    for (let i = 0; i < 10; i++) {
      await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: `Task ${i}` });
    }
    const result = await enqueueOfflineDispatch(SAMPLE_REQUEST);
    expect(result).toEqual({ error: 'queue-full' });
  });

  it('allows exactly 10 entries before capping', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: `T${i}` });
      expect('error' in r).toBe(false);
    }
    const list = await listOfflineDispatches();
    expect(list).toHaveLength(10);
  });
});

// ── listOfflineDispatches ─────────────────────────────────────────────────────

describe('listOfflineDispatches', () => {
  it('returns empty array when nothing is queued', async () => {
    const list = await listOfflineDispatches();
    expect(list).toHaveLength(0);
  });

  it('returns all enqueued entries in order', async () => {
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'A' });
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'B' });
    const list = await listOfflineDispatches();
    expect(list).toHaveLength(2);
    expect(list[0].request.title).toBe('A');
    expect(list[1].request.title).toBe('B');
  });
});

// ── clearOfflineDispatch ──────────────────────────────────────────────────────

describe('clearOfflineDispatch', () => {
  it('removes the entry with the given id', async () => {
    const entry = await enqueueOfflineDispatch(SAMPLE_REQUEST);
    if ('error' in entry) throw new Error('expected success');
    await clearOfflineDispatch(entry.id);
    const list = await listOfflineDispatches();
    expect(list).toHaveLength(0);
  });

  it('is a no-op for unknown ids', async () => {
    await enqueueOfflineDispatch(SAMPLE_REQUEST);
    await clearOfflineDispatch('nonexistent-id');
    const list = await listOfflineDispatches();
    expect(list).toHaveLength(1);
  });
});

// ── drainOfflineDispatches ────────────────────────────────────────────────────

describe('drainOfflineDispatches', () => {
  it('sends all entries and returns sent count on full success', async () => {
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'A' });
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'B' });

    const send = vi.fn().mockResolvedValue(true);
    const result = await drainOfflineDispatches(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, failed: 0, lost: 0 });
    expect(await listOfflineDispatches()).toHaveLength(0);
  });

  it('keeps failed entries in queue and increments failed count', async () => {
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'A' });
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'B' });

    const send = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = await drainOfflineDispatches(send);

    expect(result).toEqual({ sent: 1, failed: 1, lost: 0 });
    const remaining = await listOfflineDispatches();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].request.title).toBe('B');
  });

  it('increments lost for duplicate errors and removes the entry', async () => {
    await enqueueOfflineDispatch(SAMPLE_REQUEST);

    const send = vi.fn().mockRejectedValue(new Error('duplicate'));
    const result = await drainOfflineDispatches(send);

    expect(result).toEqual({ sent: 0, failed: 0, lost: 1 });
    expect(await listOfflineDispatches()).toHaveLength(0);
  });

  it('increments failed for non-duplicate errors and keeps the entry', async () => {
    await enqueueOfflineDispatch(SAMPLE_REQUEST);

    const send = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await drainOfflineDispatches(send);

    expect(result).toEqual({ sent: 0, failed: 1, lost: 0 });
    expect(await listOfflineDispatches()).toHaveLength(1);
  });

  it('handles empty queue with zero counts', async () => {
    const send = vi.fn();
    const result = await drainOfflineDispatches(send);
    expect(result).toEqual({ sent: 0, failed: 0, lost: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('mixes sent, failed, and lost correctly', async () => {
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'sent' });
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'failed' });
    await enqueueOfflineDispatch({ ...SAMPLE_REQUEST, title: 'lost' });

    const send = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('duplicate'));

    const result = await drainOfflineDispatches(send);
    expect(result).toEqual({ sent: 1, failed: 1, lost: 1 });
    const remaining = await listOfflineDispatches();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].request.title).toBe('failed');
  });
});
