/**
 * flowMermaidExport.test.ts — golden-file and structural tests for Mermaid export.
 *
 * Validates:
 *  - Output starts with "sequenceDiagram"
 *  - participant declarations are present and in encounter order
 *  - sync edges produce ->> arrows
 *  - async edges produce -->> arrows
 *  - boundary edges produce ->> arrows with a Note over the target
 *  - title line is included
 *  - symbol labels are sanitised (colons replaced)
 */

import { describe, expect, it } from 'vitest';

import type { FlowEdge, FlowStep, FlowTrace } from '../../shared/types/flowTracer';
import { flowTraceToMermaid } from './flowMermaidExport';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeStep(
  id: string,
  layer: FlowStep['layer'],
  symbol: string,
  kind: FlowStep['kind'] = 'function',
): FlowStep {
  return { id, layer, symbol, file: 'src/test.ts', line: 1, kind, narration: null };
}

function makeEdge(
  from: string,
  to: string,
  kind: FlowEdge['kind'],
  boundaryChannel?: string,
): FlowEdge {
  return { from, to, kind, ...(boundaryChannel ? { boundaryChannel } : {}) };
}

function makeTrace(title: string, steps: FlowStep[], edges: FlowEdge[]): FlowTrace {
  const layers = new Set(steps.map((s) => s.layer));
  const boundaryEdges = edges.filter((e) => e.kind === 'boundary');
  return {
    id: 'test-trace',
    title,
    entryPoint: { symbol: steps[0]?.symbol ?? 'entry', file: 'src/test.ts', line: 1 },
    steps,
    edges,
    generatedAt: 0,
    graphVersion: 'test',
    metadata: { layerCount: layers.size, boundaryCount: boundaryEdges.length, depthCapHit: false },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('flowTraceToMermaid — structure', () => {
  it('output starts with "sequenceDiagram"', () => {
    const trace = makeTrace('Test flow', [makeStep('s1', 'renderer', 'handleClick')], []);
    const output = flowTraceToMermaid(trace);
    expect(output.startsWith('sequenceDiagram')).toBe(true);
  });

  it('includes a title line', () => {
    const trace = makeTrace(
      'When I send a chat message',
      [makeStep('s1', 'renderer', 'handleSubmit')],
      [],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('title When I send a chat message');
  });

  it('declares each encountered layer as a participant', () => {
    const trace = makeTrace(
      'Multi-layer flow',
      [
        makeStep('s1', 'renderer', 'handleClick'),
        makeStep('s2', 'preload', 'bridge.send'),
        makeStep('s3', 'main', 'ipcHandler'),
      ],
      [makeEdge('s1', 's2', 'sync'), makeEdge('s2', 's3', 'boundary', 'test:channel')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('participant Renderer');
    expect(output).toContain('participant Preload');
    expect(output).toContain('participant Main');
  });

  it('does not declare layers that are not present in steps', () => {
    const trace = makeTrace(
      'Small flow',
      [makeStep('s1', 'renderer', 'fn'), makeStep('s2', 'main', 'handler')],
      [makeEdge('s1', 's2', 'sync')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).not.toContain('participant CLI');
    expect(output).not.toContain('participant Filesystem');
    expect(output).not.toContain('participant User');
  });

  it('declares participants in the order layers are first encountered', () => {
    const trace = makeTrace(
      'Order test',
      [
        makeStep('s1', 'renderer', 'a'),
        makeStep('s2', 'preload', 'b'),
        makeStep('s3', 'main', 'c'),
      ],
      [],
    );
    const output = flowTraceToMermaid(trace);
    const rendererPos = output.indexOf('participant Renderer');
    const preloadPos = output.indexOf('participant Preload');
    const mainPos = output.indexOf('participant Main');
    expect(rendererPos).toBeLessThan(preloadPos);
    expect(preloadPos).toBeLessThan(mainPos);
  });
});

describe('flowTraceToMermaid — edge arrows', () => {
  it('renders sync edges as ->> arrows', () => {
    const trace = makeTrace(
      'Sync flow',
      [makeStep('s1', 'renderer', 'fn'), makeStep('s2', 'main', 'handler')],
      [makeEdge('s1', 's2', 'sync')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('Renderer->>Main: handler');
  });

  it('renders async edges as -->> arrows', () => {
    const trace = makeTrace(
      'Async flow',
      [makeStep('s1', 'main', 'spawn'), makeStep('s2', 'cli', 'claudeProcess', 'spawn')],
      [makeEdge('s1', 's2', 'async')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('Main-->>CLI: claudeProcess');
  });

  it('renders boundary edges as ->> arrows with a Note', () => {
    const trace = makeTrace(
      'Boundary flow',
      [makeStep('s1', 'preload', 'bridge'), makeStep('s2', 'main', 'ipcHandler', 'ipc-handler')],
      [makeEdge('s1', 's2', 'boundary', 'chat:sendMessage')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('Preload->>Main: ipcHandler');
    expect(output).toContain('Note over Main: via chat∶sendMessage');
  });

  it('boundary edges without a channel still render the arrow (no Note)', () => {
    const trace = makeTrace(
      'Boundary no channel',
      [makeStep('s1', 'renderer', 'fn'), makeStep('s2', 'preload', 'relay', 'ipc-bridge')],
      [makeEdge('s1', 's2', 'boundary')],
    );
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('Renderer->>Preload: relay');
    expect(output).not.toContain('Note over');
  });

  it('skips edges that reference unknown step ids', () => {
    const trace = makeTrace(
      'Dangling edge',
      [makeStep('s1', 'renderer', 'fn')],
      [makeEdge('s1', 'GHOST', 'sync')],
    );
    const output = flowTraceToMermaid(trace);
    // Should still produce valid sequenceDiagram header, just no arrow for the ghost
    expect(output.startsWith('sequenceDiagram')).toBe(true);
    expect(output).not.toContain('GHOST');
  });
});

describe('flowTraceToMermaid — label sanitisation', () => {
  it('replaces colons in symbol names so Mermaid does not misparse them', () => {
    const trace = makeTrace(
      'Colon test',
      [
        makeStep('s1', 'renderer', 'fn'),
        makeStep('s2', 'main', 'flowTracer:save-flow', 'ipc-handler'),
      ],
      [makeEdge('s1', 's2', 'sync')],
    );
    const output = flowTraceToMermaid(trace);
    // The colon in the channel name must be replaced with ∶ (U+2236 RATIO)
    expect(output).toContain('flowTracer∶save-flow');
    expect(output).not.toContain('flowTracer:save-flow');
  });

  it('replaces colons in the title', () => {
    const trace = makeTrace('Title: with colon', [makeStep('s1', 'renderer', 'fn')], []);
    const output = flowTraceToMermaid(trace);
    expect(output).toContain('title Title∶ with colon');
  });
});

describe('flowTraceToMermaid — walking skeleton fixture', () => {
  it('produces expected output for the 6-step chat-send flow', () => {
    const steps: FlowStep[] = [
      makeStep('step-1', 'renderer', 'handleSubmit'),
      makeStep('step-2', 'preload', 'agentChat.sendMessage', 'ipc-bridge'),
      makeStep('step-3', 'main', 'registerMessageHandlers', 'ipc-handler'),
      makeStep('step-4', 'main', 'sendMessageWithBridge'),
      makeStep('step-5', 'main', 'createAgentChatOrchestrationBridge'),
      makeStep('step-6', 'cli', 'spawnClaude', 'spawn'),
    ];
    const edges: FlowEdge[] = [
      makeEdge('step-1', 'step-2', 'sync'),
      makeEdge('step-2', 'step-3', 'boundary', 'agentChat:sendMessage'),
      makeEdge('step-3', 'step-4', 'sync'),
      makeEdge('step-4', 'step-5', 'sync'),
      makeEdge('step-5', 'step-6', 'async'),
    ];
    const trace = makeTrace('When I send a chat message', steps, edges);
    const output = flowTraceToMermaid(trace);

    expect(output.startsWith('sequenceDiagram')).toBe(true);
    expect(output).toContain('title When I send a chat message');
    expect(output).toContain('participant Renderer');
    expect(output).toContain('participant Preload');
    expect(output).toContain('participant Main');
    expect(output).toContain('participant CLI');
    expect(output).toContain('Renderer->>Preload: agentChat.sendMessage');
    expect(output).toContain('Preload->>Main: registerMessageHandlers');
    expect(output).toContain('Note over Main: via agentChat∶sendMessage');
    expect(output).toContain('Main->>Main: sendMessageWithBridge');
    expect(output).toContain('Main-->>CLI: spawnClaude');
  });
});
