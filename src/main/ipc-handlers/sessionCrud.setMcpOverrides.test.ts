/**
 * sessionCrud.setMcpOverrides.test.ts — Phase L Wave 41.
 *
 * Tests that sessionCrud:setMcpOverrides validates submitted server IDs against
 * the list of registered MCP servers, rejecting unknown IDs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock ─────────────────────────────────────────────────────────────

const { mockHandle, mockRemoveHandler, mockSend, mockWin } = vi.hoisted(() => {
  const mockIsDestroyed = vi.fn(() => false);
  const mockSend = vi.fn();
  const mockWin = { id: 1, isDestroyed: mockIsDestroyed, webContents: { send: mockSend } };
  return {
    mockHandle: vi.fn(),
    mockRemoveHandler: vi.fn(),
    mockSend,
    mockWin,
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWin),
    getAllWindows: vi.fn(() => [mockWin]),
  },
}));

// ─── Logger mock ───────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('../orchestration/workspaceReadList', () => ({
  applyToSession: vi.fn(),
}));

// ─── MCP handler mock — controls which server IDs are "registered" ─────────────

const { mockGetRegisteredMcpServerIds } = vi.hoisted(() => ({
  mockGetRegisteredMcpServerIds: vi.fn<(projectRoot?: string) => Promise<string[]>>(
    async () => ['server-a', 'server-b'],
  ),
}));

vi.mock('./mcp', () => ({
  getRegisteredMcpServerIds: (projectRoot?: string) =>
    mockGetRegisteredMcpServerIds(projectRoot),
}));

// ─── Session store mock ────────────────────────────────────────────────────────

import type { Session } from '../session/session';
import { makeSession } from '../session/session';
import type { SessionStore } from '../session/sessionStore';
import { openSessionStore } from '../session/sessionStore';

vi.mock('../session/sessionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/sessionStore')>();
  return { ...actual, getSessionStore: vi.fn() };
});

import { getSessionStore } from '../session/sessionStore';

vi.mock('../session/sessionLifecycle', () => ({
  emitSessionCreated: vi.fn(),
  emitSessionActivated: vi.fn(),
  emitSessionArchived: vi.fn(),
}));

vi.mock('../windowManager', () => ({ createChatWindow: vi.fn(() => ({ id: 42 })) }));

vi.mock('../session/sessionTrash', () => ({
  writeToTrash: vi.fn().mockResolvedValue(undefined),
  restoreFromTrash: vi.fn().mockResolvedValue(true),
}));

// ─── Subject ───────────────────────────────────────────────────────────────────

import { cleanupSessionCrudHandlers, registerSessionCrudHandlers } from './sessionCrud';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeInMemoryStore(): SessionStore {
  const data: Session[] = [];
  return openSessionStore({
    read: () => [...data],
    write: (sessions) => { data.splice(0, data.length, ...sessions); },
  });
}

function makeEvent(winId = 1): { sender: { id: number } } {
  mockWin.id = winId;
  return { sender: { id: winId } };
}

function captureHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  const call = mockHandle.mock.calls.find(([ch]) => ch === channel);
  return call?.[1] as ((...args: unknown[]) => unknown) | undefined;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('sessionCrud:setMcpOverrides — allowlist validation', () => {
  let store: SessionStore;
  let session: Session;

  beforeEach(() => {
    store = makeInMemoryStore();
    vi.mocked(getSessionStore).mockReturnValue(store);
    mockHandle.mockClear();
    mockRemoveHandler.mockClear();
    mockSend.mockClear();
    mockGetRegisteredMcpServerIds.mockResolvedValue(['server-a', 'server-b']);
    session = makeSession('/projects/test');
    store.upsert(session);
    registerSessionCrudHandlers();
  });

  afterEach(() => {
    cleanupSessionCrudHandlers();
  });

  it('accepts all-known server IDs and stores them', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    const result = await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: ['server-a'],
    }) as { success: boolean };

    expect(result.success).toBe(true);
    const updated = store.getById(session.id);
    expect(updated?.mcpServerOverrides).toEqual(['server-a']);
  });

  it('accepts an empty override list (no servers — valid)', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    const result = await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: [],
    }) as { success: boolean };

    expect(result.success).toBe(true);
  });

  it('rejects a list containing one unknown server ID', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    const result = await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: ['server-a', 'evil-server'],
    }) as { success: boolean; error?: string; unknownIds?: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown-mcp-server');
    expect(result.unknownIds).toEqual(['evil-server']);
  });

  it('rejects a list where all server IDs are unknown', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    const result = await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: ['ghost-1', 'ghost-2'],
    }) as { success: boolean; error?: string; unknownIds?: string[] };

    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown-mcp-server');
    expect(result.unknownIds).toEqual(['ghost-1', 'ghost-2']);
  });

  it('does not broadcast or mutate the session when rejected', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: ['unknown-server'],
    });

    expect(mockSend).not.toHaveBeenCalled();
    const unchanged = store.getById(session.id);
    expect(unchanged?.mcpServerOverrides).toBeUndefined();
  });

  it('passes the session projectRoot to getRegisteredMcpServerIds', async () => {
    const handler = captureHandler('sessionCrud:setMcpOverrides');
    await handler?.(makeEvent(), {
      sessionId: session.id,
      mcpServerOverrides: ['server-a'],
    });

    expect(mockGetRegisteredMcpServerIds).toHaveBeenCalledWith('/projects/test');
  });
});
