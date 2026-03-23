import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

export interface PdfViewerProps {
  filePath: string;
  content?: Uint8Array;
}

type ZoomMode = 'fitWidth' | 'fitPage' | 'custom';

const rootStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--surface-base)' };
const toolbarStyle: React.CSSProperties = { flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderBottom: '1px solid var(--border-muted)', backgroundColor: 'var(--surface-panel)', userSelect: 'none', fontSize: '0.75rem', fontFamily: 'var(--font-ui)' };
const btnStyle: React.CSSProperties = { padding: '2px 8px', fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', fontWeight: 500, border: '1px solid var(--border-semantic)', borderRadius: '4px', backgroundColor: 'transparent', cursor: 'pointer', lineHeight: '1.5' };
const activeBtnStyle: React.CSSProperties = { ...btnStyle, borderColor: 'var(--interactive-accent)', backgroundColor: 'var(--interactive-accent)' };
const pageInputStyle: React.CSSProperties = { width: '48px', padding: '1px 4px', fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-semantic)', borderRadius: '4px', backgroundColor: 'var(--surface-base)', textAlign: 'center' };
const scrollContainerStyle: React.CSSProperties = { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px' };

async function readPdfBytes(filePath: string, content?: Uint8Array): Promise<Uint8Array> {
  if (content) return content;
  const result = await window.electronAPI.files.readBinaryFile(filePath);
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to read PDF file');
  return new Uint8Array(result.data);
}

async function loadPdfDocument(filePath: string, content?: Uint8Array): Promise<PDFDocumentProxy> {
  const data = await readPdfBytes(filePath, content);
  return pdfjsLib.getDocument({ data }).promise;
}

function formatPdfLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('password') ? 'This PDF is password-protected and cannot be displayed.' : `Failed to load PDF: ${msg}`;
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
    setError(null); setPdfDoc(null);
    void (async () => {
      try {
        const doc = await loadPdfDocument(filePath, content);
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc); setNumPages(doc.numPages); setCurrentPage(1); setPageInputValue('1');
      } catch (err) {
        if (!cancelled) setError(formatPdfLoadError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [content, filePath, setCurrentPage, setError, setLoading, setNumPages, setPageInputValue, setPdfDoc]);
}

function usePdfContainerWidth(scrollRef: React.RefObject<HTMLDivElement | null>): React.RefObject<number> {
  const containerWidthRef = useRef(800);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { for (const entry of entries) containerWidthRef.current = entry.contentRect.width - 32; });
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
        if (rect.top <= containerRect.top + containerRect.height / 3) closest = parseInt((child as HTMLElement).dataset.pageNum ?? '1', 10);
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
    const observer = new IntersectionObserver((entries) => { for (const entry of entries) setIsVisible(entry.isIntersecting); }, { rootMargin: '200px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    void renderPdfPageCanvas({ canvasRef, doc, pageNum, zoomMode, customScale, containerWidth, renderTaskRef, cancelledRef: () => cancelled });
    return () => { cancelled = true; renderTaskRef.current?.cancel(); renderTaskRef.current = null; };
  }, [containerWidth, customScale, doc, isVisible, pageNum, zoomMode]);
  return { canvasRef, containerRef };
}

function getPdfPageScale(zoomMode: ZoomMode, customScale: number, containerWidth: number, baseWidth: number): number {
  if (zoomMode === 'fitWidth') return containerWidth / baseWidth;
  if (zoomMode === 'fitPage') return Math.min(containerWidth / baseWidth, 1.5);
  return customScale;
}

function setPdfCanvasSize(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): void {
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}

function isRenderingCancelledError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'RenderingCancelledException');
}

