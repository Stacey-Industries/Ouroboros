/**
 * types.ts — Session replay domain types.
 */

import type { AgentSession, ToolCallEvent } from '../AgentMonitor/types';

export interface ReplayState {
  session: AgentSession;
  /** Index of the currently focused step (0 = session start, 1..N = tool calls) */
  currentStep: number;
  /** Total steps: tool calls + 1 for session start */
  totalSteps: number;
  /** Whether auto-play is running */
  playing: boolean;
  /** Playback speed multiplier (1x, 2x, 4x) */
  speed: number;
}

export interface ReplayStep {
  index: number;
  type: 'session_start' | 'tool_call';
  timestamp: number;
  /** Elapsed since session start */
  elapsedMs: number;
  toolCall?: ToolCallEvent;
  label: string;
}
