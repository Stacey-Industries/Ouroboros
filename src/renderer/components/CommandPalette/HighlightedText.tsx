import React, { memo } from 'react';

/** Highlight text using individual character indices (for CommandItem). */
export interface CharHighlightProps {
  text: string;
  matchIndices: number[];
}

export const CharHighlight = memo(function CharHighlight({
  text,
  matchIndices,
}: CharHighlightProps): React.ReactElement {
  if (matchIndices.length === 0) return <span>{text}</span>;

  const indexSet = new Set(matchIndices);
  return <>{buildSpans(text, (i) => indexSet.has(i))}</>;
});

/** Highlight text using range pairs (for FilePicker/SymbolSearch). */
export interface RangeHighlightProps {
  text: string;
  indices: ReadonlyArray<readonly [number, number]>;
}

export function RangeHighlight({ text, indices }: RangeHighlightProps): React.ReactElement {
  if (indices.length === 0) return <>{text}</>;

  const indexSet = new Set<number>();
  for (const [start, end] of indices) {
    for (let i = start; i <= end; i++) {
      indexSet.add(i);
    }
  }

  return <>{buildSpans(text, (i) => indexSet.has(i))}</>;
}

const markStyle: React.CSSProperties = {
  background: 'transparent',
  fontWeight: 600,
};

function buildSpans(text: string, isHighlighted: (i: number) => boolean): React.ReactElement[] {
  const parts: React.ReactElement[] = [];
  let i = 0;

  while (i < text.length) {
    const matched = isHighlighted(i);
    let end = i;
    while (end < text.length && isHighlighted(end) === matched) end++;

    if (matched) {
      parts.push(<mark key={i} className="text-interactive-accent" style={markStyle}>{text.slice(i, end)}</mark>);
    } else {
      parts.push(<span key={i}>{text.slice(i, end)}</span>);
    }
    i = end;
  }

  return parts;
}
