import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

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

    expect(markup).toContain('<img');
    expect(markup).not.toContain('Select a file to view');
  });

  it('renders the empty state when there is no special viewer and content is null', () => {
    const markup = renderToStaticMarkup(
      <FileViewer
        filePath="C:\\Web App\\Agent IDE\\README.md"
        content={null}
        isLoading={false}
        error={null}
      />,
    );

    expect(markup).toContain('Select a file to view');
  });
});
