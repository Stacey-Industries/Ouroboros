/**
 * walkingSkeletonStub.test.ts — smoke tests for the Phase 1 hardcoded stub.
 *
 * Phase 2: getWalkingSkeletonTrace() removed from the stub; only WALKING_SKELETON_FLOWS
 * remains (used by get-canonical-flows until Phase 5 ships the AI gallery).
 */

import { describe, expect, it } from 'vitest';

import type { LayerKind } from '../../shared/types/flowTracer';
import { WALKING_SKELETON_FLOWS } from './walkingSkeletonStub';

const VALID_LAYERS: LayerKind[] = ['user', 'renderer', 'preload', 'main', 'cli', 'filesystem'];

describe('WALKING_SKELETON_FLOWS', () => {
  it('has at least one canonical flow', () => {
    expect(WALKING_SKELETON_FLOWS.length).toBeGreaterThanOrEqual(1);
  });

  it('each flow has the required CanonicalFlow shape', () => {
    for (const flow of WALKING_SKELETON_FLOWS) {
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
