/**
 * memory.test.ts — smoke tests for memory IPC handler registration.
 *
 * Verifies:
 *   1. Both channels are registered.
 *   2. memory:list returns { success: true, entries } on happy path.
 *   3. memory:list returns { success: false, error } when the parser throws.
 *   4. memory:read returns { success: true, content } for a valid id.
 *   5. memory:read returns { success: false, error: 'not found' } when parser returns null.
 *   6. memory:read propagates unexpected errors as { success: false, error }.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks before module imports ───────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../memory/memoryReader', () => ({
  listMemoryEntries: vi.fn(),
  readMemoryEntry: vi.fn(),
}));

vi.mock('../memory/memoryWatcher', () => ({
  startMemoryWatcher: vi.fn(() => vi.fn()),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { ipcMain } from 'electron';

import * as memReader from '../memory/memoryReader';
import { cleanupMemoryHandlers, registerMemoryHandlers } from './memory';

const handles = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

function getHandler(channel: string): (e: unknown, args: unknown) => Promise<unknown> {
  const call = handles.mock.calls.find((c: unknown[]) => c[0] === channel);
  if (!call) throw new Error(`Channel not registered: ${channel}`);
  return call[1] as (e: unknown, args: unknown) => Promise<unknown>;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  handles.mockClear();
  vi.mocked(memReader.listMemoryEntries).mockReset();
  vi.mocked(memReader.readMemoryEntry).mockReset();
  registerMemoryHandlers('/fake/project');
});

afterEach(() => {
  cleanupMemoryHandlers();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerMemoryHandlers()', () => {
  it('registers memory:list and memory:read channels', () => {
    const registered = handles.mock.calls.map((c: unknown[]) => c[0]);
    expect(registered).toContain('memory:list');
    expect(registered).toContain('memory:read');
  });
});

describe('memory:list handler', () => {
  it('returns { success: true, entries } on happy path', async () => {
    const fakeEntries = [
      {
        id: 'auth',
        title: 'Auth',
        description: 'OAuth only',
        section: 'Constraints',
        filePath: '/fake/path/auth.md',
        exists: true,
      },
    ];
    vi.mocked(memReader.listMemoryEntries).mockResolvedValueOnce(fakeEntries);

    const handler = getHandler('memory:list');
    const result = await handler({}, { projectRoot: '/fake/project' });

    expect(result).toEqual({ success: true, entries: fakeEntries });
    expect(memReader.listMemoryEntries).toHaveBeenCalledWith('/fake/project');
  });

  it('defaults projectRoot to process.cwd() when omitted', async () => {
    vi.mocked(memReader.listMemoryEntries).mockResolvedValueOnce([]);

    const handler = getHandler('memory:list');
    await handler({}, {});

    expect(memReader.listMemoryEntries).toHaveBeenCalledWith(process.cwd());
  });

  it('returns { success: false, error } when parser throws', async () => {
    vi.mocked(memReader.listMemoryEntries).mockRejectedValueOnce(new Error('disk failure'));

    const handler = getHandler('memory:list');
    const result = await handler({}, { projectRoot: '/fake/project' });

    expect(result).toEqual({ success: false, error: 'disk failure' });
  });
});

describe('memory:read handler', () => {
  it('returns { success: true, content } for a valid id', async () => {
    vi.mocked(memReader.readMemoryEntry).mockResolvedValueOnce({ content: 'OAuth only content' });

    const handler = getHandler('memory:read');
    const result = await handler({}, { projectRoot: '/fake/project', id: 'auth' });

    expect(result).toEqual({ success: true, content: 'OAuth only content' });
    expect(memReader.readMemoryEntry).toHaveBeenCalledWith('/fake/project', 'auth');
  });

  it('returns { success: false, error: "not found" } when parser returns null', async () => {
    vi.mocked(memReader.readMemoryEntry).mockResolvedValueOnce(null);

    const handler = getHandler('memory:read');
    const result = await handler({}, { projectRoot: '/fake/project', id: 'missing' });

    expect(result).toEqual({ success: false, error: 'not found' });
  });

  it('returns { success: false, error } when parser throws', async () => {
    vi.mocked(memReader.readMemoryEntry).mockRejectedValueOnce(new Error('read error'));

    const handler = getHandler('memory:read');
    const result = await handler({}, { projectRoot: '/fake/project', id: 'auth' });

    expect(result).toEqual({ success: false, error: 'read error' });
  });

  it('defaults projectRoot to process.cwd() when omitted', async () => {
    vi.mocked(memReader.readMemoryEntry).mockResolvedValueOnce({ content: 'data' });

    const handler = getHandler('memory:read');
    await handler({}, { id: 'auth' });

    expect(memReader.readMemoryEntry).toHaveBeenCalledWith(process.cwd(), 'auth');
  });
});
