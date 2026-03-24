/**
 * TerminalInstanceView.helpers.ts — Style constants and completion helper functions.
 *
 * Extracted from TerminalInstanceView.tsx to keep the view file under 300 lines.
 */

import type React from 'react';

import type { TerminalInstanceController } from './TerminalInstanceController';

export const ROOT_STYLE: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  flexDirection: 'column',
  backgroundColor: 'var(--term-bg, var(--surface-base))',
};

export const CONTAINER_STYLE: React.CSSProperties = {
  width: '100%',
  flex: '1 1 0',
  minHeight: 0,
  overflow: 'hidden',
};

export const TOOLBAR_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 6,
  right: 6,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

export function getRootStyle(isActive: boolean): React.CSSProperties {
  return { ...ROOT_STYLE, display: isActive ? 'flex' : 'none' };
}

export function applyCompletionSelection(
  controller: TerminalInstanceController,
  value: string,
): void {
  const type =
    controller.completions.state.completions.find((completion) => completion.value === value)
      ?.type ?? 'file';
  controller.completions.actions.applyCompletion(value, type);
}

export function navigateCompletion(controller: TerminalInstanceController, delta: number): void {
  const maxIndex = controller.completions.state.completions.length - 1;
  const nextIndex = Math.max(
    0,
    Math.min(controller.completions.state.completionIndex + delta, maxIndex),
  );
  controller.completions.state.setCompletionIndex(nextIndex);
  controller.completions.state.completionIndexRef.current = nextIndex;
}

export function dismissCompletion(controller: TerminalInstanceController): void {
  controller.completions.state.setCompletionVisible(false);
  controller.completions.state.completionVisibleRef.current = false;
  controller.historyHook.suggestionControls.isHistorySuggestionRef.current = false;
  controller.completions.state.setCompletions([]);
}
