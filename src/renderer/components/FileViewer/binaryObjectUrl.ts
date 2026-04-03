import { useEffect, useState } from 'react';

const MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function fileExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  return dotIndex >= 0 ? normalized.slice(dotIndex) : '';
}

export function inferMimeType(filePath: string, fallback: string): string {
  return MIME_TYPES[fileExtension(filePath)] ?? fallback;
}

async function readBinaryObjectUrl(filePath: string, mimeType: string): Promise<string> {
  const result = await window.electronAPI.files.readBinaryFile(filePath);
  if (!result.success || !result.data) {
    throw new Error(result.error ?? `Failed to read binary file: ${filePath}`);
  }
  const data = result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
  return URL.createObjectURL(new Blob([data], { type: mimeType }));
}

export function useBinaryObjectUrl(
  filePath: string,
  mimeType: string,
): { objectUrl: string | null; error: string | null } {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let nextObjectUrl: string | null = null;

    setObjectUrl(null);
    setError(null);

    void (async () => {
      try {
        nextObjectUrl = await readBinaryObjectUrl(filePath, mimeType);
        if (!active) {
          if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        setObjectUrl(nextObjectUrl);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [filePath, mimeType]);

  return { objectUrl, error };
}
