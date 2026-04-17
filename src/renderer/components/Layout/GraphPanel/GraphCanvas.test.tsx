/**
 * GraphCanvas.test.tsx — smoke tests for the canvas-based graph renderer.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphCanvas } from './GraphCanvas';
import type { LaidOutEdge, LaidOutNode } from './GraphPanelTypes';
import { INITIAL_TRANSFORM } from './GraphPanelTypes';

// ── Canvas mock ───────────────────────────────────────────────────────────────

const mockCtx = {
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textBaseline: '',
  textAlign: '',
};

afterEach(cleanup);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );
  Object.values(mockCtx).forEach((v) => { if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockClear(); });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(id: string): LaidOutNode {
  return { id, type: 'function', name: id, filePath: `/${id}.ts`, x: 0, y: 0, width: 120, height: 28 };
}

const defaultProps = {
  nodes: [makeNode('a'), makeNode('b')],
  edges: [{ source: 'a', target: 'b', edgeType: 'calls' } as LaidOutEdge],
  transform: INITIAL_TRANSFORM,
  selectedId: null,
  width: 800,
  height: 600,
  onWheel: vi.fn(),
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onNodeClick: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GraphCanvas', () => {
  it('renders a <canvas> element', () => {
    const { container } = render(<GraphCanvas {...defaultProps} />);
    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('sets canvas width and height from props', () => {
    const { container } = render(<GraphCanvas {...defaultProps} width={400} height={300} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    expect(canvas.getAttribute('width')).toBe('400');
    expect(canvas.getAttribute('height')).toBe('300');
  });

  it('calls getContext("2d") to obtain the drawing context', () => {
    render(<GraphCanvas {...defaultProps} />);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
  });

  it('calls clearRect on each render', () => {
    render(<GraphCanvas {...defaultProps} />);
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });

  it('calls save/restore around the draw pass', () => {
    render(<GraphCanvas {...defaultProps} />);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('calls onWheel when wheel event fires on canvas', () => {
    const onWheel = vi.fn();
    const { container } = render(<GraphCanvas {...defaultProps} onWheel={onWheel} />);
    const canvas = container.querySelector('canvas')!;
    fireEvent.wheel(canvas);
    expect(onWheel).toHaveBeenCalled();
  });

  it('calls onPointerDown when pointer pressed on canvas', () => {
    const onPointerDown = vi.fn();
    const { container } = render(<GraphCanvas {...defaultProps} onPointerDown={onPointerDown} />);
    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas);
    expect(onPointerDown).toHaveBeenCalled();
  });

  it('renders with empty nodes without throwing', () => {
    expect(() =>
      render(<GraphCanvas {...defaultProps} nodes={[]} edges={[]} />),
    ).not.toThrow();
  });
});
