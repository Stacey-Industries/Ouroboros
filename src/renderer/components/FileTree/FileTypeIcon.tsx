/**
 * FileTypeIcon.tsx - Public API for file and folder type icons.
 *
 * Icon SVG components live in fileTypeIcons.tsx.
 * Extension/filename maps live in fileTypeData.ts.
 */

import React from 'react';

import { useFileIconThemes } from '../../hooks/useFileIconThemes';
import { useTheme } from '../../hooks/useTheme';
import type { ExtensionIconDefinition, ExtensionIconThemeData } from '../../types/electron';
import {
  resolveFileIconUri,
  resolveFolderIconUri,
  resolveIconThemeAppearance,
} from './fileIconThemeResolver';
import type { IconSpec } from './fileTypeData';
import { folderColor,resolveSpec } from './fileTypeData';
import {
  CfgIcon,
  CssIcon,
  DocIcon,
  FolderClosedSvg,
  FolderOpenSvg,
  GoIcon,
  HtmlIcon,
  ImgIcon,
  JsIcon,
  JsonIcon,
  LockIcon,
  MdIcon,
  PyIcon,
  RsIcon,
  ShIcon,
  TsIcon,
  YamlIcon,
} from './fileTypeIcons';
import { useFileIconAsset } from './useFileIconAsset';

type ColorIcon = React.ComponentType<{ color: string }>;

const FILE_ICONS: Partial<Record<IconSpec['kind'], ColorIcon>> = {
  ts: TsIcon,
  tsx: TsIcon,
  js: JsIcon,
  jsx: JsIcon,
  mjs: JsIcon,
  cjs: JsIcon,
  py: PyIcon,
  json: JsonIcon,
  md: MdIcon,
  css: CssIcon,
  scss: CssIcon,
  sass: CssIcon,
  less: CssIcon,
  styl: CssIcon,
  html: HtmlIcon,
  yaml: YamlIcon,
  rs: RsIcon,
  go: GoIcon,
  sh: ShIcon,
  img: ImgIcon,
  cfg: CfgIcon,
  docker: CfgIcon,
  lock: LockIcon,
};

const EXTERNAL_ICON_STYLE: React.CSSProperties = {
  width: '16px',
  height: '16px',
  flexShrink: 0,
  objectFit: 'contain',
};

const EXTERNAL_FONT_ICON_STYLE: React.CSSProperties = {
  width: '16px',
  height: '16px',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  lineHeight: 1,
};

function renderFileIcon(spec: IconSpec): React.ReactElement {
  const Icon = FILE_ICONS[spec.kind] ?? DocIcon;
  return <Icon color={spec.color} />;
}

function ExternalIcon({
  theme,
  definition,
  fallback,
}: {
  theme: ExtensionIconThemeData;
  definition: ExtensionIconDefinition;
  fallback: React.ReactElement;
}): React.ReactElement {
  const { objectUrl, fontFamily } = useFileIconAsset(theme, definition);

  if (objectUrl) {
    return <img alt="" aria-hidden="true" src={objectUrl} style={EXTERNAL_ICON_STYLE} />;
  }

  if (definition.fontCharacter && fontFamily) {
    const codePoint = parseInt(definition.fontCharacter.replace(/^\\/, ''), 16);
    if (Number.isFinite(codePoint)) {
      return (
        <span
          aria-hidden="true"
          style={{
            ...EXTERNAL_FONT_ICON_STYLE,
            fontFamily,
            color: definition.fontColor,
          }}
        >
          {String.fromCodePoint(codePoint)}
        </span>
      );
    }
  }

  return fallback;
}

export interface FileTypeIconProps {
  filename: string;
}

export function FileTypeIcon({
  filename,
}: FileTypeIconProps): React.ReactElement {
  const { activeTheme } = useFileIconThemes();
  const { theme } = useTheme();
  const appearance = resolveIconThemeAppearance(theme.id);
  const iconDefinition = activeTheme ? resolveFileIconUri(activeTheme, filename, appearance) : null;
  if (activeTheme && iconDefinition) {
    return (
      <ExternalIcon
        theme={activeTheme}
        definition={iconDefinition}
        fallback={renderFileIcon(resolveSpec(filename))}
      />
    );
  }
  return renderFileIcon(resolveSpec(filename));
}

export interface FolderTypeIconProps {
  name: string;
  open: boolean;
}

export function FolderTypeIcon({
  name,
  open,
}: FolderTypeIconProps): React.ReactElement {
  const { activeTheme } = useFileIconThemes();
  const { theme } = useTheme();
  const appearance = resolveIconThemeAppearance(theme.id);
  const iconDefinition = activeTheme
    ? resolveFolderIconUri({ theme: activeTheme, folderName: name, open, appearance })
    : null;
  if (activeTheme && iconDefinition) {
    return (
      <ExternalIcon
        theme={activeTheme}
        definition={iconDefinition}
        fallback={renderBuiltInFolder(name, open)}
      />
    );
  }
  return renderBuiltInFolder(name, open);
}

function renderBuiltInFolder(name: string, open: boolean): React.ReactElement {
  const color = folderColor(name, open);
  if (open) return <FolderOpenSvg color={color} />;
  return <FolderClosedSvg color={color} />;
}
