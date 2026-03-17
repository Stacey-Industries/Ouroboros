/**
 * treeItemHelpers.ts — helper functions for FileTreeItem rendering.
 *
 * Extracted from FileTreeItem.tsx to reduce complexity.
 */

import type { GitFileStatus } from '../../types/electron';
import type { HeatLevel } from '../../hooks/useFileHeatMap';

/** Map git status to a CSS color variable. */
export function gitStatusColor(status: GitFileStatus | undefined): string | undefined {
  if (status === 'M') return 'var(--git-modified)';
  if (status === 'A' || status === 'R') return 'var(--git-added)';
  if (status === 'D') return 'var(--git-deleted)';
  if (status === '?') return 'var(--git-untracked)';
  return undefined;
}

/** Map git status to a display label. */
export function gitStatusLabel(status: GitFileStatus | undefined): string | undefined {
  if (status === 'M') return 'M';
  if (status === 'A') return 'A';
  if (status === 'D') return 'D';
  if (status === '?') return 'U';
  if (status === 'R') return 'R';
  return undefined;
}

/** Background tint color for each heat level */
export function heatTintColor(level: HeatLevel | undefined): string | undefined {
  if (level === 'warm') return 'rgba(59, 130, 246, 0.08)';
  if (level === 'hot') return 'rgba(249, 115, 22, 0.12)';
  if (level === 'fire') return 'rgba(239, 68, 68, 0.15)';
  return undefined;
}

/** Heat indicator dot color */
export function heatDotColor(level: HeatLevel | undefined): string | undefined {
  if (level === 'warm') return '#3b82f6';
  if (level === 'hot') return '#f97316';
  if (level === 'fire') return '#ef4444';
  return undefined;
}

/** Compute the background color for a tree item row */
export function rowBackground(opts: {
  isDragOver: boolean;
  isActive: boolean;
  isSelected: boolean;
  isFocused: boolean;
  heatTint: string | undefined;
}): string {
  if (opts.isDragOver) return 'rgba(var(--accent-rgb, 88, 166, 255), 0.15)';
  if (opts.isActive) return 'var(--accent-muted, rgba(var(--accent-rgb, 88, 166, 255), 0.12))';
  if (opts.isSelected) return 'rgba(var(--accent-rgb, 88, 166, 255), 0.08)';
  if (opts.isFocused) return 'var(--bg-tertiary)';
  return opts.heatTint ?? 'transparent';
}
