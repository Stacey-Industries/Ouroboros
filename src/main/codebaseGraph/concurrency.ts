/**
 * concurrency.ts — Bounded-parallelism helper for indexer I/O.
 *
 * Wraps `p-limit` to cap the number of in-flight async operations, keeping
 * the libuv thread pool and OS file-descriptor budget within safe bounds
 * during full-project indexing. Results preserve input order regardless of
 * completion order.
 */

import os from 'os'
import pLimit from 'p-limit'

/**
 * Default concurrency for file I/O in the indexer. Clamped to [4, 16]:
 *   - Lower bound keeps small machines responsive.
 *   - Upper bound stays well below Windows' default per-process FD budget,
 *     even when other subsystems (log writer, watchers, PTY) hold handles.
 */
export const defaultConcurrency: number = Math.max(4, Math.min(16, os.cpus().length * 2))

/**
 * Run `fn` over `items` with at most `limit` operations in flight at once.
 * Preserves input order in the returned array.
 */
export function mapConcurrent<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = defaultConcurrency,
): Promise<R[]> {
  if (items.length === 0) return Promise.resolve([])
  const gate = pLimit(Math.max(1, limit))
  return Promise.all(items.map((item, index) => gate(() => fn(item, index))))
}
