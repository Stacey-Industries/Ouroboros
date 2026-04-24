/**
 * codexAppServerEventMapperShared.ts — Pure utility helpers for the event mapper.
 *
 * No CodexEmitCtx dependency. Safe to import from any mapper sub-module.
 */

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function extractItem(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  return asRecord(params?.item);
}

export function extractThreadId(params: Record<string, unknown> | undefined): string | undefined {
  return asString(params?.threadId);
}

export function extractItemId(
  item: Record<string, unknown> | null,
  params?: Record<string, unknown>,
): string {
  return (
    asString(item?.id) ||
    asString(params?.itemId) ||
    asString(params?.callId) ||
    asString(params?.id) ||
    'unknown-item'
  );
}

export function extractItemType(item: Record<string, unknown> | null): string | undefined {
  return asString(item?.type);
}

export function summarizeCommand(command: string | undefined): string | undefined {
  if (!command) return undefined;
  return command.length > 200 ? `${command.slice(0, 197)}...` : command;
}

export function mapFileChangeKindToTool(kind: string | undefined): 'Edit' | 'Write' {
  return kind === 'add' || kind === 'create' || kind === 'write' ? 'Write' : 'Edit';
}

export function summarizeFileChange(kind: string | undefined): string | undefined {
  switch (kind) {
    case 'add':
    case 'create':
      return 'Created file';
    case 'delete':
    case 'remove':
      return 'Deleted file';
    case 'rename':
      return 'Renamed file';
    case 'write':
      return 'Wrote file';
    case 'modify':
    case 'update':
      return 'Updated file';
    default:
      return undefined;
  }
}
