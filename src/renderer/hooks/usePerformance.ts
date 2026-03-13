/**
 * usePerformance.ts — Collects and exposes real-time performance metrics.
 *
 * Listens to periodic `perf:metrics` events from main and also measures:
 *   - Renderer frame time (via requestAnimationFrame delta)
 *   - IPC round-trip latency (ping/pong)
 *
 * Returns a snapshot that updates every 5 s (aligned with main-process emission).
 */

import { useEffect, useRef, useState } from 'react';
import type { PerfMetrics } from '../types/electron';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface PerformanceSnapshot {
  /** Main-process memory heap in bytes */
  heapUsed: number;
  heapTotal: number;
  /** Resident set size (total) */
  rss: number;
  /** Average renderer frame time in ms (rolling 60-frame window) */
  frameTimeMs: number;
  /** Last measured IPC ping round-trip in ms, or null if unavailable */
  ipcLatencyMs: number | null;
  /** Timestamp of last update */
  updatedAt: number;
}

const INITIAL: PerformanceSnapshot = {
  heapUsed: 0,
  heapTotal: 0,
  rss: 0,
  frameTimeMs: 0,
  ipcLatencyMs: null,
  updatedAt: 0,
};

function computeAvgFrameTime(frameTimes: number[]): number {
  if (frameTimes.length === 0) return 0;
  return frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
}

async function measureIpcLatency(): Promise<number | null> {
  if (!hasElectronAPI()) return null;
  try {
    const t0 = performance.now();
    const result = await window.electronAPI.perf.ping();
    const t1 = performance.now();
    if (result.success) return Math.round(t1 - t0);
  } catch {
    // Ignore
  }
  return null;
}

function buildSnapshot(
  metrics: PerfMetrics,
  frameTimeMs: number,
  ipcLatencyMs: number | null,
): PerformanceSnapshot {
  return {
    heapUsed: metrics.memory.heapUsed,
    heapTotal: metrics.memory.heapTotal,
    rss: metrics.memory.rss,
    frameTimeMs,
    ipcLatencyMs,
    updatedAt: metrics.timestamp,
  };
}

export function usePerformance(): PerformanceSnapshot {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot>(INITIAL);

  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTsRef = useRef<number>(0);
  const rafHandleRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    function onFrame(ts: number): void {
      if (!alive) return;
      if (lastFrameTsRef.current > 0) {
        const delta = ts - lastFrameTsRef.current;
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift();
        }
      }
      lastFrameTsRef.current = ts;
      rafHandleRef.current = requestAnimationFrame(onFrame);
    }

    rafHandleRef.current = requestAnimationFrame(onFrame);
    return () => {
      alive = false;
      if (rafHandleRef.current !== null) cancelAnimationFrame(rafHandleRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const cleanup = window.electronAPI.perf.onMetrics(async (metrics: PerfMetrics) => {
      const avg = computeAvgFrameTime(frameTimesRef.current);
      const ipcLatencyMs = await measureIpcLatency();
      setSnapshot(buildSnapshot(metrics, Math.round(avg * 10) / 10, ipcLatencyMs));
    });

    return cleanup;
  }, []);

  return snapshot;
}
