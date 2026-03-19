/**
 * web/index.ts — Barrel export for the web remote access module.
 */

export { broadcast } from './broadcast'
export type { IpcHandler } from './handlerRegistry'
export { ipcHandlerRegistry, registerHandler } from './handlerRegistry'
export { ptyBatcher } from './ptyBatcher'
export { getOrCreateWebToken, validateToken } from './webAuth'
export type { WebServerOptions } from './webServer'
export { broadcastToWebClients, getWebClientCount,startWebServer, stopWebServer } from './webServer'
export { handleJsonRpcMessage } from './webSocketBridge'
