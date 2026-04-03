/**
 * useAgentEvents.fieldHelpers.ts — Shared field extraction utilities for
 * useAgentEvents dispatcher modules.
 *
 * Consolidates duplicated getStringField / getNumberField helpers that
 * previously appeared in taskDispatchers, conversationDispatchers,
 * and workspaceDispatchers.
 */

export function getStringField(
  data: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return undefined;
}

export function getNumberField(data: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'number') return val;
  }
  return 0;
}

export function summarizeSubToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const filePath = input.file_path ?? input.path;
  if (typeof filePath === 'string') return filePath;
  const desc = input.description;
  if (typeof desc === 'string') return desc;
  return '';
}
