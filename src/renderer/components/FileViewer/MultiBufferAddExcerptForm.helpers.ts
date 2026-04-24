/**
 * MultiBufferAddExcerptForm helpers — pure logic, style constants, types.
 */
import React from 'react';

import type { BufferExcerpt } from '../../types/electron';

export interface ValidationErrors {
  filePath: string | null;
  startLine: string | null;
  endLine: string | null;
}

export interface FileSuggestion {
  path: string;
  relativePath: string;
}

export type DialogAPI = {
  showOpenDialog: (
    opts: Record<string, unknown>,
  ) => Promise<{ canceled: boolean; filePaths: string[] }>;
};

export interface FilePathKeyDownOptions {
  showSuggestions: boolean;
  suggestions: { path: string }[];
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  onChange: (v: string) => void;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.cache', '.next', '__pycache__', 'coverage',
]);

export const FORM_STYLE: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
  backgroundColor: 'var(--surface-panel)', borderBottom: '1px solid var(--border-semantic)',
  fontFamily: 'var(--font-ui)',
};
export const FORM_TITLE_STYLE: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 600 };
export const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.75rem', fontFamily: 'var(--font-ui)', marginBottom: '2px',
};
export const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--surface-base)', border: '1px solid var(--border-semantic)',
  borderRadius: '3px', padding: '4px 8px', fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)', outline: 'none', width: '100%',
};
export const INPUT_ERROR_STYLE: React.CSSProperties = {
  ...INPUT_STYLE, border: '1px solid var(--status-error)',
};
export const RANGE_FIELDS_STYLE: React.CSSProperties = { display: 'flex', gap: '8px' };
export const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex', gap: '8px', justifyContent: 'flex-end',
};
export const CANCEL_BUTTON_STYLE: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border-semantic)', borderRadius: '3px',
  padding: '4px 12px', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
export const SUBMIT_BUTTON_STYLE: React.CSSProperties = {
  background: 'var(--interactive-accent)', border: 'none', borderRadius: '3px',
  padding: '4px 12px', fontSize: '0.8125rem', cursor: 'pointer', fontWeight: 600,
  fontFamily: 'var(--font-ui)',
};
export const SUBMIT_BUTTON_DISABLED_STYLE: React.CSSProperties = {
  ...SUBMIT_BUTTON_STYLE, opacity: 0.5, cursor: 'default',
};
export const ERROR_TEXT_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', marginTop: '2px',
};
export const SUGGESTION_LIST_STYLE: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '160px', overflowY: 'auto',
  backgroundColor: 'var(--surface-base)', border: '1px solid var(--border-semantic)',
  borderTop: 'none', borderRadius: '0 0 3px 3px', zIndex: 100,
  boxShadow: '0 4px 8px rgba(0,0,0,0.25)',
};
export const SUGGESTION_ITEM_STYLE: React.CSSProperties = {
  padding: '4px 8px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
  cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
export const SUGGESTION_ITEM_ACTIVE_STYLE: React.CSSProperties = {
  ...SUGGESTION_ITEM_STYLE, backgroundColor: 'var(--interactive-accent)',
};

export function isInvalidPositiveLine(raw: string, parsed: number): boolean {
  return raw !== '' && (Number.isNaN(parsed) || parsed < 1);
}

export async function processSuggestionItem(opts: {
  item: { isDirectory: boolean; name: string; path: string };
  depth: number;
  projectRoot: string;
  suggestions: FileSuggestion[];
  walk: (dir: string, nextDepth: number) => Promise<void>;
}): Promise<void> {
  const { item, depth, projectRoot, suggestions, walk } = opts;
  if (suggestions.length >= 2000) return;
  if (item.isDirectory) {
    if (!SKIP_DIRS.has(item.name)) await walk(item.path, depth + 1);
    return;
  }
  suggestions.push({
    path: item.path,
    relativePath: item.path.replace(projectRoot, '').replace(/^[\\/]/, '').replace(/\\/g, '/'),
  });
}

export function validateForm(filePath: string, startLine: string, endLine: string): ValidationErrors {
  const errors: ValidationErrors = { filePath: null, startLine: null, endLine: null };
  if (!filePath.trim()) errors.filePath = 'File path is required';
  const start = parseInt(startLine, 10), end = parseInt(endLine, 10);
  if (isInvalidPositiveLine(startLine, start)) errors.startLine = 'Must be a positive number';
  if (isInvalidPositiveLine(endLine, end)) errors.endLine = 'Must be a positive number';
  if (!Number.isNaN(start) && !Number.isNaN(end) && start > end)
    errors.endLine = 'End line must be >= start line';
  return errors;
}

export function createExcerpt(
  filePath: string,
  startLine: string,
  endLine: string,
  label: string,
): BufferExcerpt | null {
  if (!filePath.trim()) return null;
  const start = parseInt(startLine, 10), end = parseInt(endLine, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) return null;
  return { filePath: filePath.trim(), startLine: start, endLine: end, label: label.trim() || undefined };
}

export function resolveDialogApi(): DialogAPI | null {
  if (typeof window === 'undefined' || !window.electronAPI || !('dialog' in window.electronAPI))
    return null;
  return (window.electronAPI as unknown as { dialog: DialogAPI }).dialog;
}
