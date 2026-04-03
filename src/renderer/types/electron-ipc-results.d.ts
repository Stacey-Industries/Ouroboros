/** IPC result types and tool-call event types — shared by all API surfaces. */

import type { AgentEvent, DirEntry } from './electron-foundation';

export interface IpcResult {
  success: boolean;
  error?: string;
}

export interface ToolCallPayload {
  tool: string;
  input: Record<string, unknown>;
  callId: string;
}

export interface ToolCallEvent extends AgentEvent {
  type: 'tool_call';
  payload: ToolCallPayload;
}

export interface ReadFileResult extends IpcResult {
  content?: string;
}

export interface ReadBinaryFileResult extends IpcResult {
  data?: Uint8Array;
}

export interface ReadDirResult extends IpcResult {
  items?: DirEntry[];
}

export interface SelectFolderResult extends IpcResult {
  cancelled?: boolean;
  path?: string | null;
}
