/**
 * webServer.ts — Express HTTP + WebSocket server for remote web access.
 *
 * Provides an HTTP server that serves static renderer assets and a WebSocket
 * endpoint for JSON-RPC IPC bridging. Web clients connect to ws://host:port/ws
 * and interact with the same IPC handlers that the Electron renderer uses.
 *
 * All routes (except /api/health) require token authentication via cookie,
 * query parameter, or Authorization header.
 */

import type { NextFunction,Request, Response } from 'express'
import express from 'express'
import fs from 'fs'
import type { IncomingMessage } from 'http'
import http from 'http'
import path from 'path'
import { WebSocket,WebSocketServer } from 'ws'

import {
  getLoginPageHtml,
  getOrCreateWebToken,
  isRateLimited,
  recordFailedAttempt,
  validateCredential,
  validateToken,
} from './webAuth'
import { handleJsonRpcMessage } from './webSocketBridge'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebServerOptions {
  /** Port to listen on (default: 7890) */
  port: number
  /** Path to static renderer assets (optional, Phase 2 wires this up) */
  staticDir?: string
}

// ─── State ──────────────────────────────────────────────────────────────────

let httpServer: http.Server | null = null
let wss: WebSocketServer | null = null
const wsClients = new Set<WebSocket>()

// ─── Cookie Parser ──────────────────────────────────────────────────────────

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=')
      return [key, val.join('=')]
    })
  )
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

function extractToken(req: Request): { token: string; fromQuery: boolean } {
  const cookies = parseCookies(req.headers.cookie)
  const cookieToken = cookies['webAccessToken'] || ''
  const queryToken = (req.query.token as string) || ''
  const authHeader = req.headers.authorization || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const token = cookieToken || queryToken || bearerToken
  return { token, fromQuery: Boolean(queryToken) }
}

function handleQueryParamToken(req: Request, res: Response, token: string): void {
  const maxAge = 30 * 24 * 60 * 60
  res.setHeader('Set-Cookie', [
    `webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
    `wsToken=${token}; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
  ])
  const url = new URL(req.originalUrl, `http://${req.headers.host}`)
  url.searchParams.delete('token')
  res.redirect(302, url.pathname + url.search)
}

function handleUnauthorized(req: Request, res: Response, ip: string, token: string): void {
  if (token) recordFailedAttempt(ip)
  if (req.headers.accept?.includes('text/html')) {
    res.status(401).type('html').send(getLoginPageHtml())
  } else {
    res.status(401).json({ error: 'Unauthorized. Provide a valid token.' })
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many failed attempts. Try again later.' })
    return
  }

  const { token, fromQuery } = extractToken(req)
  if (!validateToken(token)) {
    handleUnauthorized(req, res, ip, token)
    return
  }

  if (fromQuery) {
    handleQueryParamToken(req, res, token)
    return
  }

  next()
}

// ─── SPA fallback ───────────────────────────────────────────────────────────

function registerSpaFallback(app: express.Express, staticDir: string): void {
  const indexPath = path.join(staticDir, 'index.html')
  app.get('/{*path}', (_req, res) => {
    const token = getOrCreateWebToken()
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- indexPath is derived from trusted staticDir config
      const html = fs.readFileSync(indexPath, 'utf-8')
      const injected = html.replace('</head>', `<script>window.__WEB_TOKEN__='${token}'</script></head>`)
      res.type('html').send(injected)
    } catch {
      res.sendFile(indexPath)
    }
  })
}

// ─── Server lifecycle ───────────────────────────────────────────────────────

/**
 * Starts the Express HTTP server and WebSocket server.
 * Returns a promise that resolves when the server is listening.
 */
