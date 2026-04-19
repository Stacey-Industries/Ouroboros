/**
 * webPreloadApisExtended.test.ts — smoke tests for the extended web preload
 * API builders: ecosystem, marketplace, research, agentChat additions,
 * agentConflict, system2, router, workspace, backgroundJobs, and
 * desktop-only stubs (ai, aiStream, embedding, telemetry, observability, graph, spec).
 *
 * Each test asserts that t.invoke is called with the correct channel name
 * and that the result is returned as-is. Transport is mocked.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  buildAgentChatExtApi,
  buildAgentConflictApi,
  buildAiApi,
  buildAiStreamApi,
  buildBackgroundJobsApi,
  buildEcosystemApi,
  buildEmbeddingApi,
  buildGraphApi,
  buildMarketplaceApi,
  buildObservabilityApi,
  buildResearchApi,
  buildRouterApi,
  buildSpecApi,
  buildSystem2Api,
  buildTelemetryApi,
  buildWorkspaceApi,
} from './webPreloadApisExtended';

// ─── Mock transport ───────────────────────────────────────────────────────────

function makeTransport() {
  const invoke = vi.fn().mockResolvedValue({ success: true });
  const on = vi.fn().mockReturnValue(() => {});
  return { invoke, on } as unknown as import('./webPreloadTransport').WebSocketTransport;
}

// ─── ecosystem ────────────────────────────────────────────────────────────────

describe('buildEcosystemApi', () => {
  it('exportUsage invokes ecosystem:exportUsage', async () => {
    const t = makeTransport();
    const api = buildEcosystemApi(t);
    const opts = { windowStart: 0, windowEnd: 1, outputPath: '/tmp/out.jsonl' };
    await api.exportUsage(opts);
    expect(t.invoke).toHaveBeenCalledWith('ecosystem:exportUsage', opts);
  });

  it('lastExportInfo invokes ecosystem:lastExportInfo', async () => {
    const t = makeTransport();
    const api = buildEcosystemApi(t);
    await api.lastExportInfo();
    expect(t.invoke).toHaveBeenCalledWith('ecosystem:lastExportInfo');
  });

  it('onPromptDiff subscribes to ecosystem:promptDiff', () => {
    const t = makeTransport();
    const api = buildEcosystemApi(t);
    api.onPromptDiff(vi.fn());
    expect(t.on).toHaveBeenCalledWith('ecosystem:promptDiff', expect.any(Function));
  });
});

// ─── marketplace ──────────────────────────────────────────────────────────────

describe('buildMarketplaceApi', () => {
  it('listBundles invokes marketplace:listBundles', async () => {
    const t = makeTransport();
    const api = buildMarketplaceApi(t);
    await api.listBundles();
    expect(t.invoke).toHaveBeenCalledWith('marketplace:listBundles');
  });

  it('revokedIds invokes marketplace:revokedIds', async () => {
    const t = makeTransport();
    const api = buildMarketplaceApi(t);
    await api.revokedIds();
    expect(t.invoke).toHaveBeenCalledWith('marketplace:revokedIds');
  });

  it('install returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildMarketplaceApi(t);
    const result = await api.install({ entryId: 'bundle-1' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/i);
    expect(t.invoke).not.toHaveBeenCalled();
  });
});

// ─── research ─────────────────────────────────────────────────────────────────

describe('buildResearchApi', () => {
  it('getDashboardMetrics invokes research:getDashboardMetrics', async () => {
    const t = makeTransport();
    const api = buildResearchApi(t);
    await api.getDashboardMetrics('7d');
    expect(t.invoke).toHaveBeenCalledWith('research:getDashboardMetrics', '7d');
  });

  it('setSessionMode invokes research:setSessionMode', async () => {
    const t = makeTransport();
    const api = buildResearchApi(t);
    await api.setSessionMode('session-1', 'conservative');
    expect(t.invoke).toHaveBeenCalledWith('research:setSessionMode', 'session-1', 'conservative');
  });

  it('invoke returns stub without calling transport', async () => {
    const t = makeTransport();
    const api = buildResearchApi(t);
    const result = await api.invoke({ topic: 'react hooks' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
    expect(t.invoke).not.toHaveBeenCalled();
  });
});

// ─── agentChat additions ──────────────────────────────────────────────────────

describe('buildAgentChatExtApi', () => {
  it('searchThreads invokes agentChat:searchThreads', async () => {
    const t = makeTransport();
    const api = buildAgentChatExtApi(t);
    const payload = { query: 'hello', workspaceRoot: '/ws' };
    await api.searchThreads(payload);
    expect(t.invoke).toHaveBeenCalledWith('agentChat:searchThreads', payload);
  });

  it('setThreadTags invokes agentChat:setThreadTags', async () => {
    const t = makeTransport();
    const api = buildAgentChatExtApi(t);
    await api.setThreadTags('thread-1', ['bug', 'review']);
    expect(t.invoke).toHaveBeenCalledWith('agentChat:setThreadTags', 'thread-1', ['bug', 'review']);
  });

  it('getThreadCostRollup invokes agentChat:getThreadCostRollup', async () => {
    const t = makeTransport();
    const api = buildAgentChatExtApi(t);
    await api.getThreadCostRollup({ threadId: 'thread-1' });
    expect(t.invoke).toHaveBeenCalledWith('agentChat:getThreadCostRollup', { threadId: 'thread-1' });
  });
});

// ─── agentConflict ────────────────────────────────────────────────────────────

describe('buildAgentConflictApi', () => {
  it('getReports invokes agentConflict:getReports', async () => {
    const t = makeTransport();
    const api = buildAgentConflictApi(t);
    await api.getReports('/workspace/foo');
    expect(t.invoke).toHaveBeenCalledWith('agentConflict:getReports', '/workspace/foo');
  });

  it('dismiss invokes agentConflict:dismiss', async () => {
    const t = makeTransport();
    const api = buildAgentConflictApi(t);
    await api.dismiss('session-a', 'session-b');
    expect(t.invoke).toHaveBeenCalledWith('agentConflict:dismiss', 'session-a', 'session-b');
  });

  it('onChange subscribes to agentConflict:changed', () => {
    const t = makeTransport();
    const api = buildAgentConflictApi(t);
    api.onChange(vi.fn());
    expect(t.on).toHaveBeenCalledWith('agentConflict:changed', expect.any(Function));
  });
});

// ─── system2 ─────────────────────────────────────────────────────────────────

describe('buildSystem2Api', () => {
  it('onIndexProgress subscribes to system2:indexProgress', () => {
    const t = makeTransport();
    const api = buildSystem2Api(t);
    api.onIndexProgress(vi.fn());
    expect(t.on).toHaveBeenCalledWith('system2:indexProgress', expect.any(Function));
  });
});

// ─── router ───────────────────────────────────────────────────────────────────

describe('buildRouterApi', () => {
  it('getStats invokes router:getStats', async () => {
    const t = makeTransport();
    const api = buildRouterApi(t);
    await api.getStats();
    expect(t.invoke).toHaveBeenCalledWith('router:getStats');
  });
});

// ─── workspace ────────────────────────────────────────────────────────────────

describe('buildWorkspaceApi', () => {
  it('isTrusted invokes workspace:isTrusted', async () => {
    const t = makeTransport();
    const api = buildWorkspaceApi(t);
    await api.isTrusted('/workspace/foo');
    expect(t.invoke).toHaveBeenCalledWith('workspace:isTrusted', '/workspace/foo');
  });

  it('trust returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildWorkspaceApi(t);
    const result = await api.trust('/workspace/foo');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/i);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('untrust returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildWorkspaceApi(t);
    const result = await api.untrust('/workspace/foo');
    expect(result.success).toBe(false);
    expect(t.invoke).not.toHaveBeenCalled();
  });
});

// ─── backgroundJobs ───────────────────────────────────────────────────────────

describe('buildBackgroundJobsApi', () => {
  it('list invokes backgroundJobs:list', async () => {
    const t = makeTransport();
    const api = buildBackgroundJobsApi(t);
    await api.list('/workspace/foo');
    expect(t.invoke).toHaveBeenCalledWith('backgroundJobs:list', '/workspace/foo');
  });

  it('cancel invokes backgroundJobs:cancel', async () => {
    const t = makeTransport();
    const api = buildBackgroundJobsApi(t);
    await api.cancel('job-1');
    expect(t.invoke).toHaveBeenCalledWith('backgroundJobs:cancel', 'job-1');
  });

  it('enqueue returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildBackgroundJobsApi(t);
    const result = await api.enqueue({ kind: 'reindex' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/i);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('onUpdate subscribes to backgroundJobs:update', () => {
    const t = makeTransport();
    const api = buildBackgroundJobsApi(t);
    api.onUpdate(vi.fn());
    expect(t.on).toHaveBeenCalledWith('backgroundJobs:update', expect.any(Function));
  });
});

// ─── desktop-only stubs ───────────────────────────────────────────────────────

describe('buildAiApi', () => {
  it('all methods return desktop-only stubs', async () => {
    const api = buildAiApi();
    const result = await api.inlineCompletion({});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/desktop app/i);
  });
});

describe('buildAiStreamApi', () => {
  it('startInlineEdit returns desktop-only stub', async () => {
    const api = buildAiStreamApi();
    const result = await api.startInlineEdit({});
    expect(result.success).toBe(false);
  });

  it('onStream returns a cleanup noop', () => {
    const api = buildAiStreamApi();
    const cleanup = api.onStream('req-1', vi.fn());
    expect(typeof cleanup).toBe('function');
  });
});

describe('buildEmbeddingApi', () => {
  it('search returns desktop-only stub', async () => {
    const api = buildEmbeddingApi();
    const result = await api.search('query', '/ws');
    expect(result.success).toBe(false);
  });
});

describe('buildTelemetryApi', () => {
  it('queryEvents returns desktop-only stub without invoking transport', async () => {
    const t = makeTransport();
    const api = buildTelemetryApi(t);
    const result = await api.queryEvents({ limit: 10 });
    expect(result.success).toBe(false);
    expect(t.invoke).not.toHaveBeenCalled();
  });

  it('record invokes telemetry:record', async () => {
    const t = makeTransport();
    const api = buildTelemetryApi(t);
    await api.record({ type: 'test', payload: {} });
    expect(t.invoke).toHaveBeenCalledWith('telemetry:record', expect.any(Object));
  });
});

describe('buildObservabilityApi', () => {
  it('exportTrace returns desktop-only stub', async () => {
    const api = buildObservabilityApi();
    const result = await api.exportTrace({});
    expect(result.success).toBe(false);
  });
});

describe('buildGraphApi', () => {
  it('searchGraph returns desktop-only stub', async () => {
    const api = buildGraphApi();
    const result = await api.searchGraph('query');
    expect(result.success).toBe(false);
  });
});

describe('buildSpecApi', () => {
  it('scaffold returns desktop-only stub', async () => {
    const api = buildSpecApi();
    const result = await api.scaffold({ name: 'MySpec' });
    expect(result.success).toBe(false);
  });
});
