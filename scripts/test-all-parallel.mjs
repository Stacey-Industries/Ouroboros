#!/usr/bin/env node
/**
 * test-all-parallel.mjs — runs the full vitest suite as 4 shards in parallel.
 *
 * Why this exists: `npm test` runs the whole suite in one vitest process
 * (~280-400s wall clock) which exceeds the default agent timeout (300s) and
 * regularly gets cut short. Sharding splits tests across 4 processes that
 * run concurrently.
 *
 * Each shard is invoked with `vitest run --shard=N/4` and `--max-workers=1`
 * so total fork concurrency stays at ~4 (matching the project's intentional
 * cap on Windows — see the comment in vitest.config.ts about orphan forks).
 *
 * Output is streamed live with `[shardN]` prefixes so failures are still
 * legible. Exit code is the max of all shards (so any failure surfaces).
 *
 * Pretest setup (kill stale vitest processes + sqlite-fresh install) runs
 * ONCE up front, NOT per shard — running it concurrently from 4 forks would
 * race-kill the sibling vitest processes via kill-stale-vitest.mjs.
 */

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

const SHARDS = 4;

function pretest() {
  console.log('[test:all] pretest — kill stale vitest + sqlite-fresh');
  execSync('node scripts/kill-stale-vitest.mjs', { stdio: 'inherit' });
  execSync('node scripts/install-sqlite-fresh.mjs', { stdio: 'inherit' });
}

function runShard(shardIndex) {
  return new Promise((resolve) => {
    const tag = `[shard${shardIndex}/${SHARDS}]`;
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vitest', 'run', `--shard=${shardIndex}/${SHARDS}`, '--max-workers=1'],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    );

    function prefix(stream, data) {
      const text = data.toString();
      for (const line of text.split('\n')) {
        if (line.length > 0) stream.write(`${tag} ${line}\n`);
      }
    }

    child.stdout.on('data', (d) => prefix(process.stdout, d));
    child.stderr.on('data', (d) => prefix(process.stderr, d));
    child.on('exit', (code) => {
      console.log(`${tag} exited with code ${code}`);
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const t0 = Date.now();
  pretest();
  console.log(`[test:all] starting ${SHARDS} shards in parallel`);

  const shardPromises = [];
  for (let i = 1; i <= SHARDS; i++) {
    shardPromises.push(runShard(i));
  }
  const codes = await Promise.all(shardPromises);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const max = Math.max(...codes);
  console.log(`[test:all] done in ${elapsed}s — exit codes: ${codes.join(', ')} → final ${max}`);
  process.exit(max);
}

main().catch((err) => {
  console.error('[test:all] fatal:', err);
  process.exit(1);
});
