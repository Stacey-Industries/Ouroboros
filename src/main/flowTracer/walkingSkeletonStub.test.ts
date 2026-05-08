/**
 * walkingSkeletonStub.test.ts — smoke tests for the Phase 1 hardcoded stub.
 *
 * Verifies shape contracts that the acceptance test also checks, so any
 * regression in the stub data is caught at the unit level before the
 * IPC boundary test runs.
 */

import { describe, expect, it } from 'vitest';

import type { LayerKind } from '../../shared/types/flowTracer';
import { getWalkingSkeletonTrace, WALKING_SKELETON_FLOWS } from './walkingSkeletonStub';

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

describe('getWalkingSkeletonTrace', () => {
  it('returns a FlowTrace with required top-level fields', () => {
    const trace = getWalkingSkeletonTrace();
    expect(typeof trace.id).toBe('string');
    expect(typeof trace.title).toBe('string');
    expect(typeof trace.entryPoint.symbol).toBe('string');
    expect(typeof trace.entryPoint.file).toBe('string');
    expect(typeof trace.entryPoint.line).toBe('number');
    expect(typeof trace.generatedAt).toBe('number');
    expect(typeof trace.graphVersion).toBe('string');
    expect(typeof trace.metadata.layerCount).toBe('number');
    expect(typeof trace.metadata.boundaryCount).toBe('number');
    expect(typeof trace.metadata.depthCapHit).toBe('boolean');
  });

  it('has at least 2 steps spanning multiple layers', () => {
    const trace = getWalkingSkeletonTrace();
    expect(trace.steps.length).toBeGreaterThanOrEqual(2);
    const layers = new Set(trace.steps.map((s) => s.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
  });

  it('every step has valid layer, kind, and narration with [stub] markers', () => {
    const trace = getWalkingSkeletonTrace();
    for (const step of trace.steps) {
      expect(typeof step.id).toBe('string');
      expect(step.id.length).toBeGreaterThan(0);
      expect(VALID_LAYERS).toContain(step.layer);
      if (step.narration !== null && !('stale' in step.narration)) {
        expect(step.narration.what).toContain('[stub]');
        expect(step.narration.why).toContain('[stub]');
        expect(step.narration.how).toContain('[stub]');
      }
    }
  });

  it('has at least one boundary edge with a boundaryChannel', () => {
    const trace = getWalkingSkeletonTrace();
    const boundary = trace.edges.filter((e) => e.kind === 'boundary');
    expect(boundary.length).toBeGreaterThanOrEqual(1);
    for (const edge of boundary) {
      expect(typeof edge.boundaryChannel).toBe('string');
    }
  });

  it('all edge from/to ids reference existing step ids', () => {
    const trace = getWalkingSkeletonTrace();
    const stepIds = new Set(trace.steps.map((s) => s.id));
    for (const edge of trace.edges) {
      expect(stepIds.has(edge.from)).toBe(true);
      expect(stepIds.has(edge.to)).toBe(true);
    }
  });

  it('entryPoint matches the first canonical flow entry point', () => {
    const trace = getWalkingSkeletonTrace();
    const flow = WALKING_SKELETON_FLOWS[0];
    expect(trace.entryPoint.symbol).toBe(flow.entryPoint.symbol);
    expect(trace.entryPoint.file).toBe(flow.entryPoint.file);
    expect(trace.entryPoint.line).toBe(flow.entryPoint.line);
  });
});
