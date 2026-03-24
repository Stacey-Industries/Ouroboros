import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  formatPdfLoadError,
  PdfErrorView,
  PdfLoadingView,
  PdfToolbar,
  readPdfBytes,
  renderPdfPageCanvas,
  rootStyle,
  scrollContainerStyle,
  type ZoomMode,
} from './PdfViewer.parts';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export interface PdfViewerProps {
  filePath: string;
  content?: Uint8Array;
}

async function loadPdfDocument(filePath: string, content?: Uint8Array): Promise<PDFDocumentProxy> {
  const data = await readPdfBytes(filePath, content);
  return pdfjsLib.getDocument({ data }).promise;
}

function usePdfDocument({
  filePath,
  content,
  setPdfDoc,
  setNumPages,
  setCurrentPage,
  setPageInputValue,
  setLoading,
  setError,
}: {
  filePath: string;
  content?: Uint8Array;
  setPdfDoc: React.Dispatch<React.SetStateAction<PDFDocumentProxy | null>>;
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setPageInputValue: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): void {
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    void (async () => {
      try {
        const doc = await loadPdfDocument(filePath, content);
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setPageInputValue('1');
      } catch (err) {
        if (!cancelled) setError(formatPdfLoadError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    content,
    filePath,
    setCurrentPage,
    setError,
    setLoading,
    setNumPages,
    setPageInputValue,
    setPdfDoc,
  ]);
}

function usePdfContainerWidth(
  scrollRef: React.RefObject<HTMLDivElement | null>,
): React.RefObject<number> {
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

function usePdfPageRenderer({
  pageNum,
  doc,
  zoomMode,
  customScale,
  containerWidth,
}: {
  pageNum: number;
  doc: PDFDocumentProxy;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
}

function PdfPage({
  doc,
  pageNum,
  zoomMode,
  customScale,
  containerWidth,
}: PdfPageProps): React.ReactElement {
  const { canvasRef, containerRef } = usePdfPageRenderer({
    pageNum,
    doc,
    zoomMode,
    customScale,
    containerWidth,
  });
  return (
    <div
      ref={containerRef}
      data-page-num={pageNum}
      style={{
        backgroundColor: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        borderRadius: '2px',
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function usePdfZoom() {
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

function usePdfPageNav(numPages: number, scrollRef: React.RefObject<HTMLDivElement | null>) {
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

export function PdfViewer({ filePath, content }: PdfViewerProps): React.ReactElement {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = usePdfContainerWidth(scrollRef);
  const { zoomMode, setZoomMode, customScale, zoomIn, zoomOut, zoomLabel } = usePdfZoom();
  const {
    currentPage,
    setCurrentPage,
    pageInputValue,
    setPageInputValue,
    goToPage,
    handlePageInput,
  } = usePdfPageNav(numPages, scrollRef);
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
    setCurrentPage,
    setPageInputValue,
    setLoading,
    setError,
  });
  usePdfScrollTracking(scrollRef, numPages, setCurrentPage, setPageInputValue);
  const visiblePages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  if (loading) return <PdfLoadingView />;
  if (error) return <PdfErrorView error={error} openExternal={openExternal} />;
  return (
    <div style={rootStyle}>
      <PdfToolbar
        currentPage={currentPage}
        numPages={numPages}
        goToPage={goToPage}
        pageInputValue={pageInputValue}
        setPageInputValue={setPageInputValue}
        handlePageInput={handlePageInput}
        zoomMode={zoomMode}
        setZoomMode={setZoomMode}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        zoomLabel={zoomLabel}
        openExternal={openExternal}
      />
      <div ref={scrollRef} style={scrollContainerStyle}>
        {pdfDoc &&
          visiblePages.map((pageNum) => (
            <PdfPage
              key={pageNum}
              doc={pdfDoc}
              pageNum={pageNum}
              zoomMode={zoomMode}
              customScale={customScale}
              containerWidth={containerWidthRef.current}
            />
          ))}
      </div>
    </div>
  );
}
