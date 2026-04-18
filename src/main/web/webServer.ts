/**
 * webServer.ts — Express HTTP + WebSocket server for remote web access.
 *
 * Auth middleware extracted to authMiddleware.ts (Phase D).
 * WS upgrade auth extracted to bridgeAuth.ts (Phase D). Wave 33a Phase D.
 * Pairing route factory in pairingMiddleware.ts (Phase D stub; Phase H wires it).
 */

import express from 'express';
import fs from 'fs';
import type { IncomingMessage } from 'http';
import http from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';

import { getConfigValue } from '../config';
import log from '../logger';
import { registerConnection, unregisterConnection } from '../mobileAccess/bridgeDisconnect';
import { authMiddleware, parseCookies } from './authMiddleware';
import { authenticatePairingHandshake, authenticateUpgrade } from './bridgeAuth';
import type { MobileAccessMeta } from './bridgeCapabilityGate';
import { detachDevice } from './bridgeResume';
import { createPairingRouter } from './pairingMiddleware';
import {
  consumeWsTicket,
  createWsTicket,
  getOrCreateWebToken,
  isRateLimited,
  recordFailedAttempt,
  validateCredential,
  validateToken,
} from './webAuth';
import { handleJsonRpcMessage } from './webSocketBridge';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WebServerOptions {
  port: number;
  staticDir?: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

let httpServer: http.Server | null = null;
let cachedIndexHtml: string | null = null;
let wss: WebSocketServer | null = null;
const wsClients = new Set<WebSocket>();

/** Per-connection mobile metadata; null = legacy desktop path. */
const wsMeta = new Map<WebSocket, MobileAccessMeta | null>();

// ─── SPA fallback ───────────────────────────────────────────────────────────

function registerSpaFallback(app: express.Express, staticDir: string): void {
  const indexPath = path.join(staticDir, 'index.html');
  app.get('/{*path}', (_req, res) => {
    const token = getOrCreateWebToken();
    try {
      if (!cachedIndexHtml) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- indexPath from trusted config
        cachedIndexHtml = fs.readFileSync(indexPath, 'utf-8');
      }
      const injected = cachedIndexHtml.replace(
        '</head>',
        `<script>window.__WEB_TOKEN__='${token}'</script></head>`,
      );
      res.type('html').send(injected);
    } catch {
      res.sendFile(indexPath);
    }
  });
}

// ─── HTTP handlers ───────────────────────────────────────────────────────────

