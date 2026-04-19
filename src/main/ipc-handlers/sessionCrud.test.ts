/**
 * sessionCrud.test.ts — Unit tests for sessionCrud IPC handlers.
 *
 * Tests the handler logic directly by importing handler internals via a
 * testable sessionStore (openSessionStore) and mocking ipcMain + electron.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Electron mock (hoisted so vi.mock factory can reference them) ────────────

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

// ─── Logger mock ──────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('../orchestration/workspaceReadList', () => ({
  applyToSession: vi.fn((_store: unknown, session: unknown) => session),
}));

// ─── Session store — use real openSessionStore with in-memory adaptor ─────────

import type { Session } from '../session/session';
import { makeSession } from '../session/session';
import type { SessionStore } from '../session/sessionStore';
import { openSessionStore } from '../session/sessionStore';

vi.mock('../session/sessionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/sessionStore')>();
  return { ...actual, getSessionStore: vi.fn() };
});

import { getSessionStore } from '../session/sessionStore';

// ─── Session lifecycle mock ───────────────────────────────────────────────────

vi.mock('../session/sessionLifecycle', () => ({
  emitSessionCreated: vi.fn(),
  emitSessionActivated: vi.fn(),
  emitSessionArchived: vi.fn(),
}));

// ─── windowManager mock — createChatWindow returns a fake window ──────────────

const mockCreateChatWindow = vi.hoisted(() => vi.fn(() => ({ id: 42 })));
vi.mock('../windowManager', () => ({ createChatWindow: mockCreateChatWindow }));

// ─── sessionTrash mock ────────────────────────────────────────────────────────

const mockWriteToTrash = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRestoreFromTrash = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('../session/sessionTrash', () => ({
  writeToTrash: mockWriteToTrash,
  restoreFromTrash: mockRestoreFromTrash,
}));

// ─── mcp mock — prevents ElectronStore init from pulling in ../config ─────────

vi.mock('./mcp', () => ({
  getRegisteredMcpServerIds: vi.fn().mockResolvedValue([]),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { cleanupSessionCrudHandlers, registerSessionCrudHandlers } from './sessionCrud';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Capture the handler registered for a given channel. */
function captureHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  const call = mockHandle.mock.calls.find(([ch]) => ch === channel);
  return call?.[1] as ((...args: unknown[]) => unknown) | undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerSessionCrudHandlers', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = makeInMemoryStore();
    vi.mocked(getSessionStore).mockReturnValue(store);
    mockHandle.mockClear();
    mockRemoveHandler.mockClear();
    mockSend.mockClear();
    registerSessionCrudHandlers();
  });

  afterEach(() => {
    cleanupSessionCrudHandlers();
  });

  it('registers all 15 channels', () => {
    const channels = mockHandle.mock.calls.map(([ch]) => ch as string);
    expect(channels).toContain('sessionCrud:list');
    expect(channels).toContain('sessionCrud:active');
    expect(channels).toContain('sessionCrud:create');
    expect(channels).toContain('sessionCrud:activate');
    expect(channels).toContain('sessionCrud:archive');
    expect(channels).toContain('sessionCrud:restore');
    expect(channels).toContain('sessionCrud:delete');
    expect(channels).toContain('sessionCrud:openChatWindow');
    expect(channels).toContain('sessionCrud:updateAgentMonitorSettings');
    expect(channels).toContain('sessionCrud:pin');
    expect(channels).toContain('sessionCrud:softDelete');
    expect(channels).toContain('sessionCrud:restoreDeleted');
    expect(channels).toContain('sessionCrud:setProfile');
    expect(channels).toContain('sessionCrud:setToolOverrides');
    expect(channels).toContain('sessionCrud:setMcpOverrides');
  });

  it('sessionCrud:list returns empty array when store has no sessions', async () => {
    const handler = captureHandler('sessionCrud:list');
    const result = await handler?.(makeEvent());
    expect(result).toMatchObject({ success: true, sessions: [] });
  });

  it('sessionCrud:list returns all sessions', async () => {
    const s = makeSession('/projects/alpha');
    store.upsert(s);
    const handler = captureHandler('sessionCrud:list');
    const result = await handler?.(makeEvent()) as { success: boolean; sessions: Session[] };
    expect(result.success).toBe(true);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe(s.id);
  });

  it('sessionCrud:create creates a session and returns it', async () => {
    const handler = captureHandler('sessionCrud:create');
    const result = await handler?.(makeEvent(), { projectRoot: '/projects/beta' }) as {
      success: boolean; session: Session;
    };
    expect(result.success).toBe(true);
    expect(result.session.projectRoot).toBe('/projects/beta');
    expect(store.listAll()).toHaveLength(1);
  });

  it('sessionCrud:create fails without projectRoot', async () => {
    const handler = captureHandler('sessionCrud:create');
    const result = await handler?.(makeEvent(), {}) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/projectRoot/);
  });

  it('sessionCrud:create broadcasts sessionCrud:changed', async () => {
    const handler = captureHandler('sessionCrud:create');
    await handler?.(makeEvent(), { projectRoot: '/projects/gamma' });
    expect(mockSend).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Array));
  });

  it('sessionCrud:active returns null when no session activated', async () => {
    const handler = captureHandler('sessionCrud:active');
    const result = await handler?.(makeEvent(99)) as { success: boolean; sessionId: string | null };
    expect(result.success).toBe(true);
    expect(result.sessionId).toBeNull();
  });

  it('sessionCrud:activate + sessionCrud:active round-trip', async () => {
    const s = makeSession('/projects/delta');
    store.upsert(s);
    const activateHandler = captureHandler('sessionCrud:activate');
    await activateHandler?.(makeEvent(42), { sessionId: s.id });
    const activeHandler = captureHandler('sessionCrud:active');
    const result = await activeHandler?.(makeEvent(42)) as { success: boolean; sessionId: string };
    expect(result.sessionId).toBe(s.id);
  });

  it('sessionCrud:restore restores a session from trash', async () => {
    const s = makeSession('/projects/restore-me');
    store.upsert({ ...s, archivedAt: new Date().toISOString() });
    mockRestoreFromTrash.mockImplementationOnce(
      (_id: string, onRestore: (session: Session) => void) => {
        onRestore({ ...s, archivedAt: undefined });
        return Promise.resolve(true);
      },
    );
    const handler = captureHandler('sessionCrud:restore');
    const result = await handler?.(makeEvent(), { sessionId: s.id }) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it('sessionCrud:restore fails when no trash file exists', async () => {
    mockRestoreFromTrash.mockResolvedValueOnce(false);
    const handler = captureHandler('sessionCrud:restore');
    const result = await handler?.(makeEvent(), { sessionId: 'ghost-id' }) as {
      success: boolean; error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/trash/);
  });

  it('sessionCrud:restore fails without sessionId', async () => {
    const handler = captureHandler('sessionCrud:restore');
    const result = await handler?.(makeEvent(), {}) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sessionId/);
  });

  it('sessionCrud:archive marks session as archived', async () => {
    const s = makeSession('/projects/epsilon');
    store.upsert(s);
    const handler = captureHandler('sessionCrud:archive');
    const result = await handler?.(makeEvent(), { sessionId: s.id }) as { success: boolean };
    expect(result.success).toBe(true);
    const archived = store.getById(s.id);
    expect(archived?.archivedAt).toBeDefined();
  });

  it('sessionCrud:archive broadcasts changed', async () => {
    const s = makeSession('/projects/zeta');
    store.upsert(s);
    mockSend.mockClear();
    const handler = captureHandler('sessionCrud:archive');
    await handler?.(makeEvent(), { sessionId: s.id });
    expect(mockSend).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Array));
  });

  it('sessionCrud:delete removes session from store', async () => {
    const s = makeSession('/projects/eta');
    store.upsert(s);
    const handler = captureHandler('sessionCrud:delete');
    const result = await handler?.(makeEvent(), { sessionId: s.id }) as { success: boolean };
    expect(result.success).toBe(true);
    expect(store.getById(s.id)).toBeUndefined();
  });

  it('sessionCrud:list returns empty when store is not initialised', async () => {
    vi.mocked(getSessionStore).mockReturnValue(null);
    const handler = captureHandler('sessionCrud:list');
    const result = await handler?.(makeEvent()) as { success: boolean; sessions: unknown[] };
    expect(result.success).toBe(true);
    expect(result.sessions).toHaveLength(0);
  });

  it('sessionCrud:openChatWindow calls createChatWindow and returns windowId', async () => {
    mockCreateChatWindow.mockClear();
    const handler = captureHandler('sessionCrud:openChatWindow');
    const result = await handler?.(makeEvent(), { sessionId: 'sess-xyz' }) as {
      success: boolean; windowId: number;
    };
    expect(result.success).toBe(true);
    expect(result.windowId).toBe(42);
    expect(mockCreateChatWindow).toHaveBeenCalledWith('sess-xyz');
  });

  it('sessionCrud:openChatWindow fails without sessionId', async () => {
    const handler = captureHandler('sessionCrud:openChatWindow');
    const result = await handler?.(makeEvent(), {}) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sessionId/);
  });

  it('sessionCrud:updateAgentMonitorSettings persists settings to the session', async () => {
    const s = makeSession('/projects/theta');
    store.upsert(s);
    const handler = captureHandler('sessionCrud:updateAgentMonitorSettings');
    const settings = { viewMode: 'summary' as const, inlineEventTypes: ['pre_tool_use'] };
    const result = await handler?.(makeEvent(), { sessionId: s.id, settings }) as {
      success: boolean;
    };
    expect(result.success).toBe(true);
    const updated = store.getById(s.id);
    expect(updated?.agentMonitorSettings?.viewMode).toBe('summary');
    expect(updated?.agentMonitorSettings?.inlineEventTypes).toEqual(['pre_tool_use']);
  });

  it('sessionCrud:updateAgentMonitorSettings fails without sessionId', async () => {
    const handler = captureHandler('sessionCrud:updateAgentMonitorSettings');
    const result = await handler?.(makeEvent(), {
      settings: { viewMode: 'normal', inlineEventTypes: [] },
    }) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sessionId/);
  });

  it('sessionCrud:updateAgentMonitorSettings fails without settings', async () => {
    const handler = captureHandler('sessionCrud:updateAgentMonitorSettings');
    const result = await handler?.(makeEvent(), { sessionId: 'no-settings' }) as {
      success: boolean; error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/settings/);
  });

  it('sessionCrud:updateAgentMonitorSettings broadcasts changed', async () => {
    const s = makeSession('/projects/iota');
    store.upsert(s);
    mockSend.mockClear();
    const handler = captureHandler('sessionCrud:updateAgentMonitorSettings');
    await handler?.(makeEvent(), {
      sessionId: s.id,
      settings: { viewMode: 'verbose', inlineEventTypes: [] },
    });
    expect(mockSend).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Array));
  });

  it('cleanupSessionCrudHandlers calls removeHandler for each channel', () => {
    mockRemoveHandler.mockClear();
    cleanupSessionCrudHandlers();
    expect(mockRemoveHandler).toHaveBeenCalledTimes(15);
  });
});
