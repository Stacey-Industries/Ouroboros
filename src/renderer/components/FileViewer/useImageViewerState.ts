import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { ZoomMode } from './ImageViewer.parts';
import { adjustCustomZoom, createResetViewerState, toFileUrl } from './useImageViewerState.helpers';

export interface ImageViewerState {
  naturalWidth: number | null;
  naturalHeight: number | null;
  zoomMode: ZoomMode;
  customZoom: number;
  loadError: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  panOffset: { x: number; y: number };
  isPanning: boolean;
  fileUrl: string;
  handleLoad: () => void;
  handleError: () => void;
  handlePointerDown: (event: React.PointerEvent) => void;
  handlePointerMove: (event: React.PointerEvent) => void;
  handlePointerUp: () => void;
  handleWheel: (event: React.WheelEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFit: () => void;
  setActualSize: () => void;
}

interface PanStartState {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

function useImageViewerReset({
  filePath,
  setNaturalWidth,
  setNaturalHeight,
  setZoomMode,
  setCustomZoom,
  setLoadError,
  setPanOffset,
}: {
  filePath: string;
  setNaturalWidth: React.Dispatch<React.SetStateAction<number | null>>;
  setNaturalHeight: React.Dispatch<React.SetStateAction<number | null>>;
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>;
  setCustomZoom: React.Dispatch<React.SetStateAction<number>>;
  setLoadError: React.Dispatch<React.SetStateAction<boolean>>;
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}): void {
  useEffect(() => {
    const resetState = createResetViewerState();
    setNaturalWidth(resetState.naturalWidth); setNaturalHeight(resetState.naturalHeight);
    setZoomMode(resetState.zoomMode); setCustomZoom(resetState.customZoom);
    setLoadError(resetState.loadError); setPanOffset(resetState.panOffset);
  }, [filePath, setCustomZoom, setLoadError, setNaturalHeight, setNaturalWidth, setPanOffset, setZoomMode]);
}

function useImageViewerPan({
  panOffset,
  setPanOffset,
  setZoomMode,
  setCustomZoom,
}: {
  panOffset: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>;
  setCustomZoom: React.Dispatch<React.SetStateAction<number>>;
}): {
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  handlePointerDown: (event: React.PointerEvent) => void;
  handlePointerMove: (event: React.PointerEvent) => void;
  handlePointerUp: () => void;
  handleWheel: (event: React.WheelEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFit: () => void;
  setActualSize: () => void;
} {
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<PanStartState>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setIsPanning(true);
    panStartRef.current = { x: event.clientX, y: event.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
    event.preventDefault();
  }, [panOffset]);
  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    setPanOffset({ x: panStartRef.current.offsetX + dx, y: panStartRef.current.offsetY + dy });
  }, [isPanning, setPanOffset]);
  return { isPanning, setIsPanning, handlePointerDown, handlePointerMove, handlePointerUp: useCallback(() => setIsPanning(false), []), handleWheel: useCallback((event: React.WheelEvent) => { event.preventDefault(); adjustCustomZoom(setZoomMode, setCustomZoom, event.deltaY < 0 ? 1.1 : 1 / 1.1); }, [setCustomZoom, setZoomMode]), zoomIn: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1.25), [setCustomZoom, setZoomMode]), zoomOut: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1 / 1.25), [setCustomZoom, setZoomMode]), setFit: useCallback(() => { setZoomMode('fit'); setPanOffset({ x: 0, y: 0 }); }, [setPanOffset, setZoomMode]), setActualSize: useCallback(() => { setZoomMode('100'); setPanOffset({ x: 0, y: 0 }); }, [setPanOffset, setZoomMode]) };
}

export function useImageViewerState(filePath: string): ImageViewerState {
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useImageViewerReset({ filePath, setNaturalWidth, setNaturalHeight, setZoomMode, setCustomZoom, setLoadError, setPanOffset });
  const pan = useImageViewerPan({ panOffset, setPanOffset, setZoomMode, setCustomZoom });

  const handleLoad = useCallback(() => {
    const image = imgRef.current;
    if (!image) return;
    setNaturalWidth(image.naturalWidth);
    setNaturalHeight(image.naturalHeight);
    setLoadError(false);
  }, []);

  return { naturalWidth, naturalHeight, zoomMode, customZoom, loadError, imgRef, containerRef, panOffset, isPanning: pan.isPanning, fileUrl: toFileUrl(filePath), handleLoad, handleError: useCallback(() => setLoadError(true), []), handlePointerDown: pan.handlePointerDown, handlePointerMove: pan.handlePointerMove, handlePointerUp: pan.handlePointerUp, handleWheel: pan.handleWheel, zoomIn: pan.zoomIn, zoomOut: pan.zoomOut, setFit: pan.setFit, setActualSize: pan.setActualSize };
}
