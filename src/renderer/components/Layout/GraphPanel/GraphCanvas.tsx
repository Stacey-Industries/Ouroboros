/**
 * GraphCanvas.tsx — canvas-based graph renderer with viewport culling + LOD.
 *
 * Receives laid-out nodes/edges and a ViewportTransform; draws them via
 * Canvas2D. Edges are hidden at scale < 0.3; labels at scale < 0.5.
 * Colors are resolved from CSS custom properties at draw time.
 */

import React, { useCallback, useEffect, useRef } from 'react';

import type { CanvasColors, LaidOutEdge, LaidOutNode, ViewportTransform } from './GraphPanelTypes';
import { EDGE_VISIBILITY_THRESHOLD, LABEL_VISIBILITY_THRESHOLD } from './GraphPanelTypes';

// ── Color resolution ──────────────────────────────────────────────────────────

export function resolveColors(): CanvasColors {
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim() || v;
  return {
    nodeFill: get('--surface-panel'),
    nodeFillFunction: get('--interactive-accent'),
    nodeFillClass: get('--status-info'),
    nodeFillSelected: get('--interactive-accent-hover'),
    nodeStroke: get('--border-semantic'),
    nodeStrokeSelected: get('--interactive-accent'),
    edgeStroke: get('--border-subtle'),
    labelFill: get('--text-secondary'),
    background: get('--surface-base'),
  };
}

// ── Visibility helpers ────────────────────────────────────────────────────────

interface CanvasSize { w: number; h: number }

function isNodeVisible(node: LaidOutNode, t: ViewportTransform, size: CanvasSize): boolean {
  const sx = node.x * t.scale + t.x;
  const sy = node.y * t.scale + t.y;
  return sx + node.width * t.scale > 0 && sy + node.height * t.scale > 0
    && sx < size.w && sy < size.h;
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

interface NodeDrawOpts { ctx: CanvasRenderingContext2D; node: LaidOutNode; selected: boolean; scale: number; colors: CanvasColors }
interface EdgeDrawOpts { ctx: CanvasRenderingContext2D; edge: LaidOutEdge; nodeMap: Map<string, LaidOutNode>; scale: number; colors: CanvasColors }

function fillForNode(node: LaidOutNode, selected: boolean, colors: CanvasColors): string {
  if (selected) return colors.nodeFillSelected;
  if (node.type === 'function') return colors.nodeFillFunction;
  if (node.type === 'class' || node.type === 'interface') return colors.nodeFillClass;
  return colors.nodeFill;
}

function drawNodeLabel(ctx: CanvasRenderingContext2D, node: LaidOutNode, scale: number, colors: CanvasColors): void {
  ctx.fillStyle = colors.labelFill;
  ctx.font = `${11 / scale}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const label = node.name.length > 18 ? `${node.name.slice(0, 16)}…` : node.name;
  ctx.fillText(label, node.x + 6 / scale, node.y + node.height / 2);
}

function drawNode({ ctx, node, selected, scale, colors }: NodeDrawOpts): void {
  ctx.fillStyle = fillForNode(node, selected, colors);
  ctx.strokeStyle = selected ? colors.nodeStrokeSelected : colors.nodeStroke;
  ctx.lineWidth = selected ? 2 / scale : 1 / scale;
  ctx.beginPath();
  ctx.roundRect(node.x, node.y, node.width, node.height, 4 / scale);
  ctx.fill();
  ctx.stroke();
  if (scale >= LABEL_VISIBILITY_THRESHOLD) drawNodeLabel(ctx, node, scale, colors);
}

function drawEdge({ ctx, edge, nodeMap, scale, colors }: EdgeDrawOpts): void {
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return;
  ctx.strokeStyle = colors.edgeStroke;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  ctx.moveTo(src.x + src.width / 2, src.y + src.height);
  ctx.lineTo(tgt.x + tgt.width / 2, tgt.y);
  ctx.stroke();
}

// ── Main draw function ────────────────────────────────────────────────────────

interface DrawArgs { ctx: CanvasRenderingContext2D; nodes: LaidOutNode[]; edges: LaidOutEdge[]; transform: ViewportTransform; selectedId: string | null; colors: CanvasColors; size: CanvasSize }

export function drawGraph({ ctx, nodes, edges, transform, selectedId, colors, size }: DrawArgs): void {
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  if (transform.scale >= EDGE_VISIBILITY_THRESHOLD) {
    for (const edge of edges) drawEdge({ ctx, edge, nodeMap, scale: transform.scale, colors });
  }
  for (const node of nodes) {
    if (isNodeVisible(node, transform, size)) {
      drawNode({ ctx, node, selected: node.id === selectedId, scale: transform.scale, colors });
    }
  }
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface GraphCanvasProps {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  transform: ViewportTransform;
  selectedId: string | null;
  width: number;
  height: number;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onNodeClick: (id: string | null) => void;
}

function useCanvasDraw(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  args: Omit<DrawArgs, 'ctx'>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawGraph({ ctx, ...args });
  });
}

export function GraphCanvas({
  nodes, edges, transform, selectedId, width, height,
  onWheel, onPointerDown, onPointerMove, onPointerUp, onNodeClick,
}: GraphCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef<CanvasColors | null>(null);
  if (!colorsRef.current) colorsRef.current = resolveColors();

  useCanvasDraw(canvasRef, {
    nodes, edges, transform, selectedId, colors: colorsRef.current, size: { w: width, h: height },
  });

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left - transform.x) / transform.scale;
    const cy = (e.clientY - rect.top - transform.y) / transform.scale;
    const hit = nodes.find((n) => cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height);
    onNodeClick(hit ? hit.id : null);
  }, [nodes, transform, onNodeClick]);

  return (
    <canvas ref={canvasRef} width={width} height={height}
      style={{ display: 'block', cursor: 'grab', touchAction: 'none' }}
      onWheel={onWheel} onPointerDown={onPointerDown}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onClick={handleClick} aria-label="Codebase graph canvas" role="img"
    />
  );
}
