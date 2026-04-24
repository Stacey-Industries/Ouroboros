import type { ApprovalRequest } from '../../types/electron';

export function getApprovalRequestKey(request: ApprovalRequest): string {
  const input = request.toolInput;
  if (request.toolName === 'Bash') return String(input.command ?? '');
  const filePath = input.file_path ?? input.path;
  if (filePath !== undefined) return String(filePath);
  return JSON.stringify(input);
}

export function getApprovalRequestPreview(request: ApprovalRequest): string {
  const key = getApprovalRequestKey(request);
  return key.length > 160 ? `${key.slice(0, 160)}...` : key;
}
