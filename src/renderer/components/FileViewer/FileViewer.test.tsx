/**
 * @vitest-environment jsdom
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Monaco's clipboard module calls document.queryCommandSupported at load time,
// which jsdom doesn't implement.
if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}

// ContentRouter is the gateway to all Monaco-dependent modules, and PdfViewer
// loads pdfjs-dist (needs DOMMatrix).  Mock both to cut off heavy native deps —
// this test only exercises the image viewer and empty state.
vi.mock('./ContentRouter', () => ({ ContentRouter: () => null }));
vi.mock('./PdfViewer', () => ({ PdfViewer: () => null }));

import { FileViewer } from './FileViewer';

describe('FileViewer', () => {
  it('renders image previews when content is null', () => {
    const markup = renderToStaticMarkup(
      <FileViewer
        filePath="C:\\Web App\\Agent IDE\\public\\ouroboros.png"
        content={null}
        isLoading={false}
        error={null}
        isImage
      />,
    );

    // ImageViewer is async (loads file URL via hook) so renderToStaticMarkup
    // captures the initial loading state, not the final <img>.
    expect(markup).toContain('Loading image');
    expect(markup).not.toContain('Select a file to view');
  });

  it('renders chrome (not empty state) when filePath is set and content is null', () => {
    // Wave 82 (post-smoke): the toolbar must persist across brief content=null
    // windows that occur during edit-mode transitions; otherwise the toolbar
    // disappears and the user has to close+reopen the file. EmptyState only
    // applies when filePath is unset.
    const markup = renderToStaticMarkup(
      <FileViewer
        filePath="C:\\Web App\\Agent IDE\\README.md"
        content={null}
        isLoading={false}
        error={null}
      />,
    );
    expect(markup).not.toContain('Select a file to view');
  });

  it('renders the empty state when filePath is unset and content is null', () => {
    const markup = renderToStaticMarkup(
      <FileViewer filePath={null} content={null} isLoading={false} error={null} />,
    );
    expect(markup).toContain('Select a file to view');
  });
});
