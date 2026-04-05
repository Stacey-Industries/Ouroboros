import { describe, expect, it } from 'vitest';

import { inferMimeType } from './binaryObjectUrl';

describe('inferMimeType', () => {
  it('returns a known mime type when the extension is recognized', () => {
    expect(
      inferMimeType('C:\\Web App\\Agent IDE\\public\\OUROBOROS.png', 'application/octet-stream'),
    ).toBe('image/png');
  });

  it('falls back when the extension is unknown', () => {
    expect(inferMimeType('C:\\tmp\\artifact.bin', 'application/octet-stream')).toBe(
      'application/octet-stream',
    );
  });

  it('handles Unix paths', () => {
    expect(inferMimeType('/home/user/photo.jpg', 'application/octet-stream')).toBe('image/jpeg');
  });

  it('handles paths with no extension', () => {
    expect(inferMimeType('/tmp/Makefile', 'application/octet-stream')).toBe(
      'application/octet-stream',
    );
  });
});

// Note: useBinaryObjectUrl is a React hook requiring a DOM environment (jsdom/happy-dom).
// Neither is installed. The hook is tested indirectly via the FileViewer integration.
