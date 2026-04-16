/**
 * FileRefLinker.tsx — Splits a plain-text string into alternating text/badge runs.
 *
 * Uses extractFileRefs from FileRefResolver to locate file references, then
 * wraps each match in a FileRefBadge and leaves the surrounding text as plain
 * string nodes. Returns an array suitable for inlining inside rendered markdown.
 */
import React from 'react';

import { extractFileRefs } from '../../../shared/FileRefResolver';
import { FileRefBadge } from './FileRefBadge';

/**
 * Scan `text` for file references and return a mixed array of string and
 * React element nodes. Plain runs are left as strings; each matched token
 * becomes a `<FileRefBadge>` wrapping its raw text.
 *
 * Returns an empty array when `text` is empty.
 */
export function linkifyFileRefs(
  text: string,
  projectRoot?: string,
): Array<string | React.ReactElement> {
  if (!text) return [];

  const refs = extractFileRefs(text);
  if (refs.length === 0) return [text];

  const nodes: Array<string | React.ReactElement> = [];
  let cursor = 0;

  for (const ref of refs) {
    if (ref.start > cursor) {
      nodes.push(text.slice(cursor, ref.start));
    }
    nodes.push(
      <FileRefBadge key={`${ref.start}-${ref.end}`} fileRef={ref} projectRoot={projectRoot}>
        {ref.raw}
      </FileRefBadge>,
    );
    cursor = ref.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}
