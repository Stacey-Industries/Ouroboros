/**
 * researchPrompt.test.ts — Unit tests for buildResearchPrompt.
 */

import { describe, expect, it } from 'vitest';

import { buildResearchPrompt } from './researchPrompt';

describe('buildResearchPrompt', () => {
  it('contains the topic', () => {
    const prompt = buildResearchPrompt({ topic: 'app router data fetching' });
    expect(prompt).toContain('app router data fetching');
  });

  it('contains required JSON schema keys', () => {
    const prompt = buildResearchPrompt({ topic: 'hooks' });
    expect(prompt).toContain('"sources"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"relevantSnippets"');
    expect(prompt).toContain('"confidenceHint"');
  });

  it('contains token cap guidance', () => {
    const prompt = buildResearchPrompt({ topic: 'hooks' });
    // Accept either "1500" or "1,500" style
    expect(prompt).toMatch(/1[,.]?500/);
    expect(prompt).toMatch(/2[,.]?000/);
  });

  it('contains tool instructions', () => {
    const prompt = buildResearchPrompt({ topic: 'hooks' });
    expect(prompt.toLowerCase()).toContain('context7');
    expect(prompt.toLowerCase()).toContain('web search');
  });

  it('includes library name when provided', () => {
    const prompt = buildResearchPrompt({ topic: 'routing', library: 'next.js' });
    expect(prompt).toContain('next.js');
  });

  it('includes version when provided alongside library', () => {
    const prompt = buildResearchPrompt({ topic: 'routing', library: 'next.js', version: '15.2.0' });
    expect(prompt).toContain('15.2.0');
  });

  it('omits version line when library is absent', () => {
    const prompt = buildResearchPrompt({ topic: 'fetch API' });
    expect(prompt).not.toContain('version:');
  });

  it('instructs output as plain JSON without markdown fences', () => {
    const prompt = buildResearchPrompt({ topic: 'hooks' });
    expect(prompt.toLowerCase()).toContain('no markdown fences');
  });
});
