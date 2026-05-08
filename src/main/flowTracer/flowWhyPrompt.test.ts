/**
 * flowWhyPrompt.test.ts — Unit tests for chain-aware Why prompt assembly
 * and response parsing (Wave 85 Phase 4).
 */

import { describe, expect, it } from 'vitest';

import type { FlowTrace, Narration } from '../../shared/types/flowTracer';
import {
  buildFlowWhyPrompt,
  fillMissingWhyEntries,
  parseFlowWhyResponse,
  STEP_BODY_MAX_LINES,
  truncateStepBody,
} from './flowWhyPrompt';
import { WHY_PLACEHOLDER } from './narrationCachePrompt';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFlow(stepCount = 3): FlowTrace {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${i}`,
    layer: 'renderer' as const,
    symbol: `symbolFn${i}`,
    file: `src/renderer/foo${i}.ts`,
    line: i * 10 + 1,
    kind: 'function' as const,
    narration: null,
  }));
  return {
    id: 'flow-abc',
    title: 'When I send a chat message',
    entryPoint: { symbol: 'symbolFn0', file: 'src/renderer/foo0.ts', line: 1 },
    steps,
    edges: [],
    generatedAt: 1_000_000,
    graphVersion: 'v1',
    metadata: { layerCount: 1, boundaryCount: 0, depthCapHit: false },
  };
}

function makeNarrationMap(flow: FlowTrace): Map<string, Pick<Narration, 'what' | 'how'>> {
  const m = new Map<string, Pick<Narration, 'what' | 'how'>>();
  for (const step of flow.steps) {
    m.set(step.symbol, { what: `What for ${step.symbol}`, how: `How for ${step.symbol}` });
  }
  return m;
}

function makeBodyMap(flow: FlowTrace, body = 'function foo() { return 1; }'): Map<string, string> {
  const m = new Map<string, string>();
  for (const step of flow.steps) m.set(step.id, body);
  return m;
}

// ---------------------------------------------------------------------------
// truncateStepBody
// ---------------------------------------------------------------------------

describe('truncateStepBody', () => {
  it('returns the body unchanged when it is within the line limit', () => {
    const body = Array.from({ length: STEP_BODY_MAX_LINES }, (_, i) => `line ${i}`).join('\n');
    expect(truncateStepBody(body)).toBe(body);
  });

  it('truncates to STEP_BODY_MAX_LINES lines and appends a truncation marker', () => {
    const lines = Array.from({ length: STEP_BODY_MAX_LINES + 10 }, (_, i) => `line ${i}`);
    const result = truncateStepBody(lines.join('\n'));
    const resultLines = result.split('\n');
    // STEP_BODY_MAX_LINES content lines + 1 truncation marker line
    expect(resultLines.length).toBe(STEP_BODY_MAX_LINES + 1);
    // eslint-disable-next-line security/detect-object-injection -- array index from constant, not user input
    expect(resultLines[STEP_BODY_MAX_LINES]).toBe('// … (truncated)');
  });

  it('preserves the first line (function signature)', () => {
    const lines = [
      'export async function handleSubmit(payload: SubmitPayload): Promise<void> {',
      ...Array.from({ length: STEP_BODY_MAX_LINES + 5 }, (_, i) => `  doWork${i}();`),
    ];
    const result = truncateStepBody(lines.join('\n'));
    expect(result.split('\n')[0]).toBe(lines[0]);
  });
});

// ---------------------------------------------------------------------------
// buildFlowWhyPrompt
// ---------------------------------------------------------------------------

describe('buildFlowWhyPrompt', () => {
  it('includes the flow title', () => {
    const flow = makeFlow(2);
    const prompt = buildFlowWhyPrompt(flow, makeNarrationMap(flow), makeBodyMap(flow));
    expect(prompt).toContain('When I send a chat message');
  });

  it('includes every step id', () => {
    const flow = makeFlow(3);
    const prompt = buildFlowWhyPrompt(flow, makeNarrationMap(flow), makeBodyMap(flow));
    for (const step of flow.steps) {
      expect(prompt).toContain(step.id);
    }
  });

  it('includes cached What and How for each step', () => {
    const flow = makeFlow(2);
    const narrations = makeNarrationMap(flow);
    const prompt = buildFlowWhyPrompt(flow, narrations, makeBodyMap(flow));
    for (const step of flow.steps) {
      expect(prompt).toContain(`What for ${step.symbol}`);
      expect(prompt).toContain(`How for ${step.symbol}`);
    }
  });

  it('shows "(not yet cached)" when narration is absent for a step', () => {
    const flow = makeFlow(2);
    const prompt = buildFlowWhyPrompt(flow, new Map(), makeBodyMap(flow));
    expect(prompt).toContain('(not yet cached)');
  });

  it('includes step body (truncated if needed)', () => {
    const flow = makeFlow(1);
    const longBody = Array.from({ length: STEP_BODY_MAX_LINES + 5 }, (_, i) => `line ${i}`).join(
      '\n',
    );
    const bodyMap = new Map([[flow.steps[0].id, longBody]]);
    const prompt = buildFlowWhyPrompt(flow, makeNarrationMap(flow), bodyMap);
    expect(prompt).toContain('// … (truncated)');
  });

  it('instructs Haiku to return JSON array with stepId and why fields', () => {
    const flow = makeFlow(2);
    const prompt = buildFlowWhyPrompt(flow, makeNarrationMap(flow), makeBodyMap(flow));
    expect(prompt).toContain('"stepId"');
    expect(prompt).toContain('"why"');
  });

  it('includes invariant/constraint language in the system context', () => {
    const flow = makeFlow(1);
    const prompt = buildFlowWhyPrompt(flow, makeNarrationMap(flow), makeBodyMap(flow));
    expect(prompt.toLowerCase()).toContain('invariant');
  });
});

// ---------------------------------------------------------------------------
// parseFlowWhyResponse — happy paths
// ---------------------------------------------------------------------------

describe('parseFlowWhyResponse — happy path', () => {
  it('parses a clean JSON array of Why entries', () => {
    const flow = makeFlow(2);
    const raw = JSON.stringify([
      { stepId: 'step-0', why: 'Electron security isolates the renderer.' },
      { stepId: 'step-1', why: 'IPC is the only sanctioned crossing.' },
    ]);
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      stepId: 'step-0',
      why: 'Electron security isolates the renderer.',
    });
    expect(result[1]).toEqual({
      stepId: 'step-1',
      why: 'IPC is the only sanctioned crossing.',
    });
  });

  it('strips markdown fences before parsing', () => {
    const flow = makeFlow(1);
    const raw = '```json\n[{ "stepId": "step-0", "why": "Fenced response." }]\n```';
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(1);
    expect(result[0].why).toBe('Fenced response.');
  });

  it('extracts embedded JSON array when Haiku adds surrounding prose', () => {
    const flow = makeFlow(1);
    const raw =
      'Sure, here is the JSON:\n[{ "stepId": "step-0", "why": "Embedded." }]\nHope that helps!';
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(1);
    expect(result[0].why).toBe('Embedded.');
  });
});

// ---------------------------------------------------------------------------
// parseFlowWhyResponse — degenerate inputs
// ---------------------------------------------------------------------------

describe('parseFlowWhyResponse — degenerate inputs', () => {
  it('returns empty array for empty string', () => {
    expect(parseFlowWhyResponse('', makeFlow(2))).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseFlowWhyResponse('   \n  ', makeFlow(2))).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    const flow = makeFlow(1);
    expect(parseFlowWhyResponse('{ not valid json', flow)).toEqual([]);
  });

  it('drops entries whose stepId does not match any step in the flow', () => {
    const flow = makeFlow(2);
    const raw = JSON.stringify([
      { stepId: 'step-0', why: 'Real step.' },
      { stepId: 'hallucinated-step-99', why: 'Hallucinated step.' },
    ]);
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe('step-0');
  });

  it('deduplicates repeated stepId entries, keeping first occurrence', () => {
    const flow = makeFlow(1);
    const raw = JSON.stringify([
      { stepId: 'step-0', why: 'First occurrence.' },
      { stepId: 'step-0', why: 'Duplicate — should be dropped.' },
    ]);
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(1);
    expect(result[0].why).toBe('First occurrence.');
  });

  it('drops entries missing stepId or why fields', () => {
    const flow = makeFlow(2);
    const raw = JSON.stringify([
      { stepId: 'step-0', why: 'Valid.' },
      { stepId: 'step-1' }, // missing why
      { why: 'No stepId.' }, // missing stepId
    ]);
    const result = parseFlowWhyResponse(raw, flow);
    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe('step-0');
  });
});

// ---------------------------------------------------------------------------
// fillMissingWhyEntries
// ---------------------------------------------------------------------------

describe('fillMissingWhyEntries', () => {
  it('leaves entries intact when all steps are covered', () => {
    const flow = makeFlow(2);
    const entries = flow.steps.map((s) => ({ stepId: s.id, why: `Why for ${s.id}` }));
    const result = fillMissingWhyEntries(entries, flow);
    expect(result).toHaveLength(2);
    for (const e of result) expect(e.why).not.toBe(WHY_PLACEHOLDER);
  });

  it('adds WHY_PLACEHOLDER entries for missing steps', () => {
    const flow = makeFlow(3);
    const partialEntries = [{ stepId: 'step-0', why: 'Why step 0.' }];
    const result = fillMissingWhyEntries(partialEntries, flow);
    expect(result).toHaveLength(3);
    const step1Entry = result.find((e) => e.stepId === 'step-1');
    const step2Entry = result.find((e) => e.stepId === 'step-2');
    expect(step1Entry?.why).toBe(WHY_PLACEHOLDER);
    expect(step2Entry?.why).toBe(WHY_PLACEHOLDER);
  });

  it('handles completely empty entries for a flow with steps', () => {
    const flow = makeFlow(2);
    const result = fillMissingWhyEntries([], flow);
    expect(result).toHaveLength(2);
    for (const e of result) expect(e.why).toBe(WHY_PLACEHOLDER);
  });
});
