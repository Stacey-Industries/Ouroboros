/**
 * Shared types for code view sub-components (gutters, code content).
 */

export type CodeRow =
  | { type: 'line'; index: number }
  | { type: 'fold-placeholder'; startLine: number; count: number };
