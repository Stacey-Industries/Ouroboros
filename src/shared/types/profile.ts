/**
 * profile.ts — Shared type definitions for the profiles primitive (Wave 26).
 *
 * Used by main process (profileStore, IPC handlers), renderer (UI components),
 * and preload (bridge). Kept in @shared so all three processes can import it.
 */

export type EffortLevel = 'low' | 'medium' | 'high';
export type PermissionMode = 'normal' | 'plan' | 'bypass';

export interface Profile {
  id: string;
  name: string;
  description?: string;
  /** Model identifier, e.g. 'claude-sonnet-4-6' */
  model?: string;
  effort?: EffortLevel;
  permissionMode?: PermissionMode;
  systemPromptAddendum?: string;
  /** Tool name whitelist — empty/absent means all tools allowed */
  enabledTools?: string[];
  /** MCP server IDs to enable for this profile */
  mcpServers?: string[];
  /** Sampling temperature, 0.0 – 1.0 */
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  /** JSON schema for structured output; null disables structured mode */
  jsonSchema?: string | null;
  /** Built-in presets cannot be deleted */
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}
