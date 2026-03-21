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

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'

  // Rate limit check
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many failed attempts. Try again later.' })
    return
  }

  // Extract token from multiple sources
  const cookies = parseCookies(req.headers.cookie)
  const cookieToken = cookies['webAccessToken'] || ''
  const queryToken = (req.query.token as string) || ''
  const authHeader = req.headers.authorization || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  const token = cookieToken || queryToken || bearerToken

  if (token && validateToken(token)) {
    // Valid token from query param — set cookies and redirect to clean URL
    if (queryToken && validateToken(queryToken)) {
      const maxAge = 30 * 24 * 60 * 60 // 30 days in seconds
      // HttpOnly cookie for HTTP request auth
      res.setHeader('Set-Cookie', [
        `webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
        `wsToken=${token}; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
      ])

      // Redirect to the same path without the token query parameter
      const url = new URL(req.originalUrl, `http://${req.headers.host}`)
      url.searchParams.delete('token')
      const cleanPath = url.pathname + url.search
      res.redirect(302, cleanPath)
      return
    }

    // Valid token from cookie or header — proceed
    next()
    return
  }

  // Invalid or missing token
  if (token) {
    recordFailedAttempt(ip)
  }

  // Check if the client accepts HTML (browser vs API client)
  const acceptsHtml = req.headers.accept?.includes('text/html')

  if (acceptsHtml) {
    res.status(401).type('html').send(getLoginPageHtml())
  } else {
    res.status(401).json({ error: 'Unauthorized. Provide a valid token.' })
  }
}

// ─── Server lifecycle ───────────────────────────────────────────────────────

/**
 * Starts the Express HTTP server and WebSocket server.
 * Returns a promise that resolves when the server is listening.
 */
export function startWebServer(options: WebServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express()

    // Health check endpoint (unauthenticated — must be before auth middleware)
    app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        clients: wsClients.size,
        uptime: process.uptime(),
      })
    })

    // Login endpoint (unauthenticated — must be before auth middleware)
    app.use(express.json())
    app.post('/api/login', (req: Request, res: Response) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown'
      if (isRateLimited(ip)) {
        res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' })
        return
      }

      const { credential } = req.body as { credential?: string }
      if (!credential || typeof credential !== 'string') {
        res.status(400).json({ success: false, error: 'Missing credential.' })
        return
      }

      if (!validateCredential(credential)) {
        recordFailedAttempt(ip)
        res.status(401).json({ success: false, error: 'Invalid credentials.' })
        return
      }

      const token = getOrCreateWebToken()
      const maxAge = 30 * 24 * 60 * 60
      res.setHeader('Set-Cookie', [
        `webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
        `wsToken=${token}; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
      ])
      res.json({ success: true })
    })

    // Auth middleware — all routes below require a valid token
    app.use(authMiddleware)

    // Cache-control — prevent stale HTML on mobile browsers
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      next()
    })

    // Serve static renderer files if a directory is provided
    if (options.staticDir) {
      app.use(express.static(options.staticDir))

      // SPA fallback — serve index.html for all unmatched routes
      const pathMod = require('path')
      const indexPath = pathMod.join(options.staticDir, 'index.html')
      app.get('/{*path}', (_req, res) => {
        // Inject the auth token into the page so webPreload can read it for WebSocket auth
        const token = getOrCreateWebToken()
        try {
          const html = fs.readFileSync(indexPath, 'utf-8')
          const injected = html.replace(
            '</head>',
            `<script>window.__WEB_TOKEN__='${token}'</script></head>`
          )
          res.type('html').send(injected)
        } catch {
          res.sendFile(indexPath)
        }
      })
    }

    httpServer = http.createServer(app)

    // WebSocket server attached to the HTTP server, on /ws path
    wss = new WebSocketServer({ server: httpServer, path: '/ws' })

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // Authenticate WebSocket connections via token query parameter or cookie
      const url = new URL(req.url || '', 'http://localhost')
      const wsQueryToken = url.searchParams.get('token') || ''
      const cookies = parseCookies(req.headers.cookie)
      const wsCookieToken = cookies['wsToken'] || cookies['webAccessToken'] || ''
      const wsToken = wsQueryToken || wsCookieToken

      if (!validateToken(wsToken)) {
        ws.close(4001, 'Unauthorized')
        return
      }

      wsClients.add(ws)
      console.log(`[web] WebSocket client connected (total: ${wsClients.size})`)

      ws.on('message', (data: Buffer | string) => {
        const message = typeof data === 'string' ? data : data.toString('utf-8')
        handleJsonRpcMessage(ws, message)
      })

      ws.on('close', () => {
        wsClients.delete(ws)
        console.log(`[web] WebSocket client disconnected (total: ${wsClients.size})`)
      })

      ws.on('error', (err: Error) => {
        console.error('[web] WebSocket client error:', err.message)
        wsClients.delete(ws)
      })

      // Send a welcome notification (JSON-RPC notification, no id)
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'connected',
          params: { message: 'Ouroboros WebSocket bridge ready' },
        })
      )
    })

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
