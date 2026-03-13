import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { HookPayload, TokenUsage } from '../types/electron';

const TASK_LABEL_LIMIT = 72;
const TOOL_SUMMARY_LIMIT = 80;

const SUBAGENT_TOOLS = new Set([
  'Task',
  'Agent',
  'Subagent',
  'task',
  'agent',
  'subagent',
]);

const TOOL_INPUT_HEURISTICS: Record<string, string[]> = {
  Read: ['file_path', 'path'],
  Edit: ['file_path', 'path'],
  Write: ['file_path', 'path'],
  Glob: ['pattern', 'path'],
  Grep: ['pattern', 'path'],
  Bash: ['command'],
  mcp__arcflow: ['query'],
};

export interface ToolEndDetails {
  duration: number;
  output?: string;
  status: 'success' | 'error';
}

export function deriveTaskLabel(payload: HookPayload): string {
  const promptLabel = getPromptLabel(payload.prompt);
  if (promptLabel) {
    return promptLabel;
  }

  return getStringValue(payload as Record<string, unknown>, 'taskLabel')
    ?? `Session ${payload.sessionId.slice(0, 8)}`;
}

export function createToolCall(payload: HookPayload): ToolCallEvent | null {
  if (!payload.toolName) {
    return null;
  }

  return {
    id: payload.toolCallId ?? `${payload.sessionId}-${payload.timestamp}`,
    toolName: payload.toolName,
    input: summarizeToolInput(payload.toolName, payload.input ?? {}),
    timestamp: payload.timestamp,
    status: 'pending',
  };
}

export function getSubagentChildId(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  if (!SUBAGENT_TOOLS.has(toolName)) {
    return undefined;
  }

  return getStringValue(input, 'session_id') ?? getStringValue(input, 'sessionId');
}

export function getToolEndDetails(payload: HookPayload): ToolEndDetails {
  const output = isRecord(payload.output) ? payload.output : undefined;
  const outputTimestamp = getOutputTimestamp(output) ?? payload.timestamp;

  return {
    duration: Math.max(0, outputTimestamp - payload.timestamp),
    output: formatToolOutput(output),
    status: output?.error !== undefined ? 'error' : 'success',
  };
}

export function parsePersistedSessions(rawSessions: unknown[]): AgentSession[] {
  return rawSessions.flatMap((rawSession) => {
    const session = toPersistedSession(rawSession);
    return session ? [session] : [];
  });
}

export function toHookPayload(event: HookPayload): HookPayload | null {
  if (!hasRequiredPayloadFields(event)) {
    return null;
  }

  return mergeNestedOutputFields(event);
}

function mergeNestedOutputFields(event: HookPayload): HookPayload {
  const nestedFields = getNestedOutputFields(event.output);
  if (!nestedFields) {
    return event;
  }

  return {
    ...event,
    model: event.model ?? nestedFields.model,
    usage: event.usage ?? nestedFields.usage,
  };
}

function getNestedOutputFields(
  output: HookPayload['output'],
): Partial<Pick<HookPayload, 'model' | 'usage'>> | null {
  if (!isRecord(output)) {
    return null;
  }

  const usage = isRecord(output.usage) ? output.usage as TokenUsage : undefined;
  const model = typeof output.model === 'string' ? output.model : undefined;

  return usage || model ? { model, usage } : null;
}

function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  const preferredKeys = TOOL_INPUT_HEURISTICS[toolName] ?? Object.keys(input);

  for (const key of preferredKeys) {
    const value = getStringValue(input, key);
    if (value) {
      return truncateText(value, TOOL_SUMMARY_LIMIT);
    }
  }

  return truncateText(JSON.stringify(input), TOOL_SUMMARY_LIMIT);
}

function formatToolOutput(output?: Record<string, unknown>): string | undefined {
  if (!output) {
    return undefined;
  }

  for (const key of ['content', 'result', 'error', 'output']) {
    const value = getStringValue(output, key);
    if (value) {
      return value;
    }
  }

  try {
    const rawOutput = JSON.stringify(output, null, 2);
    return rawOutput === '{}' ? undefined : rawOutput;
  } catch {
    return undefined;
  }
}

function getPromptLabel(prompt?: string): string | undefined {
  if (!prompt) {
    return undefined;
  }

  const firstLine = prompt.split('\n', 1)[0]?.trim();
  return firstLine ? truncateText(firstLine, TASK_LABEL_LIMIT) : undefined;
}

function getOutputTimestamp(output?: Record<string, unknown>): number | undefined {
  const timestamp = output?.timestamp;
  return typeof timestamp === 'number' ? timestamp : undefined;
}

function toPersistedSession(rawSession: unknown): AgentSession | null {
  if (!isRecord(rawSession)) {
    return null;
  }

  const id = getStringValue(rawSession, 'id');
  const taskLabel = getStringValue(rawSession, 'taskLabel');
  const startedAt = getNumberValue(rawSession, 'startedAt');
  const status = getStatusValue(rawSession, 'status');

  if (!id || !taskLabel || startedAt === undefined || !status) {
    return null;
  }

  return {
    id,
    taskLabel,
    status,
    startedAt,
    completedAt: getNumberValue(rawSession, 'completedAt'),
    toolCalls: Array.isArray(rawSession.toolCalls) ? rawSession.toolCalls as ToolCallEvent[] : [],
    error: getStringValue(rawSession, 'error'),
    parentSessionId: getStringValue(rawSession, 'parentSessionId'),
    inputTokens: getNumberValue(rawSession, 'inputTokens') ?? 0,
    outputTokens: getNumberValue(rawSession, 'outputTokens') ?? 0,
    cacheReadTokens: getNumberValue(rawSession, 'cacheReadTokens'),
    cacheWriteTokens: getNumberValue(rawSession, 'cacheWriteTokens'),
    model: getStringValue(rawSession, 'model'),
    notes: getStringValue(rawSession, 'notes'),
    bookmarked: typeof rawSession.bookmarked === 'boolean' ? rawSession.bookmarked : undefined,
    restored: true,
  };
}

function hasRequiredPayloadFields(event: unknown): event is HookPayload {
  return isRecord(event)
    && typeof event.type === 'string'
    && typeof event.sessionId === 'string'
    && typeof event.timestamp === 'number';
}

function getStatusValue(
  record: Record<string, unknown>,
  key: string,
): AgentSession['status'] | undefined {
  const value = record[key];
  if (value === 'idle' || value === 'running' || value === 'complete' || value === 'error') {
    return value;
  }

  return undefined;
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getNumberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
