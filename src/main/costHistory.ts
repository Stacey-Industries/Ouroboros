/**
 * costHistory.ts — Persistent cost history storage.
 *
 * Stores cost entries as a JSON file in the user data directory.
 * Provides load/save/clear operations with a 10,000 entry cap.
 */

import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostEntry {
  date: string            // ISO date string (YYYY-MM-DD)
  sessionId: string
  taskLabel: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCost: number   // pre-computed USD amount
  timestamp: number       // ms timestamp for sorting
}

interface CostHistoryData {
  entries: CostEntry[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000
const FILE_NAME = 'cost-history.json'

function getFilePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

// ─── File operations ────────────────────────────────────────────────────────

export async function loadCostHistory(): Promise<CostHistoryData> {
  try {
    const raw = await fs.readFile(getFilePath(), 'utf-8')
    const data = JSON.parse(raw) as CostHistoryData
    if (Array.isArray(data.entries)) {
      return data
    }
    return { entries: [] }
  } catch {
    // File doesn't exist or is malformed — start fresh
    return { entries: [] }
  }
}

export async function saveCostEntry(entry: CostEntry): Promise<void> {
  const history = await loadCostHistory()

  // Deduplicate by sessionId — don't add if already recorded
  if (history.entries.some((e) => e.sessionId === entry.sessionId)) {
    return
  }

  history.entries.push(entry)

  // Sort by timestamp descending (newest first)
  history.entries.sort((a, b) => b.timestamp - a.timestamp)

  // Trim to MAX_ENTRIES (remove oldest)
  if (history.entries.length > MAX_ENTRIES) {
    history.entries = history.entries.slice(0, MAX_ENTRIES)
  }

  await fs.writeFile(getFilePath(), JSON.stringify(history, null, 2), 'utf-8')
}

export async function getCostHistory(): Promise<CostEntry[]> {
  const history = await loadCostHistory()
  return history.entries
}

export async function clearCostHistory(): Promise<void> {
  await fs.writeFile(getFilePath(), JSON.stringify({ entries: [] }, null, 2), 'utf-8')
}
