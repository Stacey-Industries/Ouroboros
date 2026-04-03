import { describe, expect, it } from 'vitest';

import {
  createLoadingFile,
  isAudioFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
  looksLikeBinary,
  toLoadedFile,
} from './FileViewerManager.helpers';

describe('FileViewerManager helpers', () => {
  it('detects supported rich-preview file extensions', () => {
    expect(isImageFile('C:\\demo\\logo.png')).toBe(true);
    expect(isPdfFile('/docs/spec.pdf')).toBe(true);
    expect(isAudioFile('/music/track.mp3')).toBe(true);
    expect(isVideoFile('/videos/demo.webm')).toBe(true);

    expect(isAudioFile('/videos/demo.webm')).toBe(false);
    expect(isVideoFile('/music/track.mp3')).toBe(false);
  });

  it('classifies media files before binary fallback', () => {
    const loadedAudio = toLoadedFile(
      createLoadingFile('/music/track.mp3'),
      '/music/track.mp3',
      { success: true, content: '\x00\x01' },
    );
    const loadedVideo = toLoadedFile(
      createLoadingFile('/videos/demo.mp4'),
      '/videos/demo.mp4',
      { success: true, content: '\x00\x02' },
    );

    expect(loadedAudio.isAudio).toBe(true);
    expect(loadedAudio.isBinary).toBe(false);
    expect(loadedVideo.isVideo).toBe(true);
    expect(loadedVideo.isBinary).toBe(false);
  });

  it('still falls back to hex for unknown binary files', () => {
    const loaded = toLoadedFile(
      createLoadingFile('/archives/blob.bin'),
      '/archives/blob.bin',
      { success: true, content: '\x00\x01\x02' },
    );

    expect(looksLikeBinary('\x00\x01\x02')).toBe(true);
    expect(loaded.isBinary).toBe(true);
    expect(loaded.isAudio).toBe(false);
    expect(loaded.isVideo).toBe(false);
  });
});
