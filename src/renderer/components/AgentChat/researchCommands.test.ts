/**
 * researchCommands.test.ts — Unit tests for Wave 25 Phase C research command helpers.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFollowupPrompt,
  parseResearchCommand,
  runResearchAndPin,
} from './researchCommands';

// ─── parseResearchCommand ─────────────────────────────────────────────────────

describe('parseResearchCommand', () => {
  it('parses /research <topic>', () => {
    const result = parseResearchCommand('/research next.js server actions');
    expect(result).toEqual({ cmd: 'research', topic: 'next.js server actions' });
  });

  it('parses /spec-with-research <topic>', () => {
    const result = parseResearchCommand('/spec-with-research how do I use Next.js server actions');
    expect(result).toEqual({
      cmd: 'spec-with-research',
      topic: 'how do I use Next.js server actions',
    });
  });

  it('parses /implement-with-research <topic>', () => {
    const result = parseResearchCommand('/implement-with-research add pagination to file list');
    expect(result).toEqual({
      cmd: 'implement-with-research',
      topic: 'add pagination to file list',
    });
  });

  it('is case-insensitive for the command part', () => {
    const result = parseResearchCommand('/RESEARCH react hooks');
    expect(result).toEqual({ cmd: 'research', topic: 'react hooks' });
  });

  it('trims leading whitespace from input', () => {
    const result = parseResearchCommand('  /research prisma relations');
    expect(result).toEqual({ cmd: 'research', topic: 'prisma relations' });
  });

  it('returns null for plain text (no slash command)', () => {
    expect(parseResearchCommand('hello world')).toBeNull();
  });

  it('returns null for unrelated slash command', () => {
    expect(parseResearchCommand('/clear')).toBeNull();
  });

  it('returns null when topic is empty after command', () => {
    expect(parseResearchCommand('/research')).toBeNull();
    expect(parseResearchCommand('/research   ')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseResearchCommand('')).toBeNull();
  });
});

// ─── buildFollowupPrompt ──────────────────────────────────────────────────────

describe('buildFollowupPrompt', () => {
  it('returns empty string for plain research', () => {
    expect(buildFollowupPrompt('research', 'next.js')).toBe('');
  });

  it('returns spec prompt for spec-with-research', () => {
    expect(buildFollowupPrompt('spec-with-research', 'Next.js server actions')).toBe(
      'Generate a spec for: Next.js server actions',
    );
  });

  it('returns implement prompt for implement-with-research', () => {
    expect(buildFollowupPrompt('implement-with-research', 'add pagination')).toBe(
      'Implement: add pagination',
    );
  });
});

// ─── runResearchAndPin ────────────────────────────────────────────────────────

const MOCK_ARTIFACT = {
  id: 'art-123',
  topic: 'next.js',
  sources: [],
  summary: 'A framework for React.',
  relevantSnippets: [],
  confidenceHint: 'high' as const,
  correlationId: 'corr-123',
  createdAt: Date.now(),
  cached: false,
};

function makeElectronAPI(overrides?: {
  researchSuccess?: boolean;
  researchError?: string;
  pinSuccess?: boolean;
  pinError?: string;
}) {
  const opts = { researchSuccess: true, pinSuccess: true, ...overrides };
  return {
    research: {
      invoke: vi.fn().mockResolvedValue(
        opts.researchSuccess
          ? { success: true, artifact: MOCK_ARTIFACT }
          : { success: false, error: opts.researchError ?? 'failed' },
      ),
    },
    pinnedContext: {
      add: vi.fn().mockResolvedValue(
        opts.pinSuccess ? { success: true } : { success: false, error: opts.pinError ?? 'cap hit' },
      ),
    },
  };
}

describe('runResearchAndPin', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = makeElectronAPI();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).electronAPI;
  });

  it('returns success with artifactId on happy path', async () => {
    const result = await runResearchAndPin({ sessionId: 'sess-1', topic: 'next.js' });
    expect(result.success).toBe(true);
    expect(result.artifactId).toBe('art-123');
    expect(result.error).toBeUndefined();
  });

  it('calls research.invoke with the provided topic', async () => {
    const api = makeElectronAPI();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = api;
    await runResearchAndPin({ sessionId: 'sess-1', topic: 'prisma schema' });
    expect(api.research.invoke).toHaveBeenCalledWith({ topic: 'prisma schema' });
  });

  it('calls pinnedContext.add with correct shape', async () => {
    const api = makeElectronAPI();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = api;
    await runResearchAndPin({ sessionId: 'sess-42', topic: 'next.js' });
    expect(api.pinnedContext.add).toHaveBeenCalledWith('sess-42', {
      type: 'research-artifact',
      source: `research://${MOCK_ARTIFACT.correlationId}`,
      title: MOCK_ARTIFACT.topic,
      content: MOCK_ARTIFACT.summary,
      tokens: expect.any(Number),
    });
  });

  it('returns failure when research.invoke fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = makeElectronAPI({ researchSuccess: false, researchError: 'timeout' });
    const result = await runResearchAndPin({ sessionId: 'sess-1', topic: 'react' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('returns partial success when pin fails but research succeeded', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = makeElectronAPI({ pinSuccess: false, pinError: 'cap hit' });
    const result = await runResearchAndPin({ sessionId: 'sess-1', topic: 'react' });
    // artifact was retrieved — still considered a partial success
    expect(result.success).toBe(true);
    expect(result.artifactId).toBe('art-123');
  });

  it('handles research.invoke throwing an exception', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = {
      research: { invoke: vi.fn().mockRejectedValue(new Error('IPC error')) },
      pinnedContext: { add: vi.fn() },
    };
    const result = await runResearchAndPin({ sessionId: 'sess-1', topic: 'react' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('IPC error');
  });
});
