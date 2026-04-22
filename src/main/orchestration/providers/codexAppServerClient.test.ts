import { describe, expect, it, vi } from 'vitest';

import { CodexAppServerClient, type CodexAppServerTransport } from './codexAppServerClient';
import type { CodexAppServerIncomingMessage, CodexAppServerOutgoingMessage } from './codexAppServerTypes';

function createFakeTransport(): CodexAppServerTransport & {
  sent: CodexAppServerOutgoingMessage[];
  emitMessage: (message: CodexAppServerIncomingMessage) => void;
  emitClose: (event?: { code: number | null; stderr: string }) => void;
} {
  const messageListeners = new Set<(message: CodexAppServerIncomingMessage) => void>();
  const closeListeners = new Set<(event: { code: number | null; stderr: string }) => void>();
  return {
    sent: [],
    send(message) {
      this.sent.push(message);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => {
        messageListeners.delete(listener);
      };
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    close: vi.fn(),
    emitMessage(message) {
      for (const listener of messageListeners) {
        listener(message);
      }
    },
    emitClose(event = { code: 1, stderr: 'closed' }) {
      for (const listener of closeListeners) {
        listener(event);
      }
    },
  };
}

describe('CodexAppServerClient', () => {
  it('correlates out-of-order responses by id', async () => {
    const transport = createFakeTransport();
    const client = new CodexAppServerClient(transport, { requestTimeoutMs: 1000 });

    const initialize = client.request('initialize', {
      clientInfo: { name: 'ide', version: '1.0.0' },
      capabilities: null,
    });
    const startThread = client.request('thread/start', {
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    });

    transport.emitMessage({
      id: 2,
      result: {
        thread: { id: 'thread-1' },
        model: 'gpt-5.4',
        modelProvider: 'openai',
        cwd: 'C:\\repo',
        instructionSources: [],
        approvalPolicy: 'never',
        approvalsReviewer: 'user',
        sandbox: {},
      },
    });
    transport.emitMessage({
      id: 1,
      result: {
        userAgent: 'codex',
        codexHome: 'C:\\Users\\me\\.codex',
        platformFamily: 'windows',
        platformOs: 'windows',
      },
    });

    await expect(initialize).resolves.toMatchObject({ userAgent: 'codex' });
    await expect(startThread).resolves.toMatchObject({ thread: { id: 'thread-1' } });
  });

  it('dispatches notifications and server requests separately', () => {
    const transport = createFakeTransport();
    const client = new CodexAppServerClient(transport);
    const onNotification = vi.fn();
    const onServerRequest = vi.fn();
    client.onNotification(onNotification);
    client.onServerRequest(onServerRequest);

    transport.emitMessage({ method: 'warning', params: { message: 'careful' } });
    transport.emitMessage({
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 't', turnId: 'u', itemId: 'i' },
    });

    expect(onNotification).toHaveBeenCalledWith({
      method: 'warning',
      params: { message: 'careful' },
    });
    expect(onServerRequest).toHaveBeenCalledWith({
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 't', turnId: 'u', itemId: 'i' },
    });
  });

  it('sends notifications and raw server-request responses', () => {
    const transport = createFakeTransport();
    const client = new CodexAppServerClient(transport);

    client.notify('initialized', {});
    client.respond(9, { decision: 'accept' });

    expect(transport.sent).toEqual([
      { method: 'initialized', params: {} },
      { id: 9, result: { decision: 'accept' } },
    ]);
  });

  it('rejects timed-out requests', async () => {
    const transport = createFakeTransport();
    const client = new CodexAppServerClient(transport, { requestTimeoutMs: 1 });

    await expect(
      client.request('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' }),
    ).rejects.toThrow('timed out');
  });

  it('rejects pending requests when the transport closes', async () => {
    const transport = createFakeTransport();
    const client = new CodexAppServerClient(transport, { requestTimeoutMs: 1000 });

    const request = client.request('turn/interrupt', { threadId: 'thread-1', turnId: 'turn-1' });
    transport.emitClose();

    await expect(request).rejects.toThrow('closed before responding');
  });
});
