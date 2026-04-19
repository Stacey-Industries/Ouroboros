/**
 * webPreloadApisSessionCrud.test.ts — smoke tests for session CRUD,
 * folder CRUD, pinned context, profile CRUD, layout, subagent,
 * checkpoint, and workspace-read-list web preload builders.
 *
 * Each test asserts that t.invoke is called with the correct channel name
 * and that the result is returned as-is. Transport is mocked.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  buildCheckpointApi,
  buildFolderCrudApi,
  buildLayoutApi,
  buildPinnedContextApi,
  buildProfileCrudApi,
  buildSessionCrudApi,
  buildSubagentApi,
  buildWorkspaceReadListApi,
} from './webPreloadApisSessionCrud';

// ─── Mock transport ───────────────────────────────────────────────────────────

function makeTransport() {
  const invoke = vi.fn().mockResolvedValue({ success: true });
  const on = vi.fn().mockReturnValue(() => {});
  return { invoke, on } as unknown as import('./webPreloadTransport').WebSocketTransport;
}

// ─── sessionCrud ──────────────────────────────────────────────────────────────

describe('buildSessionCrudApi', () => {
  it('list invokes sessionCrud:list', async () => {
    const t = makeTransport();
    const api = buildSessionCrudApi(t);
    await api.list();
    expect(t.invoke).toHaveBeenCalledWith('sessionCrud:list');
  });

  it('create invokes sessionCrud:create with projectRoot', async () => {
    const t = makeTransport();
    const api = buildSessionCrudApi(t);
    await api.create('/workspace/foo');
    expect(t.invoke).toHaveBeenCalledWith('sessionCrud:create', '/workspace/foo');
  });

  it('openChatWindow returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildSessionCrudApi(t);
    const result = await api.openChatWindow('session-123');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('onChanged subscribes to sessionCrud:changed', () => {
    const t = makeTransport();
    const api = buildSessionCrudApi(t);
    const cb = vi.fn();
    api.onChanged(cb);
    expect(t.on).toHaveBeenCalledWith('sessionCrud:changed', expect.any(Function));
  });
});

// ─── folderCrud ───────────────────────────────────────────────────────────────

describe('buildFolderCrudApi', () => {
  it('list invokes folderCrud:list', async () => {
    const t = makeTransport();
    const api = buildFolderCrudApi(t);
    await api.list();
    expect(t.invoke).toHaveBeenCalledWith('folderCrud:list');
  });

  it('moveSession invokes folderCrud:moveSession with all args', async () => {
    const t = makeTransport();
    const api = buildFolderCrudApi(t);
    await api.moveSession('folder-1', null, 'session-1');
    expect(t.invoke).toHaveBeenCalledWith('folderCrud:moveSession', 'folder-1', null, 'session-1');
  });
});

// ─── pinnedContext ────────────────────────────────────────────────────────────

describe('buildPinnedContextApi', () => {
  it('list invokes pinnedContext:list', async () => {
    const t = makeTransport();
    const api = buildPinnedContextApi(t);
    await api.list('session-1', false);
    expect(t.invoke).toHaveBeenCalledWith('pinnedContext:list', 'session-1', false);
  });

  it('add invokes pinnedContext:add', async () => {
    const t = makeTransport();
    const api = buildPinnedContextApi(t);
    const item = { type: 'file', filePath: '/foo.ts' };
    await api.add('session-1', item);
    expect(t.invoke).toHaveBeenCalledWith('pinnedContext:add', 'session-1', item);
  });
});

// ─── profileCrud ─────────────────────────────────────────────────────────────

describe('buildProfileCrudApi', () => {
  it('list invokes profileCrud:list', async () => {
    const t = makeTransport();
    const api = buildProfileCrudApi(t);
    await api.list();
    expect(t.invoke).toHaveBeenCalledWith('profileCrud:list');
  });

  it('estimate invokes profileCrud:estimate', async () => {
    const t = makeTransport();
    const api = buildProfileCrudApi(t);
    await api.estimate({ profileId: 'p1', contextTokens: 1000 });
    expect(t.invoke).toHaveBeenCalledWith('profileCrud:estimate', {
      profileId: 'p1',
      contextTokens: 1000,
    });
  });
});

// ─── layout ───────────────────────────────────────────────────────────────────

describe('buildLayoutApi', () => {
  it('getCustomLayout invokes layout:getCustomLayout', async () => {
    const t = makeTransport();
    const api = buildLayoutApi(t);
    await api.getCustomLayout('session-1');
    expect(t.invoke).toHaveBeenCalledWith('layout:getCustomLayout', 'session-1');
  });

  it('setCustomLayout invokes layout:setCustomLayout', async () => {
    const t = makeTransport();
    const api = buildLayoutApi(t);
    const tree = { kind: 'leaf', slotName: 'main' };
    await api.setCustomLayout('session-1', tree);
    expect(t.invoke).toHaveBeenCalledWith('layout:setCustomLayout', 'session-1', tree);
  });
});

// ─── subagent ─────────────────────────────────────────────────────────────────

describe('buildSubagentApi', () => {
  it('list invokes subagent:list', async () => {
    const t = makeTransport();
    const api = buildSubagentApi(t);
    await api.list({ parentSessionId: 'session-1' });
    expect(t.invoke).toHaveBeenCalledWith('subagent:list', { parentSessionId: 'session-1' });
  });

  it('liveCount invokes subagent:liveCount', async () => {
    const t = makeTransport();
    const api = buildSubagentApi(t);
    await api.liveCount({ parentSessionId: 'session-1' });
    expect(t.invoke).toHaveBeenCalledWith('subagent:liveCount', { parentSessionId: 'session-1' });
  });
});

// ─── checkpoint ───────────────────────────────────────────────────────────────

describe('buildCheckpointApi', () => {
  it('list invokes checkpoint:list', async () => {
    const t = makeTransport();
    const api = buildCheckpointApi(t);
    await api.list({ threadId: 'thread-1' });
    expect(t.invoke).toHaveBeenCalledWith('checkpoint:list', { threadId: 'thread-1' });
  });

  it('create returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildCheckpointApi(t);
    const result = await api.create({ threadId: 'thread-1' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('restore returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildCheckpointApi(t);
    const result = await api.restore({ checkpointId: 'cp-1' });
    expect(result.success).toBe(false);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('onChange subscribes to checkpoint:changed', () => {
    const t = makeTransport();
    const api = buildCheckpointApi(t);
    api.onChange(vi.fn());
    expect(t.on).toHaveBeenCalledWith('checkpoint:changed', expect.any(Function));
  });
});

// ─── workspaceReadList ────────────────────────────────────────────────────────

describe('buildWorkspaceReadListApi', () => {
  it('get invokes workspaceReadList:get', async () => {
    const t = makeTransport();
    const api = buildWorkspaceReadListApi(t);
    await api.get('/workspace/foo');
    expect(t.invoke).toHaveBeenCalledWith('workspaceReadList:get', '/workspace/foo');
  });

  it('add invokes workspaceReadList:add', async () => {
    const t = makeTransport();
    const api = buildWorkspaceReadListApi(t);
    await api.add('/workspace/foo', '/workspace/foo/bar.ts');
    expect(t.invoke).toHaveBeenCalledWith(
      'workspaceReadList:add',
      '/workspace/foo',
      '/workspace/foo/bar.ts',
    );
  });

  it('onChanged subscribes to workspaceReadList:changed', () => {
    const t = makeTransport();
    const api = buildWorkspaceReadListApi(t);
    api.onChanged(vi.fn());
    expect(t.on).toHaveBeenCalledWith('workspaceReadList:changed', expect.any(Function));
  });
});
