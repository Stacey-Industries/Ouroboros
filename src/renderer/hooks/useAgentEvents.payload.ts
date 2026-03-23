import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { HookPayload, RawApiTokenUsage as TokenUsage } from '../types/electron';

const TASK_LABEL_LIMIT = 72;
const TOOL_SUMMARY_LIMIT = 80;

const SUBAGENT_TOOLS = new Set([
  'Task',
  'Agent',
  'Subagent',
  'task',
  'agent',
  'subagent',
  'TaskTool',
  'AgentTool',
  'spawn_agent',
  'launch_agent',
  'dispatch',
  'Dispatch',
]);

/** Fuzzy check: treat any tool whose name contains "agent" or "task" (case-insensitive) as a potential subagent tool. */
export function isSubagentTool(toolName: string): boolean {
  if (SUBAGENT_TOOLS.has(toolName)) return true;
  const lower = toolName.toLowerCase();
  return lower.includes('agent') || lower.includes('task');
}

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
    ?? formatModelLabel(payload.model)
    ?? `Session ${payload.sessionId.slice(0, 8)}`;
}

/** Convert a model identifier like "claude-opus-4-6" into a human-friendly label. */
function formatModelLabel(model?: string): string | undefined {
  if (!model) return undefined;
  // Strip common prefixes/suffixes: "claude-opus-4-6-20250514" → "Opus 4.6"
  const match = model.match(/claude[- ](sonnet|opus|haiku)[- ](\d+)[- ](\d+)/i);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `Claude ${family} ${match[2]}.${match[3]}`;
  }
  // Fallback: capitalize first letter
  return model.charAt(0).toUpperCase() + model.slice(1);
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

/** All field names where Claude Code may embed the child session ID. */
const CHILD_ID_FIELDS = [
  'session_id', 'sessionId', 'agent_id', 'agentId', 'id',
  'task_id', 'taskId', 'child_session_id', 'childSessionId',
  'spawned_session_id', 'subagent_id',
];

function findChildIdInInput(input: Record<string, unknown>): string | undefined {
  for (const field of CHILD_ID_FIELDS) {
    const value = getStringValue(input, field);
    if (value) return value;
  }
  return undefined;
}

export function getSubagentChildId(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  if (!isSubagentTool(toolName)) {
    return undefined;
  }
  return findChildIdInInput(input);
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
