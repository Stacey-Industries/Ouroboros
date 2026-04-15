/**
 * indexingWorker.ts — Worker-thread entry point for the System 2 indexing pipeline.
 *
 * Opens its own GraphDatabase connection (WAL allows multiple independent
 * connections to the same file), constructs an IndexingPipeline, and processes
 * indexRepository requests one at a time via parentPort messaging.
 *
 * NOTE: Normally invoked via indexingWorkerClient — not imported directly by
 * main-process code.  The class is still directly usable for tests.
 */

import { parentPort } from 'worker_threads'

import { GraphDatabase } from './graphDatabase'
import { IndexingPipeline } from './indexingPipeline'
import type { IndexingProgress } from './indexingPipelineTypes'
import type {
  IndexingWorkerRequest,
  IndexingWorkerResponse,
  IndexRepositoryRequest,
} from './indexingWorkerTypes'
import { TreeSitterParser } from './treeSitterParser'

// ── Worker-local singletons ───────────────────────────────────────────────────

let db: GraphDatabase | null = null
let parser: TreeSitterParser | null = null
let pipeline: IndexingPipeline | null = null

function getOrInitPipeline(): IndexingPipeline {
  if (pipeline) return pipeline
  db = new GraphDatabase()
  parser = new TreeSitterParser()
  pipeline = new IndexingPipeline(db, parser)
  return pipeline
}

// ── Messaging helpers ─────────────────────────────────────────────────────────

function post(msg: IndexingWorkerResponse): void {
  parentPort?.postMessage(msg)
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleIndexRepository(req: IndexRepositoryRequest): Promise<void> {
  const pl = getOrInitPipeline()

  const onProgress = (progress: IndexingProgress): void => {
    post({ type: 'progress', requestId: req.requestId, progress })
  }

  const result = await pl.index({ ...req.options, onProgress })
  post({ type: 'result', requestId: req.requestId, result })
}

async function handleMessage(msg: IndexingWorkerRequest): Promise<void> {
  try {
    switch (msg.type) {
      case 'indexRepository':
        await handleIndexRepository(msg)
        break
      default: {
        const unknownMsg = msg as IndexingWorkerRequest
        post({
          type: 'error',
          requestId: unknownMsg.requestId,
          message: `Unknown request type: ${String(unknownMsg.type)}`,
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    post({ type: 'error', requestId: msg.requestId, message, stack })
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

parentPort?.on('message', (msg: IndexingWorkerRequest) => {
  void handleMessage(msg)
})
