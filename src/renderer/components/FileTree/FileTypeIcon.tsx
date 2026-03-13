/**
 * FileTypeIcon.tsx — Public API for file and folder type icons.
 *
 * Icon SVG components live in fileTypeIcons.tsx.
 * Extension/filename maps live in fileTypeData.ts.
 */

import React from 'react';
import type { IconSpec } from './fileTypeData';
import { resolveSpec, folderColor } from './fileTypeData';
import {
  DocIcon, TsIcon, JsIcon, PyIcon, JsonIcon, MdIcon,
  CssIcon, HtmlIcon, YamlIcon, RsIcon, GoIcon, ShIcon,
  ImgIcon, CfgIcon, LockIcon, FolderOpenSvg, FolderClosedSvg,
} from './fileTypeIcons';

// ─── Icon renderer (dispatch by kind) ─────────────────────────────────────────

function renderCodeIcon(spec: IconSpec): React.ReactElement {
  const { kind, color } = spec;
  if (kind === 'ts' || kind === 'tsx') return <TsIcon color={color} />;
  if (kind === 'js' || kind === 'jsx' || kind === 'mjs' || kind === 'cjs') return <JsIcon color={color} />;
  if (kind === 'py') return <PyIcon color={color} />;
  if (kind === 'json') return <JsonIcon color={color} />;
  if (kind === 'md') return <MdIcon color={color} />;
  return <DocIcon color={color} />;
}

function renderOtherIcon(spec: IconSpec): React.ReactElement {
  const { kind, color } = spec;
  if (kind === 'css' || kind === 'scss' || kind === 'sass' || kind === 'less' || kind === 'styl') return <CssIcon color={color} />;
  if (kind === 'html') return <HtmlIcon color={color} />;
  if (kind === 'yaml') return <YamlIcon color={color} />;
  if (kind === 'rs') return <RsIcon color={color} />;
  if (kind === 'go') return <GoIcon color={color} />;
  if (kind === 'sh') return <ShIcon color={color} />;
  if (kind === 'img') return <ImgIcon color={color} />;
  if (kind === 'cfg' || kind === 'docker') return <CfgIcon color={color} />;
  if (kind === 'lock') return <LockIcon color={color} />;
  return <DocIcon color={color} />;
}

function renderFileIcon(spec: IconSpec): React.ReactElement {
  const codeKinds = new Set(['ts','tsx','js','jsx','mjs','cjs','py','json','md']);
  if (codeKinds.has(spec.kind)) return renderCodeIcon(spec);
  return renderOtherIcon(spec);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FileTypeIconProps {
  filename: string;
}

export function FileTypeIcon({ filename }: FileTypeIconProps): React.ReactElement {
  return renderFileIcon(resolveSpec(filename));
}

export interface FolderTypeIconProps {
  name: string;
  open: boolean;
}

export function FolderTypeIcon({ name, open }: FolderTypeIconProps): React.ReactElement {
  const color = folderColor(name, open);
  if (open) return <FolderOpenSvg color={color} />;
  return <FolderClosedSvg color={color} />;
}
