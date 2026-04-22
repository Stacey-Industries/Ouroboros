import { buildPrompt } from './codexContextBuilder';
import { buildCodexAppServerEventMapper, type CodexAppServerMessage } from './codexAppServerEventMapper';
import type { CodexCliSettings } from '../../config';
import { CodexApprovalBridge } from './codexApprovalBridge';
import type { ProviderLaunchContext, ProviderProgressSink, ProviderResumeContext } from './providerAdapter';

interface CodexAppServerClient {
  notify?: (method: string, params?: Record<string, unknown>) => Promise<void> | void;
  onMessage?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  onNotification?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  onServerRequest?: (handler: (message: CodexAppServerMessage) => void) => () => void;
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  respond?: (id: string | number, result: Record<string, unknown>) => Promise<void> | void;
  sendInitialized?: () => void;
}

interface CodexAppServerRuntime {
  ensureClient: (args: { cwd: string; sessionKey: string }) => Promise<CodexAppServerClient>;
}

interface CodexAppServerRuntimeModule {
  createCodexAppServerClient?: (processHandle: unknown) => CodexAppServerClient;
  ensureCodexAppServerClient?: (args: { cwd: string; sessionKey: string }) => Promise<CodexAppServerClient>;
}

interface CodexAppServerProcessModule {
  ensureCodexAppServerProcess?: (args: { cwd: string; sessionKey: string }) => Promise<unknown>;
}

interface RunnerState {
  initialized: boolean;
  threadId: string | null;
}

export interface CodexAppServerTurnArgs {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  model: string;
  sessionRef: {
    requestId?: string;
    sessionId?: string;
    externalTaskId?: string;
    provider: 'codex';
  };
  settings: CodexCliSettings;
  sink: ProviderProgressSink;
  resumeThreadId?: string;
}

export interface CodexAppServerTurnHandle {
  kill: () => void;
  readonly threadId: string | null;
}

export interface CodexAppServerTurnResult {
  durationMs: number;
  threadId: string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

const runtimeStateBySessionKey = new Map<string, RunnerState>();
let runtimeOverride: CodexAppServerRuntime | null = null;

function requireOptional<T>(path: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    return require(path) as T;
  } catch {
    return null;
  }
}

function createCodexAppServerRuntime(): CodexAppServerRuntime {
  const clientModule = requireOptional<CodexAppServerRuntimeModule>('./codexAppServerClient');
  if (clientModule?.ensureCodexAppServerClient) {
    return { ensureClient: clientModule.ensureCodexAppServerClient };
  }
  const processModule = requireOptional<CodexAppServerProcessModule>('./codexAppServerProcess');
  if (clientModule?.createCodexAppServerClient && processModule?.ensureCodexAppServerProcess) {
    return {
      ensureClient: async (args) => {
        const processHandle = await processModule.ensureCodexAppServerProcess?.(args);
        return clientModule.createCodexAppServerClient?.(processHandle) as CodexAppServerClient;
      },
    };
  }
  throw new Error(
    'Codex app-server runtime is unavailable; expected codexAppServerClient/process modules to be present.',
  );
}

function getRuntime(): CodexAppServerRuntime {
  return runtimeOverride ?? createCodexAppServerRuntime();
}

export function setCodexAppServerRuntimeForTests(runtime: CodexAppServerRuntime | null): void {
  runtimeOverride = runtime;
  runtimeStateBySessionKey.clear();
}

function subscribeToMessages(
  client: CodexAppServerClient,
  handler: (message: CodexAppServerMessage) => void,
): () => void {
  if (client.onNotification) return client.onNotification(handler);
  if (client.onMessage) return client.onMessage(handler);
  return () => undefined;
}

function parseThreadId(result: unknown): string | null {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const thread = record?.thread;
  if (thread && typeof thread === 'object' && typeof (thread as Record<string, unknown>).id === 'string') {
    return (thread as Record<string, unknown>).id as string;
  }
  return typeof record?.threadId === 'string' ? record.threadId : null;
}

function parseTurnId(result: unknown): string | null {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const turn = record?.turn;
  if (turn && typeof turn === 'object' && typeof (turn as Record<string, unknown>).id === 'string') {
    return (turn as Record<string, unknown>).id as string;
  }
  return typeof record?.turnId === 'string' ? record.turnId : null;
}

function buildInitializeParams(): Record<string, unknown> {
  return {
    clientInfo: {
      name: 'agent_ide',
      title: 'Agent IDE',
      version: '2.3.0',
    },
  };
}

function buildTurnStartParams(args: {
  cwd: string;
  model: string;
  prompt: string;
  settings: CodexCliSettings;
  threadId: string;
}): Record<string, unknown> {
  return {
    approvalPolicy: args.settings.approvalPolicy,
    cwd: args.cwd,
    input: [{ text: args.prompt, type: 'text' }],
    model: args.model,
    threadId: args.threadId,
  };
}

async function ensureInitialized(
  client: CodexAppServerClient,
  sessionKey: string,
): Promise<RunnerState> {
  const existing = runtimeStateBySessionKey.get(sessionKey) ?? { initialized: false, threadId: null };
  if (!existing.initialized) {
    await client.request('initialize', buildInitializeParams());
    if (client.sendInitialized) {
      client.sendInitialized();
    } else {
      client.notify?.('initialized', {});
    }
    existing.initialized = true;
    runtimeStateBySessionKey.set(sessionKey, existing);
  }
  return existing;
}