async function renderPdfPageCanvas({
  canvasRef,
  doc,
  pageNum,
  zoomMode,
  customScale,
  containerWidth,
  renderTaskRef,
  cancelledRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
  renderTaskRef: React.RefObject<ReturnType<PDFPageProxy['render']> | null>;
  cancelledRef: () => boolean;
}): Promise<void> {
  const canvas = canvasRef.current;
  if (!canvas) return;
  try {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    const page = await doc.getPage(pageNum); if (cancelledRef()) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = getPdfPageScale(zoomMode, customScale, containerWidth, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1; setPdfCanvasSize(canvas, viewport.width, viewport.height, dpr); const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    await task.promise;
  } catch (err) {
    if (isRenderingCancelledError(err)) return;
    console.warn(`[PdfViewer] Failed to render page ${pageNum}:`, err);
  }
}

export function PdfViewer({ filePath, content }: PdfViewerProps): React.ReactElement {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fitWidth');
  const [customScale, setCustomScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageInputValue, setPageInputValue] = useState('1');
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = usePdfContainerWidth(scrollRef);
  usePdfDocument({ filePath, content, setPdfDoc, setNumPages, setCurrentPage, setPageInputValue, setLoading, setError });
  usePdfScrollTracking(scrollRef, numPages, setCurrentPage, setPageInputValue);
  const goToPage = useCallback((page: number) => { const clamped = Math.max(1, Math.min(page, numPages)); setCurrentPage(clamped); setPageInputValue(String(clamped)); scrollRef.current?.querySelector(`[data-page-num="${clamped}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [numPages]);
  const handlePageInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { const val = parseInt(pageInputValue, 10); if (!isNaN(val)) goToPage(val); } }, [goToPage, pageInputValue]);
  const zoomIn = useCallback(() => { setZoomMode('custom'); setCustomScale((s) => Math.min(s * 1.25, 5)); }, []);
  const zoomOut = useCallback(() => { setZoomMode('custom'); setCustomScale((s) => Math.max(s / 1.25, 0.25)); }, []);
  const openExternal = useCallback(() => { window.electronAPI.app.openExternal(`file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`); }, [filePath]);
  const visiblePages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const zoomLabel = zoomMode === 'fitWidth' ? 'Fit Width' : zoomMode === 'fitPage' ? 'Fit Page' : `${Math.round(customScale * 100)}%`;

  if (loading) return <div style={rootStyle}><div className="text-text-semantic-faint" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading PDF...</div></div>;
  if (error) return <div style={rootStyle}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px' }}><span className="text-status-error" style={{ fontSize: '1.5rem' }}>!</span><span className="text-status-error" style={{ fontSize: '0.875rem', textAlign: 'center' }}>{error}</span><button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle}>Open in external app</button></div></div>;
  return <div style={rootStyle}>
    <div className="text-text-semantic-muted" style={toolbarStyle}>
      <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="text-text-semantic-muted" style={btnStyle} title="Previous page">Prev</button>
      <input type="text" className="text-text-semantic-primary" style={pageInputStyle} value={pageInputValue} onChange={(e) => setPageInputValue(e.target.value)} onKeyDown={handlePageInput} title="Go to page" />
      <span>/ {numPages}</span>
      <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} className="text-text-semantic-muted" style={btnStyle} title="Next page">Next</button>
      <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-semantic)', margin: '0 4px' }} />
      <button onClick={() => setZoomMode('fitWidth')} className={zoomMode === 'fitWidth' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'} style={zoomMode === 'fitWidth' ? activeBtnStyle : btnStyle}>Fit Width</button>
      <button onClick={() => setZoomMode('fitPage')} className={zoomMode === 'fitPage' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'} style={zoomMode === 'fitPage' ? activeBtnStyle : btnStyle}>Fit Page</button>
      <button onClick={zoomOut} className="text-text-semantic-muted" style={btnStyle}>-</button>
      <button onClick={zoomIn} className="text-text-semantic-muted" style={btnStyle}>+</button>
      <span>{zoomLabel}</span>
      <div style={{ flex: 1 }} />
      <button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle} title="Open in external application">Open External</button>
    </div>
    <div ref={scrollRef} style={scrollContainerStyle}>{pdfDoc && visiblePages.map((pageNum) => <PdfPage key={pageNum} doc={pdfDoc} pageNum={pageNum} zoomMode={zoomMode} customScale={customScale} containerWidth={containerWidthRef.current} />)}</div>
  </div>;
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
}

function PdfPage({ doc, pageNum, zoomMode, customScale, containerWidth }: PdfPageProps): React.ReactElement {
  const { canvasRef, containerRef } = usePdfPageRenderer(pageNum, doc, zoomMode, customScale, containerWidth);
  return <div ref={containerRef} data-page-num={pageNum} style={{ backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', borderRadius: '2px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><canvas ref={canvasRef} /></div>;
}
