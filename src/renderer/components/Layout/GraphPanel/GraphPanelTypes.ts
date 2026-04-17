/**
 * GraphPanelTypes.ts — shared types for the GraphPanel component tree.
 *
 * Imports raw node/edge shapes from the IPC type layer; adds
 * layout-computed and viewport types used only in the renderer.
 */

import type { GraphNodeType, RawGraphEdge, RawGraphNode } from '../../../types/electron-graph';

// Re-export raw types so consumers only import from this file.
export type { GraphNodeType, RawGraphEdge, RawGraphNode };

// ── Layout-computed types ─────────────────────────────────────────────────────

/** A graph node with a computed 2D position from the layout algorithm. */
export interface LaidOutNode {
  id: string;
  type: GraphNodeType;
  name: string;
  filePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A graph edge referencing laid-out node IDs. */
export interface LaidOutEdge {
  source: string;
  target: string;
  edgeType: RawGraphEdge['type'];
}

// ── Viewport ──────────────────────────────────────────────────────────────────

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export const INITIAL_TRANSFORM: ViewportTransform = { x: 0, y: 0, scale: 1 };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3.0;

/** Below this scale edges are culled for performance. */
export const EDGE_VISIBILITY_THRESHOLD = 0.3;

/** Below this scale node labels are hidden. */
export const LABEL_VISIBILITY_THRESHOLD = 0.5;

// ── Node rendering constants ──────────────────────────────────────────────────

export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 28;
export const LAYER_GAP_Y = 80;
export const SIBLING_GAP_X = 16;

// ── Canvas color keys (resolved at draw time from CSS vars) ──────────────────

export interface CanvasColors {
  nodeFill: string;
  nodeFillFunction: string;
  nodeFillClass: string;
  nodeFillSelected: string;
  nodeStroke: string;
  nodeStrokeSelected: string;
  edgeStroke: string;
  labelFill: string;
  background: string;
}
