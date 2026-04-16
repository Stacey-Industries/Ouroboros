/**
 * research.test.ts — Unit tests for the research IPC handler registrar.
 *
 * Mocks runResearch so no CLI spawn ever occurs.
 * Mocks ipcMain to capture registered handlers and invoke them directly.
 */

import type { ResearchArtifact } from '@shared/types/research';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock ipcMain ─────────────────────────────────────────────────────────────

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  },
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ─── Mock runResearch ─────────────────────────────────────────────────────────

const mockRunResearch = vi.fn<() => Promise<ResearchArtifact>>();

vi.mock('../research/researchSubagent', () => ({
  runResearch: (...args: unknown[]) => mockRunResearch(...args),
}));

// ─── Test artifact ────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<ResearchArtifact> = {}): ResearchArtifact {
  return {
    id: 'test-uuid',
    topic: 'app router',
    library: 'next',
    version: '15.2.0',
    sources: [{ url: 'https://nextjs.org', title: 'Next.js Docs' }],
    summary: 'Summary text here.',
    relevantSnippets: [],
    confidenceHint: 'high',
    correlationId: 'test-uuid',
    createdAt: Date.now(),
    cached: false,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Invoke a registered IPC handler by channel name, mimicking ipcMain dispatch. */
async function invoke(channel: string, args: unknown): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`No handler registered for ${channel}`);
  // ipcMain calls handler(_event, ...args) — first arg is the event stub
  return fn({} /* fake event */, args);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  handlers.clear();
  mockRunResearch.mockReset();
  // Re-import to trigger fresh registration each test
  vi.resetModules();
  const mod = await import('./research');
  mod.registerResearchHandlers();
});

afterEach(() => {
  vi.resetModules();
});

describe('registerResearchHandlers', () => {
  it('registers the research:invoke channel', () => {
    expect(handlers.has('research:invoke')).toBe(true);
  });
});

describe('research:invoke handler', () => {
  it('returns success:true with artifact on valid topic', async () => {
    const artifact = makeArtifact();
    mockRunResearch.mockResolvedValue(artifact);
    const result = await invoke('research:invoke', { topic: 'app router' }) as {
      success: boolean;
      artifact?: ResearchArtifact;
    };
    expect(result.success).toBe(true);
    expect(result.artifact?.topic).toBe('app router');
  });

  it('passes library and version through to runResearch', async () => {
    const artifact = makeArtifact();
    mockRunResearch.mockResolvedValue(artifact);
    await invoke('research:invoke', { topic: 'routing', library: 'next', version: '15.2.0' });
    expect(mockRunResearch).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'routing', library: 'next', version: '15.2.0' }),
    );
  });

  it('returns success:false when topic is missing', async () => {
    const result = await invoke('research:invoke', {}) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/topic/i);
  });

  it('returns success:false when topic is empty string', async () => {
    const result = await invoke('research:invoke', { topic: '   ' }) as {
      success: boolean;
      error?: string;
    };
    expect(result.success).toBe(false);
  });

  it('returns success:false when args is null', async () => {
    const result = await invoke('research:invoke', null) as { success: boolean };
    expect(result.success).toBe(false);
  });

  it('forwards the full artifact returned by runResearch', async () => {
    const artifact = makeArtifact({ confidenceHint: 'low', cached: true });
    mockRunResearch.mockResolvedValue(artifact);
    const result = await invoke('research:invoke', { topic: 'routing' }) as {
      success: boolean;
      artifact?: ResearchArtifact;
    };
    expect(result.artifact?.confidenceHint).toBe('low');
    expect(result.artifact?.cached).toBe(true);
  });

  it('returns success:false and does not throw when runResearch rejects', async () => {
    mockRunResearch.mockRejectedValue(new Error('unexpected spawn failure'));
    const result = await invoke('research:invoke', { topic: 'routing' }) as {
      success: boolean;
      error?: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('unexpected spawn failure');
  });
});

describe('cleanupResearchHandlers', () => {
  it('removes registered channels', async () => {
    const mod = await import('./research');
    mod.cleanupResearchHandlers();
    expect(handlers.has('research:invoke')).toBe(false);
  });
});
