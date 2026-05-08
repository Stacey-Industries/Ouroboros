/**
 * flowMermaidExport.ts — Convert a FlowTrace to Mermaid sequenceDiagram text.
 *
 * Output is valid Mermaid sequenceDiagram syntax per the Mermaid spec:
 * https://mermaid.js.org/syntax/sequenceDiagram.html
 *
 * Edge kinds:
 *   sync     → solid arrow  ->>
 *   async    → dashed arrow -->>
 *   boundary → solid arrow  ->>  with a Note over the target explaining the channel
 *
 * Each FlowStep's layer becomes a participant; the symbol name is the message label.
 * Steps are visited in the order they appear in flow.steps (which is causal/topological
 * order from the trace engine). Edges define the arrows; steps without incoming edges
 * (entry point) are declared as "activate" notes.
 *
 * Wave 85 Phase 7 — clipboard-only export (renderer writes to clipboard, not file).
 */

import type { FlowEdge, FlowStep, FlowTrace, LayerKind } from '../../shared/types/flowTracer';

// ── Participant display names ─────────────────────────────────────────────────

const LAYER_LABELS: Record<LayerKind, string> = {
  user: 'User',
  renderer: 'Renderer',
  preload: 'Preload',
  main: 'Main',
  cli: 'CLI',
  filesystem: 'Filesystem',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sanitise a symbol name for use as a Mermaid message label (no colons or newlines). */
function sanitiseLabel(raw: string): string {
  return raw.replace(/:/g, '∶').replace(/\n/g, ' ').trim();
}

/** Collect the distinct layers referenced by the trace steps, in encounter order. */
function orderedParticipants(steps: FlowStep[]): LayerKind[] {
  const seen = new Set<LayerKind>();
  const ordered: LayerKind[] = [];
  for (const step of steps) {
    if (!seen.has(step.layer)) {
      seen.add(step.layer);
      ordered.push(step.layer);
    }
  }
  return ordered;
}

/** Build a map from step.id → FlowStep for quick lookup. */
function buildStepMap(steps: FlowStep[]): Map<string, FlowStep> {
  const map = new Map<string, FlowStep>();
  for (const step of steps) {
    map.set(step.id, step);
  }
  return map;
}

/** Render a single FlowEdge as one or more Mermaid sequenceDiagram lines. */
function renderEdge(edge: FlowEdge, stepMap: Map<string, FlowStep>): string[] {
  const from = stepMap.get(edge.from);
  const to = stepMap.get(edge.to);
  if (!from || !to) return [];

  const fromLabel = LAYER_LABELS[from.layer];
  const toLabel = LAYER_LABELS[to.layer];
  const messageLabel = sanitiseLabel(to.symbol);

  const lines: string[] = [];

  if (edge.kind === 'async') {
    lines.push(`    ${fromLabel}-->>${toLabel}: ${messageLabel}`);
  } else {
    // sync and boundary both use solid arrow
    lines.push(`    ${fromLabel}->>${toLabel}: ${messageLabel}`);
  }

  // For boundary edges, add a note showing the IPC channel
  if (edge.kind === 'boundary' && edge.boundaryChannel) {
    const channel = sanitiseLabel(edge.boundaryChannel);
    lines.push(`    Note over ${toLabel}: via ${channel}`);
  }

  return lines;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a FlowTrace to a valid Mermaid sequenceDiagram string.
 *
 * The returned string starts with "sequenceDiagram" and is ready to paste
 * into a Mermaid playground or embed in a Markdown code fence.
 */
export function flowTraceToMermaid(flow: FlowTrace): string {
  const participants = orderedParticipants(flow.steps);
  const stepMap = buildStepMap(flow.steps);
  const lines: string[] = [];

  lines.push('sequenceDiagram');
  lines.push(`    title ${sanitiseLabel(flow.title)}`);

  // Declare participants in encounter order so Mermaid renders them left-to-right
  for (const layer of participants) {
    // eslint-disable-next-line security/detect-object-injection -- layer is a LayerKind enum value, not user input
    lines.push(`    participant ${LAYER_LABELS[layer]}`);
  }

  // Render each edge as a message arrow
  for (const edge of flow.edges) {
    const edgeLines = renderEdge(edge, stepMap);
    lines.push(...edgeLines);
  }

  return lines.join('\n');
}
