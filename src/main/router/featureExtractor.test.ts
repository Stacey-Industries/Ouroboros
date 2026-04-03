/**
 * featureExtractor.test.ts — Unit tests for the feature extractor module.
 */

import { describe, expect, it } from 'vitest';

import { extractFeatures } from './featureExtractor';
import { FEATURE_NAMES } from './routerTypes';

describe('extractFeatures', () => {
  it('returns all expected keys in canonical order', () => {
    const result = extractFeatures('Hello world');
    const keys = Object.keys(result);
    expect(keys).toEqual([...FEATURE_NAMES]);
  });

  it('empty prompt produces sensible zero/default values', () => {
    const result = extractFeatures('');
    expect(result.promptCharLength).toBe(0);
    expect(result.wordCount).toBe(0);
    expect(result.questionMarkCount).toBe(0);
    expect(result.sentenceCount).toBe(1); // min 1
    expect(result.containsCodeBlock).toBe(0);
    expect(result.containsFilePath).toBe(0);
    expect(result.filePathCount).toBe(0);
    expect(result.judgmentWordCount).toBe(0);
    expect(result.planningWordCount).toBe(0);
    expect(result.implementationWordCount).toBe(0);
    expect(result.lookupWordCount).toBe(0);
    expect(result.ambiguityWordCount).toBe(0);
    expect(result.scopeWordCount).toBe(0);
    expect(result.prevMessageIsAssistant).toBe(0);
    expect(result.prevAssistantEndsWithQuestion).toBe(0);
    expect(result.prevAssistantLength).toBe(0);
    expect(result.prevAssistantIsPlan).toBe(0);
    expect(result.isPastedOnly).toBe(0);
    expect(result.slashCommandPresent).toBe(0);
  });

  it('judgment words score > 0 for "what do you think?"', () => {
    const result = extractFeatures('what do you think?');
    expect(result.judgmentWordCount).toBeGreaterThan(0);
  });

  it('detects code blocks', () => {
    const result = extractFeatures('Here is some code:\n```ts\nconst x = 1;\n```');
    expect(result.containsCodeBlock).toBe(1);
  });

  it('detects Unix-style file paths', () => {
    const result = extractFeatures('Please edit src/main/router/featureExtractor.ts for me.');
    expect(result.containsFilePath).toBe(1);
    expect(result.filePathCount).toBeGreaterThan(0);
  });

  it('detects Windows-style file paths', () => {
    const result = extractFeatures('The file is at C:\\Web App\\Agent IDE\\src\\main\\config.ts');
    expect(result.containsFilePath).toBe(1);
    expect(result.filePathCount).toBeGreaterThan(0);
  });

  it('prevMessageIsAssistant is 1 when previous message is provided', () => {
    const result = extractFeatures('Follow up question', 'I have reviewed the code.');
    expect(result.prevMessageIsAssistant).toBe(1);
  });

  it('prevMessageIsAssistant is 0 when previous message is absent', () => {
    const result = extractFeatures('Hello');
    expect(result.prevMessageIsAssistant).toBe(0);
  });

  it('prevAssistantEndsWithQuestion is 1 when previous message ends with ?', () => {
    const result = extractFeatures('Yes please', 'Would you like me to continue?');
    expect(result.prevAssistantEndsWithQuestion).toBe(1);
  });

  it('prevAssistantEndsWithQuestion is 0 when previous message does not end with ?', () => {
    const result = extractFeatures('Thanks', 'Done. I updated the file.');
    expect(result.prevAssistantEndsWithQuestion).toBe(0);
  });

  it('prevAssistantLength buckets correctly', () => {
    expect(extractFeatures('x').prevAssistantLength).toBe(0);
    expect(extractFeatures('x', 'short').prevAssistantLength).toBe(1);
    expect(extractFeatures('x', 'a'.repeat(200)).prevAssistantLength).toBe(2);
    expect(extractFeatures('x', 'a'.repeat(501)).prevAssistantLength).toBe(3);
  });

  it('prevAssistantIsPlan is 1 for long structured messages', () => {
    const plan = [
      '## Implementation Plan',
      '',
      '1. First step',
      '2. Second step',
      '- bullet item',
      'x'.repeat(460),
    ].join('\n');
    const result = extractFeatures('Looks good', plan);
    expect(result.prevAssistantIsPlan).toBe(1);
  });

  it('prevAssistantIsPlan is 0 for short messages even with structure', () => {
    const result = extractFeatures('ok', '## Short\n1. item');
    expect(result.prevAssistantIsPlan).toBe(0);
  });

  it('isPastedOnly detects pasted text prompts', () => {
    expect(extractFeatures('[Pasted text #1]').isPastedOnly).toBe(1);
    expect(extractFeatures('[Pasted text #42] some more').isPastedOnly).toBe(1);
    expect(extractFeatures('Normal message').isPastedOnly).toBe(0);
  });

  it('slashCommandPresent detects slash-prefixed prompts', () => {
    expect(extractFeatures('/user:review fix this').slashCommandPresent).toBe(1);
    expect(extractFeatures('regular prompt').slashCommandPresent).toBe(0);
  });

  it('questionMarkCount counts multiple question marks', () => {
    const result = extractFeatures('Is this right? Are you sure? Really?');
    expect(result.questionMarkCount).toBe(3);
  });

  it('sentenceCount is at least 1 for prompts without terminal punctuation', () => {
    const result = extractFeatures('no punctuation here');
    expect(result.sentenceCount).toBeGreaterThanOrEqual(1);
  });

  it('planningWordCount scores planning prompts', () => {
    const result = extractFeatures('Can you help me architect and design a new feature roadmap?');
    expect(result.planningWordCount).toBeGreaterThan(0);
  });

  it('implementationWordCount scores implementation prompts', () => {
    const result = extractFeatures('Please add a new function and refactor the existing one');
    expect(result.implementationWordCount).toBeGreaterThan(0);
  });

  it('lookupWordCount scores lookup prompts', () => {
    const result = extractFeatures('Can you explain what is happening here and where is the config?');
    expect(result.lookupWordCount).toBeGreaterThan(0);
  });

  it('ambiguityWordCount scores ambiguous prompts', () => {
    const result = extractFeatures('maybe do this or that, not sure which alternative is better');
    expect(result.ambiguityWordCount).toBeGreaterThan(0);
  });

  it('scopeWordCount scores broad scope prompts', () => {
    const result = extractFeatures('Refactor the entire codebase across all modules');
    expect(result.scopeWordCount).toBeGreaterThan(0);
  });
});
