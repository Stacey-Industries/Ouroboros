import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { inferMimeType, useBinaryObjectUrl } from './binaryObjectUrl';

describe('inferMimeType', () => {
  it('returns a known mime type when the extension is recognized', () => {
    expect(inferMimeType('C:\\Web App\\Agent IDE\\public\\OUROBOROS.png', 'application/octet-stream')).toBe('image/png');
  });

  it('falls back when the extension is unknown', () => {
    expect(inferMimeType('C:\\tmp\\artifact.bin', 'application/octet-stream')).toBe('application/octet-stream');
  });
});

describe('useBinaryObjectUrl', () => {
  const createObjectURL = vi.fn(() => 'blob:test-url');
  const revokeObjectURL = vi.fn();
  const readBinaryFile = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates an object URL from bytes loaded over IPC', async () => {
    readBinaryFile.mockResolvedValue({ success: true, data: new Uint8Array([1, 2, 3]) });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    Object.assign(window, {
      electronAPI: {
        files: { readBinaryFile },
      },
    });

    const { result, unmount } = renderHook(() => useBinaryObjectUrl('C:\\tmp\\image.png', 'image/png'));

    await waitFor(() => expect(result.current.objectUrl).toBe('blob:test-url'));
    expect(result.current.error).toBeNull();
    expect(readBinaryFile).toHaveBeenCalledWith('C:\\tmp\\image.png');
    expect(createObjectURL).toHaveBeenCalledOnce();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
