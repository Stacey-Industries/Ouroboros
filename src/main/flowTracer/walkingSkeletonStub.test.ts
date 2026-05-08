/**
 * walkingSkeletonStub.test.ts — Phase 5 update.
 *
 * WALKING_SKELETON_FLOWS moved to canonicalFlows.ts as FALLBACK_FLOWS.
 * These tests now verify FALLBACK_FLOWS to maintain coverage of the
 * cold-start fallback contract.
 */

import { describe, expect, it } from 'vitest';

import type { LayerKind } from '../../shared/types/flowTracer';
import { FALLBACK_FLOWS } from './canonicalFlows';

const VALID_LAYERS: LayerKind[] = ['user', 'renderer', 'preload', 'main', 'cli', 'filesystem'];

describe('FALLBACK_FLOWS (moved from walkingSkeletonStub)', () => {
  it('has at least one canonical flow', () => {
    expect(FALLBACK_FLOWS.length).toBeGreaterThanOrEqual(1);
  });

  it('each flow has the required CanonicalFlow shape', () => {
    for (const flow of FALLBACK_FLOWS) {
      expect(typeof flow.title).toBe('string');
      expect(flow.title.length).toBeGreaterThan(0);
      expect(typeof flow.entryPoint.symbol).toBe('string');
      expect(typeof flow.entryPoint.file).toBe('string');
      expect(typeof flow.entryPoint.line).toBe('number');
      expect(typeof flow.estimatedSteps).toBe('number');
      expect(Array.isArray(flow.layers)).toBe(true);
      for (const layer of flow.layers) {
        expect(VALID_LAYERS).toContain(layer);
      }
    }
  });
});
