/**
 * useDiffReviewKeyboard.ts — Vim-style keyboard navigation for the diff review panel.
 *
 * Keys (only active when enabled and no text input is focused):
 *   a — accept the currently-focused hunk
 *   r — reject the currently-focused hunk
 *   n — move focus to next hunk
 *   p — move focus to previous hunk
 */

import { useEffect, useState } from 'react';

import type { ReviewHunk } from './types';

export interface UseDiffReviewKeyboardOptions {
  enabled: boolean;
  hunks: ReviewHunk[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export interface UseDiffReviewKeyboardResult {
  focusedHunkId: string | null;
  focusedIndex: number;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function useDiffReviewKeyboard({
  enabled,
  hunks,
  onAccept,
  onReject,
}: UseDiffReviewKeyboardOptions): UseDiffReviewKeyboardResult {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (isInputFocused()) return;
      const { key } = event;
      if (key !== 'a' && key !== 'r' && key !== 'n' && key !== 'p') return;

      event.preventDefault();

      const length = hunks.length;
      if (length === 0) return;

      setFocusedIndex((prev) => {
        const clamped = clampIndex(prev, length);

        if (key === 'n') return clampIndex(clamped + 1, length);
        if (key === 'p') return clampIndex(clamped - 1, length);

        const hunk = hunks[clamped];
        if (hunk && hunk.decision === 'pending') {
          if (key === 'a') onAccept(hunk.id);
          if (key === 'r') onReject(hunk.id);
        }
        return clamped;
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, hunks, onAccept, onReject]);

  const safeFocusedIndex = clampIndex(focusedIndex, hunks.length);
  const focusedHunkId = hunks.length > 0 ? (hunks[safeFocusedIndex]?.id ?? null) : null;

  return { focusedIndex: safeFocusedIndex, focusedHunkId };
}
