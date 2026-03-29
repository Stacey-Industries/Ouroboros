/**
 * FileTypeIcon.tsx - Public API for file and folder type icons.
 *
 * Icon SVG components live in fileTypeIcons.tsx.
 * Extension/filename maps live in fileTypeData.ts.
 */

import React from 'react';

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

function renderFileIcon(spec: IconSpec): React.ReactElement<any> {
  const Icon = FILE_ICONS[spec.kind] ?? DocIcon;
  return <Icon color={spec.color} />;
}

export interface FileTypeIconProps {
  filename: string;
}

export function FileTypeIcon({
  filename,
}: FileTypeIconProps): React.ReactElement<any> {
  return renderFileIcon(resolveSpec(filename));
}

export interface FolderTypeIconProps {
  name: string;
  open: boolean;
}

export function FolderTypeIcon({
  name,
  open,
}: FolderTypeIconProps): React.ReactElement<any> {
  const color = folderColor(name, open);
  if (open) return <FolderOpenSvg color={color} />;
  return <FolderClosedSvg color={color} />;
}
