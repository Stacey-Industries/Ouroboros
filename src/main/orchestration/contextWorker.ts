/**
 * contextWorker.ts -- Worker thread for heavy context-building I/O.
 *
 * Runs buildRepoIndexSnapshot + buildContextPacket off the main thread
 * so the Electron event loop stays responsive during periodic 30s refreshes.
 *
 * Receives ContextWorkerRequest messages, sends ContextWorkerResponse messages.
 * GraphController lives on the main thread -- graph summary is attached there.
 */

import { parentPort } from 'worker_threads'

import { buildContextPacket } from './contextPacketBuilder'
import type { ContextWorkerRequest, ContextWorkerResponse } from './contextWorkerTypes'
import { buildRepoIndexSnapshot } from './repoIndexer'
import type { ContextPacket, TaskRequest } from './types'

// -- Helpers ---------------------------------------------------------------

function post(msg: ContextWorkerResponse): void {
  parentPort?.postMessage(msg)
}

// -- Handlers --------------------------------------------------------------

async function handleBuildContext(id: string, roots: string[]): Promise<void> {
  const start = Date.now()
  const snapshot = await buildRepoIndexSnapshot(roots)

  let packet: ContextPacket | undefined
  try {
    const dummyRequest = { workspaceRoots: roots, goal: '', mode: 'chat', provider: 'claude-code' } as TaskRequest
    const result = await buildContextPacket({
      request: dummyRequest,
      repoFacts: snapshot.repoFacts,
      repoSnapshot: snapshot,
    })
    packet = result.packet
  } catch (err) {
    console.warn('[context-worker] buildContextPacket failed:', err instanceof Error ? err.message : err)
  }

  post({
    type: 'contextReady',
    id,
    snapshot,
    packet,
    durationMs: Date.now() - start,
  })
}

// -- Message router --------------------------------------------------------

async function handleMessage(msg: ContextWorkerRequest): Promise<void> {
  try {
    switch (msg.type) {
      case 'buildContext':
        await handleBuildContext(msg.id, msg.roots)
        break
      default:
        post({ type: 'error', id: '', message: 'Unknown request type' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id: msg.id, message })
  }
}

// -- Bootstrap -------------------------------------------------------------

parentPort?.on('message', (msg: ContextWorkerRequest) => {
  void handleMessage(msg)
})

post({ type: 'ready' })
