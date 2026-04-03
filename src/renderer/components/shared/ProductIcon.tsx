import React from 'react';

import { useProductIconThemes } from '../../hooks/useProductIconThemes';
import { useFileIconAsset, useIconFontFamily } from '../FileTree/useFileIconAsset';

const PRODUCT_ICON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  flexShrink: 0,
};

function decodeFontCharacter(value: string): string | null {
  const normalized = value.replace(/^\\/, '');
  const codePoint = Number.parseInt(normalized, 16);
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null;
}

export interface ProductIconProps {
  iconId: string;
  fallback: React.ReactElement;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

interface IconImageProps {
  objectUrl: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
}

function IconImage({ objectUrl, size, style, className }: IconImageProps): React.ReactElement {
  return (
    <img
      alt=""
      aria-hidden="true"
      src={objectUrl}
      className={className}
      style={{ ...PRODUCT_ICON_STYLE, width: `${size}px`, height: `${size}px`, objectFit: 'contain', ...style }}
    />
  );
}

interface IconGlyphProps {
  glyph: string;
  fontFamily: string;
  fontColor: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
}

function IconGlyph({ glyph, fontFamily, fontColor, size, style, className }: IconGlyphProps): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ ...PRODUCT_ICON_STYLE, width: `${size}px`, height: `${size}px`, fontSize: `${size}px`, fontFamily, color: fontColor, ...style }}
    >
      {glyph}
    </span>
  );
}

type IconDefinition = {
  iconPath?: string;
  fontCharacter?: string;
  fontId?: string;
  fontColor?: string;
};

function getDefinition(activeTheme: { iconDefinitions: Record<string, IconDefinition> } | null, iconId: string): IconDefinition | null {
  if (!activeTheme) return null;
  return activeTheme.iconDefinitions[iconId] ?? null;
}

function resolveGlyph(definition: IconDefinition | null): string | null {
  if (!definition || !definition.fontCharacter) return null;
  return decodeFontCharacter(definition.fontCharacter);
}

function useProductIconResolution(iconId: string) {
  const { activeTheme } = useProductIconThemes();
  const definition = getDefinition(activeTheme, iconId);
  const imageTheme = activeTheme && definition && definition.iconPath ? activeTheme : null;
  const glyphTheme = activeTheme && definition && definition.fontCharacter ? activeTheme : null;
  const { objectUrl } = useFileIconAsset(imageTheme, definition);
  const fontFamily = useIconFontFamily(glyphTheme, definition ? definition.fontId : undefined);
  const glyph = resolveGlyph(definition);
  const fontColor = definition && definition.fontColor ? definition.fontColor : 'currentColor';
  return { objectUrl, fontFamily, glyph, fontColor };
}

export function ProductIcon({ iconId, fallback, size = 14, style, className }: ProductIconProps): React.ReactElement {
  const { objectUrl, fontFamily, glyph, fontColor } = useProductIconResolution(iconId);
  if (objectUrl) {
    return <IconImage objectUrl={objectUrl} size={size} style={style} className={className} />;
  }
  if (glyph && fontFamily) {
    return <IconGlyph glyph={glyph} fontFamily={fontFamily} fontColor={fontColor} size={size} style={style} className={className} />;
  }
  return fallback;
}