function handleLoginPost(req: express.Request, res: express.Response): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, error: 'Too many attempts. Try again later.' });
    return;
  }
  const { credential } = req.body as { credential?: string };
  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ success: false, error: 'Missing credential.' });
    return;
  }
  if (!validateCredential(credential)) {
    recordFailedAttempt(ip);
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }
  const token = getOrCreateWebToken();
  const maxAge = 30 * 24 * 60 * 60;
  res.setHeader('Set-Cookie', [
    `webAccessToken=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
  ]);
  res.json({ success: true });
}

function handleWsTicketPost(_req: express.Request, res: express.Response): void {
  const { ticket, expiresInMs } = createWsTicket();
  res.json({ ticket, expiresInMs });
}

function buildExpressApp(options: WebServerOptions): express.Express {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', clients: wsClients.size, uptime: process.uptime() });
  });
  app.use(express.json());
  app.post('/api/login', handleLoginPost);
  app.use(authMiddleware);
  app.post('/api/ws-ticket', handleWsTicketPost);
  // Mount pairing router when flag is on (Phase H completes the handler body)
  if (getConfigValue('mobileAccess')?.enabled) {
    app.use(createPairingRouter());
  }
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    registerSpaFallback(app, options.staticDir);
  }
  return app;
}

// ─── WS helpers ──────────────────────────────────────────────────────────────

function sendConnected(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'connected',
      params: { message: 'Ouroboros WebSocket bridge ready' },
    }),
  );
}

function attachWsListeners(ws: WebSocket): void {
  ws.on('message', (data: Buffer | string) => {
    const meta = wsMeta.get(ws) ?? null;
    handleJsonRpcMessage(ws, typeof data === 'string' ? data : data.toString('utf-8'), meta);
  });
  ws.on('close', () => {
    const closingMeta = wsMeta.get(ws);
    if (closingMeta?.deviceId) detachDevice(closingMeta.deviceId);
    unregisterConnection(ws);
    wsMeta.delete(ws);
    wsClients.delete(ws);
    log.info(`WebSocket client disconnected (total: ${wsClients.size})`);
  });
  ws.on('error', (err: Error) => {
    log.error('WebSocket client error:', err.message);
    unregisterConnection(ws);
    wsMeta.delete(ws);
    wsClients.delete(ws);
  });
}

function isPairingScheme(req: IncomingMessage): boolean {
  return (req.headers.authorization ?? '').startsWith('Pairing ');
}

async function handlePairingUpgrade(ws: WebSocket, req: IncomingMessage): Promise<void> {
  // Wait for first message to get the ticket payload
  const raw = await new Promise<string>((resolve, reject) => {
    ws.once('message', (d: Buffer | string) =>
      resolve(typeof d === 'string' ? d : d.toString('utf-8')),
    );
    ws.once('close', () => reject(new Error('closed before pairing message')));
  });

  let msg: { code?: unknown; label?: unknown; fingerprint?: unknown };
  try { msg = JSON.parse(raw) as typeof msg; } catch { msg = {}; }

  const code = typeof msg.code === 'string' ? msg.code : '';
  const label = typeof msg.label === 'string' ? msg.label : 'Unknown Device';
  const fingerprint = typeof msg.fingerprint === 'string' ? msg.fingerprint : '';

  const outcome = await authenticatePairingHandshake({ code, label, fingerprint }, req);
  if (!outcome.ok) {
    ws.close(4001, 'pair-failed');
    return;
  }
  // Send pairing result as first message
  ws.send(JSON.stringify({ event: 'pair:result', payload: outcome.result }));
  wsMeta.set(ws, outcome.meta);
  wsClients.add(ws);
  if (outcome.meta.deviceId) registerConnection(outcome.meta.deviceId, ws);
  attachWsListeners(ws);
  sendConnected(ws);
}

/**
 * Validates legacy ticket / cookie auth when Bearer upgrade returned null.
 * Returns true if auth passed; false if the connection was closed.
 */
function authenticateLegacyWs(ws: WebSocket, req: IncomingMessage): boolean {
  const url = new URL(req.url ?? '', 'http://localhost');
  const ticketParam = url.searchParams.get('ticket') ?? '';
  if (ticketParam) {
    if (!consumeWsTicket(ticketParam)) { ws.close(4001, 'Unauthorized'); return false; }
    return true;
  }
  const cookies = parseCookies(req.headers.cookie);
  const legacyToken = cookies['wsToken'] ?? cookies['webAccessToken'] ?? '';
  if (legacyToken) log.warn('[webServer] WS auth via legacy cookie — migrate to ticket');
  if (!validateToken(legacyToken)) { ws.close(4001, 'Unauthorized'); return false; }
  return true;
}

function acceptWsConnection(ws: WebSocket, meta: MobileAccessMeta | null): void {
  wsMeta.set(ws, meta);
  wsClients.add(ws);
  if (meta?.deviceId) registerConnection(meta.deviceId, ws);
  log.info(`WebSocket client connected (total: ${wsClients.size})`);
  attachWsListeners(ws);
  sendConnected(ws);
}

async function handleWsConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  // ── Pairing scheme: first-connect after QR scan ───────────────────────────
  if (isPairingScheme(req)) {
    await handlePairingUpgrade(ws, req).catch((err: Error) => {
      log.error('[webServer] pairing upgrade error:', err.message);
      ws.close(4001, 'pair-failed');
    });
    return;
  }

  // ── Bearer scheme: device refresh token ──────────────────────────────────
  const meta = await authenticateUpgrade(req);

  // ── Ticket / legacy fallback (null meta = desktop path) ──────────────────
  if (meta === null && !authenticateLegacyWs(ws, req)) return;

  acceptWsConnection(ws, meta);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function startWebServer(options: WebServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = buildExpressApp(options);
    httpServer = http.createServer(app);
    wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    wss.on('connection', (ws, req) => { void handleWsConnection(ws, req); });
    httpServer.on('error', (err: Error) => { log.error('HTTP server error:', err.message); reject(err); });
    httpServer.listen(options.port, () => {
      log.info(`Server listening on http://localhost:${options.port}`);
      log.info(`WebSocket endpoint: ws://localhost:${options.port}/ws`);
      resolve();
    });
  });
}

export async function stopWebServer(): Promise<void> {
  for (const client of wsClients) {
    try { client.close(1001, 'Server shutting down'); } catch { /* already closed */ }
  }
  wsClients.clear();
  wsMeta.clear();
  if (wss) { await new Promise<void>((r) => { wss!.close(() => r()); }); wss = null; }
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer!.close((err) => { if (err) reject(err); else resolve(); });
    });
    httpServer = null;
  }
  log.info('Server stopped');
}

export function broadcastToWebClients(channel: string, payload: unknown): void {
  if (wsClients.size === 0) return;
  const message = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { channel, payload } });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch (err) { log.error('Failed to send to WS client:', err); }
    }
  }
}

export function getWebClientCount(): number { return wsClients.size; }

export function getWebServerPort(): number | null {
  if (!httpServer) return null;
  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') return null;
  return addr.port;
}
