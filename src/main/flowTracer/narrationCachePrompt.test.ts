/**
 * narrationCachePrompt.test.ts — Unit tests for prompt building and response
 * parsing helpers in narrationCachePrompt.ts.
 *
 * Wave 85 Phase 3.
 */

import { describe, expect, it } from 'vitest';

import type { SymbolRef } from '../../shared/types/flowTracer';
import {
  buildNarrationBatch,
  NARRATION_SYSTEM_PROMPT,
  type NarrationSymbolInput,
  parseNarrationBatchResponse,
  WHY_PLACEHOLDER,
} from './narrationCachePrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  symbol: string,
  file = 'src/foo.ts',
  line = 1,
  body = 'function foo() {}',
): NarrationSymbolInput {
  const symbolRef: SymbolRef = { symbol, file, line };
  return { symbolRef, body };
}

// ---------------------------------------------------------------------------
// buildNarrationBatch
// ---------------------------------------------------------------------------

describe('buildNarrationBatch', () => {
  it('includes the system prompt', () => {
    const prompt = buildNarrationBatch([makeInput('handleSubmit')]);
    expect(prompt).toContain(NARRATION_SYSTEM_PROMPT);
  });

  it('includes the symbol name and file in the prompt', () => {
    const prompt = buildNarrationBatch([
      makeInput('handleSubmit', 'src/renderer/Composer.tsx', 42),
    ]);
    expect(prompt).toContain('handleSubmit');
    expect(prompt).toContain('src/renderer/Composer.tsx');
    expect(prompt).toContain('42');
  });

  it('includes the body code', () => {
    const prompt = buildNarrationBatch([
      makeInput('handleSubmit', 'f.ts', 1, 'function handleSubmit() { return 1; }'),
    ]);
    expect(prompt).toContain('function handleSubmit()');
  });

  it('truncates body to 2400 chars', () => {
    const longBody = 'x'.repeat(5000);
    const prompt = buildNarrationBatch([makeInput('foo', 'f.ts', 1, longBody)]);
    const bodyOccurrence = prompt.indexOf('x'.repeat(2400));
    expect(bodyOccurrence).toBeGreaterThan(-1);
    expect(prompt).not.toContain('x'.repeat(2401));
  });

  it('labels multiple symbols with sequential numbers', () => {
    const prompt = buildNarrationBatch([makeInput('alpha'), makeInput('beta')]);
    expect(prompt).toContain('Symbol 1: alpha');
    expect(prompt).toContain('Symbol 2: beta');
  });
});

// ---------------------------------------------------------------------------
// parseNarrationBatchResponse — happy paths
// ---------------------------------------------------------------------------

describe('parseNarrationBatchResponse — happy paths', () => {
  it('parses a single-symbol JSON array response', () => {
    const symbols = [makeInput('handleSubmit')];
    const text = JSON.stringify([
      {
        symbol: 'handleSubmit',
        what: 'The submit handler.',
        why: WHY_PLACEHOLDER,
        how: 'Reads state and calls IPC.',
      },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(1);
    const narration = result.get('handleSubmit');
    expect(narration?.what).toBe('The submit handler.');
    expect(narration?.why).toBe(WHY_PLACEHOLDER);
    expect(narration?.how).toBe('Reads state and calls IPC.');
  });

  it('parses a multi-symbol response', () => {
    const symbols = [makeInput('alpha'), makeInput('beta')];
    const text = JSON.stringify([
      { symbol: 'alpha', what: 'Alpha what.', why: WHY_PLACEHOLDER, how: 'Alpha how.' },
      { symbol: 'beta', what: 'Beta what.', why: WHY_PLACEHOLDER, how: 'Beta how.' },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(2);
    expect(result.get('alpha')?.what).toBe('Alpha what.');
    expect(result.get('beta')?.what).toBe('Beta what.');
  });

  it('strips markdown fences before parsing', () => {
    const symbols = [makeInput('myFn')];
    const text =
      '```json\n[{"symbol":"myFn","what":"Does X.","why":"' +
      WHY_PLACEHOLDER +
      '","how":"By doing Y."}]\n```';
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(1);
    expect(result.get('myFn')?.what).toBe('Does X.');
  });

  it('uses positional fallback when symbol field is empty and batch size is 1', () => {
    const symbols = [makeInput('onlyOne')];
    const text = JSON.stringify([
      { symbol: '', what: 'Fallback what.', why: WHY_PLACEHOLDER, how: 'Fallback how.' },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(1);
    expect(result.get('onlyOne')?.what).toBe('Fallback what.');
  });

  it('does not apply positional fallback when batch size > 1', () => {
    const symbols = [makeInput('a'), makeInput('b')];
    // Both items have empty symbol — neither matches
    const text = JSON.stringify([
      { symbol: '', what: 'W1.', why: WHY_PLACEHOLDER, how: 'H1.' },
      { symbol: '', what: 'W2.', why: WHY_PLACEHOLDER, how: 'H2.' },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseNarrationBatchResponse — error / degenerate inputs
// ---------------------------------------------------------------------------

describe('parseNarrationBatchResponse — degenerate inputs', () => {
  it('returns empty map for empty text', () => {
    const result = parseNarrationBatchResponse('', [makeInput('x')]);
    expect(result.size).toBe(0);
  });

  it('returns empty map for non-JSON text', () => {
    const result = parseNarrationBatchResponse('not json at all', [makeInput('x')]);
    expect(result.size).toBe(0);
  });

  it('skips items missing required what/how fields', () => {
    const symbols = [makeInput('incomplete')];
    const text = JSON.stringify([{ symbol: 'incomplete', why: 'Only why.' }]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(0);
  });

  it('skips items whose symbol does not match any input', () => {
    const symbols = [makeInput('known')];
    const text = JSON.stringify([
      { symbol: 'unknown', what: 'W.', why: WHY_PLACEHOLDER, how: 'H.' },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(0);
  });

  it('does not overwrite the first occurrence when duplicate symbols appear', () => {
    const symbols = [makeInput('dup')];
    const text = JSON.stringify([
      { symbol: 'dup', what: 'First.', why: WHY_PLACEHOLDER, how: 'How first.' },
      { symbol: 'dup', what: 'Second.', why: WHY_PLACEHOLDER, how: 'How second.' },
    ]);
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(1);
    expect(result.get('dup')?.what).toBe('First.');
  });

  it('extracts an embedded array when response has surrounding text', () => {
    const symbols = [makeInput('embeddedFn')];
    const text =
      'Here is the result: [{"symbol":"embeddedFn","what":"W.","why":"' +
      WHY_PLACEHOLDER +
      '","how":"H."}] done.';
    const result = parseNarrationBatchResponse(text, symbols);
    expect(result.size).toBe(1);
  });
});
