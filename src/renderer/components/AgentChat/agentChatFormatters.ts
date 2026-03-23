import type { CSSProperties } from 'react';

import type {
  AgentChatMessageRecord,
  AgentChatMessageRole,
  AgentChatThreadRecord,
  AgentChatThreadStatus,
} from '../../types/electron';

const STATUS_LABELS: Record<AgentChatThreadStatus, string> = {
  idle: 'Ready',
  submitting: 'Starting...',
  running: 'Claude is working',
  verifying: 'Verifying',
  needs_review: 'Needs review',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const ROLE_LABELS: Record<AgentChatMessageRole, string> = {
  user: 'You',
  assistant: 'Claude',
  system: 'System',
  status: 'Status',
};

export function getStatusLabel(status: AgentChatThreadStatus): string {
  return STATUS_LABELS[status];
}

export function getRoleLabel(role: AgentChatMessageRole): string {
  return ROLE_LABELS[role];
}

export function getStatusTone(status: AgentChatThreadStatus): CSSProperties {
  if (status === 'failed' || status === 'cancelled') {
    return {
      borderColor: 'var(--status-error, #f85149)',
      color: 'var(--status-error, #f85149)',
    };
  }

  if (status === 'needs_review') {
    return {
      borderColor: 'var(--status-warning, #d29922)',
      color: 'var(--status-warning, #d29922)',
    };
  }

  if (
    status === 'running' ||
    status === 'submitting' ||
    status === 'verifying' ||
    status === 'complete'
  ) {
    return {
      borderColor: 'var(--interactive-accent)',
      color: 'var(--interactive-accent)',
    };
  }

  return {
    borderColor: 'var(--border-default)',
    color: 'var(--text-muted)',
  };
}

export function getMessageTone(message: AgentChatMessageRecord): CSSProperties {
  if (message.role === 'user') {
    return {
      borderColor: 'var(--interactive-accent)',
      backgroundColor: 'var(--surface-panel)',
    };
  }

  if (message.role === 'assistant') {
    return {
      borderColor: 'var(--interactive-accent)',
      backgroundColor: 'rgba(100, 100, 255, 0.04)',
    };
  }

  if (message.role === 'status') {
    return {
      borderColor: 'var(--interactive-accent)',
      backgroundColor: 'var(--surface-raised)',
    };
  }

  if (message.role === 'system') {
    return {
      borderColor: 'var(--border-default)',
      backgroundColor: 'var(--surface-panel)',
    };
  }

  return {
    borderColor: 'var(--border-default)',
    backgroundColor: 'var(--surface-base)',
  };
}

export function formatTimestampFull(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;

  if (diffMs < 0 || diffMs < 30_000) return 'just now';
  if (diffMs < 60_000) return '< 1m ago';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const today = new Date(now);
  const tsDate = new Date(timestamp);
  const isYesterday =
    today.getDate() - tsDate.getDate() === 1 &&
    today.getMonth() === tsDate.getMonth() &&
    today.getFullYear() === tsDate.getFullYear();
  if (isYesterday) return 'yesterday';

  return tsDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const TOOL_LABELS: Record<string, string> = {
  Read: 'Read File',
  read_file: 'Read File',
  Edit: 'Edit File',
  edit_file: 'Edit File',
  MultiEdit: 'Edit File',
  multi_edit: 'Edit File',
  Write: 'Write File',
  write_file: 'Write File',
  create_file: 'Create File',
  Bash: 'Run Command',
  execute_command: 'Run Command',
  Grep: 'Search Code',
  search_files: 'Search Code',
  Glob: 'Find Files',
  find_files: 'Find Files',
  WebSearch: 'Web Search',
  WebFetch: 'Fetch URL',
  TodoWrite: 'Update Tasks',
  NotebookEdit: 'Edit Notebook',
  Agent: 'Run Agent',
  Skill: 'Run Skill',
  LSP: 'Language Server',
};

function formatUnknownTool(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatToolActivity(name: string): string {
  return TOOL_LABELS[name] ?? formatUnknownTool(name);
}

export function formatStreamingStatus(toolCount: number): string {
  if (toolCount === 0) return 'Claude is working...';
  if (toolCount === 1) return 'Using 1 tool...';
  return `Using ${toolCount} tools...`;
}

export function formatThreadPreview(thread: AgentChatThreadRecord): string {
  const latestMessage = thread.messages.at(-1);
  if (!latestMessage) {
    return 'Ready for a new request';
  }

  const content = latestMessage.content.trim();
  if (!content) {
    return getStatusLabel(thread.status);
  }

  return content.length > 72 ? `${content.slice(0, 71).trimEnd()}...` : content;
}
