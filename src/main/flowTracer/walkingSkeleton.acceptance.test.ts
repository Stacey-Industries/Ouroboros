/**
 * walkingSkeleton.acceptance.test.ts — Wave 85 Phase 1 boundary contract.
 *
 * ORCHESTRATOR-OWNED. The Phase 1 implementer must NOT modify this file.
 *
 * Per ~/.claude/rules/orchestrator-owned-acceptance-tests.md: the orchestrator
 * authors the failing acceptance test before dispatch. The implementer
 * implements src/main/flowTracer/** until this test passes. Modifying this file
 * defeats the rule's purpose — the test exists so the implementer's mental
 * model has to bend to the protocol's actual contract, not the reverse.
 *
 * Reference: docs/superpowers/specs/2026-05-08-flow-tracer-design.md §5.4
 *            roadmap/wave-85-flow-tracer/waveplan-85.md (Phase 1 row)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanonicalFlow,
  EdgeKind,
  FlowTrace,
  LayerKind,
  StepKind,
} from '../../shared/types/flowTracer';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => handlers.set(ch, fn),
      removeHandler: (ch: string) => handlers.delete(ch),
      _handlers: handlers,
      _invoke: async (ch: string, ...args: unknown[]) => {
        const fn = handlers.get(ch);
        if (!fn) throw new Error(`No handler registered for channel: ${ch}`);
        return fn({} as Electron.IpcMainInvokeEvent, ...args);
      },
    },
  };
});

import { ipcMain } from 'electron';

import { cleanupFlowTracerHandlers, registerFlowTracerHandlers } from './index';

const invoke = (
  ipcMain as unknown as { _invoke: (ch: string, ...a: unknown[]) => Promise<unknown> }
)._invoke;

const VALID_LAYERS: LayerKind[] = ['user', 'renderer', 'preload', 'main', 'cli', 'filesystem'];
const VALID_STEP_KINDS: StepKind[] = ['function', 'spawn', 'fs', 'ipc-bridge', 'ipc-handler'];
const VALID_EDGE_KINDS: EdgeKind[] = ['sync', 'async', 'boundary'];

beforeEach(() => {
  registerFlowTracerHandlers();
});

afterEach(() => {
  cleanupFlowTracerHandlers();
});

describe('Wave 85 Phase 1 — walking-skeleton IPC contract', () => {
  describe('flowTracer:get-canonical-flows', () => {
    it('is registered and returns success envelope', async () => {
      const result = (await invoke('flowTracer:get-canonical-flows')) as {
        success: boolean;
        flows?: CanonicalFlow[];
      };
      expect(result.success).toBe(true);
      expect(Array.isArray(result.flows)).toBe(true);
    });

    it('returns at least one canonical flow (Phase 1 hardcoded)', async () => {
      const result = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      expect(result.flows.length).toBeGreaterThanOrEqual(1);
    });

    it('each canonical flow has the required CanonicalFlow shape', async () => {
      const result = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      for (const flow of result.flows) {
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

  describe('flowTracer:trace-flow', () => {
    it('is registered and accepts a SymbolRef entry point', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: boolean;
      };
      expect(result.success).toBe(true);
    });

    it('returns a FlowTrace with the required top-level shape', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      expect(typeof result.flow.id).toBe('string');
      expect(typeof result.flow.title).toBe('string');
      expect(typeof result.flow.entryPoint.symbol).toBe('string');
      expect(typeof result.flow.generatedAt).toBe('number');
      expect(typeof result.flow.graphVersion).toBe('string');
      expect(typeof result.flow.metadata.layerCount).toBe('number');
      expect(typeof result.flow.metadata.boundaryCount).toBe('number');
      expect(typeof result.flow.metadata.depthCapHit).toBe('boolean');
    });

    it('returns a FlowTrace with at least 2 steps spanning multiple layers', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      expect(result.flow.steps.length).toBeGreaterThanOrEqual(2);
      const distinctLayers = new Set(result.flow.steps.map((s) => s.layer));
      expect(distinctLayers.size).toBeGreaterThanOrEqual(2);
    });

    it('every FlowStep has valid layer + kind enums and required fields', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      for (const step of result.flow.steps) {
        expect(typeof step.id).toBe('string');
        expect(step.id.length).toBeGreaterThan(0);
        expect(typeof step.symbol).toBe('string');
        expect(typeof step.file).toBe('string');
        expect(typeof step.line).toBe('number');
        expect(VALID_LAYERS).toContain(step.layer);
        expect(VALID_STEP_KINDS).toContain(step.kind);
        // narration may be: full Narration object, { stale: true }, or null.
        if (step.narration !== null && !('stale' in step.narration)) {
          expect(typeof step.narration.what).toBe('string');
          expect(typeof step.narration.why).toBe('string');
          expect(typeof step.narration.how).toBe('string');
        }
      }
    });

    it('every FlowEdge has valid kind, references existing steps, and includes channel for boundary edges', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      const stepIds = new Set(result.flow.steps.map((s) => s.id));
      for (const edge of result.flow.edges) {
        expect(typeof edge.from).toBe('string');
        expect(typeof edge.to).toBe('string');
        expect(stepIds.has(edge.from)).toBe(true);
        expect(stepIds.has(edge.to)).toBe(true);
        expect(VALID_EDGE_KINDS).toContain(edge.kind);
        if (edge.kind === 'boundary') {
          expect(typeof edge.boundaryChannel).toBe('string');
        }
      }
    });

    it('walking-skeleton flow includes at least one boundary edge (renderer→preload→main path)', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      const boundaryEdges = result.flow.edges.filter((e) => e.kind === 'boundary');
      expect(boundaryEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('FlowTrace.entryPoint matches the entry point passed in', async () => {
      const gallery = (await invoke('flowTracer:get-canonical-flows')) as {
        success: true;
        flows: CanonicalFlow[];
      };
      const entry = gallery.flows[0].entryPoint;
      const result = (await invoke('flowTracer:trace-flow', entry)) as {
        success: true;
        flow: FlowTrace;
      };
      expect(result.flow.entryPoint.symbol).toBe(entry.symbol);
      expect(result.flow.entryPoint.file).toBe(entry.file);
      expect(result.flow.entryPoint.line).toBe(entry.line);
    });
  });

  describe('handler registration discipline', () => {
    it('registerFlowTracerHandlers returns the list of registered channel names', () => {
      cleanupFlowTracerHandlers();
      const channels = registerFlowTracerHandlers();
      expect(Array.isArray(channels)).toBe(true);
      expect(channels).toContain('flowTracer:get-canonical-flows');
      expect(channels).toContain('flowTracer:trace-flow');
    });

    it('cleanupFlowTracerHandlers removes registered channels', async () => {
      cleanupFlowTracerHandlers();
      await expect(invoke('flowTracer:get-canonical-flows')).rejects.toThrow(
        /No handler registered/,
      );
    });
  });
});
