import { describe, expect, it } from 'vitest';

import { classifyFeatures } from './classifier';

describe('classifier', () => {
  const baseFeatures: Record<string, number> = {
    promptCharLength: 50,
    wordCount: 10,
    questionMarkCount: 0,
    sentenceCount: 1,
    containsCodeBlock: 0,
    containsFilePath: 0,
    filePathCount: 0,
    judgmentWordCount: 0,
    planningWordCount: 0,
    implementationWordCount: 0,
    lookupWordCount: 0,
    ambiguityWordCount: 0,
    scopeWordCount: 0,
    prevMessageIsAssistant: 0,
    prevAssistantEndsWithQuestion: 0,
    prevAssistantLength: 0,
    prevAssistantIsPlan: 0,
    isPastedOnly: 0,
    slashCommandPresent: 0,
  };

  it('returns a valid tier for baseline features', () => {
    const result = classifyFeatures(baseFeatures);
    expect(result).not.toBeNull();
    expect(['HAIKU', 'SONNET', 'OPUS']).toContain(result!.tier);
  });

  it('confidence is between 0 and 1', () => {
    const result = classifyFeatures(baseFeatures);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('high judgment words push toward OPUS', () => {
    const opusFeatures = {
      ...baseFeatures,
      promptCharLength: 200,
      wordCount: 40,
      judgmentWordCount: 5,
      questionMarkCount: 2,
      scopeWordCount: 3,
    };
    const result = classifyFeatures(opusFeatures);
    expect(result).not.toBeNull();
    // With strong judgment signals, should lean OPUS (or at least not HAIKU)
    expect(result!.tier).not.toBe('HAIKU');
  });

  it('very short prompt with no signals leans HAIKU', () => {
    const haikuFeatures = {
      ...baseFeatures,
      promptCharLength: 5,
      wordCount: 1,
    };
    const result = classifyFeatures(haikuFeatures);
    expect(result).not.toBeNull();
    // Short prompt should not be OPUS
    expect(result!.tier).not.toBe('OPUS');
  });

  it('includes features in the result', () => {
    const result = classifyFeatures(baseFeatures);
    expect(result!.features).toBe(baseFeatures);
  });

  it('handles missing feature keys gracefully', () => {
    const sparse = { promptCharLength: 100 };
    const result = classifyFeatures(sparse);
    expect(result).not.toBeNull();
    expect(['HAIKU', 'SONNET', 'OPUS']).toContain(result!.tier);
  });
});
