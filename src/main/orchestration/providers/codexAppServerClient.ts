import type {
  CodexAppServerClientMethod,
  CodexAppServerIncomingMessage,
  CodexAppServerJsonRpcFailure,
  CodexAppServerJsonRpcSuccess,
  CodexAppServerMethodMap,
  CodexAppServerOutgoingMessage,
  CodexAppServerServerNotification,
  CodexAppServerServerRequest,
} from './codexAppServerTypes';

export interface CodexAppServerTransport {
  send: (message: CodexAppServerOutgoingMessage) => void;
  onMessage: (listener: (message: CodexAppServerIncomingMessage) => void) => () => void;
  onClose: (listener: (event: { code: number | null; stderr: string }) => void) => () => void;
  close: () => void;
}

type CodexAppServerAnyMessageListener = (message: CodexAppServerIncomingMessage) => void;

export interface CodexAppServerClientOptions {
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

function isSuccessResponse(message: CodexAppServerIncomingMessage): message is CodexAppServerJsonRpcSuccess {
  return 'id' in message && 'result' in message;
}

function isFailureResponse(message: CodexAppServerIncomingMessage): message is CodexAppServerJsonRpcFailure {
  return 'id' in message && 'error' in message;
}

function isServerRequest(message: CodexAppServerIncomingMessage): message is CodexAppServerServerRequest {
  return 'id' in message && 'method' in message;
}

export class CodexAppServerClient {
  private readonly requestTimeoutMs: number;
  private readonly transport: CodexAppServerTransport;
  private readonly pending = new Map<string | number, PendingRequest>();
  private readonly messageListeners = new Set<CodexAppServerAnyMessageListener>();
  private readonly notificationListeners = new Set<
    (message: CodexAppServerServerNotification) => void
  >();
  private readonly serverRequestListeners = new Set<
    (message: CodexAppServerServerRequest) => void
  >();
  private nextRequestId = 1;

  public constructor(transport: CodexAppServerTransport, options: CodexAppServerClientOptions = {}) {
    this.transport = transport;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onClose((event) => {
      this.rejectAllPending(
        new Error(`Codex app-server closed before responding: ${event.stderr.trim()}`),
      );
    });
  }

  public async request<M extends CodexAppServerClientMethod>(
    method: M,
    params: CodexAppServerMethodMap[M]['params'],
  ): Promise<CodexAppServerMethodMap[M]['result']> {
    const id = this.nextRequestId++;
    const response = await new Promise<CodexAppServerMethodMap[M]['result']>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out for ${method}.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.transport.send({ id, method, params } as CodexAppServerOutgoingMessage);
    });
    return response;
  }

  public sendInitialized(): void {
    this.transport.send({ method: 'initialized', params: undefined });
  }

  public notify(method: string, params?: Record<string, unknown>): void {
    this.transport.send({ method, params } as CodexAppServerOutgoingMessage);
  }

  public respond(id: string | number, result: Record<string, unknown>): void {
    this.transport.send({ id, result } as CodexAppServerOutgoingMessage);
  }

  public onMessage(listener: CodexAppServerAnyMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  public onNotification(
    listener: (message: CodexAppServerServerNotification) => void,
  ): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  public onServerRequest(listener: (message: CodexAppServerServerRequest) => void): () => void {
    this.serverRequestListeners.add(listener);
    return () => {
      this.serverRequestListeners.delete(listener);
    };
  }

  public close(): void {
    this.rejectAllPending(new Error('Codex app-server client closed.'));
    this.transport.close();
  }

  private handleMessage(message: CodexAppServerIncomingMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
    if (isSuccessResponse(message)) {
      this.resolvePending(message.id, message.result);
      return;
    }
    if (isFailureResponse(message)) {
      this.rejectPending(message.id, new Error(message.error.message));
      return;
    }
    if (isServerRequest(message)) {
      for (const listener of this.serverRequestListeners) {
        listener(message);
      }
      return;
    }
    for (const listener of this.notificationListeners) {
      listener(message);
    }
  }

  private resolvePending(id: string | number, result: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.resolve(result);
  }

  private rejectPending(id: string | number, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    pending.reject(error);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export function createCodexAppServerClient(
  transport: CodexAppServerTransport,
  options?: CodexAppServerClientOptions,
): CodexAppServerClient {
  return new CodexAppServerClient(transport, options);
}

export async function ensureCodexAppServerClient(args: {
  cwd: string;
  sessionKey: string;
}): Promise<CodexAppServerClient> {
  const processModule = await import('./codexAppServerProcess');
  const processHandle = await processModule.ensureCodexAppServerProcess(args);
  return new CodexAppServerClient(processHandle);
}
