import {
  cancelApprovalRequest,
  getPendingRequest,
  requestApproval,
  waitForResolution,
  type ApprovalRequest,
  type ApprovalResponse,
} from '../../approvalManager';
import log from '../../logger';

type CodexApprovalDecision = ApprovalResponse['decision'];

export interface CodexApprovalPayload {
  id?: string;
  requestId?: string;
  kind?: string;
  toolName?: string;
  command?: string;
  path?: string;
  filePath?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CodexApprovalClient {
  respondToApproval: (
    requestId: string,
    response: { decision: CodexApprovalDecision; reason?: string },
  ) => Promise<void>;
}

export interface CodexApprovalStatusEvent {
  level: 'info' | 'warning' | 'error';
  message: string;
  requestId: string;
}

interface CodexApprovalBridgeOptions {
  sessionId: string;
  threadId?: string;
  client: CodexApprovalClient;
  now?: () => number;
  timeoutMs?: number;
  onStatus?: (event: CodexApprovalStatusEvent) => void;
}

interface InflightApproval {
  skipClientResponse: boolean;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function resolveRequestId(payload: CodexApprovalPayload): string {
  const requestId = payload.requestId ?? payload.id;
  if (typeof requestId === 'number') {
    return String(requestId);
  }
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw new Error('Codex approval payload is missing requestId');
  }
  return requestId;
}

function resolveToolName(payload: CodexApprovalPayload): string {
  if (typeof payload.toolName === 'string' && payload.toolName.trim().length > 0) {
    return payload.toolName.trim();
  }
  if (typeof payload.kind === 'string' && payload.kind.trim().length > 0) {
    return payload.kind.trim();
  }
  if (typeof payload.command === 'string' && payload.command.trim().length > 0) {
    return 'Bash';
  }
  if (typeof payload.filePath === 'string' || typeof payload.path === 'string') {
    return 'Write';
  }
  return 'Codex Tool';
}

function buildToolInput(payload: CodexApprovalPayload): Record<string, unknown> {
  if (payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)) {
    return { ...payload.input };
  }
  const input: Record<string, unknown> = {};
  if (typeof payload.command === 'string') input.command = payload.command;
  if (typeof payload.filePath === 'string') input.file_path = payload.filePath;
  if (typeof payload.path === 'string' && typeof input.file_path !== 'string') input.path = payload.path;
  if (Object.keys(input).length > 0) return input;
  return { payload };
}

export function normalizeCodexApprovalRequest(
  payload: CodexApprovalPayload,
  args: { now?: () => number; sessionId: string },
): ApprovalRequest {
  return {
    requestId: resolveRequestId(payload),
    toolName: resolveToolName(payload),
    toolInput: buildToolInput(payload),
    sessionId: args.sessionId,
    timestamp: (args.now ?? Date.now)(),
    provider: 'codex',
    rawPayload: payload,
  };
}

export class CodexApprovalBridge {
  private readonly client: CodexApprovalClient;
  private readonly inflight = new Map<string, InflightApproval>();
  private readonly now: () => number;
  private readonly onStatus?: (event: CodexApprovalStatusEvent) => void;
  private readonly sessionId: string;
  private readonly timeoutMs: number;

  constructor(options: CodexApprovalBridgeOptions) {
    this.client = options.client;
    this.now = options.now ?? Date.now;
    this.onStatus = options.onStatus;
    this.sessionId = options.sessionId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getPendingRequestIds(): string[] {
    return Array.from(this.inflight.keys());
  }

  async queueApproval(payload: CodexApprovalPayload): Promise<CodexApprovalDecision> {
    const request = normalizeCodexApprovalRequest(payload, {
      now: this.now,
      sessionId: this.sessionId,
    });
    if (this.inflight.has(request.requestId) || getPendingRequest(request.requestId)) {
      throw new Error(`Duplicate Codex approval request: ${request.requestId}`);
    }

    requestApproval(request);
    this.inflight.set(request.requestId, { skipClientResponse: false });
    this.emitStatus('info', request.requestId, `${request.toolName} is waiting for approval.`);

    try {
      const resolution = await waitForResolution(request.requestId, this.timeoutMs).promise;
      return await this.completeApproval(request.requestId, resolution);
    } catch (error) {
      return await this.handleApprovalTimeout(request.requestId, error);
    } finally {
      this.inflight.delete(request.requestId);
    }
  }

  cancelPendingApproval(requestId: string, reason = 'Codex session ended before approval resolved'): boolean {
    const pending = this.inflight.get(requestId);
    if (!pending) return false;
    pending.skipClientResponse = true;
    const cancelled = cancelApprovalRequest(requestId, reason);
    if (cancelled) this.emitStatus('warning', requestId, reason);
    return cancelled;
  }

  cancelAllPendingApprovals(reason = 'Codex session ended before approval resolved'): void {
    for (const requestId of this.getPendingRequestIds()) {
      this.cancelPendingApproval(requestId, reason);
    }
  }

  private async completeApproval(
    requestId: string,
    resolution: ApprovalResponse,
  ): Promise<CodexApprovalDecision> {
    const pending = this.inflight.get(requestId);
    if (!pending?.skipClientResponse) {
      await this.client.respondToApproval(requestId, { decision: resolution.decision });
    }
    this.emitStatus(
      'info',
      requestId,
      resolution.decision === 'approve'
        ? 'Codex approval accepted.'
        : 'Codex approval denied.',
    );
    return resolution.decision;
  }

  private async handleApprovalTimeout(
    requestId: string,
    error: unknown,
  ): Promise<CodexApprovalDecision> {
    const message =
      error instanceof Error ? error.message : 'Timed out waiting for a Codex approval response.';
    const pending = this.inflight.get(requestId);
    if (!pending) throw error;
    cancelApprovalRequest(requestId, message);
    if (!pending.skipClientResponse) {
      await this.client.respondToApproval(requestId, { decision: 'reject', reason: message });
    }
    this.emitStatus('warning', requestId, message);
    log.warn(`[codex] approval ${requestId} timed out: ${message}`);
    return 'reject';
  }

  private emitStatus(level: CodexApprovalStatusEvent['level'], requestId: string, message: string): void {
    this.onStatus?.({ level, message, requestId });
  }
}