async function ensureThread(
  client: CodexAppServerClient,
  sessionKey: string,
  cwd: string,
  resumeThreadId: string | undefined,
): Promise<string> {
  const state = runtimeStateBySessionKey.get(sessionKey) ?? { initialized: true, threadId: null };
  if (state.threadId) return state.threadId;
  const method = resumeThreadId ? 'thread/resume' : 'thread/start';
  const result = await client.request(method, resumeThreadId ? { threadId: resumeThreadId } : { cwd });
  const threadId = parseThreadId(result) ?? resumeThreadId;
  if (!threadId) throw new Error('Codex app-server did not return a thread id.');
  state.threadId = threadId;
  runtimeStateBySessionKey.set(sessionKey, state);
  return threadId;
}

function emitBridgeStatus(
  sink: ProviderProgressSink,
  sessionRef: CodexAppServerTurnArgs['sessionRef'],
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

function buildApprovalResponse(message: CodexAppServerMessage, approved: boolean): Record<string, unknown> {
  if (message.method === 'item/permissions/requestApproval') {
    const permissions =
      approved && message.params && typeof message.params.permissions === 'object'
        ? (message.params.permissions as Record<string, unknown>)
        : {};
    return { permissions, scope: 'turn' };
  }
  return { decision: approved ? 'accept' : 'decline' };
}

function subscribeToServerRequests(
  client: CodexAppServerClient,
  handler: (message: CodexAppServerMessage) => void,
): () => void {
  if (client.onServerRequest) return client.onServerRequest(handler);
  return () => undefined;
}

export async function runCodexAppServerTurn(args: CodexAppServerTurnArgs): Promise<{
  handle: CodexAppServerTurnHandle;
  result: Promise<CodexAppServerTurnResult>;
}> {
  const runtime = getRuntime();
  const sessionKey = args.context.sessionId || args.context.taskId;
  const client = await runtime.ensureClient({ cwd: args.cwd, sessionKey });
  await ensureInitialized(client, sessionKey);
  const prompt = buildPrompt(args.context, args.model, Boolean(args.resumeThreadId));
  const mapper = buildCodexAppServerEventMapper(args.sink, args.sessionRef);
  const threadId = await ensureThread(client, sessionKey, args.cwd, args.resumeThreadId);
  const startedAt = Date.now();
  let activeThreadId = threadId;
  let activeTurnId: string | null = null;
  let settled = false;
  let cleanupNotifications = () => undefined;
  let cleanupServerRequests = () => undefined;
  const approvalBridge = new CodexApprovalBridge({
    client: {
      respondToApproval: async (requestId, response) => {
        if (!client.respond) return;
        const requestMessage = pendingApprovalMessages.get(requestId);
        if (!requestMessage || requestMessage.id === undefined) return;
        pendingApprovalMessages.delete(requestId);
        await client.respond(
          requestMessage.id,
          buildApprovalResponse(requestMessage, response.decision === 'approve'),
        );
      },
    },
    onStatus: (event) => {
      emitBridgeStatus(args.sink, args.sessionRef, event.message, mapper.getNextBlockIndex());
    },
    sessionId: args.sessionRef.sessionId ?? sessionKey,
    threadId,
  });
  const pendingApprovalMessages = new Map<string, CodexAppServerMessage>();

  const result = new Promise<CodexAppServerTurnResult>((resolve, reject) => {
    cleanupNotifications = subscribeToMessages(client, (message) => {
      mapper.handle(message);
      if (message.method === 'thread/started') {
        activeThreadId = args.sessionRef.sessionId ?? activeThreadId;
        const state = runtimeStateBySessionKey.get(sessionKey);
        if (state) state.threadId = activeThreadId;
      }
      if (message.method === 'turn/failed' && !settled) {
        settled = true;
        approvalBridge.cancelAllPendingApprovals('Codex turn failed before approval resolved.');
        cleanupNotifications();
        cleanupServerRequests();
        reject(new Error('Codex app-server turn failed.'));
        return;
      }
      if (message.method === 'turn/completed' && !settled) {
        settled = true;
        approvalBridge.cancelAllPendingApprovals('Codex turn completed before approval resolved.');
        cleanupNotifications();
        cleanupServerRequests();
        resolve({
          durationMs: Date.now() - startedAt,
          threadId: args.sessionRef.sessionId ?? activeThreadId,
          usage: mapper.getUsage(),
        });
      }
    });
    cleanupServerRequests = subscribeToServerRequests(client, (message) => {
      if (
        message.method !== 'item/commandExecution/requestApproval' &&
        message.method !== 'item/fileChange/requestApproval' &&
        message.method !== 'item/permissions/requestApproval'
      ) {
        return;
      }
      if (message.id === undefined) return;
      const requestId = String(message.id);
      pendingApprovalMessages.set(requestId, message);
      void approvalBridge.queueApproval({
        id: requestId,
        input: message.params,
        kind: message.method,
        ...message.params,
      }).catch((error: unknown) => {
        pendingApprovalMessages.delete(requestId);
        emitBridgeStatus(
          args.sink,
          args.sessionRef,
          error instanceof Error ? error.message : String(error),
          mapper.getNextBlockIndex(),
        );
      });
    });
  });

  const turnStartResult = await client.request(
    'turn/start',
    buildTurnStartParams({ cwd: args.cwd, model: args.model, prompt, settings: args.settings, threadId }),
  );
  activeTurnId = parseTurnId(turnStartResult);

  const handle: CodexAppServerTurnHandle = {
    get threadId() {
      return args.sessionRef.sessionId ?? activeThreadId;
    },
    kill: () => {
      approvalBridge.cancelAllPendingApprovals('Codex turn interrupted before approval resolved.');
      if (!activeTurnId) return;
      void client.request('turn/interrupt', {
        threadId: args.sessionRef.sessionId ?? activeThreadId,
        turnId: activeTurnId,
      });
    },
  };
  return { handle, result };
}
