import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';
import React from 'react';

import { usePdfPageRenderer, usePdfViewerState, usePdfZoom } from './PdfViewer.hooks';
import {
  PdfErrorView,
  PdfToolbar,
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

function PdfLoadingView(): React.ReactElement {
  return (
    <div style={rootStyle}>
      <div
        className="text-text-semantic-faint"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        Loading PDF...
      </div>
    </div>
  );
}

type PdfPageProps = {
  doc: PDFDocumentProxy;
  pageNum: number;
  zoomMode: ZoomMode;
  customScale: number;
  containerWidth: number;
};

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

type PdfScrollAreaProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  pdfDoc: PDFDocumentProxy | null;
  visiblePages: number[];
  zoom: ReturnType<typeof usePdfZoom>;
  containerWidthRef: React.RefObject<number>;
};
function PdfScrollArea({
  scrollRef,
  pdfDoc,
  visiblePages,
  zoom,
  containerWidthRef,
}: PdfScrollAreaProps): React.ReactElement {
  return (
    <div ref={scrollRef} style={scrollContainerStyle}>
      {pdfDoc &&
        visiblePages.map((pageNum) => (
          <PdfPage
            key={pageNum}
            doc={pdfDoc}
            pageNum={pageNum}
            zoomMode={zoom.zoomMode}
            customScale={zoom.customScale}
            containerWidth={containerWidthRef.current}
          />
        ))}
    </div>
  );
}

export function PdfViewer({ filePath, content }: PdfViewerProps): React.ReactElement {
  const {
    pdfDoc,
    error,
    loading,
    scrollRef,
    containerWidthRef,
    zoom,
    nav,
    openExternal,
    visiblePages,
  } = usePdfViewerState(filePath, content);
  if (loading) return <PdfLoadingView />;
  if (error) return <PdfErrorView error={error} openExternal={openExternal} />;
  return (
    <div style={rootStyle}>
      <PdfToolbar
        currentPage={nav.currentPage}
        numPages={visiblePages.length}
        goToPage={nav.goToPage}
        pageInputValue={nav.pageInputValue}
        setPageInputValue={nav.setPageInputValue}
        handlePageInput={nav.handlePageInput}
        zoomMode={zoom.zoomMode}
        setZoomMode={zoom.setZoomMode}
        zoomIn={zoom.zoomIn}
        zoomOut={zoom.zoomOut}
        zoomLabel={zoom.zoomLabel}
        openExternal={openExternal}
      />
      <PdfScrollArea
        scrollRef={scrollRef}
        pdfDoc={pdfDoc}
        visiblePages={visiblePages}
        zoom={zoom}
        containerWidthRef={containerWidthRef}
      />
    </div>
  );
}
