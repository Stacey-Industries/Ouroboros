export type CodexAppServerRequestId = string | number;

export interface CodexAppServerJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface CodexAppServerClientInfo {
  name: string;
  version: string;
}

export interface CodexAppServerInitializeCapabilities {
  notifications?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface CodexAppServerInitializeParams {
  clientInfo: CodexAppServerClientInfo;
  capabilities: CodexAppServerInitializeCapabilities | null;
}

export interface CodexAppServerInitializeResult {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

export interface CodexAppServerThreadSummary {
  id: string;
  title?: string | null;
  status?: string | null;
}

export interface CodexAppServerTurnSummary {
  id: string;
  status?: string | null;
}

export type CodexAppServerApprovalPolicy =
  | 'untrusted'
  | 'on-failure'
  | 'on-request'
  | 'never'
  | { granular: Record<string, boolean> };

export interface CodexAppServerThreadStartParams {
  model?: string | null;
  modelProvider?: string | null;
  serviceTier?: string | null;
  cwd?: string | null;
  approvalPolicy?: CodexAppServerApprovalPolicy | null;
  approvalsReviewer?: string | null;
  sandbox?: string | null;
  config?: Record<string, unknown> | null;
  serviceName?: string | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  personality?: string | null;
  ephemeral?: boolean | null;
  sessionStartSource?: string | null;
  experimentalRawEvents: boolean;
  persistExtendedHistory: boolean;
}

export interface CodexAppServerThreadResumeParams {
  threadId: string;
  history?: unknown[] | null;
  path?: string | null;
  model?: string | null;
  modelProvider?: string | null;
  serviceTier?: string | null;
  cwd?: string | null;
  approvalPolicy?: CodexAppServerApprovalPolicy | null;
  approvalsReviewer?: string | null;
  sandbox?: string | null;
  config?: Record<string, unknown> | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  personality?: string | null;
  persistExtendedHistory: boolean;
}

export interface CodexAppServerThreadStartResult {
  thread: CodexAppServerThreadSummary;
  model: string;
  modelProvider: string;
  serviceTier?: string | null;
  cwd: string;
  instructionSources: string[];
  approvalPolicy: CodexAppServerApprovalPolicy;
  approvalsReviewer: string;
  sandbox: Record<string, unknown>;
  reasoningEffort?: string | null;
}

export interface CodexAppServerUserInput {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface CodexAppServerTurnStartParams {
  threadId: string;
  input: CodexAppServerUserInput[];
  cwd?: string | null;
  approvalPolicy?: CodexAppServerApprovalPolicy | null;
  approvalsReviewer?: string | null;
  sandboxPolicy?: Record<string, unknown> | null;
  model?: string | null;
  serviceTier?: string | null;
  effort?: string | null;
  summary?: string | null;
  personality?: string | null;
  outputSchema?: unknown;
  collaborationMode?: Record<string, unknown> | null;
}

export interface CodexAppServerTurnStartResult {
  turn: CodexAppServerTurnSummary;
}

export interface CodexAppServerTurnInterruptParams {
  threadId: string;
  turnId: string;
}

export type CodexAppServerTurnInterruptResult = Record<string, never>;

export interface CodexAppServerThreadStartedNotification {
  thread: CodexAppServerThreadSummary;
}

export interface CodexAppServerTurnStartedNotification {
  threadId: string;
  turn: CodexAppServerTurnSummary;
}

export interface CodexAppServerTurnCompletedNotification {
  threadId: string;
  turn: CodexAppServerTurnSummary;
}

export interface CodexAppServerItemNotification {
  threadId: string;
  turnId: string;
  item: Record<string, unknown>;
}

export interface CodexAppServerCommandApprovalRequest {
  approvalId?: string | null;
  threadId: string;
  turnId: string;
  itemId: string;
  command?: string[];
  reason?: string | null;
  [key: string]: unknown;
}

export interface CodexAppServerPermissionApprovalRequest {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  permissions: Record<string, unknown>;
}

export interface CodexAppServerFileChangeApprovalRequest {
  threadId: string;
  turnId: string;
  itemId: string;
  reason?: string | null;
  changes?: Array<Record<string, unknown>> | null;
  grantRoot?: string | null;
}

export interface CodexAppServerJsonRpcSuccess<TResult = unknown> {
  id: CodexAppServerRequestId;
  result: TResult;
}

export interface CodexAppServerJsonRpcFailure {
  id: CodexAppServerRequestId;
  error: CodexAppServerJsonRpcError;
}

export interface CodexAppServerJsonRpcNotification<
  TMethod extends string = string,
  TParams = unknown,
> {
  method: TMethod;
  params: TParams;
}

export interface CodexAppServerJsonRpcRequest<TMethod extends string = string, TParams = unknown> {
  id: CodexAppServerRequestId;
  method: TMethod;
  params: TParams;
}

export interface CodexAppServerMethodMap {
  initialize: {
    params: CodexAppServerInitializeParams;
    result: CodexAppServerInitializeResult;
  };
  'thread/start': {
    params: CodexAppServerThreadStartParams;
    result: CodexAppServerThreadStartResult;
  };
  'thread/resume': {
    params: CodexAppServerThreadResumeParams;
    result: CodexAppServerThreadStartResult;
  };
  'turn/start': {
    params: CodexAppServerTurnStartParams;
    result: CodexAppServerTurnStartResult;
  };
  'turn/interrupt': {
    params: CodexAppServerTurnInterruptParams;
    result: CodexAppServerTurnInterruptResult;
  };
}

export type CodexAppServerClientMethod = keyof CodexAppServerMethodMap;
export type CodexAppServerClientNotification = CodexAppServerJsonRpcNotification<
  'initialized',
  undefined
>;

export type CodexAppServerServerRequest =
  | CodexAppServerJsonRpcRequest<
      'item/commandExecution/requestApproval',
      CodexAppServerCommandApprovalRequest
    >
  | CodexAppServerJsonRpcRequest<
      'item/fileChange/requestApproval',
      CodexAppServerFileChangeApprovalRequest
    >
  | CodexAppServerJsonRpcRequest<
      'item/permissions/requestApproval',
      CodexAppServerPermissionApprovalRequest
    >;

export type CodexAppServerServerNotification =
  | CodexAppServerJsonRpcNotification<'thread/started', CodexAppServerThreadStartedNotification>
  | CodexAppServerJsonRpcNotification<'turn/started', CodexAppServerTurnStartedNotification>
  | CodexAppServerJsonRpcNotification<'turn/completed', CodexAppServerTurnCompletedNotification>
  | CodexAppServerJsonRpcNotification<'item/started', CodexAppServerItemNotification>
  | CodexAppServerJsonRpcNotification<'item/completed', CodexAppServerItemNotification>
  | CodexAppServerJsonRpcNotification<'warning', Record<string, unknown>>
  | CodexAppServerJsonRpcNotification<'error', Record<string, unknown>>;

export type CodexAppServerIncomingMessage =
  | CodexAppServerJsonRpcSuccess
  | CodexAppServerJsonRpcFailure
  | CodexAppServerServerRequest
  | CodexAppServerServerNotification;

export type CodexAppServerOutgoingMessage =
  | CodexAppServerClientNotification
  | CodexAppServerJsonRpcSuccess
  | {
      [M in CodexAppServerClientMethod]: CodexAppServerJsonRpcRequest<
        M,
        CodexAppServerMethodMap[M]['params']
      >;
    }[CodexAppServerClientMethod];
