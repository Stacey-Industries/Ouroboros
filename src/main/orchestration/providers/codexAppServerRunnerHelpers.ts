/**
 * codexAppServerRunnerHelpers.ts — Pure helpers for the Codex app-server runner.
 *
 * Extracted from codexAppServerRunner.ts to keep that file under the 300-line
 * limit. Covers: request-param builders, response parsers, subscription helpers,
 * approval response construction, and sink status emission.
 */

import type { CodexCliSettings } from '../../config';
import type { ProviderSessionReference } from '../types';
import { ensureCodexAppServerClient } from './codexAppServerClient';
import type { CodexAppServerMessage } from './codexAppServerEventMapper';
import type { ProviderProgressSink } from './providerAdapter';

// Structural client contract used by the runner/helpers. Distinct from the
// canonical `CodexAppServerClient` class in `codexAppServerClient.ts` because
// the class's listener callbacks use richer variant types whose params lack
// index signatures — those don't structurally assign to `CodexAppServerMessage`.
// This looser interface keeps the helpers decoupled; callers bridge via a
// cast at the factory boundary (see `createCodexAppServerRuntime` below).
export interface CodexAppServerClient {
  notify?: (method: string, params?: Record<string, unknown>) => Promise<void> | void;
  onMessage?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  onNotification?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  onServerRequest?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  respond?: (id: string | number, result: Record<string, unknown>) => Promise<void> | void;
  sendInitialized?: () => void;
}

export function buildInitializeParams(): Record<string, unknown> {
  return {
    clientInfo: {
      name: 'agent_ide',
      title: 'Agent IDE',
      version: '2.5.0',
    },
  };
}

export function buildTurnStartParams(args: {
  cwd: string;
  model: string;
  prompt: string;
  settings: CodexCliSettings;
  threadId: string;
}): Record<string, unknown> {
  const approvalPolicy = shouldAutoApproveServerApproval(args.settings)
    ? 'never'
    : args.settings.approvalPolicy;
  return {
    approvalPolicy,
    cwd: args.cwd,
    dangerouslyBypassApprovalsAndSandbox: args.settings.dangerouslyBypassApprovalsAndSandbox,
    input: [{ text: args.prompt, type: 'text' }],
    model: args.model,
    sandbox: args.settings.sandbox,
    threadId: args.threadId,
  };
}

export function shouldAutoApproveServerApproval(settings: CodexCliSettings): boolean {
  return settings.dangerouslyBypassApprovalsAndSandbox || settings.approvalPolicy === 'never';
}

export function parseThreadId(result: unknown): string | null {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const thread = record?.thread;
  if (
    thread &&
    typeof thread === 'object' &&
    typeof (thread as Record<string, unknown>).id === 'string'
  ) {
    return (thread as Record<string, unknown>).id as string;
  }
  return typeof record?.threadId === 'string' ? record.threadId : null;
}

export function parseTurnId(result: unknown): string | null {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const turn = record?.turn;
  if (
    turn &&
    typeof turn === 'object' &&
    typeof (turn as Record<string, unknown>).id === 'string'
  ) {
    return (turn as Record<string, unknown>).id as string;
  }
  return typeof record?.turnId === 'string' ? record.turnId : null;
}

export function subscribeToMessages(
  client: CodexAppServerClient,
  handler: (message: CodexAppServerMessage) => void,
): () => void {
  if (client.onNotification) return client.onNotification(handler);
  if (client.onMessage) return client.onMessage(handler);
  return () => undefined;
}

export function subscribeToServerRequests(
  client: CodexAppServerClient,
  handler: (message: CodexAppServerMessage) => void,
): () => void {
  if (client.onServerRequest) return client.onServerRequest(handler);
  return () => undefined;
}

export function buildApprovalResponse(
  message: CodexAppServerMessage,
  approved: boolean,
): Record<string, unknown> {
  if (message.method === 'item/permissions/requestApproval') {
    const permissions =
      approved && message.params && typeof message.params.permissions === 'object'
        ? (message.params.permissions as Record<string, unknown>)
        : {};
    return { permissions, scope: 'turn' };
  }
  return { decision: approved ? 'accept' : 'decline' };
}

export function emitBridgeStatus(
  sink: ProviderProgressSink,
  sessionRef: ProviderSessionReference,
  message: string,
  blockIndex: number,
): void {
  sink.emit({
    provider: 'codex',
    status: 'streaming',
    message,
    timestamp: Date.now(),
    session: sessionRef,
    contentBlock: {
      blockIndex,
      blockType: 'text',
      textDelta: `\n\n---\n${message}`,
    },
  });
}

export const APPROVAL_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
]);

// ─── Runtime module loading ───────────────────────────────────────────────────

export interface CodexAppServerRuntime {
  ensureClient: (args: { cwd: string; sessionKey: string }) => Promise<CodexAppServerClient>;
}

export function createCodexAppServerRuntime(): CodexAppServerRuntime {
  // Bridge the canonical class (whose listener variants are incompatible with
  // our looser structural interface, see note above) to the loose shape. The
  // runtime behavior is identical; only the TypeScript variance differs.
  return {
    ensureClient: (args) =>
      ensureCodexAppServerClient(args) as unknown as Promise<CodexAppServerClient>,
  };
}
