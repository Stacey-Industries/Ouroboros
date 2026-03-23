import type { ZoomMode } from './ImageViewer.parts';

export function createResetViewerState() {
  return {
    naturalWidth: null,
    naturalHeight: null,
    zoomMode: 'fit' as ZoomMode,
    customZoom: 1,
    loadError: false,
    panOffset: { x: 0, y: 0 },
  };
}

export function toFileUrl(filePath: string): string {
  return filePath.startsWith('file://')
    ? filePath
    : `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`;
}

export function adjustCustomZoom(
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>,
  setCustomZoom: React.Dispatch<React.SetStateAction<number>>,
  factor: number,
): void {
  setZoomMode('custom');
  setCustomZoom((previous) => Math.min(Math.max(previous * factor, 0.05), 8));
}
