// @vitest-environment jsdom
/**
 * webPreloadTransport.ticketFetcher.test.ts
 *
 * Wave 33b Phase D — verifies that setTicketFetcher accepts an async fetcher
 * that returns Promise<string | null>, and that scheduleReconnect handles both
 * a resolved string (calls connectWithTicket) and a null result (falls back to
 * connect()).
 *
 * Uses a FakeWebSocket + vi.spyOn approach so we don't need a real WS server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketTransport } from './webPreloadTransport';

// ─── Fake WebSocket ───────────────────────────────────────────────────────────

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  static _lastInstance: FakeWebSocket | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket._lastInstance = this;
  }

  send(data: string): void { this.sent.push(data); }
  triggerOpen(): void { this.onopen?.(new Event('open')); }
  triggerClose(): void { this.onclose?.(new CloseEvent('close')); }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket._lastInstance = null;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocketTransport.setTicketFetcher — async Promise<string | null>', () => {
  it('accepts a fetcher that returns Promise<string> (non-null)', async () => {
    const transport = new WebSocketTransport('ws://localhost/ws');
    const fetcher = vi.fn(async () => 'ticket-abc' as string | null);

    // Should not throw — type accepts Promise<string | null>
    expect(() => transport.setTicketFetcher(fetcher)).not.toThrow();
  });

  it('accepts a fetcher that returns Promise<null>', async () => {
    const transport = new WebSocketTransport('ws://localhost/ws');
    const fetcher = vi.fn(async () => null as string | null);

    expect(() => transport.setTicketFetcher(fetcher)).not.toThrow();
  });

  it('calls connectWithTicket when fetcher resolves a string', async () => {
    const transport = new WebSocketTransport('ws://localhost/ws');
    const fetcher = vi.fn(async () => 'ticket-xyz' as string | null);
    transport.setTicketFetcher(fetcher);

    const connectWithTicketSpy = vi.spyOn(transport as never, 'connectWithTicket');

    // Trigger reconnect by simulating a connect + close cycle
    const connectP = transport.connect();
    FakeWebSocket._lastInstance?.triggerOpen();
    await connectP;

    FakeWebSocket._lastInstance?.triggerClose();

    // scheduleReconnect fires after a delay
    await vi.advanceTimersByTimeAsync(1100);

    expect(fetcher).toHaveBeenCalled();
    expect(connectWithTicketSpy).toHaveBeenCalledWith('ticket-xyz');
  });

  it('falls back to connect() when fetcher resolves null', async () => {
    const transport = new WebSocketTransport('ws://localhost/ws');
    const fetcher = vi.fn(async () => null as string | null);
    transport.setTicketFetcher(fetcher);

    const connectSpy = vi.spyOn(transport as never, 'connect');

    const connectP = transport.connect();
    FakeWebSocket._lastInstance?.triggerOpen();
    await connectP;

    FakeWebSocket._lastInstance?.triggerClose();

    await vi.advanceTimersByTimeAsync(1100);

    expect(fetcher).toHaveBeenCalled();
    // connect() is called when ticket is null
    expect(connectSpy).toHaveBeenCalled();
  });
});
