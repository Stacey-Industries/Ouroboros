/**
 * webPreloadTransport.ts — WebSocket JSON-RPC transport for web mode.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: number
}

interface JsonRpcResponse {
  id?: number
  error?: { message?: string }
  result?: unknown
  method?: string
  params?: { channel: string; payload: unknown }
}

type EventCallback = (...args: unknown[]) => void

// ─── Binary Deserialization ──────────────────────────────────────────────────

interface BinaryEnvelope {
  __binary: boolean
  data: string
}

function isBinaryEnvelope(value: unknown): value is BinaryEnvelope {
  return typeof value === 'object' && value !== null && (value as BinaryEnvelope).__binary === true
}

function deserializeResult(result: unknown): unknown {
  if (isBinaryEnvelope(result)) {
    const binaryStr = atob(result.data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes
  }
  return result
}

// ─── Connection Overlay ──────────────────────────────────────────────────────

export function showConnectionOverlay(message: string): void {
  let overlay = document.getElementById('ws-connection-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'ws-connection-overlay'
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #f59e0b; color: #000; text-align: center;
      padding: 4px; font-size: 12px; z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
    `
    document.body?.prepend(overlay)
  }
  overlay.textContent = message
}

function hideConnectionOverlay(): void {
  document.getElementById('ws-connection-overlay')?.remove()
}

// ─── Transport Class ─────────────────────────────────────────────────────────

export class WebSocketTransport {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private reconnectAttempts = 0
  private maxReconnectDelay = 30000
  private connected = false
  private connectPromise: Promise<void> | null = null
  private ticketFetcher: (() => Promise<string>) | null = null

  constructor(
    private url: string,
    private authToken?: string
  ) {}

  /**
   * Registers a callback that fetches a fresh WS ticket on each (re)connect.
   * Called by webPreload.ts so reconnects also use ticket auth.
   */
  setTicketFetcher(fetcher: () => Promise<string>): void {
    this.ticketFetcher = fetcher
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect()
    return this.connectPromise
  }

  /**
   * Fetches a new WS ticket and opens the connection with it.
   * Used by webPreload.ts for the initial connect after ticket exchange.
   */
  connectWithTicket(ticket: string): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect(ticket)
    return this.connectPromise
  }

  private doConnect(ticket?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const param = ticket ? `?ticket=${ticket}` : this.authToken ? `?token=${this.authToken}` : ''
        const wsUrl = `${this.url}${param}`
        this.ws = new WebSocket(wsUrl)
        this.ws.onopen = () => this.handleOpen(resolve)
        this.ws.onmessage = (event) => this.handleMessage(event.data as string)
        this.ws.onclose = () => this.handleClose()
        this.ws.onerror = () => this.handleError(reject)
      } catch (err) {
        this.connectPromise = null
        reject(err)
      }
    })
  }

  private handleOpen(resolve: () => void): void {
    this.connected = true
    this.reconnectAttempts = 0
    this.connectPromise = null
    hideConnectionOverlay()
    resolve()
  }

  private handleClose(): void {
    this.connected = false
    this.connectPromise = null
    showConnectionOverlay('Disconnected — reconnecting...')
    this.rejectAllPending()
    this.scheduleReconnect()
  }

  private handleError(reject: (err: Error) => void): void {
    this.connectPromise = null
    if (!this.connected) reject(new Error('WebSocket connection failed'))
  }

  private rejectAllPending(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('WebSocket connection closed'))
      this.pendingRequests.delete(id)
    }
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }
    const id = ++this.requestId
    return new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`IPC timeout: ${channel}`))
        }
      }, 30000)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method: channel, params: args }))
    })
  }

  on(channel: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set())
    }
    this.eventListeners.get(channel)!.add(callback)
    return () => { this.eventListeners.get(channel)?.delete(callback) }
  }

  private handleMessage(data: string): void {
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(data) as JsonRpcResponse
    } catch {
      console.warn('[webPreload] Failed to parse WS message:', data)
      return
    }
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      this.resolveRequest(msg)
      return
    }
    if (msg.method === 'event' && msg.params) {
      this.dispatchEvent(msg.params.channel, msg.params.payload)
    }
  }

  private resolveRequest(msg: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(msg.id!)!
    this.pendingRequests.delete(msg.id!)
    clearTimeout(pending.timer)
    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'Unknown RPC error'))
    } else {
      pending.resolve(deserializeResult(msg.result))
    }
  }

  private dispatchEvent(channel: string, payload: unknown): void {
    const listeners = this.eventListeners.get(channel)
    if (!listeners) return
    for (const cb of listeners) {
      try {
        cb(payload)
      } catch (err) {
        console.error(`[webPreload] Event handler error on ${channel}:`, err)
      }
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay)
    this.reconnectAttempts++
    setTimeout(() => {
      if (this.ticketFetcher) {
        this.ticketFetcher()
          .then((ticket) => this.connectWithTicket(ticket))
          .catch(() => {})
      } else {
        this.connect().catch(() => {})
      }
    }, delay)
  }
}
