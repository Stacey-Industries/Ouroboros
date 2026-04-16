#!/usr/bin/env node
// Kills stale `vitest run` processes and orphaned fork workers before a new
// test run. Preserves `test:watch` by only matching one-shot runs (argv has
// a literal `run` token) and fork workers whose parent PID is no longer alive.
//
// Runs as `pretest` and from the post_edit_test.ps1 hook. Fail-open: any
// enumeration or kill error is swallowed and the script exits 0 so a broken
// cleanup never blocks a legitimate test run.

import { execSync } from 'node:child_process'

const WIN = process.platform === 'win32'
const ONE_SHOT_RE = /\bvitest\b[^\n]*\brun\b/i
const WORKER_RE = /tinypool|vite-node|vitest[\\/]dist/i

function enumerate() {
  if (WIN) {
    const json = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    const parsed = json.trim() ? JSON.parse(json) : []
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter(p => p && typeof p.ProcessId === 'number')
      .map(p => ({
        pid: p.ProcessId,
        ppid: typeof p.ParentProcessId === 'number' ? p.ParentProcessId : 0,
        cmd: p.CommandLine || '',
      }))
  }
  const out = execSync('ps -eo pid=,ppid=,command=', { encoding: 'utf8' })
  return out
    .split('\n')
    .map(l => {
      const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
      return m ? { pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] } : null
    })
    .filter(Boolean)
}

function ancestorsOf(procs, pid) {
  const byPid = new Map(procs.map(p => [p.pid, p]))
  const set = new Set()
  let cur = pid
  let guard = 0
  while (cur && !set.has(cur) && guard++ < 64) {
    set.add(cur)
    const rec = byPid.get(cur)
    if (!rec || rec.ppid === cur || rec.ppid === 0) break
    cur = rec.ppid
  }
  return set
}

function killTree(pid) {
  try {
    if (WIN) execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    else process.kill(pid, 'SIGKILL')
  } catch {
    // Process already gone or access denied — nothing to do.
  }
}

function findStale(procs, ancestors) {
  const alive = new Set(procs.map(p => p.pid))
  return procs.filter(p => {
    if (ancestors.has(p.pid)) return false
    if (ONE_SHOT_RE.test(p.cmd)) return true
    if (WORKER_RE.test(p.cmd) && !alive.has(p.ppid)) return true
    return false
  })
}

try {
  const procs = enumerate()
  const ancestors = ancestorsOf(procs, process.pid)
  const stale = findStale(procs, ancestors)
  if (stale.length === 0) {
    process.exit(0)
  }
  process.stderr.write(
    `[kill-stale-vitest] terminating ${stale.length} stale vitest process(es):\n`
  )
  for (const s of stale) {
    const preview = s.cmd.length > 140 ? `${s.cmd.slice(0, 137)}...` : s.cmd
    process.stderr.write(`  PID ${s.pid} (ppid ${s.ppid}): ${preview}\n`)
    killTree(s.pid)
  }
} catch (err) {
  const msg = err && typeof err === 'object' && 'message' in err ? err.message : String(err)
  process.stderr.write(`[kill-stale-vitest] error (fail-open): ${msg}\n`)
}

process.exit(0)
