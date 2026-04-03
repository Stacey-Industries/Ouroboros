import { useEffect, useState } from 'react';

import type {
  ExtensionIconDefinition,
  ExtensionIconThemeData,
  ExtensionProductIconThemeData,
} from '../../types/electron';

const objectUrlCache = new Map<string, string>();
const pendingObjectUrls = new Map<string, Promise<string>>();
const loadedFonts = new Set<string>();
const pendingFonts = new Map<string, Promise<void>>();

type IconFontThemeLike =
  | Pick<ExtensionIconThemeData, 'fonts'>
  | Pick<ExtensionProductIconThemeData, 'fonts'>;
type IconAssetThemeLike = IconFontThemeLike & { id?: string };

const MIME_MAP: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function inferMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return MIME_MAP[lower.slice(dot)] ?? 'application/octet-stream';
}

async function loadObjectUrl(filePath: string): Promise<string> {
  const cached = objectUrlCache.get(filePath);
  if (cached) return cached;

  const pending = pendingObjectUrls.get(filePath);
  if (pending) return pending;

  const promise = (async () => {
    const result = await window.electronAPI.files.readBinaryFile(filePath);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? `Failed to read icon asset: ${filePath}`);
    }
    const data = result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
    const objectUrl = URL.createObjectURL(new Blob([data], { type: inferMimeType(filePath) }));
    objectUrlCache.set(filePath, objectUrl);
    pendingObjectUrls.delete(filePath);
    return objectUrl;
  })();

  pendingObjectUrls.set(filePath, promise);
  return promise;
}

async function ensureFontLoaded(
  theme: IconFontThemeLike,
  fontId: string | undefined,
): Promise<string | null> {
  const font = theme.fonts.find((entry) => entry.id === fontId) ?? theme.fonts[0];
  if (!font) return null;
  if (loadedFonts.has(font.family)) return font.family;

  const pending = pendingFonts.get(font.family);
  if (pending) {
    await pending;
    return font.family;
  }

  const loadPromise = (async () => {
    try {
      const objectUrl = await loadObjectUrl(font.srcPath);
      const fontFace = new FontFace(
        font.family,
        `url(${objectUrl})`,
        {
          weight: font.weight,
          style: font.style,
        },
      );
      await fontFace.load();
      document.fonts.add(fontFace);
      loadedFonts.add(font.family);
    } finally {
      pendingFonts.delete(font.family);
    }
  })();

  pendingFonts.set(font.family, loadPromise);
  await loadPromise;
  return font.family;
}

export function useIconFontFamily(
  theme: IconFontThemeLike | null,
  fontId: string | undefined,
): string | null {
  const [fontFamily, setFontFamily] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setFontFamily(null);

    if (!theme) return;

    void (async () => {
      try {
        const family = await ensureFontLoaded(theme, fontId);
        if (active) setFontFamily(family);
      } catch {
        if (active) setFontFamily(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [fontId, theme]);

  return fontFamily;
}

export function useFileIconAsset(
  theme: IconAssetThemeLike | null,
  definition: ExtensionIconDefinition | null,
): { objectUrl: string | null; fontFamily: string | null } {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const fontFamily = useIconFontFamily(
    theme && definition?.fontCharacter ? theme : null,
    definition?.fontId,
  );

  useEffect(() => {
    let active = true;
    setObjectUrl(null);

    if (!theme || !definition) return;

    void (async () => {
      try {
        if (definition.iconPath) {
          const nextUrl = await loadObjectUrl(definition.iconPath);
          if (active) setObjectUrl(nextUrl);
        }
      } catch {
        if (active) {
          setObjectUrl(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [definition, theme]);

  return { objectUrl, fontFamily };
}
