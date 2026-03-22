import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure the PDF.js worker from the installed package
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfViewerProps {
  filePath: string;
  content?: Uint8Array;
}

type ZoomMode = 'fitWidth' | 'fitPage' | 'custom';

interface PageEntry {
  pageNum: number;
  viewport: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
};

const btnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  lineHeight: '1.5',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  borderColor: 'var(--interactive-accent)',
  backgroundColor: 'var(--interactive-accent)',
};

const pageInputStyle: React.CSSProperties = {
  width: '48px',
  padding: '1px 4px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-mono)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'var(--surface-base)',
  textAlign: 'center',
};

const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '16px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PdfViewer({ filePath, content }: PdfViewerProps): React.ReactElement {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fitWidth');
  const [customScale, setCustomScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageInputValue, setPageInputValue] = useState('1');

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidthRef = useRef(800);
  const pageEntriesRef = useRef<PageEntry[]>([]);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    async function load() {
      try {
        let data: Uint8Array;
        if (content) {
          data = content;
        } else {
          const result = await window.electronAPI.files.readBinaryFile(filePath);
          if (!result.success || !result.data) {
            throw new Error(result.error ?? 'Failed to read PDF file');
          }
          data = new Uint8Array(result.data);
        }
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setPageInputValue('1');

        // Pre-fetch page viewports for sizing
        const entries: PageEntry[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1.0 });
          entries.push({ pageNum: i, viewport: { width: vp.width, height: vp.height } });
        }
        if (!cancelled) {
          pageEntriesRef.current = entries;
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('password')) {
            setError('This PDF is password-protected and cannot be displayed.');
          } else {
            setError(`Failed to load PDF: ${msg}`);
          }
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filePath, content]);

  // Measure container width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidthRef.current = entry.contentRect.width - 32; // padding
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track scroll position → current page
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || numPages === 0) return;
    function onScroll() {
      const container = scrollRef.current;
      if (!container) return;
      const scrollTop = container.scrollTop;
      const children = container.querySelectorAll('[data-page-num]');
      let closest = 1;
      for (const child of children) {
        const rect = (child as HTMLElement).getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top <= containerRect.top + containerRect.height / 3) {
          closest = parseInt((child as HTMLElement).dataset.pageNum ?? '1', 10);
        }
      }
      setCurrentPage(closest);
      setPageInputValue(String(closest));
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [numPages]);

  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, numPages));
    setCurrentPage(clamped);
    setPageInputValue(String(clamped));
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-page-num="${clamped}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages]);

  const handlePageInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt(pageInputValue, 10);
      if (!isNaN(val)) goToPage(val);
    }
  }, [pageInputValue, goToPage]);

  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomScale((s) => Math.min(s * 1.25, 5));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomScale((s) => Math.max(s / 1.25, 0.25));
  }, []);

  const openExternal = useCallback(() => {
    window.electronAPI.app.openExternal(`file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`);
  }, [filePath]);

  // Compute which pages are visible (lazy rendering)
  const visiblePages = useMemo(() => {
    if (numPages === 0) return [];
    // Render all pages (virtual rendering happens at the canvas level in PdfPage)
    const pages: number[] = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(i);
    }
    return pages;
  }, [numPages]);

  const zoomLabel = zoomMode === 'fitWidth' ? 'Fit Width'
    : zoomMode === 'fitPage' ? 'Fit Page'
    : `${Math.round(customScale * 100)}%`;

  if (loading) {
    return (
      <div style={rootStyle}>
        <div className="text-text-semantic-faint" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Loading PDF...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={rootStyle}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px' }}>
          <span className="text-status-error" style={{ fontSize: '1.5rem' }}>!</span>
          <span className="text-status-error" style={{ fontSize: '0.875rem', textAlign: 'center' }}>{error}</span>
          <button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle}>Open in external app</button>
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      {/* Toolbar */}
      <div className="text-text-semantic-muted" style={toolbarStyle}>
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className="text-text-semantic-muted" style={btnStyle} title="Previous page">
          Prev
        </button>
        <input
          type="text"
          className="text-text-semantic-primary"
          style={pageInputStyle}
          value={pageInputValue}
          onChange={(e) => setPageInputValue(e.target.value)}
          onKeyDown={handlePageInput}
          title="Go to page"
        />
        <span>/ {numPages}</span>
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} className="text-text-semantic-muted" style={btnStyle} title="Next page">
          Next
        </button>

        <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-semantic)', margin: '0 4px' }} />

        <button onClick={() => setZoomMode('fitWidth')} className={zoomMode === 'fitWidth' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'} style={zoomMode === 'fitWidth' ? activeBtnStyle : btnStyle}>
          Fit Width
        </button>
        <button onClick={() => setZoomMode('fitPage')} className={zoomMode === 'fitPage' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'} style={zoomMode === 'fitPage' ? activeBtnStyle : btnStyle}>
          Fit Page
        </button>
        <button onClick={zoomOut} className="text-text-semantic-muted" style={btnStyle}>-</button>
        <button onClick={zoomIn} className="text-text-semantic-muted" style={btnStyle}>+</button>
        <span>{zoomLabel}</span>

        <div style={{ flex: 1 }} />
        <button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle} title="Open in external application">
          Open External
        </button>
      </div>

      {/* Page container */}
      <div ref={scrollRef} style={scrollContainerStyle}>
        {pdfDoc && visiblePages.map((pageNum) => (
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

// ---------------------------------------------------------------------------
// Single PDF page renderer with lazy canvas rendering via IntersectionObserver
// ---------------------------------------------------------------------------

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
}

function PdfPage({ doc, pageNum, zoomMode, customScale, containerWidth }: PdfPageProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const renderedRef = useRef(false);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);

  // Intersection observer for lazy rendering
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { rootMargin: '200px 0px' } // pre-render 1 page above/below
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render the page onto canvas
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        // Cancel any in-flight render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await doc.getPage(pageNum);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        let scale: number;

        if (zoomMode === 'fitWidth') {
          scale = containerWidth / baseViewport.width;
        } else if (zoomMode === 'fitPage') {
          // Approximate fit-page: use container width as a proxy
          scale = Math.min(containerWidth / baseViewport.width, 1.5);
        } else {
          scale = customScale;
        }

        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        renderedRef.current = true;
      } catch (err) {
        // RenderingCancelledException is expected
        if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'RenderingCancelledException') {
          return;
        }
        console.warn(`[PdfViewer] Failed to render page ${pageNum}:`, err);
      }
    }
    renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [doc, pageNum, isVisible, zoomMode, customScale, containerWidth]);

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
