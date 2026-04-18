/**
 * promptDiff.ts — Tracks the resolved system prompt across CLI versions.
 *
 * Wave 37 Phase B. Compares the current prompt to the last-seen snapshot
 * stored in config. If the CLI version or prompt hash changed and the diff
 * exceeds the 3-line threshold, returns { changed: true, ... }.
 *
 * NEVER log the prompt text — it may contain sensitive project context.
 */

import { execFile } from 'child_process'
import { createHash } from 'crypto'

import { getConfigValue, setConfigValue } from './config'
import log from './logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptDiffSnapshot {
  cliVersion: string
  capturedAt: number
  promptHash: string
  promptText: string
}

export type PromptDiffResult =
  | { changed: false }
  | {
      changed: true
      previousText: string
      currentText: string
      linesAdded: number
      linesRemoved: number
    }

// ── Threshold ────────────────────────────────────────────────────────────────

const MIN_DIFF_LINES = 3

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function countLineDiff(prev: string, curr: string): { added: number; removed: number } {
  const prevLines = prev.split('\n')
  const currLines = curr.split('\n')
  const prevSet = new Set(prevLines)
  const currSet = new Set(currLines)
  const removed = prevLines.filter((l) => !currSet.has(l)).length
  const added = currLines.filter((l) => !prevSet.has(l)).length
  return { added, removed }
}

function readCliVersion(): Promise<string> {
  return new Promise((resolve) => {
     
    execFile('claude', ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve('unknown')
        return
      }
      resolve(stdout.trim().split('\n')[0] ?? 'unknown')
    })
  })
}

function loadSnapshot(): PromptDiffSnapshot | null {
  const ecosystem = getConfigValue('ecosystem')
  return ecosystem?.lastSeenSnapshot ?? null
}

function saveSnapshot(snapshot: PromptDiffSnapshot): void {
  const current = getConfigValue('ecosystem') ?? {}
  setConfigValue('ecosystem', { ...current, lastSeenSnapshot: snapshot })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compare the given prompt to the last-seen snapshot.
 * Returns { changed: false } on first run (snapshot absent) or no significant diff.
 * Returns { changed: true, ... } when >= 3 lines differ AND the version or hash changed.
 * Always updates the stored snapshot after comparison.
 *
 * NEVER log the prompt text.
 */
export async function checkPromptChanged(
  currentPrompt: string,
): Promise<PromptDiffResult> {
  const [cliVersion, previousSnapshot] = await Promise.all([
    readCliVersion(),
    Promise.resolve(loadSnapshot()),
  ])

  const promptHash = sha256(currentPrompt)
  const nextSnapshot: PromptDiffSnapshot = {
    cliVersion,
    capturedAt: Date.now(),
    promptHash,
    promptText: currentPrompt,
  }

  if (!previousSnapshot) {
    log.info('[promptDiff] first run — storing snapshot without notification')
    saveSnapshot(nextSnapshot)
    return { changed: false }
  }

  const sameVersion = previousSnapshot.cliVersion === cliVersion
  const sameHash = previousSnapshot.promptHash === promptHash

  if (sameVersion && sameHash) {
    return { changed: false }
  }

  const { added, removed } = countLineDiff(previousSnapshot.promptText, currentPrompt)

  saveSnapshot(nextSnapshot)

  if (added + removed < MIN_DIFF_LINES) {
    log.info(`[promptDiff] sub-threshold change (${added}+ ${removed}-) — suppressed`)
    return { changed: false }
  }

  return {
    changed: true,
    previousText: previousSnapshot.promptText,
    currentText: currentPrompt,
    linesAdded: added,
    linesRemoved: removed,
  }
}
