/**
 * canonicalFlowsPrompt.test.ts — Unit tests for prompt assembly and response
 * parsing logic in canonicalFlowsPrompt.ts.
 *
 * Wave 85 Phase 5.
 */

import { describe, expect, it } from 'vitest';

import {
  buildGalleryPrompt,
  type EntryPointCandidate,
  parseGalleryResponse,
} from './canonicalFlowsPrompt';

const CANDIDATES: EntryPointCandidate[] = [
  {
    symbol: 'handleSendMessage',
    file: 'src/renderer/components/Chat/Chat.tsx',
    line: 42,
    category: 'renderer-event',
  },
  {
    symbol: 'registerMessageHandlers',
    file: 'src/main/ipc-handlers/agentChat.ts',
    line: 163,
    category: 'ipc-handler',
  },
  {
    symbol: 'handleOpenFile',
    file: 'src/renderer/components/FileTree/FileTree.tsx',
    line: 88,
    category: 'renderer-event',
  },
];

const EXCERPT = '# Ouroboros — Claude Code Instructions\nAgent-first Electron IDE.';

describe('buildGalleryPrompt', () => {
  it('includes the project context header', () => {
    const prompt = buildGalleryPrompt(CANDIDATES, EXCERPT);
    expect(prompt).toContain('Ouroboros Agent IDE');
  });

  it('includes all candidate symbols', () => {
    const prompt = buildGalleryPrompt(CANDIDATES, EXCERPT);
    for (const c of CANDIDATES) {
      expect(prompt).toContain(c.symbol);
    }
  });

  it('includes the CLAUDE.md excerpt', () => {
    const prompt = buildGalleryPrompt(CANDIDATES, EXCERPT);
    expect(prompt).toContain('Electron IDE');
  });

  it('instructs the model to return a JSON array', () => {
    const prompt = buildGalleryPrompt(CANDIDATES, EXCERPT);
    expect(prompt).toContain('JSON array');
  });
});

describe('parseGalleryResponse', () => {
  it('parses a well-formed JSON array of flows', () => {
    const raw = JSON.stringify([
      {
        title: 'When I send a chat message',
        entryPoint: {
          symbol: 'handleSendMessage',
          file: 'src/renderer/components/Chat/Chat.tsx',
          line: 42,
        },
        estimatedSteps: 6,
        layers: ['renderer', 'preload', 'main'],
      },
    ]);
    const flows = parseGalleryResponse(raw, CANDIDATES, true);
    expect(flows).toHaveLength(1);
    expect(flows[0].title).toBe('When I send a chat message');
    expect(flows[0].entryPoint.symbol).toBe('handleSendMessage');
    expect(flows[0].layers).toContain('renderer');
  });

  it('drops flows whose entryPoint.symbol is not in the candidate set when resolveEntryPoints=true', () => {
    const raw = JSON.stringify([
      {
        title: 'Unknown flow',
        entryPoint: { symbol: 'nonExistentHandler', file: 'src/main/foo.ts', line: 1 },
        estimatedSteps: 3,
        layers: ['main'],
      },
    ]);
    const flows = parseGalleryResponse(raw, CANDIDATES, true);
    expect(flows).toHaveLength(0);
  });

  it('keeps flows with unknown entryPoint when resolveEntryPoints=false', () => {
    const raw = JSON.stringify([
      {
        title: 'Some flow',
        entryPoint: { symbol: 'anyHandler', file: 'src/main/foo.ts', line: 5 },
        estimatedSteps: 4,
        layers: ['main'],
      },
    ]);
    const flows = parseGalleryResponse(raw, CANDIDATES, false);
    expect(flows).toHaveLength(1);
  });

  it('strips markdown fences before parsing', () => {
    const raw =
      '```json\n' +
      JSON.stringify([
        {
          title: 'Fenced flow',
          entryPoint: {
            symbol: 'handleSendMessage',
            file: 'src/renderer/components/Chat/Chat.tsx',
            line: 42,
          },
          estimatedSteps: 5,
          layers: ['renderer', 'main'],
        },
      ]) +
      '\n```';
    const flows = parseGalleryResponse(raw, CANDIDATES, true);
    expect(flows).toHaveLength(1);
    expect(flows[0].title).toBe('Fenced flow');
  });

  it('filters out invalid layer values', () => {
    const raw = JSON.stringify([
      {
        title: 'Bad layers',
        entryPoint: {
          symbol: 'handleSendMessage',
          file: 'src/renderer/components/Chat/Chat.tsx',
          line: 42,
        },
        estimatedSteps: 3,
        layers: ['renderer', 'invalid-layer', 'main'],
      },
    ]);
    const flows = parseGalleryResponse(raw, CANDIDATES, true);
    expect(flows).toHaveLength(1);
    expect(flows[0].layers).toEqual(['renderer', 'main']);
    expect(flows[0].layers).not.toContain('invalid-layer');
  });

  it('returns empty array for empty input', () => {
    expect(parseGalleryResponse('', CANDIDATES, true)).toEqual([]);
  });

  it('returns empty array for non-JSON input', () => {
    expect(parseGalleryResponse('not json at all', CANDIDATES, true)).toEqual([]);
  });

  it('drops items missing required entryPoint fields', () => {
    const raw = JSON.stringify([
      {
        title: 'Missing file',
        entryPoint: { symbol: 'handleSendMessage', line: 42 },
        estimatedSteps: 3,
        layers: [],
      },
    ]);
    expect(parseGalleryResponse(raw, CANDIDATES, false)).toHaveLength(0);
  });

  it('uses estimatedSteps=5 as default when field is absent', () => {
    const raw = JSON.stringify([
      {
        title: 'No steps field',
        entryPoint: {
          symbol: 'handleSendMessage',
          file: 'src/renderer/components/Chat/Chat.tsx',
          line: 42,
        },
        layers: ['renderer'],
      },
    ]);
    const flows = parseGalleryResponse(raw, CANDIDATES, true);
    expect(flows[0].estimatedSteps).toBe(5);
  });
});
