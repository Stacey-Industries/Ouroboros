/**
 * GraphPanelTypes.test.ts — smoke tests for exported constants and types.
 *
 * These tests verify that the runtime-accessible constants have the expected
 * values. Type-only exports are verified by the TypeScript compiler.
 */

import { describe, expect, it } from 'vitest';

import {
  EDGE_VISIBILITY_THRESHOLD,
  INITIAL_TRANSFORM,
  LABEL_VISIBILITY_THRESHOLD,
  MAX_SCALE,
  MIN_SCALE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './GraphPanelTypes';

describe('GraphPanelTypes constants', () => {
  it('INITIAL_TRANSFORM starts at origin with scale 1', () => {
    expect(INITIAL_TRANSFORM).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('MIN_SCALE and MAX_SCALE bracket the usable zoom range', () => {
    expect(MIN_SCALE).toBeLessThan(1);
    expect(MAX_SCALE).toBeGreaterThan(1);
  });

  it('EDGE_VISIBILITY_THRESHOLD is below LABEL_VISIBILITY_THRESHOLD', () => {
    expect(EDGE_VISIBILITY_THRESHOLD).toBeLessThan(LABEL_VISIBILITY_THRESHOLD);
  });

  it('EDGE_VISIBILITY_THRESHOLD is within the scale clamp range', () => {
    expect(EDGE_VISIBILITY_THRESHOLD).toBeGreaterThan(MIN_SCALE);
    expect(EDGE_VISIBILITY_THRESHOLD).toBeLessThan(MAX_SCALE);
  });

  it('NODE_WIDTH and NODE_HEIGHT are positive integers', () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
    expect(Number.isInteger(NODE_WIDTH)).toBe(true);
    expect(Number.isInteger(NODE_HEIGHT)).toBe(true);
  });
});