function handleLoginPost(req: Request, res: Response): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  if (isRateLimited(ip)) { res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' }); return }
  const { credential } = req.body as { credential?: string }
  if (!credential || typeof credential !== 'string') { res.status(400).json({ success: false, error: 'Missing credential.' }); return }
  if (!validateCredential(credential)) {
    recordFailedAttempt(ip)
    res.status(401).json({ success: false, error: 'Invalid credentials.' })
    return
  }
  const token = getOrCreateWebToken()
  const maxAge = 30 * 24 * 60 * 60
  res.setHeader('Set-Cookie', [`webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`, `wsToken=${token}; SameSite=Strict; Max-Age=${maxAge}; Path=/`])
  res.json({ success: true })
}

function buildExpressApp(options: WebServerOptions): express.Express {
  const app = express()
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok', clients: wsClients.size, uptime: process.uptime() }) })
  app.use(express.json())
  app.post('/api/login', handleLoginPost)
  app.use(authMiddleware)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    next()
  })
  if (options.staticDir) { app.use(express.static(options.staticDir)); registerSpaFallback(app, options.staticDir) }
  return app
}

function handleWsConnection(ws: WebSocket, req: IncomingMessage): void {
  const url = new URL(req.url || '', 'http://localhost')
  const wsQueryToken = url.searchParams.get('token') || ''
  const cookies = parseCookies(req.headers.cookie)
  const wsCookieToken = cookies['wsToken'] || cookies['webAccessToken'] || ''
  if (!validateToken(wsQueryToken || wsCookieToken)) { ws.close(4001, 'Unauthorized'); return }

  wsClients.add(ws)
  console.log(`[web] WebSocket client connected (total: ${wsClients.size})`)
  ws.on('message', (data: Buffer | string) => { handleJsonRpcMessage(ws, typeof data === 'string' ? data : data.toString('utf-8')) })
  ws.on('close', () => { wsClients.delete(ws); console.log(`[web] WebSocket client disconnected (total: ${wsClients.size})`) })
  ws.on('error', (err: Error) => { console.error('[web] WebSocket client error:', err.message); wsClients.delete(ws) })
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'connected', params: { message: 'Ouroboros WebSocket bridge ready' } }))
}

export function startWebServer(options: WebServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = buildExpressApp(options)
    httpServer = http.createServer(app)

    // WebSocket server attached to the HTTP server, on /ws path
    wss = new WebSocketServer({ server: httpServer, path: '/ws' })

    wss.on('connection', handleWsConnection)

    httpServer.on('error', (err: Error) => {
      console.error('[web] HTTP server error:', err.message)
      reject(err)
    })

    httpServer.listen(options.port, () => {
      console.log(`[web] Server listening on http://localhost:${options.port}`)
      console.log(`[web] WebSocket endpoint: ws://localhost:${options.port}/ws`)
      resolve()
    })
  })
}

/**
 * Gracefully stops the web server and disconnects all WebSocket clients.
 */
export async function stopWebServer(): Promise<void> {
  // Close all WebSocket connections
  for (const client of wsClients) {
    try {
      client.close(1001, 'Server shutting down')
    } catch {
      // Client may already be closed
    }
  }
  wsClients.clear()

  // Close WebSocket server
  if (wss) {
    await new Promise<void>((resolve) => {
      wss!.close(() => resolve())
    })
    wss = null
  }

  // Close HTTP server
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer!.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    httpServer = null
  }

  console.log('[web] Server stopped')
}

/**
 * Broadcasts a JSON-RPC notification to all connected WebSocket clients.
 * Used for event push (hooks events, PTY data, config changes, etc.).
 */
export function broadcastToWebClients(channel: string, payload: unknown): void {
  if (wsClients.size === 0) return

  const message = JSON.stringify({
    jsonrpc: '2.0',
    method: 'event',
    params: { channel, payload },
  })

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message)
      } catch (err) {
        console.error('[web] Failed to send to WebSocket client:', err)
      }
    }
  }
}

/**
 * Returns the number of currently connected WebSocket clients.
 */
export function getWebClientCount(): number {
  return wsClients.size
}
