import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import React from 'react';

export type ZoomMode = 'fitWidth' | 'fitPage' | 'custom';

export const btnStyle: React.CSSProperties = {
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

export const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  borderColor: 'var(--interactive-accent)',
  backgroundColor: 'var(--interactive-accent)',
};

export const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

export const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '16px',
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
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

export async function readPdfBytes(filePath: string, content?: Uint8Array): Promise<Uint8Array> {
  if (content) return content;
  const result = await window.electronAPI.files.readBinaryFile(filePath);
  if (!result.success || !result.data) throw new Error(result.error ?? 'Failed to read PDF file');
  return new Uint8Array(result.data);
}

export function formatPdfLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('password')
    ? 'This PDF is password-protected and cannot be displayed.'
    : `Failed to load PDF: ${msg}`;
}

export function getPdfPageScale(
  zoomMode: ZoomMode,
  customScale: number,
  containerWidth: number,
  baseWidth: number,
): number {
  if (zoomMode === 'fitWidth') return containerWidth / baseWidth;
  if (zoomMode === 'fitPage') return Math.min(containerWidth / baseWidth, 1.5);
  return customScale;
}

export function setPdfCanvasSize(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
): void {
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}

export function isRenderingCancelledError(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: string }).name === 'RenderingCancelledException',
  );
}

export interface RenderPdfPageArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
  renderTaskRef: React.RefObject<ReturnType<PDFPageProxy['render']> | null>;
  cancelledRef: () => boolean;
}
export async function renderPdfPageCanvas({
  canvasRef,
  doc,
  pageNum,
  zoomMode,
  customScale,
  containerWidth,
  renderTaskRef,
  cancelledRef,
}: RenderPdfPageArgs): Promise<void> {
  const canvas = canvasRef.current;
  if (!canvas) return;
  try {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    const page = await doc.getPage(pageNum);
    if (cancelledRef()) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = getPdfPageScale(zoomMode, customScale, containerWidth, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    setPdfCanvasSize(canvas, viewport.width, viewport.height, dpr);
    const ctx = canvas.getContext('2d');
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

type PdfNavProps = {
  currentPage: number;
  numPages: number;
  goToPage: (p: number) => void;
  pageInputValue: string;
  setPageInputValue: (v: string) => void;
  handlePageInput: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};
function PdfPageNavButtons(p: PdfNavProps): React.ReactElement {
  return (
    <>
      <button
        onClick={() => p.goToPage(p.currentPage - 1)}
        disabled={p.currentPage <= 1}
        className="text-text-semantic-muted"
        style={btnStyle}
        title="Previous page"
      >
        Prev
      </button>
      <input
        type="text"
        className="text-text-semantic-primary"
        style={pageInputStyle}
        value={p.pageInputValue}
        onChange={(e) => p.setPageInputValue(e.target.value)}
        onKeyDown={p.handlePageInput}
        title="Go to page"
      />
      <span>/ {p.numPages}</span>
      <button
        onClick={() => p.goToPage(p.currentPage + 1)}
        disabled={p.currentPage >= p.numPages}
        className="text-text-semantic-muted"
        style={btnStyle}
        title="Next page"
      >
        Next
      </button>
    </>
  );
}

type PdfZoomProps = {
  zoomMode: ZoomMode;
  setZoomMode: (m: ZoomMode) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomLabel: string;
};
function PdfZoomButtons({
  zoomMode,
  setZoomMode,
  zoomIn,
  zoomOut,
  zoomLabel,
}: PdfZoomProps): React.ReactElement {
  return (
    <>
      <div
        style={{ width: 1, height: 16, backgroundColor: 'var(--border-semantic)', margin: '0 4px' }}
      />
      <button
        onClick={() => setZoomMode('fitWidth')}
        className={
          zoomMode === 'fitWidth' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'
        }
        style={zoomMode === 'fitWidth' ? activeBtnStyle : btnStyle}
      >
        Fit Width
      </button>
      <button
        onClick={() => setZoomMode('fitPage')}
        className={
          zoomMode === 'fitPage' ? 'text-text-semantic-on-accent' : 'text-text-semantic-muted'
        }
        style={zoomMode === 'fitPage' ? activeBtnStyle : btnStyle}
      >
        Fit Page
      </button>
      <button onClick={zoomOut} className="text-text-semantic-muted" style={btnStyle}>
        -
      </button>
      <button onClick={zoomIn} className="text-text-semantic-muted" style={btnStyle}>
        +
      </button>
      <span>{zoomLabel}</span>
    </>
  );
}

export type PdfToolbarProps = PdfNavProps & PdfZoomProps & { openExternal: () => void };
export function PdfToolbar(p: PdfToolbarProps): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={toolbarStyle}>
      <PdfPageNavButtons
        currentPage={p.currentPage}
        numPages={p.numPages}
        goToPage={p.goToPage}
        pageInputValue={p.pageInputValue}
        setPageInputValue={p.setPageInputValue}
        handlePageInput={p.handlePageInput}
      />
      <PdfZoomButtons
        zoomMode={p.zoomMode}
        setZoomMode={p.setZoomMode}
        zoomIn={p.zoomIn}
        zoomOut={p.zoomOut}
        zoomLabel={p.zoomLabel}
      />
      <div style={{ flex: 1 }} />
      <button
        onClick={p.openExternal}
        className="text-text-semantic-muted"
        style={btnStyle}
        title="Open in external application"
      >
        Open External
      </button>
    </div>
  );
}

type PdfErrorViewProps = { error: string; openExternal: () => void };
export function PdfErrorView({ error, openExternal }: PdfErrorViewProps): React.ReactElement {
  return (
    <div style={rootStyle}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '24px',
        }}
      >
        <span className="text-status-error" style={{ fontSize: '1.5rem' }}>
          !
        </span>
        <span className="text-status-error" style={{ fontSize: '0.875rem', textAlign: 'center' }}>
          {error}
        </span>
        <button onClick={openExternal} className="text-text-semantic-muted" style={btnStyle}>
          Open in external app
        </button>
      </div>
    </div>
  );
}
