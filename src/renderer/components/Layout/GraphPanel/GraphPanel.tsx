/**
 * GraphPanel.tsx — top-level graph explorer panel.
 *
 * Owns: selected-node state, filter string, container size measurement,
 * graph data fetch via window.electronAPI.graph.getArchitecture(), layout,
 * and viewport. Renders GraphPanelHeader + GraphCanvas, or GraphPanelEmpty
 * while loading / on error.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { RawGraphEdge, RawGraphNode } from '../../../types/electron-graph';
import { GraphCanvas } from './GraphCanvas';
import { GraphPanelEmpty } from './GraphPanelEmpty';
import { GraphPanelHeader } from './GraphPanelHeader';
import { MAX_SCALE, MIN_SCALE } from './GraphPanelTypes';
import { useGraphLayout } from './useGraphLayout';
import { useGraphViewport } from './useGraphViewport';

// ── Data fetching ─────────────────────────────────────────────────────────────

interface GraphData { nodes: RawGraphNode[]; edges: RawGraphEdge[] }
type FetchState = { status: 'loading' } | { status: 'ready'; data: GraphData } | { status: 'empty' } | { status: 'error' };

async function fetchGraphData(): Promise<GraphData | null> {
  const arch = await window.electronAPI.graph.getArchitecture();
  if (!arch.success || !arch.architecture) return null;
  const search = await window.electronAPI.graph.searchGraph('', 2000);
  if (!search.success || !search.results?.length) return null;
  return { nodes: search.results.map((r) => r.node), edges: [] };
}

function useGraphData(): FetchState {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetchGraphData()
      .then((data) => {
        if (!cancelled) setState(data ? { status: 'ready', data } : { status: 'empty' });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}

// ── Container size measurement ────────────────────────────────────────────────

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// ── Zoom via canvas WheelEvent dispatch ───────────────────────────────────────

function dispatchZoom(container: HTMLDivElement | null, deltaY: number): void {
  const canvas = container?.querySelector('canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new WheelEvent('wheel', {
    deltaY, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    bubbles: true, cancelable: true,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GraphPanel(): React.ReactElement {
  const fetchState = useGraphData();
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { w, h } = useContainerSize(containerRef);

  const rawNodes = fetchState.status === 'ready'
    ? fetchState.data.nodes.filter((n) => filter === '' || n.name.toLowerCase().includes(filter.toLowerCase()))
    : [];
  const rawEdges = fetchState.status === 'ready' ? fetchState.data.edges : [];

  const { nodes, edges } = useGraphLayout(rawNodes, rawEdges);
  const { transform, onWheel, onPointerDown, onPointerMove, onPointerUp, resetView } = useGraphViewport();

  const handleZoomIn = useCallback(() => dispatchZoom(containerRef.current, -120), []);
  const handleZoomOut = useCallback(() => dispatchZoom(containerRef.current, 120), []);

  const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale));
  const isLoading = fetchState.status === 'loading';
  const isEmpty = fetchState.status === 'empty' || fetchState.status === 'error';

  return (
    <div className="flex h-full w-full flex-col bg-surface-raised">
      <GraphPanelHeader scale={clampedScale} filter={filter} onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut} onResetView={resetView} onFilterChange={setFilter} />
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {(isLoading || isEmpty) ? <GraphPanelEmpty loading={isLoading} /> : (
          <GraphCanvas nodes={nodes} edges={edges} transform={transform} selectedId={selectedId}
            width={w} height={h} onWheel={onWheel} onPointerDown={onPointerDown}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp} onNodeClick={setSelectedId} />
        )}
      </div>
    </div>
  );
}
