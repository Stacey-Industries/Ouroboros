/**
 * AgentChatComposerHighlights.tsx — Highlight render helpers for the legacy
 * RichTextarea path. Extracted to keep AgentChatComposerInput.tsx under the
 * 300 code-line limit.
 */
import React from 'react';

import { isComposerMentionHighlight } from './AgentChatComposerInput';

const ACCENT = { color: 'var(--interactive-accent)' };

function isHighlightedToken(part: string): boolean {
  return isComposerMentionHighlight(part) || /^\/\S/.test(part);
}

export function renderHighlights(value: string): React.ReactNode {
  const parts = value.split(/((?<=^|\s)@\[[^\]]+\]|(?<=^|\s)(?:@|@@)[^\s@]+|(?<=^|\s)\/\S+)/g);
  return parts.map((part, i) => (
    <span key={i} style={isHighlightedToken(part) ? ACCENT : undefined}>
      {part}
    </span>
  ));
}
