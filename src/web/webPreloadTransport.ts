/**
 * webPreloadTransport.ts — WebSocket JSON-RPC transport for web mode.
 *
 * Wave 33a Phase E: resumable requests survive disconnect/reconnect.
 *
 * Resumption protocol:
 *  - Server emits { id, meta: { resumeToken } } before the actual result for
 *    paired-read / paired-write channels on mobile connections.
 *  - On receipt of a meta frame the client moves the entry from pendingRequests
 *    to resumableRequests.
 *  - On WS close, pendingRequests are rejected immediately (legacy behaviour).
 *    resumableRequests are kept alive; a 5-min client-side TTL guards against
 *    the server never reconnecting.
 *  - On WS open after reconnect, the client sends a 'resume' frame listing all
 *    resumeTokens before queuing any new requests. The server acks with
 *    { resumed, lost }. Lost tokens are rejected with ECONNLOST.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: number
}

interface ResumableRequest {
  channel: string
  resumeToken: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface JsonRpcResponse {
  id?: number
  error?: { message?: string }
  result?: unknown
  method?: string
  params?: { channel: string; payload: unknown }
  meta?: { resumeToken: string }
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

// ─── Constants ───────────────────────────────────────────────────────────────

/** Client-side TTL for resumable requests while disconnected (matches server default). */
const RESUME_TTL_MS = 5 * 60 * 1000

// ─── Transport Class ─────────────────────────────────────────────────────────

export class WebSocketTransport {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private resumableRequests = new Map<number, ResumableRequest>()
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

  setTicketFetcher(fetcher: () => Promise<string>): void {
    this.ticketFetcher = fetcher
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect()
    return this.connectPromise
  }

  connectWithTicket(ticket: string): Promise<void> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.doConnect(ticket)
    return this.connectPromise
  }

  private doConnect(ticket?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const param = ticket ? `?ticket=${ticket}` : this.authToken ? `?token=${this.authToken}` : ''
        this.ws = new WebSocket(`${this.url}${param}`)
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
    this.sendResumeFrame()
    resolve()
  }

  /** Send resume handshake as the FIRST frame on (re)connect. */
  private sendResumeFrame(): void {
    if (this.resumableRequests.size === 0) return
    const tokens = Array.from(this.resumableRequests.values()).map((r) => r.resumeToken)
    const id = ++this.requestId
    this.ws!.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'resume', params: { tokens } }))
  }

  private handleClose(): void {
    this.connected = false
    this.connectPromise = null
    showConnectionOverlay('Disconnected — reconnecting...')
    this.rejectNonResumable()
    this.startResumableTimers()
    this.scheduleReconnect()
  }

  private handleError(reject: (err: Error) => void): void {
    this.connectPromise = null
    if (!this.connected) reject(new Error('WebSocket connection failed'))
  }

  /** Reject everything in pendingRequests (non-resumable or pre-meta). */
  private rejectNonResumable(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('WebSocket connection closed'))
      this.pendingRequests.delete(id)
    }
  }

  /** Start client-side TTL timers for all resumable requests while offline. */
  private startResumableTimers(): void {
    for (const [id, req] of this.resumableRequests) {
      clearTimeout(req.timer)
      req.timer = setTimeout(() => {
        this.resumableRequests.delete(id)
        req.reject(new Error('ECONNLOST'))
      }, RESUME_TTL_MS)
    }
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }
    const id = ++this.requestId
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`IPC timeout: ${channel}`))
        }
      }, 30000) as unknown as number
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
    if (msg.id !== undefined) {
      this.dispatchResponse(msg)
      return
    }
    if (msg.method === 'event' && msg.params) {
      this.dispatchEvent(msg.params.channel, msg.params.payload)
    }
  }

  private dispatchResponse(msg: JsonRpcResponse): void {
    // Meta frame — promote pending request to resumable
    if (msg.meta?.resumeToken) {
      this.promoteToResumable(msg.id!, msg.meta.resumeToken)
      return
    }
    // Resume handshake ack — { result: { resumed, lost } }
    if (this.isResumeAck(msg)) {
      this.handleResumeAck(msg)
      return
    }
    if (this.resumableRequests.has(msg.id!)) {
      this.resolveResumable(msg)
      return
    }
    if (this.pendingRequests.has(msg.id!)) {
      this.resolveRequest(msg)
    }
  }

  private promoteToResumable(id: number, resumeToken: string): void {
    const pending = this.pendingRequests.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingRequests.delete(id)
    // No timer while online — startResumableTimers() arms it on disconnect.
    const resumable: ResumableRequest = {
      channel: resumeToken,
      resumeToken,
      resolve: pending.resolve,
      reject: pending.reject,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    }
    this.resumableRequests.set(id, resumable)
  }

  private isResumeAck(msg: JsonRpcResponse): boolean {
    const r = msg.result as Record<string, unknown> | undefined
    return (
      r !== undefined &&
      Array.isArray(r['resumed']) &&
      Array.isArray(r['lost'])
    )
  }

  private handleResumeAck(msg: JsonRpcResponse): void {
    const r = msg.result as { resumed: string[]; lost: string[] }
    for (const [id, req] of this.resumableRequests) {
      if (r.lost.includes(req.resumeToken)) {
        clearTimeout(req.timer)
        this.resumableRequests.delete(id)
        req.reject(new Error('ECONNLOST'))
      } else if (r.resumed.includes(req.resumeToken)) {
        // Still waiting — clear the offline TTL, server will deliver result
        clearTimeout(req.timer)
        req.timer = setTimeout(() => {
          this.resumableRequests.delete(id)
          req.reject(new Error('ECONNLOST'))
        }, RESUME_TTL_MS)
      }
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

  private resolveResumable(msg: JsonRpcResponse): void {
    const req = this.resumableRequests.get(msg.id!)!
    this.resumableRequests.delete(msg.id!)
    clearTimeout(req.timer)
    if (msg.error) {
      req.reject(new Error(msg.error.message || 'Unknown RPC error'))
    } else {
      req.resolve(deserializeResult(msg.result))
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
