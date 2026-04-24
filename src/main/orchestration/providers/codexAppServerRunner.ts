import type { CodexCliSettings } from '../../config';
import type { ProviderSessionReference } from '../types';
import { shouldRetryCodexWithoutResume } from './codexAdapterHelpers';
import { CodexApprovalBridge } from './codexApprovalBridge';
import {
  buildCodexAppServerEventMapper,
  type CodexAppServerMessage,
} from './codexAppServerEventMapper';
import {
  APPROVAL_REQUEST_METHODS,
  buildApprovalResponse,
  buildInitializeParams,
  buildTurnStartParams,
  type CodexAppServerClient,
  type CodexAppServerRuntime,
  createCodexAppServerRuntime,
  emitBridgeStatus,
  parseThreadId,
  parseTurnId,
  shouldAutoApproveServerApproval,
  subscribeToMessages,
  subscribeToServerRequests,
} from './codexAppServerRunnerHelpers';
import { buildPrompt } from './codexContextBuilder';
import type {
  ProviderLaunchContext,
  ProviderProgressSink,
  ProviderResumeContext,
} from './providerAdapter';

interface RunnerState {
  initialized: boolean;
  threadId: string | null;
}

export interface CodexAppServerTurnArgs {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  model: string;
  sessionRef: ProviderSessionReference;
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

function getRuntime(): CodexAppServerRuntime {
  return runtimeOverride ?? createCodexAppServerRuntime();
}

export function setCodexAppServerRuntimeForTests(runtime: CodexAppServerRuntime | null): void {
  runtimeOverride = runtime;
  runtimeStateBySessionKey.clear();
}

async function ensureInitialized(client: CodexAppServerClient, sessionKey: string): Promise<RunnerState> {
  const existing = runtimeStateBySessionKey.get(sessionKey) ?? { initialized: false, threadId: null };
  if (!existing.initialized) {
    await client.request('initialize', buildInitializeParams());
    if (client.sendInitialized) { client.sendInitialized(); } else { client.notify?.('initialized', {}); }
    existing.initialized = true;
    runtimeStateBySessionKey.set(sessionKey, existing);
  }
  return existing;
}

async function resolveResumeOrStart(
  client: CodexAppServerClient,
  cwd: string,
  resumeThreadId: string,
): Promise<string | null> {
  try {
    const result = await client.request('thread/resume', { threadId: resumeThreadId });
    return parseThreadId(result) ?? resumeThreadId;
  } catch (error) {
    if (!shouldRetryCodexWithoutResume(error)) throw error;
    const result = await client.request('thread/start', { cwd });
    return parseThreadId(result);
  }
}

async function ensureThread(
  client: CodexAppServerClient,
  sessionKey: string,
  cwd: string,
  resumeThreadId: string | undefined,
): Promise<string> {
  const state = runtimeStateBySessionKey.get(sessionKey) ?? { initialized: true, threadId: null };
  if (state.threadId) return state.threadId;
  const threadId = resumeThreadId
    ? await resolveResumeOrStart(client, cwd, resumeThreadId)
    : parseThreadId(await client.request('thread/start', { cwd }));
  if (!threadId) throw new Error('Codex app-server did not return a thread id.');
  state.threadId = threadId;
  runtimeStateBySessionKey.set(sessionKey, state);
  return threadId;
}

interface TurnRuntime {
  readonly args: CodexAppServerTurnArgs;
  readonly sessionKey: string;
  readonly mapper: ReturnType<typeof buildCodexAppServerEventMapper>;
  readonly approvalBridge: CodexApprovalBridge;
  readonly pendingApprovalMessages: Map<string, CodexAppServerMessage>;
  activeThreadId: string;
  settled: boolean;
}

function buildApprovalBridge(
  client: CodexAppServerClient,
  rt: Omit<TurnRuntime, 'approvalBridge'>,
  sessionKey: string,
  threadId: string,
): CodexApprovalBridge {
  return new CodexApprovalBridge({
    client: {
      respondToApproval: async (requestId, response) => {
        if (!client.respond) return;
        const requestMessage = rt.pendingApprovalMessages.get(requestId);
        if (!requestMessage || requestMessage.id === undefined) return;
        rt.pendingApprovalMessages.delete(requestId);
        await client.respond(
          requestMessage.id,
          buildApprovalResponse(requestMessage, response.decision === 'approve'),
        );
      },
    },
    onStatus: (event) => {
      emitBridgeStatus(
        rt.args.sink,
        rt.args.sessionRef,
        event.message,
        rt.mapper.getNextBlockIndex(),
      );
    },
    sessionId: rt.args.sessionRef.sessionId ?? sessionKey,
    threadId,
  });
}

interface TurnNotificationHandlerArgs {
  message: CodexAppServerMessage;
  rt: TurnRuntime;
  startedAt: number;
  cleanup: () => void;
  resolve: (result: CodexAppServerTurnResult) => void;
  reject: (error: Error) => void;
}

function handleTurnNotification(a: TurnNotificationHandlerArgs): void {
  const { message, rt } = a;
  rt.mapper.handle(message);
  if (message.method === 'thread/started') {
    rt.activeThreadId = rt.args.sessionRef.sessionId ?? rt.activeThreadId;
    const state = runtimeStateBySessionKey.get(rt.sessionKey);
    if (state) state.threadId = rt.activeThreadId;
    return;
  }
  if (message.method === 'turn/failed' && !rt.settled) {
    rt.settled = true;
    rt.approvalBridge.cancelAllPendingApprovals('Codex turn failed before approval resolved.');
    a.cleanup();
    a.reject(new Error('Codex app-server turn failed.'));
    return;
  }
  if (message.method === 'turn/completed' && !rt.settled) {
    rt.settled = true;
    rt.approvalBridge.cancelAllPendingApprovals('Codex turn completed before approval resolved.');
    a.cleanup();
    a.resolve({
      durationMs: Date.now() - a.startedAt,
      threadId: rt.args.sessionRef.sessionId ?? rt.activeThreadId,
      usage: rt.mapper.getUsage(),
    });
  }
}

function autoApproveServerRequest(
  client: CodexAppServerClient,
  message: CodexAppServerMessage,
): boolean {
  if (message.id === undefined || !client.respond) return false;
  void client.respond(message.id, buildApprovalResponse(message, true));
  return true;
}

function handleApprovalRequest(
  client: CodexAppServerClient,
  message: CodexAppServerMessage,
  rt: TurnRuntime,
): void {
  if (!message.method || !APPROVAL_REQUEST_METHODS.has(message.method)) return;
  if (message.id === undefined) return;
  if (
    shouldAutoApproveServerApproval(rt.args.settings) &&
    autoApproveServerRequest(client, message)
  ) {
    return;
  }
  const requestId = String(message.id);
  rt.pendingApprovalMessages.set(requestId, message);
  void rt.approvalBridge
    .queueApproval({
      id: requestId,
      input: message.params,
      kind: message.method,
      ...message.params,
    })
    .catch((error: unknown) => {
      rt.pendingApprovalMessages.delete(requestId);
      emitBridgeStatus(
        rt.args.sink,
        rt.args.sessionRef,
        error instanceof Error ? error.message : String(error),
        rt.mapper.getNextBlockIndex(),
      );
    });
}

function wireTurnEventStream(
  client: CodexAppServerClient,
  rt: TurnRuntime,
  startedAt: number,
): Promise<CodexAppServerTurnResult> {
  return new Promise<CodexAppServerTurnResult>((resolve, reject) => {
    let cleanupNotifications: () => void = () => undefined;
    let cleanupServerRequests: () => void = () => undefined;
    const cleanup = () => {
      cleanupNotifications();
      cleanupServerRequests();
    };
    cleanupNotifications = subscribeToMessages(client, (message) =>
      handleTurnNotification({ message, rt, startedAt, cleanup, resolve, reject }),
    );
    cleanupServerRequests = subscribeToServerRequests(client, (message) =>
      handleApprovalRequest(client, message, rt),
    );
  });
}

async function prepareTurnRuntime(
  args: CodexAppServerTurnArgs,
): Promise<{ client: CodexAppServerClient; rt: TurnRuntime; threadId: string; prompt: string }> {
  const runtime = getRuntime();
  const sessionKey = args.context.sessionId || args.context.taskId;
  const client = await runtime.ensureClient({ cwd: args.cwd, sessionKey });
  await ensureInitialized(client, sessionKey);
  const prompt = buildPrompt(args.context, args.model, Boolean(args.resumeThreadId));
  const mapper = buildCodexAppServerEventMapper(args.sink, args.sessionRef);
  const threadId = await ensureThread(client, sessionKey, args.cwd, args.resumeThreadId);
  const partial = {
    args,
    sessionKey,
    mapper,
    pendingApprovalMessages: new Map<string, CodexAppServerMessage>(),
    activeThreadId: threadId,
    settled: false,
  } as Omit<TurnRuntime, 'approvalBridge'>;
  const approvalBridge = buildApprovalBridge(client, partial, sessionKey, threadId);
  const rt: TurnRuntime = { ...partial, approvalBridge } as TurnRuntime;
  return { client, rt, threadId, prompt };
}

function buildTurnHandle(
  client: CodexAppServerClient,
  rt: TurnRuntime,
  activeTurnId: string | null,
): CodexAppServerTurnHandle {
  const getThreadId = () => rt.args.sessionRef.sessionId ?? rt.activeThreadId;
  return {
    get threadId() { return getThreadId(); },
    kill: () => {
      rt.approvalBridge.cancelAllPendingApprovals('Codex turn interrupted before approval resolved.');
      if (activeTurnId) void client.request('turn/interrupt', { threadId: getThreadId(), turnId: activeTurnId });
    },
  };
}

export async function runCodexAppServerTurn(args: CodexAppServerTurnArgs): Promise<{
  handle: CodexAppServerTurnHandle;
  result: Promise<CodexAppServerTurnResult>;
}> {
  const { client, rt, threadId, prompt } = await prepareTurnRuntime(args);
  const startedAt = Date.now();
  const result = wireTurnEventStream(client, rt, startedAt);
  const turnStartResult = await client.request(
    'turn/start',
    buildTurnStartParams({
      cwd: args.cwd,
      model: args.model,
      prompt,
      settings: args.settings,
      threadId,
    }),
  );
  const activeTurnId = parseTurnId(turnStartResult);
  return { handle: buildTurnHandle(client, rt, activeTurnId), result };
}
