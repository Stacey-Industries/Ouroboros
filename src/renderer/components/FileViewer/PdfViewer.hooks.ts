import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';

import {
  formatPdfLoadError,
  readPdfBytes,
  renderPdfPageCanvas,
  type ZoomMode,
} from './PdfViewer.parts';

async function loadPdfDocument(filePath: string, content?: Uint8Array): Promise<PDFDocumentProxy> {
  const data = await readPdfBytes(filePath, content);
  return pdfjsLib.getDocument({ data }).promise;
}

interface UsePdfDocumentArgs {
  filePath: string;
  content?: Uint8Array;
  setPdfDoc: React.Dispatch<React.SetStateAction<PDFDocumentProxy | null>>;
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setPageInputValue: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

async function runPdfLoad(args: UsePdfDocumentArgs, isCancelled: () => boolean): Promise<void> {
  try {
    const doc = await loadPdfDocument(args.filePath, args.content);
    if (isCancelled()) {
      doc.destroy();
      return;
    }
    args.setPdfDoc(doc);
    args.setNumPages(doc.numPages);
    args.setCurrentPage(1);
    args.setPageInputValue('1');
  } catch (err) {
    if (!isCancelled()) args.setError(formatPdfLoadError(err));
  } finally {
    if (!isCancelled()) args.setLoading(false);
  }
}

function usePdfDocument(args: UsePdfDocumentArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;
  useEffect(() => {
    let cancelled = false;
    const a = argsRef.current;
    a.setLoading(true);
    a.setError(null);
    a.setPdfDoc(null);
    void runPdfLoad(a, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [args.filePath, args.content]);
}

function usePdfContainerWidth(
  scrollRef: React.RefObject<HTMLDivElement | null>,
): React.RefObject<number | null> {
  const containerWidthRef = useRef(800);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) containerWidthRef.current = entry.contentRect.width - 32;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);
  return containerWidthRef;
}

function usePdfScrollTracking(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  numPages: number,
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>,
  setPageInputValue: React.Dispatch<React.SetStateAction<string>>,
): void {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || numPages === 0) return;
    const onScroll = () => {
      const container = scrollRef.current;
      if (!container) return;
      const children = container.querySelectorAll('[data-page-num]');
      let closest = 1;
      for (const child of children) {
        const rect = (child as HTMLElement).getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + containerRect.height / 3)
          closest = parseInt((child as HTMLElement).dataset.pageNum ?? '1', 10);
      }
      setCurrentPage(closest);
      setPageInputValue(String(closest));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [numPages, scrollRef, setCurrentPage, setPageInputValue]);
}

interface PdfPageRendererArgs {
  pageNum: number;
  doc: PDFDocumentProxy;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
}

function useIntersectionVisible(elRef: React.RefObject<HTMLElement | null>): boolean {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [elRef]);
  return isVisible;
}

export function usePdfPageRenderer(args: PdfPageRendererArgs) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const isVisible = useIntersectionVisible(containerRef as React.RefObject<HTMLElement | null>);
  const { pageNum, doc, zoomMode, customScale, containerWidth } = args;
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    void renderPdfPageCanvas({
      canvasRef,
      doc,
      pageNum,
      zoomMode,
      customScale,
      containerWidth,
      renderTaskRef,
      cancelledRef: () => cancelled,
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [containerWidth, customScale, doc, isVisible, pageNum, zoomMode]);
  return { canvasRef, containerRef };
}

export function usePdfZoom() {
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fitWidth');
  const [customScale, setCustomScale] = useState(1);
  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomScale((s) => Math.min(s * 1.25, 5));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomScale((s) => Math.max(s / 1.25, 0.25));
  }, []);
  const zoomLabel =
    zoomMode === 'fitWidth'
      ? 'Fit Width'
      : zoomMode === 'fitPage'
        ? 'Fit Page'
        : `${Math.round(customScale * 100)}%`;
  return { zoomMode, setZoomMode, customScale, zoomIn, zoomOut, zoomLabel };
}

export function usePdfPageNav(numPages: number, scrollRef: React.RefObject<HTMLDivElement | null>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputValue, setPageInputValue] = useState('1');
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, numPages));
      setCurrentPage(clamped);
      setPageInputValue(String(clamped));
      scrollRef.current
        ?.querySelector(`[data-page-num="${clamped}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [numPages, scrollRef],
  );
  const handlePageInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const val = parseInt(pageInputValue, 10);
        if (!isNaN(val)) goToPage(val);
      }
    },
    [goToPage, pageInputValue],
  );
  return {
    currentPage,
    setCurrentPage,
    pageInputValue,
    setPageInputValue,
    goToPage,
    handlePageInput,
  };
}

export function usePdfViewerState(filePath: string, content?: Uint8Array) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = usePdfContainerWidth(scrollRef);
  const zoom = usePdfZoom();
  const nav = usePdfPageNav(numPages, scrollRef);
  const openExternal = useCallback(() => {
    window.electronAPI.app.openExternal(
      `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`,
    );
  }, [filePath]);
  usePdfDocument({
    filePath,
    content,
    setPdfDoc,
    setNumPages,
    setCurrentPage: nav.setCurrentPage,
    setPageInputValue: nav.setPageInputValue,
    setLoading,
    setError,
  });
  usePdfScrollTracking(scrollRef, numPages, nav.setCurrentPage, nav.setPageInputValue);
  const visiblePages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  return {
    pdfDoc,
    error,
    loading,
    scrollRef,
    containerWidthRef,
    zoom,
    nav,
    openExternal,
    visiblePages,
  };
}
